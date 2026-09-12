# Trust Layer

**Proportional Authorization Infrastructure for AI Agents**

---

## Project Overview

Trust Layer is a novel identity and authorization infrastructure that gives AI agents the same proportional trust instincts humans have: small actions execute immediately, while high-stakes actions require cryptographic proof of authorization from a verified human owner.

This project addresses a fundamental gap in agent security: current systems either trust agents completely or challenge every action. Neither matches how human trust actually works in the real world. A person does not get carded for a $3 coffee, but they do for a $500 purchase. AI agents lack this proportional judgment, making them either reckless or exhaustively over-cautious.

## The Problem

When an AI agent acts on someone's behalf, paying, signing, or executing an action, most systems treat every action identically. Either the agent is trusted unconditionally, or every single action requires manual approval. This binary approach does not reflect how trust works in practice and creates unnecessary friction or security risks.

Current agent authorization systems lack the nuanced, context-aware decision-making that humans naturally apply to trust decisions. This limitation prevents agents from operating at scale safely and efficiently.

## The Solution

A trust layer that gives agents proportional authorization instincts:

- Low-stakes actions execute immediately with zero friction
- High-stakes actions require the agent to present cryptographic proof that it is genuinely authorized by a verified human owner
- Privacy-preserving: the verifier confirms authorization without exposing the owner's identity or wallet details

This is identity and trust infrastructure, not a payment solution. Payments are the demo case; the actual deliverable is the verification layer that agents check before acting.

## How It Works

### Step 1: Owner Registration
The human owner registers using WebAuthn passkey authentication (P256). No seed phrase is required, only biometric or hardware-backed credentials. This becomes the trust anchor for all subsequent authorizations.

### Step 2: Delegation Creation
The owner signs a one-time authorization that grants their agent permission to act on their behalf up to a specific stakes tier. The signature is cryptographically bound to the passkey-registered owner and stored on-chain with tier, expiry, and revocation capabilities.

### Step 3: Low-Stakes Actions
For actions below the delegation threshold, the agent acts directly without verification. Nothing meaningful is at risk, so no friction is justified. These transactions settle live on the Monad Testnet.

### Step 4: High-Stakes Actions
For actions above the delegation threshold, the agent is designed to present a cryptographic proof that a valid delegation exists, checked by the verifier contract without revealing which owner authorized it. In this build, that final check is simulated in the UI for a reliable live demo rather than performed on-chain. The verifier contract is deployed and shaped for real proof-checking as the next step.

## Architecture Vision

In production, this system will utilize Zero-Knowledge Proofs (ZKPs) to confirm authorization without exposing the owner's identity. For this hackathon proof of concept, we simulate this verification flow using a simplified signature-based approach combined with Privy passkey biometric authentication.

The architecture is designed to support full ZK implementation using libraries like Semaphore. The current interface is correctly shaped for anonymous proof generation, with Merkle root management and nullifier hash prevention of replay attacks. The complete cryptographic proof generation is the next production upgrade.

## Hackathon Scope vs Production Roadmap

### Hackathon Demo Implementation
For the hackathon demo, low-stakes transactions are fully integrated and settle live on the Monad Testnet. For high-stakes transactions ($500+), the interface triggers a real Privy passkey biometric flow to simulate human intervention. To preserve the presentation flow and bypass incomplete client-side ZK proof generation under hackathon timelines, the final cryptographic verification step is simulated in the UI via a mock success sequence rather than a live on-chain contract call.

### Production Roadmap
The production implementation will include:
- Full Semaphore or similar ZK proof system integration
- Complete anonymous verification without exposing owner identity
- Enhanced Merkle tree management for group membership
- Optimized proof generation for mobile devices
- Advanced nullifier management for replay attack prevention
- Production contract deployment with enhanced security

## Technology Stack

### Blockchain Infrastructure
- Monad Testnet (Chain ID: 10143), high-performance execution layer
- DelegationRegistry Contract, on-chain delegation storage and management
- AuthorizationVerifier Contract, proof verification interface

### Identity and Authentication
- Privy, passkey-based account creation (WebAuthn/P256)
- Dual-Wallet Architecture, Privy for owner, EVM wallet for agent
- No seed phrases, biometric or hardware-backed credentials only

### Frontend and Integration
- React and Vite, modern, performant frontend framework
- ethers.js, type-safe blockchain interaction
- Etherscan-style Explorer Integration, MonadScan transaction linking
- Multi-Wallet Support, MetaMask, Rabby, and other EVM wallets

## Implementation Status

### Complete Features
- Passkey-Based Owner Registration, full Privy integration with WebAuthn
- Delegation Tier System, $5 (Micro), $50 (Routine), and $500 (Elevated) authorization levels
- Dual-Wallet Architecture, secure separation of owner and agent wallets
- Proportional Action Routing, automatic low-stakes approval, high-stakes verification
- Real Blockchain Infrastructure, transaction signing, hash generation, explorer integration
- Activity Feed, real-time transaction status and history
- Professional Error Handling, graceful fallbacks and clear user feedback
- Responsive Dashboard, single-screen judge-facing trust console

### Current Limitations
- High-stakes verification uses simulation for demo presentation
- Full ZK proof generation requires additional development time
- Contract instances require redeployment for production use

## Demo Experience

The application presents a single, comprehensive dashboard:

### Trust Setup Panel
- Owner registration with passkey authentication
- Delegation tier selection and authorization
- Agent wallet connection

