// Compile Trust Layer contracts with solc (standard JSON input).
// Isolated tooling: lives in deploy/, outside the pnpm workspace (see .build/DECISIONS.md D1).
//
// Usage:  node compile.mjs
// Output: deploy/out/<Contract>.json  (abi + bytecode)

import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = resolve(__dirname, "..", "contracts");
const OUT_DIR = join(__dirname, "out");

// Contracts to compile. Add new ones here (additive only).
const TARGETS = ["AuthorizationVerifierV2.sol"];

function findImports(path) {
  // @openzeppelin imports -> resolve from this folder's node_modules
  if (path.startsWith("@openzeppelin/")) {
    const full = join(__dirname, "node_modules", path);
    if (existsSync(full)) return { contents: readFileSync(full, "utf8") };
    return { error: `File not found: ${full}` };
  }
  // relative imports inside contracts/
  const full = join(CONTRACTS_DIR, path);
  if (existsSync(full)) return { contents: readFileSync(full, "utf8") };
  return { error: `File not found: ${full}` };
}

const sources = {};
for (const target of TARGETS) {
  sources[target] = { content: readFileSync(join(CONTRACTS_DIR, target), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    // "paris" avoids PUSH0 for maximum chain compatibility (Monad testnet safe).
    evmVersion: "paris",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let failed = false;
for (const err of output.errors ?? []) {
  if (err.severity === "error") {
    failed = true;
    console.error(err.formattedMessage);
  } else {
    console.warn(err.formattedMessage);
  }
}
if (failed) {
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const contractName = target.replace(".sol", "");
  const compiled = output.contracts?.[target]?.[contractName];
  if (!compiled) {
    console.error(`No compiled output for ${contractName}`);
    process.exit(1);
  }
  const artifact = {
    contractName,
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
    compiler: { version: solc.version(), evmVersion: "paris", optimizerRuns: 200 },
  };
  const outPath = join(OUT_DIR, `${contractName}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  const sizeKb = (artifact.bytecode.length / 2 / 1024).toFixed(1);
  console.log(`✓ ${contractName} compiled — bytecode ${sizeKb} KB → ${outPath}`);
}
