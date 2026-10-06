# Mida Context × TrustLayer

## What this is

One small Node program that shows two permissions working together. **Mida Context decides what the agent may
know**: the spending brief lives as a record the owner wrote, and revoking the agent in Mida ends its reads.
**The agent checks TrustLayer's delegation before it acts**: a `DelegationRegistry` contract on Monad testnet
says whether the owner delegated a spending tier to this agent, and which tier. Nothing on chain forces that
check — the agent holds its own key — so the program reads the registry itself, on every run, before it touches
Mida at all. If the brief's amount fits the tier's immediate-execution cap, the agent sends that much testnet
MON from its own wallet and writes a receipt record — authored by the agent, containing the transaction hash —
back into the owner's Mida.

## How it works

One command prints one line per step:

```
trustlayer: delegation #29 from 0x1234…abcd to 0x9876…ef01 — tier Routine ($50), expires 2026-10-10T09:12:00.000Z
mida: trustlayer-agent approved; brief 0xd9d35dc2… (owner, 2026-10-09T08:50:12.345Z): transfer 0.01 MON to 0x5555…7777
decision: 0.01 MON is within the Routine auto-execute cap (50 MON). Sending.
sent: 0.01 MON to 0x5555…7777 — tx 0x51f9a2c4d8e7b3f16a0d9c5e2b847a91f06d3c8e5b1a7294f6d0e8c3a5b7d9e1 (block 68,990,001)
recorded: Mida receipt 0xf7d4bf13… (anchored) in projects.current, author trustlayer-agent
```

The order is deliberate: the cheap public chain read comes first, so an agent whose delegation was revoked never
touches the owner's context at all. A `--dry-run` adds one line — the agent's Mida status for this folder —
printed only after the delegation check passes.

## Setup for the owner

Once, about 20 minutes, all on Monad testnet. Start with `cd ~/Desktop/trustlayer-mida/integrations/mida` —
the `.env`, the `.mida/` approval record and the journal all live in this folder. Copy `.env.example` to
`.env` and fill the values in as you go; `npm install` needs Node 22 or later. Node's `--env-file` reads the
values literally — it does not expand `$HOME`, so paths in `.env` must be absolute (for example
`MIDA_HOME=/Users/you/.mida-trustlayer`).

Every `mida` command below is written with `MIDA_HOME=$HOME/.mida-trustlayer` in front of it, on purpose: the
checklist runs over several terminals, and an exported variable from day one would silently be gone in a new
terminal — writing the brief into the owner's everyday Mida home instead.

1. **A Mida home just for this demo**, so a revoke here cannot touch everyday agents:
   `MIDA_HOME=$HOME/.mida-trustlayer mida init` (sponsored gas; a new owner key), then
   `MIDA_HOME=$HOME/.mida-trustlayer mida batching off`.
2. **The agent's Mida identity:** `MIDA_HOME=$HOME/.mida-trustlayer mida add-agent trustlayer-agent`.
3. **Approve it for this folder:** `cd ~/Desktop/trustlayer-mida/integrations/mida` then
   `MIDA_HOME=$HOME/.mida-trustlayer mida request trustlayer-agent` and
   `MIDA_HOME=$HOME/.mida-trustlayer mida approve trustlayer-agent` (type `yes`). This creates
   `.mida/project.json`; this folder's `.gitignore` keeps `.mida/` out of the repository.
4. **The agent wallet:** `cast wallet new` → address + key; the key goes into `.env` as `AGENT_PRIVATE_KEY`.
   Fund the address from `https://faucet.monad.xyz` (≥ 0.05 MON; the demo transfer is 0.01 MON plus gas).
   Monad's reserve-balance rule: on a wallet under 10 MON a second transfer inside about 1.2 s is rejected
   and still costs gas — one more reason to space live runs a minute apart.
5. **The TrustLayer owner and delegation:** a second `cast wallet new`, funded the same way. Create the
   delegation, tier Routine (1), expiring in 24 h:
   `cast send 0x088bc310c841fA5ed5b28F37050c3B419572b70d "createDelegation(address,uint8,uint256)" <AGENT_ADDRESS> 1
   $(( $(date +%s) + 86400 )) --rpc-url https://testnet-rpc.monad.xyz --interactive` (type the owner key at the
   prompt; never put it in a file). Note the delegation id, and put the owner address in `.env` as
   `TRUSTLAYER_OWNER`.
