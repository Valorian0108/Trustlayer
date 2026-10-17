// Trust Layer — client-side Merkle module (Step 1: real proof-of-approval-set).
//
// Canonical implementation. Must stay in sync with:
//   - contracts/AuthorizationVerifierV2.sol  (leafFor, OZ MerkleProof sorted-pair hashing)
//   - deploy/test-merkle.ts                  (tests this file directly)
//
// Leaf encoding (matches AuthorizationVerifierV2.leafFor exactly):
//   leaf = keccak256(keccak256(abi.encode(owner, delegationId, agent, tier, expiresAt)))
// Tree: OpenZeppelin convention — sorted-pair commutative keccak256, odd nodes promoted.

import { ethers } from 'ethers';

export interface DelegationLeafInput {
  owner: string;
  delegationId: bigint;
  agent: string;
  tier: number;
  expiresAt: bigint;
}

export interface MerkleTree {
  leaves: string[];
  layers: string[][];
  root: string;
}

/**
 * Compute the canonical leaf hash for one delegation.
 * Identical to AuthorizationVerifierV2.leafFor on-chain.
 */
export function delegationLeaf(input: DelegationLeafInput): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'address', 'uint8', 'uint256'],
    [input.owner, input.delegationId, input.agent, input.tier, input.expiresAt],
  );
  // contract: keccak256(bytes.concat(keccak256(abi.encode(...))))
  return ethers.keccak256(ethers.keccak256(encoded));
}

/**
 * Commutative pair hashing — matches OZ Hashes.commutativeKeccak256:
 * the two 32-byte values are sorted (ascending, unsigned) then concatenated and hashed.
 */
export function hashPair(a: string, b: string): string {
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([lo, hi]));
}

/**
 * Build a Merkle tree from leaves (OpenZeppelin JS-library conventions):
 * pairs are commutative-hashed; a lone odd node is promoted to the next layer as-is.
 */
export function buildMerkleTree(leaves: string[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error('Cannot build a Merkle tree with no leaves');
  }
  const layers: string[][] = [leaves.slice()];
  let current = leaves.slice();
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 === current.length) {
        next.push(current[i]); // promote odd node
      } else {
        next.push(hashPair(current[i], current[i + 1]));
      }
    }
    layers.push(next);
    current = next;
  }
  return { leaves, layers, root: current[0] };
}

/**
 * Inclusion proof (sibling hashes, bottom-up) for the leaf at `leafIndex`.
 * Feed the result straight into AuthorizationVerifierV2.verifyAuthorization.
 */
export function getMerkleProof(tree: MerkleTree, leafIndex: number): string[] {
  if (leafIndex < 0 || leafIndex >= tree.leaves.length) {
    throw new Error(`Leaf index ${leafIndex} out of range`);
  }
  const proof: string[] = [];
  let index = leafIndex;
  for (let layerIndex = 0; layerIndex < tree.layers.length - 1; layerIndex++) {
    const layer = tree.layers[layerIndex];
    const siblingIndex = index % 2 === 1 ? index - 1 : index + 1;
    if (siblingIndex < layer.length) {
      proof.push(layer[siblingIndex]);
    }
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Local re-derivation of the root from a proof — used for pre-flight checks and tests. */
export function verifyMerkleProofLocally(proof: string[], root: string, leaf: string): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}

/**
 * Nullifier: unique per (delegation, agent, action instance).
 * The verifier consumes it so one authorization can never be replayed.
 * Step 2 (ZK) will derive this from the owner's secret instead; shape stays compatible.
 */
export function nullifierFor(delegationId: bigint, agent: string, actionScope: string): bigint {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address', 'string'],
    [delegationId, agent, actionScope],
  );
  return BigInt(ethers.keccak256(encoded));
}

/** Fresh, unique scope per action attempt (prevents legitimate repeat actions from colliding). */
export function makeActionScope(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
