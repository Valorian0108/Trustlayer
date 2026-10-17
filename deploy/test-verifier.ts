// ============================================================================
// AuthorizationVerifierV2 — full behavioral test suite (LOCAL, no testnet)
// ----------------------------------------------------------------------------
// Runs against an in-process Hardhat EVM. Deploys the REAL compiled contracts
// (deploy/out/*.json — same artifacts used for testnet deployment) and walks
// the complete Trust Layer story plus every attack the verifier must reject.
//
// Run from deploy/:  npm run test:verifier
// ============================================================================

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import {
  buildMerkleTree,
  delegationLeaf,
  getMerkleProof,
  nullifierFor,
  makeActionScope,
} from '../artifacts/monad-trust-layer/src/zk/merkle.ts';

const require = createRequire(import.meta.url);
const hre = require('hardhat');
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadArtifact(name: string) {
  return JSON.parse(readFileSync(join(__dirname, 'out', `${name}.json`), 'utf8'));
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
const provider = new ethers.BrowserProvider(hre.network.provider);
const deployer = await provider.getSigner(0);
const owner = await provider.getSigner(1); // passkey owner (Privy wallet in the app)
const agent = await provider.getSigner(2); // agent wallet (MetaMask in the app)
const stranger = await provider.getSigner(3); // attacker with no delegation

let passed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`✓ ${label}`);
}

async function expectRevert(fn: () => Promise<unknown>, reason: string, label: string) {
  let caught: any = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `${label}: expected revert "${reason}" but the call SUCCEEDED`);
  const msg = String(caught?.message ?? caught);
  assert.ok(
    msg.includes(reason),
    `${label}: expected revert "${reason}", got: ${msg.slice(0, 300)}`
  );
  ok(`${label} → correctly rejected: "${reason}"`);
}

// ---------------------------------------------------------------------------
// Deploy the real compiled contracts
// ---------------------------------------------------------------------------
const registryArtifact = loadArtifact('DelegationRegistry');
const verifierArtifact = loadArtifact('AuthorizationVerifierV2');

const registry = await new ethers.ContractFactory(
  registryArtifact.abi, registryArtifact.bytecode, deployer
).deploy();
await registry.waitForDeployment();

const verifier = await new ethers.ContractFactory(
  verifierArtifact.abi, verifierArtifact.bytecode, deployer
).deploy(await registry.getAddress());
await verifier.waitForDeployment();

console.log(`Local chain: registry ${await registry.getAddress()} · verifier ${await verifier.getAddress()}\n`);

// ---------------------------------------------------------------------------
// Helpers mirroring the app's real code path (contracts.ts + zk/merkle.ts)
// ---------------------------------------------------------------------------
interface DelegationRow {
  delegationId: bigint;
  owner: string;
  agent: string;
  tier: number;
  expiresAt: bigint;
}

async function createDelegation(agentAddr: string, tier: number, expiresInSec = 0): Promise<bigint> {
  const expiresAt = expiresInSec === 0 ? 0n : BigInt(Math.floor(Date.now() / 1000) + expiresInSec);
  const id: bigint = await registry.connect(owner).createDelegation.staticCall(agentAddr, tier, expiresAt);
  const tx = await registry.connect(owner).createDelegation(agentAddr, tier, expiresAt);
  await tx.wait();
  return id;
}

async function buildApprovalSet(ownerAddr: string) {
  const ids: bigint[] = await registry.getOwnerDelegations(ownerAddr);
  const rows: DelegationRow[] = [];
  for (const id of ids) {
    const d = await registry.getDelegation(id);
    rows.push({ delegationId: id, owner: d.owner, agent: d.agent, tier: Number(d.tier), expiresAt: d.expiresAt });
  }
  rows.sort((a, b) => Number(a.delegationId - b.delegationId));
  const leaves = rows.map(delegationLeaf);
  const tree = buildMerkleTree(leaves);
  return { rows, leaves, tree };
}

function claimFor(d: DelegationRow, minTier: number, scope = makeActionScope('test')) {
  return {
    owner: d.owner,
    delegationId: d.delegationId,
    agent: d.agent,
    tier: d.tier,
    expiresAt: d.expiresAt,
    minTier,
    nullifierHash: nullifierFor(d.delegationId, d.agent, scope),
  };
}

function tuple(c: ReturnType<typeof claimFor>) {
  return [c.owner, c.delegationId, c.agent, c.tier, c.expiresAt, c.minTier, c.nullifierHash];
}

async function commitRootAsOwner(root: string) {
  const tx = await verifier.connect(owner).commitRoot(root);
  await tx.wait();
}

// ---------------------------------------------------------------------------
// Phase A — contract wiring + leaf-encoding agreement (JS ↔ Solidity)
// ---------------------------------------------------------------------------
assert.equal(await verifier.registry(), await registry.getAddress(), 'verifier must be wired to the registry');
ok('verifier is wired to the deployed registry');

