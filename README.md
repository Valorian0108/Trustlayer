# Monad Trust Layer

## What I am building

Monad Trust Layer is a proportional authorization layer for AI agents.

The core idea is simple: an agent should not need to stop and ask for the
same level of authorization for every action. A `$3` purchase should move
quickly. A `$500` purchase should pause and prove that a real human owner
authorized the agent to act.

The product is not a payments app. Payments are the demo case. The actual
product is the trust and verification layer an agent checks before taking a
consequential action.

The intended flow is:

1. A human registers once with a passkey instead of a seed phrase.
2. The human gives an agent a bounded delegation, such as `$5`, `$50`, or
   `$500`.
3. Small actions proceed without a proof transaction.
4. High-stakes actions pause.
5. The agent generates a privacy-preserving proof that a valid delegation
   exists.
6. A verifier contract on Monad testnet accepts or rejects that proof.
7. The dashboard shows the decision and the relevant transaction evidence.

The privacy goal is to prove that a legitimate owner authorized the action
without exposing which owner or revealing unnecessary account details to
chain observers.

## Hackathon context

- Event: Monad Metropolis, six-week build sprint
- Track: Track 4 — Trust, Identity & AI Infrastructure
- Deployment target: Monad testnet
- Constraint: testnet-only; no real funds are required
- Candidate integrations: Privy passkeys, Semaphore-style proofs, Monad
  testnet, and a possible MetaMask agent wallet

The single-screen dashboard is intentional. A judge should be able to see the
whole story without navigating a multi-page product:

```text
Owner registration → Agent delegation → Small action → High-stakes proof
```

## Current implementation status

### Complete

- Single-screen judge-facing trust console.
- `$5`, `$50`, and `$500` delegation tier controls.
- Small-action versus high-stakes-action presentation.
- Local activity feed and reset/retry flow.
- Responsive visual system and Hallmark design audit pass.
- Explicit Demo mode language so simulated behavior is not presented as
  on-chain behavior.
- Privy passkey integration seam in the frontend.

### In progress

- Phase 1: real Privy owner registration and passkey-device testing.
- Persisting the authenticated owner identity in the frontend state.
- Vercel deployment through the dashboard import flow.

### Not implemented yet

- Delegation registry contract.
- Verifier or Semaphore-compatible verifier contract.
- Monad testnet deployment.
- On-chain delegation transaction.
- Real Semaphore-style proof generation.
- Agent wallet execution.
- Transaction links and contract addresses in the activity feed.
- Final README/demo/submission package details.

### Phase 1 checkpoint

The current working change begins the real Privy integration without changing
the dashboard structure:

- `App.tsx` now reads Privy's `ready`, `authenticated`, and `user` state.
- An authenticated passkey session can restore the owner trust state after
  loading.
- The local owner state keeps only the Privy subject needed for the next
  identity/commitment step; it is not displayed or written on-chain.
- Passkey preparation, in-progress, success, and failure paths are represented
  in the existing owner-registration control.
- `VITE_PRIVY_APP_ID` is saved securely for Replit development.
- Vercel still needs the same public App ID added to Preview and Production
  environment variables after the GitHub repository is imported.

The Vite development server responds successfully with this change. The full
TypeScript process is currently being killed by the container's resource
limit before it can finish, so that check remains pending on a larger build
environment.

## Where the code is

- `artifacts/monad-trust-layer/src/App.tsx`
  - The existing single-screen interaction model.
  - Privy provider and passkey registration.
  - Owner, delegation, action, verification, and activity-feed state.
- `artifacts/monad-trust-layer/src/index.css`
  - The visual system, responsive layout, interaction states, and Demo mode
    presentation.
- `artifacts/monad-trust-layer/vite.config.ts`
  - Requires `PORT` and `BASE_PATH`.
  - Builds to `artifacts/monad-trust-layer/dist/public`.
- `artifacts/monad-trust-layer/package.json`
  - React/Vite frontend package.
  - Privy is already installed.
- `HACKATHON_PLAN.md`
  - The full implementation order and definition of done.

The frontend is intentionally still the same single-screen console. New
identity, contract, proof, and chain code should be added behind small
integration seams rather than replacing the UI.

## Last GitHub push

The last successful push was commit
[`f287faad`](https://github.com/Valorian0108/Trustlayer/commit/f287faad734b18002513415478378bda6662a2c1)
on the `main` branch:

> Apply Hallmark frontend pass

That commit changed exactly two files:

- `artifacts/monad-trust-layer/src/App.tsx`
  - Added explicit Demo mode and planned Monad language.
  - Clarified that proof and chain steps are simulated.
  - Removed the italic headline treatment.
  - Renamed the activity section to `Activity feed`.
- `artifacts/monad-trust-layer/src/index.css`
  - Added the Hallmark structural stamp.
  - Added named visual tokens.
  - Added focus, active, disabled, reduced-motion, and mobile safeguards.
  - Added long-heading and status-pill wrapping protection.

The optional unused Inter font cleanup in `index.html` was not included in
that push because the GitHub API blocked that individual upload. It does not
change the application structure or block Privy.

## Next implementation order

### Phase 1 — Real owner identity

1. Configure the Privy app and enable passkeys.
2. Set `VITE_PRIVY_APP_ID` in local/Replit development and Vercel Preview and
   Production environments.
3. Test registration on the passkey-capable device used for the demo.
4. Keep only the minimum identity/commitment data needed for the trust layer.
5. Add clear loading, cancellation, and error states.

### Phase 2 — Trust contracts

1. Add a small delegation registry contract.
2. Store the owner commitment, agent identifier, tier, expiry, and revocation
   state.
3. Add a verifier or Semaphore-compatible verifier.
4. Deploy both contracts to Monad testnet.
5. Store addresses and ABIs in project configuration.

### Phase 3 — Enforce delegation

1. Owner signs a bounded one-time delegation.
2. Write the delegation commitment to Monad.
3. Show the delegation transaction hash in the activity feed.
4. Reject expired, revoked, or over-limit actions.

### Phase 4 — Real proportional execution

1. Keep the low-stakes path immediate.
2. Generate a proof for a high-stakes action.
3. Submit the proof to the verifier.
4. Approve the action only after verifier success.
5. Show failed proofs and failed Monad transactions clearly.

### Phase 5 — Final judge experience

1. Replace every local simulation with a real result where available.
2. Keep the existing single-screen flow.
3. Add compact transaction links, contract addresses, and proof status.
4. Test from a fresh browser session and a second device.
5. Finish the demo recording and Metropolis submission details.

## Deployment notes

The intended Vercel settings are:

```text
Framework: Vite
Root directory: .
Install command: pnpm install --frozen-lockfile
Build command: PORT=5000 BASE_PATH=/ pnpm --filter @workspace/monad-trust-layer run build
Output directory: artifacts/monad-trust-layer/dist/public
```

The Vercel project still needs to be imported from the GitHub dashboard
because the connected Vercel account could read projects but could not create
one through the API.

## Security rules

- Never commit Privy secrets, RPC credentials, agent private keys, or tokens.
- `VITE_PRIVY_APP_ID` is a public frontend app identifier, not a secret.
- Keep private signing authority in a server-safe or managed-wallet boundary.
- Use Monad testnet and faucet funds only.
- Do not put raw owner identity details into the public contract state.
