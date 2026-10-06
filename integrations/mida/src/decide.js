import { formatEther, parseEther } from "viem";
import { autoCapMon, shortAddr, tierInfo } from "./trustlayer.js";
import { OWNER_AUTHOR_ID, shortId } from "./brief.js";

const TRANSFER_GAS_LIMIT = 21000n;

// A receipt counts only if the chain says this agent wrote it: source
// AGENT_INFERRED, a non-zero author id, and this agent's name. The SDK's public
// facade exposes the agent's name but not its author id, so the name is the
// identity compared here.
export function ownReceiptFor(receipts, briefId, agentName) {
  return receipts.find(
    (item) =>
      item?.content?.trustlayerReceipt === 1 &&
      item?.content?.briefRecordId === briefId &&
      item?.source === "AGENT_INFERRED" &&
      item?.author?.id !== undefined &&
      item?.author?.id !== OWNER_AUTHOR_ID &&
      item?.author?.name === agentName
  );
}

export function noDelegationLine({ owner, agent }) {
  return `trustlayer: no valid delegation from ${shortAddr(owner)} to ${shortAddr(agent)} on the DelegationRegistry (revoked, expired or never created). Nothing was sent.`;
}

export function alreadyDoneLine(receipt, briefId) {
  return `already done: receipt ${shortId(receipt.id)} for brief ${shortId(briefId)} exists (tx ${receipt.content.tx?.hash}). Nothing was sent.`;
}

export function decide({ delegation, brief, receipts, balanceWei, maxFeeWei, agentName }) {
  if (!delegation.valid) {
    return {
      kind: "refuse",
      code: "no-delegation",
      line: noDelegationLine(delegation),
    };
  }

  const receipt = ownReceiptFor(receipts, brief.id, agentName);
  if (receipt) {
    return {
      kind: "already-done",
      receipt,
      line: alreadyDoneLine(receipt, brief.id),
    };
  }

  const { name: tierName, cap: capMon } = tierInfo(delegation.tier);
  if (brief.amountWei > parseEther(capMon)) {
    return {
      kind: "refuse",
      code: "above-cap",
      line: `trustlayer: ${brief.amountMon} MON is above the ${tierName} tier's auto-execute cap (${capMon} MON). This agent does not act above the cap. Nothing was sent.`,
    };
  }

  if (balanceWei < brief.amountWei + TRANSFER_GAS_LIMIT * maxFeeWei) {
    return {
      kind: "refuse",
      code: "insufficient-funds",
      line: `wallet: ${shortAddr(delegation.agent)} holds ${formatEther(balanceWei)} MON; the brief needs ${brief.amountMon} MON plus gas. Nothing was sent.`,
    };
  }

  return {
    kind: "act",
    line: `decision: ${brief.amountMon} MON is within the ${tierName} auto-execute cap (${capMon} MON). Sending.`,
  };
}
