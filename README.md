# Trust Layer

   <img src="assets/logo.webp" alt="Trust Layer Logo" width="300" height="150">

<p align="center">
  <img src="https://img.shields.io/badge/Monad-testnet%2010143-836EF9?style=flat-square&labelColor=14130F" alt="Monad testnet, chain 10143">
  <img src="https://img.shields.io/badge/status-hackathon%20submission-836EF9?style=flat-square&labelColor=14130F" alt="Hackathon submission">
  <img src="https://img.shields.io/badge/smart%20contracts-deployed-2f9e44?style=flat-square&labelColor=14130F" alt="Smart contracts deployed">
  <img src="https://img.shields.io/badge/Privy-integrated-22c55e?style=flat-square&labelColor=14130F" alt="Privy integrated">
  <img src="https://img.shields.io/badge/license-MIT-7e8c86?style=flat-square&labelColor=14130F" alt="MIT license">
</p>

## A Proportional Authorization Infrastructure for AI Agents

> **Small action: proceed. High-stakes action: prove authorization first.**

AI agents are becoming capable of acting on behalf of people.

They can pay, sign, trade, submit transactions, call APIs, update repositories, make purchases, and make decisions that affect real assets or accounts.

But authorization systems are often still binary:

```text
Agent is trusted completely
        OR
Every action requires approval
```

Neither model works well for autonomous agents.

**Trust Layer introduces proportional authorization.**

Small actions can happen with low friction. Normal actions operate within delegated authority. High-stakes actions require stronger authorization proof.

The goal is not to make agents less autonomous.

The goal is to give them **bounded autonomy**.

---

# The Problem

As AI agents become capable of taking actions on behalf of users, the question is no longer only:

> **What can the agent do?**

It is also:

> **What is the agent actually authorized to do?**

Giving an agent unlimited authority creates an unnecessary security boundary.

Requiring a human to approve every action makes autonomous agents impractical.

Consider two actions:

```text
$3 purchase
```

and

```text
$500 purchase
```

Treating both actions identically does not reflect how humans normally think about authorization.

Nobody gets stopped for buying a $3 coffee, but a $500 purchase may require stronger proof.

Trust Layer applies the same principle to AI agents.

---

# The Idea

Trust Layer separates:

* **Identity**
* **Delegation**
* **Risk**
* **Authorization**
* **Execution**

Instead of treating authorization as binary, actions are routed according to their authorization requirements.

```text
Low-risk action
       ↓
Proceed automatically

Normal action
       ↓
Operate within delegation

High-stakes action
       ↓
Require stronger authorization proof
```

This creates a permission boundary between the human owner and the AI agent.

---
 Current Build

The current prototype includes:

* Passkey-based owner registration through Privy
* Privy social login for browsers that do not support WebAuthn
* Owner and agent wallet separation
* Micro, Routine, and Elevated authorization tiers
* Live low-stakes transactions on Monad Testnet
* High-stakes verification demo flow
* Deployed DelegationRegistry contract
* Deployed AuthorizationVerifier contract interface
* Transaction hashes and explorer links
* Activity feed
* Responsive dashboard

The prototype demonstrates the authorization experience and infrastructure direction.

---

# Live vs Simulated

## Live

The following components are currently live:

* Privy passkey authentication
* Privy social login
* Wallet connection
* Owner/agent separation
* Delegation and authorization tier UI
* Low-stakes transaction execution
* Monad Testnet transaction signing
* Explorer transaction links
* Activity feed

## Simulated

The following remains simulated in the current prototype:

final anonymous ZK proof generation;

full anonymous on-chain proof verification.

The prototype demonstrates the architecture, user experience, and permission boundary. The full cryptographic proof layer remains part of the roadmap.

---


# What Trust Layer Does

## 1. Owner Identity

The human owner establishes their identity using a passkey through Privy.

This creates a verified ownership layer that can be used to authorize an agent.

For browsers that don't support WebAuthn, Privy also provides social login methods such as:

* Email
* Google
* GitHub
* Other supported Privy login methods

---

## 2. Agent Delegation

The owner delegates authority to an agent.

A delegation can define:

* Authorization tier
* Limits
* Expiry
* Revocation

The agent receives authority without receiving unlimited control.

Conceptually:

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

An action is authorized when the relevant delegation conditions are satisfied.

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

---

# 3. Action Routing

When an agent attempts an action, Trust Layer evaluates the action against its authorization level.

```text
Agent requests action
        ↓
Trust Layer evaluates risk
        ↓
┌──────────────────────────────┐
│ What level of authorization  │
│ does this action require?    │
└──────────────┬───────────────┘
               ↓
      ┌────────┴────────┐
      ↓                 ↓
   Low Risk          High Risk
      ↓                 ↓
   Execute          Verify
```

The authorization requirement increases with the risk of the action.

---

# 4. Verification

Higher-risk actions require stronger evidence that the human owner authorized the action.

The production direction is privacy-preserving cryptographic verification using zero-knowledge proofs.

