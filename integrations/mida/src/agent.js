import { setTimeout as sleep } from "node:timers/promises";
import { isMidaSdkError } from "@mida-context/sdk";
import { formatEther, formatGwei, keccak256, parseTransaction, recoverTransactionAddress, zeroAddress } from "viem";
import { monadTestnet } from "viem/chains";
import { BriefError, parseBrief, pickBrief, shortId } from "./brief.js";
import { alreadyDoneLine, decide, noDelegationLine, ownReceiptFor } from "./decide.js";
import { acquireLock, JOURNAL_FILE, LOCK_FILE, LockHeldError, markJournalDead, markJournalReceipted, readJournal, writeJournalEntry } from "./runfiles.js";
import { autoCapMon, ChainError, errorClass, readDelegation, rpcHost, shortAddr } from "./trustlayer.js";

const BRIEF_NAMESPACE = "preferences.communication";
const RECEIPT_NAMESPACE = "projects.current";
const BRIEF_PAGE_BYTES = 16_384;
const RECEIPT_PAGE_BYTES = 65_536;
// Monad's block time is ~0.4 s: a spent nonce with a definite "no receipt" gets
// one more look after a few blocks before the entry may be called dead, and a
// re-broadcast gets a bounded wait before the entry is checked again.
const SPENT_NONCE_SETTLE_MS = 2_000;
const RESOLVE_WAIT_MS = 10_000;

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

function receiptContent({ config, delegation, brief, hash, receipt, now }) {
  return {
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
    action: { kind: "transfer", to: brief.to, amountMon: brief.amountMon, amountWei: String(brief.amountWei), memo: brief.memo },
    tx: { hash, block: receipt.blockNumber.toString(), status: receipt.status, from: config.agentAddress, chainId: monadTestnet.id },
    at: now().toISOString(),
  };
}

// The fee cap the signed bytes carry — EIP-1559 maxFeePerGas, or a legacy
// gasPrice for bytes signed before this version existed. Undecodable bytes
// mean no reliable answer.
function journaledFeeCap(signed) {
  try {
    const tx = parseTransaction(signed.raw);
    return tx.maxFeePerGas ?? tx.gasPrice ?? null;
  } catch {
    return null;
  }
}

// The journal holds the only record of what was signed, so before re-sending
// any journaled bytes prove they are what the entry claims: they decode, hash
// to the recorded hash, recover this agent's signature, and carry the recorded
// nonce plus the brief's destination and amount. A hand-edit that fails any of
// those is refused — never re-sent, never receipted.
async function verifyJournalEntry({ entry, brief, agentAddress }) {
  let decoded;
  try {
    decoded = parseTransaction(entry.raw);
  } catch {
    return { ok: false, why: "the stored bytes do not decode as a signed transaction" };
  }
  if (!entry.hash || keccak256(entry.raw).toLowerCase() !== entry.hash.toLowerCase()) {
    return { ok: false, why: "the stored bytes do not hash to the recorded transaction hash" };
  }
  let from;
  try {
    from = await recoverTransactionAddress({ serializedTransaction: entry.raw });
  } catch {
    return { ok: false, why: "the signature does not recover a sender" };
  }
  if (from.toLowerCase() !== agentAddress.toLowerCase()) {
    return { ok: false, why: "it was signed by a different address" };
  }
  if (decoded.nonce == null || BigInt(decoded.nonce) !== BigInt(entry.nonce)) {
    return { ok: false, why: `its nonce is ${decoded.nonce}, not the recorded ${entry.nonce}` };
  }
  // the brief is the source of truth when this is the run's own brief; the
  // entry's stored fields cover briefs whose record is no longer on Mida
  const expectedTo = brief?.to ?? entry.to;
  const expectedValue = brief ? brief.amountWei : entry.value != null ? BigInt(entry.value) : undefined;
  if (expectedTo && decoded.to?.toLowerCase() !== expectedTo.toLowerCase()) {
    return { ok: false, why: `it pays ${decoded.to}, not ${expectedTo}` };
  }
  if (expectedValue != null && (decoded.value ?? 0n) !== expectedValue) {
    return { ok: false, why: `it carries ${formatEther(decoded.value ?? 0n)} MON, not ${formatEther(expectedValue)} MON` };
  }
  return { ok: true, decoded };
}

