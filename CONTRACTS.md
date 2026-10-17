# Monad Trust Layer - Deployed Contracts

## Phase 2 Complete: Smart Contracts Deployed to Monad Testnet

### Deployed Contract Addresses

**Network**: Monad Testnet (Chain ID: 10143)
**RPC**: https://testnet-rpc.monad.xyz

- **DelegationRegistry**: `0x088bc310c841fA5ed5b28F37050c3B419572b70d`
- **AuthorizationVerifier**: `0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF`
- **Deployer**: `0x56C9a37F08035a440581C3ebeDf7dE3A6Ff4e60F`

### Contract Functions

#### DelegationRegistry
- `createDelegation(agent, tier, expiresAt)` - Create new delegation
- `revokeDelegation(delegationId)` - Revoke existing delegation
- `updateDelegation(delegationId, newTier, newExpiresAt)` - Update delegation parameters
- `isDelegationValid(delegationId)` - Check if delegation is currently valid
- `getDelegation(delegationId)` - Get delegation details
- `checkAgentDelegation(owner, agent)` - Check if agent has valid delegation from owner

#### AuthorizationVerifier
- `verifyAuthorization(proofId, root, nullifierHash)` - Verify authorization proof
- `updateDelegationRoot(newRoot)` - Update Merkle root for delegation tree
- `markDelegationIncluded(delegationId)` - Mark delegation as included in tree
- `isNullifierUsed(nullifierHash)` - Check if proof has been used (replay protection)

### Vercel Environment Variables

Add these to your Vercel project environment variables:

```env
VITE_DELEGATION_REGISTRY_ADDRESS=0x088bc310c841fA5ed5b28F37050c3B419572b70d
VITE_AUTHORIZATION_VERIFIER_ADDRESS=0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF
```

### Next Steps: Phase 3

1. **Frontend Integration**: Connect the frontend to the deployed contracts
2. **Contract ABIs**: Generate contract ABIs for frontend integration
3. **Transaction Links**: Display real Monad testnet transaction hashes in the activity feed
4. **Error Handling**: Handle contract interaction errors gracefully
5. **Testing**: Test the complete flow from Privy registration to contract interaction

### Deployment Notes

- **Gas Used**: Efficient deployment with minimal gas cost
- **Security**: OpenZeppelin contracts for security best practices
- **Simplified Verifier**: Demo version for hackathon, can be upgraded to full ZK implementation
- **Ready for Integration**: Contracts are verified and ready for frontend integration
