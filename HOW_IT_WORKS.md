---

# How It Works: Step-by-Step User Journey

## Getting Started with Trust Layer

When you first enter the Trust Layer application, here's what happens:

### Step 1: Register Your Owner Identity

The first thing you'll see is the **Trust Setup Panel**. You need to establish your identity as the owner.

**Choose your authentication method:**
- **Passkey (Recommended):** Use your fingerprint, Face ID, or Windows Hello
- **Social Login:** Use email, Google, GitHub, or other providers (for browsers without WebAuthn support)

**What happens:**
- Privy creates an embedded wallet for you
- No seed phrase required
- Your biometric or social credentials become your trust anchor
- This wallet is separate from any external wallet you might use

### Step 2: Fund Your Owner Wallet

After registration, you'll see your owner wallet address in the dashboard.

**To fund it:**
1. Copy the owner wallet address
2. Open your external wallet (MetaMask, Rabby, etc.)
3. Configure it for Monad Testnet (Chain ID: 10143)
4. Get testnet MON from the faucet: https://faucet.monad.xyz
5. Send testnet MON to your owner wallet address
6. Wait for the transaction to confirm

**What happens:**
- Your owner wallet now has funds to create delegations
- The dashboard will show your updated balance

### Step 3: Connect Your Agent Wallet

Click "Connect Agent Wallet" in the Trust Setup Panel.

**What happens:**
- Your external wallet (MetaMask, Rabby, etc.) connects
- This becomes your "agent wallet" - the wallet that will execute actions
- It's completely separate from your owner wallet
- This separation is a key security feature

### Step 4: Choose Your Delegation Tier

Select how much authority you want to delegate to your agent wallet:

**Micro Tier ($5):**
- For very small, routine actions
- Immediate execution for anything under $5
- Lowest risk, maximum autonomy

**Routine Tier ($50):**
- For normal delegated actions
- Immediate execution for anything under $50
- Requires authorization for anything above $50
- Balanced autonomy and security

**Elevated Tier ($500):**
- For high-stakes actions
- Immediate execution for anything under $50
- Requires authorization for anything above $50
- Maximum delegation limit

### Step 5: Create Your Delegation

Click "Create Delegation" after selecting your tier.

**What happens:**
- Your owner wallet signs a delegation transaction
- This transaction is sent to the DelegationRegistry contract on Monad Testnet
- The delegation is stored on-chain with your chosen tier and limits
- The agent wallet now has authority up to your chosen limit
- You'll see the delegation appear in the activity feed

### Step 6: Test Low-Stakes Actions

Try the "Small purchase" ($3) button in the Action Console.

**What happens:**
- Trust Layer evaluates the action: $3 is within your delegation tier
- No additional authorization required
- The transaction executes immediately
- You'll see it settle live on Monad Testnet
- The transaction hash appears in the activity feed
- You can click the hash to view it on MonadScan

**Why this works:**
- The action is low-risk ($3)
- It's within your delegated authority
- No human intervention needed
- Demonstrates autonomous execution

### Step 7: Test High-Stakes Actions

Try the "Large purchase" ($500) button in the Action Console.

**What happens:**
- Trust Layer evaluates the action: $500 exceeds the immediate execution threshold
- The system triggers the verification flow
- You'll see a passkey or social login prompt
- This simulates the human authorization check
- After successful verification, the action proceeds
- In production, this would use ZK proofs instead of simulation

**Why this works:**
- The action is high-risk ($500)
- It requires stronger authorization
- Human intervention is triggered
- Demonstrates proportional authorization

### Step 8: Review Your Activity

The activity feed on the right shows:

**Transaction Status:**
- "Creating on-chain delegation"
- "Executing small purchase"
- "Verification required"
- "Transaction confirmed"

**Transaction Details:**
- Transaction hashes
- MonadScan explorer links
- Timestamps
- Success/failure status

**What you can do:**
- Click transaction hashes to view on MonadScan
- Verify transactions settled on-chain
- Track your authorization history

## The Key Concept

Throughout this process, you're seeing **proportional authorization** in action:

1. **You set the rules** (delegation tier, limits)
2. **Small actions follow automatically** (no friction)
3. **Large actions trigger verification** (stronger proof)
4. **Everything is logged** (activity feed, on-chain records)

This is how Trust Layer gives agent wallets bounded autonomy - they can act independently within defined limits, but need human authorization for high-stakes actions.

---
