# 2026-11-06: data-bearing gate scans content instead of gating every data path

## Goal

Stop asking for the `synthetic-data` label on every PR that touches a data-bearing path or a
workflow file. A PR now passes unless a content scan of the lines it adds finds something that
looks like real personal data, or it touches a path that always needs a look, or it changes the
gate's own files.

## Decisions (Scot, 2026-11-06)

- Workflow files are dropped from the gate entirely; no code-owner rule. The gate's own
  workflow stays in `CONTROL_FILES`.
- A scanner finding blocks until labeled (not a warning).
- `db/language/` and VCR cassette directories always need the label, deletions included, as a
  list inside `scripts/data-bearing-path-check.sh`. The classifier is unchanged.
- `lingolinq.com` is not a reserved domain: team-member data is real PII.
- Approved test changes: the two workflow tests flip to pass; the rename-out test flips to pass
  (only removed lines on a data path); the setup fixtures that expected a failure now hold an
  obviously fake flagged value (`ssn: 123-45-6789`) so their assertions are unchanged.

## Facts established (Phase 1)

- Before: `control_touched` was set by `CONTROL_FILES` and by `WORKFLOW_DIR_RE`
  (`^\.github/workflows/`) in `scripts/data-bearing-path-check.sh`; any data-bearing verdict
  from the classifier failed without an approval.
- Usage since 2026-10-12: 55 squash merges on develop, 14 tripped the gate: 9 workflow-only
  (3 of them the gate's own files), 5 data paths (2 migrations, 1 audit run-log, 2 other).
- Only binary file under a data-bearing path today: `lib/basic_inflections.xlsx`.
- A diff between two blob ids reads no `.gitattributes` (a path diff in the same repo became
  "Binary files differ" under a `binary` attribute; the blob diff did not). `diff-tree -c --raw -z`
  prints the combined `::m1 m2 mR b1 b2 bR MM` record for a merge.
- False positives on the tree at `60fe70be4`: the scan flags 0 of 179 migrations, SVG
  fixtures, rake tasks, seeds files, SQL scripts and Mirage factories, and the audit run-logs
  scan clean. `db/seeds.rb` flags one email (a `lingolinq.com` address), so an edit that adds a
  line like it needs the label.

## What changed

- `scripts/data-bearing-path-check.sh`: per-path judgement inside the unchanged ranges
  (`scan_raw`, `scan_entry`, `added_lines`, `scan_text`), the `ALWAYS_LABEL_RE` and
  `BINARY_EXT_RE` lists, workflow rule removed, headers rewritten. Scanner is an inline python3
  program reading bytes; it prints kinds, never values.
- Tests: 163 cases before, 360 after, including three built-in mutants.
- Headers of the workflow and CI script, the canary list, `CLAUDE.md` (new "no production
  data" rule and the Before a PR paragraph), `AGENTS.md`, `.github/copilot-instructions.md`,
  `.claude/rules/data-bearing-paths.md`, and the two audit-run skills' run-log notes.

## Verification

See the PR body for pasted output. Ten ad hoc mutants of the check were run against the whole
suite; the one that first survived (dropping the identical-blob shortcut) led to the mode-only
cases, after which all ten are caught.

## Fresh-context review (2026-11-06)

No blocking finding. Fixed after reproducing: a value right after a JSON or YAML escape
(`\n801-...`) was missed because the escape's letter read as part of a word (four red cases,
then the fix); the email pattern was quadratic on a long run with no `@` (80K chars took 6.5 s,
2 MB now takes 0.31 s); finding lines now start with `- ` so a PR-controlled path never starts
a log line. Documented, not changed: the cassette scope (only paths the classifier already
flags) and the longer list of shapes the scan misses (file names, mixed separators, dashless
SSNs, URL-encoded emails).

## Second decisions (Scot, 2026-11-07), red tests first

- The workflow residual is closed narrowly: a workflow file whose new content names the
  `data-bearing-status` environment, `DATA_BEARING_APP_PRIVATE_KEY` or
  `DATA_BEARING_APP_CLIENT_ID` (whole name, any letter case) needs the label (`check_workflow`).
  A deleted one does not. Of the 8 workflows on develop, only the gate's own names any of them.
  Residual: a name assembled at run time is not seen.
- Base64 `data:image/`, `data:audio/` and `data:video/` URIs are flagged: a voice recording is
  student data. Other `data:` types and non-base64 URIs pass.
- 16 red cases, then green; nine mutants of the two rules, all caught.
- The governance memo and the brain instructions stay out of this PR (tracked as a follow-up).
- shellcheck is skipped: CI does not run it (Scot).
- Supersedes #1279 (closed draft, approval carry-forward across pushes).

## Not done here (follow-ups)

- `docs/legal/2026-08-24_ai-governance-memo.md` still says the check "fails a pull request that
  adds or changes a data-bearing path ... until" the label; it is a governed legal doc, so it
  is left for Scot. The brain's global instructions describe the gate the same way.
- shellcheck was not run (skipped by decision; CI does not run it).
- Residual of the scan: names, street addresses, birth dates, free text, and phone numbers in
  other formats (international, unseparated, space-separated) pass it.