The intended model is:

```text
Private authorization information
              ↓
         ZK prover
              ↓
      Cryptographic proof
              ↓
       Public verifier
              ↓
      Authorization result
```

The current implementation demonstrates the high-stakes verification flow.

Full anonymous ZK proof generation and on-chain verification remain part of the future cryptographic implementation.

---

# Authorization Tiers

Trust Layer currently demonstrates three authorization tiers.

| Tier     | Purpose                  | Example                |
| -------- | ------------------------ | ---------------------- |
| Micro    | Low-risk actions         | $3 purchase            |
| Routine  | Normal delegated actions | Regular agent activity |
| Elevated | High-stakes actions      | $500 purchase          |

The important distinction is that authorization requirements increase with risk.

---

# The Security Boundary

Trust Layer treats the **agent wallet as the actor, not the authority**.

```text
┌─────────────────────────────────────┐
│           HUMAN OWNER               │
│                                     │
│  Establishes identity               │
│  Defines delegation                 │
│  Controls authorization             │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│           TRUST LAYER               │
│                                     │
│  Authorization                      │
│  Risk routing                       │
│  Delegation                         │
│  Verification                       │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│          AGENT WALLET               │
│                                     │
│  Acts within the permission boundary│
└─────────────────────────────────────┘
```

The agent wallet can act autonomously, but its authority is constrained by the authorization layer.

This means safety does not have to depend entirely on the AI model behaving correctly.

---

# Example

## Low-Stakes Action

An agent wants to make a $3 purchase.

```text
Agent
  ↓
Request $3 purchase
  ↓
Trust Layer
  ↓
Within delegated authority
  ↓
Execute
```

The user does not need to manually approve every small action.

---

## High-Stakes Action

The same agent wants to make a $500 purchase.

```text
Agent
  ↓
Request $500 purchase
  ↓
Higher-risk action detected
  ↓
Stronger authorization required
  ↓
Verification
  ↓
Execute or Reject
```

This is the core idea behind proportional authorization.

---

# Architecture

```text
                         HUMAN OWNER
                              │
                        Passkey / Privy
                              │
                              ▼
                    ┌───────────────────┐
                    │    DELEGATION     │
                    │                   │
                    │ Tier              │
                    │ Limits            │
                    │ Expiry            │
                    │ Revocation        │
                    └─────────┬─────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │    AGENT    │
                       │    WALLET   │
                       └──────┬──────┘
                              │
                         Action Request
                              │
                              ▼
                    ┌───────────────────┐
                    │   TRUST LAYER     │
                    │                   │
                    │ Risk Evaluation   │
                    │ Authorization     │
                    │ Policy Check      │
                    └─────────┬─────────┘
                              │
                     ┌────────┴────────┐
                     │                 │
                     ▼                 ▼
                  LOW RISK          HIGH RISK
                     │                 │
                     ▼                 ▼
                  EXECUTE            VERIFY
                                       │
                              ┌────────┴────────┐
                              │                 │
                              ▼                 ▼
                           ZK Proof           Reject
                              │
                              ▼
                        MONAD TESTNET
```

---

# Why Zero-Knowledge Proofs?

For high-stakes actions, simply saying:

> "The owner authorized this."

is not enough.

The system should eventually be able to prove that the required authorization conditions were satisfied without unnecessarily exposing the owner's identity or private authorization information.

This is where zero-knowledge proofs fit into Trust Layer.

The current implementation establishes the authorization architecture and demonstrates the high-stakes verification flow. The complete anonymous ZK proof generation and on-chain verification remain part of the roadmap.

---
# Why Monad Chain?

The permission boundary needs to govern actions that ultimately affect onchain assets and accounts. Putting the delegation and verification layer onchain gives the authorization state a shared, verifiable source of truth that can be checked independently of the AI agent.

And if agents are going to perform frequent, granular actions, the authorization infrastructure needs an execution environment where those actions are practical at high throughput and low latency. The prototype uses Monad Testnet for that execution layer.

---
# Beyond Payments

Payments are the current demo, but **authorization is the product**.

The same model can apply anywhere an agent wallet is given authority to act.

| Domain          | Lower-Risk Action | Higher-Risk Action           |
| --------------- | ----------------- | ---------------------------- |
| Payments        | $3 purchase       | $500 purchase                |
| Trading         | Small trade       | Large position               |
| GitHub          | Open a PR         | Deploy to production         |
| Business        | Create a document | Sign a contract              |
| APIs            | Read data         | Delete production data       |
| DAO             | Read a proposal   | Execute treasury transaction |
| Personal Agents | Add to cart       | Complete large purchase      |

The underlying infrastructure remains:

```text
Identity
   ↓
Delegation
   ↓
Risk
   ↓
Authorization
   ↓
Execution
```

---

# What the Agent Does

Trust Layer does not attempt to replace the AI agent.

The AI agent is responsible for:

* Understanding the user's intent
* Planning actions
* Requesting actions
* Executing actions within its delegated authority

Trust Layer is responsible for:

