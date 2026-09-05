---
name: ember-audit-run
description: Orchestrate an Ember 3.28->5.12 upgrade-regression audit of LingoLinq-AAC. Stamps the audited SHA, fans out the read-only ember-upgrade-auditor finder across codebase slices in parallel, optionally ingests a Playwright runtime crawl, reconciles into audit-reports/ember-upgrade/FINDINGS-EMBER.json, adversary-verifies new findings, and validates citations. User-invoked only (/ember-audit-run).
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# /ember-audit-run: Ember upgrade-regression audit orchestrator

Runs in the trusted main session. Finders it spawns are read-only by construction.
The register `audit-reports/ember-upgrade/FINDINGS-EMBER.json` is the single source of
truth for Ember-upgrade findings and never regresses: this runbook only ADDS findings
or marks them `open`. **Only Scot closes a finding, downgrades severity, or accepts
risk** — identical governance to `/audit-run`, separate register (engineering findings,
not compliance; see `audit-reports/ember-upgrade/README.md`).

## Run context (dynamic injection)
- Audited commit:  !`git rev-parse HEAD`
- Audited ref:     !`git rev-parse --abbrev-ref HEAD`
- Working tree clean?  !`git status --porcelain | head -1 | grep -q . && echo "DIRTY (commit first; snippets must anchor to a committed SHA)" || echo "clean"`

Record this SHA as `auditedSha` for the whole run; every code finding's `evidence.sha`
must be it.

## Modes
- **full** (default): all seven slices.
- **diff** (`/ember-audit-run diff`): slices restricted to files in
  `git diff --name-only $(jq -r '.meta.auditedSha' audit-reports/ember-upgrade/FINDINGS-EMBER.json) HEAD -- app/frontend/`
  (plus their twin files — the twin rule in the finder skill still applies). Cheap post-merge
  regression check. Scope from this register's own `meta.auditedSha`, NOT from a base branch:
  this mode runs POST-MERGE on `develop`, so `origin/develop...HEAD` is empty and would restrict
  every slice to nothing. Two dots, not three.
- **runtime** (`/ember-audit-run runtime`): static slices PLUS Step 4's crawl ingest
  (requires the app running; usually a local run, not remote).

## Step 1: Preflight
1. `ruby scripts/citation-check.rb audit-reports/ember-upgrade/FINDINGS-EMBER.json`
   must exit 0 (an empty register passes). If red, STOP and report.
