import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export function buildTransfer({ to, amountWei }) {
  return { to, value: amountWei, chain: monadTestnet };
}

export function createWallet({ agentPrivateKey, rpcUrl }) {
  const account = privateKeyToAccount(agentPrivateKey);
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
  return {
    account,
    sendTransaction: ({ to, value }) => wallet.sendTransaction({ ...buildTransfer({ to, amountWei: value }), account }),
    waitForTransactionReceipt: ({ hash }) =>
      publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 1_000 }),
  };
}
