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

## The Idea

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

```text
Agent is trusted completely
        OR
Every action requires approval
```

Neither model works well for autonomous agents.

Trust Layer introduces a third model:

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

The goal is not to make agents less autonomous.

The goal is to give them **bounded autonomy**.

---

## What Trust Layer Does

Trust Layer separates **identity, delegation, risk, and authorization**.

### 1. Owner Identity

The human owner establishes their identity using a passkey through Privy.

This creates a verified ownership layer that can be used to authorize an agent.

**Note:** For browsers that don't support WebAuthn, Privy also provides social login methods (email, Google, GitHub, etc.) as a fallback.

### 2. Agent Delegation

The owner delegates authority to an agent.

Delegation can define:

* Authorization tier
* Limits
* Expiry
* Revocation

The agent receives authority without receiving unlimited control.

### 3. Action Routing

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

### 4. Verification

Higher-risk actions require stronger evidence that the human owner authorized the action.

The production direction is privacy-preserving cryptographic verification using zero-knowledge proofs.

---

# Authorization Tiers

Trust Layer currently demonstrates three authorization tiers.

| Tier         | Purpose                  | Example                |
| ------------ | ------------------------ | ---------------------- |
| **Micro**    | Low-risk actions         | $3 purchase            |
| **Routine**  | Normal delegated actions | Regular agent activity |
| **Elevated** | High-stakes actions      | $500 purchase          |

The important distinction is that **authorization requirements increase with risk**.

(you can check the "how it works guide" in HOW_IT_WORKS.md)
---

# Authorization Model

A delegation can be thought of conceptually as:

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

This creates a permission boundary between the human owner and the AI agent.

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
                       │  AGENT       │
                       │  WALLET      │
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

# Example

### Low-Stakes Action

An agent wants to make a **$3 purchase**.

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

### High-Stakes Action

The same agent wants to make a **$500 purchase**.

```text
Agent
  ↓
Request $500 purchase
  ↓
Trust Layer
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

# The Security Boundary

Trust Layer treats the agent wallet as the **actor**, not the authority.

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

# Why Zero-Knowledge Proofs?

For high-stakes actions, simply saying:

> "The owner authorized this."

is not enough.

The system should eventually be able to prove that the required authorization conditions were satisfied **without unnecessarily exposing the owner's identity or private authorization information**.

This is where zero-knowledge proofs fit into Trust Layer.

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

The current implementation demonstrates the high-stakes verification flow, while the full anonymous ZK proof generation and on-chain verification remain part of the future cryptographic implementation.

---

# Beyond Payments

Payments are the demo, but authorization is the product.

The same model can apply anywhere an agent wallet is given authority to act.

| Domain              | Lower-Risk Action | Higher-Risk Action           |
| ------------------- | ----------------- | ---------------------------- |
| **Payments**        | $3 purchase       | $500 purchase                |
| **Trading**         | Small trade       | Large position               |
| **GitHub**          | Open a PR         | Deploy to production         |
| **Business**        | Create a document | Sign a contract              |
| **APIs**            | Read data         | Delete production data       |
| **DAO**             | Read a proposal   | Execute treasury transaction |
| **Personal Agents** | Add to cart       | Complete large purchase      |

The underlying infrastructure remains the same:

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

# What The Agent Wallet Does

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

**Note:** In the current demo, the "agent wallet" is manually controlled by the user via an external wallet (MetaMask, Rabby, etc.) to demonstrate the authorization infrastructure. The system is designed to support autonomous AI agents executing actions within delegated authority boundaries.

---

# Current Build

The current prototype includes:

* Passkey-based owner registration through Privy (Social login also available through Privy for browsers not supporting WebAuthn)
* Owner and agent wallet separation
* Micro, Routine, and Elevated authorization tiers
* Live low-stakes transactions on Monad Testnet
* High-stakes verification demo flow
* Deployed `DelegationRegistry` contract
* Deployed `AuthorizationVerifier` contract interface
* Transaction hashes and explorer links
* Activity feed
* Responsive dashboard

The prototype demonstrates the authorization experience and infrastructure direction.

---

# Live vs Simulated

### Live

The following components are currently live:

* Privy passkey authentication
* Privy social login (email, Google, GitHub, etc.)
* Wallet connection
* Owner/agent separation
* Delegation and authorization tier UI
* Low-stakes transaction execution
* Monad Testnet transaction signing
* Explorer transaction links
* Activity feed

### Simulated

The following remains simulated in the current prototype:

* Final anonymous ZK proof generation
* Full anonymous on-chain proof verification

The goal is to demonstrate the architecture and user experience while establishing the foundation for the complete cryptographic authorization layer.

---

# Deployed Contracts

## Monad Testnet

**Network:** Monad Testnet
**Chain ID:** `10143`
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

# Tools Used

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

The demo shows the difference between **acting within delegated authority** and **requiring stronger authorization for a high-stakes action**.

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

---

# Environment Variables

Create a `.env` file containing:

```env
VITE_PRIVY_APP_ID=

