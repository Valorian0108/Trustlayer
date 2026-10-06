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
  const { exitCode } = await runAgent({ config, chain, wallet, mida, log: console.log, dryRun: flags.dryRun });
  return exitCode;
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
