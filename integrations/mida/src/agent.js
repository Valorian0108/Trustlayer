import { isMidaSdkError } from "@mida-context/sdk";
import { zeroAddress } from "viem";
import { monadTestnet } from "viem/chains";
import { BriefError, parseBrief, pickBrief, shortId } from "./brief.js";
import { alreadyDoneLine, decide, noDelegationLine, ownReceiptFor } from "./decide.js";
import { acquireLock, LockHeldError, markJournalReceipted, readJournal, writeJournalEntry } from "./runfiles.js";
import { autoCapMon, ChainError, errorClass, readDelegation, rpcHost, shortAddr } from "./trustlayer.js";

const BRIEF_NAMESPACE = "preferences.communication";
const RECEIPT_NAMESPACE = "projects.current";
const BRIEF_PAGE_BYTES = 16_384;
const RECEIPT_PAGE_BYTES = 65_536;

export class PartialReadError extends Error {
  constructor() {
    super("the record list came back incomplete");
    this.name = "PartialReadError";
  }
}

const PARTIAL_READ_LINE =
  "mida: the record list came back incomplete (the store has not verified its newest rows yet). Nothing was sent. Run again in a minute.";

async function readAll(mida, namespace, limit) {
  const items = [];
  let cursor;
  do {
    const page = await mida.context(cursor ? { namespace, limit, cursor } : { namespace, limit });
    if (page.partial === true) throw new PartialReadError();
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

// Only a service that answered can refuse — the two *-unavailable codes mean
// the daemon never spoke, so the line must say unavailable, not refused.
const UNAVAILABLE_CODES = new Set(["service-unavailable", "transport-unavailable"]);

function midaRefusedLine(error) {
  const what = UNAVAILABLE_CODES.has(error.code) ? "unavailable" : "refused";
  return `mida: ${what} (${error.code}) — ${error.message.replace(/\.$/, "")}. Nothing was sent.`;
}

// Broadcast the signed bytes, then wait for the journaled hash. A send error
// does NOT mean nothing reached the node (viem retries the broadcast after
// its own timeout and on 5xx/429), so the wait runs either way.
async function sendAndAwait({ config, chain, wallet, mida, log, now, delegation, brief, signed, recovery }) {
  if (recovery) {
    log(`journal: a signed transaction for this brief is on record (tx ${signed.hash}); re-sending the same bytes — it cannot pay twice.`);
  }
  let sendError = null;
  try {
    await wallet.sendRawTransaction({ serializedTransaction: signed.raw });
  } catch (error) {
    sendError = error;
  }
  let receipt = null;
  let waitError = null;
  try {
    receipt = await wallet.waitForTransactionReceipt({ hash: signed.hash });
  } catch (error) {
    waitError = error;
  }

  // The wait can die on an RPC error after the transaction already mined, and
  // then the spent nonce belongs to OUR transaction — never another one. So
  // before the nonce is read at all, ask the chain for the journaled hash; and
  // remember if the node could not answer, because then the nonce must not be
  // read as "someone else spent it" — ours may be what spent it.
  let lookupFailed = false;
  if (!receipt) {
    try {
      receipt = await chain.getTransactionReceipt({ hash: signed.hash });
    } catch (error) {
      // viem names a genuinely absent receipt TransactionReceiptNotFoundError;
      // any other failure means the node could not answer at all.
      if (error && error.name === "TransactionReceiptNotFoundError") receipt = null;
      else lookupFailed = true;
    }
  }

  if (!receipt) {
    // If the journaled nonce is already spent on chain by a transaction that
    // is not ours, this transaction can never land — say so and keep the journal.
    try {
      const latest = await chain.getTransactionCount({ address: config.agentAddress, blockTag: "latest" });
      if (BigInt(latest) > BigInt(signed.nonce)) {
        log(
          lookupFailed
            ? `chain: the nonce the journaled transaction used is spent, but the node cannot tell whether tx ${signed.hash} is what spent it — its receipt lookup failed. Whether it landed is unknown; do not delete the journal — running again re-checks.`
            : `chain: the nonce the journaled transaction used was already spent by a different transaction — tx ${signed.hash} can never land. No Mida receipt was written; the journal keeps the record.`
        );
        return { exitCode: 4, outcome: "nonce-spent", txHash: signed.hash };
      }
    } catch {
      // cannot tell — fall through to the unknown-outcome lines
    }
    const retry = "The signed transaction is journaled — running again re-sends the same bytes, which cannot pay twice. Whether it landed is unknown.";
    if (sendError) {
      log(`chain: the send failed (${errorClass(sendError)}) and tx ${signed.hash} could not be confirmed (${errorClass(waitError)}). ${retry}`);
    } else {
      log(
        waitError instanceof Error && waitError.name.includes("Timeout")
          ? `chain: tx ${signed.hash} was not confirmed within 60 s. ${retry}`
          : `chain: tx ${signed.hash} could not be confirmed (${errorClass(waitError)}). ${retry}`
      );
    }
    return { exitCode: 4, outcome: "unconfirmed", txHash: signed.hash };
  }

  if (receipt.transactionHash && receipt.transactionHash.toLowerCase() !== signed.hash.toLowerCase()) {
    log(
      `chain: tx ${signed.hash} was replaced before it mined — the mined transaction is ${receipt.transactionHash}. The journaled nonce is spent by that transaction; running again reports the same. No Mida receipt was written.`
    );
    return { exitCode: 4, outcome: "replaced", txHash: signed.hash };
  }
  if (receipt.status !== "success") {
    log(`chain: tx ${signed.hash} reverted. No Mida receipt was written.`);
    return { exitCode: 4, outcome: "reverted", txHash: signed.hash };
  }
  log(
    recovery
      ? `recovered: the journaled transaction ${signed.hash} is confirmed (block ${receipt.blockNumber.toLocaleString("en-US")}). Writing the receipt now.`
      : `sent: ${brief.amountMon} MON to ${shortAddr(brief.to)} — tx ${signed.hash} (block ${receipt.blockNumber.toLocaleString("en-US")})`
  );

  const content = {
    trustlayerReceipt: 1,
    briefRecordId: brief.id,
    delegation: {
      registry: config.registry,
      chainId: monadTestnet.id,
      id: delegation.id,
      tier: delegation.tier,
      tierName: delegation.tierName,
      autoCapMon: autoCapMon(delegation.tier),
      expiresAt: delegation.expiresAt,
      owner: delegation.owner,
    },
    action: { kind: "transfer", to: brief.to, amountMon: brief.amountMon, amountWei: brief.amountWei.toString(), memo: brief.memo },
    tx: { hash: signed.hash, block: receipt.blockNumber.toString(), status: receipt.status, from: config.agentAddress, chainId: monadTestnet.id },
    at: now().toISOString(),
  };
  let saved;
  try {
    saved = await mida.remember({ namespace: RECEIPT_NAMESPACE, kind: "EPISODE", content });
  } catch (error) {
    if (isMidaSdkError(error)) {
      log(
        `mida: the transfer happened (tx ${signed.hash}) but the receipt write failed (${error.code}) — ${error.message.replace(/\.$/, "")}. The write may still have landed; running again is safe — it re-sends the same signed transaction (which cannot pay twice) and writes only the missing receipt.`
      );
      return { exitCode: 5, outcome: "receipt-write-failed", txHash: signed.hash };
    }
    throw error;
  }
  // Keep the entry and mark it receipted: the record list can silently skip a
  // just-written receipt on the next read, and the journal alone decides
  // whether this brief may ever be signed for again.
  markJournalReceipted(config.projectDir, brief.id, { id: saved.id, at: now().toISOString() });
  log(
    saved.state === "pending"
      ? `recorded: Mida receipt ${shortId(saved.id)} (pending) in projects.current — it anchors with the next batch.`
      : `recorded: Mida receipt ${shortId(saved.id)} (anchored) in projects.current, author ${config.midaAgent}`
  );
  return { exitCode: 0, outcome: recovery ? "recovered" : "sent", txHash: signed.hash, receiptId: saved.id };
}

export async function runAgent({ config, chain, wallet, mida, log, now = () => new Date(), dryRun = false }) {
  let lock;
  try {
    lock = acquireLock(config.projectDir);
  } catch (error) {
    if (error instanceof LockHeldError) {
      log(`mida: another run is in progress (pid ${error.pid}). Nothing was sent.`);
      return { exitCode: 1, outcome: "locked" };
    }
    throw error;
  }
  try {
    let delegation;
    try {
      delegation = await readDelegation(chain, {
        registry: config.registry,
        owner: config.trustlayerOwner,
        agent: config.agentAddress,
        rpcUrl: config.rpcUrl,
      });
    } catch (error) {
      if (error instanceof ChainError) {
        log(error.message);
        return { exitCode: error.exitCode, outcome: "chain-error" };
      }
      throw error;
    }
    if (!delegation.valid) {
      log(noDelegationLine(delegation));
      return { exitCode: 2, outcome: "refused" };
    }
    log(
      `trustlayer: delegation #${delegation.id} from ${shortAddr(delegation.owner)} to ${shortAddr(delegation.agent)} — tier ${delegation.tierLabel}, expires ${delegation.expiresAt ?? "never"}`
    );

    // The delegation check gates every Mida call: a revoked delegation exits
    // above without ever touching the owner's Mida service.
    if (dryRun) {
      let status;
      try {
        status = await mida.status();
      } catch (error) {
        if (isMidaSdkError(error)) {
          log(midaRefusedLine(error));
          return { exitCode: 3, outcome: "refused" };
        }
        throw error;
      }
      if (status) log(status.text);
    }

    let facts;
    try {
      facts = await readAll(mida, BRIEF_NAMESPACE, BRIEF_PAGE_BYTES);
    } catch (error) {
      if (error instanceof PartialReadError) {
        log(PARTIAL_READ_LINE);
        return { exitCode: 3, outcome: "partial-read" };
      }
      if (isMidaSdkError(error)) {
        log(midaRefusedLine(error));
        return { exitCode: 3, outcome: "refused" };
      }
      throw error;
    }
    const picked = pickBrief(facts);
    if (!picked) {
      log(
        `mida: no brief found in preferences.communication. Write one with: mida remember '{"trustlayer":1,"action":"transfer","to":"0x…","amountMon":"0.01"}'. Nothing was sent.`
      );
      return { exitCode: 2, outcome: "refused" };
    }
    let brief;
    try {
      brief = parseBrief(picked);
    } catch (error) {
      if (error instanceof BriefError) {
        log(error.message);
        return { exitCode: 2, outcome: "refused" };
      }
      throw error;
    }
    // The destination must be a plain wallet: not the zero address, not this
    // agent paying itself, and not a contract — the brief promises a transfer,
    // and a contract destination could run code instead.
    const badDestination = (why) => {
      log(`brief ${shortId(brief.id)}: to is invalid (${why}). Nothing was sent.`);
      return { exitCode: 2, outcome: "refused" };
    };
    if (brief.to === zeroAddress) return badDestination("the zero address");
    if (brief.to === config.agentAddress) return badDestination("the agent's own address");
    let destinationCode;
    try {
      destinationCode = await chain.getCode({ address: brief.to });
    } catch (error) {
      log(`chain: could not check the destination over ${rpcHost(config.rpcUrl)} (${errorClass(error)}). Nothing was sent.`);
      return { exitCode: 4, outcome: "chain-error" };
    }
    if (destinationCode && destinationCode !== "0x") {
      return badDestination("a contract — this agent sends plain MON transfers, it never calls code");
    }

    let receipts;
    try {
      receipts = await readAll(mida, RECEIPT_NAMESPACE, RECEIPT_PAGE_BYTES);
    } catch (error) {
      if (error instanceof PartialReadError) {
        log(PARTIAL_READ_LINE);
        return { exitCode: 3, outcome: "partial-read" };
      }
      if (isMidaSdkError(error)) {
        log(midaRefusedLine(error));
        return { exitCode: 3, outcome: "refused" };
      }
      throw error;
    }
    // Printed only once both namespace reads succeeded — "approved" before a
    // read that then refuses would make the transcript contradict itself.
    log(
      `mida: ${config.midaAgent} approved; brief ${shortId(brief.id)} (${brief.author?.name ?? "owner"}, ${brief.assertedAt ?? "unknown time"}): transfer ${brief.amountMon} MON to ${shortAddr(brief.to)}`
    );

    // A receipt this agent wrote for this brief settles it — whatever an old
    // journal entry says, the payment and the record both exist.
    const journal = readJournal(config.projectDir);
    const existing = ownReceiptFor(receipts, brief.id, config.midaAgent);
    if (existing) {
      // if a journaled entry survived, mark it with the receipt rather than
      // trusting the next read-back to see it again — a dry run writes nothing
      if (!dryRun && journal[brief.id]) {
        markJournalReceipted(config.projectDir, brief.id, { id: existing.id, at: now().toISOString() });
      }
      log(alreadyDoneLine(existing, brief.id));
      return { exitCode: 0, outcome: "already-done" };
    }

    // A journaled transaction for this brief means an earlier run already
    // decided to send and signed. A receipted entry ends it; an open entry's
    // only safe move is to re-broadcast those exact bytes — the nonce inside
    // them means the chain sees one transaction.
    const journaled = journal[brief.id];
    if (journaled) {
      if (journaled.receipted) {
        log(
          `already done (journal): this brief's transfer was already sent and its receipt recorded (tx ${journaled.hash}, receipt ${shortId(journaled.receipted.id)}). Nothing was sent.`
        );
        return { exitCode: 0, outcome: "already-done" };
      }
      if (dryRun) {
        log(`journal: a signed transaction for this brief is on record (tx ${journaled.hash}); a real run re-sends those same bytes and writes the missing receipt.`);
        log("dry run: nothing sent, nothing written.");
        return { exitCode: 0, outcome: "dry-run" };
      }
      return await sendAndAwait({ config, chain, wallet, mida, log, now, delegation, brief, signed: journaled, recovery: true });
    }

    let balanceWei;
    let gasPriceWei;
    try {
      balanceWei = await chain.getBalance({ address: config.agentAddress });
      gasPriceWei = await chain.getGasPrice();
    } catch (error) {
      log(`chain: could not read the wallet state over ${rpcHost(config.rpcUrl)} (${errorClass(error)}). Nothing was sent.`);
      return { exitCode: 4, outcome: "chain-error" };
    }

    const decision = decide({ delegation, brief, receipts, balanceWei, gasPriceWei, agentName: config.midaAgent });
    log(decision.line);
    if (decision.kind === "refuse") return { exitCode: 2, outcome: "refused" };
    if (decision.kind === "already-done") return { exitCode: 0, outcome: "already-done" };
    if (dryRun) {
      log("dry run: nothing sent, nothing written.");
      return { exitCode: 0, outcome: "dry-run" };
    }

    // Sign first, journal second, broadcast last — so any outcome after this
    // point can be recovered by re-sending the identical bytes.
    let nonce;
    let prepared;
    try {
      nonce = await chain.getTransactionCount({ address: config.agentAddress, blockTag: "pending" });
      prepared = await wallet.signTransfer({ to: brief.to, value: brief.amountWei, nonce, gas: 21000n, gasPrice: gasPriceWei });
    } catch (error) {
      log(`chain: could not prepare the transaction over ${rpcHost(config.rpcUrl)} (${errorClass(error)}). Nothing was sent.`);
      return { exitCode: 4, outcome: "chain-error" };
    }
    writeJournalEntry(config.projectDir, brief.id, { hash: prepared.hash, raw: prepared.raw, nonce: Number(nonce) });
    return await sendAndAwait({ config, chain, wallet, mida, log, now, delegation, brief, signed: { ...prepared, nonce: Number(nonce) }, recovery: false });
  } finally {
    lock.release();
  }
}
