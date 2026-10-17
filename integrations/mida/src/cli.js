import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Mida } from "@mida-context/sdk";
import { runAgent } from "./agent.js";
import { ConfigError, loadConfig } from "./config.js";
import { createChain } from "./trustlayer.js";
import { createWallet } from "./wallet.js";

const USAGE = "usage: node --env-file=.env src/cli.js [--dry-run]";

export class UsageError extends Error {
  exitCode = 1;
}

export function parseArgs(argv) {
  const flags = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") flags.dryRun = true;
    else throw new UsageError(USAGE);
  }
  return flags;
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  deps = {}
) {
  const makeChain = deps.createChain ?? createChain;
  const makeWallet = deps.createWallet ?? createWallet;
  const makeMida = deps.createMida ?? ((cfg) => new Mida({ agent: cfg.midaAgent, home: cfg.midaHome, project: cfg.projectDir }));
  let flags;
  try {
    flags = parseArgs(argv);
  } catch (error) {
    console.log(error.message);
    return error.exitCode ?? 1;
  }
  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.log(error.message);
      return error.exitCode;
    }
    throw error;
  }
  const chain = makeChain(config);
  const wallet = makeWallet(config);
  const mida = makeMida(config);
  let exitCode;
  try {
    ({ exitCode } = await runAgent({ config, chain, wallet, mida, log: console.log, dryRun: flags.dryRun }));
  } catch (error) {
    // a run that signed or broadcast carries the hash and how far it got on the
    // error — the line must say what is actually known: a confirmed tx is only
    // missing its receipt, and a hash that never reached the wire sent nothing
    console.log(
      error?.txHash
        ? `unexpected: ${error instanceof Error ? error.name : "Error"} — ${txLine(error)}`
        : `unexpected: ${error instanceof Error ? error.name : "Error"}. Nothing more was done.`
    );
    return 1;
  }
  return exitCode;
}

// What the unexpected line may honestly say about a journaled or signed hash.
function txLine(error) {
  switch (error?.txState) {
    case "mined":
      return `tx ${error.txHash} is confirmed on-chain; only its Mida receipt may be missing — running again writes it.`;
    case "signed":
      return `this run signed tx ${error.txHash} but it was never broadcast. Nothing was sent.`;
    case "journaled":
      return `journaled tx ${error.txHash} was signed by an earlier run and may still be in flight; whether it landed is unknown.`;
    default:
      return `tx ${error.txHash} may have been broadcast; whether it landed is unknown — running again re-checks.`;
  }
}

const isMain =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.log(`unexpected: ${error instanceof Error ? error.name : "Error"}. Nothing more was done.`);
      process.exit(1);
    });
}
