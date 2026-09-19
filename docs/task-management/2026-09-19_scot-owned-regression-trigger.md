# Issue #1014: SCOT_OWNED_CLOSED misses remediated-unverified (2026-09-19)

## Fact sheet

(a) WHERE READ — CONFIRMED: `scripts/audit-merge.rb:273` and `scripts/promote-finding.rb:327`,
both `scot_owned_status = SCOT_OWNED_CLOSED.include?(existing['status'])`, the sole gate deciding
whether a re-found finding takes the loud "regression" branch or the silent "reseen" branch.

(b) ALL SHAPES — CONFIRMED against `meta.statusEnum` and the live register:
`SCOT_OWNED_CLOSED = %w[verified-closed accepted-risk superseded]` omitted `remediated-unverified`,
one of five statusEnum values. Of the 10 `remediated-unverified` rows on `develop` at filing time,
3 (`accepted`x1, `fixed`x2) were protected by the orthogonal `SCOT_OWNED_DISPOSITIONS` axis; 7
(`null`x5, `untriaged`x2) were not.

(c) CROSS-FILE CLAIMS — CONFIRMED: `scripts/promote-finding.rb` carries a byte-identical
constant and branch (line 82, 327-345), independently reachable from the PR-time promotion
path (`.claude/skills/promote-finding/SKILL.md:105`), not just `/audit-run`.
`audit-merge.rb`'s own header: "Mirrors scripts/promote-finding.rb; kept in lockstep by hand" —
fixing only the file the issue named would break that documented invariant. `register-lint.rb`
has no evidence.sha/auditedSha comparison, so the issue's alternative (a lint rule) is new,
downstream machinery, not a small fix. `register-consumer-smoke-test.sh`'s own header states an
EMPTY-input, byte-identical no-op contract this scenario would violate; a new dedicated file is
the established convention (`register-lint-shape-test.sh`, `attestation-hash-guard-test.sh`).

## Red test

