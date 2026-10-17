// Post-deployment smoke test: proves the JS Merkle module and the deployed
// AuthorizationVerifierV2 agree byte-for-byte, against the live Monad testnet.
//
// Run from deploy/ AFTER deploy.mjs:  node smoke-test.mjs
// Read-only for the checks below; the full verify flow is exercised in the app UI.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { delegationLeaf, buildMerkleTree, getMerkleProof, verifyMerkleProofLocally } from "../artifacts/monad-trust-layer/src/zk/merkle.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC_URL = "https://testnet-rpc.monad.xyz";

const deploymentPath = join(__dirname, "out", "deployment.json");
if (!existsSync(deploymentPath)) {
  console.error("No deployment found. Run: node deploy.mjs");
  process.exit(1);
}
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
const verifierAddress = deployment.AuthorizationVerifierV2?.address;
if (!verifierAddress) {
  console.error("deployment.json has no AuthorizationVerifierV2 entry");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const artifact = JSON.parse(readFileSync(join(__dirname, "out", "AuthorizationVerifierV2.json"), "utf8"));
const verifier = new ethers.Contract(verifierAddress, artifact.abi, provider);

// 1. Registry wiring
const registry = await verifier.registry();
console.log(`Verifier V2:  ${verifierAddress}`);
console.log(`Registry:     ${registry}`);

// 2. leafFor agreement: on-chain pure function vs JS module
const sample = {
  owner: "0x56C9a37F08035a440581C3ebeDf7dE3A6Ff4e60F",
  delegationId: 1n,
  agent: "0x088bc310c841fA5ed5b28F37050c3B419572b70d",
  tier: 2,
  expiresAt: 1800000000n,
};
const onchainLeaf = await verifier.leafFor(sample.owner, sample.delegationId, sample.agent, sample.tier, sample.expiresAt);
const jsLeaf = delegationLeaf(sample);
console.log(`On-chain leaf: ${onchainLeaf}`);
console.log(`JS leaf:       ${jsLeaf}`);
if (onchainLeaf.toLowerCase() !== jsLeaf.toLowerCase()) {
  console.error("✗ LEAF MISMATCH — JS module and contract disagree. Do not proceed.");
  process.exit(1);
}
console.log("✓ leaf encoding matches between JS and contract");

// 3. Tree + proof self-consistency (local)
const leaves = [1, 2, 3].map((i) => delegationLeaf({ ...sample, delegationId: BigInt(i) }));
const tree = buildMerkleTree(leaves);
const proof = getMerkleProof(tree, 1);
if (!verifyMerkleProofLocally(proof, tree.root, leaves[1])) {
  console.error("✗ local proof verification failed");
  process.exit(1);
}
console.log("✓ local Merkle proof verifies");

// 4. Owner root state (informational)
const root = await verifier.getOwnerRoot(sample.owner);
console.log(`Committed root for ${sample.owner.slice(0, 10)}…: ${root === ethers.ZeroHash ? "(none yet)" : root}`);

console.log("\nSmoke test passed. Next: run the app flow end-to-end in the browser.");
