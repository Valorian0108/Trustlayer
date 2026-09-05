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
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

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
  };
  type VerificationPhase = 'idle' | 'proof' | 'verify' | 'approved' | 'blocked';

  const [ownerIdentity, setOwnerIdentity] = useState<{ privyId: string } | null>(
    null,
  );
  const ownerVerified = ownerIdentity !== null;
  const [delegationActive, setDelegationActive] = useState(false);
  const [selectedTier, setSelectedTier] = useState('elevated');
  const [verificationPhase, setVerificationPhase] =
    useState<VerificationPhase>('idle');
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

  const authorizeAgent = () => {
    if (!ownerVerified || delegationActive) return;
    setDelegationActive(true);
    pushFeed({
      kind: 'success',
      title: 'Agent delegation active',
      detail: `Agent may act up to ${selectedTier === 'elevated' ? '$500' : selectedTier === 'routine' ? '$50' : '$5'}.`,
    });
  };

  const runSmallAction = () => {
    if (!delegationActive) return;
    pushFeed({
      kind: 'success',
      title: 'Small purchase auto-approved',
      detail: '$3 action · no proof requested.',
    });
  };

  const runHighAction = () => {
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
      title: 'Large purchase paused for demo proof',
      detail: 'Generating a local proof simulation before the action can proceed.',
    });
    const proofTimer = setTimeout(() => {
      setVerificationPhase('verify');
      pushFeed({
        kind: 'pending',
        title: 'Demo proof generated',
        detail: 'Simulating the verifier adapter; no chain transaction yet.',
      });
      const verifyTimer = setTimeout(() => {
        setVerificationPhase('approved');
        pushFeed({
          kind: 'success',
          title: 'Large purchase approved in demo',
          detail: '$500 action · simulated authorization path completed.',
        });
        const settleTimer = setTimeout(() => setVerificationPhase('idle'), 2400);
        timers.current.push(settleTimer);
      }, 1200);
      timers.current.push(verifyTimer);
    }, 1050);
    timers.current.push(proofTimer);
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
                Monad testnet · planned
              </div>
              <div className="status-pill" data-testid="status-authorization-layer">
                <Radio size={11} /> Authorization layer · demo mode
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
                for Semaphore, a verifier contract, and Monad testnet. Current
                proof and chain steps are simulated in Demo mode.
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
            <PrivyProvider appId={privyAppId}>{routedApp}</PrivyProvider>
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
