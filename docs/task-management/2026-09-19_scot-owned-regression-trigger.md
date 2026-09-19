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
`AUDIT_MERGE`/`PROMOTE_FINDING` env overrides): 10 of 21 assertions FAIL, exactly the diagnosed
gap (remediated-unverified + null/untriaged disposition, in both scripts, plus their
note/summary/evidence-preservation assertions) and nothing else (the negative control and the
two already-covered positive controls all pass).

## Proposal + adversary review (before any code touched)

Proposal: add `remediated-unverified` to `SCOT_OWNED_CLOSED` in both scripts (rejected
alternative: a register-lint rule, downstream of the mutation and false-positive-prone).
Put through `/adversary-review` on the PROPOSAL, before editing code. Verdict: needs changes
first.

**High, independently reproduced on scratch copies before accepting**:
`promote-finding.rb:377`'s end-of-run invariant scopes by
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
never in the list) -- unaffected by this fix either way, pre-existing, out of scope.

## Falsification

Reverted the three production fixes on the committed state, confirmed the test goes red again
(same 10-assertion failure pattern), restored. See commit history for the exact revert/restore
pair.
