# Monad Trust Layer

**Proportional Authorization Infrastructure for AI Agents**

---

## Overview

Monad Trust Layer is a novel identity and authorization infrastructure that gives AI agents the same proportional trust instincts humans have: small actions execute immediately, while high-stakes actions require cryptographic proof of authorization from a verified human owner.

Built for the **Monad Metropolis Hackathon (Track 4: Trust, Identity & AI Infrastructure)**, this project addresses a fundamental gap in agent security: current systems either trust agents completely or challenge every action. Neither matches how human trust actually works in the real world.

## The Problem

When an AI agent acts on someone's behalf—paying, signing, executing an action—most systems treat every action identically: either the agent is trusted unconditionally, or every single action requires manual approval. This binary approach doesn't reflect how trust works in practice.

A person doesn't get carded for a $3 coffee, but they do for a $500 purchase. AI agents lack this proportional judgment—they're either reckless or exhaustively over-cautious.

## The Solution

A trust layer that gives agents proportional authorization instincts:

- **Low-stakes actions** execute immediately with zero friction
- **High-stakes actions** require the agent to present cryptographic proof that it's genuinely authorized by a verified human owner
- **Privacy-preserving**: the verifier confirms authorization without exposing the owner's identity or wallet details

This is **identity/trust infrastructure**, not a payment solution. Payments are the demo case; the actual deliverable is the verification layer that agents check before acting.

## Architecture

### Dual-Wallet System

The system implements a security-first dual-wallet architecture:

- **Human Owner**: Privy passkey-authenticated wallet for identity and authorization
- **AI Agent**: Separate EVM wallet (MetaMask/Rabby) for automated execution

This separation follows security best practices by isolating human control from automated agent execution, providing clear security boundaries and audit trails.

### Authorization Flow

1. **Owner Registration (One-Time)**
   - Human registers with WebAuthn passkey (P256)
   - No seed phrase required—biometric or hardware-backed credential
   - This becomes the trust anchor for all subsequent authorizations

2. **Delegation (One-Time)**
   - Owner signs a one-time authorization: "this agent may act on my behalf up to this stakes tier"
   - The signature is cryptographically bound to the passkey-registered owner
   - Stored on-chain with tier, expiry, and revocation capabilities

3. **Low-Stakes Action**
   - Agent acts directly—no verification required
   - Nothing meaningful is at risk, so no friction is justified

4. **High-Stakes Action**
   - Agent presents proof that a valid delegation exists
   - Proof must be signed by a real, registered owner
   - Verifier contract checks validity, expiry, and revocation status
   - Approves or rejects without learning which owner authorized it

### Privacy Architecture

The system implements a Merkle-based anonymous proof architecture:

- **Merkle Root**: Commits the set of valid delegations without revealing individual mappings
- **Nullifier Hash**: Prevents replay attacks while preserving anonymity
- **Verifier Contract**: Confirms authorization without exposing owner identity

The current implementation uses a simplified verifier for hackathon demonstration. The interface is correctly shaped for full Semaphore-style proof generation, which would be the next production upgrade.

## Technology Stack

### Blockchain Infrastructure
- **Monad Testnet** (Chain ID: 10143) - High-performance execution layer
- **DelegationRegistry Contract** - On-chain delegation storage and management
- **AuthorizationVerifier Contract** - Anonymous proof verification interface

### Identity & Authentication
- **Privy** - Passkey-based account creation (WebAuthn/P256)
- **Dual-Wallet Architecture** - Privy for owner, EVM wallet for agent
- **No Seed Phrases** - Biometric or hardware-backed credentials only

### Frontend & Integration
- **React + Vite** - Modern, performant frontend framework
- **ethers.js** - Type-safe blockchain interaction
- **Etherscan-style Explorer Integration** - MonadScan transaction linking
- **Multi-Wallet Support** - MetaMask, Rabby, and other EVM wallets

## Implementation Status

### Complete Features

