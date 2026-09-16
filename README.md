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
# Trust Layer

**Proportional Authorization Infrastructure for AI Agents**

> **Small action: proceed. High-stakes action: prove authorization first.**

Trust Layer is an authorization layer for AI agents that treats actions according to their risk.

Small actions can happen with low friction. High-stakes actions require proof that a verified human owner actually authorized the agent.

The idea is simple: AI agents should not be trusted with everything by default, and they should not be forced to ask for approval on every tiny action.

Human trust does not work that way.

Nobody gets stopped for buying a $3 coffee, but a $500 purchase should require stronger proof.

**Trust Layer gives agents that proportional instinct.**

---

# The Idea

AI agents are starting to act on behalf of people.

They can:

* Pay
* Sign
* Trade
* Submit transactions
* Call APIs
* Update repositories
* Make purchases
* Make decisions that affect real assets or real accounts

The problem is that most authorization systems are still binary.

Either:

```text
Agent is trusted completely
        OR
Every action requires approval
```

Both approaches create problems.

If the agent is trusted completely, it can become dangerous.

If every action requires approval, the agent becomes too slow to be useful.

Trust Layer sits in the middle.

```text
                 TRUST LAYER

       Low Risk                 High Risk
          │                         │
          ▼                         ▼
     Execute quickly          Verify authority
          │                         │
          └──────────┬──────────────┘
                     ▼
                  Execute
```

The goal is to give agents autonomy without giving them unlimited authority.

---

# What Trust Layer Does

Trust Layer gives an AI agent a **risk-based permission path**.

It allows:

* Low-stakes actions to execute immediately
* Higher-stakes actions to trigger a verification flow
* The human owner to register with passkey authentication
* The owner to create a delegation for the agent
* The delegation to include a tier, expiry, and revocation path
* Actions to leave an audit trail on-chain
* Future proof-based verification without exposing the owner's private identity

Payments are used as the demo case, but the product is not only a payment app.

**Payments are the demo. Authorization is the product.**

The real product is the authorization layer that an agent checks before acting.

---

# Why This Matters

AI agents are becoming more capable, but capability without permission control is risky.

A useful agent needs room to act.

A safe agent needs limits.

Trust Layer is built around that balance.

The product value is strongest in any workflow where an agent can perform actions with different levels of consequence.

Examples include:

| Domain         | Lower-Risk Action   | Higher-Risk Action           |
| -------------- | ------------------- | ---------------------------- |
| Payments       | $3 purchase         | $500 purchase                |
| Trading        | Small trade         | Large position               |
| GitHub         | Open a pull request | Deploy to production         |
| Business       | Create a document   | Sign a contract              |
| APIs           | Read data           | Delete production data       |
| DAO            | Read proposal       | Execute treasury transaction |
| Personal Agent | Add item to cart    | Complete large purchase      |

The agent should not need human approval for every harmless action.

But when the action crosses a meaningful threshold, the agent should prove that it has permission.

---

# Core Principle

Trust Layer separates **agency** from **authority**.

The AI agent has agency.

The human owner controls authority.

```text
              HUMAN OWNER
                   │
                   │ Delegates authority
                   ▼
              AI AGENT
                   │
                   │ Requests action
                   ▼
             TRUST LAYER
                   │
                   │ Checks authority
                   ▼
              ACTION
```

The agent can request an action.

Trust Layer determines whether that action is authorized.

---

# How It Works

Trust Layer works in four layers.

## 1. Owner Identity Layer

The human owner registers with a passkey using Privy.

This avoids seed phrases and uses biometric or hardware-backed authentication through WebAuthn/P256.

```text
Human Owner
     │
     ▼
Passkey
     │
     ▼
Privy
     │
     ▼
Verified Owner
```

---

## 2. Delegation Layer

The owner creates a delegation for the agent.

The delegation defines:

* What level of action the agent is allowed to perform
* How long that permission lasts
* How it can be revoked

Conceptually:

```text
Delegation
├── Owner
├── Agent
├── Authorization Tier
├── Limits
├── Expiry
└── Revocation Status
```

The agent does not automatically inherit all of the owner's authority.

It receives only the authority that the owner explicitly delegates.

---

## 3. Action Routing Layer

When the agent attempts an action, Trust Layer checks the action size or risk tier.

```text
                 ACTION REQUEST
                        │
                        ▼
                ┌──────────────┐
                │ Trust Layer  │
                │ Risk Check   │
                └──────┬───────┘
                       │
             ┌─────────┼─────────┐
             │         │         │
             ▼         ▼         ▼
          MICRO     ROUTINE   ELEVATED
             │         │         │
             ▼         ▼         ▼
          Execute   Delegate   Verify
             │         │         │
             └─────────┼─────────┘
                       ▼
                    Execute
```

