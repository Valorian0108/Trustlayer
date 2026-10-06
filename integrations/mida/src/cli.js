import { pathToFileURL } from "node:url";
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

async function main() {
  let flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.log(error.message);
    return error.exitCode ?? 1;
  }
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.log(error.message);
      return error.exitCode;
    }
    throw error;
  }
  const chain = createChain(config);
  const wallet = createWallet(config);
  const mida = new Mida({ agent: config.midaAgent, home: config.midaHome, project: config.projectDir });
  if (flags.dryRun) {
    const status = await mida.status();
    console.log(status.text);
  }
  const { exitCode } = await runAgent({ config, chain, wallet, mida, log: console.log, dryRun: flags.dryRun });
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.log(`unexpected: ${error instanceof Error ? error.name : "Error"}. Nothing more was done.`);
      process.exit(1);
    });
}
