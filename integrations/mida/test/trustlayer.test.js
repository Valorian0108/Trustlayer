import { describe, expect, it } from "vitest";
import { getAbiItem, toFunctionSelector } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { autoCapMon, ChainError, readDelegation, REGISTRY_ABI } from "../src/trustlayer.js";

const REGISTRY = "0x088bc310c841fA5ed5b28F37050c3B419572b70d";
const RPC_URL = "https://testnet-rpc.monad.xyz";
const OWNER = privateKeyToAccount(generatePrivateKey()).address;
const AGENT = privateKeyToAccount(generatePrivateKey()).address;

function fakeChain(steps) {
  const calls = [];
  return {
    calls,
    async readContract(input) {
      calls.push(input);
      const step = steps[calls.length - 1];
      if (step instanceof Error) throw step;
      return step;
    },
  };
}

function validChain({ id = 29n, tier = 1, expiresAt = 1791345514n } = {}) {
  return fakeChain([
    [true, id, tier],
    { owner: OWNER, agent: AGENT, tier, createdAt: 1n, expiresAt, active: true, revoked: false },
  ]);
}

describe("REGISTRY_ABI", () => {
  it("pins checkAgentDelegation and getDelegation to the contract's selectors", () => {
    expect(toFunctionSelector(getAbiItem({ abi: REGISTRY_ABI, name: "checkAgentDelegation" }))).toBe("0x2a4d616a");
    expect(toFunctionSelector(getAbiItem({ abi: REGISTRY_ABI, name: "getDelegation" }))).toBe("0x0dd35701");
  });
});

describe("readDelegation", () => {
  it("returns the decoded delegation and passes (owner, agent) in that order", async () => {
    const chain = validChain();
    const result = await readDelegation(chain, { registry: REGISTRY, owner: OWNER, agent: AGENT, rpcUrl: RPC_URL });
    expect(result).toEqual({
      valid: true,
      owner: OWNER,
      agent: AGENT,
      id: "29",
      tier: 1,
      tierName: "Routine",
      tierLabel: "Routine ($50)",
      expiresAt: new Date(1791345514 * 1000).toISOString(),
    });
    expect(chain.calls).toHaveLength(2);
    expect(chain.calls[0].functionName).toBe("checkAgentDelegation");
    expect(chain.calls[0].args).toEqual([OWNER, AGENT]);
    expect(chain.calls[0].address).toBe(REGISTRY);
    expect(chain.calls[1].functionName).toBe("getDelegation");
    expect(chain.calls[1].args).toEqual([29n]);
  });

  it("returns { valid: false } without a second read when there is no delegation", async () => {
    const chain = fakeChain([[false, 0n, 0]]);
    const result = await readDelegation(chain, { registry: REGISTRY, owner: OWNER, agent: AGENT, rpcUrl: RPC_URL });
    expect(result.valid).toBe(false);
    expect(result.owner).toBe(OWNER);
    expect(result.agent).toBe(AGENT);
    expect(chain.calls).toHaveLength(1);
  });

  it("maps expiresAt 0 to null (no expiry)", async () => {
    const chain = validChain({ expiresAt: 0n });
    const result = await readDelegation(chain, { registry: REGISTRY, owner: OWNER, agent: AGENT, rpcUrl: RPC_URL });
    expect(result.expiresAt).toBeNull();
  });

  it("maps a huge expiresAt — the max-uint 'never' — to null instead of crashing", async () => {
    const chain = validChain({ expiresAt: 2n ** 256n - 1n });
    const result = await readDelegation(chain, { registry: REGISTRY, owner: OWNER, agent: AGENT, rpcUrl: RPC_URL });
    expect(result.expiresAt).toBeNull();
  });

  it("names tier 0 Basic with the app's Micro label", async () => {
    const chain = validChain({ tier: 0 });
    const result = await readDelegation(chain, { registry: REGISTRY, owner: OWNER, agent: AGENT, rpcUrl: RPC_URL });
    expect(result.tierName).toBe("Basic");
    expect(result.tierLabel).toBe("Basic (Micro, $5)");
  });

  it("names tier 2 Elevated", async () => {
    const chain = validChain({ tier: 2 });
    const result = await readDelegation(chain, { registry: REGISTRY, owner: OWNER, agent: AGENT, rpcUrl: RPC_URL });
    expect(result.tierName).toBe("Elevated");
    expect(result.tierLabel).toBe("Elevated ($500)");
  });

  it("throws ChainError naming class only when a read fails", async () => {
    const chain = fakeChain([new Error("RPC response body with sensitive payload")]);
    const error = await readDelegation(chain, {
      registry: REGISTRY,
      owner: OWNER,
      agent: AGENT,
      rpcUrl: RPC_URL,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ChainError);
    expect(error.exitCode).toBe(4);
    expect(error.message.startsWith("chain: could not read the DelegationRegistry at 0x088b…b70d over testnet-rpc.monad.xyz (")).toBe(true);
    expect(error.message).not.toContain("sensitive payload");
  });
});

describe("autoCapMon", () => {
  it("returns the cap per tier", () => {
    expect(autoCapMon(0)).toBe("5");
    expect(autoCapMon(1)).toBe("50");
    expect(autoCapMon(2)).toBe("50");
  });

  it("throws on a tier outside 0-2", () => {
    expect(() => autoCapMon(3)).toThrow();
    expect(() => autoCapMon(-1)).toThrow();
  });
});
