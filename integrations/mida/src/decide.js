import { formatEther, parseEther } from "viem";
import { autoCapMon, shortAddr, tierInfo } from "./trustlayer.js";
import { shortId } from "./brief.js";

const TRANSFER_GAS_LIMIT = 21000n;

export function decide({ delegation, brief, receipts, balanceWei, gasPriceWei }) {
  if (!delegation.valid) {
    return {
      kind: "refuse",
      code: "no-delegation",
      line: `trustlayer: no valid delegation from ${shortAddr(delegation.owner)} to ${shortAddr(delegation.agent)} on the DelegationRegistry (revoked, expired or never created). Nothing was sent.`,
    };
  }

  const receipt = receipts.find(
    (item) => item?.content?.trustlayerReceipt === 1 && item?.content?.briefRecordId === brief.id
  );
  if (receipt) {
    return {
      kind: "already-done",
      receipt,
      line: `already done: receipt ${shortId(receipt.id)} for brief ${shortId(brief.id)} exists (tx ${receipt.content.tx?.hash}). Nothing was sent.`,
    };
  }

  const { name: tierName, cap: capMon } = tierInfo(delegation.tier);
  if (brief.amountWei > parseEther(capMon)) {
    return {
      kind: "refuse",
      code: "above-cap",
      line: `trustlayer: ${brief.amountMon} MON is above the ${tierName} auto-execute cap (${capMon} MON). TrustLayer's stronger-verification step is not part of this integration. Nothing was sent.`,
    };
  }

  if (balanceWei < brief.amountWei + TRANSFER_GAS_LIMIT * gasPriceWei) {
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
