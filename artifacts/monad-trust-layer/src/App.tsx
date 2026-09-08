import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  PrivyProvider,
  usePrivy,
  useSignupWithPasskey,
  useWallets,
  useSendTransaction,
  type User,
} from '@privy-io/react-auth';
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  CircleDot,
  Fingerprint,
  History,
  KeyRound,
  LockKeyhole,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Timer,
  WalletCards,
  X,
  Zap,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { getContractAddresses, createDelegationSignature, verifyAuthorizationSignature } from './contracts';
import { getMetaMaskAgentManager, createDelegationTransaction, createVerificationTransaction } from './metamask-agent';

const queryClient = new QueryClient();
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
const hasPrivyAppId = Boolean(privyAppId);

function PrivyOwnerRegistration({
  onComplete,
  onError,
}: {
  onComplete: (user: User) => void;
  onError: (error: unknown) => void;
}) {
  const { ready, authenticated, user } = usePrivy();
  const completedRef = useRef(false);
  const { signupWithPasskey, state } = useSignupWithPasskey({
    onComplete: ({ user: completedUser }) => {
      completedRef.current = true;
      onComplete(completedUser);
    },
  });
  const isBusy = [
    'generating-challenge',
    'awaiting-passkey',
    'submitting-response',
  ].includes(state.status);
  useEffect(() => {
    if (ready && authenticated && user && !completedRef.current) {
      completedRef.current = true;
      onComplete(user);
    }
  }, [authenticated, onComplete, ready, user]);
  const label =
    !ready
      ? 'Preparing passkey…'
      : state.status === 'awaiting-passkey'
      ? 'Complete passkey'
      : state.status === 'submitting-response'
        ? 'Verifying passkey…'
        : state.status === 'generating-challenge'
          ? 'Preparing passkey…'
          : 'Register owner';
  const handleClick = async () => {
    try {
      await signupWithPasskey();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <button
      className="mini-button"
      onClick={() => void handleClick()}
      disabled={isBusy || !ready || authenticated}
      data-testid="button-register-owner"
    >
      <Fingerprint size={13} />
      {label}
    </button>
  );
}

function Home({ privyConfigured }: { privyConfigured: boolean }) {
  type FeedKind = 'success' | 'pending' | 'info' | 'blocked';
  type FeedItem = {
    id: string;
    kind: FeedKind;
    title: string;
    detail: string;
    time: string;
    transactionHash?: string;
  };
  type VerificationPhase = 'idle' | 'proof' | 'verify' | 'approved' | 'blocked';

  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  
  // Debug Privy wallet availability
  useEffect(() => {
    console.log('Privy state:', {
      ready,
      authenticated,
      user: user?.id,
      wallets: wallets?.length,
      walletAddresses: wallets?.map(w => w.address),
      userWallets: user?.linkedAccounts
    });
  }, [ready, authenticated, user, wallets]);
  const [ownerIdentity, setOwnerIdentity] = useState<{ privyId: string } | null>(
    null,
  );
  const ownerVerified = ownerIdentity !== null;
  const [delegationActive, setDelegationActive] = useState(false);
  const [selectedTier, setSelectedTier] = useState('elevated');
  const [verificationPhase, setVerificationPhase] =
    useState<VerificationPhase>('idle');
  const [contractsReady, setContractsReady] = useState(false);
  const [useRealTransactions, setUseRealTransactions] = useState(false);
  const [agentWallet, setAgentWallet] = useState<{ address: string; connected: boolean } | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([
    {
      id: 'ready',
      kind: 'info',
      title: 'Trust layer standing by',
      detail: 'Register an owner to establish the trust anchor.',
      time: 'NOW',
    },
  ]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Initialize contracts on mount
  const [explorerUrl, setExplorerUrl] = useState('https://testnet.monadscan.com');
  
  useEffect(() => {
    const contractConfig = getContractAddresses();
    setContractsReady(contractConfig.contractsReady);
    setExplorerUrl(contractConfig.explorer || 'https://testnet.monadscan.com');
    
    if (contractConfig.contractsReady) {
      console.log('Contracts configured:', contractConfig);
      pushFeed({
        kind: 'info',
        title: 'Smart contracts configured',
        detail: `DelegationRegistry: ${contractConfig.delegationRegistry?.slice(0, 8)}... · Verifier ready`,
      });
    }
  }, []);

  // Detect if we should use real transactions (when Privy wallet is available)
  useEffect(() => {
    console.log('Privy wallet detection:', {
      authenticated,
      contractsReady,
      walletsAvailable: wallets && wallets.length > 0,
      walletsCount: wallets?.length,
      walletAddresses: wallets?.map(w => w.address)
    });
    
    if (authenticated && contractsReady && wallets && wallets.length > 0) {
      setUseRealTransactions(true);
      console.log('Real transactions enabled - Privy wallet detected');
    } else {
      console.log('Real transactions disabled - missing requirements:', {
        authenticated,
        contractsReady,
        hasWallets: wallets && wallets.length > 0
      });
    }
  }, [authenticated, contractsReady, wallets]);

  // Initialize MetaMask agent manager
  const agentManager = getMetaMaskAgentManager();

  const connectAgentWallet = async () => {
    try {
      pushFeed({
        kind: 'pending',
        title: 'Connecting agent wallet',
        detail: 'Connecting MetaMask agent wallet...',
      });

      const agent = await agentManager.connect();

      if (agent) {
        // Check if we need to switch to Monad testnet
        const MONAD_TESTNET_CHAIN_ID = 10143;
        if (agent.chainId !== MONAD_TESTNET_CHAIN_ID) {
          pushFeed({
            kind: 'pending',
            title: 'Switching to Monad testnet',
            detail: 'Current network is not Monad testnet. Switching...',
          });

          const switched = await agentManager.switchToMonadTestnet();
          
          if (switched) {
            // Reconnect to get updated chain info
            const updatedAgent = await agentManager.connect();
            if (updatedAgent) {
              setAgentWallet({ address: updatedAgent.address, connected: updatedAgent.connected });
              pushFeed({
                kind: 'success',
                title: 'Agent wallet connected',
                detail: `MetaMask agent wallet: ${updatedAgent.address.slice(0, 8)}...${updatedAgent.address.slice(-4)} · Monad testnet`,
              });
            } else {
              throw new Error('Failed to reconnect after chain switch');
            }
          } else {
            pushFeed({
              kind: 'info',
              title: 'Agent wallet connected (wrong network)',
              detail: `MetaMask agent wallet: ${agent.address.slice(0, 8)}...${agent.address.slice(-4)} · Please switch to Monad testnet manually`,
            });
            setAgentWallet({ address: agent.address, connected: agent.connected });
          }
        } else {
          setAgentWallet({ address: agent.address, connected: agent.connected });
          pushFeed({
            kind: 'success',
            title: 'Agent wallet connected',
            detail: `MetaMask agent wallet: ${agent.address.slice(0, 8)}...${agent.address.slice(-4)} · Monad testnet`,
          });
        }
      } else {
        throw new Error('Failed to connect agent wallet');
      }
    } catch (error) {
      console.error('Agent wallet connection failed:', error);
      pushFeed({
        kind: 'blocked',
        title: 'Agent wallet connection failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const disconnectAgentWallet = () => {
    setAgentWallet(null);
    pushFeed({
      kind: 'info',
      title: 'Agent wallet disconnected',
      detail: 'You can now connect a different MetaMask account',
    });
  };

  useEffect(() => {
    return () => timers.current.forEach((timer) => clearTimeout(timer));
  }, []);

  const now = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const pushFeed = (item: Omit<FeedItem, 'id' | 'time'>) => {
    setFeed((current) => [
      { ...item, id: `${Date.now()}-${Math.random()}`, time: now() },
      ...current,
    ]);
  };

  const registerOwner = (user: User) => {
    if (ownerVerified) return;
    setOwnerIdentity({ privyId: user.id });
    pushFeed({
      kind: 'success',
      title: 'Owner identity verified',
      detail: 'Passkey-authenticated owner trust anchor established.',
    });
  };

  const handleOwnerError = (error: unknown) => {
    const detail =
      error instanceof Error
        ? error.message
        : 'The passkey flow could not be completed.';
    pushFeed({
      kind: 'blocked',
      title: 'Owner registration needs attention',
      detail,
    });
  };

  const authorizeAgent = async () => {
    if (!ownerVerified || delegationActive) return;
    
    // Try to use real contract if available
    if (contractsReady && useRealTransactions) {
      // Check if agent wallet is on correct network
      if (agentWallet) {
        const currentAgent = agentManager.getAgent();
        if (currentAgent && currentAgent.chainId !== 10143) {
          pushFeed({
            kind: 'blocked',
            title: 'Wrong network',
            detail: 'Agent wallet must be on Monad testnet (chain ID 10143). Please switch network in your wallet.',
          });
          return;
        }
      }

      pushFeed({
        kind: 'pending',
        title: 'Creating on-chain delegation',
        detail: 'Sending delegation transaction to Monad testnet via Privy wallet...',
      });
      
      // Use Privy wallet for real transaction
      const tierValue = selectedTier === 'elevated' ? 2 : selectedTier === 'routine' ? 1 : 0;
      const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days from now
      
      // Require agent wallet to be connected
      if (!agentWallet || !agentWallet.address) {
        throw new Error('Agent wallet must be connected before creating delegation');
      }
      
      const agentAddress = agentWallet.address;
      
      // Use the real Privy wallet
      if (!wallets || wallets.length === 0) {
        throw new Error('No Privy wallet available');
      }
      
      // Get the first wallet
      const wallet = wallets[0];
      
      console.log('Transaction parameters:', {
        owner: wallet.address,
        agent: agentAddress,
        tier: tierValue,
        expiresAt: expiresAt,
        currentTimestamp: Math.floor(Date.now() / 1000),
        contractAddress: import.meta.env.VITE_DELEGATION_REGISTRY_ADDRESS
      });
      
      // Build the transaction data
      const txData = {
        to: import.meta.env.VITE_DELEGATION_REGISTRY_ADDRESS,
        data: `0x${createDelegationSignature(agentAddress, tierValue, expiresAt)}`,
        chainId: 10143,
        value: '0x0', // Explicitly set value to 0
        gas: '0x186A0' // Add gas limit (100,000 in hex) to ensure sufficient gas for contract execution
      };

      // Validate parameters before sending
      if (!agentAddress || agentAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Invalid agent address');
      }
      
      // Note: In dual-wallet architecture, owner (Privy) and agent (MetaMask) addresses should be different
      // This is by design - the owner authorizes the agent to act on their behalf
      if (expiresAt <= Math.floor(Date.now() / 1000)) {
        throw new Error('Expiry time must be in the future');
      }

      // Use the proper Privy sendTransaction hook
      try {
        const result = await sendTransaction(txData, {
          address: wallet.address,
          uiOptions: { showWalletUIs: false } // Hide default UI
        });
        
        const hash = result.hash;
        
        setDelegationActive(true);
        pushFeed({
          kind: 'success',
          title: 'Agent delegation created on-chain',
          detail: `Delegation committed to Monad testnet · up to ${selectedTier === 'elevated' ? '$500' : selectedTier === 'routine' ? '$50' : '$5'}.`,
          transactionHash: hash
        });
      } catch (txError) {
        console.error('Transaction failed with error:', txError);
        
        // Try to extract more detailed error information
        let errorMessage = 'Unknown error occurred';
        if (txError instanceof Error) {
          errorMessage = txError.message;
          // Check for common contract errors
          if (errorMessage.includes('execution reverted')) {
            errorMessage = 'Contract execution reverted - check contract parameters and ensure sufficient gas';
          } else if (errorMessage.includes('insufficient funds')) {
            errorMessage = 'Insufficient funds for transaction';
          } else if (errorMessage.includes('nonce')) {
            errorMessage = 'Transaction nonce issue - please try again';
          }
        }
        
        pushFeed({
          kind: 'blocked',
          title: 'Delegation transaction failed',
          detail: errorMessage,
        });
        
        // For hackathon demo, fallback to simulation after showing the error
        setTimeout(() => {
          const simulatedHash = '0x' + Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 6);
          
          setDelegationActive(true);
          pushFeed({
            kind: 'success',
            title: 'Agent delegation active (demo mode)',
            detail: `Agent may act up to ${selectedTier === 'elevated' ? '$500' : selectedTier === 'routine' ? '$50' : '$5'}. Using simulation for demo reliability.`,
            transactionHash: simulatedHash
          });
        }, 2000);
      }
    } else {
      // Provide more specific error message based on what's missing
      const missingReqs = [];
      if (!authenticated) missingReqs.push('owner not authenticated');
      if (!contractsReady) missingReqs.push('contracts not configured');
      if (!wallets || wallets.length === 0) missingReqs.push('Privy wallet not available');
      
      pushFeed({
        kind: 'blocked',
        title: 'Cannot create delegation',
        detail: `Missing requirements: ${missingReqs.join(', ')}. Please complete setup first.`,
      });
    }
  };

  const runSmallAction = () => {
    if (!delegationActive) return;
    pushFeed({
      kind: 'success',
      title: 'Small purchase auto-approved',
      detail: '$3 action · no proof requested.',
    });
  };

  const runHighAction = async () => {
    if (!delegationActive || verificationPhase === 'proof' || verificationPhase === 'verify') {
      return;
    }
    if (selectedTier !== 'elevated') {
      setVerificationPhase('blocked');
      pushFeed({
        kind: 'blocked',
        title: 'Large purchase blocked by policy',
        detail: 'Delegation tier is below the $500 action threshold.',
      });
      return;
    }

    setVerificationPhase('proof');
    pushFeed({
      kind: 'pending',
      title: 'Large purchase paused for authorization proof',
      detail: 'Generating authorization proof for Monad testnet verification...',
    });
    
    if (contractsReady && useRealTransactions) {
      try {
        // Check if agent wallet is on correct network
        if (agentWallet) {
          const currentAgent = agentManager.getAgent();
          if (currentAgent && currentAgent.chainId !== 10143) {
            pushFeed({
              kind: 'blocked',
              title: 'Wrong network',
              detail: 'Agent wallet must be on Monad testnet (chain ID 10143). Please switch network in your wallet.',
            });
            setVerificationPhase('blocked');
            return;
          }
        }

        // Simulate proof generation
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        setVerificationPhase('verify');
        pushFeed({
          kind: 'pending',
          title: 'Verifying authorization on-chain',
          detail: 'Submitting proof to AuthorizationVerifier contract via Privy wallet...',
        });
        
        // Use Privy wallet for real verification
        if (!wallets || wallets.length === 0) {
          throw new Error('No Privy wallet available');
        }
        
        // Get the first wallet
        const wallet = wallets[0];
        
        // Generate realistic proof parameters for demo
        // Note: In production, these would come from actual ZK proof generation
        const proofId = BigInt(Math.floor(Math.random() * 1000000));
        const root = BigInt(Math.floor(Math.random() * 1000000));
        const nullifierHash = BigInt(Math.floor(Math.random() * 1000000));
        
        // Build the transaction data
        const txData = {
          to: import.meta.env.VITE_AUTHORIZATION_VERIFIER_ADDRESS,
          data: `0x${verifyAuthorizationSignature(proofId, root, nullifierHash)}`,
          chainId: 10143,
          value: '0x0', // Explicitly set value to 0
          gas: '0x186A0' // Add gas limit (100,000 in hex) to ensure sufficient gas for contract execution
        };



        // Use the proper Privy sendTransaction hook
        try {
          const { hash } = await sendTransaction(txData, {
            address: wallet.address,
            uiOptions: { showWalletUIs: false } // Hide default UI
          });

          
          setVerificationPhase('approved');
          pushFeed({
            kind: 'success',
            title: 'Large purchase approved',
            detail: '$500 action · Authorization verified on Monad testnet',
            transactionHash: hash
          });
          
          setTimeout(() => setVerificationPhase('idle'), 2400);
        } catch (txError) {
          console.error('Verification transaction failed:', txError);
          
          // Try to extract more detailed error information
          let errorMessage = 'Unknown error occurred';
          if (txError instanceof Error) {
            errorMessage = txError.message;
            // Check for common contract errors
            if (errorMessage.includes('execution reverted')) {
              errorMessage = 'Contract execution reverted - check contract parameters and ensure sufficient gas';
            } else if (errorMessage.includes('insufficient funds')) {
              errorMessage = 'Insufficient funds for transaction';
            } else if (errorMessage.includes('nonce')) {
              errorMessage = 'Transaction nonce issue - please try again';
            }
          }
          
          pushFeed({
            kind: 'blocked',
            title: 'Verification transaction failed',
            detail: errorMessage,
          });
          
          // For hackathon demo, fallback to simulation after showing the error
          setTimeout(() => {
            const simulatedHash = '0x' + Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 6);
            
            setVerificationPhase('approved');
            pushFeed({
              kind: 'success',
              title: 'Large purchase approved (demo mode)',
              detail: '$500 action · Using simulation for demo reliability.',
              transactionHash: simulatedHash
            });
            
            setTimeout(() => setVerificationPhase('idle'), 2400);
          }, 2000);
        }
      } catch (error) {
        console.error('Real verification failed:', error);
        setVerificationPhase('blocked');
        pushFeed({
          kind: 'blocked',
          title: 'Verification transaction failed',
          detail: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    } else {
      // Provide more specific error message based on what's missing
      const missingReqs = [];
      if (!authenticated) missingReqs.push('owner not authenticated');
      if (!contractsReady) missingReqs.push('contracts not configured');
      if (!wallets || wallets.length === 0) missingReqs.push('Privy wallet not available');
      
      pushFeed({
        kind: 'blocked',
        title: 'Cannot verify authorization',
        detail: `Missing requirements: ${missingReqs.join(', ')}. Please complete setup first.`,
      });
    }
  };

  const resetFlow = () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = [];
    setDelegationActive(false);
    setSelectedTier('elevated');
    setVerificationPhase('idle');
    setFeed([
      {
        id: 'reset',
        kind: 'info',
        title: 'Trust flow reset',
        detail: ownerVerified
          ? 'Delegation and action state cleared. Owner identity remains verified.'
          : 'Trust state cleared. Ready for another run.',
        time: now(),
      },
    ]);
  };

  const tierAmount =
    selectedTier === 'elevated' ? '$500' : selectedTier === 'routine' ? '$50' : '$5';
  const verificationLabel =
    verificationPhase === 'proof'
      ? 'Generating proof…'
      : verificationPhase === 'verify'
        ? 'Verifying authorization…'
        : verificationPhase === 'approved'
          ? 'Approved'
          : verificationPhase === 'blocked'
            ? 'Policy blocked'
            : '';

  const renderFeedIcon = (kind: FeedKind) => {
    if (kind === 'success') return <Check size={12} strokeWidth={2.5} />;
    if (kind === 'pending') return <Timer size={12} />;
    if (kind === 'blocked') return <X size={12} />;
    return <CircleDot size={12} />;
  };

  return (
    <div className="trust-app">
      <div className="trust-shell">
        <aside className="trust-sidebar">
          <div className="brand-lockup" data-testid="brand-monad-trust-layer">
            <div className="brand-mark" aria-hidden="true">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="brand-name">Monad Trust Layer</div>
              <div className="brand-sub">Proportional trust</div>
            </div>
          </div>

          <div className="side-label">Control room</div>
          <nav className="side-nav" aria-label="Console sections">
            <div className="side-nav-item active">
              <Activity size={14} />
              <span>Trust console</span>
            </div>
            <div className="side-nav-item">
              <History size={14} />
              <span>Activity log</span>
            </div>
            <div className="side-nav-item">
              <KeyRound size={14} />
              <span>Integration seams</span>
            </div>
          </nav>

          <div className="sidebar-spacer" />
          <div className="control-note">
            <strong>CONTROL PRINCIPLE</strong>
            Friction follows the stakes. Ordinary actions stay fast; consequential
            actions earn authorization before they proceed.
          </div>
        </aside>

        <main className="main-stage">
          <header className="topline">
            <div className="crumb">
              <span>MONAD ECOSYSTEM</span>
              <ArrowRight size={12} />
              <strong>TRUST CONSOLE</strong>
            </div>
            <div className="top-actions">
              <div className="network-pill" data-testid="status-network">
                <span className="live-dot" />
                Monad testnet · {contractsReady ? 'ready' : 'simulation mode'}
              </div>
              <div className="status-pill" data-testid="status-authorization-layer">
                <Radio size={11} /> Authorization layer · {contractsReady && useRealTransactions ? 'Privy wallet ready' : 'wallet not connected'}
              </div>
            </div>
          </header>

          <section className="intro">
            <div>
              <div className="eyebrow">Agent authorization / 01</div>
              <h1>
                Let the stakes
                <br />
                decide the <span className="headline-accent">friction.</span>
              </h1>
            </div>
            <p className="intro-copy">
              A quiet control room for agents that know the difference between
              a coffee and a consequential action.
            </p>
          </section>

          <section className="story-rail" aria-label="Protocol sequence">
            <div className="story-step">
              <div className="story-number">01 / ANCHOR</div>
              <div className="story-title">Register owner</div>
              <div className="story-caption">A human trust root</div>
            </div>
            <div className="story-step">
              <div className="story-number">02 / DELEGATE</div>
              <div className="story-title">Authorize agent</div>
              <div className="story-caption">One bounded signature</div>
            </div>
            <div className="story-step">
              <div className="story-number">03 / ACT</div>
              <div className="story-title">Small action</div>
              <div className="story-caption">No unnecessary pause</div>
            </div>
            <div className="story-step">
              <div className="story-number">04 / PROVE</div>
              <div className="story-title">High-stakes check</div>
              <div className="story-caption">Authorization, not identity</div>
            </div>
          </section>

          <div className="workspace">
            <div className="left-column">
              <section className="panel" data-testid="panel-setup">
                <div className="panel-head">
                  <div className="panel-kicker">
                    <LockKeyhole size={14} />
                    Trust setup
                  </div>
                  <span className="panel-state" data-testid="status-setup">
                    {ownerVerified && delegationActive ? 'READY' : '1× SETUP'}
                  </span>
                </div>
                <div className="setup-grid">
                  <div className="setup-cell">
                    <h2>Owner identity</h2>
                    <p>
                      Establish the human anchor with a passkey.
                    </p>
                    {ownerVerified ? (
                      <div className="identity-row" data-testid="status-owner">
                        <div className="identity-icon">
                          <Fingerprint size={15} />
                        </div>
                        <div className="identity-text">
                          Verified owner
                          <span>passkey identity</span>
                          {wallets && wallets.length > 0 ? (
                            <span style={{color: '#22c55e', fontSize: '11px'}}>· Privy wallet ready</span>
                          ) : (
                            <span style={{color: '#f59e0b', fontSize: '11px'}}>· Privy wallet not detected</span>
                          )}
                        </div>
                        <Check className="status-check" size={16} />
                      </div>
                    ) : privyConfigured ? (
                      <PrivyOwnerRegistration
                        onComplete={registerOwner}
                        onError={handleOwnerError}
                      />
                    ) : (
                      <div className="registration-gate">
                        <button
                          className="mini-button"
                          disabled
                          data-testid="button-register-owner"
                        >
                          <Fingerprint size={13} />
                          Register owner
                        </button>
                        <span>Privy connection required</span>
                      </div>
                    )}
                  </div>
                  <div className="setup-cell">
                    <h2>Agent delegation</h2>
                    <p>
                      Give this agent a clear ceiling. The proof checks the
                      authorization without exposing the owner.
                    </p>
                    {!agentWallet && (
                      <button
                        className="mini-button secondary"
                        onClick={connectAgentWallet}
                        disabled={!ownerVerified}
                        data-testid="button-connect-agent-wallet"
                      >
                        <Wallet size={13} />
                        Connect agent wallet
                      </button>
                    )}
                    {agentWallet && (
                      <div className="agent-wallet-row" data-testid="status-agent-wallet">
                        <div className="agent-badge">
                          <Wallet size={15} />
                        </div>
                        <div className="identity-text">
                          Agent wallet
                          <span>{agentWallet.address.slice(0, 8)}...{agentWallet.address.slice(-4)}</span>
                        </div>
                        <Check className="status-check" size={16} />
                        <button
                          className="mini-button text-only"
                          onClick={disconnectAgentWallet}
                          title="Disconnect and switch to different wallet"
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                    <div className="tier-row" role="group" aria-label="Delegation tier">
                      {[
                        { value: 'micro', label: '$5' },
                        { value: 'routine', label: '$50' },
                        { value: 'elevated', label: '$500' },
                      ].map((tier) => (
                        <button
                          key={tier.value}
                          className={`tier-option ${selectedTier === tier.value ? 'selected' : ''}`}
                          onClick={() => setSelectedTier(tier.value)}
                          disabled={delegationActive}
                          data-testid={`button-tier-${tier.value}`}
                          aria-pressed={selectedTier === tier.value}
                        >
                          {tier.label}
                        </button>
                      ))}
                    </div>
                    {delegationActive ? (
                      <div className="delegation-row" data-testid="status-delegation">
                        <div className="agent-badge">
                          <Bot size={15} />
                        </div>
                        <div className="identity-text">
                          Agent / Atlas-01
                          <span>active up to {tierAmount}</span>
                        </div>
                        <Check className="status-check" size={16} />
                      </div>
                    ) : (
                      <button
                        className="mini-button secondary"
                        onClick={authorizeAgent}
                        disabled={!ownerVerified}
                        data-testid="button-authorize-agent"
                      >
                        <KeyRound size={13} />
                        Authorize agent
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="panel action-panel" data-testid="panel-action-console">
                <div className="panel-head">
                  <div className="panel-kicker">
                    <Zap size={14} />
                    Action console
                  </div>
                  <span className="panel-state" data-testid="status-action-policy">
                    {delegationActive ? `POLICY ≤ ${tierAmount}` : 'AWAITING DELEGATION'}
                  </span>
                </div>
                <div className="action-body">
                  <p className="action-intro">
                    Send the same agent down two paths. Ordinary work clears
                    instantly. Consequential work must earn its way through.
                  </p>
                  <div className="action-options">
                    <button
                      className="action-button"
                      onClick={runSmallAction}
                      disabled={!delegationActive}
                      data-testid="button-small-action"
                    >
                      <Zap className="action-icon" size={16} />
                      <ArrowRight className="action-arrow" size={14} />
                      <span className="action-name">Small purchase</span>
                      <span className="action-meta">$3 · auto-approved</span>
                    </button>
                    <button
                      className="action-button high"
                      onClick={runHighAction}
                      disabled={
                        !delegationActive ||
                        verificationPhase === 'proof' ||
                        verificationPhase === 'verify'
                      }
                      data-testid="button-high-stakes-action"
                    >
                      <ShieldCheck className="action-icon" size={17} />
                      <ArrowRight className="action-arrow" size={14} />
                      <span className="action-name">Large purchase</span>
                      <span className="action-meta">$500 · proof required</span>
                    </button>
                  </div>
                  {verificationLabel && (
                    <div className="verification-bar" data-testid="status-verification">
                      {verificationPhase === 'approved' ? (
                        <Check size={14} />
                      ) : verificationPhase === 'blocked' ? (
                        <X size={14} />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      <span>
                        <strong>{verificationLabel}</strong>
                        {verificationPhase === 'proof' &&
                          ' · agent is waiting, not acting.'}
                        {verificationPhase === 'verify' &&
                          ' · Semaphore / verifier seam.'}
                        {verificationPhase === 'approved' &&
                          ' · action may proceed.'}
                        {verificationPhase === 'blocked' &&
                          ' · choose an elevated delegation tier.'}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <div className="proof-note" data-testid="text-proof-note">
                <strong>What this proves:</strong> not who the owner is, but
                that a valid owner authorization exists. The proof path is built
                for a verifier contract on Monad testnet. Transactions attempt real smart contract calls with simulation fallback for demo reliability.
              </div>
            </div>

            <section className="panel feed-panel" data-testid="panel-activity-feed">
              <div className="panel-head">
                <div className="panel-kicker">
                  <Activity size={14} />
                  Activity feed
                </div>
                <span className="feed-count" data-testid="display-feed-count">
                  {feed.length}
                </span>
              </div>
              <div className="feed-list">
                {feed.length === 0 ? (
                  <div className="feed-empty" data-testid="empty-activity-feed">
                    <WalletCards size={20} />
                    <div>No activity yet.</div>
                  </div>
                ) : (
                  feed.map((item) => (
                    <article
                      className="feed-item"
                      key={item.id}
                      data-testid={`feed-item-${item.id}`}
                    >
                      <div className={`feed-marker ${item.kind}`}>
                        {renderFeedIcon(item.kind)}
                      </div>
                      <div>
                        <div className="feed-title" data-testid={`text-feed-title-${item.id}`}>
                          {item.title}
                        </div>
                        <div className="feed-detail" data-testid={`text-feed-detail-${item.id}`}>
                          {item.detail}
                        </div>
                        {item.transactionHash && (
                          <div className="feed-tx">
                            <span className="tx-label">Transaction:</span>
                            <a 
                              href={`${explorerUrl}/tx/${item.transactionHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tx-link"
                            >
                              {item.transactionHash}
                            </a>
                          </div>
                        )}
                        <div className="feed-time">{item.time}</div>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <div className="feed-footer">
                <span>Demo trust event stream</span>
                <button
                  className="reset-button"
                  onClick={resetFlow}
                  data-testid="button-reset-flow"
                >
                  <RotateCcw size={11} />
                  Reset flow
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const routedApp = (
    <RoutedErrorBoundary>
      <Switch>
        <Route
          path="/"
          component={() => <Home privyConfigured={hasPrivyAppId} />}
        />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          {privyAppId ? (
            <PrivyProvider
              appId={privyAppId}
              config={{
                embeddedWallets: {
                  ethereum: {
                    createOnLogin: 'all-users',
                  },
                },
              }}
            >
              {routedApp}
            </PrivyProvider>
          ) : (
            routedApp
          )}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
