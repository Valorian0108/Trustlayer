import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
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

function makeChain({ delegation = [true, 29n, 1], details, balanceWei = parseEther("1"), gasPriceWei = 1_000_000_000n } = {}) {
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
  let fi = 0;
  let ri = 0;
  return {
    contextCalls,
    rememberCalls,
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

function makeWallet({ hash = TX_HASH, receipt = { status: "success", blockNumber: 68990001n }, sendError, waitError } = {}) {
  const sends = [];
  const waits = [];
  return {
    sends,
    waits,
    async sendTransaction(input) {
      sends.push(input);
      if (sendError) throw sendError;
      return hash;
    },
    async waitForTransactionReceipt(input) {
      waits.push(input);
      if (waitError) throw waitError;
      return receipt;
    },
  };
}

async function run({ chain = makeChain(), mida = makeMida(), wallet = makeWallet(), now = () => new Date(NOW_ISO), dryRun = false } = {}) {
  const lines = [];
  const result = await runAgent({ config: config(), chain, wallet, mida, log: (line) => lines.push(line), now, dryRun });
  for (const line of lines) expect(line).not.toContain(AGENT_KEY);
  return { result, lines };
}

describe("runAgent", () => {
  it("happy path: prints the five lines, sends, writes the receipt, exits 0", async () => {
    const chain = makeChain();
    const mida = makeMida();
    const wallet = makeWallet();
    const { result, lines } = await run({ chain, mida, wallet });
    expect(lines).toEqual([
      `trustlayer: delegation #29 from 0x1234…abcd to ${SHORT_AGENT} — tier Routine ($50), expires ${EXPIRES_ISO}`,
      `mida: trustlayer-agent approved; brief 0xd9d35dc2… (owner, ${ASSERTED}): transfer 0.01 MON to 0x5555…7777`,
      "decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.",
      `sent: 0.01 MON to 0x5555…7777 — tx ${TX_HASH} (block 68,990,001)`,
      "recorded: Mida receipt 0xf7d4bf13… (anchored) in projects.current, author trustlayer-agent",
    ]);
    expect(result.exitCode).toBe(0);
    expect(wallet.sends).toEqual([{ to: TO, value: 10_000_000_000_000_000n }]);
    expect(wallet.waits).toEqual([{ hash: TX_HASH }]);
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
      tx: { hash: TX_HASH, block: "68990001", status: "success", from: AGENT_ADDR, chainId: 10143 },
      at: NOW_ISO,
    });
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
    expect(wallet.sends).toHaveLength(0);
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
      expect(wallet.sends).toHaveLength(0);
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
    expect(wallet.sends).toHaveLength(0);
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
    expect(wallet.sends).toHaveLength(0);
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
    expect(wallet.sends).toHaveLength(0);
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
    expect(wallet.sends).toHaveLength(0);
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
    expect(wallet.sends).toHaveLength(0);
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
    expect(wallet.sends).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("reports already-done and sends nothing when a receipt names the brief", async () => {
    const mida = makeMida({ receiptPages: [{ items: [receiptItem("0xreceipt9", BRIEF_ID)], cursor: null }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(0);
    expect(lines.at(-1)).toBe(`already done: receipt 0xreceipt9… for brief 0xd9d35dc2… exists (tx ${TX_HASH}). Nothing was sent.`);
    expect(wallet.sends).toHaveLength(0);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("does not suppress the transfer when a receipt for the brief was written by another author", async () => {
    // someone else's record claims this brief was paid with tx 0xnotmine — it must not count
    const foreign = receiptItem("0xforeign", BRIEF_ID, "0xnotmine", { author: { name: "some-other-agent", id: "0x" + "ef".repeat(32) } });
    const mida = makeMida({ receiptPages: [{ items: [foreign], cursor: null }] });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(0);
    expect(wallet.sends).toEqual([{ to: TO, value: 10_000_000_000_000_000n }]);
    expect(lines.some((line) => line.includes("0xnotmine"))).toBe(false);
    expect(mida.rememberCalls).toHaveLength(1);
  });

  it("exits 4 and writes no receipt when the tx is not confirmed in 60 s", async () => {
    const waitError = Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });
    const wallet = makeWallet({ waitError });
    const mida = makeMida();
    const { result, lines } = await run({ wallet, mida });
    expect(result.exitCode).toBe(4);
    expect(lines.at(-1)).toBe(
      `chain: tx ${TX_HASH} was not confirmed within 60 s. Check it on https://testnet.monadscan.com/tx/${TX_HASH} before running again; no Mida receipt was written.`
    );
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("exits 4 and writes no receipt when the tx reverted", async () => {
    const wallet = makeWallet({ receipt: { status: "reverted", blockNumber: 68990001n } });
    const mida = makeMida();
    const { result, lines } = await run({ wallet, mida });
    expect(result.exitCode).toBe(4);
    expect(lines.at(-1)).toBe(`chain: tx ${TX_HASH} reverted. No Mida receipt was written.`);
    expect(mida.rememberCalls).toHaveLength(0);
  });

  it("exits 5 when the receipt write is refused after a successful send", async () => {
    const rememberError = new MidaSdkError("rate-limited", "one write per minute on this lane", { lane: "direct" });
    const mida = makeMida({ rememberError });
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet });
    expect(result.exitCode).toBe(5);
    expect(result.txHash).toBe(TX_HASH);
    expect(lines.at(-1)).toBe(
      `mida: the transfer happened (tx ${TX_HASH}) but the receipt was refused (rate-limited) — one write per minute on this lane. The already-done guard cannot see this transfer: do not re-run with the same brief.`
    );
  });

  it("dry run stops after the decision line", async () => {
    const mida = makeMida();
    const wallet = makeWallet();
    const { result, lines } = await run({ mida, wallet, dryRun: true });
    expect(result.exitCode).toBe(0);
    expect(lines.at(-2)).toBe("decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.");
    expect(lines.at(-1)).toBe("dry run: nothing sent, nothing written.");
    expect(wallet.sends).toHaveLength(0);
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
    expect(wallet.sends).toHaveLength(0);
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
