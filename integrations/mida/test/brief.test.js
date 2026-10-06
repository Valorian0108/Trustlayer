import { describe, expect, it } from "vitest";
import { getAddress, parseEther } from "viem";
import { BriefError, pickBrief, validateBrief } from "../src/brief.js";

const TO = "0x5555555555555555555555555555555555557777";

function item(id, text) {
  return { id, namespace: "preferences.communication", kind: "PREFERENCE", content: { text, assertedAt: "2026-10-09T08:50:12Z" } };
}

describe("pickBrief", () => {
  it("returns the newest item whose text parses as trustlayer JSON", () => {
    const first = item("0xnonfact", "remember to water plants");
    const briefA = item("0xbriefA", `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"0.01","memo":"a"}`);
    const briefB = item("0xbriefB", `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"0.02","memo":"b"}`);
    const result = pickBrief([first, briefA, briefB]);
    expect(result.id).toBe("0xbriefA");
    expect(result.amountMon).toBe("0.01");
  });

  it("skips non-JSON text and JSON without trustlayer: 1", () => {
    const items = [
      item("0xa", "plain words"),
      item("0xb", '{"trustlayer":2,"action":"transfer"}'),
      item("0xc", '{"other":true}'),
      item("0xd", "12345"),
    ];
    expect(pickBrief(items)).toBeNull();
  });

  it("returns null on an empty list and tolerates odd content shapes", () => {
    expect(pickBrief([])).toBeNull();
    expect(pickBrief([{ id: "0xs", content: "a raw string" }, { id: "0xn", content: {} }])).toBeNull();
  });
});

describe("validateBrief", () => {
  const good = { id: "0xd9d35dc2", trustlayer: 1, action: "transfer", to: TO, amountMon: "0.01", memo: "TrustLayer x Mida demo" };

  it("returns the validated action fields", () => {
    expect(validateBrief(good)).toEqual({
      to: getAddress(TO),
      amountMon: "0.01",
      amountWei: parseEther("0.01"),
      memo: "TrustLayer x Mida demo",
    });
  });

  it("refuses an action that is not transfer", () => {
    const error = captureBrief({ ...good, action: "swap" });
    expect(error.message).toBe('brief 0xd9d35dc2…: action is invalid (only "transfer" is supported). Nothing was sent.');
  });

  it("refuses a to that is not an address", () => {
    const error = captureBrief({ ...good, to: "hello" });
    expect(error.message).toBe("brief 0xd9d35dc2…: to is invalid (a 0x address). Nothing was sent.");
  });

  it.each(["0", "-1", "abc", "1e3"])('refuses amountMon %s', (amountMon) => {
    const error = captureBrief({ ...good, amountMon });
    expect(error.message).toBe('brief 0xd9d35dc2…: amountMon is invalid (a positive decimal number of MON, e.g. "0.01"). Nothing was sent.');
  });

  it("refuses a memo over 200 characters", () => {
    const error = captureBrief({ ...good, memo: "x".repeat(201) });
    expect(error.message).toBe("brief 0xd9d35dc2…: memo is invalid (a string of at most 200 characters). Nothing was sent.");
  });

  it("accepts a missing memo", () => {
    const brief = { ...good };
    delete brief.memo;
    const result = validateBrief(brief);
    expect(result.memo).toBeUndefined();
  });
});

function captureBrief(brief) {
  try {
    validateBrief(brief);
  } catch (error) {
    expect(error).toBeInstanceOf(BriefError);
    expect(error.exitCode).toBe(2);
    return error;
  }
  throw new Error("expected validateBrief to throw");
}
