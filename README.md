# Monad Trust Layer - Smart Contracts

## Deployed Contracts on Monad Testnet

### Contract Addresses
- **DelegationRegistry**: `0x088bc310c841fA5ed5b28F37050c3B419572b70d`
- **AuthorizationVerifier**: `0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF`
- **Deployer**: `0x56C9a37F08035a440581C3ebeDf7dE3A6Ff4e60F`

### Network
- **Network**: Monad Testnet
- **Chain ID**: 10143
- **RPC**: https://testnet-rpc.monad.xyz

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your PRIVATE_KEY
```

3. Compile contracts:
```bash
npm run compile
```

## Deployment

Deploy to Monad testnet:
```bash
npm run deploy:monad-testnet
```

## Contract Functions

### DelegationRegistry
- `createDelegation(agent, tier, expiresAt)` - Create delegation
- `revokeDelegation(delegationId)` - Revoke delegation
- `updateDelegation(delegationId, newTier, newExpiresAt)` - Update delegation
- `isDelegationValid(delegationId)` - Check validity
- `checkAgentDelegation(owner, agent)` - Check agent authorization

### AuthorizationVerifier
- `verifyAuthorization(proofId, root, nullifierHash)` - Verify authorization proof
- `updateDelegationRoot(newRoot)` - Update Merkle root
- `markDelegationIncluded(delegationId)` - Mark delegation in tree

## Frontend Integration

Add these environment variables to your Vercel project:
```env
VITE_DELEGATION_REGISTRY_ADDRESS=0x088bc310c841fA5ed5b28F37050c3B419572b70d
VITE_AUTHORIZATION_VERIFIER_ADDRESS=0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF
```
