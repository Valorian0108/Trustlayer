# Trust Layer

**Proportional Authorization Infrastructure for AI Agents**
---
Trust Layer is an authorization layer for AI agents that treats actions according to their risk. Small actions can happen with low friction. High-stakes actions require proof that a verified human owner actually authorized the agent.

The idea is simple: AI agents should not be trusted with everything by default, and they should not be forced to ask for approval on every tiny action. Human trust does not work that way. Nobody gets stopped for buying a $3 coffee, but a $500 purchase should require stronger proof.

Trust Layer gives agents that proportional instinct.

## The Idea

AI agents are starting to act on behalf of people. They can pay, sign, trade, submit transactions, call APIs, update repos, and make decisions that affect real assets or real accounts.

The problem is that most authorization systems are still binary. Either the agent is trusted completely, or every action requires manual approval. Both approaches are bad.

If the agent is trusted completely, it can become dangerous. If every action requires approval, the agent becomes too slow to be useful.

Trust Layer sits in the middle. It lets low-risk actions move quickly while forcing high-risk actions to prove that the human owner gave valid authorization.

## What Trust Layer Does

Trust Layer gives an AI agent a risk-based permission path.

It allows:

- low-stakes actions to execute immediately;
- higher-stakes actions to trigger a verification flow;
- the human owner to register with passkey authentication;
- the owner to create a delegation for the agent;
- the delegation to include a tier, expiry, and revocation path;
- actions to leave an audit trail on-chain;
- future proof-based verification without exposing the owner's private identity.

Payments are used as the demo case, but the product is not only a payment app. The real product is the authorization layer that an agent checks before acting.

## Why This Matters

AI agents are becoming more capable, but capability without permission control is risky.

A useful agent needs room to act. A safe agent needs limits. Trust Layer is built around that balance.

The product value is strongest in any workflow where an agent can perform actions with different levels of consequence. Examples include payments, trading, signing documents, making purchases, managing repositories, or operating on behalf of a DAO or business account.

The agent should not need human approval for every harmless action. But when the action crosses a meaningful threshold, the agent should prove that it has permission.

## How It Works

Trust Layer works in four layers.

1. **Owner identity layer**

   The human owner registers with a passkey using Privy. This avoids seed phrases and uses biometric or hardware-backed authentication through WebAuthn/P256.

2. **Delegation layer**

   The owner creates a delegation for the agent. The delegation defines what level of action the agent is allowed to perform, how long that permission lasts, and how it can be revoked.

3. **Action routing layer**

   When the agent attempts an action, Trust Layer checks the action size or risk tier.

   If the action is below the allowed threshold, it can proceed with low friction.

   If the action is above the threshold, the system triggers a verification flow before the agent can continue.

4. **Verification layer**

   The long-term design is to verify authorization with privacy-preserving cryptographic proof. The verifier should be able to confirm that the agent is authorized without exposing the owner's identity or wallet details.

   In the current hackathon build, low-stakes transactions settle live on Monad Testnet. The high-stakes proof verification flow is simulated in the UI for a reliable demo, while the verifier contract and interface are shaped for a full proof-based implementation.


## Current Build

The current build includes:

- passkey-based owner registration through Privy;
- owner and agent wallet separation;
- delegation tier system with Micro, Routine, and Elevated levels;
- live low-stakes transaction flow on Monad Testnet;
- high-stakes verification demo flow;
- deployed DelegationRegistry contract;
- deployed AuthorizationVerifier contract interface;
- transaction hashes and MonadScan links;
- activity feed for action history;
- responsive single-screen dashboard for demo presentation.

The current build is a proof of concept. It demonstrates the proportional authorization flow and the agent permission model. Full anonymous ZK proof generation is not completed yet.

## What Is Live And What Is Simulated

Live:

- owner registration with Privy passkeys;
- wallet connection;
- low-stakes transaction flow;
- Monad Testnet transaction signing;
- explorer links;
- delegation and action UI flow.

Simulated:

- final high-stakes ZK proof generation;
- final anonymous on-chain proof verification for elevated actions.

This distinction matters. Trust Layer is not claiming that the full ZK system is production-ready. The current demo proves the product flow, contract direction, and authorization model. The next step is replacing the simulated high-stakes check with real proof generation and verification.

## Deployed Contracts

Network:

```text
Monad Testnet
Chain ID: 10143
RPC: https://testnet-rpc.monad.xyz

Contracts:

DelegationRegistry: 0x088bc310c841fA5ed5b28F37050c3B419572b70d
AuthorizationVerifier: 0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF

Tools Used

- Monad Testnet for live blockchain execution.
- Privy for passkey-based owner authentication.
- WebAuthn/P256 for biometric or hardware-backed owner identity.
- ethers.js for contract and wallet interaction.
- React and Vite for the frontend.
- EVM wallets such as MetaMask or Rabby for agent wallet connection.
- MonadScan for transaction verification.
- Solidity contracts for delegation and verifier infrastructure.

## Demo Flow

1. Register the owner with a passkey.
2. Connect an agent wallet.
3. Create a delegation tier for the agent.
4. Run a low-stakes action, such as a $3 purchase.
5. Watch it execute with low friction.
6. Run a high-stakes action, such as a $500 purchase.
7. Watch the verification flow trigger before approval.
8. Review the activity feed and transaction links.


## Running Locally

Install dependencies:
npm install

Start the app:
npm run dev

## Environment Variables

VITE_PRIVY_APP_ID=
VITE_DELEGATION_REGISTRY_ADDRESS=
VITE_AUTHORIZATION_VERIFIER_ADDRESS=

The Privy app ID is a public frontend identifier. Private keys and wallet secrets should never be placed in the frontend code.

## Requirements
- Passkey-capable device such as a laptop or phone with fingerprint, Face ID, or WebAuthn support.
- EVM wallet such as MetaMask or Rabby.
- Monad Testnet configured in the wallet.
- Testnet MON from the Monad faucet.

## Security Notes
Trust Layer is currently a testnet proof of concept.
No real funds should be used. The system is built for demonstration and research, not production custody.
The intended production version would require:
- complete ZK proof generation;
- stronger verifier contract testing;
- audited contracts;
- production-grade revocation logic;
- replay protection with nullifiers;
- mobile-friendly proof generation;
- monitoring and failure handling.

## Project Direction
Trust Layer is not trying to make AI agents more powerful. It is trying to make them safer to use.
The long-term direction is a reusable authorization layer for agentic systems. Any AI agent that acts on behalf of a person, organization, DAO, or wallet should have to operate inside a permission boundary.
The goal is for agents to become useful without becoming reckless.
Small action: proceed.

---
High-stakes action: prove authorization first.
