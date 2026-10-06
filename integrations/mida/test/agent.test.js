import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { keccak256, parseEther, parseTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { MidaSdkError } from "@mida-context/sdk";
import { runAgent } from "../src/agent.js";

const REGISTRY = "0x088bc310c841fA5ed5b28F37050c3B419572b70d";
const OWNER = "0x1234567890abcdef1234567890abcdef1234abcd";
const TO = "0x5555555555555555555555555555555555557777";
const EXPIRES_ISO = "2026-10-07T03:58:34.000Z";
const NOW_ISO = "2026-10-09T08:55:31.204Z";
const ASSERTED = "2026-10-09T08:50:12Z";
const TX_HASH = "0xabc123def456";
const RECEIPT_ID = "0xf7d4bf13abcd9e";
const BRIEF_ID = "0xd9d35dc2c50055f8";
const BRIEF_B_ID = "0xb7c8d9e0f1a2b3c4";
const AGENT_KEY = generatePrivateKey();
const AGENT_ADDR = privateKeyToAccount(AGENT_KEY).address;
const SHORT_AGENT = `${AGENT_ADDR.slice(0, 6)}…${AGENT_ADDR.slice(-4)}`;

const BRIEF_JSON = `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"0.01","memo":"TrustLayer x Mida demo"}`;
// an owner record on Mida's chain carries the 32-byte zero author id and source USER_ASSERTED
const OWNER_AUTHOR_ID = "0x" + "0".repeat(64);
const OTHER_AUTHOR_ID = "0x" + "cd".repeat(32);

function config(overrides = {}) {
  return {
    agentPrivateKey: AGENT_KEY,
    agentAddress: AGENT_ADDR,
    trustlayerOwner: OWNER,
    midaHome: "/tmp/mida-test-home",
    midaAgent: "trustlayer-agent",
    projectDir: "/tmp/mida-test-project",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    registry: REGISTRY,
    ...overrides,
  };
}

function briefFact(id = BRIEF_ID, json = BRIEF_JSON, overrides = {}) {
  return {
    id,
    namespace: "preferences.communication",
    kind: "PREFERENCE",
    content: { text: json, assertedAt: ASSERTED },
    author: { name: null, id: OWNER_AUTHOR_ID },
    source: "USER_ASSERTED",
    writtenAt: ASSERTED,
    state: "anchored",
    ...overrides,
  };
}

// the shape the SDK returns for a record an agent wrote: source AGENT_INFERRED,
// author {name, id} with a non-zero id resolved by the daemon
function receiptItem(id, briefRecordId, hash = TX_HASH, overrides = {}) {
  return {
    id,
    namespace: "projects.current",
    kind: "EPISODE",
    content: { trustlayerReceipt: 1, briefRecordId, tx: { hash } },
    author: { name: "trustlayer-agent", id: OTHER_AUTHOR_ID },
    source: "AGENT_INFERRED",
    writtenAt: NOW_ISO,
    state: "anchored",
    ...overrides,
  };
}

// A small model of the chain itself, shared by the wallet and the reads —
// closer to how Monad really behaves than a bag of independent answers:
// `pending` equals `latest` (Monad RPC docs); a transaction mines only when its
// nonce is the account's next nonce and its fee cap covers the base fee; mining
// advances the nonce and records the payment; and a mined transaction stays
// findable by hash — the way a real node answers eth_getTransactionReceipt.
function makeNode({ nonce = 7, balanceWei = parseEther("1"), gasPriceWei = 1_000_000_000n, baseFeeWei = 0n, receiptStatus = "success" } = {}) {
  const node = {
    nonce,
    balanceWei,
    gasPriceWei,
    baseFeeWei,
    receiptStatus,
    mempool: new Map(), // hash -> parsed tx: reached the node, not yet mined
    mined: new Map(),   // hash -> receipt
    payments: [],       // every mined transfer, in order
    mine() {
      for (const [hash, tx] of node.mempool) {
        const cap = tx.maxFeePerGas ?? tx.gasPrice ?? 0n;
        if (tx.nonce === node.nonce && cap >= node.baseFeeWei) {
          node.mempool.delete(hash);
          node.mined.set(hash, { status: node.receiptStatus, blockNumber: 68990001n + BigInt(node.payments.length), transactionHash: hash });
          node.payments.push({ hash, to: tx.to, value: tx.value });
          node.nonce += 1;
          return node.mine();
        }
        if (tx.nonce < node.nonce) node.mempool.delete(hash); // stale — can never land
        // a nonce in the future, or a fee cap under the base fee, just waits
      }
    },
  };
  return node;
}

// receiptPlan entries: "ok" (answer from the mined map) | "null" (definitely not
// mined) | "throw" | Error — for a node that cannot answer the receipt lookup.
function makeChain({ delegation = [true, 29n, 1], details, node, balanceWei, gasPriceWei, baseFeeWei, nonce, code = "0x", codeError, receiptPlan = ["ok"] } = {}) {
  const shared = node ?? makeNode({ nonce, balanceWei, gasPriceWei, baseFeeWei });
  const readContractCalls = [];
  const codeCalls = [];
  const struct = details ?? {
    owner: OWNER, agent: AGENT_ADDR, tier: 1, createdAt: 1n, expiresAt: 1791345514n, active: true, revoked: false,
  };
  const pop = (plan) => (plan.length > 1 ? plan.shift() : plan[0]);
  return {
    readContractCalls,
    codeCalls,
    node: shared,
    async readContract(input) {
      readContractCalls.push(input);
      return input.functionName === "checkAgentDelegation" ? delegation : struct;
    },
    async getBalance() { return shared.balanceWei; },
    async getGasPrice() { return shared.gasPriceWei; },
    async getBlock() { return { baseFeePerGas: shared.baseFeeWei }; },
    async getTransactionCount() { return shared.nonce; }, // pending == latest on Monad
    async getTransactionReceipt({ hash }) {
      const behavior = pop(receiptPlan);
      if (behavior instanceof Error) throw behavior;
      if (behavior === "throw") throw Object.assign(new Error("429"), { name: "HttpRequestError" });
      if (behavior === "null") return null;
      return shared.mined.get(hash) ?? null;
    },
    async getCode(input) {
      codeCalls.push(input);
      if (codeError) throw codeError;
      return code;
    },
  };
}

function makeMida({
  factsPages = [{ items: [briefFact()], cursor: null }],
  receiptPages = [{ items: [], cursor: null }],
  contextError,
  rememberResult = { id: RECEIPT_ID, state: "anchored" },
  rememberError,
} = {}) {
  const contextCalls = [];
  const rememberCalls = [];
  const statusCalls = [];
  let fi = 0;
  let ri = 0;
  return {
    contextCalls,
    rememberCalls,
    statusCalls,
    async status() {
      statusCalls.push(1);
      return { up: true, text: "trustlayer-agent: approved for this folder" };
    },
    async context(input) {
      contextCalls.push(input);
      if (contextError) throw contextError;
      if (input.namespace === "preferences.communication") return factsPages[Math.min(fi++, factsPages.length - 1)];
      return receiptPages[Math.min(ri++, receiptPages.length - 1)];
    },
    async remember(input) {
      rememberCalls.push(input);
      if (rememberError) throw rememberError;
      return rememberResult;
    },
  };
}

const TX_TIMEOUT = () => Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });

