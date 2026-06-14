# Audit run-log

Per-run evidence trail for `/audit-run` (Phase 4 "Cadence"). Two artifacts, deliberately split
by privacy posture:

| File | Tracked? | Written by | Contents |
|---|---|---|---|
| `runs.jsonl` | **committed** | the `/audit-run` orchestrator (step 7) | one summary line per run: timestamp, audited SHA/ref, run type (full/light), finder set, new/reseen/regression/skipped counts, new finding IDs, adversary verdict tally, citation-check status, open Critical/High headline |
| `examined-<sha8>.jsonl` | **gitignored (local)** | the `audit-run-logger.sh` PostToolUse hook, wired per-finder | one line per examined path/command: `{ts, sha, agent, tool, path\|glob\|cmd}` |
| `logger-errors.jsonl` | gitignored (local) | the logger hook on internal error | `{ts, agent, error}` markers only, never raw input |

## What the per-tool log captures (and what it must never)

The logger records **what each finder examined** so a run is reconstructable and recurrence is a
diff over time. It is **code/path evidence ONLY** and mirrors the read-only guard's fail-closed
posture:

- Logs the tool name and the repo-relative **path/glob** a finder Read/Grep'd/Glob'd, plus the
  Bash command **verb only**.
- **Never** reads tool RESULTS, file contents, finding bodies, PII, student/patient data, or
  secret VALUES. Grep search patterns are deliberately omitted (deny-by-default).
- For **Bash**, only the leading command-word run is logged (e.g. `git log`, `bundle list`,
  `npm audit`, `grep`, `cat`); **all operands are dropped** - paths, search patterns, flags, and
  values. A shape-based redactor cannot reliably catch an arbitrary student/patient name, so the
  command operands are never logged at all (a finder's `grep "<name>" app/` records only `grep`).
- Paths outside the repo (absolute non-repo paths, parent-escapes) are recorded as the marker
  `<non-repo-path>`, never the actual path.
- On any error the hook writes a non-sensitive marker and **always exits 0**, so it can never
  block, deny, or corrupt a tool call.

## Why the detail log is local, not committed

The `examined-*.jsonl` files are high-volume, churn every run, and are machine-specific
telemetry. Committing them would bloat the repo and leak nothing useful that the register and
the summary line don't already carry. They stay local (`.gitignore`d); the durable record is
`runs.jsonl` plus the findings register itself.

The audited SHA stamped on every line is the live HEAD at examination time; the `/audit-run`
runbook requires a clean tree, so HEAD is exactly what was audited.
