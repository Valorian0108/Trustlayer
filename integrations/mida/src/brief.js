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

// Mida marks a fact written by the owner with the 32-byte zero author id and
// source USER_ASSERTED (apps/midad/src/remember.ts). Anything else that merely
// looks like a brief is not one.
export const OWNER_AUTHOR_ID = "0x" + "0".repeat(64);

function isOwnerWritten(item) {
  return item?.author?.id === OWNER_AUTHOR_ID && item?.source === "USER_ASSERTED";
}

// The candidate is the newest owner-written record whose text mentions
// "trustlayer" in any case — chosen without parsing, so a malformed brief the
// owner meant to write still wins over older valid ones and is refused instead
// of skipped.
export function pickBrief(items) {
  for (const item of items) {
    if (!isOwnerWritten(item)) continue;
    const text = item?.content?.text;
    if (typeof text === "string" && /trustlayer/i.test(text)) return item;
  }
  return null;
}

export function parseBrief(item) {
  let parsed;
  try {
    parsed = JSON.parse(item.content.text);
  } catch {
    throw new BriefError(`brief ${shortId(item.id)}: the text is not valid JSON. Nothing was sent.`);
  }
  if (!parsed || typeof parsed !== "object" || parsed.trustlayer !== 1) {
    throw invalidBrief(item.id, "trustlayer", "the marker must be the number 1");
  }
  const brief = {
    // id, author and assertedAt come from the chain record; only the
    // allow-listed fields are taken from the owner-written text
    id: item.id,
    author: item.author ?? null,
    assertedAt: item.content?.assertedAt ?? item.writtenAt ?? null,
    action: parsed.action,
    to: parsed.to,
    amountMon: parsed.amountMon,
    memo: parsed.memo,
  };
  return { id: brief.id, author: brief.author, assertedAt: brief.assertedAt, ...validateBrief(brief) };
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
  // viem truncates fractions past 18 decimals instead of refusing — a brief
  // that asks for 1.0000000000000000001 would silently send 1
  const fraction = brief.amountMon.split(".")[1];
  if (fraction !== undefined && fraction.length > 18) {
    throw invalidBrief(brief.id, "amountMon", "at most 18 decimal places");
  }
  if (amountWei <= 0n) {
    throw invalidBrief(brief.id, "amountMon", INVALID_AMOUNT);
  }
  if (brief.memo !== undefined && (typeof brief.memo !== "string" || brief.memo.length > 200)) {
    throw invalidBrief(brief.id, "memo", "a string of at most 200 characters");
  }
  return { to: getAddress(brief.to), amountMon: brief.amountMon, amountWei, memo: brief.memo };
}
