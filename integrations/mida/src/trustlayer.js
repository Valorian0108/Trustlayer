import { createPublicClient, http, parseAbi } from "viem";
import { monadTestnet } from "viem/chains";

export class ChainError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ChainError";
    this.exitCode = 4;
  }
}

export const REGISTRY_ABI = parseAbi([
  "function checkAgentDelegation(address owner, address agent) view returns (bool hasValidDelegation, uint256 delegationId, uint8 tier)",
  "function getDelegation(uint256 delegationId) view returns ((address owner, address agent, uint8 tier, uint256 createdAt, uint256 expiresAt, bool active, bool revoked))",
]);

const TIERS = [
  { name: "Basic", label: "Basic (Micro, $5)", cap: "5" },
  { name: "Routine", label: "Routine ($50)", cap: "50" },
  { name: "Elevated", label: "Elevated ($500)", cap: "50" },
];

export function tierInfo(tier) {
  const info = TIERS[tier];
  if (!info) throw new Error(`unknown tier ${tier}`);
  return info;
}

export function autoCapMon(tier) {
  return tierInfo(tier).cap;
}

export function shortAddr(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function createChain(config) {
  return createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl) });
}

export function rpcHost(rpcUrl) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return rpcUrl;
  }
}

export function errorClass(error) {
  return error instanceof Error ? error.name : "Error";
}

export async function readDelegation(chain, { registry, owner, agent, rpcUrl }) {
  let id;
  let delegation;
  try {
    const [hasValidDelegation, delegationId] = await chain.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "checkAgentDelegation",
      args: [owner, agent],
    });
    if (!hasValidDelegation) return { valid: false, owner, agent };
    id = delegationId;
    delegation = await chain.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "getDelegation",
      args: [delegationId],
    });
  } catch (error) {
    throw new ChainError(
      `chain: could not read the DelegationRegistry at ${shortAddr(registry)} over ${rpcHost(rpcUrl)} (${errorClass(error)}). Nothing was sent.`,
      { cause: error }
    );
  }
  const tier = Number(delegation.tier);
  const { name, label } = tierInfo(tier);
  // A unix timestamp beyond ~8.64e12 seconds overflows Date — treat it like
  // the max-uint sentinel the registry uses for "never"
  const expiresAt =
    delegation.expiresAt === 0n || delegation.expiresAt > 8_640_000_000_000n
      ? null
      : new Date(Number(delegation.expiresAt) * 1000).toISOString();
  return {
    valid: true,
    owner,
    agent,
    id: id.toString(),
    tier,
    tierName: name,
    tierLabel: label,
    expiresAt,
  };
}
