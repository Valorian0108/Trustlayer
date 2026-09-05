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

export function simulateContractCall(type: 'delegation' | 'verification') {
  // This simulates contract calls for demo purposes
  // In production, this would use ethers.js or wagmi
  return new Promise<{ success: boolean; transactionHash?: string }>((resolve) => {
    setTimeout(() => {
      const hash = '0x' + Math.random().toString(16).slice(2, 10) + '...' + Math.random().toString(16).slice(2, 6);
      resolve({ success: true, transactionHash: hash });
    }, 1500);
  });
}
