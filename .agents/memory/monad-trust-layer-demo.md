---
name: Monad Trust Layer demo boundary
description: Product honesty rule for the AI-agent authorization hackathon demo.
---

The judge-facing experience should distinguish local demo behavior from production-backed trust infrastructure. Low-stakes and high-stakes interactions can be demonstrated locally, but the UI must not imply that a passkey, Semaphore-style proof, wallet action, or Monad testnet transaction actually happened until the corresponding integration is connected.

**Why:** The core pitch depends on trust. A polished demo that overclaims verification would undermine the product story with technically informed judges.

**How to apply:** Keep Demo mode / local-state labels and integration seams visible during prototype work. Replace them with transaction and proof evidence only after the real services are wired and verified.