If the action is below the allowed threshold, it can proceed with low friction.

If the action is above the threshold, the system triggers a verification flow before the agent can continue.

---

## 4. Verification Layer

The long-term design is to verify authorization with privacy-preserving cryptographic proof.

The verifier should be able to confirm that the agent is authorized without exposing the owner's identity or wallet details.

The intended model is:

```text
Agent
  │
  │ Requests elevated action
  ▼
Trust Layer
  │
  │ Checks delegation
  ▼
Proof Generation
  │
  │ Generates authorization proof
  ▼
AuthorizationVerifier
  │
  ├── Valid ───────► Execute
  │
  └── Invalid ────► Reject
```

In the current hackathon build, low-stakes transactions settle live on Monad Testnet.

The high-stakes proof verification flow is simulated in the UI for a reliable demo, while the verifier contract and interface are shaped for a full proof-based implementation.

---

# Authorization Tiers

Trust Layer currently uses three delegation levels.

## Micro

Designed for low-stakes actions.

```text
Micro
  │
  ▼
Low consequence
  │
  ▼
Low friction
  │
  ▼
Execute
```

Example:

```text
$3 purchase
```

---

## Routine

Designed for normal delegated actions that remain within the owner's configured authority.

```text
Routine
  │
  ▼
Normal delegated action
  │
  ▼
Check delegation
  │
  ▼
Execute if authorized
```

---

## Elevated

Designed for high-stakes actions.

```text
Elevated
  │
  ▼
High consequence
  │
  ▼
Additional verification
  │
  ▼
Execute if authorized
```

Example:

```text
$500 purchase
```

---

# Authorization Model

A delegation conceptually binds an owner to an agent with explicit constraints.

```text
Delegation {
    owner
    agent
    tier
    limit
    expiry
    nonce
    revoked
}
```

An action is authorized only when the delegation is valid and the requested action satisfies its constraints.

Conceptually:

```text
Authorized =
    delegation exists
    AND delegation is not expired
    AND delegation is not revoked
    AND agent matches
    AND action satisfies tier
    AND action satisfies limits
```

For elevated actions, an additional authorization proof is required.

---

# Architecture

```text
                         HUMAN OWNER
                              │
                              │
                        Passkey / Privy
                              │
                              ▼
                    ┌───────────────────┐
                    │    Delegation     │
                    │                   │
                    │ Tier              │
                    │ Limits            │
                    │ Expiry            │
                    │ Revocation        │
                    └─────────┬─────────┘
                              │
                              │ Permission
                              ▼
                       ┌─────────────┐
                       │  AI AGENT   │
                       └──────┬──────┘
                              │
                              │ Action Request
                              ▼
                    ┌───────────────────┐
                    │   TRUST LAYER     │
                    │                   │
                    │ Risk Evaluation   │
                    │ Authorization     │
                    │ Policy Check      │
                    └─────────┬─────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
                LOW RISK            HIGH RISK
                    │                   │
                    ▼                   ▼
                EXECUTE             VERIFY
                    │                   │
                    │              ┌────┴────┐
                    │              │         │
                    │              ▼         ▼
                    │          ZK Proof   Reject
                    │              │
                    └───────┬──────┘
                            ▼
                     MONAD TESTNET
```

---

# The $3 vs $500 Example

Trust Layer is easiest to understand through a simple example.

## $3 Purchase

```text
Agent wants to spend $3
          │
          ▼
     Risk check
          │
          ▼
 Within delegation
          │
          ▼
       Execute
```

The agent does not need to stop the human for a harmless action.

---

## $500 Purchase

```text
Agent wants to spend $500
          │
          ▼
     Risk check
          │
          ▼
 Above threshold
          │
          ▼
 Require authorization
          │
          ▼
 Verify delegation
          │
          ▼
 Execute if authorized
```

The same agent can remain autonomous while higher-consequence actions require stronger authorization.

---

# What The AI Does

Trust Layer is designed for AI agents, but **the AI is not the trust source**.

The agent is the actor.

**Trust Layer is the permission boundary.**

The AI can decide that it wants to perform an action, but it still has to pass through the authorization rules.

That means the system does not rely only on the model's judgment.

It uses:

* Explicit tiers
* Owner delegation
* Passkey authentication
* Contract state
* Verification logic

This is important because agent safety should not depend on asking the model to behave.

**It should be enforced by infrastructure.**

