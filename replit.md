# Monad Trust Layer

An interactive trust console showing how an AI agent can move small actions through instantly while requiring proportional authorization proof for consequential actions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/monad-trust-layer/` — the judge-facing React/Vite demo.
- `artifacts/monad-trust-layer/src/App.tsx` — the single-screen interaction model and local demo state.
- `artifacts/monad-trust-layer/src/index.css` — the visual system and responsive layout.
- `lib/api-spec/openapi.yaml` — shared API contract; currently unchanged because the first build is a local-state prototype.

## Architecture decisions

- The first build is explicitly labelled Demo mode and uses local state; it does not claim real passkeys, proofs, wallet writes, or Monad transactions before those integrations are connected.
- Privy is the selected owner identity provider; the browser uses only `VITE_PRIVY_APP_ID`, while any provider secret remains unused and must never enter client code.
- The demo's primary story is proportional trust: a $3 action auto-approves while a $500 action runs through a visible proof → verify → approve sequence.
- The UI is intentionally a single-screen console so a judge can understand and run the complete story without navigating through a multi-page product.
- Integration seams are named in the product copy for Privy/Dynamic, Semaphore/verifier, MetaMask, and Monad testnet so the demo can become production-backed without rewriting the interaction model.

## Product

- Register a demo owner identity.
- Choose a bounded agent delegation tier.
- Run a low-stakes action with no verification pause.
- Run a high-stakes action through a staged authorization sequence or see it blocked by policy.
- Review a live local activity feed and reset the demo for another run.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Keep Demo mode language visible until passkey, proof, wallet, and chain integrations are real.
- Passkey authentication must be enabled for the Privy app in the Privy dashboard before owner registration can complete.
- The frontend artifact owns the current judge demo; do not add a second workflow for it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
