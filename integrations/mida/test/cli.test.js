import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { main, parseArgs, UsageError } from "../src/cli.js";
import { buildTransfer, createWallet } from "../src/wallet.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TO = "0x5555555555555555555555555555555555557777";
const OWNER = "0x1234567890abcdef1234567890abcdef1234abcd";

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
    expect(typeof wallet.signTransfer).toBe("function");
    expect(typeof wallet.sendRawTransaction).toBe("function");
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

describe("entry point", () => {
  it("still runs when cli.js is reached through a symlinked path", () => {
    const integrationDir = path.resolve(import.meta.dirname, "..");
    const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mida-link-"));
    const link = path.join(linkRoot, "mida");
    fs.symlinkSync(integrationDir, link, "dir");
    const run = spawnSync(process.execPath, [path.join(link, "src", "cli.js"), "--bogus"], { encoding: "utf8" });
    fs.rmSync(linkRoot, { recursive: true, force: true });
    // the entry guard must match on the real path, not the spelled path —
    // otherwise a symlinked invocation exits 0 having done nothing at all
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("usage: node --env-file=.env src/cli.js [--dry-run]");
  });
});

describe("main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function envFor(key) {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "mida-cli-"));
    return {
      AGENT_PRIVATE_KEY: key,
      TRUSTLAYER_OWNER: OWNER,
      MIDA_HOME: "/tmp/mida-cli-home",
      MIDA_PROJECT: projectDir,
    };
  }

  const DELEGATION_STRUCT = {
    owner: OWNER,
    agent: "0x" + "11".repeat(20),
    tier: 1,
    createdAt: 1n,
    expiresAt: 1791345514n,
    active: true,
    revoked: false,
  };

  function deps({ delegation = [false, 0n, 0], mida } = {}) {
    const fakeMida = mida ?? {
      status: vi.fn(async () => ({ up: true, text: "trustlayer-agent: approved for this folder" })),
      context: vi.fn(async () => ({ items: [], cursor: null })),
      remember: vi.fn(),
    };
    return {
      mida: fakeMida,
      deps: {
        createChain: () => ({
          readContract: async ({ functionName }) => (functionName === "checkAgentDelegation" ? delegation : DELEGATION_STRUCT),
          getBalance: async () => parseEther("1"),
          getGasPrice: async () => 1_000_000_000n,
          getBlock: async () => ({ baseFeePerGas: 0n }),
          getTransactionCount: async () => 7n,
          getTransactionReceipt: async () => null,
          getCode: async () => "0x",
        }),
        createWallet: () => ({}),
        createMida: () => fakeMida,
      },
    };
  }

  it("exits 2 on a revoked delegation without a single Mida call", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { mida, deps: injected } = deps({ delegation: [false, 0n, 0] });
    const code = await main(["--dry-run"], envFor(generatePrivateKey()), injected);
    expect(code).toBe(2);
    expect(mida.status).not.toHaveBeenCalled();
    expect(mida.context).not.toHaveBeenCalled();
    expect(mida.remember).not.toHaveBeenCalled();
  });

  it("prints the Mida status line on a dry run once the delegation checks out", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { mida, deps: injected } = deps({ delegation: [true, 29n, 1] });
    const code = await main(["--dry-run"], envFor(generatePrivateKey()), injected);
    expect(mida.status).toHaveBeenCalledTimes(1);
    // the delegation read still happened first — Mida is only touched after it passes
    expect(mida.context).toHaveBeenCalled();
    expect(code).toBe(2); // the fake serves no brief, so the run refuses after status
  });

  it("an unexpected error after signing names the hash and the unknown outcome, never 'Nothing more was done'", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    let raw;
    const wallet = {
      async signTransfer({ to, value, nonce, gas, maxFeePerGas, maxPriorityFeePerGas }) {
        raw = await account.signTransaction({ type: "eip1559", chainId: monadTestnet.id, nonce, to, value, gas, maxFeePerGas, maxPriorityFeePerGas });
        return { raw, hash: keccak256(raw) };
      },
      async sendRawTransaction() { return keccak256(raw); },
      async waitForTransactionReceipt() { return { status: "success", blockNumber: 1n, transactionHash: keccak256(raw) }; },
    };
    const brief = {
      id: "0xd9d35dc2c50055f8",
      namespace: "preferences.communication",
      kind: "PREFERENCE",
      content: { text: `{"trustlayer":1,"action":"transfer","to":"${TO}","amountMon":"0.01","memo":"x"}`, assertedAt: "2026-10-09T08:50:12Z" },
      author: { name: null, id: "0x" + "0".repeat(64) },
      source: "USER_ASSERTED",
      writtenAt: "2026-10-09T08:50:12Z",
      state: "anchored",
    };
    const fakeMida = {
      status: vi.fn(async () => ({ up: true, text: "approved" })),
      context: vi.fn(async ({ namespace }) => ({ items: namespace === "preferences.communication" ? [brief] : [], cursor: null })),
      // a non-SDK error — the kind only the unexpected line can cover
      remember: vi.fn(async () => { throw new TypeError("the SDK shape changed under us"); }),
    };
    const { deps: injected } = deps({ delegation: [true, 29n, 1], mida: fakeMida });
    injected.createWallet = () => wallet;
    const code = await main([], envFor(key), injected);
    expect(code).toBe(1);
    const line = console.log.mock.calls.at(-1)[0];
    expect(line).toContain("unexpected: TypeError");
    expect(line).toContain(keccak256(raw));
    expect(line).toContain("unknown");
    expect(line).not.toContain("Nothing more was done");
  });
});