### Action Console
- Small purchase simulation ($3), demonstrates instant approval
- Large purchase simulation ($500), demonstrates verification flow

### Activity Feed
- Real-time transaction status and hashes
- Clear success and failure feedback
- Explorer links for on-chain verification

## Deployed Contracts

**Network**: Monad Testnet (Chain ID: 10143)
**RPC**: https://testnet-rpc.monad.xyz

- DelegationRegistry: 0x088bc310c841fA5ed5b28F37050c3B419572b70d
- AuthorizationVerifier: 0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF

### Current Contract Status

Low-stakes transactions settle live on Monad testnet. High-stakes verification is simulated for this demo, pending full ZK proof integration. See Architecture Vision above for the production roadmap.

## User Guide

### Getting Started

1. **Prepare Your Environment**
   - Ensure you have a passkey-capable device (laptop or phone with fingerprint, Face ID, or WebAuthn support)
   - Install an EVM wallet (MetaMask, Rabby, or a compatible wallet)
   - Configure your wallet for Monad Testnet (Chain ID: 10143)

2. **Obtain Testnet Funds**
   - Visit the Monad faucet: https://faucet.monad.xyz
   - Request testnet MON for your wallet
   - Wait for the transaction to confirm

3. **Owner Registration**
   - Click "Register Owner" in the Trust Setup Panel
   - Use your passkey (fingerprint or Face ID) to authenticate
   - This creates your Privy embedded wallet

4. **Fund Your Owner Wallet**
   - Copy your owner wallet address from the dashboard
   - Send testnet MON to this address from your EVM wallet
   - Wait for the transaction to confirm

5. **Connect Agent Wallet**
   - Click "Connect Agent Wallet" in the Trust Setup Panel
   - Select your EVM wallet (MetaMask, Rabby, or similar)
   - Ensure it is on Monad Testnet
   - Approve the connection

6. **Create Delegation**
   - Select a delegation tier (Micro $5, Routine $50, or Elevated $500)
   - Click "Create Delegation"
   - Approve the transaction in your owner wallet
   - Wait for the delegation to be confirmed on-chain

7. **Test Actions**
   - Try the small purchase ($3), it should approve immediately
   - Try the large purchase ($500), it should trigger the verification flow
   - Monitor the activity feed for transaction status

### Troubleshooting

**Owner wallet not showing funds?**
- Check that you sent funds to the correct owner wallet address
- Wait for the transaction to confirm on the blockchain
- Refresh the page to update the balance display

**Agent wallet connection failed?**
- Ensure your EVM wallet is on Monad Testnet (Chain ID: 10143)
- Check that you have testnet MON in your agent wallet
- Try disconnecting and reconnecting the wallet

**Delegation transaction failed?**
- Ensure your owner wallet has sufficient testnet MON
- Check that you approved the transaction in your Privy wallet
- Review the error message in the activity feed for details

**High-stakes action showing demo mode?**
- This is expected behavior for the hackathon demo
- The system simulates ZK proof verification for presentation purposes
- In production, this would use real cryptographic proof generation

## Configuration

### Environment Variables

VITE_PRIVY_APP_ID=cmtrqskxl00rc0cjiaso8qnzf
VITE_DELEGATION_REGISTRY_ADDRESS=0x088bc310c841fA5ed5b28F37050c3B419572b70d
VITE_AUTHORIZATION_VERIFIER_ADDRESS=0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF

### Requirements

- Passkey-Capable Device: laptop or phone with fingerprint, Face ID, or WebAuthn support
- EVM Wallet: MetaMask, Rabby, or a compatible wallet for agent integration
- Monad Testnet Access: configure wallet for Chain ID 10143
- Testnet MON: obtain from the Monad faucet for contract interaction

## Security Considerations

- No Private Keys in Code: all secrets managed through environment variables
- Privy App ID: a public frontend identifier, not a secret
- Testnet Only: no real funds at risk
- Privacy-First Design: owner identity protected through cryptographic proofs
- Audit Trail: all authorizations logged on-chain with timestamps

## Deployment

**Repository**: https://github.com/Valorian0108/Trustlayer
**Branch**: main
**Network**: Monad Testnet (Chain ID: 10143)
**Deployment**: Vercel with automatic builds

## Judge Pitch

**How It Works:**

"First, the owner registers with a passkey, no seed phrase, just their fingerprint or device. That is their identity, cryptographically locked in. Then they sign one authorization, giving their agent permission to act on their behalf up to a certain tier. If the agent does something small, it just happens, no delay, nothing meaningful is at risk. When the agent tries something bigger, it pauses and walks through the verification sequence. In this build, that final check is simulated for a reliable live demo, standing in for the real on-chain proof check the deployed verifier contract is built to perform. The system is designed so it never has to expose who the owner is, it just confirms the action was authorized."

**Why It Matters:**

"AI agents do not yet have the same judgment humans have. Nobody gets carded buying coffee, but they do for a big purchase. This gives agents that proportional instinct, making them both efficient and trustworthy."

**Privacy Implementation:**

"The verifier interface, a Merkle root plus a nullifier hash, is the correct architecture for anonymous membership proof, matching libraries like Semaphore. The current implementation uses a simplified verifier for demonstration. The full cryptographic proof generation is the next production upgrade, which would provide complete anonymity while maintaining authorization verification."

---

**Built for Monad Metropolis Track 4: Trust, Identity and AI Infrastructure**