2. If the tree is dirty, ask Scot to commit first.
3. Knowledge-base freshness: if `docs/ember-upgrade/KNOWN-ISSUES.md` header's
   `Last researched:` date is > 90 days old, note it in the report and offer a research
   refresh (three web-research agents; prompts documented in that file's appendix) —
   do not block the run on it.

## Step 2: Fan out the finder (parallel, one spawn per slice)
Spawn `ember-upgrade-auditor` once per slice — send all spawns in ONE message so they
run concurrently. Slices (defined in the `ember-upgrade-audit` skill):
`utils-services`, `components`, `controllers`, `templates`, `data-layer`,
`boot-routing`, `build-tests`.

Prompt each with:
- the `auditedSha` (and the instruction to cite snippets via `git show <sha>:<file>`),
- its slice name + scope line from the skill,
- "cross-check `audit-reports/ember-upgrade/FINDINGS-EMBER.json` and
  `docs/ember-5.12-migration-findings.md` first; reference an existing `id` rather than
  duplicating; verified-safe entries are non-findings unless the file changed after
  2026-07-09."

Collect each finder's JSON `{domain, auditedSha, findings: [...]}` into
`/tmp/ember-finder-<slice>.json`. A finder returning findings for files outside its
slice is fine when it followed a hit (twin files, templates); duplicates across slices
are handled by the deterministic merge id.

## Step 3: Reconcile into the register (deterministic)
```
ruby scripts/audit-merge.rb \
  --register audit-reports/ember-upgrade/FINDINGS-EMBER.json \
  --sha <auditedSha> --ref <auditedRef> --date <YYYY-MM-DD> \
  --in /tmp/ember-finder-utils-services.json --in /tmp/ember-finder-components.json \
  --in /tmp/ember-finder-controllers.json --in /tmp/ember-finder-templates.json \
  --in /tmp/ember-finder-data-layer.json --in /tmp/ember-finder-boot-routing.json \
  --in /tmp/ember-finder-build-tests.json \
  --out audit-reports/ember-upgrade/FINDINGS-EMBER.json \
  --summary /tmp/ember-audit-summary.json
```
`--sha` restamps this register's `meta.auditedSha`, which is correct for a whole-tree slice
fan-out like this one. Adding a single finding outside a full run instead takes
`--sha <trueCommit> --no-restamp`, which anchors `evidence.sha` at the real commit and leaves
`meta` untouched (see `audit-reports/README.md`, "The audit pointer vs. the evidence anchor").

Then inspect the summary's `skipped` array for `refused:` entries (PII/secret scrubber)
— a refusal is a DROPPED finding, not a benign skip; have the finder re-emit with a
different evidence line (the skill's "Register gotchas" section covers the common
causes: dotted-quads, `NNN_NNN` literals).

## Step 4 (runtime mode only): crawl the running app
1. App must be up (`bin/fresh_start` locally; frontend on :8184 or the Rails-served
   app). Then:
   ```
   node scripts/ember-route-crawl.mjs \
     --base http://localhost:8184 \
     --routes scripts/ember-crawl-routes.json \
     --out /tmp/ember-crawl.json
   ```
   Auth: export `CRAWL_STORAGE_STATE=/path/to/state.json` (a Playwright storage-state
   file captured from a logged-in DEV session — never production credentials).
2. The script emits finder-shaped JSON (`domain: "ember-runtime"`, findings with
   `evidence.type: "runtime"` + `evidence.source: "<route> console"`), pre-sanitized
   for the register scrubber. Triage before merging: a console error is a SYMPTOM —
   where possible, spawn one `ember-upgrade-auditor` with the error list to localize
   each to a `file:line` code finding (better evidence, citation-checked); merge the
   remainder as runtime findings via another `--in /tmp/ember-crawl.json` merge pass.
3. Raw crawl artifacts go under `audit-reports/ember-upgrade/crawl/` (gitignored).

## Step 5: Adversary verification (fresh context per batch)
For each NEW or REGRESSED finding in the merge summary, spawn a fresh `general-purpose`
agent per class-batch with ONLY the finding (ruleKey, file:line, snippet, claim) and
this charge: "Try to REFUTE this against the code at `auditedSha`. For array/reactivity
classes, your primary attack is receiver provenance: prove the receiver is an Ember
array (`A()`, hasMany, RecordArray) or that a wholesale re-set/manual trigger exists.
For template classes, attack reachability: prove the template/controller is dead.
Verdict: confirmed | refuted | uncertain, with the evidence path."
Record verdicts in each finding's `notes` (`adversary: confirmed|refuted|uncertain`).
Refuted-with-high-confidence ⇒ annotate + recommend Scot drop (never auto-remove).

## Step 6: Validate + render
1. `ruby scripts/citation-check.rb audit-reports/ember-upgrade/FINDINGS-EMBER.json` — exit 0.
2. `ruby scripts/citation-check.rb --render audit-reports/ember-upgrade/FINDINGS-EMBER.json`
   to regenerate `FINDINGS-EMBER.md`.

## Step 7: Report (headline = open Critical/High count)
Present to Scot:
- Open **Critical** and **High** counts; new findings by class/severity; regressions
  (loud); adversary verdict tally; refused-findings check result; citation-check green
  + auditedSha.
- A suggested fix order using the migration doc's principle: highest blast-radius,
  lowest-risk first (whole-modal/whole-page restorations before per-action fixes).
- Remind: only Scot closes/downgrades/accepts; fixes happen on a normal feature branch,
  never in this run.

## Step 8: Run log
Append one JSONL line to `audit-reports/ember-upgrade/run-log/runs.jsonl` (committed):
`ts`, `auditedSha`, `auditedRef`, `mode` (full|diff|runtime), `slices`, `new`/`reseen`/
`regressions`/`skipped` counts, `newIds`, adversary tally, `citationCheck`, open
Critical/High headline. The per-tool examined log is automatic
(`audit-run-logger.sh ember-upgrade-auditor` → `audit-reports/run-log/examined-<sha8>.jsonl`).

## Guardrails (always)
- Finders are read-only; this runbook never edits application code and never closes a
  finding. A fix is a separate, normal change on its own branch (see CLAUDE.md
  Branching), one class at a time, each verified by exercising the actual UI path —
  build + lint do NOT catch these classes (migration doc §Verification).
- No student/patient data in findings or crawl artifacts; crawl storage-state files are
  dev-only and never committed.
