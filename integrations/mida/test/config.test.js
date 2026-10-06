import path from "node:path";
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { ConfigError, loadConfig } from "../src/config.js";

const REGISTRY = "0x088bc310c841fA5ed5b28F37050c3B419572b70d";

function validEnv() {
  return {
    AGENT_PRIVATE_KEY: generatePrivateKey(),
    TRUSTLAYER_OWNER: "0x1234567890abcdef1234567890abcdef12345678",
    MIDA_HOME: "/tmp/mida-test-home",
  };
}

function capture(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("loadConfig", () => {
  it("throws ConfigError naming the missing AGENT_PRIVATE_KEY", () => {
    const env = validEnv();
    delete env.AGENT_PRIVATE_KEY;
    const error = capture(() => loadConfig(env));
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe(
      "config: AGENT_PRIVATE_KEY is missing or invalid (0x followed by 64 hex characters). Nothing was sent."
    );
  });

  it("rejects a short private key without echoing its value", () => {
    const env = { ...validEnv(), AGENT_PRIVATE_KEY: "0x1234" };
    const error = capture(() => loadConfig(env));
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toBe(
      "config: AGENT_PRIVATE_KEY is missing or invalid (0x followed by 64 hex characters). Nothing was sent."
    );
    expect(error.message).not.toContain("1234");
  });

  it("rejects a TRUSTLAYER_OWNER that is not an address", () => {
    const env = { ...validEnv(), TRUSTLAYER_OWNER: "hello" };
    const error = capture(() => loadConfig(env));
    expect(error.message).toBe(
      "config: TRUSTLAYER_OWNER is missing or invalid (a 0x address). Nothing was sent."
    );
  });

  it("rejects a relative MIDA_HOME", () => {
    const env = { ...validEnv(), MIDA_HOME: "relative/path" };
    const error = capture(() => loadConfig(env));
    expect(error.message).toBe(
      "config: MIDA_HOME is missing or invalid (an absolute path). Nothing was sent."
    );
  });

  it("rejects a relative MIDA_PROJECT when one is set", () => {
    const env = { ...validEnv(), MIDA_PROJECT: "relative/path" };
    const error = capture(() => loadConfig(env));
    expect(error.message).toBe(
      "config: MIDA_PROJECT is missing or invalid (an absolute path). Nothing was sent."
    );
  });

  it("returns the config with defaults for a full valid env", () => {
    const env = validEnv();
    const config = loadConfig(env);
    expect(config.agentPrivateKey).toBe(env.AGENT_PRIVATE_KEY);
    expect(config.agentAddress).toBe(privateKeyToAccount(env.AGENT_PRIVATE_KEY).address);
    expect(config.trustlayerOwner).toBe(getAddress(env.TRUSTLAYER_OWNER));
    expect(config.midaHome).toBe(env.MIDA_HOME);
    expect(config.midaAgent).toBe("trustlayer-agent");
    expect(config.projectDir).toBe(path.resolve(import.meta.dirname, ".."));
    expect(config.rpcUrl).toBe("https://testnet-rpc.monad.xyz");
    expect(config.registry).toBe(REGISTRY);
  });

  it("treats empty optional values as unset", () => {
    const env = { ...validEnv(), MIDA_AGENT: "", MONAD_RPC_URL: "", MIDA_PROJECT: "", DELEGATION_REGISTRY: "" };
    const config = loadConfig(env);
    expect(config.midaAgent).toBe("trustlayer-agent");
    expect(config.rpcUrl).toBe("https://testnet-rpc.monad.xyz");
    expect(config.projectDir).toBe(path.resolve(import.meta.dirname, ".."));
    expect(config.registry).toBe(REGISTRY);
  });

  it("rejects an agent name that is not the mida format", () => {
    const env = { ...validEnv(), MIDA_AGENT: "Bad_Name" };
    const error = capture(() => loadConfig(env));
    expect(error.message).toBe(
      "config: MIDA_AGENT is missing or invalid (1–40 lowercase letters, digits or dashes). Nothing was sent."
    );
  });

  it("keeps the private key out of JSON.stringify and String(config)", () => {
    const env = validEnv();
    const config = loadConfig(env);
    expect(Object.keys(config)).not.toContain("agentPrivateKey");
    expect(JSON.stringify(config)).not.toContain("agentPrivateKey");
    expect(JSON.stringify(config)).not.toContain(env.AGENT_PRIVATE_KEY);
    expect(String(config)).not.toContain(env.AGENT_PRIVATE_KEY);
  });
});