---

# Why Zero-Knowledge Proofs?

The long-term design uses privacy-preserving cryptographic proof.

A traditional authorization system may require the verifier to learn information about the owner.

Trust Layer aims to separate:

**Authorization**

from

**Identity disclosure.**

The verifier should eventually be able to establish:

> This action was authorized by a valid delegation.

without unnecessarily exposing:

* The owner's identity
* Private wallet information
* Unrelated account information

The intended flow is:

```text
Owner
  │
  │ Creates delegation
  ▼
Delegation Commitment
  │
  ▼
Agent Requests Elevated Action
  │
  ▼
Proof Generation
  │
  ▼
ZK Proof
  │
  ▼
AuthorizationVerifier
  │
  ├── Valid ───────► Execute
  │
  └── Invalid ────► Reject
```

The current hackathon implementation simulates the proof-generation and final verification stages.

---

# Security Boundary

The AI model is **not** the trust boundary.

The authorization infrastructure is.

```text
┌─────────────────────────────────────┐
│             AI AGENT                │
│                                     │
│  May make incorrect decisions       │
│  May request unauthorized actions   │
│  May be compromised                 │
└──────────────────┬──────────────────┘
                   │
                   │ Action Request
                   ▼
┌─────────────────────────────────────┐
│           TRUST LAYER               │
│                                     │
│  Delegation                         │
│  Risk Tier                          │
│  Limits                             │
│  Expiry                             │
│  Revocation                         │
│  Verification                       │
└──────────────────┬──────────────────┘
                   │
                   │ Authorized Action
                   ▼
             Blockchain / API
```

The goal is that even if an agent behaves incorrectly, it should not be able to exceed the authority delegated to it.

---

# Threat Model

Trust Layer assumes that an AI agent may behave incorrectly, become compromised, or attempt an action outside its intended scope.

The authorization layer therefore does not treat the agent itself as trusted.

| Threat                         | Trust Layer Response                                     |
| ------------------------------ | -------------------------------------------------------- |
| Compromised AI agent           | Agent remains constrained by delegation                  |
| Unauthorized large transaction | Elevated actions require verification                    |
| Expired delegation             | Delegation expiry prevents continued use                 |
| Revoked agent                  | Revocation invalidates the delegation                    |
| Replay attack                  | Production design uses nonces/nullifiers                 |
| Compromised frontend           | Authorization should ultimately be enforced by contracts |
| Owner impersonation            | Passkey/WebAuthn provides strong owner authentication    |

These controls are part of the current architecture or intended production design, depending on the feature.

---

# Beyond Payments

Payments are the first demonstration because they make proportional authorization easy to understand.

The same authorization infrastructure can apply to any workflow where an AI agent can take actions with different levels of consequence.

## Finance

* Payments
* Trading
* Treasury management
* Spending limits
* Automated transfers

## Software

* Repository changes
* Pull requests
* Production deployments
* Infrastructure changes
* API operations

## Business

* Procurement
* Contract signing
* Expense management
* Vendor operations

## DAOs and Web3

* Treasury operations
* Governance actions
* Token transfers
* Protocol administration

## Personal Agents

* Purchases
* Subscriptions
* Bookings
* Account management

The underlying product remains the same:

> **An authorization layer that determines what an agent is allowed to do.**

---

# Current Build

The current build includes:

* Passkey-based owner registration through Privy
* Owner and agent wallet separation
* Delegation tier system with Micro, Routine, and Elevated levels
* Live low-stakes transaction flow on Monad Testnet
* High-stakes verification demo flow
* Deployed `DelegationRegistry` contract
* Deployed `AuthorizationVerifier` contract interface
* Transaction hashes and MonadScan links
* Activity feed for action history
* Responsive single-screen dashboard for demo presentation

The current build is a proof of concept.

It demonstrates the proportional authorization flow and the agent permission model.

**Full anonymous ZK proof generation is not completed yet.**

---

# What Is Live And What Is Simulated

## Live

* Owner registration with Privy passkeys
* Wallet connection
* Low-stakes transaction flow
* Monad Testnet transaction signing
* Explorer links
* Delegation and action UI flow

## Simulated

* Final high-stakes ZK proof generation
* Final anonymous on-chain proof verification for elevated actions

This distinction matters.

Trust Layer is not claiming that the full ZK system is production-ready.

The current demo proves:

* The product flow
* Contract direction
* Authorization model
* Proportional-risk concept

The next step is replacing the simulated high-stakes check with real proof generation and verification.

---

# Deployed Contracts

## Network

