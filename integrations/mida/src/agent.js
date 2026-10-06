import { isMidaSdkError } from "@mida-context/sdk";
import { monadTestnet } from "viem/chains";
import { BriefError, parseBrief, pickBrief, shortId } from "./brief.js";
import { decide, noDelegationLine } from "./decide.js";
import { autoCapMon, ChainError, errorClass, readDelegation, rpcHost, shortAddr } from "./trustlayer.js";

const BRIEF_NAMESPACE = "preferences.communication";
const RECEIPT_NAMESPACE = "projects.current";
const BRIEF_PAGE_BYTES = 16_384;
const RECEIPT_PAGE_BYTES = 65_536;
const EXPLORER_TX = "https://testnet.monadscan.com/tx/";

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

function midaRefusedLine(error) {
  return `mida: refused (${error.code}) — ${error.message.replace(/\.$/, "")}. Nothing was sent.`;
}

export async function runAgent({ config, chain, wallet, mida, log, now = () => new Date(), dryRun = false }) {
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
  log(
    `mida: ${config.midaAgent} approved; brief ${shortId(brief.id)} (${brief.author?.name ?? "owner"}, ${brief.assertedAt ?? "unknown time"}): transfer ${brief.amountMon} MON to ${shortAddr(brief.to)}`
  );

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

  let hash;
  try {
    hash = await wallet.sendTransaction({ to: brief.to, value: brief.amountWei });
  } catch (error) {
    log(`chain: the transaction was rejected (${errorClass(error)}). Nothing was sent.`);
    return { exitCode: 4, outcome: "send-rejected" };
  }
  let receipt;
  try {
    receipt = await wallet.waitForTransactionReceipt({ hash });
  } catch (error) {
    const line =
      error instanceof Error && error.name.includes("Timeout")
        ? `chain: tx ${hash} was not confirmed within 60 s. Check it on ${EXPLORER_TX}${hash} before running again; no Mida receipt was written.`
        : `chain: tx ${hash} could not be confirmed (${errorClass(error)}). Check it on ${EXPLORER_TX}${hash} before running again; no Mida receipt was written.`;
    log(line);
    return { exitCode: 4, outcome: "unconfirmed", txHash: hash };
  }
  if (receipt.status !== "success") {
    log(`chain: tx ${hash} reverted. No Mida receipt was written.`);
    return { exitCode: 4, outcome: "reverted", txHash: hash };
  }
  log(`sent: ${brief.amountMon} MON to ${shortAddr(brief.to)} — tx ${hash} (block ${receipt.blockNumber.toLocaleString("en-US")})`);

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
    action: { kind: "transfer", to: brief.to, amountMon: brief.amountMon, memo: brief.memo },
    tx: { hash, block: receipt.blockNumber.toString(), status: receipt.status, from: config.agentAddress, chainId: monadTestnet.id },
    at: now().toISOString(),
  };
  let saved;
  try {
    saved = await mida.remember({ namespace: RECEIPT_NAMESPACE, kind: "EPISODE", content });
  } catch (error) {
    if (isMidaSdkError(error)) {
      log(
        `mida: the transfer happened (tx ${hash}) but the receipt was refused (${error.code}) — ${error.message.replace(/\.$/, "")}. The already-done guard cannot see this transfer: do not re-run with the same brief.`
      );
      return { exitCode: 5, outcome: "receipt-refused", txHash: hash };
    }
    throw error;
  }
  log(
    saved.state === "pending"
      ? `recorded: Mida receipt ${shortId(saved.id)} (pending) in projects.current — it anchors with the next batch.`
      : `recorded: Mida receipt ${shortId(saved.id)} (anchored) in projects.current, author ${config.midaAgent}`
  );
  return { exitCode: 0, outcome: "sent", txHash: hash, receiptId: saved.id };
}
