import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { keccak256, parseEther } from "viem";
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

function makeChain({ delegation = [true, 29n, 1], details, balanceWei = parseEther("1"), gasPriceWei = 1_000_000_000n, pendingNonce = 7n, latestNonce = 7n, code = "0x" } = {}) {
  const readContractCalls = [];
  const struct = details ?? {
    owner: OWNER, agent: AGENT_ADDR, tier: 1, createdAt: 1n, expiresAt: 1791345514n, active: true, revoked: false,
  };
  return {
    readContractCalls,
    async readContract(input) {
      readContractCalls.push(input);
      return input.functionName === "checkAgentDelegation" ? delegation : struct;
    },
    async getBalance() { return balanceWei; },
    async getGasPrice() { return gasPriceWei; },
    async getTransactionCount({ blockTag }) { return blockTag === "latest" ? latestNonce : pendingNonce; },
    async getCode() { return code; },
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

// a small model of the node: signTransfer signs real bytes locally, sendRawTransaction
// records the bytes and (unless the plan says otherwise) mines them, so a re-send of
// identical bytes produces the identical hash — it can never be a second transfer.
// sendPlan entries: "ok" | "throw" (node never got it) | "throw-after-accept" (the reply
// was lost but the node mined it). waitPlan entries: "ok" | "timeout" | Error | a receipt
// object to return as-is.
function makeWallet({ receipt = { status: "success", blockNumber: 68990001n }, sendPlan = ["ok"], waitPlan = ["ok"] } = {}) {
  const account = privateKeyToAccount(AGENT_KEY);
  const signCalls = [];
  const sendRaws = [];
  const waits = [];
  const node = new Map(); // tx hash -> mined receipt, shared across runs on this wallet
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
        type: "legacy",
        chainId: 10143,
        nonce: input.nonce,
        to: input.to,
        value: input.value,
        gas: input.gas,
        gasPrice: input.gasPrice,
      });
      return { raw, hash: keccak256(raw) };
    },
    async sendRawTransaction({ serializedTransaction }) {
      sendRaws.push(serializedTransaction);
      const hash = keccak256(serializedTransaction);
      const behavior = pop(sendPlan);
      if (behavior === "throw-after-accept") {
        node.set(hash, { ...receipt, transactionHash: hash });
        throw Object.assign(new Error("the reply was lost"), { name: "SocketError" });
      }
      if (behavior instanceof Error) throw behavior;
      if (behavior === "throw") throw Object.assign(new Error("connection refused"), { name: "HttpRequestError" });
      node.set(hash, { ...receipt, transactionHash: hash });
      return hash;
    },
    async waitForTransactionReceipt({ hash }) {
      waits.push(hash);
      const behavior = pop(waitPlan);
      if (behavior instanceof Error) throw behavior;
      if (behavior === "timeout") throw TX_TIMEOUT();
      if (behavior !== "ok" && behavior && typeof behavior === "object") return behavior;
      const mined = node.get(hash);
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

async function run({ chain = makeChain(), mida = makeMida(), wallet = makeWallet(), projectDir, now = () => new Date(NOW_ISO), dryRun = false } = {}) {
  const dir = projectDir ?? tmpDir();
  const lines = [];
  const result = await runAgent({
    config: config({ projectDir: dir }),
    chain,
    wallet,
    mida,
    log: (line) => lines.push(line),
    now,
    dryRun,
  });
  for (const line of lines) expect(line).not.toContain(AGENT_KEY);
  return { result, lines, dir };
}

describe("runAgent", () => {
  it("happy path: prints the five lines, sends, writes the receipt, exits 0", async () => {
    const chain = makeChain();
    const mida = makeMida();
    const wallet = makeWallet();
    const { result, lines, dir } = await run({ chain, mida, wallet });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(lines).toEqual([
      `trustlayer: delegation #29 from 0x1234…abcd to ${SHORT_AGENT} — tier Routine ($50), expires ${EXPIRES_ISO}`,
      `mida: trustlayer-agent approved; brief 0xd9d35dc2… (owner, ${ASSERTED}): transfer 0.01 MON to 0x5555…7777`,
      "decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.",
      `sent: 0.01 MON to 0x5555…7777 — tx ${txHash} (block 68,990,001)`,
      "recorded: Mida receipt 0xf7d4bf13… (anchored) in projects.current, author trustlayer-agent",
    ]);
    expect(result.exitCode).toBe(0);
    // signed with the explicit pending nonce, gas 21000 and the gas price the funds check saw
    expect(wallet.signCalls).toEqual([{ to: TO, value: 10_000_000_000_000_000n, nonce: 7n, gas: 21000n, gasPrice: 1_000_000_000n }]);
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
      action: { kind: "transfer", to: TO, amountMon: "0.01", memo: "TrustLayer x Mida demo" },
      tx: { hash: txHash, block: "68990001", status: "success", from: AGENT_ADDR, chainId: 10143 },
      at: NOW_ISO,
    });
    // the journal entry is gone once the receipt is written
    expect(fs.existsSync(path.join(dir, ".trustlayer-journal.json"))).toBe(false);
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

  it.each(["revoked", "not-approved", "service-unavailable"])(
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
    expect(wallet.signCalls).toEqual([{ to: TO, value: 10_000_000_000_000_000n, nonce: 7n, gas: 21000n, gasPrice: 1_000_000_000n }]);
    expect(lines.some((line) => line.includes("0xnotmine"))).toBe(false);
    expect(mida.rememberCalls).toHaveLength(1);
  });

  it("exits 4 with the journaled-hash line when the tx is not confirmed in 60 s", async () => {
    const wallet = makeWallet({ waitPlan: ["timeout"] });
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

  it("exits 4 and writes no receipt when the tx reverted", async () => {
    const wallet = makeWallet({ receipt: { status: "reverted", blockNumber: 68990001n } });
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
    const wallet = makeWallet();
    const first = await run({ wallet, mida: makeMida({ rememberError }), projectDir: dir });
    expect(first.result.exitCode).toBe(5);

    const secondMida = makeMida();
    const second = await run({ wallet, mida: secondMida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    // the re-run broadcast exactly the journaled bytes — the node sees the same transaction
    expect(wallet.sendRaws).toHaveLength(2);
    expect(wallet.sendRaws[1]).toBe(wallet.sendRaws[0]);
    expect(second.lines.some((line) => line.startsWith("recovered:"))).toBe(true);
    expect(secondMida.rememberCalls).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, ".trustlayer-journal.json"))).toBe(false);
  });

  it("wait timeout then re-run: same bytes re-sent, one transfer total", async () => {
    const dir = tmpDir();
    const wallet = makeWallet({ waitPlan: ["timeout", "ok"] });
    const mida = makeMida();
    const first = await run({ wallet, mida, projectDir: dir });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(first.result.exitCode).toBe(4);
    expect(first.lines.at(-1)).toContain(txHash);
    expect(first.lines.at(-1)).not.toContain("before running again");

    const second = await run({ wallet, mida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    expect(wallet.sendRaws).toHaveLength(2);
    expect(wallet.sendRaws[1]).toBe(wallet.sendRaws[0]);
    expect(mida.rememberCalls).toHaveLength(1);
    expect(second.lines.some((line) => line.startsWith("recovered:"))).toBe(true);
  });

  it("send error after the node may have accepted: no 'Nothing was sent', re-run re-sends the same bytes", async () => {
    const dir = tmpDir();
    const wallet = makeWallet({ sendPlan: ["throw-after-accept", "ok"], waitPlan: ["timeout", "ok"] });
    const mida = makeMida();
    const first = await run({ wallet, mida, projectDir: dir });
    const txHash = keccak256(wallet.sendRaws[0]);
    expect(first.result.exitCode).toBe(4);
    for (const line of first.lines) expect(line).not.toContain("Nothing was sent");
    expect(first.lines.at(-1)).toContain(txHash);
    expect(first.lines.at(-1)).toContain("cannot pay twice");

    const second = await run({ wallet, mida, projectDir: dir });
    expect(second.result.exitCode).toBe(0);
    expect(wallet.sendRaws).toHaveLength(2);
    expect(wallet.sendRaws[1]).toBe(wallet.sendRaws[0]);
    expect(mida.rememberCalls).toHaveLength(1);
  });

  it("a second run on the same folder exits 1 while the first is in flight", async () => {
    const dir = tmpDir();
    const linesA = [];
    const linesB = [];
    const wallet = makeWallet();
    const [a, b] = await Promise.all([
      runAgent({ config: config({ projectDir: dir }), chain: makeChain(), wallet, mida: makeMida(), log: (l) => linesA.push(l) }),
      runAgent({ config: config({ projectDir: dir }), chain: makeChain(), wallet, mida: makeMida(), log: (l) => linesB.push(l) }),
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
    const wallet = makeWallet({ sendPlan: ["throw", "throw"], waitPlan: ["timeout", "timeout"] });
    const first = await run({ wallet, mida: makeMida(), chain: makeChain({ pendingNonce: 7n, latestNonce: 7n }), projectDir: dir });
    expect(first.result.exitCode).toBe(4);
    // meanwhile the wallet spent nonce 7 elsewhere — the journaled tx can never land
    const second = await run({ wallet, mida: makeMida(), chain: makeChain({ pendingNonce: 8n, latestNonce: 8n }), projectDir: dir });
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
