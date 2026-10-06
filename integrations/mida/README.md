# Mida Context × TrustLayer

## What this is

One small Node program that shows two permissions working together. **Mida Context decides what the agent may
know**: its instructions live as a record the owner wrote and can revoke. **TrustLayer decides what it may do**: a
`DelegationRegistry` contract on Monad testnet says whether the owner delegated a spending tier to this agent, and
which tier. Before it does anything the agent checks both. If the brief's amount fits the tier's
immediate-execution cap, the agent sends that much testnet MON from its own wallet and writes a receipt record —
authored by the agent, containing the transaction hash — back into the owner's Mida.

## How it works

One command prints one line per step:

```
trustlayer: delegation #29 from 0x1234…abcd to 0x9876…ef01 — tier Routine ($50), expires 2026-10-10T09:12:00Z
mida: trustlayer-agent approved; brief 0xd9d35dc2… (owner, 2026-10-09T08:50:12Z): transfer 0.01 MON to 0x5555…7777
decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.
sent: 0.01 MON to 0x5555…7777 — tx 0xabc…123 (block 68,990,001)
recorded: Mida receipt 0xf7d4bf13… (anchored) in projects.current, author trustlayer-agent
```

The order is deliberate: the cheap public chain read comes first, so an agent whose delegation was revoked never
touches the owner's context at all.

## Setup for the owner

Once, about 20 minutes, all on Monad testnet. Copy `.env.example` to `.env` and fill the values in as you go;
`npm install` needs Node 22 or later.

1. **A Mida home just for this demo**, so a revoke here cannot touch everyday agents:
   `export MIDA_HOME=$HOME/.mida-trustlayer && mida init` (sponsored gas; a new owner key), then
   `mida batching off`.
2. **The agent's Mida identity:** `mida add-agent trustlayer-agent`.
3. **Approve it for this folder:** `cd ~/Desktop/trustlayer-mida/integrations/mida && mida request trustlayer-agent
   && mida approve trustlayer-agent` (type `yes`). This creates `.mida/project.json`; this folder's `.gitignore`
   keeps `.mida/` out of the repository.
4. **The agent wallet:** `cast wallet new` → address + key; the key goes into `.env` as `AGENT_PRIVATE_KEY`.
   Fund the address from `https://faucet.monad.xyz` (≥ 0.05 MON; the demo transfer is 0.01 MON plus gas).
5. **The TrustLayer owner and delegation:** a second `cast wallet new`, funded the same way. Create the
   delegation, tier Routine (1), expiring in 24 h:
   `cast send 0x088bc310c841fA5ed5b28F37050c3B419572b70d "createDelegation(address,uint8,uint256)" <AGENT_ADDRESS> 1
   $(( $(date +%s) + 86400 )) --rpc-url https://testnet-rpc.monad.xyz --interactive` (type the owner key at the
   prompt; never put it in a file). Note the delegation id, and put the owner address in `.env` as
   `TRUSTLAYER_OWNER`.
6. **The brief**, written by the owner into Mida as one line of JSON:
   `mida remember '{"trustlayer":1,"action":"transfer","to":"<RECIPIENT>","amountMon":"0.01","memo":"TrustLayer x
   Mida demo"}'`. The recipient can be the owner address.

## Run

`node --env-file=.env src/cli.js --dry-run` reads the delegation, the brief and the existing receipts and prints
the decision — nothing sent, nothing written. Then `node --env-file=.env src/cli.js` for real. Running the real
command again prints `already done …` and exits 0: the agent reads its own receipts back before acting, so the
same brief cannot be paid twice. Space live runs at least a minute apart (see Limits).

## The two revocations, and what each stops

- **Revoke the TrustLayer delegation** (`revokeDelegation` on the registry) and the next run prints
  `trustlayer: no valid delegation …` and exits 2 — before it asks Mida anything at all.
- **Revoke the agent in Mida** (`mida revoke trustlayer-agent`) and the next run prints
  `mida: refused (revoked) …` and exits 3.

Both are **forward-only**: a brief the agent already read stays read, and a transfer already sent stays sent.
Revocation stops the next run, not the last one.

## Decision rules

In this order, stopping at the first refusal. "Refuse" means print one line, send nothing, write nothing, exit
non-zero.

| # | Rule | On failure |
|---|---|---|
| R1 | A valid delegation from `TRUSTLAYER_OWNER` to the agent wallet exists (`checkAgentDelegation` on the live registry). | exit 2 |
| R2 | The Mida service answers and the agent is approved (any refusal code stops the run). | exit 3 |
| R3 | A brief exists: the newest item in `preferences.communication` whose text parses as JSON with `"trustlayer": 1`. | exit 2 |
| R4 | The brief is well-formed: `action` is `"transfer"`, `to` is a 20-byte address, `amountMon` is a positive decimal string, `memo` is a string ≤ 200 chars (optional). | exit 2 |
| R5 | Not already done: no receipt in `projects.current` carries this brief's record id. | exit 0 |
| R6 | `amountMon` fits the tier's immediate-execution cap. | exit 2 |
| R7 | The wallet balance covers amount + 21,000 × current gas price. | exit 2 |
| Act | Send `{ to, value }`; wait ≤ 60 s; the on-chain receipt must be `success`. | exit 4 |
| Rec | Write the Mida receipt into `projects.current` (kind EPISODE). | exit 5 — the transfer happened; the line says so |

The caps are TrustLayer's own immediate-execution amounts:

| Tier | Executes immediately up to |
|---|---|
| Basic | 5 MON |
| Routine | 50 MON |
| Elevated | 50 MON — above that, TrustLayer routes into its stronger-verification flow, out of scope here |

Convention: on testnet MON has no price, so **1 MON stands in for 1 USD** — a stand-in, not a price.

## Limits, in the same breath

Monad testnet only, not audited. Mida keeps the receipt's content as ciphertext off the chain; on Monad there is
only the record's existence, its author and its time — so the TrustLayer team can check that a receipt exists,
who wrote it, and the transfer it points to by hash, but cannot read the receipt itself yet. TrustLayer's
zero-knowledge verification step is simulated (their README's word) and stays out of scope; anything above the
immediate-execution cap is refused with a line saying why. `checkAgentDelegation` returns the oldest valid
delegation for an owner–agent pair. Mida allows one receipt write per minute per agent on the direct lane —
space live runs accordingly; a second run inside the minute can send a real transfer and then have its receipt
write refused (exit 5), and the printed line says exactly that. No retries, no scheduler, no ERC-20, no contract
calls: the agent does exactly one thing, once per brief.

## Files

`src/config.js` env validation · `src/trustlayer.js` the registry read · `src/brief.js` brief parsing ·
`src/decide.js` rules R1–R7 · `src/agent.js` the run · `src/wallet.js` the viem wallet · `src/cli.js` the entry.
`test/` mirrors each one. Nothing outside this folder was touched.

## Credits

The TrustLayer team for `DelegationRegistry` and the review; Mida (Dami) for the agent.