VITE_DELEGATION_REGISTRY_ADDRESS=

VITE_AUTHORIZATION_VERIFIER_ADDRESS=
```

---

# Requirements

To run the demo, you need:

* A passkey-capable device (or use social login)
* An EVM wallet
* Monad Testnet configured
* Testnet MON

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

# Threat Model

Trust Layer is designed around the assumption that an agent wallet should not automatically inherit unlimited authority from the human who created it.

Potential failure cases include:

| Threat                             | Trust Layer Response                                  |
| ---------------------------------- | ----------------------------------------------------- |
| Agent wallet attempts unauthorized action | Authorization check                                   |
| Delegation expires                 | Reject action                                         |
| Delegation is revoked              | Reject action                                         |
| Agent wallet exceeds limits               | Reject or require stronger authorization              |
| High-value action                  | Route to verification                                 |
| Compromised agent wallet                  | Limit authority through delegation                    |
| Replay attempt                     | Production design requires nonce/nullifier mechanisms |

The security model is therefore based on **constrained authority rather than unrestricted trust**.

---

# Roadmap

## Phase 1 — Hackathon Prototype

* Passkey and social login owner identity
* Agent wallet separation
* Delegation tiers
* Risk-based action routing
* Monad Testnet transactions
* High-stakes verification flow
* Authorization contracts

## Phase 2 — Cryptographic Authorization

* Complete ZK proof generation
* Anonymous authorization proofs
* On-chain proof verification
* Replay protection
* Nullifiers
* Stronger delegation policies
* Improved revocation

## Phase 3 — Agent Authorization Infrastructure

Expand Trust Layer beyond payments into a reusable authorization layer for:

* Financial agents
* Coding agents
* Business agents
* DAO agents
* API agents
* Personal agents
* Autonomous applications

The long-term goal is to provide a standard permission boundary between **humans, agent wallets, and the actions those agents are allowed to perform**.

---

# Project Direction

Trust Layer is not trying to make AI agents more powerful.

It is trying to make them **safer to use while preserving autonomy**.

The underlying principle is:

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

Agent wallets should be able to operate independently without being given unlimited authority.

That makes Trust Layer applicable anywhere an AI system needs to act on behalf of a person, organization, DAO, wallet, or application.

---

# Trust Layer Principle

```text
┌──────────────────────────────────────────────┐
│                                              │
│   SMALL ACTION                               │
│        ↓                                     │
│     PROCEED                                  │
│                                              │
│   NORMAL ACTION                              │
│        ↓                                     │
│     DELEGATE                                 │
│                                              │
│   HIGH-STAKES ACTION                         │
│        ↓                                     │
│   PROVE AUTHORIZATION FIRST                  │
│                                              │
└──────────────────────────────────────────────┘
```

**Trust Layer gives agent wallets room to act without giving them unlimited authority.**

> **Payments are the demo. Authorization is the product.**

---

**Built for Monad Metropolis Track 4: Trust, Identity and AI Infrastructure**