6. **The brief**, written by the owner into Mida as one line of JSON:
   `MIDA_HOME=$HOME/.mida-trustlayer mida remember '{"trustlayer":1,"action":"transfer","to":"<RECIPIENT>","amountMon":"0.01","memo":"TrustLayer x
   Mida demo"}'`. The recipient can be the owner address.

## Run

Still in `~/Desktop/trustlayer-mida/integrations/mida`: `node --env-file=.env src/cli.js --dry-run` prints what
the real run would print, up to the decision — the delegation line, the agent's Mida status for this folder,
the brief line and the decision it would act on — then `dry run: nothing sent, nothing written.` Then
`node --env-file=.env src/cli.js` for real. Running the real command again prints `already done …` and exits 0.
Space live runs at least a minute apart (see Limits).

One brief pays at most once, and that claim rests on several mechanisms, not one check: only records the chain
marks as owner-written count as briefs (author id `0x00…00`, source `USER_ASSERTED`); only a receipt this agent
itself wrote (source `AGENT_INFERRED`, its own author name) marks a brief paid; a lock file in the folder means
a second run cannot overlap the first; and the transfer is signed locally and journaled **before** it is
broadcast — if a run cannot tell whether its send landed, the next run re-sends the identical signed bytes
(same nonce, same hash), which can never become a second payment, and then writes only the missing receipt.
The claim holds within the limits below: a brief re-minted to a new record id is a new brief, a revoke that
lands mid-run cannot stop bytes already signed, and "paid" is judged at Monad's `latest` — proposed, not
final.

While a run is in flight it holds `.trustlayer-run.lock` in the project folder; a second run prints
`mida: another run is in progress (pid …)` and exits 1. If a run died and left the file behind, check the
pid it names (`ps -p <pid>`) and remove the lock file only when that process is really gone — taking over a
live run's lock would let two overlapping runs pay two different briefs.

## The two revocations, and what each stops

- **Revoke the TrustLayer delegation** — `cast send 0x088bc310c841fA5ed5b28F37050c3B419572b70d
  "revokeDelegation(uint256)" <DELEGATION_ID> --rpc-url https://testnet-rpc.monad.xyz --interactive` — and the
  next run prints `trustlayer: no valid delegation …` and exits 2, before it asks Mida anything at all.
- **Revoke the agent in Mida** (`MIDA_HOME=$HOME/.mida-trustlayer mida revoke trustlayer-agent`) and the next
  run prints `mida: refused (revoked) …` and exits 3.

Both are **forward-only**: a brief the agent already read stays read, and a transfer already sent stays sent.
Revocation stops the next run, not the last one.

**Tear down when done**: run both revocations above and remove the demo `.env`. Nothing new can be signed
after that — but revoking does not cancel a transaction already signed. A journaled, unmined send in
`.trustlayer-journal.json` can still land, and that file holds the raw signed bytes — recipient, amount,
nonce, fee, never the key — so anyone who can read it can broadcast it. Only using its nonce cancels it:
confirm the journal holds no unresolved entries (each `receipted` or `dead`), or spend the journaled nonce
with a zero-value self-send, then sweep the wallet.

## Decision rules

In this order, stopping at the first refusal. "Refuse" means print one line, send nothing, write nothing, exit
non-zero.

