# Ember upgrade findings register

Register for residual breakage from the **Ember 3.28 → 5.12** upgrade (ember-source/cli
`~5.12.0`, ember-data `~5.3.8`). Produced by the `/ember-audit-run` orchestrator
(`.claude/skills/ember-audit-run/SKILL.md`), which fans out the read-only
`ember-upgrade-auditor` finder across codebase slices and (optionally) merges runtime
findings from `scripts/ember-route-crawl.mjs`.

## Files
| File | What |
|------|------|
| `FINDINGS-EMBER.json` | The register (single source of truth for status) |
| `FINDINGS.md` | Rendered view (the renderer always writes a sibling named FINDINGS.md) — regenerate with `ruby scripts/citation-check.rb --render audit-reports/ember-upgrade/FINDINGS-EMBER.json`; never hand-edit |
| `run-log/runs.jsonl` | One JSONL line per `/ember-audit-run` (committed) |
| `crawl/` | Raw runtime-crawl outputs (gitignored except summaries the run promotes) |

## Why a separate register from `audit-reports/FINDINGS.json`
Framework-upgrade bugs are engineering findings, not compliance findings. Mixing them
would pollute the compliance headline (open Critical/High count) that `/compliance-status`
reports. Both registers share the identical merge + citation machinery — the scripts are
register-path parameterized. The merge itself runs from `/ember-audit-run`, which gates the finders
first and passes each slice's file in its own `--in` (Steps 2b and 3). The checks afterwards:

```
ruby scripts/citation-check.rb audit-reports/ember-upgrade/FINDINGS-EMBER.json
ruby scripts/register-lint.rb audit-reports/ember-upgrade/FINDINGS-EMBER.json
```

`--sha` restamps this register's audit pointer, which is correct for a whole-tree slice fan-out. A single finding filed OUTSIDE a full run takes `--sha <trueCommit> --no-restamp` instead,
which anchors `evidence.sha` at the real commit and leaves `meta` untouched. See
`audit-reports/README.md`, "The audit pointer vs. the evidence anchor".

## Governance (same rules as the main register)
- The merge only ever ADDS findings or marks them `open`; regressions of Scot-decided
  findings are flagged, never flipped.
- **Only Scot closes a finding, downgrades severity, or accepts risk.**
- Evidence is code/path only (the merge REFUSES PII/secret-shaped content). Runtime
  findings from the crawler carry `evidence.type: "runtime"` + `evidence.source` and are
  exempt from the snippet-at-SHA citation gate, so the crawler pre-sanitizes console
  text (IPs, global_ids) before emitting.

## Relationship to `docs/ember-5.12-migration-findings.md`
That doc is the 2026-07-09 one-shot sweep (root-cause Classes 1–6 + fix log). It seeded
this system's checklist and stays as historical record. New findings land HERE; finders
cross-check both that doc's "already fixed / verified-safe" lists and this register
before emitting, so nothing gets re-reported.