{
  const sample = {
    owner: await owner.getAddress(),
    delegationId: 42n,
    agent: await agent.getAddress(),
    tier: 2,
    expiresAt: 1800000000n,
  };
  const onchain: string = await verifier.leafFor(sample.owner, sample.delegationId, sample.agent, sample.tier, sample.expiresAt);
  assert.equal(onchain.toLowerCase(), delegationLeaf(sample).toLowerCase(), 'JS leaf != Solidity leafFor');
  ok('leaf encoding identical between zk/merkle.ts and AuthorizationVerifierV2.leafFor');
}

// ---------------------------------------------------------------------------
// Phase B — the happy path: delegate → commit → prove → verify on-chain
// ---------------------------------------------------------------------------
const ownerAddr = await owner.getAddress();
const agentAddr = await agent.getAddress();

const id1 = await createDelegation(agentAddr, 2); // Elevated, no expiry
{
  const set = await buildApprovalSet(ownerAddr);
  await commitRootAsOwner(set.tree.root);

  const idx = set.rows.findIndex((r) => r.delegationId === id1);
  const proof = getMerkleProof(set.tree, idx);
  const claim = claimFor(set.rows[idx], 2);

  assert.equal(await verifier.checkAuthorization(tuple(claim), proof), true, 'pre-check should pass');
  ok('checkAuthorization pre-check passes for a valid proof');

  // The AGENT submits the verification (mirrors the app: agent pays gas to prove authorization)
  const tx = await verifier.connect(agent).verifyAuthorization(tuple(claim), proof);
  const receipt = await tx.wait();

  const parsed = receipt!.logs
    .map((l: any) => { try { return verifier.interface.parseLog(l); } catch { return null; } })
    .find((p: any) => p?.name === 'AuthorizationVerified');
  assert.ok(parsed, 'AuthorizationVerified event must be emitted');
  assert.equal(parsed!.args.delegationId, id1);
  ok('verifyAuthorization succeeded on-chain, AuthorizationVerified event emitted');

  assert.equal(await verifier.isNullifierUsed(claim.nullifierHash), true, 'nullifier must be consumed');
  ok('nullifier consumed (replay protection armed)');
  assert.equal(await verifier.verificationCount(agentAddr), 1n);
  ok('verificationCount[agent] == 1');
}

// ---------------------------------------------------------------------------
// Phase C — replay attack: same proof + same nullifier must be rejected
// ---------------------------------------------------------------------------
{
  const set = await buildApprovalSet(ownerAddr);
  const idx = set.rows.findIndex((r) => r.delegationId === id1);
  const proof = getMerkleProof(set.tree, idx);
  const scope = 'fixed-scope-for-replay-test';
  const claim = claimFor(set.rows[idx], 2, scope);

  // first use succeeds
  const tx = await verifier.connect(agent).verifyAuthorization(tuple(claim), proof);
  await tx.wait();
  // replay rejected
  await expectRevert(
    () => verifier.connect(agent).verifyAuthorization.staticCall(tuple(claim), proof),
    'Proof already used',
    'replay of the same authorization'
  );
  // ...but the SAME delegation with a fresh action scope still works (one delegation, many actions)
  const claim2 = claimFor(set.rows[idx], 2, makeActionScope('second-action'));
  const tx2 = await verifier.connect(agent).verifyAuthorization(tuple(claim2), proof);
  await tx2.wait();
  ok('same delegation authorizes a NEW action (fresh nullifier), count now ' + (await verifier.verificationCount(agentAddr)));
}

// ---------------------------------------------------------------------------
// Phase D — tier policy: Routine delegation cannot satisfy an Elevated action
// ---------------------------------------------------------------------------
const id2 = await createDelegation(agentAddr, 1); // Routine
{
  const set = await buildApprovalSet(ownerAddr);
  await commitRootAsOwner(set.tree.root);
  const idx = set.rows.findIndex((r) => r.delegationId === id2);
  const proof = getMerkleProof(set.tree, idx);

  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(set.rows[idx], 2)), proof),
    'Tier below required level',
    'Routine delegation used for an Elevated ($500) action'
  );
  // ...and the same proof passes when the action only needs Routine
  assert.equal(await verifier.checkAuthorization(tuple(claimFor(set.rows[idx], 1)), proof), true);
  ok('same proof accepted when minTier matches the delegation');
}

// ---------------------------------------------------------------------------
// Phase E — expiry: a time-limited delegation stops verifying after expiry
// ---------------------------------------------------------------------------
const id3 = await createDelegation(agentAddr, 2, 30); // expires in 30s
{
  const set = await buildApprovalSet(ownerAddr);
  await commitRootAsOwner(set.tree.root);
  const idx = set.rows.findIndex((r) => r.delegationId === id3);
  const proof = getMerkleProof(set.tree, idx);

  assert.equal(await verifier.checkAuthorization(tuple(claimFor(set.rows[idx], 2)), proof), true);
  ok('time-limited delegation verifies BEFORE expiry');

  await hre.network.provider.send('evm_increaseTime', [60]);
  await hre.network.provider.send('evm_mine', []);

  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(set.rows[idx], 2)), proof),
    'Delegation expired',
    'expired delegation'
  );
}

