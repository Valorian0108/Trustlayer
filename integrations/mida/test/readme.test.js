import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const readme = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "README.md"), "utf8");

describe("README.md", () => {
  it("states the honest limits", () => {
    for (const phrase of ["Monad testnet", "not audited", "ciphertext", "simulated", "1 MON stands in for 1 USD"]) {
      expect(readme).toContain(phrase);
    }
  });

  it("never uses the forbidden wording", () => {
    for (const phrase of ["stored on-chain", "ChatGPT"]) {
      expect(readme).not.toContain(phrase);
    }
    expect(readme.toLowerCase()).not.toContain("delete");
    expect(readme.toLowerCase()).not.toContain("free");
  });

  it("puts dollar amounts only on tier lines", () => {
    const dollarLines = readme.split("\n").filter((line) => /\$\d/.test(line));
    expect(dollarLines.length).toBeGreaterThan(0);
    for (const line of dollarLines) {
      expect(line).toMatch(/tier|Basic|Routine|Elevated/i);
    }
  });
});