function deadReasonText(dead) {
  if (dead.reason === "nonce-spent") return "its nonce was spent by a different transaction";
  if (dead.reason === "reverted") return "it reverted on-chain";
  if (dead.reason === "replaced") return `it was replaced by ${dead.detail ?? "a different transaction"}`;
  return dead.reason ?? "an unknown reason";
}

// Broadcast the signed bytes, then wait for the journaled hash. A send error
// does NOT mean nothing reached the node (viem retries the broadcast after
// its own timeout and on 5xx/429), so the wait runs either way.
async function sendAndAwait({ config, chain, wallet, mida, log, now, journal, delegation, brief, signed, recovery, progress }) {
  if (recovery) {
    log(`journal: a signed transaction for this brief is on record (tx ${signed.hash}); re-sending the same bytes — it cannot pay twice.`);
  }
  let sendError = null;
  try {
    await wallet.sendRawTransaction({ serializedTransaction: signed.raw });
  } catch (error) {
    sendError = error;
  }
  // the bytes may have reached the node even when the answer did not come
  // back, so the broadcast counts as attempted either way
  progress.state = "broadcast";
  let receipt = null;
  let waitError = null;
  try {
    receipt = await wallet.waitForTransactionReceipt({ hash: signed.hash });
  } catch (error) {
    waitError = error;
  }

  // The wait can die on an RPC error after the transaction already mined, and
  // then the spent nonce belongs to OUR transaction — never another one. So
  // the nonce is read FIRST and our receipt second: asked the other way around,
  // a transaction mining between the two answers pairs "no receipt" with
  // "nonce spent" — the shape of a replaced transaction — and our own mined
  // send would be recorded dead. A definite "no receipt" paired with a spent
  // nonce can still be a receipt about to appear, so it gets one more look
  // after a couple of seconds before the entry may be called dead; and if the
  // node cannot answer at all, the nonce must not be read as "someone else
  // spent it" — ours may be what spent it.
  let nonceSpent = null; // null when the node could not answer
  let lookupFailed = false;
  const lookupReceipt = async () => {
    try {
      receipt = await chain.getTransactionReceipt({ hash: signed.hash });
      lookupFailed = false;
    } catch (error) {
      // viem names a genuinely absent receipt TransactionReceiptNotFoundError;
      // any other failure means the node could not answer at all.
      receipt = null;
      lookupFailed = !(error && error.name === "TransactionReceiptNotFoundError");
    }
  };
  if (!receipt) {
    try {
      const latest = await chain.getTransactionCount({ address: config.agentAddress, blockTag: "latest" });
      nonceSpent = BigInt(latest) > BigInt(signed.nonce);
    } catch {
      // the node cannot say — the receipt answer still counts
    }
    await lookupReceipt();
    if (!receipt && nonceSpent === true && !lookupFailed) {
      await sleep(SPENT_NONCE_SETTLE_MS);
      await lookupReceipt();
    }
  }

  if (!receipt) {
    // If the journaled nonce is already spent on chain by a transaction that
    // is not ours, this transaction can never land — say so and keep the journal.
    if (nonceSpent === true) {
      if (!lookupFailed) {
        markJournalDead(config.projectDir, journal, brief.id, { reason: "nonce-spent", at: now().toISOString() });
      }
      log(
        lookupFailed
          ? `chain: the nonce the journaled transaction used is spent, but the node cannot tell whether tx ${signed.hash} is what spent it — its receipt lookup failed. Whether it landed is unknown; do not delete the journal — running again re-checks.`
          : `chain: the nonce the journaled transaction used was already spent by a different transaction — tx ${signed.hash} can never land. No Mida receipt was written; the journal keeps the record, marked dead.`
      );
      return { exitCode: 4, outcome: "nonce-spent", txHash: signed.hash };
    }
    // A journaled fee cap under the current base fee means the bytes cannot
    // mine while that holds — say exactly that, not "unknown": they can still
    // land if the base fee falls, and this agent never signs a fee-bumped
    // replacement.
    try {
      const cap = journaledFeeCap(signed);
      const baseFee = (await chain.getBlock())?.baseFeePerGas;
      if (cap != null && baseFee != null && baseFee > cap) {
        log(
          `chain: tx ${signed.hash} cannot mine right now — the current base fee (${formatGwei(baseFee)} gwei) is above the max fee it was signed with (${formatGwei(cap)} gwei). The signed bytes stay journaled and can still land if the base fee falls; running again re-checks.`
        );
        return { exitCode: 4, outcome: "fee-too-low", txHash: signed.hash };
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

  // a receipt exists — whatever happens next, the transaction has landed
  progress.state = "mined";
  if (receipt.transactionHash && receipt.transactionHash.toLowerCase() !== signed.hash.toLowerCase()) {
    markJournalDead(config.projectDir, journal, brief.id, { reason: "replaced", detail: receipt.transactionHash, at: now().toISOString() });
    log(
      `chain: tx ${signed.hash} was replaced before it mined — the mined transaction is ${receipt.transactionHash}. The journaled nonce is spent by that transaction; running again reports the same. No Mida receipt was written.`
    );
    return { exitCode: 4, outcome: "replaced", txHash: signed.hash };
  }
  if (receipt.status !== "success") {
    markJournalDead(config.projectDir, journal, brief.id, { reason: "reverted", at: now().toISOString() });
    log(`chain: tx ${signed.hash} reverted. No Mida receipt was written.`);
    return { exitCode: 4, outcome: "reverted", txHash: signed.hash };
  }
  log(
    recovery
      ? `recovered: the journaled transaction ${signed.hash} is confirmed (block ${receipt.blockNumber.toLocaleString("en-US")}). Writing the receipt now.`
      : `sent: ${brief.amountMon} MON to ${shortAddr(brief.to)} — tx ${signed.hash} (block ${receipt.blockNumber.toLocaleString("en-US")})`
  );

  // a recovered entry records the delegation it was signed under — the owner
  // may have re-delegated under a new id between runs
  const content = receiptContent({ config, delegation: { ...delegation, id: signed.delegationId ?? delegation.id }, brief, hash: signed.hash, receipt, now });
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
  markJournalReceipted(config.projectDir, journal, brief.id, { id: saved.id, at: now().toISOString() });
  log(
    saved.state === "pending"
      ? `recorded: Mida receipt ${shortId(saved.id)} (pending) in projects.current — it anchors with the next batch.`
      : `recorded: Mida receipt ${shortId(saved.id)} (anchored) in projects.current, author ${config.midaAgent}`
  );
  return { exitCode: 0, outcome: recovery ? "recovered" : "sent", txHash: signed.hash, receiptId: saved.id };
}

// Resolve one open journal entry — an older signed transaction that blocks all
// new signing — without ever signing anything new. Confirmed on-chain → write
// that brief's missing receipt; nonce provably spent by another transaction →
// mark the entry dead (kept, with the reason); anything else → re-broadcast the
// same bytes once and report "unresolved" so the caller signs nothing new.
async function resolveJournalEntry({ config, chain, wallet, mida, log, now, journal, delegation, entryId, entry, progress }) {
  const check = await verifyJournalEntry({ entry, agentAddress: config.agentAddress });
  if (!check.ok) {
    log(
      `journal: the stored transaction for brief ${shortId(entryId)} is not what was signed (${check.why}). Refusing to re-send it and signing nothing new — check ${JOURNAL_FILE} by hand; never delete it while a payment may be pending.`
    );
    return "invalid";
  }
  const decoded = check.decoded;
  // A receipt for the journaled hash settles the entry: success writes the
  // missing receipt; anything else can never pay and the entry is kept, dead.
  const settle = async (receipt) => {
    progress.state = "mined"; // a receipt exists — the transaction has landed
    if (receipt.status === "success") {
      // the transaction landed; the missing piece is this brief's receipt
      log(
        `journal: the journaled transaction for brief ${shortId(entryId)} is confirmed (tx ${entry.hash}, block ${receipt.blockNumber.toLocaleString("en-US")}). Writing the missing receipt now.`
      );
      const recoveredBrief = {
        id: entryId,
        to: decoded.to,
        amountMon: formatEther(decoded.value ?? 0n),
        amountWei: decoded.value ?? 0n,
        memo: entry.memo,
      };
      const content = receiptContent({ config, delegation: { ...delegation, id: entry.delegationId ?? delegation.id }, brief: recoveredBrief, hash: entry.hash, receipt, now });
      try {
        const saved = await mida.remember({ namespace: RECEIPT_NAMESPACE, kind: "EPISODE", content });
        markJournalReceipted(config.projectDir, journal, entryId, { id: saved.id, at: now().toISOString() });
        log(`recorded: Mida receipt ${shortId(saved.id)} for brief ${shortId(entryId)} — the journaled entry is marked receipted.`);
        return "receipted";
      } catch (error) {
        if (isMidaSdkError(error)) {
          log(
            `mida: the journaled transfer for brief ${shortId(entryId)} happened (tx ${entry.hash}) but the receipt write failed (${error.code}) — ${error.message.replace(/\.$/, "")}. The entry stays open; running again retries the write.`
          );
          return "receipt-write-failed";
        }
        throw error;
      }
    }
    markJournalDead(config.projectDir, journal, entryId, { reason: "reverted", at: now().toISOString() });
    log(`journal: the journaled transaction for brief ${shortId(entryId)} reverted on-chain (tx ${entry.hash}) — it can never pay. The entry is kept, marked dead.`);
    return "dead";
  };
  for (let pass = 0; pass < 2; pass += 1) {
    // The nonce read comes first, for the same reason as in sendAndAwait:
    // answered the other way around, a block landing between the two answers
    // reads as "a different transaction spent the nonce" and buries our own
    // mined send.
    let nonceSpent = null;
    try {
      const latest = await chain.getTransactionCount({ address: config.agentAddress, blockTag: "latest" });
      nonceSpent = BigInt(latest) > BigInt(entry.nonce);
    } catch {
      // the node cannot say — treat as unresolved rather than guessing
    }
    let receipt = null;
    let lookupFailed = false;
    const lookup = async () => {
      try {
        receipt = await chain.getTransactionReceipt({ hash: entry.hash });
        lookupFailed = false;
      } catch (error) {
        receipt = null;
        lookupFailed = !(error && error.name === "TransactionReceiptNotFoundError");
      }
    };
    await lookup();
    // a spent nonce with a definite "no receipt" may be a block still landing;
    // one more look after a couple of seconds before it may be called dead
    if (!receipt && nonceSpent === true && !lookupFailed) {
      await sleep(SPENT_NONCE_SETTLE_MS);
      await lookup();
    }
    if (receipt) return settle(receipt);
    if (nonceSpent === true && !lookupFailed) {
      markJournalDead(config.projectDir, journal, entryId, { reason: "nonce-spent", at: now().toISOString() });
      log(
        `journal: the nonce of the journaled transaction for brief ${shortId(entryId)} was spent by a different transaction — tx ${entry.hash} can never land. The entry is kept, marked dead.`
      );
      return "dead";
    }
    if (pass === 0) {
      // still open — re-broadcast the same bytes so a dropped transaction
      // re-enters the mempool, then give it a real, bounded wait: an immediate
      // re-check was exactly the gap a racing block landed in
      try {
        await wallet.sendRawTransaction({ serializedTransaction: entry.raw });
      } catch {
        // the node may already hold the bytes — the outcome is the same
      }
      progress.state = "broadcast";
      try {
        const settled = await wallet.waitForTransactionReceipt({ hash: entry.hash, timeout: RESOLVE_WAIT_MS });
        if (settled) return settle(settled);
      } catch {
        // a timeout or an RPC error leaves the entry open for the re-check
      }
    }
  }
  return "unresolved";
}

export async function runAgent({ config, chain, wallet, mida, log, now = () => new Date(), dryRun = false }) {
  let lock;
  try {
    lock = acquireLock(config.projectDir);
  } catch (error) {
    if (error instanceof LockHeldError) {
      log(
        `mida: another run is in progress (pid ${error.pid}, lock file ${LOCK_FILE}). Check the pid is really running (e.g. ps -p ${error.pid}); remove the lock file only if that process is gone. Nothing was sent.`
      );
      return { exitCode: 1, outcome: "locked" };
    }
    throw error;
  }
  // the hash of anything this run signed or re-broadcast, and how far it got —
  // attached to an unexpected error so the cli line can say what is actually
  // known instead of guessing (signed: nothing was broadcast; journaled: an
  // earlier run signed it; broadcast: sent, landing unknown; mined: landed,
  // only the receipt may be missing)
  const progress = { hash: null, state: null };
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
        `mida: no brief found in preferences.communication. Write one with: MIDA_HOME=$HOME/.mida-trustlayer mida remember '{"trustlayer":1,"action":"transfer","to":"0x…","amountMon":"0.01"}'. Nothing was sent.`
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

    // A journal that will not parse may be hiding a pending payment — refuse
    // before any new work rather than trust a file we cannot read.
    let journal;
    try {
      journal = readJournal(config.projectDir);
    } catch {
      log(`journal: ${JOURNAL_FILE} could not be read or parsed — it may hold a payment that is still pending, so nothing was signed or sent. Fix it by hand; never delete it while a payment may be pending.`);
      return { exitCode: 4, outcome: "journal-corrupt" };
    }

    // A receipt this agent wrote for this brief settles it — whatever an old
    // journal entry says, the payment and the record both exist.
    const existing = ownReceiptFor(receipts, brief.id, config.midaAgent);
    if (existing) {
      // if a journaled entry survived, mark it with the receipt rather than
      // trusting the next read-back to see it again — a dry run writes nothing
      if (!dryRun && journal[brief.id]) {
        markJournalReceipted(config.projectDir, journal, brief.id, { id: existing.id, at: now().toISOString() });
      }
      log(alreadyDoneLine(existing, brief.id));
      return { exitCode: 0, outcome: "already-done" };
    }

    // Resolve every open journal entry before signing anything new, oldest
    // first. Each entry holds a signed transaction for this wallet's one nonce
    // sequence: an entry left open means a signed transaction whose outcome is
    // still unknown, and while one is open nothing new may be signed — not for
    // this brief, not for any. A receipted entry ends its brief; a dead entry's
    // transaction can never land; an open one is recovered, resolved, or blocks.
    let blockedDryRun = false;
    for (const [entryId, entry] of Object.entries(journal)) {
      const isCurrentBrief = entryId === brief.id;
      if (entry.receipted) {
        if (!isCurrentBrief) continue;
        log(
          `already done (journal): this brief's transfer was already sent and its receipt recorded (tx ${entry.hash}, receipt ${shortId(entry.receipted.id)}). Nothing was sent.`
        );
        return { exitCode: 0, outcome: "already-done" };
      }
      if (entry.dead) {
        if (!isCurrentBrief) continue;
        log(
          `journal: the signed transaction for this brief can never land (${deadReasonText(entry.dead)}). This agent will not sign a second transaction for the same brief — a new brief record is needed to pay it. Nothing was sent.`
        );
        return { exitCode: 4, outcome: "journal-dead", txHash: entry.hash };
      }
      if (isCurrentBrief) {
        if (dryRun) {
          log(`journal: a signed transaction for this brief is on record (tx ${entry.hash}); a real run would first verify those bytes — and may refuse them — then re-send them, and write the receipt only if the transaction lands.`);
          log("dry run: nothing sent, nothing written.");
          return { exitCode: 0, outcome: "dry-run" };
        }
        const check = await verifyJournalEntry({ entry, brief, agentAddress: config.agentAddress });
        if (!check.ok) {
          log(
            `journal: the stored transaction for this brief is not what was signed (${check.why}). Refusing to re-send it — nothing was signed or sent. Check ${JOURNAL_FILE} by hand; never delete it while a payment may be pending.`
          );
          return { exitCode: 4, outcome: "journal-invalid", txHash: entry.hash };
        }
        progress.hash = entry.hash;
        progress.state = "journaled"; // an earlier run signed it
        return await sendAndAwait({ config, chain, wallet, mida, log, now, journal, delegation, brief, signed: entry, recovery: true, progress });
      }
      const ownReceipt = ownReceiptFor(receipts, entryId, config.midaAgent);
      if (ownReceipt) {
        if (!dryRun) markJournalReceipted(config.projectDir, journal, entryId, { id: ownReceipt.id, at: now().toISOString() });
        continue;
      }
      if (dryRun) {
        log(
          `journal: brief ${shortId(entryId)} has an unresolved signed transaction (tx ${entry.hash}, nonce ${entry.nonce}) — a real run resolves it before signing anything new.`
        );
        blockedDryRun = true;
        continue;
      }
      progress.hash = entry.hash;
      progress.state = "journaled"; // an earlier run signed it
      const state = await resolveJournalEntry({ config, chain, wallet, mida, log, now, journal, delegation, entryId, entry, progress });
      if (state === "invalid") return { exitCode: 4, outcome: "journal-invalid", txHash: entry.hash };
      if (state === "unresolved" || state === "receipt-write-failed") {
        log(
          state === "receipt-write-failed"
            ? `journal: brief ${shortId(entryId)} has a signed transaction still unresolved (tx ${entry.hash}, nonce ${entry.nonce}). Nothing new was signed. The transfer has already mined — it resolves when the receipt write succeeds; running again retries the write.`
            : `journal: brief ${shortId(entryId)} has a signed transaction still unresolved (tx ${entry.hash}, nonce ${entry.nonce}). Nothing new was signed. It resolves when that transaction mines or its nonce is spent — running again re-broadcasts the same bytes and re-checks.`
        );
        return { exitCode: 4, outcome: "journal-blocked", txHash: entry.hash };
      }
    }
    if (blockedDryRun) {
      log("dry run: nothing sent, nothing written.");
      return { exitCode: 0, outcome: "dry-run" };
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

    const decision = decide({ delegation, brief, receipts, balanceWei, maxFeeWei: gasPriceWei * 2n, agentName: config.midaAgent });
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
      const block = await chain.getBlock();
      const baseFeeWei = block?.baseFeePerGas ?? 0n;
      prepared = await wallet.signTransfer({
        to: brief.to,
        value: brief.amountWei,
        nonce,
        gas: 21000n,
        maxFeePerGas: gasPriceWei * 2n,
        maxPriorityFeePerGas: gasPriceWei > baseFeeWei ? gasPriceWei - baseFeeWei : 0n,
      });
    } catch (error) {
      log(`chain: could not prepare the transaction over ${rpcHost(config.rpcUrl)} (${errorClass(error)}). Nothing was sent.`);
      return { exitCode: 4, outcome: "chain-error" };
    }
    progress.hash = prepared.hash;
    progress.state = "signed"; // signed but not broadcast — a failure before send means nothing was sent
    writeJournalEntry(config.projectDir, journal, brief.id, {
      hash: prepared.hash,
      raw: prepared.raw,
      nonce: Number(nonce),
      to: brief.to,
      value: brief.amountWei.toString(),
      memo: brief.memo,
      delegationId: delegation.id,
    });
    return await sendAndAwait({ config, chain, wallet, mida, log, now, journal, delegation, brief, signed: { ...prepared, nonce: Number(nonce) }, recovery: false, progress });
  } catch (error) {
    if (progress.hash && error && typeof error === "object") {
      try {
        error.txHash = progress.hash;
        error.txState = progress.state;
      } catch {
        // a frozen error object degrades the line to the name only
      }
    }
    throw error;
  } finally {
    lock.release();
  }
}
