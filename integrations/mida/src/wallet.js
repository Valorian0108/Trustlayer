import { createPublicClient, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const TRANSFER_GAS_LIMIT = 21000n;

export function buildTransfer({ to, amountWei }) {
  return { to, value: amountWei, chain: monadTestnet };
}

export function createWallet({ agentPrivateKey, rpcUrl }) {
  const account = privateKeyToAccount(agentPrivateKey);
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
  return {
    account,
    // Signs the plain transfer fully offline — explicit nonce and the EIP-1559
    // fee fields the funds check already used — so the bytes can be journaled
    // and, if the first broadcast's fate is unknown, re-sent without ever
    // becoming a different transaction.
    async signTransfer({ to, value, nonce, gas = TRANSFER_GAS_LIMIT, maxFeePerGas, maxPriorityFeePerGas }) {
      const transfer = buildTransfer({ to, amountWei: value });
      const raw = await account.signTransaction({
        chainId: transfer.chain.id,
        nonce,
        to: transfer.to,
        value: transfer.value,
        gas,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      return { raw, hash: keccak256(raw) };
    },
    sendRawTransaction: ({ serializedTransaction }) => publicClient.sendRawTransaction({ serializedTransaction }),
    waitForTransactionReceipt: ({ hash }) =>
      publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 1_000 }),
  };
}
