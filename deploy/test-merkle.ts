// Tests for the canonical Merkle module used by the Trust Layer app.
// Run from deploy/:  npm run test:merkle
//
// Verifies: leaf determinism, tree building, proof generation/verification for
// every leaf in trees of several sizes, tamper rejection, and nullifier sanity.

import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  buildMerkleTree,
  delegationLeaf,
  getMerkleProof,
  hashPair,
  makeActionScope,
  nullifierFor,
  verifyMerkleProofLocally,
  type DelegationLeafInput,
} from '../artifacts/monad-trust-layer/src/zk/merkle.ts';

function sampleDelegation(i: number): DelegationLeafInput {
  return {
    owner: ethers.getAddress(`0x${'11'.repeat(19)}${(i % 10).toString(16)}`.slice(0, 42).padEnd(42, '0')),
    delegationId: BigInt(i + 1),
    agent: ethers.getAddress(`0x${'22'.repeat(20)}`),
    tier: i % 3,
    expiresAt: BigInt(1800000000 + i),
  };
}

// --- leaf encoding ---
{
  const d: DelegationLeafInput = {
    owner: '0x56C9a37F08035a440581C3ebeDf7dE3A6Ff4e60F',
    delegationId: 29n,
    agent: '0x088bc310c841fA5ed5b28F37050c3B419572b70d',
    tier: 1,
    expiresAt: 1800000000n,
  };
  const leaf = delegationLeaf(d);
  assert.equal(leaf, delegationLeaf({ ...d }), 'leaf must be deterministic');
  // manual re-computation mirroring the contract: keccak256(keccak256(abi.encode(...)))
  const inner = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'uint256', 'address', 'uint8', 'uint256'],
      [d.owner, d.delegationId, d.agent, d.tier, d.expiresAt],
    ),
  );
  assert.equal(leaf, ethers.keccak256(inner), 'leaf must equal double-keccak of abi.encode');
  console.log('✓ leaf encoding (deterministic, matches contract formula)');
}

// --- hashPair commutativity ---
{
  const a = ethers.keccak256(ethers.toUtf8Bytes('a'));
  const b = ethers.keccak256(ethers.toUtf8Bytes('b'));
  assert.equal(hashPair(a, b), hashPair(b, a), 'hashPair must be commutative');
  console.log('✓ hashPair commutative (OZ convention)');
}

// --- trees of many sizes: every leaf must prove against the root ---
for (const size of [1, 2, 3, 4, 5, 7, 8, 16, 17, 33]) {
  const leaves = Array.from({ length: size }, (_, i) => delegationLeaf(sampleDelegation(i)));
  const tree = buildMerkleTree(leaves);
  assert.match(tree.root, /^0x[0-9a-f]{64}$/, 'root must be bytes32');
  for (let i = 0; i < size; i++) {
    const proof = getMerkleProof(tree, i);
    assert.ok(
      verifyMerkleProofLocally(proof, tree.root, leaves[i]),
      `valid proof rejected (size ${size}, leaf ${i})`,
    );
    // tamper: wrong leaf must not verify
    const wrongLeaf = delegationLeaf({ ...sampleDelegation(i), tier: (sampleDelegation(i).tier + 1) % 3 });
    if (wrongLeaf !== leaves[i]) {
      assert.ok(
        !verifyMerkleProofLocally(proof, tree.root, wrongLeaf),
        `tampered leaf accepted (size ${size}, leaf ${i})`,
      );
    }
  }
  console.log(`✓ tree size ${size}: all ${size} proofs verify, tampered leaves rejected`);
}

// --- proof for a leaf from another tree must fail ---
{
  const treeA = buildMerkleTree([delegationLeaf(sampleDelegation(0)), delegationLeaf(sampleDelegation(1))]);
  const foreignLeaf = delegationLeaf(sampleDelegation(9));
  assert.ok(!verifyMerkleProofLocally(getMerkleProof(treeA, 0), treeA.root, foreignLeaf));
  console.log('✓ foreign leaf rejected');
}

// --- nullifiers: unique per scope, deterministic per identical scope ---
{
  const n1 = nullifierFor(29n, '0x088bc310c841fA5ed5b28F37050c3B419572b70d', 'scope-a');
  const n2 = nullifierFor(29n, '0x088bc310c841fA5ed5b28F37050c3B419572b70d', 'scope-a');
  const n3 = nullifierFor(29n, '0x088bc310c841fA5ed5b28F37050c3B419572b70d', 'scope-b');
  assert.equal(n1, n2, 'same inputs must produce same nullifier');
  assert.notEqual(n1, n3, 'different scope must produce different nullifier');
  assert.ok(n1 > 0n && n1 < 2n ** 256n, 'nullifier must fit uint256');
  assert.notEqual(makeActionScope('x'), makeActionScope('x'), 'action scopes must be unique');
  console.log('✓ nullifiers deterministic, scope-unique, uint256-safe');
}

console.log('\nAll Merkle module tests passed.');