```text
Monad Testnet
Chain ID: 10143
RPC: https://testnet-rpc.monad.xyz
```

## Contracts

```text
DelegationRegistry:
0x088bc310c841fA5ed5b28F37050c3B419572b70d

AuthorizationVerifier:
0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF
```

---

# Tools Used

* **Monad Testnet** — live blockchain execution
* **Privy** — passkey-based owner authentication
* **WebAuthn/P256** — biometric or hardware-backed owner identity
* **ethers.js** — contract and wallet interaction
* **React + Vite** — frontend
* **MetaMask / Rabby** — EVM wallet connection
* **MonadScan** — transaction verification
* **Solidity** — delegation and verifier infrastructure

---

# Demo Flow

1. Register the owner with a passkey.
2. Connect an agent wallet.
3. Create a delegation tier for the agent.
4. Run a low-stakes action, such as a $3 purchase.
5. Watch it execute with low friction.
6. Run a high-stakes action, such as a $500 purchase.
7. Watch the verification flow trigger before approval.
8. Review the activity feed and transaction links.

---

# Running Locally

## Install Dependencies

```bash
npm install
```

## Start the App

```bash
npm run dev
```

## Open

```text
http://localhost:5173
```

---

# Environment Variables

```env
VITE_PRIVY_APP_ID=
VITE_DELEGATION_REGISTRY_ADDRESS=
VITE_AUTHORIZATION_VERIFIER_ADDRESS=
```

The Privy app ID is a public frontend identifier.

Private keys and wallet secrets should never be placed in the frontend code.

---

# Requirements

* Passkey-capable device such as a laptop or phone with fingerprint, Face ID, or WebAuthn support
* EVM wallet such as MetaMask or Rabby
* Monad Testnet configured in the wallet
* Testnet MON from the Monad faucet

---

# Security Notes

Trust Layer is currently a **testnet proof of concept**.

**No real funds should be used.**

The system is built for demonstration and research, not production custody.

The intended production version would require:

* Complete ZK proof generation
* Stronger verifier contract testing
* Audited contracts
* Production-grade revocation logic
* Replay protection with nullifiers
* Mobile-friendly proof generation
* Monitoring and failure handling

---

# Roadmap

## Phase 1 — Hackathon Prototype

* [x] Passkey owner registration
* [x] Agent wallet separation
* [x] Delegation tiers
* [x] Monad Testnet execution
* [x] DelegationRegistry
* [x] AuthorizationVerifier interface
* [x] Activity feed
* [x] High-stakes verification demo

## Phase 2 — Cryptographic Authorization

* [ ] Real ZK proof generation
* [ ] On-chain proof verification
* [ ] Nullifier-based replay protection
* [ ] Production-grade revocation
* [ ] Expanded authorization policies

## Phase 3 — Agent Authorization Infrastructure

* [ ] SDK for AI agents
* [ ] Standard authorization API
* [ ] Multi-chain support
* [ ] DAO and business delegation
* [ ] Policy engine
* [ ] Developer dashboard

---

# Project Direction

Trust Layer is not trying to make AI agents more powerful.

It is trying to make them **safer to use**.

The long-term direction is a reusable authorization layer for agentic systems.

Any AI agent that acts on behalf of a:

* Person
* Organization
* DAO
* Business
* Wallet

should have to operate inside a permission boundary.

The goal is for agents to become useful without becoming reckless.

---

# The Trust Layer Principle

```text
┌───────────────────────────────────────┐
│                                       │
│        SMALL ACTION                   │
│                                       │
│           PROCEED                     │
│                                       │
├───────────────────────────────────────┤
│                                       │
│        NORMAL ACTION                  │
│                                       │
│           DELEGATE                    │
│                                       │
├───────────────────────────────────────┤
│                                       │
│        HIGH-STAKES ACTION             │
│                                       │
│      PROVE AUTHORIZATION FIRST        │
│                                       │
└───────────────────────────────────────┘
```

**Trust Layer gives AI agents room to act without giving them unlimited authority.**



## Scope And Corrections

This README is written to make the project clearer in three ways.

First, Trust Layer is framed as proportional authorization infrastructure, not just an AI security demo or a payment app. Payments are only the easiest way to show the permission problem.

Second, the project separates what is live from what is simulated. Low-stakes transaction flow and the wallet/passkey experience are live on Monad Testnet. High-stakes ZK proof generation is not complete yet, so it is shown as a demo flow.

Third, the AI agent is treated as the actor, not the source of trust. The system does not depend on the model behaving correctly. Trust comes from owner registration, delegation tiers, contract state, verification logic, and future cryptographic proof.