`scripts/tests/scot-owned-regression-test.sh`, hermetic (audit-merge fixture uses runtime-type
evidence, no git; promote-finding fixture uses this repo's own shebang line at `git rev-parse
HEAD`). Confirmed red against `origin/develop` (`git show origin/develop:...` copies via
`AUDIT_MERGE`/`PROMOTE_FINDING` env overrides): 11 of 22 assertions FAIL, exactly the diagnosed
gap (remediated-unverified + null/untriaged disposition, in both scripts, plus their
note/summary/evidence-preservation assertions) and nothing else (the negative control and the
two already-covered positive controls all pass). (Corrected 2026-09-19 from an initial "10 of
21" miscount caught independently by both PR #1019 reviewers by actually running the harness.)

## Proposal + adversary review (before any code touched)

Proposal: add `remediated-unverified` to `SCOT_OWNED_CLOSED` in both scripts (rejected
alternative: a register-lint rule, downstream of the mutation and false-positive-prone).
Put through `/adversary-review` on the PROPOSAL, before editing code. Verdict: needs changes
first.

**High, independently reproduced on scratch copies before accepting**:
`promote-finding.rb:376`'s end-of-run invariant scopes by
`finding.source.promotedDate == run_date`, a proxy for "created this run" that also matches a
row an EARLIER invocation created today whose status was since changed out of band. Reproduced:
promote a finding, flip its status to `remediated-unverified` by hand (exactly what this
session did routinely today), re-find it later the same day -- with only the constant fix, the
whole promotion batch `die()`s under "assigned a Scot-owned status", which this run did not do.
Fix: scope the invariant to `created_ids`, the ids this invocation's own loop actually created,
not a date-string match. Falsified in both directions: (1) the constant-only patch on a scratch
copy reproduces the abort; (2) a deliberately-broken copy that forces a genuinely-new record to
`status: verified-closed` still correctly `die()`s under the fixed, `created_ids`-scoped
invariant -- the fix makes the invariant match its own documented intent, not weaker.

**Medium, independently verified**: `scripts/citation-check.rb`'s `render_markdown` hides the
`⚠regression` marker whenever `disposition_state` reads `untriaged` (covers both a missing
`disposition` object and an explicit `state: "untriaged"`) -- exactly the two shapes this fix
targets. Fixed: the marker now renders alongside `untriaged` instead of being suppressed.
Verified against the live committed register: zero-diff today (no live row currently combines
`regression:true` with an untriaged/null disposition), so this is forward-looking only.

**Medium, independently verified**: the new test wasn't wired into `ci.yml` or
`scripts/regenerate-register.sh`, unlike the sibling harnesses. Fixed.

**Medium, self-inflicted while strengthening the test**: forgot to pass `FIXTURE_SHA` into the
finder-JSON-building step for the same-day-flip case (env var placed after the command instead
of before, the same class of mistake as an earlier session today on the Notion publisher test).
Caught by the test's own "fixture setup failed: row not found" abort rather than a silent false
pass. Fixed.

**Low, independently verified, not fixed**: `audit-merge.rb`'s own end-of-run invariant reads
`SCOT_OWNED_CLOSED` too but is unconditionally unreachable (`ASSIGNABLE_STATUS` is `'open'`,
never in the list) -- unaffected by this fix either way, pre-existing, out of scope. Filed as
issue #1022 (see "Dual review round 2" below) rather than fixed here.

## Falsification

Reverted the three production fixes on the committed state, confirmed the test goes red again
(same 11-assertion failure pattern), restored. See commit history for the exact revert/restore
pair.

## Dual review round 2 (PR #1019, after the fix commit)

`senior-review-1019` and `adversary-1019` independently reviewed the applied commit
(`91524d249`). No Critical/High. Findings applied in a follow-up commit, each independently
re-verified before applying (never taken on the subagent's word alone):

- **Medium (adversary)**: both scripts' header comment blocks (`audit-merge.rb:18-21`,
  `promote-finding.rb:30-33`), `audit-reports/README.md:38-40`, and
  `.claude/skills/promote-finding/SKILL.md:66-67` still described the trigger as
  "open/remediated-unverified reseen" / "previously-closed", exactly the sentence this fix made
  false. Fixed: all four now name the full SCOT_OWNED_CLOSED set.
- **Medium (adversary)**: the regression branch in both scripts appends a new `REGRESSION:` note
  on every run with no dedupe; a `remediated-unverified` row whose fix is out-of-repo re-finds on
  every run and grows the note unbounded (measured 188 to 924 bytes over 5 runs). Fixed: guard the
  append on `existing['regression']` already being true; confirmed red (note count=2 after two
  runs) before the fix, green (count=1) after, in both scripts.
- **Medium (adversary)**: the `created_ids`-scoped invariant (the High fix from round 1) had no
  coverage proving it still FIRES for a genuine violation; deleting the whole invariant block left
  the harness green. Fixed: added a case that runs a scratch copy with `ASSIGNABLE_STATUS` forced
  to `'verified-closed'` and asserts `die()`.
- **Medium (senior)**: the test's fixture builders covered only 2 of the 4 `SCOT_OWNED_CLOSED`
  statuses (`verified-closed`, `remediated-unverified`) while the CI step name and the harness's
  own PASS banner claimed "every Scot-owned status". Fixed: added `accepted-risk` and `superseded`
  fixture rows to both builders (audit-merge and promote-finding).
- **Low (adversary)**: `citation-check.rb`'s render fix had no test; a revert would ship silently
  since the live register's one `regression:true` row doesn't exercise the untriaged/null shape.
  Fixed: added a fixture register + `--render` case asserting the marker survives.
- **Low (senior)**: stale locator, `promote-finding.rb:377` -> corrected to `:376`. Fixed.
- **Low (senior)**: assertion counts in this doc and the PR body were stale (said 21/10, measured
  22/11). Fixed above.
- **Low (senior + adversary, agreed not to fix here)**: `audit-merge.rb`'s own end-of-run
  invariant is dead code, pre-existing, unaffected by this PR either way. Filed as issue #1022
  rather than folded into this PR (smaller blast radius).
- **Low (senior, agreed not to fix)**: `promote-finding.rb:392`'s invariant disposition leg
  (`disp != ASSIGNABLE_DISPOSITION`) is tautological against the same constant that assigns the
  value; pre-existing and byte-identical on `origin/develop`, this PR neither introduces nor
  worsens it.
- **Low (senior, readability, no behavior change)**: split the repeated ternary at
  `citation-check.rb`'s regression-marker line into two statements. Fixed.

Test suite grew from 22 to 38 assertions across this round (16 net new: 2 dedupe cases x 2
scripts = 4, 1 invariant-fires case, 1 citation-check render case, and 8 new fixture rows across
the 2 accepted-risk/superseded statuses x 2 scripts x 2 assertion types). All 38 pass on the
final commit; `scripts/regenerate-register.sh --check` passes (after re-rendering
`DOCUMENT-REGISTER.json`'s contentHash for `audit-reports/README.md`, whose text changed in this
round -- unattested row, safe hash update, verified single-field diff).
