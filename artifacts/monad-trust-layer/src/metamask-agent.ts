// MetaMask Agent Wallet Integration for Monad Trust Layer

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
  private sdk: any = null;

  async initialize(): Promise<boolean> {
    try {
      // Dynamic import of MetaMask SDK to avoid issues if not installed
      const { MetaMaskSDK } = await import('@metamask/sdk');
      
      this.sdk = new MetaMaskSDK({
        dappMetadata: {
          name: "Monad Trust Layer",
          url: window.location.origin,
        },
        logging: {
          developerMode: false,
        },
        storage: {
          enabled: true,
        },
      });

      await this.sdk.init();
      
      return true;
    } catch (error) {
      console.error('MetaMask SDK initialization failed:', error);
      return false;
    }
  }

  async connect(): Promise<MetaMaskAgent | null> {
    try {
      if (!this.sdk) {
        await this.initialize();
      }

      const accounts = await this.sdk.connect();
      
      if (accounts && accounts.length > 0) {
        const chainId = await this.sdk.getChainId();
        
        this.agent = {
          address: accounts[0],
          connected: true,
          chainId: chainId
        };

        // Check if we're on Monad testnet
        const MONAD_TESTNET_CHAIN_ID = 10143;
        if (chainId !== MONAD_TESTNET_CHAIN_ID) {
          console.warn(`Not on Monad testnet. Current chain: ${chainId}, Expected: ${MONAD_TESTNET_CHAIN_ID}`);
          // Could add chain switching here
        }

        return this.agent;
      }

      return null;
    } catch (error) {
      console.error('MetaMask connection failed:', error);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.sdk) {
        await this.sdk.disconnect();
      }
      this.agent = null;
    } catch (error) {
      console.error('MetaMask disconnect failed:', error);
    }
  }

  async sendTransaction(transaction: AgentTransaction): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      if (!this.agent || !this.sdk) {
        return { success: false, error: 'Agent not connected' };
      }

      const txHash = await this.sdk.sendTransaction({
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || '0x0',
        gas: transaction.gasLimit,
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
      
      await this.sdk.switchChain(MONAD_TESTNET_CHAIN_ID);
      
      // Update chain ID after switch
      const chainId = await this.sdk.getChainId();
      if (this.agent) {
        this.agent.chainId = chainId;
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
  // Simplified encoding - in production use proper ethers.js encoding
  const functionSelector = '0xa4e9c3b8'; // createDelegation(address,uint8,uint256)
  
  const data = functionSelector + 
    agentAddress.slice(2).padStart(64, '0') + // agent address (without 0x)
    tier.toString(16).padStart(64, '0') + // tier
    expiresAt.toString(16).padStart(64, '0'); // expiresAt

  return {
    to: delegationRegistryAddress,
    data: data,
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
  // Simplified encoding - in production use proper ethers.js encoding
  const functionSelector = '0xe5f6g7h8'; // verifyAuthorization(uint256,uint256,uint256)
  
  const data = functionSelector + 
    proofId.toString(16).padStart(64, '0') + // proofId
    root.toString(16).padStart(64, '0') + // root
    nullifierHash.toString(16).padStart(64, '0'); // nullifierHash

  return {
    to: verifierAddress,
    data: data,
    value: '0x0'
  };
}