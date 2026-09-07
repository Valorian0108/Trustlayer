// MetaMask Agent Wallet Integration for Monad Trust Layer
import { ethers } from 'ethers';

export interface MetaMaskAgent {
  address: string;
  connected: boolean;
  chainId: number;
}

export interface AgentTransaction {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
}

class MetaMaskAgentManager {
  private agent: MetaMaskAgent | null = null;

  async initialize(): Promise<boolean> {
    try {
      // Check if MetaMask is installed
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('MetaMask initialization failed:', error);
      return false;
    }
  }

  async connect(): Promise<MetaMaskAgent | null> {
    try {
      if (!this.agent) {
        await this.initialize();
      }

      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('No EVM wallet detected. Please install MetaMask, Rabby, or another EVM wallet.');
      }

      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts && accounts.length > 0) {
        const chainId = await ethereum.request({ method: 'eth_chainId' });
        const chainIdNumber = parseInt(chainId, 16);
        
        this.agent = {
          address: accounts[0],
          connected: true,
          chainId: chainIdNumber
        };

        // Check if we're on Monad testnet
        const MONAD_TESTNET_CHAIN_ID = 10143;
        if (chainIdNumber !== MONAD_TESTNET_CHAIN_ID) {
          console.warn(`Not on Monad testnet. Current chain: ${chainIdNumber}, Expected: ${MONAD_TESTNET_CHAIN_ID}`);
        }

        return this.agent;
      }

      return null;
    } catch (error) {
      console.error('EVM wallet connection failed:', error);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.agent = null;
    } catch (error) {
      console.error('MetaMask disconnect failed:', error);
    }
  }

  async sendTransaction(transaction: AgentTransaction): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      if (!this.agent) {
        return { success: false, error: 'Agent not connected' };
      }

      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        return { success: false, error: 'EVM wallet not available' };
      }

      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          to: transaction.to,
          data: transaction.data,
          value: transaction.value || '0x0',
          gas: transaction.gasLimit,
        }],
      });

      return { 
        success: true, 
        transactionHash: txHash 
      };
    } catch (error) {
      console.error('Agent transaction failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Transaction failed' 
      };
    }
  }

  getAgent(): MetaMaskAgent | null {
    return this.agent;
  }

  isConnected(): boolean {
    return this.agent !== null && this.agent.connected;
  }

  async switchToMonadTestnet(): Promise<boolean> {
    try {
      const MONAD_TESTNET_CHAIN_ID = '0x2797'; // 10143 in hex
      const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';
      
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        return false;
      }

      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MONAD_TESTNET_CHAIN_ID }],
        });
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: MONAD_TESTNET_CHAIN_ID,
              chainName: 'Monad Testnet',
              nativeCurrency: {
                name: 'MON',
                symbol: 'MON',
                decimals: 18,
              },
              rpcUrls: [MONAD_TESTNET_RPC],
              blockExplorerUrls: ['https://testnet.monadscan.com'],
            }],
          });
        } else {
          throw switchError;
        }
      }
      
      // Update chain ID after switch
      const chainId = await ethereum.request({ method: 'eth_chainId' });
      const chainIdNumber = parseInt(chainId, 16);
      if (this.agent) {
        this.agent.chainId = chainIdNumber;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to switch to Monad testnet:', error);
      return false;
    }
  }
}

// Singleton instance
let agentManager: MetaMaskAgentManager | null = null;

export function getMetaMaskAgentManager(): MetaMaskAgentManager {
  if (!agentManager) {
    agentManager = new MetaMaskAgentManager();
  }
  return agentManager;
}

// Helper function to create delegation transaction for agent
export function createDelegationTransaction(
  delegationRegistryAddress: string,
  agentAddress: string,
  tier: number,
  expiresAt: number
): AgentTransaction {
  // Use ethers.js for proper encoding
  const iface = new ethers.Interface([
    'function createDelegation(address agent, uint8 tier, uint256 expiresAt) returns (uint256)'
  ]);
  
  const encodedData = iface.encodeFunctionData('createDelegation', [
    agentAddress,
    tier,
    expiresAt
  ]);

  return {
    to: delegationRegistryAddress,
    data: encodedData,
    value: '0x0'
  };
}

// Helper function to create verification transaction for agent
export function createVerificationTransaction(
  verifierAddress: string,
  proofId: bigint,
  root: bigint,
  nullifierHash: bigint
): AgentTransaction {
  // Use ethers.js for proper encoding
  const iface = new ethers.Interface([
    'function verifyAuthorization(uint256 proofId, uint256 root, uint256 nullifierHash) returns (bool)'
  ]);
  
  const encodedData = iface.encodeFunctionData('verifyAuthorization', [
    proofId,
    root,
    nullifierHash
  ]);

  return {
    to: verifierAddress,
    data: encodedData,
    value: '0x0'
  };
}