// A wallet over the shared node: signTransfer signs real bytes locally;
// sendRawTransaction hands the bytes to the node, which mines them when their
// nonce and fee cap allow — so a re-send of identical bytes produces the
// identical hash and can never be a second transfer. sendPlan entries:
// "ok" | "throw" (the node never got it) | "throw-after-accept" (the node got
// it — and may have mined it — but the reply was lost). waitPlan entries:
// "ok" | "timeout" | Error | a receipt object to return as-is.
// mineOnSend false leaves broadcasts sitting in the mempool.
function makeWallet({ node = makeNode(), sendPlan = ["ok"], waitPlan = ["ok"], mineOnSend = true } = {}) {
  const account = privateKeyToAccount(AGENT_KEY);
  const signCalls = [];
  const sendRaws = [];
  const waits = [];
  const pop = (plan) => (plan.length > 1 ? plan.shift() : plan[0]);
  return {
    signCalls,
    sendRaws,
    waits,
    node,
    account,
    async signTransfer(input) {
      signCalls.push(input);
      const raw = await account.signTransaction({
        type: input.maxFeePerGas !== undefined ? "eip1559" : "legacy",
        chainId: 10143,
        nonce: input.nonce,
        to: input.to,
        value: input.value,
        gas: input.gas,
        gasPrice: input.gasPrice,
        maxFeePerGas: input.maxFeePerGas,
        maxPriorityFeePerGas: input.maxPriorityFeePerGas,
      });
      return { raw, hash: keccak256(raw) };
    },
    async sendRawTransaction({ serializedTransaction }) {
      sendRaws.push(serializedTransaction);
      const hash = keccak256(serializedTransaction);
      const behavior = pop(sendPlan);
      if (behavior instanceof Error) throw behavior;
      if (behavior === "throw") throw Object.assign(new Error("connection refused"), { name: "HttpRequestError" });
      // the node got the bytes — whether the sender hears the hash back is another matter
      if (!node.mined.has(hash)) {
        node.mempool.set(hash, parseTransaction(serializedTransaction));
        if (mineOnSend) node.mine();
      }
      if (behavior === "throw-after-accept") throw Object.assign(new Error("the reply was lost"), { name: "SocketError" });
      return hash;
    },
    async waitForTransactionReceipt({ hash }) {
      waits.push(hash);
      const behavior = pop(waitPlan);
      if (behavior instanceof Error) throw behavior;
      if (behavior === "timeout") throw TX_TIMEOUT();
      if (behavior !== "ok" && behavior && typeof behavior === "object") return behavior;
      const mined = node.mined.get(hash);
      if (!mined) throw TX_TIMEOUT();
      return mined;
    },
  };
}

