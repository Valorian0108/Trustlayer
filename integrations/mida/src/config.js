import path from "node:path";
import { getAddress, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
    this.exitCode = 1;
  }
}

const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_REGISTRY = "0x088bc310c841fA5ed5b28F37050c3B419572b70d";
const DEFAULT_MIDA_AGENT = "trustlayer-agent";
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const AGENT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

function invalid(key, expected) {
  return new ConfigError(`config: ${key} is missing or invalid (${expected}). Nothing was sent.`);
}

function optional(env, key) {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function checkedAddress(value, key) {
  if (!value || !isAddress(value)) throw invalid(key, "a 0x address");
  return getAddress(value);
}

export function loadConfig(env) {
  const agentPrivateKey = env.AGENT_PRIVATE_KEY;
  if (!agentPrivateKey || !PRIVATE_KEY_RE.test(agentPrivateKey)) {
    throw invalid("AGENT_PRIVATE_KEY", "0x followed by 64 hex characters");
  }

  const trustlayerOwner = checkedAddress(env.TRUSTLAYER_OWNER, "TRUSTLAYER_OWNER");

  const midaHome = env.MIDA_HOME;
  if (!midaHome || !path.isAbsolute(midaHome)) {
    throw invalid("MIDA_HOME", "an absolute path");
  }

  const midaAgent = optional(env, "MIDA_AGENT") ?? DEFAULT_MIDA_AGENT;
  if (!AGENT_NAME_RE.test(midaAgent)) {
    throw invalid("MIDA_AGENT", "1–40 lowercase letters, digits or dashes");
  }

  const midaProject = optional(env, "MIDA_PROJECT");
  if (midaProject !== undefined && !path.isAbsolute(midaProject)) {
    throw invalid("MIDA_PROJECT", "an absolute path");
  }
  const projectDir = midaProject ?? path.resolve(import.meta.dirname, "..");
  const rpcUrl = optional(env, "MONAD_RPC_URL") ?? DEFAULT_RPC_URL;
  const registry = checkedAddress(optional(env, "DELEGATION_REGISTRY") ?? DEFAULT_REGISTRY, "DELEGATION_REGISTRY");

  const config = {
    agentAddress: privateKeyToAccount(agentPrivateKey).address,
    trustlayerOwner,
    midaHome,
    midaAgent,
    projectDir,
    rpcUrl,
    registry,
  };
  Object.defineProperty(config, "agentPrivateKey", {
    value: agentPrivateKey,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return config;
}
