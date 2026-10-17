// Deploy AuthorizationVerifierV2 to Monad testnet.
//
// Usage:
//   1. Copy .env.example to .env and fill in DEPLOYER_PRIVATE_KEY
//   2. node compile.mjs          (produces out/AuthorizationVerifierV2.json)
//   3. node deploy.mjs           (deploys, prints address, writes out/deployment.json)
//
// The deployer wallet pays gas. Per CONTRACTS.md the original deployer was
// 0x56C9a37F08035a440581C3ebeDf7dE3A6Ff4e60F — any funded Monad testnet wallet works.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- minimal .env loader (no dependency; keeps this folder isolated) ---
function loadEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const RPC_URL = env.RPC_URL || "https://testnet-rpc.monad.xyz";
// Existing deployed DelegationRegistry (never modified — see DECISIONS.md D4)
const REGISTRY_ADDRESS =
  env.REGISTRY_ADDRESS || "0x088bc310c841fA5ed5b28F37050c3B419572b70d";
const PRIVATE_KEY = env.DEPLOYER_PRIVATE_KEY;

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Missing DEPLOYER_PRIVATE_KEY in deploy/.env (see .env.example)");
    process.exit(1);
  }

  const artifactPath = join(__dirname, "out", "AuthorizationVerifierV2.json");
  if (!existsSync(artifactPath)) {
    console.error("No compiled artifact. Run: node compile.mjs");
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const network = await provider.getNetwork();
  const balance = await provider.getBalance(wallet.address);
  console.log(`Network:   ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer:  ${wallet.address}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} MON`);
  console.log(`Registry:  ${REGISTRY_ADDRESS}`);

  if (balance === 0n) {
    console.error("Deployer has 0 MON — get testnet funds from https://faucet.monad.xyz");
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log("Deploying AuthorizationVerifierV2...");
  const contract = await factory.deploy(REGISTRY_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✓ AuthorizationVerifierV2 deployed at:\n  ${address}`);
  console.log(`  Explorer: https://testnet.monadscan.com/address/${address}`);

  mkdirSync(join(__dirname, "out"), { recursive: true });
  const deploymentPath = join(__dirname, "out", "deployment.json");
  const existing = existsSync(deploymentPath)
    ? JSON.parse(readFileSync(deploymentPath, "utf8"))
    : {};
  const record = {
    AuthorizationVerifierV2: {
      address,
      registry: REGISTRY_ADDRESS,
      chainId: Number(network.chainId),
      deployer: wallet.address,
      deployedAt: new Date().toISOString(),
    },
  };
  writeFileSync(deploymentPath, JSON.stringify({ ...existing, ...record }, null, 2));
  console.log(`\nAdd to artifacts/monad-trust-layer/.env (and Vercel):`);
  console.log(`VITE_AUTHORIZATION_VERIFIER_V2_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
