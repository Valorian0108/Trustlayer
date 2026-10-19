# Monad Trust Layer - Deployed Contracts

## Monad Testnet (Chain ID: 10143)

**RPC**: https://testnet-rpc.monad.xyz
**Explorer**: https://testnet.monadscan.com

### Deployed Contract Addresses

- **DelegationRegistry**: `0x088bc310c841fA5ed5b28F37050c3B419572b70d`
- **AuthorizationVerifier (legacy)**: `0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF`
- **AuthorizationVerifierV2 (current)**: `0x82912805399B9924b6F0aF9360FBd9f91a5Fb6c7`

`AuthorizationVerifierV2` was deployed by `0x09d6a3894854C3A59357E6d9B5CBC7af94cF5Ca8` on 2026-10-17, using the registry above.

### Contract Functions

#### DelegationRegistry
- `createDelegation(agent, tier, expiresAt)` — create a new delegation
- `revokeDelegation(delegationId)` — revoke an existing delegation
- `updateDelegation(delegationId, newTier, newExpiresAt)` — update delegation parameters
- `isDelegationValid(delegationId)` — check whether a delegation is currently valid
- `getDelegation(delegationId)` — read delegation details
- `getOwnerDelegations(owner)` — list a owner's delegation IDs
- `getAgentDelegations(agent)` — list an agent's delegation IDs
- `checkAgentDelegation(owner, agent)` — check whether an agent has a valid delegation from an owner

#### AuthorizationVerifierV2
- `commitRoot(root)` — owner commits the Merkle root of their approved delegation leaves. The root is authorized by the owner's own signed transaction.
- `verifyAuthorization(claim, proof)` — verifies a Merkle inclusion proof, enforces tier/expiry/revocation, consumes the nullifier, and emits `AuthorizationVerified`.
- `checkAuthorization(claim, proof)` — view-only dry run of every check (does not consume the nullifier).
- `leafFor(owner, delegationId, agent, tier, expiresAt)` — canonical leaf encoding, public so clients match the contract exactly.
- `getOwnerRoot(owner)` — the root currently committed by an owner.
- `isNullifierUsed(nullifierHash)` — replay check.

### Vercel Environment Variables

```env
VITE_DELEGATION_REGISTRY_ADDRESS=0x088bc310c841fA5ed5b28F37050c3B419572b70d
VITE_AUTHORIZATION_VERIFIER_ADDRESS=0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF
VITE_AUTHORIZATION_VERIFIER_V2_ADDRESS=0x82912805399B9924b6F0aF9360FBd9f91a5Fb6c7
```

### Notes

- **Verification model**: deterministic Merkle inclusion proofs verified on-chain. Tier, expiry, and revocation are cross-checked against `DelegationRegistry`; nullifier consumption prevents replay.
- **Privacy**: zero-knowledge / anonymous verification is roadmap-only and is not part of this build.
- **Security**: OpenZeppelin primitives (`Ownable`, `ReentrancyGuard`, `MerkleProof`).
