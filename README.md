# monad trust layer

## hackathon context
- event: metropolis (monad ecosystem hackathon), 6-week build sprint
- track: track 4 - trust, identity and ai infrastructure ($30,000 prize pool)
- deployment: monad testnet (chain id: 10143)
- constraint: testnet-only build, no real funds required

## the problem
when an ai agent acts on someone's behalf - paying, signing, executing an action - most systems treat every action the same way: either the agent is trusted completely, or every single action gets challenged. neither matches how trust actually works.

a person does not get carded for a $3 coffee, but they do for a $500 purchase. agents do not have that same instinct yet - they are either reckless or exhausting to work with.

## the solution
a trust layer that gives agents that same proportional instinct:

- low-stakes actions execute immediately, no friction
- high-stakes actions require the agent to prove it is genuinely authorized by a real, verified human owner - without exposing who that owner is or their account details to whoever's watching the chain

payments are the demo case, not the product. the actual deliverable is the verification layer an agent checks before acting - squarely identity/trust infrastructure, matching track 4's framing (passkey-native accounts, agent identity, agent trust).

## how the mechanism works

1. owner registration (once) - the human registers with a passkey (p256/webauthn) - no seed phrase, biometric or hardware-backed credential. this is the trust anchor.

2. delegation (once) - the owner signs a one-time authorization: this agent may act on my behalf, up to this stakes tier. the signature is only producible by that passkey-registered owner.

3. low-stakes action - agent acts directly - no check needed, since nothing meaningful is at risk.

4. high-stakes action - agent presents proof that a valid delegation exists - signed by a real, registered owner, not expired or revoked. a verifier contract checks the proof and approves or rejects. the verifier confirms that a legitimate owner authorized this, without learning which owner, or exposing their wallet/identity.

## stack and protocols

- monad testnet - deployment target, fits no-funds constraint
- privy - passkey-based account creation, no seed phrase
- delegationregistry contract - on-chain delegation storage (deployed)
- authorizationverifier contract - anonymous-proof interface (merkle root + nullifier hash), simplified verifier standing in for full proof-checking for now (deployed)
- react + vite - frontend framework
- metamask integration - agent wallet infrastructure

## implementation status

### complete
- passkey-based owner registration (privy integration)
- single-screen judge-facing trust console
- $5, $50, and $500 delegation tier controls
- small-action versus high-stakes-action presentation
- local activity feed and reset/retry flow
- hallmark design audit pass
- delegationregistry contract deployed to monad testnet
- authorizationverifier contract deployed to monad testnet
- contract integration with frontend
- transaction hash display in activity feed
- privy wallet integration for transaction signing
- metamask agent wallet integration
- vercel deployment configuration
- comprehensive documentation

### next up
- full cryptographic proof generation and verification (the verifier's root + nullifier interface is already in the right shape for this; the proof-checking logic itself is the remaining piece)

### architecture details
- dual-wallet system: privy for human owner, metamask for agent execution
- anonymous-proof authorization architecture (merkle root + nullifier), simplified verifier for now
- on-chain delegation storage and management
- real blockchain transaction infrastructure
- professional error handling and fallback modes

## website and demo flow

the site is a single dashboard, not a multi-page product - 

- setup panel - register owner button triggers the passkey flow (privy sdk). shows owner verified once done.
- delegation panel - owner signs the one-time authorization (authorize agent up to tier). shows delegation status: active, tier, timestamp.
- agent wallet - connect agent wallet for metamask integration.
- action console - buttons to trigger demo actions: small purchase ($3) and large purchase ($500).
- live activity feed - the payoff screen. small actions show auto-approved, no check instantly. large actions show the sequence: generating proof, verifying on-chain, approved.

stack: react frontend, privy sdk for passkey/account piece, smart contracts on monad testnet.

## judge script

how does this work:

first, the owner registers with a passkey - no seed phrase, just their fingerprint or device. that is their identity, locked in. then they sign one authorization, giving their agent permission to act on their behalf up to a certain level. if the agent does something small, it just happens - no delay, nothing risky is on the line. when the agent tries something bigger, it pauses, generates a proof that a real verified owner authorized it, gets that proof checked on-chain, and only then goes through. the system never has to expose who the owner is - it just confirms the action was properly authorized.

what is the point:

agents do not yet have the same judgment a person already has - nobody gets carded buying coffee, but they do for a big purchase. this gives agents that instinct.

if asked specifically about the zk/privacy piece - say this upfront, do not wait to be asked:

the verifier's interface - a merkle root plus a nullifier hash - is the real architecture for an anonymous membership proof, the same shape libraries like semaphore use. today it is a simplified verifier standing in for that; the actual cryptographic proof-checking is the next concrete step, not yet fully wired in. the delegation registry itself is a straightforward on-chain lookup right now, so the owner-agent link is visible on-chain - hiding it is exactly what the verifier upgrade solves.

## deployed contracts

network: monad testnet (chain id: 10143)
rpc: https://testnet-rpc.monad.xyz

- delegationregistry: 0x088bc310c841fa5ed5b28f37050c3b419572b70d
- authorizationverifier: 0xec1d82473acc8ae1bc1f9b0d79c9dd8a2ee6cfaf

## what you need to run

- privy app id: cmtmwmkg7006s0cl2t83tjhxh (configured in vercel)
- passkey-capable device: phone or laptop with fingerprint/face id/webauthn support
- monad testnet: https://testnet.monad.xyz (chain id: 10143)
- metamask: for agent wallet integration (optional for demo)

## deployment

github: https://github.com/valorian0108/trustlayer
branch: main
network: monad testnet (chain id: 10143)

## security rules

- never commit privy secrets, rpc credentials, agent private keys, or tokens
- vite_privy_app_id is a public frontend app identifier, not a secret
- keep private signing authority in a server-safe or managed-wallet boundary
- use monad testnet and faucet funds only
- do not put raw owner identity details into the public contract state

## architecture overview

the system implements a dual-wallet architecture:

- human owner: privy passkey authentication for identity and authorization
- ai agent: metamask wallet for execution and transaction signing

this separation follows security best practices by isolating human control from automated agent execution, providing clear security boundaries and audit trails.

built for monad metropolis track 4: trust, identity and ai infrastructure