* Determining whether the agent wallet has authority
* Applying authorization policies
* Routing actions according to risk
* Requiring stronger verification when necessary

```text
AI AGENT
"Can I do this?"

       ↓

TRUST LAYER
"Are you authorized to do this?"

       ↓

EXECUTION
"Proceed or reject."
```

---

#
---

# Deployed Contracts

### Monad Testnet

**Network:** Monad Testnet
**Chain ID:** 10143
**RPC:** `https://testnet-rpc.monad.xyz`

### DelegationRegistry

```text
0x088bc310c841fA5ed5b28F37050c3B419572b70d
```

### AuthorizationVerifier

```text
0xEc1d82473aCC8AE1BC1F9B0D79C9dd8a2ee6cFaF
```

---

# Tech Stack

* Monad Testnet
* Privy
* WebAuthn / P256
* ethers.js
* React
* Vite
* Solidity
* MetaMask
* Rabby
* MonadScan

---

# Demo Flow

The intended demonstration is:

```text
1. Register owner with passkey or social login
                    ↓
2. Connect agent wallet
                    ↓
3. Create delegation tier
                    ↓
4. Run low-stakes $3 purchase
                    ↓
5. Low-friction execution
                    ↓
6. Run high-stakes $500 purchase
                    ↓
7. Verification is triggered
                    ↓
8. Review authorization activity
                    ↓
9. Review transaction links
```

The demo shows the difference between acting within delegated authority and requiring stronger authorization for a high-stakes action.

---

# Running Locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Environment Variables

Create a `.env` file containing:

```env
VITE_PRIVY_APP_ID=

VITE_DELEGATION_REGISTRY_ADDRESS=

VITE_AUTHORIZATION_VERIFIER_ADDRESS=
```

## Requirements

To run the demo, you need:

* A passkey-capable device, or social login
* An EVM wallet
* Monad Testnet configured
* Testnet MON

---

# Threat Model

Trust Layer is designed around the assumption that an agent wallet should not automatically inherit unlimited authority from the human who created it.

| Threat                                    | Trust Layer Response                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| Agent wallet attempts unauthorized action | Authorization check                                   |
| Delegation expires                        | Reject action                                         |
| Delegation is revoked                     | Reject action                                         |
| Agent wallet exceeds limits               | Reject or require stronger authorization              |
| High-value action                         | Route to verification                                 |
| Compromised agent wallet                  | Limit authority through delegation                    |
| Replay attempt                            | Production design requires nonce/nullifier mechanisms |

The security model is therefore based on **constrained authority rather than unrestricted trust**.

---

# Security Notes

Trust Layer is currently a **testnet proof of concept**.

It does not custody real funds and should not be treated as production authorization infrastructure.

A production implementation would require additional work, including:

* Complete ZK proof generation
* Stronger verifier testing
* Smart-contract audits
* Production-grade revocation
* Replay protection
* Nullifiers
* Mobile proof generation
* Monitoring
* Failure handling

---

# Roadmap

## Phase 1 - Hackathon Prototype

* Passkey and social login owner identity
* Agent wallet separation
* Delegation tiers
* Risk-based action routing
* Monad Testnet transactions
* High-stakes verification flow
* Authorization contracts

## Phase 2 - Cryptographic Authorization

* Complete ZK proof generation
* Anonymous authorization proofs
* On-chain proof verification
* Replay protection
* Nullifiers
* Stronger delegation policies
* Improved revocation

## Phase 3 - Agent Authorization Infrastructure

Expand Trust Layer beyond payments into a reusable authorization layer for:

* Financial agents
* Coding agents
* Business agents
* DAO agents
* API agents
* Personal agents
* Autonomous applications

The long-term goal is to provide a standard permission boundary between humans, agent wallets, and the actions those agents are allowed to perform.

---

# Project Direction

AI agents are becoming capable of acting on behalf of people.

For that to scale, agents need room to act without receiving unlimited authority.

Trust Layer is designed around that boundary:

```text
Human Owner
     ↓
Defines Authority
     ↓
Agent Wallet
     ↓
Requests Action
     ↓
Trust Layer
     ↓
Evaluates Risk
     ↓
Authorization
     ↓
Execution
```

Trust Layer is not trying to make AI agents more powerful.

It is trying to make them safer to use while preserving autonomy.

The underlying principle is:

```text
SMALL ACTION
     ↓
  PROCEED

NORMAL ACTION
     ↓
 DELEGATE

HIGH-STAKES ACTION
     ↓
PROVE AUTHORIZATION FIRST
```

**Agent wallets should be able to operate independently without being given unlimited authority.**

Payments are the demo.

**Authorization is the product.**

---

# Built for Monad Metropolis

**Track 4 - Trust, Identity & AI Infrastructure**

Trust Layer explores a permission boundary for an onchain economy where AI agents can act on behalf of humans without inheriting unlimited authority.

The core question is simple:

> **If agents are going to act in the onchain economy, what should they be allowed to do - and how can that authority be verified?**
