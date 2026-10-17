import { ethers } from 'ethers';
import { buildMerkleTree, delegationLeaf, type MerkleTree } from './zk/merkle';

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
  const contractsReady = Boolean(DELEGATION_REGISTRY_ADDRESS && AUTHORIZATION_VERIFIER_ADDRESS);
  
  console.log('Contract configuration:', {
    delegationRegistry: DELEGATION_REGISTRY_ADDRESS,
    authorizationVerifier: AUTHORIZATION_VERIFIER_ADDRESS,
    chainId: MONAD_TESTNET_CHAIN_ID,
    contractsReady
  });
  
  return {
    delegationRegistry: DELEGATION_REGISTRY_ADDRESS,
    authorizationVerifier: AUTHORIZATION_VERIFIER_ADDRESS,
    chainId: MONAD_TESTNET_CHAIN_ID,
    rpc: MONAD_TESTNET_RPC,
    explorer: MONAD_TESTNET_EXPLORER,
    contractsReady
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
// Note: This matches the actual ConnectedWallet type from Privy
interface ActualPrivyWallet {
  address: string;
  [key: string]: any; // Allow other properties that Privy might include
}

// Helper function to find the embedded wallet from Privy wallets array
// This ensures we use the Privy embedded wallet for owner transactions
// rather than accidentally using an external wallet like MetaMask
export function getEmbeddedWallet(wallets: any[]): any | null {
  if (!wallets || wallets.length === 0) {
    return null;
  }

  console.log('Available wallets:', wallets.map((w: any) => ({
    address: w.address,
    walletClientType: w.walletClientType,
    connectorType: w.connectorType,
    walletType: w.walletType
  })));

  // Try to identify embedded wallet by checking for walletClientType: 'privy'
  // This is the definitive way to identify embedded wallets according to Privy docs
  const embeddedWallet = wallets.find((w: any) => w.walletClientType === 'privy');
  
  if (embeddedWallet) {
    console.log('Found embedded wallet (walletClientType: privy):', embeddedWallet.address);
    return embeddedWallet;
  }

  // Fallback: try other methods to identify embedded wallet
  const fallbackWallet = wallets.find((w: any) => 
    w.walletType === 'embedded' || 
    w.connectorType === 'privy' ||
    !w.connectorType // Embedded wallets often don't have a connectorType
  );
  
  if (fallbackWallet) {
    console.log('Found embedded wallet (fallback method):', fallbackWallet.address);
    return fallbackWallet;
  }

  // Last resort: use the first wallet but log a warning
  console.warn('Could not definitively identify embedded wallet, using first wallet:', wallets[0].address);
  console.warn('This may cause address collision if the first wallet is external');
  return wallets[0];
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
    
    console.log('Encoded delegation call:', {
      function: 'createDelegation(address,uint8,uint256)',
      agent: agentAddress,
      tier: tier,
      expiresAt: expiresAt,
      encodedData: encodedData,
      methodSelector: encodedData.slice(0, 10),
      expectedSelector: '0x612f9ca3' // This is the selector from your failed transaction
    });
    
    // Check if the method selector matches what we expect
    const actualSelector = encodedData.slice(0, 10);
    if (actualSelector !== '0x612f9ca3') {
      console.warn('Method selector mismatch!');
      console.warn('Expected: 0x612f9ca3, Got:', actualSelector);
      console.warn('This suggests the deployed contract function signature is different');
    }
    
    return encodedData.slice(2); // Remove '0x' prefix for consistency
  } catch (error) {
    console.error('Failed to encode delegation signature:', error);
    throw new Error('Contract encoding failed');
  }
}

// Helper function to query actual delegation from the DelegationRegistry contract
export async function queryDelegationData(
  ownerAddress: string,
  agentAddress: string
): Promise<{ delegationId: bigint; tier: number; expiresAt: number } | null> {
  try {
    const provider = new ethers.JsonRpcProvider(MONAD_TESTNET_RPC);
    
    const delegationRegistry = new ethers.Contract(
      DELEGATION_REGISTRY_ADDRESS || '',
      DELEGATION_REGISTRY_ABI,
      provider
    );
    
    // Query the delegation using checkAgentDelegation function
    const result = await delegationRegistry.checkAgentDelegation(ownerAddress, agentAddress);
    
    if (result && result.hasValidDelegation) {
      console.log('Found valid delegation:', {
        delegationId: result.delegationId.toString(),
        tier: result.tier,
        hasValidDelegation: result.hasValidDelegation
      });
      
      return {
        delegationId: result.delegationId,
        tier: result.tier,
        expiresAt: Math.floor(Date.now() / 1000) + 86400 // Default 24 hours if not available
      };
    } else {
      console.log('No valid delegation found for', { ownerAddress, agentAddress });
      return null;
    }
  } catch (error) {
    console.error('Failed to query delegation data:', error);
    return null;
  }
}