// ---------------------------------------------------------------------------
// Phase F — revocation: owner revokes; verification dies WITHOUT re-committing
// (the registry cross-check catches it — revocation needs no new root)
// ---------------------------------------------------------------------------
{
  const tx = await registry.connect(owner).revokeDelegation(id1);
  await tx.wait();

  const set = await buildApprovalSet(ownerAddr); // id1 still in the committed tree
  const idx = set.rows.findIndex((r) => r.delegationId === id1);
  const proof = getMerkleProof(set.tree, idx);

  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(set.rows[idx], 2)), proof),
    'Delegation not active in registry',
    'revoked delegation (root unchanged — registry cross-check catches it)'
  );
}

// ---------------------------------------------------------------------------
// Phase G — membership: tampered proofs and owners without roots
// ---------------------------------------------------------------------------
{
  const set = await buildApprovalSet(ownerAddr);
  const idx = set.rows.findIndex((r) => r.delegationId === id2);
  const proof = getMerkleProof(set.tree, idx);
  assert.ok(proof.length > 0, 'need a non-empty proof to tamper with');

  const tampered = proof.slice();
  tampered[0] = ethers.keccak256(ethers.toUtf8Bytes('tampered-sibling'));
  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(set.rows[idx], 1)), tampered),
    'Invalid membership proof',
    'tampered Merkle proof'
  );

  // A leaf that was never in the owner's committed tree
  const foreignLeafClaim = {
    ...claimFor(set.rows[idx], 1),
    delegationId: set.rows[idx].delegationId + 500n, // not a committed leaf
  };
  await expectRevert(
    () => verifier.checkAuthorization(tuple(foreignLeafClaim), proof),
    'Invalid membership proof',
    'claim for a delegation not in the committed tree'
  );
}
{
  // stranger never committed a root
  const strangerAddr = await stranger.getAddress();
  const fakeRow: DelegationRow = { delegationId: 1n, owner: strangerAddr, agent: strangerAddr, tier: 2, expiresAt: 0n };
  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(fakeRow, 2)), []),
    'Owner has no committed root',
    'authorization claiming an owner who never committed a root'
  );
}

// ---------------------------------------------------------------------------
// Phase H — the lying-owner attack: owner commits a FAKE tree to escalate
// privileges beyond what the registry actually granted. Registry cross-check
// must catch every variant.
// ---------------------------------------------------------------------------
{
  // H1: fabricate a delegation that does not exist in the registry
  const fakeRow: DelegationRow = {
    delegationId: 999n, owner: ownerAddr, agent: agentAddr, tier: 2, expiresAt: 0n,
  };
  const fakeTree = buildMerkleTree([delegationLeaf(fakeRow)]);
  await commitRootAsOwner(fakeTree.root);
  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(fakeRow, 2)), []),
    'Delegation not active in registry',
    'fabricated delegation ID (never created in registry)'
  );

  // H2: real delegation, but the fake tree swaps the agent to the stranger
  const realRow = (await buildApprovalSet(ownerAddr)).rows.find((r) => r.delegationId === id2)!;
  const swappedAgent: DelegationRow = { ...realRow, agent: await stranger.getAddress() };
  await commitRootAsOwner(buildMerkleTree([delegationLeaf(swappedAgent)]).root);
  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(swappedAgent, 1)), []),
    'Agent mismatch with registry',
    'owner tries to authorize a different agent than the registry granted'
  );

  // H3: real delegation, but the fake tree inflates the tier (Routine → Elevated)
  const inflated: DelegationRow = { ...realRow, tier: 2 };
  await commitRootAsOwner(buildMerkleTree([delegationLeaf(inflated)]).root);
  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(inflated, 2)), []),
    'Tier mismatch with registry',
    'owner tries to escalate the tier beyond what the registry granted'
  );

  // H4: real delegation, fake tree stretches the expiry
  const stretched: DelegationRow = { ...realRow, expiresAt: BigInt(Math.floor(Date.now() / 1000) + 100000) };
  await commitRootAsOwner(buildMerkleTree([delegationLeaf(stretched)]).root);
  await expectRevert(
    () => verifier.checkAuthorization(tuple(claimFor(stretched, 1)), []),
    'Expiry mismatch with registry',
    'owner tries to stretch the expiry beyond what the registry granted'
  );
}

// ---------------------------------------------------------------------------
// Phase I — restore an honest root; final end-to-end verification still works
// ---------------------------------------------------------------------------
{
  const set = await buildApprovalSet(ownerAddr);
  await commitRootAsOwner(set.tree.root);
  const idx = set.rows.findIndex((r) => r.delegationId === id2);
  const claim = claimFor(set.rows[idx], 1);
  const tx = await verifier.connect(agent).verifyAuthorization(tuple(claim), getMerkleProof(set.tree, idx));
  const receipt = await tx.wait();
  assert.equal(receipt!.status, 1);
  ok('final end-to-end verification on an honest root succeeds');
}

console.log(`\n════════════════════════════════════════════════`);
console.log(` ALL CONTRACT TESTS PASSED — ${passed} positive checks,`);
console.log(` plus every attack scenario correctly rejected.`);
console.log(`════════════════════════════════════════════════`);
