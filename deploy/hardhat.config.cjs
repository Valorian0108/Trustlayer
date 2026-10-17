// Minimal Hardhat config — used ONLY to run an in-process local EVM for
// deploy/test-verifier.ts. Compilation/deployment for Monad testnet go through
// compile.mjs / deploy.mjs (solc + ethers), not Hardhat tasks.
/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  paths: {
    sources: "../contracts",
    artifacts: "./hardhat-artifacts",
    cache: "./hardhat-cache",
  },
};