- **Passkey-Based Owner Registration** - Full Privy integration with WebAuthn
- **Delegation Tier System** - $5 (Micro), $50 (Routine), $500 (Elevated) authorization levels
- **Dual-Wallet Architecture** - Secure separation of owner and agent wallets
- **Proportional Action Routing** - Automatic low-stakes approval, high-stakes verification
- **Real Blockchain Infrastructure** - Transaction signing, hash generation, explorer integration
- **Activity Feed** - Real-time transaction status and history
- **Professional Error Handling** - Graceful fallbacks and clear user feedback
- **Responsive Dashboard** - Single-screen judge-facing trust console

###  Next Steps

- **Full ZK Proof Generation** - Implement Semaphore-style anonymous proof generation
- **Contract Re-deployment** - Deploy fresh contracts for production use
- **Enhanced Privacy** - Complete anonymous verification implementation

## Demo Experience

The application presents a single, comprehensive dashboard:

1. **Trust Setup Panel**
   - Owner registration with passkey authentication
   - Delegation tier selection and authorization
   - Agent wallet connection

2. **Action Console**
   - Small purchase simulation ($3) - demonstrates instant approval
   - Large purchase simulation ($500) - demonstrates verification flow

3. **Activity Feed**
   - Real-time transaction status and hashes
   - Clear success/failure feedback
   - Explorer links for on-chain verification

## Deployed Contracts

**Network**: Monad Testnet (Chain ID: 10143)  
**RPC**: https://testnet-rpc.monad.xyz

- **DelegationRegistry**: `0x088bc310c841fA5ed5b28F37050c3B419572b70d`
- **AuthorizationVerifier**: `0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF`

### Current Contract Status

The deployed contracts are currently in a demonstration mode. The transaction infrastructure is fully implemented and operational, but the deployed contract instances require redeployment for production use. The demo uses simulation fallbacks to ensure reliable presentation of the trust layer concept.

## Configuration

### Environment Variables

```env
VITE_PRIVY_APP_ID=cmtrqskxl00rc0cjiaso8qnzf
VITE_DELEGATION_REGISTRY_ADDRESS=0x088bc310c841fA5ed5b28F37050c3B419572b70d
VITE_AUTHORIZATION_VERIFIER_ADDRESS=0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF
```

### Requirements

- **Passkey-Capable Device**: Laptop or phone with fingerprint/Face ID/WebAuthn support
- **EVM Wallet**: MetaMask, Rabby, or compatible wallet for agent integration
- **Monad Testnet Access**: Configure wallet for Chain ID 10143
- **Testnet MON**: Obtain from Monad faucet for contract interaction

## Security Considerations

- **No Private Keys in Code**: All secrets managed through environment variables
- **Privy App ID**: Public frontend identifier, not a secret
- **Testnet Only**: No real funds at risk
- **Privacy-First Design**: Owner identity protected through cryptographic proofs
- **Audit Trail**: All authorizations logged on-chain with timestamps

## Deployment

**Repository**: https://github.com/Valorian0108/Trustlayer  
**Branch**: main  
**Network**: Monad Testnet (Chain ID: 10143)  
**Deployment**: Vercel with automatic builds

## Judge Pitch

**How It Works:**

"First, the owner registers with a passkey—no seed phrase, just their fingerprint or device. That's their identity, cryptographically locked in. Then they sign one authorization, giving their agent permission to act on their behalf up to a certain tier. If the agent does something small, it just happens—no delay, nothing meaningful is at risk. When the agent tries something bigger, it pauses, generates a proof that a real verified owner authorized it, gets that proof checked on-chain, and only then proceeds. The system never has to expose who the owner is—it just confirms the action was properly authorized."

**Why It Matters:**

"AI agents don't yet have the same judgment humans have—nobody gets carded buying coffee, but they do for a big purchase. This gives agents that proportional instinct, making them both efficient and trustworthy."

**Privacy Implementation:**

"The verifier's interface—a Merkle root plus a nullifier hash—is the correct architecture for anonymous membership proof, matching libraries like Semaphore. The current implementation uses a simplified verifier for demonstration. The full cryptographic proof generation is the next production upgrade, which would provide complete anonymity while maintaining authorization verification."

---

**Built for Monad Metropolis Track 4: Trust, Identity & AI Infrastructure**
