import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { parseArgs, UsageError } from "../src/cli.js";
import { buildTransfer, createWallet } from "../src/wallet.js";

const TO = "0x5555555555555555555555555555555555557777";

describe("buildTransfer", () => {
  it("returns a bare value transfer on Monad testnet", () => {
    const amountWei = parseEther("0.01");
    const tx = buildTransfer({ to: TO, amountWei });
    expect(tx).toEqual({ to: TO, value: amountWei, chain: monadTestnet });
    expect(tx.chain.id).toBe(10143);
    expect(tx).not.toHaveProperty("data");
    expect(tx).not.toHaveProperty("gas");
  });
});

describe("createWallet", () => {
  it("returns a client bound to the configured key without any network call", () => {
    const key = generatePrivateKey();
    const agentAddress = privateKeyToAccount(key).address;
    const wallet = createWallet({ agentPrivateKey: key, agentAddress, rpcUrl: "https://testnet-rpc.monad.xyz" });
    expect(wallet.account.address).toBe(agentAddress);
    expect(typeof wallet.sendTransaction).toBe("function");
    expect(typeof wallet.waitForTransactionReceipt).toBe("function");
  });
});

describe("parseArgs", () => {
  it("parses --dry-run and an empty argv", () => {
    expect(parseArgs(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseArgs([])).toEqual({ dryRun: false });
  });

  it("exits 1 with the usage line on an unknown flag", () => {
    let error;
    try {
      parseArgs(["--send-it"]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UsageError);
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe("usage: node --env-file=.env src/cli.js [--dry-run]");
  });
});
