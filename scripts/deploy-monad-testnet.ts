import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Monad Trust Layer contracts to Monad testnet...");

  const signers = await ethers.getSigners();
  console.log("Available signers:", signers.length);
  
  if (signers.length === 0) {
    console.error("❌ No signers found. Please check your PRIVATE_KEY in .env file");
    console.error("Current PRIVATE_KEY value:", process.env.PRIVATE_KEY ? "SET" : "NOT SET");
    process.exit(1);
  }
  
  const deployer = signers[0];
  console.log("Deploying contracts with the account:", deployer.address);
  
  try {
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "MON");
  } catch (error) {
    console.log("Could not fetch balance, but continuing...");
  }

  // Deploy DelegationRegistry
  console.log("\n1. Deploying DelegationRegistry...");
  const DelegationRegistry = await ethers.getContractFactory("DelegationRegistry");
  const delegationRegistry = await DelegationRegistry.deploy();
  await delegationRegistry.waitForDeployment();
  const delegationRegistryAddress = await delegationRegistry.getAddress();
  console.log("DelegationRegistry deployed to:", delegationRegistryAddress);

  console.log("\n2. Deploying AuthorizationVerifier...");
  
  const AuthorizationVerifier = await ethers.getContractFactory("AuthorizationVerifier");
  const authorizationVerifier = await AuthorizationVerifier.deploy();
  await authorizationVerifier.waitForDeployment();
  const authorizationVerifierAddress = await authorizationVerifier.getAddress();
  console.log("AuthorizationVerifier deployed to:", authorizationVerifierAddress);

  // Deployment summary
  console.log("\n=== Deployment Summary ===");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("DelegationRegistry:", delegationRegistryAddress);
  console.log("AuthorizationVerifier:", authorizationVerifierAddress);
  console.log("Deployer:", deployer.address);
  
  // Save deployment addresses to environment file format
  console.log("\n=== Environment Variables for Frontend ===");
  console.log(`VITE_DELEGATION_REGISTRY_ADDRESS=${delegationRegistryAddress}`);
  console.log(`VITE_AUTHORIZATION_VERIFIER_ADDRESS=${authorizationVerifierAddress}`);
  console.log(`NEXT_PUBLIC_DELEGATION_REGISTRY_ADDRESS=${delegationRegistryAddress}`);
  console.log(`NEXT_PUBLIC_AUTHORIZATION_VERIFIER_ADDRESS=${authorizationVerifierAddress}`);

  console.log("\n=== Next Steps ===");
  console.log("1. Update your Vercel environment variables with the contract addresses above");
  console.log("2. Update the frontend to use these contract addresses");
  console.log("3. Test contract interactions on Monad testnet");
  console.log("4. Verify contracts on Monad testnet explorer");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
