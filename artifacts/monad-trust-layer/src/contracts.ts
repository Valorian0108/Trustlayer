import { ethers } from 'ethers';

// Fallback simulation function for when Privy is not available
export function simulateContractCall(type: 'delegation' | 'verification') {
  return new Promise<{ success: boolean; transactionHash?: string }>((resolve) => {
    setTimeout(() => {
      const hash = '0x' + Math.random().toString(16).slice(2, 10) + '...' + Math.random().toString(16).slice(2, 6);
      resolve({ success: true, transactionHash: hash });
    }, 1500);
  });
}

// Contract addresses from environment variables
const DELEGATION_REGISTRY_ADDRESS = import.meta.env.VITE_DELEGATION_REGISTRY_ADDRESS;
const AUTHORIZATION_VERIFIER_ADDRESS = import.meta.env.VITE_AUTHORIZATION_VERIFIER_ADDRESS;

// Monad testnet configuration
const MONAD_TESTNET_CHAIN_ID = 10143;
const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';
const MONAD_TESTNET_EXPLORER = 'https://testnet.monadscan.com';

// Tier enum values
export enum Tier {
  Basic = 0,    // $5
  Routine = 1,  // $50  
  Elevated = 2  // $500
}

export function getContractAddresses() {
  return {
    delegationRegistry: DELEGATION_REGISTRY_ADDRESS,
    authorizationVerifier: AUTHORIZATION_VERIFIER_ADDRESS,
    chainId: MONAD_TESTNET_CHAIN_ID,
    rpc: MONAD_TESTNET_RPC,
    explorer: MONAD_TESTNET_EXPLORER,
    contractsReady: Boolean(DELEGATION_REGISTRY_ADDRESS && AUTHORIZATION_VERIFIER_ADDRESS)
  };
}

// Simple contract ABI for the functions we need
const DELEGATION_REGISTRY_ABI = [
  'function createDelegation(address agent, uint8 tier, uint256 expiresAt) returns (uint256)',
  'function isDelegationValid(uint256 delegationId) view returns (bool)',
  'function checkAgentDelegation(address owner, address agent) view returns (bool hasValidDelegation, uint256 delegationId, uint8 tier)',
  'event DelegationCreated(uint256 indexed delegationId, address indexed owner, address indexed agent, uint8 tier, uint256 expiresAt)'
];

const AUTHORIZATION_VERIFIER_ABI = [
  'function verifyAuthorization(uint256 proofId, uint256 root, uint256 nullifierHash) returns (bool)',
  'function getCurrentRoot() view returns (uint256)',
  'event ProofVerified(uint256 indexed proofId, uint256 delegationRoot, uint256 timestamp)'
];

// Type for Privy wallet with sendTransaction method
interface PrivyWallet {
  sendTransaction: (tx: any) => Promise<{ hash: string }>;
}

interface PrivyInstance {
  wallets: PrivyWallet[];
}

// Type for actual Privy wallet from useWallets hook
interface ActualPrivyWallet {
  address: string;
  walletClient: any; // The actual wallet client for transactions
}

interface ActualPrivyInstance {
  wallets: ActualPrivyWallet[];
}



// Helper function to encode the createDelegation function call using ethers.js
export function createDelegationSignature(agentAddress: string, tier: Tier, expiresAt: number): string {
  try {
    // Use ethers.js to properly encode the function call
    // The contract signature is: createDelegation(address,uint8,uint256)
    // where uint8 represents the Tier enum
    const iface = new ethers.Interface([
      'function createDelegation(address agent, uint8 tier, uint256 expiresAt) returns (uint256)'
    ]);
    
    const encodedData = iface.encodeFunctionData('createDelegation', [
      agentAddress,
      tier, // Tier enum value (0, 1, or 2)
      expiresAt
    ]);
    
    return encodedData.slice(2); // Remove '0x' prefix for consistency
  } catch (error) {
    console.error('Failed to encode delegation signature:', error);
    throw new Error('Contract encoding failed');
  }
}

// Helper function to encode the verifyAuthorization function call using ethers.js
export function verifyAuthorizationSignature(proofId: bigint, root: bigint, nullifierHash: bigint): string {
  try {
    // Use ethers.js to properly encode the function call
    const iface = new ethers.Interface([
      'function verifyAuthorization(uint256 proofId, uint256 root, uint256 nullifierHash) returns (bool)'
    ]);
    
    const encodedData = iface.encodeFunctionData('verifyAuthorization', [
      proofId,
      root,
      nullifierHash
    ]);
    
    return encodedData.slice(2); // Remove '0x' prefix for consistency
  } catch (error) {
    console.error('Failed to encode verification signature:', error);
    throw new Error('Contract encoding failed');
  }
}

// Function to create delegation using Privy wallet (deprecated - now handled directly in App.tsx)
export async function createDelegationWithPrivy(
  privy: any,
  agentAddress: string,
  tier: Tier,
  expiresAt: number
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  // This function is now handled directly in App.tsx
  return { success: false, error: 'Use direct wallet.sendTransaction in App.tsx' };
}

// Function to verify authorization using Privy wallet (deprecated - now handled directly in App.tsx)
export async function verifyAuthorizationWithPrivy(
  privy: any,
  proofId: bigint,
  root: bigint,
  nullifierHash: bigint
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  // This function is now handled directly in App.tsx
  return { success: false, error: 'Use direct wallet.sendTransaction in App.tsx' };
}