const tempDirs = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mida-agent-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

// By default the chain reads and the wallet share one node — the ledger is what
// ties a send to the nonce and receipt reads, which is the whole point.
async function run({ chain, wallet, mida = makeMida(), node, projectDir, now = () => new Date(NOW_ISO), dryRun = false } = {}) {
  const shared = node ?? chain?.node ?? wallet?.node ?? makeNode();
  const chain2 = chain ?? makeChain({ node: shared });
  const wallet2 = wallet ?? makeWallet({ node: shared });
  const dir = projectDir ?? tmpDir();
  const lines = [];
  const result = await runAgent({
    config: config({ projectDir: dir }),
    chain: chain2,
    wallet: wallet2,
    mida,
    log: (line) => lines.push(line),
    now,
    dryRun,
  });
  for (const line of lines) expect(line).not.toContain(AGENT_KEY);
  return { result, lines, dir, node: shared };
}

describe("runAgent", () => {
  it("happy path: prints the five lines, sends, writes the receipt, exits 0", async () => {
    const node = makeNode();
    const mida = makeMida();
    const wallet = makeWallet({ node });
    const { result, lines, dir } = await run({ node, mida, wallet });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(lines).toEqual([
      `trustlayer: delegation #29 from 0x1234…abcd to ${SHORT_AGENT} — tier Routine ($50), expires ${EXPIRES_ISO}`,
      `mida: trustlayer-agent approved; brief 0xd9d35dc2… (owner, ${ASSERTED}): transfer 0.01 MON to 0x5555…7777`,
      "decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.",
      `sent: 0.01 MON to 0x5555…7777 — tx ${txHash} (block 68,990,001)`,
      "recorded: Mida receipt 0xf7d4bf13… (anchored) in projects.current, author trustlayer-agent",
    ]);
    expect(result.exitCode).toBe(0);
    // signed with the explicit pending nonce, gas 21000 and a max fee of twice
    // the going gas price — the chain still charges only what the block needs
    expect(wallet.signCalls).toEqual([
      { to: TO, value: 10_000_000_000_000_000n, nonce: 7, gas: 21000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
    ]);
    expect(wallet.waits).toEqual([txHash]);
    expect(mida.rememberCalls).toHaveLength(1);
    expect(mida.rememberCalls[0].namespace).toBe("projects.current");
    expect(mida.rememberCalls[0].kind).toBe("EPISODE");
    expect(mida.rememberCalls[0].content).toEqual({
      trustlayerReceipt: 1,
      briefRecordId: BRIEF_ID,
      delegation: {
        registry: REGISTRY,
        chainId: 10143,
        id: "29",
        tier: 1,
        tierName: "Routine",
        autoCapMon: "50",
        expiresAt: EXPIRES_ISO,
        owner: OWNER,
      },
      action: { kind: "transfer", to: TO, amountMon: "0.01", amountWei: "10000000000000000", memo: "TrustLayer x Mida demo" },
      tx: { hash: txHash, block: "68990001", status: "success", from: AGENT_ADDR, chainId: 10143 },
      at: NOW_ISO,
    });
    // the journal keeps the entry — marked receipted — because the next
    // read-back may not see the receipt yet, and the journal alone decides
    // whether this brief may ever be signed for again
    const journaled = JSON.parse(fs.readFileSync(path.join(dir, ".trustlayer-journal.json"), "utf8"));
    expect(journaled[BRIEF_ID]).toMatchObject({ hash: txHash, nonce: 7, receipted: { id: RECEIPT_ID } });
  });

  it("never signs for a brief with a journal entry, even when the receipt read-back misses it", async () => {
    // the store skips rows its RPC has not seen yet without setting `partial` —
    // a quick re-run then sees an empty receipt list, and only the journaled
    // entry stands between the owner and a second payment
    const dir = tmpDir();
    const node = makeNode();
    const wallet = makeWallet({ node });
    const first = await run({ node, wallet, mida: makeMida(), projectDir: dir });
    expect(first.result.exitCode).toBe(0);

    const second = await run({
      node,
      wallet,
      mida: makeMida({ receiptPages: [{ items: [], cursor: null }] }),
      projectDir: dir,
    });
    expect(second.result.exitCode).toBe(0);
    expect(second.lines.at(-1)).toContain("already done (journal)");
    expect(second.lines.at(-1)).toContain("Nothing was sent");
    expect(wallet.sendRaws).toHaveLength(1);
    expect(node.payments).toHaveLength(1);
  });

  it("refuses before touching Mida when the delegation is invalid", async () => {
    const chain = makeChain({ delegation: [false, 0n, 0] });
    const mida = makeMida();
    const wallet = makeWallet();
    const { result, lines } = await run({ chain, mida, wallet });
    expect(result.exitCode).toBe(2);
    expect(lines).toEqual([
      `trustlayer: no valid delegation from 0x1234…abcd to ${SHORT_AGENT} on the DelegationRegistry (revoked, expired or never created). Nothing was sent.`,
    ]);
    expect(mida.contextCalls).toHaveLength(0);
    expect(wallet.sendRaws).toHaveLength(0);
  });

  it.each(["revoked", "not-approved"])(
    "exits 3 and sends nothing when context() refuses with %s",
    async (code) => {
      const mida = makeMida({ contextError: new MidaSdkError(code, `the service said ${code}`) });
      const wallet = makeWallet();
      const { result, lines } = await run({ mida, wallet });
      expect(result.exitCode).toBe(3);
      expect(lines).toEqual([
        `trustlayer: delegation #29 from 0x1234…abcd to ${SHORT_AGENT} — tier Routine ($50), expires ${EXPIRES_ISO}`,
        `mida: refused (${code}) — the service said ${code}. Nothing was sent.`,
      ]);
      expect(wallet.sendRaws).toHaveLength(0);
      expect(mida.rememberCalls).toHaveLength(0);
    }
  );

  it.each(["service-unavailable", "transport-unavailable"])(
    "exits 3 saying unavailable, not refused, when context() fails with %s",
    async (code) => {
      // the service not answering is not a refusal — the line must not claim one
      const mida = makeMida({ contextError: new MidaSdkError(code, `the service said ${code}`) });
      const wallet = makeWallet();
      const { result, lines } = await run({ mida, wallet });
      expect(result.exitCode).toBe(3);
      expect(lines.at(-1)).toBe(`mida: unavailable (${code}) — the service said ${code}. Nothing was sent.`);
      expect(wallet.sendRaws).toHaveLength(0);
    }
  );

  it("exits 3 and sends nothing when the brief list comes back partial", async () => {
    const mida = makeMida({ factsPages: [{ items: [], cursor: null, partial: true }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(3);
    expect(lines).toEqual([
      `trustlayer: delegation #29 from 0x1234…abcd to ${SHORT_AGENT} — tier Routine ($50), expires ${EXPIRES_ISO}`,
      "mida: the record list came back incomplete (the store has not verified its newest rows yet). Nothing was sent. Run again in a minute.",
    ]);
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("exits 3 and sends nothing when the receipt list is partial and omits the receipt", async () => {
    // the receipt that would suppress this brief can be exactly the row a partial list omits
    const mida = makeMida({ receiptPages: [{ items: [], cursor: null, partial: true }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(3);
    expect(lines.at(-1)).toBe(
      "mida: the record list came back incomplete (the store has not verified its newest rows yet). Nothing was sent. Run again in a minute."
    );
    // the receipt read can still refuse — the "approved; brief" line must not have printed first
    expect(lines.some((line) => line.includes("approved; brief"))).toBe(false);
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("stops on a partial page even when an earlier page looked complete", async () => {
    const mida = makeMida({
      receiptPages: [
        { items: [receiptItem("0xrother", "0xotherbrief")], cursor: "p2" },
        { items: [], cursor: null, partial: true },
      ],
    });
    const wallet = makeWallet();
    const { result } = await run({ mida, wallet });
    expect(result.exitCode).toBe(3);
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("refuses when the newest owner brief is malformed instead of paying an older one", async () => {
    // the newest owner record decides — a broken one must never silently unblock the previous brief
    const broken = briefFact("0xbroken1", `{trustlayer:1,"action":"transfer","to":"${TO}","amountMon":"5"}`);
    const older = briefFact("0xolder99", BRIEF_JSON);
    const mida = makeMida({ factsPages: [{ items: [broken, older], cursor: null }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(2);
    expect(lines.at(-1)).toBe("brief 0xbroken1…: the text is not valid JSON. Nothing was sent.");
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("ignores a brief-shaped record written by an agent and refuses as no-brief", async () => {
    const forged = briefFact("0xforged", `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"49"}`, {
      author: { name: "trustlayer-agent", id: OTHER_AUTHOR_ID },
      source: "AGENT_INFERRED",
    });
    const mida = makeMida({ factsPages: [{ items: [forged], cursor: null }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(2);
    expect(lines.at(-1)).toContain("no brief found");
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("exits 2 with the R3 line when no brief exists", async () => {
    const mida = makeMida({ factsPages: [{ items: [briefFact("0xother", "remember to water plants")], cursor: null }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(2);
    expect(lines).toEqual([
      `trustlayer: delegation #29 from 0x1234…abcd to ${SHORT_AGENT} — tier Routine ($50), expires ${EXPIRES_ISO}`,
      `mida: no brief found in preferences.communication. Write one with: mida remember '{"trustlayer":1,"action":"transfer","to":"0x…","amountMon":"0.01"}'. Nothing was sent.`,
    ]);
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("refuses a brief whose destination is the zero address", async () => {
    const mida = makeMida({
      factsPages: [{ items: [briefFact(BRIEF_ID, '{"trustlayer":1,"action":"transfer","to":"0x0000000000000000000000000000000000000000","amountMon":"0.01"}')], cursor: null }],
    });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(2);
    expect(lines.at(-1)).toContain("to is invalid");
    expect(lines.at(-1)).toContain("zero address");
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("refuses a brief whose destination is the agent's own address", async () => {
    const mida = makeMida({
      factsPages: [{ items: [briefFact(BRIEF_ID, `{"trustlayer":1,"action":"transfer","to":"${AGENT_ADDR}","amountMon":"0.01"}`)], cursor: null }],
    });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(2);
    expect(lines.at(-1)).toContain("to is invalid");
    expect(lines.at(-1)).toContain("own address");
    expect(wallet.sendRaws).toHaveLength(0);
  });

  it("refuses a brief whose destination holds contract code — one getCode call, no send", async () => {
    // the README promises plain transfers only; a contract destination could run code
    const chain = makeChain({ code: "0x6000" });
    const mida = makeMida();
    const wallet = makeWallet();
    const { result, lines } = await run({ chain, mida, wallet });
    expect(result.exitCode).toBe(2);
    expect(chain.codeCalls).toEqual([{ address: TO }]);
    expect(lines.at(-1)).toContain("to is invalid");
    expect(lines.at(-1)).toContain("contract");
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("exits 4 when the destination check cannot reach the chain", async () => {
    const chain = makeChain({ codeError: new Error("socket closed") });
    const wallet = makeWallet();
    const { result, lines } = await run({ chain, wallet });
    expect(result.exitCode).toBe(4);
    expect(lines.at(-1)).toContain("could not check the destination");
    expect(lines.at(-1)).toContain("Nothing was sent.");
    expect(wallet.sendRaws).toHaveLength(0);
  });

  it("checks the balance against exactly the max fee the signed transaction bids", async () => {
    // the signed max fee is 2x the gas price; balance = amount + 21000 * maxFee
    // passes, one wei less must refuse — and the cap the check used is the cap
    // the signature carries
    const gasPriceWei = 2_000_000_000n;
    const maxFeeWei = gasPriceWei * 2n;
    const amountWei = parseEther("0.01");
    const node = makeNode({ balanceWei: amountWei + 21_000n * maxFeeWei, gasPriceWei });
    const wallet = makeWallet({ node });
    const { result } = await run({ node, wallet });
    expect(result.exitCode).toBe(0);
    expect(wallet.signCalls[0].maxFeePerGas).toBe(maxFeeWei);
    expect(wallet.signCalls[0].gas).toBe(21_000n);

    const node2 = makeNode({ balanceWei: amountWei + 21_000n * maxFeeWei - 1n, gasPriceWei });
    const wallet2 = makeWallet({ node: node2 });
    const { result: result2, lines: lines2 } = await run({ node: node2, wallet: wallet2 });
    expect(result2.exitCode).toBe(2);
    expect(lines2.at(-1)).toContain("plus gas");
    expect(wallet2.sendRaws).toHaveLength(0);
  });

  it("reports already-done and sends nothing when a receipt names the brief", async () => {
    const mida = makeMida({ receiptPages: [{ items: [receiptItem("0xreceipt9", BRIEF_ID)], cursor: null }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(0);
    expect(lines.at(-1)).toBe(`already done: receipt 0xreceipt9… for brief 0xd9d35dc2… exists (tx ${TX_HASH}). Nothing was sent.`);
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("does not suppress the transfer when a receipt for the brief was written by another author", async () => {
    // someone else's record claims this brief was paid with tx 0xnotmine — it must not count
    const foreign = receiptItem("0xforeign", BRIEF_ID, "0xnotmine", { author: { name: "some-other-agent", id: "0x" + "ef".repeat(32) } });
    const mida = makeMida({ receiptPages: [{ items: [foreign], cursor: null }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(0);
    expect(wallet.signCalls).toEqual([
      { to: TO, value: 10_000_000_000_000_000n, nonce: 7, gas: 21000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
    ]);
    expect(lines.some((line) => line.includes("0xnotmine"))).toBe(false);
    expect(mida.rememberCalls).toHaveLength(1);
  });

  it("exits 4 with the journaled-hash line when the tx is not confirmed in 60 s", async () => {
    // the node accepted the broadcast but no leader has included it yet
    const wallet = makeWallet({ waitPlan: ["timeout"], mineOnSend: false });
    const mida = makeMida();
    const { result, lines, dir } = await run({ wallet, mida });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(result.exitCode).toBe(4);
    expect(lines.at(-1)).toBe(
      `chain: tx ${txHash} was not confirmed within 60 s. The signed transaction is journaled — running again re-sends the same bytes, which cannot pay twice. Whether it landed is unknown.`
    );
    expect(mida.rememberCalls).toHaveLength(0);
    // the signed bytes are on disk before any broadcast, so the next run can re-send them
    const journal = JSON.parse(fs.readFileSync(path.join(dir, ".trustlayer-journal.json"), "utf8"));
    expect(journal[BRIEF_ID]).toEqual({ hash: txHash, raw: wallet.sendRaws[0], nonce: 7 });
  });

  it("names the cause when the current base fee is above the journaled transaction's max fee", async () => {
    // the broadcast bid 2x the going gas price, and the base fee has since
    // risen above that cap — the journaled bytes cannot mine while that holds;
    // "unknown" would be a lie about the reason
    const node = makeNode({ gasPriceWei: 102n * 1_000_000_000n, baseFeeWei: 210n * 1_000_000_000n });
    const wallet = makeWallet({ node, waitPlan: ["timeout"] });
    const { result, lines } = await run({ node, wallet });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(result.exitCode).toBe(4);
    expect(lines.at(-1)).toContain(txHash);
    expect(lines.at(-1)).toContain("base fee");
    expect(lines.at(-1)).toContain("max fee");
    expect(lines.at(-1)).not.toContain("unknown");
    expect(node.payments).toHaveLength(0);
  });

  it("exits 4 and writes no receipt when the tx reverted", async () => {
    const node = makeNode({ receiptStatus: "reverted" });
    const wallet = makeWallet({ node });
    const mida = makeMida();
    const { result, lines } = await run({ wallet, mida });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(result.exitCode).toBe(4);
    expect(lines.at(-1)).toBe(`chain: tx ${txHash} reverted. No Mida receipt was written.`);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("exits 5 with a true line when the receipt write is refused after a successful send", async () => {
    const rememberError = new MidaSdkError("rate-limited", "one write per minute on this lane", { lane: "direct" });
    const mida = makeMida({ rememberError });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(result.exitCode).toBe(5);
    expect(result.txHash).toBe(txHash);
    expect(lines.at(-1)).toBe(
      `mida: the transfer happened (tx ${txHash}) but the receipt write failed (rate-limited) — one write per minute on this lane. The write may still have landed; running again is safe — it re-sends the same signed transaction (which cannot pay twice) and writes only the missing receipt.`
    );
  });

  it("exit 5 then re-run: no second transfer, the missing receipt is written", async () => {
    const dir = tmpDir();
    const rememberError = new MidaSdkError("rate-limited", "one write per minute on this lane", { lane: "direct" });
    const node = makeNode();
    const wallet = makeWallet({ node });
    const first = await run({ node, wallet, mida: makeMida({ rememberError }), projectDir: dir });
    expect(first.result.exitCode).toBe(5);

    const secondMida = makeMida();
    const second = await run({ node, wallet, mida: secondMida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    // the re-run broadcast exactly the journaled bytes — the node sees the same transaction
    expect(wallet.sendRaws).toHaveLength(2);
    expect(wallet.sendRaws[1]).toBe(wallet.sendRaws[0]);
    expect(second.lines.some((line) => line.startsWith("recovered:"))).toBe(true);
    expect(secondMida.rememberCalls).toHaveLength(1);
    // the entry stays, marked with the receipt the re-run wrote
    const journaled = JSON.parse(fs.readFileSync(path.join(dir, ".trustlayer-journal.json"), "utf8"));
    expect(journaled[BRIEF_ID].receipted.id).toBe(RECEIPT_ID);
  });

  it("wait timeout then re-run: same bytes re-sent, one transfer total", async () => {
    const dir = tmpDir();
    const node = makeNode();
    // the node took the broadcast but no leader mined it before the wait timed out
    const wallet = makeWallet({ node, waitPlan: ["timeout", "ok"], mineOnSend: false });
    const mida = makeMida();
    const first = await run({ node, wallet, mida, projectDir: dir });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(first.result.exitCode).toBe(4);
    expect(first.lines.at(-1)).toContain(txHash);
    expect(first.lines.at(-1)).not.toContain("before running again");

    node.mine(); // the transaction lands between the two runs
    const second = await run({ node, wallet, mida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    expect(wallet.sendRaws).toHaveLength(2);
    expect(wallet.sendRaws[1]).toBe(wallet.sendRaws[0]);
    expect(mida.rememberCalls).toHaveLength(1);
    expect(second.lines.some((line) => line.startsWith("recovered:"))).toBe(true);
  });

  it("writes the receipt when the wait fails but our transaction mined anyway", async () => {
    // the node mined the broadcast; the wait's reply is what got lost
    const node = makeNode();
    const wallet = makeWallet({ node, waitPlan: ["timeout"] });
    const mida = makeMida();
    const { result, lines } = await run({ node, wallet, mida });
    expect(result.exitCode).toBe(0);
    expect(node.payments).toHaveLength(1);
    expect(mida.rememberCalls).toHaveLength(1);
    expect(lines.at(-1)).toContain("recorded:");
    expect(lines.some((line) => line.includes("different transaction"))).toBe(false);
  });

  it("says it cannot tell, not 'a different transaction', when the receipt lookup fails too", async () => {
    const dir = tmpDir();
    const node = makeNode();
    // the node never saw the broadcast and cannot answer the receipt lookup either
    const chain = makeChain({ node, receiptPlan: ["throw"] });
    const wallet = makeWallet({ node, sendPlan: ["throw"], waitPlan: ["timeout"] });
    const first = await run({ chain, wallet, projectDir: dir });
    expect(first.result.exitCode).toBe(4);
    // the wallet's nonce moved — maybe our transaction mined, maybe another one
    // spent it; the run cannot tell and must not guess
    node.nonce = 8;
    const second = await run({ chain, wallet, projectDir: dir });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(second.result.exitCode).toBe(4);
    expect(second.lines.at(-1)).toContain(txHash);
    expect(second.lines.at(-1)).toContain("cannot tell");
    expect(second.lines.at(-1)).not.toContain("different transaction");
  });

  it("resolves an older brief's journaled transaction before signing a newer brief", async () => {
    // brief A's run sent and mined but could not confirm it — its journal entry
    // is still open. The owner then wrote brief B; a run that signed B while A
    // was open would orphan A's payment, so the journal is resolved oldest first.
    const dir = tmpDir();
    const node = makeNode();
    const chain = makeChain({ node, receiptPlan: ["throw", "ok"] });
    const wallet = makeWallet({ node, waitPlan: ["timeout"] });
    const first = await run({ chain, wallet, projectDir: dir });
    expect(first.result.exitCode).toBe(4);

    const briefB = `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"0.02","memo":"second"}`;
    const mida = makeMida({ factsPages: [{ items: [briefFact(BRIEF_B_ID, briefB), briefFact()], cursor: null }] });
    const second = await run({ chain, wallet, mida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    // A's transaction already landed in run 1 — its receipt is written first,
    // then B is signed, sent and receipted in this run
    expect(node.payments).toHaveLength(2);
    expect(mida.rememberCalls[0].content.briefRecordId).toBe(BRIEF_ID);
    expect(mida.rememberCalls[1].content.briefRecordId).toBe(BRIEF_B_ID);
    const journal = JSON.parse(fs.readFileSync(path.join(dir, ".trustlayer-journal.json"), "utf8"));
    expect(journal[BRIEF_ID].receipted).toBeTruthy();
    expect(journal[BRIEF_B_ID].receipted).toBeTruthy();
    const txHashA = keccak256(wallet.sendRaws[0]);
    expect(second.lines.some((line) => line.includes(txHashA) && line.includes("confirmed"))).toBe(true);
  });

  it("signs nothing new while an older journaled transaction is still unresolved", async () => {
    const dir = tmpDir();
    const node = makeNode();
    // the broadcast sat in the mempool: never mined, nonce unspent
    const wallet = makeWallet({ node, waitPlan: ["timeout"], mineOnSend: false });
    const first = await run({ node, wallet, projectDir: dir });
    expect(first.result.exitCode).toBe(4);
    const txHashA = keccak256(wallet.sendRaws[0]);

    const briefB = `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"0.02","memo":"second"}`;
    const mida = makeMida({ factsPages: [{ items: [briefFact(BRIEF_B_ID, briefB), briefFact()], cursor: null }] });
    const second = await run({ node, wallet, mida, projectDir: dir });
    expect(second.result.exitCode).toBe(4);
    // the line names the older brief, its hash and nonce, and what resolves it
    expect(second.lines.at(-1)).toContain("d9d35dc2");
    expect(second.lines.at(-1)).toContain(txHashA);
    expect(second.lines.at(-1)).toContain("nonce 7");
    expect(second.lines.at(-1)).toContain("mines or its nonce is spent");
    // B was never signed, and A's bytes were only re-broadcast, never re-signed
    expect(wallet.signCalls).toHaveLength(1);
    expect(node.payments).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("marks an older entry dead when its nonce was spent by another transaction, then pays the new brief", async () => {
    const dir = tmpDir();
    const node = makeNode();
    // the first broadcast failed, so brief A's transaction never reached the node
    const wallet = makeWallet({ node, sendPlan: ["throw", "ok"], waitPlan: ["timeout", "ok"] });
    const first = await run({ node, wallet, projectDir: dir });
    expect(first.result.exitCode).toBe(4);
    // meanwhile the wallet spent nonce 7 in a transaction this agent never saw
    node.nonce = 8;

    const briefB = `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"0.02","memo":"second"}`;
    const mida = makeMida({ factsPages: [{ items: [briefFact(BRIEF_B_ID, briefB), briefFact()], cursor: null }] });
    const second = await run({ node, wallet, mida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    // A's entry is kept, marked dead with the reason — then B pays normally
    const journal = JSON.parse(fs.readFileSync(path.join(dir, ".trustlayer-journal.json"), "utf8"));
    expect(journal[BRIEF_ID].dead).toBeTruthy();
    expect(journal[BRIEF_ID].dead.reason).toBe("nonce-spent");
    expect(node.payments).toHaveLength(1);
    expect(mida.rememberCalls[0].content.briefRecordId).toBe(BRIEF_B_ID);
  });

  it("send error: no 'Nothing was sent', re-run re-sends the same bytes", async () => {
    const dir = tmpDir();
    const node = makeNode();
    const wallet = makeWallet({ node, sendPlan: ["throw", "ok"], waitPlan: ["timeout", "ok"] });
    const mida = makeMida();
    const first = await run({ node, wallet, mida, projectDir: dir });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(first.result.exitCode).toBe(4);
    for (const line of first.lines) expect(line).not.toContain("Nothing was sent");
    expect(first.lines.at(-1)).toContain(txHash);
    expect(first.lines.at(-1)).toContain("cannot pay twice");

    const second = await run({ node, wallet, mida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    expect(wallet.sendRaws).toHaveLength(2);
    expect(wallet.sendRaws[1]).toBe(wallet.sendRaws[0]);
    expect(mida.rememberCalls).toHaveLength(1);
  });

  it("a second run on the same folder exits 1 while the first is in flight", async () => {
    const dir = tmpDir();
    const linesA = [];
    const linesB = [];
    const node = makeNode();
    const wallet = makeWallet({ node });
    const [a, b] = await Promise.all([
      runAgent({ config: config({ projectDir: dir }), chain: makeChain({ node }), wallet, mida: makeMida(), log: (l) => linesA.push(l) }),
      runAgent({ config: config({ projectDir: dir }), chain: makeChain({ node }), wallet, mida: makeMida(), log: (l) => linesB.push(l) }),
    ]);
    expect([a.exitCode, b.exitCode].sort()).toEqual([0, 1]);
    const loser = a.exitCode === 1 ? linesA : linesB;
    expect(loser.at(-1)).toBe(`mida: another run is in progress (pid ${process.pid}). Nothing was sent.`);
    expect(wallet.sendRaws).toHaveLength(1);
  });

  it("takes over a lock left by a dead process", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, ".trustlayer-run.lock"), "999999\n");
    const { result } = await run({ projectDir: dir });
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, ".trustlayer-run.lock"))).toBe(false);
  });

  it("exits 4 without a wrong-hash receipt when the network replaced the transaction", async () => {
    const replacement = { status: "success", blockNumber: 68990002n, transactionHash: "0x" + "9".repeat(64) };
    const wallet = makeWallet({ waitPlan: [replacement] });
    const mida = makeMida();
    const { result, lines } = await run({ wallet, mida });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(result.exitCode).toBe(4);
    expect(lines.at(-1)).toContain(txHash);
    expect(lines.at(-1)).toContain("replaced");
    expect(lines.at(-1)).toContain(replacement.transactionHash);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("exits 4 when the journaled nonce was spent by a different transaction", async () => {
    const dir = tmpDir();
    const node = makeNode();
    // every broadcast fails, so the journaled transaction never reaches the node
    const wallet = makeWallet({ node, sendPlan: ["throw"], waitPlan: ["timeout"] });
    const first = await run({ node, wallet, mida: makeMida(), projectDir: dir });
    expect(first.result.exitCode).toBe(4);
    // meanwhile the wallet spent nonce 7 in a transaction this run never saw —
    // the journaled tx can never land
    node.nonce = 8;
    const second = await run({ node, wallet, mida: makeMida(), projectDir: dir });
    expect(second.result.exitCode).toBe(4);
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(second.lines.at(-1)).toContain("nonce");
    expect(second.lines.at(-1)).toContain("different transaction");
    expect(second.lines.at(-1)).toContain(txHash);
  });

  it("dry run stops after the decision line", async () => {
    const mida = makeMida();
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet, dryRun: true });
    expect(result.exitCode).toBe(0);
    expect(lines.at(-2)).toBe("decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.");
    expect(lines.at(-1)).toBe("dry run: nothing sent, nothing written.");
    expect(wallet.sendRaws).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("dry run still exits 2 on an invalid delegation", async () => {
    const chain = makeChain({ delegation: [false, 0n, 0] });
    const { result, lines } = await run({ chain, dryRun: true });
    expect(result.exitCode).toBe(2);
    expect(lines.at(-1)).toContain("no valid delegation");
  });

  it("follows the receipt cursor until null before declaring already-done", async () => {
    const mida = makeMida({
      receiptPages: [
        { items: [receiptItem("0xrother", "0xotherbrief")], cursor: "p2" },
        { items: [receiptItem("0xreceipt9", BRIEF_ID)], cursor: null },
      ],
    });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(0);
    expect(lines.at(-1)).toContain("already done");
    const projectReads = mida.contextCalls.filter((c) => c.namespace === "projects.current");
    expect(projectReads).toHaveLength(2);
    expect(projectReads[1].cursor).toBe("p2");
    expect(wallet.sendRaws).toHaveLength(0);
  });

  it("no log line contains the private key in any path", async () => {
    // covered by the assertion inside run() for every case above; exercise one path explicitly here
    const { lines } = await run();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(AGENT_KEY.slice(2));
      expect(line).not.toContain("agentPrivateKey");
    }
  });
});
