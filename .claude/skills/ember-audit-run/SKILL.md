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
Record the run start first (`date -u +%Y-%m-%dT%H:%M:%SZ`); Step 2b needs it. Spawn
`ember-upgrade-auditor` once per slice with `subagent_type` and NO `name` (a named spawn can launch a
teammate, which does not get the definition's `skills`; `/audit-run` Step 2 has the detail, finding
LL-c667ec15e3) — send all spawns in ONE message so they
run concurrently. Slices (defined in the `ember-upgrade-audit` skill):
`utils-services`, `components`, `controllers`, `templates`, `data-layer`,
`boot-routing`, `build-tests`.

Prompt each with:
- the `auditedSha` (and the instruction to cite snippets via `git show <sha>:<file>`),
- its slice name + scope line from the skill,
- "cross-check `audit-reports/ember-upgrade/FINDINGS-EMBER.json` and
  `docs/ember-5.12-migration-findings.md` first; reference an existing `id` rather than
  duplicating; verified-safe entries are non-findings unless the file changed after
  2026-07-09. Return the run receipt your checklist requires."

Collect each finder's JSON `{domain, auditedSha, checklistToken, guardCanary, coverage, findings: [...]}` (`coverage`
names unexamined areas, so it is never committed) into
`/tmp/ember-finder-<slice>.json`. A finder returning findings for files outside its
slice is fine when it followed a hit (twin files, templates); duplicates across slices
are handled by the deterministic merge id.

## Step 2b: Fan-out gate (fail-closed)
Run `ruby scripts/audit-fanout-gate.rb --sha <auditedSha> --since <run start> --mode partial
--expect <N>` with one `--finder ember-upgrade-auditor=/tmp/ember-finder-<slice>.json` per slice. `N` is
7 in full and runtime modes, whatever was spawned; in diff mode it is the number of slices with changed
files, and if that is 0 there is no fan-out, gate, merge or restamp: report that and stop. The log must hold one distinct spawn id per output, so one log entry cannot stand behind several
slices. Keep the printed table for Step 8. Any other exit than 0 is a refusal: STOP, do not run
`audit-merge.rb`, do not restamp this register's `meta.auditedSha`, and report the table to Scot.
`audit-merge.rb` does not read the gate, so this stop is what holds. To retry, find out why, then
re-run every slice with a new run start and new output files.

## Step 3: Reconcile into the register (deterministic)
Set `--in` to exactly the list the gate just passed (diff mode may list fewer than the example). A
restamping merge refuses any file whose `auditedSha` is not `--sha`.
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
causes: dotted-quads, `NNN_NNN` literals). Record a new start, spawn it unnamed as in Step 2,
then run the gate on the new output with that `--since` and `--mode partial --expect 1`. Merge it with
the Step 3 command, `--in` only that file and a new `--summary` path so the first summary survives. Run
this same check on the new summary, put any new id through Step 5, and add its counts to Step 8.

## Step 4 (runtime mode only): crawl the running app
1. App must be up (`bin/fresh_start` locally; frontend on :8184 or the Rails-served
   app). Then:
   ```
   node scripts/ember-route-crawl.mjs \
     --base http://localhost:8184 \
     --out /tmp/ember-crawl.json
   ```
   Without `--routes`, discovery reads static paths from `router.js` only; nested routes are
   not composed, so treat it as a floor. `--routes <file>` (a JSON array of paths) REPLACES
   discovery, so the file must list every route to cover: static, nested and parameterized.
   Keep it outside the repo (e.g. `/tmp/ember-crawl-routes.json`): its paths carry dev-data
   usernames and board keys, and this repo is public.
   Auth: export `CRAWL_STORAGE_STATE=/path/to/state.json` (a Playwright storage-state
   file captured from a logged-in DEV session — never production credentials).
2. The script emits finder-shaped JSON (`domain: "ember-runtime"`, findings with
   `evidence.type: "runtime"` + `evidence.source: "<route> console"`), pre-sanitized
   for the register scrubber. Triage before merging: a console error is a SYMPTOM —
   where possible, record a new start, spawn one unnamed `ember-upgrade-auditor` with the error
   list and "return the run receipt your checklist requires" to localize each to a `file:line`
   code finding (better evidence, citation-checked), and run the gate on its output with that
   `--since` and `--mode partial --expect 1` before merging it; merge the remainder as runtime
   findings via another `--in /tmp/ember-crawl.json` merge pass, which is not gated because a
   script wrote it, not a finder. Give each of these merges its own `--summary` path: Steps 5,
   7 and 8 read all of them.
3. Raw crawl artifacts go under `audit-reports/ember-upgrade/crawl/` (gitignored).

## Step 5: Adversary verification (fresh context per batch)
For each NEW or REGRESSED finding in the merge summaries, spawn a fresh `general-purpose`
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
- Each finder's `note` as returned.
- A suggested fix order using the migration doc's principle: highest blast-radius,
  lowest-risk first (whole-modal/whole-page restorations before per-action fixes).
- Remind: only Scot closes/downgrades/accepts; fixes happen on a normal feature branch,
  never in this run.

## Step 8: Run log
Append one JSONL line to `audit-reports/ember-upgrade/run-log/runs.jsonl` (committed):
`ts`, `auditedSha`, `auditedRef`, `mode` (full|diff|runtime), `slices`, `finderGate` (the Step 2b
result), `new`/`reseen`/
`regressions`/`skipped` counts, `newIds`, adversary tally, `citationCheck`, open
Critical/High headline. `.jsonl` is a data-bearing extension
(`scripts/codex-review-path-classifier.sh`), so the PR that commits this line fails
`data-bearing-paths` until a reviewer confirms the rows are synthetic and adds the
`synthetic-data` label; never add that label yourself (root `CLAUDE.md` rule 15).
The per-tool examined log is automatic
(`audit-run-logger.sh ember-upgrade-auditor` → `audit-reports/run-log/examined-<sha8>.jsonl`).

## Guardrails (always)
- Finders are read-only; this runbook never edits application code and never closes a
  finding. A fix is a separate, normal change on its own branch (see CLAUDE.md
  Branching), one class at a time, each verified by exercising the actual UI path —
  build + lint do NOT catch these classes (migration doc §Verification).
- No student/patient data in findings or crawl artifacts; crawl storage-state files are
  dev-only and never committed.