// Helper function to generate deterministic proof data from delegation
export function generateProofDataFromDelegation(
  delegationId: bigint,
  tier: number,
  actionType: string
): { proofId: bigint; root: bigint; nullifierHash: bigint } {
  // Generate deterministic values based on delegation data
  // Simplified approach since contract may not have getCurrentRoot function
  
  // Create a deterministic proofId from delegationId
  const proofId = delegationId;
  
  // Create a deterministic root by hashing delegation data (contract may validate this differently)
  const delegationString = `${delegationId.toString()}-${tier}-${actionType}`;
  const hash = ethers.keccak256(ethers.toUtf8Bytes(delegationString));
  const root = BigInt(hash);
  
  // Create a deterministic nullifier from proofId + action
  const nullifierString = `${delegationId.toString()}-${actionType}`;
  const nullifierHash = BigInt(ethers.keccak256(ethers.toUtf8Bytes(nullifierString)));
  
  console.log('Generated proof data from delegation:', {
    delegationId: delegationId.toString(),
    tier,
    actionType,
    proofId: proofId.toString(),
    root: root.toString(),
    nullifierHash: nullifierHash.toString()
  });
  
  return { proofId, root, nullifierHash };
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

// ============================================================================
// AuthorizationVerifierV2 — real on-chain Merkle verification (Step 1 rebuild)
// ----------------------------------------------------------------------------
// ADDITIVE SECTION: nothing above is modified. This whole layer is switched on
// only when VITE_AUTHORIZATION_VERIFIER_V2_ADDRESS is set to a valid address;
// otherwise the app behaves exactly as before (demo simulation).
// See .build/DECISIONS.md (local) and contracts/AuthorizationVerifierV2.sol.
// ============================================================================

export const VERIFIER_V2_ADDRESS = import.meta.env.VITE_AUTHORIZATION_VERIFIER_V2_ADDRESS as string | undefined;
export const verifierV2Ready = Boolean(
  VERIFIER_V2_ADDRESS && /^0x[0-9a-fA-F]{40}$/.test(VERIFIER_V2_ADDRESS)
);

export const VERIFIER_V2_ABI = [
  'function commitRoot(bytes32 root)',
  'function getOwnerRoot(address owner) view returns (bytes32)',
  'function leafFor(address owner, uint256 delegationId, address agent, uint8 tier, uint256 expiresAt) view returns (bytes32)',
  'function checkAuthorization(tuple(address owner, uint256 delegationId, address agent, uint8 tier, uint256 expiresAt, uint8 minTier, uint256 nullifierHash) claim, bytes32[] proof) view returns (bool)',
  'function verifyAuthorization(tuple(address owner, uint256 delegationId, address agent, uint8 tier, uint256 expiresAt, uint8 minTier, uint256 nullifierHash) claim, bytes32[] proof) returns (bool)',
  'function isNullifierUsed(uint256 nullifierHash) view returns (bool)',
  'event RootCommitted(address indexed owner, bytes32 root)',
  'event AuthorizationVerified(uint256 indexed delegationId, address indexed agent, uint256 nullifierHash, uint8 tier, uint256 timestamp)'
];

// Read-only view of the EXISTING deployed DelegationRegistry (never modified).
const REGISTRY_READ_ABI = [
  'function getOwnerDelegations(address owner) view returns (uint256[])',
  'function getDelegation(uint256 delegationId) view returns (tuple(address owner, address agent, uint8 tier, uint256 createdAt, uint256 expiresAt, bool active, bool revoked))',
  'function checkAgentDelegation(address owner, address agent) view returns (bool hasValidDelegation, uint256 delegationId, uint8 tier)'
];

export interface ApprovalSetDelegation {
  delegationId: bigint;
  owner: string;
  agent: string;
  tier: number;
  expiresAt: bigint;
}

export interface AuthorizationClaimV2 {
  owner: string;
  delegationId: bigint;
  agent: string;
  tier: number;
  expiresAt: bigint;
  minTier: number;
  nullifierHash: bigint;
}

export function getTestnetProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(MONAD_TESTNET_RPC);
}

/**
 * Build the owner's approval set from the registry (source of truth):
 * all of the owner's delegations, ordered by delegationId, as a Merkle tree.
 * The root is what the owner commits to AuthorizationVerifierV2.commitRoot,
 * and inclusion proofs from this tree are what verifyAuthorization checks.
 */
export async function buildOwnerApprovalSet(ownerAddress: string): Promise<{
  delegations: ApprovalSetDelegation[];
  leaves: string[];
  tree: MerkleTree;
}> {
  const provider = getTestnetProvider();
  const registry = new ethers.Contract(
    DELEGATION_REGISTRY_ADDRESS || '',
    REGISTRY_READ_ABI,
    provider
  );
  const ids: bigint[] = await registry.getOwnerDelegations(ownerAddress);
  const delegations: ApprovalSetDelegation[] = [];
  for (const id of ids) {
    const d = await registry.getDelegation(id);
    delegations.push({
      delegationId: id,
      owner: d.owner,
      agent: d.agent,
      tier: Number(d.tier),
      expiresAt: d.expiresAt
    });
  }
  delegations.sort((a, b) => Number(a.delegationId - b.delegationId));
  const leaves = delegations.map(delegationLeaf);
  const tree = buildMerkleTree(leaves);
  return { delegations, leaves, tree };
}

/** Encode a commitRoot(root) call for AuthorizationVerifierV2. */
export function encodeCommitRoot(root: string): string {
  const iface = new ethers.Interface(VERIFIER_V2_ABI);
  return iface.encodeFunctionData('commitRoot', [root]);
}

/** Encode a verifyAuthorization(claim, proof) call for AuthorizationVerifierV2. */
export function encodeVerifyAuthorizationV2(claim: AuthorizationClaimV2, proof: string[]): string {
  const iface = new ethers.Interface(VERIFIER_V2_ABI);
  return iface.encodeFunctionData('verifyAuthorization', [
    [
      claim.owner,
      claim.delegationId,
      claim.agent,
      claim.tier,
      claim.expiresAt,
      claim.minTier,
      claim.nullifierHash
    ],
    proof
  ]);
}


