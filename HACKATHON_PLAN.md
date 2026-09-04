# Monad Trust Layer — Hackathon Completion Plan

## Goal

Ship a truthful, end-to-end Track 4 submission on Monad testnet:

1. A human creates a passkey-backed owner identity.
2. The owner grants an agent a bounded authorization tier.
3. Small actions proceed without unnecessary friction.
4. High-stakes actions require a privacy-preserving authorization proof.
5. A verifier contract accepts or rejects the proof on Monad testnet.
6. The dashboard shows the same flow with verifiable transaction evidence.

The current web artifact is the interaction shell. The next work replaces the local state behind that shell with real identity, wallet, proof, and chain calls.

## Build order

### Phase 0 — Lock the submission decisions

- Confirm the final product name: Monad Trust Layer or a stronger final name.
- Confirm the exact threshold: current default is `$500`, with `$5`, `$50`, and `$500` delegation tiers.
- Confirm solo versus team registration.
- Choose the sponsor targets:
  - Privy or Dynamic passkey bounty
  - MetaMask agent wallet bounty
  - Monad community project bounty
- Create or confirm the GitHub repository and Metropolis registration.

### Phase 1 — Make owner identity real

- Choose one provider: Privy or Dynamic.
- Add the provider SDK using its current free developer tier.
- Register the owner through a real passkey/WebAuthn flow.
- Store only the minimum public identity/commitment data needed by the app.
- Add clear loading, cancel, and error states.
- Test on the passkey-capable laptop or phone that will be used in the final presentation.

### Phase 2 — Deploy the trust contracts

- Add a small delegation registry contract for:
  - owner commitment
  - agent identifier
  - allowed stakes tier
  - expiry/revocation state
- Add the verifier contract or Semaphore-compatible verifier.
- Deploy both to Monad testnet.
- Save verified contract addresses and ABI definitions in the project configuration.
- Add viem/wagmi calls through a server-safe boundary where secrets or signing authority are involved.

### Phase 3 — Make delegation enforceable

- Owner signs a one-time bounded delegation.
- Write the delegation commitment to Monad testnet.
- Show the delegation transaction hash in the activity feed.
- Support expiration and revocation, even if the first UI exposes only the essential path.
- Reject actions above the active tier.

### Phase 4 — Implement proportional execution

- Low-stakes path:
  - evaluate the tier locally
  - execute immediately
  - record the action and policy decision
- High-stakes path:
  - pause the agent action
  - generate a Semaphore-style proof that a valid delegation exists
  - submit the proof to the verifier
  - show the verifier transaction and result
  - only then mark the action approved
- Failure path:
  - expired delegation
  - revoked delegation
  - invalid proof
  - insufficient tier
  - rejected or failed Monad transaction

### Phase 5 — Finish the judge experience

- Replace every local-state action with the real result where available.
- Keep the single-screen flow: setup → delegation → small action → high-stakes proof.
- Show concise transaction links, contract addresses, and proof status.
- Add a compact “How it works” explanation for judges.
- Record a clean reset/retry path that cannot leave timers or stale state behind.
- Test the complete flow on a fresh browser session and a second device if possible.

### Phase 6 — Submission package

- Finalize README with:
  - problem
  - proportional trust mechanism
  - privacy model
  - contract addresses
  - testnet links
  - setup instructions
  - known limitations
- Add a short architecture diagram.
- Record a 90–120 second demo:
  - owner registers
  - agent is delegated `$500`
  - `$3` action clears instantly
  - `$500` action pauses, proves, verifies, and clears
- Run final typecheck, build, contract tests, and testnet smoke test.
- Submit GitHub link, demo link, team details, and bounty selections through Metropolis.

## Free-tier strategy

- Use Monad testnet and faucet funds only; no real money is required.
- Start with one provider and one end-to-end happy path instead of paying for multiple identity vendors.
- Keep the frontend artifact lightweight and avoid adding a paid database unless persistence is required by the chosen provider flow.
- Use one managed web workflow and the existing API workflow; do not create duplicate services.
- Keep private keys, provider secrets, and RPC credentials in Replit Secrets. Never put them in the browser bundle or in chat.
- Prefer a small auditable contract surface over a broad protocol.

## What I will need from you, at the exact phase

### Before Phase 1

- Privy or Dynamic account choice, if you already have a preference.
- The provider API key through the secure secrets flow, never pasted into chat.
- A passkey-capable device for testing.

### Before Phase 2

- A Monad testnet RPC endpoint or permission to use the provider/integration we select.
- A funded Monad testnet deployer wallet, or the wallet connection needed to deploy.
- Confirmation that testnet funds are available.

### Before Phase 6

- Final project name.
- Final threshold and tier labels.
- Solo/team registration details.
- GitHub repository.
- Which sponsor bounties to claim.

I will ask for each item only when the implementation reaches the point that needs it.

## Definition of done

- The owner registration button invokes a real passkey flow.
- The delegation is signed and recorded on Monad testnet.
- A small action succeeds without a proof transaction.
- A high-stakes action cannot proceed without a valid proof.
- The verifier contract accepts valid authorization and rejects invalid/expired/revoked authorization.
- The dashboard displays the real result and transaction evidence.
- The README, demo recording, repository, and Metropolis submission are complete.