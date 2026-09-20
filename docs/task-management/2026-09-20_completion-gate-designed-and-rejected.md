# Local completion gate: designed, built, rejected (2026-09-20)

**Status: rejected. Do not rebuild this.** Enforcement of Rule #0 item 14 belongs in
branch protection and CI, not in a local Claude Code hook. This note exists so the idea
is not re-derived from scratch in three months.

## What was proposed

A `Stop` hook registered in this repo's `.claude/settings.json` that blocks a Claude Code
session from ending while the working tree carries unverified code changes. It did not run
the suites (a healthy Ember run is ~34 min per `.github/workflows/ci.yml`, against a 600s
default hook timeout, and a timed-out hook is cancelled WITHOUT blocking). Instead
`scripts/verify.sh` ran the scope-appropriate checks and wrote a marker under
`.git/completion-gate/`, and the hook verified that marker against the current tree state.

It was built, tested (13 deny/allow cases), and proven to block in four induced-failure
cases. It was then reviewed and dropped. Note that the review was a DEGRADED dual review,
not two agreeing lenses: the Codex senior-dev leg died mid-run (MCP transport failure,
then `collab spawn failed`) with no exit marker and delivered zero findings, so the
adversary pass carried it alone. The Critical below was decisive on its own and was
independently reproduced before the decision was taken, so the decision stands, but no
one should read this record as two reviewers concurring. The code is not in the repo; recover it from
the review transcript if you must, but read the rest of this note first.

## Why it was rejected

**1. It gated on the wrong state, and the bypass is behaviour we mandate.** The gate keyed
its entire decision on working-tree dirtiness. Committing the unverified change makes the
tree clean, so the gate allows the stop. Confirmed: dirty and unverified blocked (exit 2);
the identical change, committed, allowed (exit 0). `git stash push -u` did the same. This
is not an adversarial bypass. Rule #0 item 13 instructs agents that when the error rate
rises they should "commit what is verified, write down what remains, and stop", so every
agent following item 13 walks straight through the gate. Working-tree dirtiness was never
the right key, and each candidate fix is a different design, not a patch.

**2. Six independent fail-open paths were found before it shipped**, which is the dominant
failure shape in our own defect log:

- `git commit` clears the gate (above).
- `git stash push -u` clears it the same way.
- The `.md` exemption plus rename parsing: `git mv spec/foo_spec.rb docs/foo_spec.md` was
  allowed while `git rm spec/foo_spec.rb` was blocked, so the highest-value evasion was
  the one the gate classified as exempt. `CLAUDE.md`, `AGENTS.md` and
  `.github/copilot-instructions.md` are themselves `.md`, so the instruction layer that
  backstopped the gate was in the ungated class.
- Paths git C-quotes (`"`, `\`, newline, tab) were digested as the literal string
  `ABSENT`, because `core.quotepath=false` only suppresses quoting for non-ASCII. One
  passing run then licensed unlimited edits to such a file.
- The configured 10s hook timeout against a measured 4.9s `git status --porcelain
  --untracked-files=all` on the `/mnt/c` checkout, where the per-file digest costs ~40ms
  on drvfs. Roughly 125 dirty files exhausted the budget and the hook failed open silently.
- Backend scope mapped every non-frontend, non-`.md` path to a full `bundle exec rspec`,
  which is unsatisfiable locally without a scratch-DB override. Because the kill switch is
  read from the hook process environment, there was no in-session escape, which made
  hand-forging the marker the only in-session path and inverted the design's own
  anti-forgery rationale.

**3. No Claude Code hook covers Codex or Gemini, in any placement.** Hooks are a Claude
Code mechanism; Codex CLI does not execute them. Repo-scoped, user-scoped and brain-repo
placements were all compared, and all three leave Codex uncovered. The only enforcement
surface shared by every agent and every human contributor is the server.

## What should happen instead

Enforcement belongs in GitHub branch protection and CI, which run server-side, cover every
agent and contributor equally, and cannot be bypassed by a local commit.

As of 2026-09-20, `develop` requires `rspec`, `build-and-test`,
`audit-artifacts-integrity`, `secret-detection` and `codex-review-tests`, with
`required_approving_review_count: 0` and `strict: false`. `codex-review/deep-pass` is
absent from the required set on all three protected branches and no run has been
dispatched since 2026-08-04. So the blocking dual review described in `CLAUDE.md` has no
server-side enforcement today. That gap, not the absence of a local hook, is the thing
worth closing.

**Nothing currently enforces Rule #0 item 14.** It is an instruction-layer rule. Do not
describe any existing mechanism as enforcing it.

## Related

- `CLAUDE.md` Rule #0 items 13 and 14
- `AGENTS.md` "Hard rules" and "Before a PR"
- `.github/workflows/ci.yml` (the checks that actually gate)
- `scripts/tests/agent-hook-guards-test.sh` (the pattern a future gate's tests should follow)
