import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { decide } from "../src/decide.js";

const OWNER = "0x1234567890abcdef1234567890abcdef1234abcd";
const AGENT = "0x9876543210fedcba9876543210fedcba9876ef01";

function delegation(tier = 1) {
  return { valid: true, owner: OWNER, agent: AGENT, id: "29", tier, tierName: ["Basic", "Routine", "Elevated"][tier], tierLabel: "", expiresAt: null };
}

function brief(amountMon = "0.01") {
  return { id: "0xd9d35dc2", to: "0x5555555555555555555555555555555555557777", amountMon, amountWei: parseEther(amountMon), memo: "m" };
}

const RICH = parseEther("1");
const GAS = 1_000_000_000n; // 1 gwei
const AGENT_NAME = "trustlayer-agent";
const AGENT_AUTHOR_ID = "0x" + "ab".repeat(32);

// the shape the SDK actually returns for a record this agent wrote
function receiptFor(briefId, hash = "0xtxhash0001", overrides = {}) {
  return {
    id: "0xreceipt9",
    namespace: "projects.current",
    kind: "EPISODE",
    content: { trustlayerReceipt: 1, briefRecordId: briefId, tx: { hash } },
    author: { name: AGENT_NAME, id: AGENT_AUTHOR_ID },
    source: "AGENT_INFERRED",
    writtenAt: "2026-10-09T08:55:31.000Z",
    state: "anchored",
    ...overrides,
  };
}

describe("decide", () => {
  it("refuses with the R1 line when no valid delegation exists", () => {
    const result = decide({
      delegation: { valid: false, owner: OWNER, agent: AGENT },
      brief: brief(),
      receipts: [],
      balanceWei: RICH,
      maxFeeWei: GAS, agentName: AGENT_NAME,
    });
    expect(result).toEqual({
      kind: "refuse",
      code: "no-delegation",
      line: "trustlayer: no valid delegation from 0x1234…abcd to 0x9876…ef01 on the DelegationRegistry (revoked, expired or never created). Nothing was sent.",
    });
  });

  it("reports already-done when a receipt names this brief id", () => {
    const b = brief();
    const receipt = receiptFor(b.id);
    const result = decide({ delegation: delegation(), brief: b, receipts: [receipt], balanceWei: RICH, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result.kind).toBe("already-done");
    expect(result.receipt).toBe(receipt);
    expect(result.line).toBe("already done: receipt 0xreceipt9… for brief 0xd9d35dc2… exists (tx 0xtxhash0001). Nothing was sent.");
  });

  it("does not match a receipt written for a different brief", () => {
    const result = decide({
      delegation: delegation(),
      brief: brief(),
      receipts: [receiptFor("0xotherbrief")],
      balanceWei: RICH,
      maxFeeWei: GAS, agentName: AGENT_NAME,
    });
    expect(result.kind).toBe("act");
  });

  it("does not match a receipt written under another agent's name", () => {
    const b = brief();
    const foreign = receiptFor(b.id, "0xnotmine", { author: { name: "some-other-agent", id: "0x" + "cd".repeat(32) } });
    const result = decide({ delegation: delegation(), brief: b, receipts: [foreign], balanceWei: RICH, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result.kind).toBe("act");
  });

  it("does not match a receipt-shaped record the owner wrote", () => {
    const b = brief();
    const ownerRecord = receiptFor(b.id, "0xownerish", {
      author: { name: null, id: "0x" + "0".repeat(64) },
      source: "USER_ASSERTED",
    });
    const result = decide({ delegation: delegation(), brief: b, receipts: [ownerRecord], balanceWei: RICH, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result.kind).toBe("act");
  });

  it("does not match an agent record whose source is not AGENT_INFERRED", () => {
    const b = brief();
    const wrongSource = receiptFor(b.id, "0xws", { source: "USER_ASSERTED" });
    const result = decide({ delegation: delegation(), brief: b, receipts: [wrongSource], balanceWei: RICH, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result.kind).toBe("act");
  });

  it("refuses one wei above the Routine cap", () => {
    const result = decide({
      delegation: delegation(1),
      brief: brief("50.000000000000000001"),
      receipts: [],
      balanceWei: RICH,
      maxFeeWei: GAS, agentName: AGENT_NAME,
    });
    expect(result).toEqual({
      kind: "refuse",
      code: "above-cap",
      line: "trustlayer: 50.000000000000000001 MON is above the Routine tier's auto-execute cap (50 MON). This agent does not act above the cap. Nothing was sent.",
    });
  });

  it("allows exactly the cap", () => {
    const result = decide({ delegation: delegation(1), brief: brief("50"), receipts: [], balanceWei: parseEther("100"), maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result.kind).toBe("act");
  });

  it("refuses 5.5 MON on Basic (cap 5)", () => {
    const result = decide({ delegation: delegation(0), brief: brief("5.5"), receipts: [], balanceWei: RICH, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result.code).toBe("above-cap");
    expect(result.line).toContain("Basic tier's auto-execute cap (5 MON)");
  });

  it("refuses 60 MON on Elevated — the cap is this agent's limit, not a verification step", () => {
    const result = decide({ delegation: delegation(2), brief: brief("60"), receipts: [], balanceWei: RICH, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result.code).toBe("above-cap");
    expect(result.line).toContain("Elevated tier's auto-execute cap (50 MON)");
    // TrustLayer blocks over-cap Basic/Routine actions in its app — the line must
    // not imply a stronger-verification step exists for this agent to skip
    expect(result.line).not.toContain("stronger-verification");
  });

  it("refuses when the balance cannot cover amount plus 21000 max fee", () => {
    const balanceWei = parseEther("0.01") + 21000n * GAS - 1n;
    const result = decide({ delegation: delegation(), brief: brief("0.01"), receipts: [], balanceWei, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result).toEqual({
      kind: "refuse",
      code: "insufficient-funds",
      line: `wallet: 0x9876…ef01 holds 0.010020999999999999 MON; the brief needs 0.01 MON plus gas. Nothing was sent.`,
    });
  });

  it("decides to act on the happy path", () => {
    const result = decide({ delegation: delegation(), brief: brief("0.01"), receipts: [], balanceWei: RICH, maxFeeWei: GAS, agentName: AGENT_NAME });
    expect(result).toEqual({
      kind: "act",
      line: "decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.",
    });
  });
});
