import fs from "node:fs";
import path from "node:path";

// The lock and the journal live in the project folder (config.projectDir).
// The lock keeps one run per folder at a time; the journal records a signed
// transaction before it is broadcast so a crashed or cut-off run can re-send
// the exact same bytes — the same nonce means it can never pay twice.

const LOCK_FILE = ".trustlayer-run.lock";
export const JOURNAL_FILE = ".trustlayer-journal.json";

export class LockHeldError extends Error {
  constructor(pid) {
    super(`another run is in progress (pid ${pid})`);
    this.name = "LockHeldError";
    this.pid = pid;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the pid exists but belongs to another user — still alive
    return error?.code === "EPERM";
  }
}

function readLockPid(file) {
  try {
    const pid = Number.parseInt(fs.readFileSync(file, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function acquireLock(dir) {
  const file = path.join(dir, LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(file, "wx"); // O_EXCL — fails if the file exists
      try {
        fs.writeFileSync(fd, `${process.pid}\n`);
      } finally {
        fs.closeSync(fd);
      }
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          try {
            fs.unlinkSync(file);
          } catch {
            // already gone — nothing to release
          }
        },
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = readLockPid(file);
      if (pid !== null && pidAlive(pid)) throw new LockHeldError(pid);
      // the holder is dead or the file is unreadable — take the lock over
      try {
        fs.unlinkSync(file);
      } catch (unlinkError) {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      }
    }
  }
  // someone else won the race between our unlink and our create
  throw new LockHeldError(readLockPid(file) ?? -1);
}

// Journal shape: { [briefId]: { hash, raw, nonce, receipted?, dead? } }.
// Entries are never removed: a brief with any entry is never signed for again —
// the receipt read-back can silently skip a just-written receipt, so the
// journal alone decides whether a brief may be paid. A corrupt journal is
// never ignored — it throws, the run exits before any send, and the owner
// fixes or removes it by hand.
export function readJournal(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, JOURNAL_FILE), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

// Atomic: write a temp file, fsync it, rename it over the journal — a crash
// leaves either the old file or the whole new one, never a truncated mix.
// Mode 600: the journal holds signed bytes anyone could broadcast.
function writeJournal(dir, journal) {
  const file = path.join(dir, JOURNAL_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(journal, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(tmp, 0o600); // covers a pre-existing temp file, whose mode open(2) leaves alone
  fs.renameSync(tmp, file);
}

// Each of the helpers below takes the journal object the run already read, so
// the in-memory copy stays authoritative: it is mutated and persisted together.
export function writeJournalEntry(dir, journal, briefId, entry) {
  journal[briefId] = entry;
  writeJournal(dir, journal);
}

export function markJournalReceipted(dir, journal, briefId, receipted) {
  if (!journal[briefId]) return;
  journal[briefId] = { ...journal[briefId], receipted };
  writeJournal(dir, journal);
}

// A dead entry is kept — with the reason — so the same brief is never signed
// for again, and so a later run can say why the transaction it held can never
// land instead of forgetting it ever existed.
export function markJournalDead(dir, journal, briefId, dead) {
  if (!journal[briefId]) return;
  journal[briefId] = { ...journal[briefId], dead };
  writeJournal(dir, journal);
}
