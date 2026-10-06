import { getAddress, isAddress, parseEther } from "viem";

export class BriefError extends Error {
  constructor(message) {
    super(message);
    this.name = "BriefError";
    this.exitCode = 2;
  }
}

export function shortId(id) {
  return `${id.slice(0, 10)}…`;
}

export function pickBrief(items) {
  for (const item of items) {
    const text = item?.content?.text;
    if (typeof text !== "string") continue;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (parsed && parsed.trustlayer === 1) {
      return { id: item.id, author: item.author ?? null, assertedAt: item.content?.assertedAt ?? item.writtenAt ?? null, ...parsed };
    }
  }
  return null;
}

function invalidBrief(id, field, why) {
  return new BriefError(`brief ${shortId(id)}: ${field} is invalid (${why}). Nothing was sent.`);
}

const INVALID_AMOUNT = 'a positive decimal number of MON, e.g. "0.01"';

export function validateBrief(brief) {
  if (brief.action !== "transfer") {
    throw invalidBrief(brief.id, "action", 'only "transfer" is supported');
  }
  if (typeof brief.to !== "string" || !isAddress(brief.to)) {
    throw invalidBrief(brief.id, "to", "a 0x address");
  }
  let amountWei;
  try {
    if (typeof brief.amountMon !== "string") throw new Error("amountMon must be a string");
    amountWei = parseEther(brief.amountMon);
  } catch {
    throw invalidBrief(brief.id, "amountMon", INVALID_AMOUNT);
  }
  if (amountWei <= 0n) {
    throw invalidBrief(brief.id, "amountMon", INVALID_AMOUNT);
  }
  if (brief.memo !== undefined && (typeof brief.memo !== "string" || brief.memo.length > 200)) {
    throw invalidBrief(brief.id, "memo", "a string of at most 200 characters");
  }
  return { to: getAddress(brief.to), amountMon: brief.amountMon, amountWei, memo: brief.memo };
}