| # | Rule | On failure |
|---|---|---|
| R1 | A valid delegation from `TRUSTLAYER_OWNER` to the agent wallet exists (`checkAgentDelegation` on the live registry). | exit 2 |
| R2 | The Mida service answers completely — a refusal code, an unreachable daemon, or a `partial` page all stop the run. | exit 3 |
| R3 | A brief exists: the newest **owner-written** record in `preferences.communication` whose text mentions `trustlayer` — author id `0x00…00` and source `USER_ASSERTED`, per the chain, not the text. | exit 2 |
| R4 | The brief parses and is well-formed: `"trustlayer": 1`, `action` is `"transfer"`, `to` is a 20-byte address that is not zero, this wallet, or a contract, `amountMon` is a positive decimal with at most 18 decimal places, `memo` is a string ≤ 200 chars (optional). A malformed newest brief refuses — it never falls back to an older one. | exit 2 |
| R5 | Not already done: no receipt **this agent wrote** (source `AGENT_INFERRED`, its own author name) in `projects.current` carries this brief's record id. | exit 0 |
| R6 | `amountMon` fits the tier's immediate-execution cap. | exit 2 |
| R7 | The wallet balance covers amount + 21,000 × the gas price the transaction will bid. | exit 2 |
| Act | Sign locally, journal the bytes, broadcast; wait ≤ 60 s; the on-chain receipt must be `success` and carry the same hash. | exit 4 |
| Rec | Write the Mida receipt into `projects.current` (kind EPISODE). | exit 5 — the transfer happened; the line says so, and running again writes only the receipt |

The caps are TrustLayer's own immediate-execution amounts, and for this agent the cap is a hard limit in every
tier — an over-cap brief is refused, never escalated (TrustLayer's own app blocks over-cap Basic and Routine
actions outright). Up to and including the cap passes; one wei more refuses.

| Tier | Executes immediately up to and including |
|---|---|
| Basic | 5 MON |
| Routine | 50 MON |
| Elevated | 50 MON |

Convention: on testnet MON has no price, so **1 MON stands in for 1 USD** — a stand-in, not a price.

## Limits, in the same breath

Monad testnet only, not audited. Mida keeps the receipt's content as ciphertext off the chain; on Monad a record
leaves its existence, its author, its time and a hash of its encrypted content — so the TrustLayer team can
check that a receipt record exists, who wrote it and when. The transfer itself is public and can be checked by
the hash the run prints, but the record's hash covers ciphertext — nobody can tie the two together from the
chain alone. TrustLayer's zero-knowledge verification step is simulated (their README's word) and stays out of
scope. `checkAgentDelegation` returns the oldest valid delegation for an owner–agent pair.

Known limits of the once-per-brief guarantee:

- A brief re-minted by `mida remember --replaces` or `mida migrate` gets a **new record id** — the paid-once key
  is the id, so the new record would be paid again. Edit a brief only if paying it again is acceptable.
- The delegation is checked once, seconds before the send; a TrustLayer revoke that lands during the Mida reads
  does not stop that run.
- A `pending` (batched) record is treated as final — a pending receipt that never anchors would re-open the
  payment. This only arises with batching on; the checklist turns it off in step 1.
- Mida allows one receipt write per minute per agent on the direct lane — space live runs accordingly. If a
  second run inside the minute sends, its receipt write is refused (exit 5); the transfer happened, the line
  says so, and the next run writes only the missing receipt — never a second payment.
- A journaled send cannot be re-priced: if the base fee rises above the signed max fee, the signed bytes wait —
  this agent never signs a fee-bumped replacement for the same brief. The entry resolves when the transaction
  mines or when its nonce is spent.
- Re-running `mida add-agent` gives the agent a new author id, so receipts written under the old id stop
  matching "this agent wrote it" — the old receipts become orphans the paid-check cannot see. The journal
  still blocks a second signature for those briefs, so they cannot be paid twice; they just look unpaid on
  Mida's side.
- "Paid" is judged at Monad's `latest`, a proposed block rather than a finalized one — a receipt or a
  transaction seen there could, rarely, be dropped.

No scheduler, no ERC-20, no contract calls: the agent does exactly one thing — a plain MON transfer — once per
brief.

## Files

`src/config.js` env validation · `src/trustlayer.js` the registry read · `src/brief.js` brief parsing ·
`src/decide.js` rules R1–R7 · `src/runfiles.js` the run lock and send journal · `src/agent.js` the run ·
`src/wallet.js` the viem wallet · `src/cli.js` the entry. `test/` mirrors each one. Nothing outside this folder
was touched.

## Credits

The TrustLayer team for `DelegationRegistry`; Mida (Dami) for the agent.
