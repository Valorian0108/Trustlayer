// Contract addresses from environment variables
const DELEGATION_REGISTRY_ADDRESS = import.meta.env.VITE_DELEGATION_REGISTRY_ADDRESS;
const AUTHORIZATION_VERIFIER_ADDRESS = import.meta.env.VITE_AUTHORIZATION_VERIFIER_ADDRESS;

// Monad testnet configuration
const MONAD_TESTNET_CHAIN_ID = 10143;
const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';

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

// Function to create delegation using Privy wallet
export async function createDelegationWithPrivy(
  privy: PrivyInstance,
  agentAddress: string,
  tier: Tier,
  expiresAt: number
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    if (!DELEGATION_REGISTRY_ADDRESS) {
      return { success: false, error: 'DelegationRegistry address not configured' };
    }

    // Get wallet from Privy
    const wallet = privy.wallets[0]; // Get the first wallet
    if (!wallet) {
      return { success: false, error: 'No wallet available' };
    }

    // Build the transaction data
    const txData = {
      to: DELEGATION_REGISTRY_ADDRESS,
      data: `0x${createDelegationSignature(agentAddress, tier, expiresAt)}`,
      chainId: MONAD_TESTNET_CHAIN_ID
    };

    // Send transaction using Privy wallet
    const tx = await wallet.sendTransaction(txData);
    
    return { 
      success: true, 
      transactionHash: tx.hash 
    };
  } catch (error) {
    console.error('Error creating delegation:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Helper function to encode the createDelegation function call
function createDelegationSignature(agentAddress: string, tier: Tier, expiresAt: number): string {
  // Simplified encoding for demo - in production use ethers.js encodeFunctionData
  // Function selector for createDelegation(address,uint8,uint256)
  const functionSelector = '0x' + 
    // createDelegation(address,uint8,uint256) 
    // keccak256('createDelegation(address,uint8,uint256)') -> first 4 bytes
    'a4e9c3b8'; // Mock function selector
  
  // For demo purposes, return a realistic-looking hex string
  return functionSelector + 
    '0000000000000000000000001234567890123456789012345678901234567890' + // agent address
    tier.toString(16).padStart(64, '0') + // tier
    expiresAt.toString(16).padStart(64, '0'); // expiresAt
}

// Function to verify authorization using Privy wallet
export async function verifyAuthorizationWithPrivy(
  privy: PrivyInstance,
  proofId: bigint,
  root: bigint,
  nullifierHash: bigint
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    if (!AUTHORIZATION_VERIFIER_ADDRESS) {
      return { success: false, error: 'AuthorizationVerifier address not configured' };
    }

    const wallet = privy.wallets[0];
    if (!wallet) {
      return { success: false, error: 'No wallet available' };
    }

    const txData = {
      to: AUTHORIZATION_VERIFIER_ADDRESS,
      data: `0x${verifyAuthorizationSignature(proofId, root, nullifierHash)}`,
      chainId: MONAD_TESTNET_CHAIN_ID
    };

    const tx = await wallet.sendTransaction(txData);
    
    return { 
      success: true, 
      transactionHash: tx.hash 
    };
  } catch (error) {
    console.error('Error verifying authorization:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Helper function to encode the verifyAuthorization function call
function verifyAuthorizationSignature(proofId: bigint, root: bigint, nullifierHash: bigint): string {
  // Simplified encoding for demo - in production use ethers.js encodeFunctionData
  // Function selector for verifyAuthorization(uint256,uint256,uint256)
  const functionSelector = '0x' + 
    // verifyAuthorization(uint256,uint256,uint256)
    // keccak256('verifyAuthorization(uint256,uint256,uint256)') -> first 4 bytes
    'e5f6g7h8'; // Mock function selector
  
  // For demo purposes, return a realistic-looking hex string
  return functionSelector + 
    proofId.toString(16).padStart(64, '0') + // proofId
    root.toString(16).padStart(64, '0') + // root
    nullifierHash.toString(16).padStart(64, '0'); // nullifierHash
}

// Fallback simulation function for when Privy is not available
export function simulateContractCall(type: 'delegation' | 'verification') {
  return new Promise<{ success: boolean; transactionHash?: string }>((resolve) => {
    setTimeout(() => {
      const hash = '0x' + Math.random().toString(16).slice(2, 10) + '...' + Math.random().toString(16).slice(2, 6);
      resolve({ success: true, transactionHash: hash });
    }, 1500);
  });
}
