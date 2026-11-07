# 2026-11-06: keep a develop synthetic-data approval across pushes that leave flagged files unchanged

Plan: `~/ai-company-brain/outputs/plans/2026-11-06-data-bearing-approval-carry-forward.md`
(Scot approved the goal 2026-11-06). Branch `compliance/scot-synthetic-label-carry-forward-3e054164`
from `origin/develop` `d5966fc2b`. Baseline: `scripts/tests/data-bearing-path-check-test.sh`
OK (163 cases), `scripts/tests/codex-review-path-classifier-test.sh` OK (130 cases).

## Decisions taken before starting (Scot, 2026-11-06)

- Description limit: assume GitHub's practical 140 characters, no probe post. The develop
  description is at most 28 + 39 (longest login) + 7 + 40 = 114 characters; the stub rejects
  anything over 140.
- No revoke label. Withdrawing an approval = editing a flagged file (which changes the data
  scope) or force-pushing the approved commit out; marking the PR draft stops a merge meanwhile.

## Fact sheet

(a) Where the approval is READ.
- CONFIRMED `scripts/data-bearing-path-check-ci.sh:261-266`: one statuses read on `head_sha`, the
  newest `data-bearing-approval/<base>` line must equal `success <App login> <scope_now>`; that
  sets `approved`, the only input to `APPROVED=` at `:269`.
- CONFIRMED `scripts/data-bearing-path-check.sh:172`: the check reads `APPROVED` only after the
  verdict and `control_touched` are computed (`:133-161`), and only to turn exit 1 into exit 0.
- So the carry has to change only how `approved` is computed in the CI script; the check's
  exit semantics stay.

(b) Every shape a `data-bearing-approval/<base>` status can hold, by writer.
- The App, from `:249` only: `success`, `Synthetic data confirmed by <login>; scope <40 hex>`.
  The App posts no other state to an approval context (`post_status` callers: `:115` verdict
  error, `:162` verdict mark, `:249` approval, `:277` verdict). CONFIRMED by reading every
  `post_status` call.
- Anyone else who can post statuses (a PR workflow as `github-actions[bot]`, a person with write
  access): any state, any description. Rejected today by the creator test at `:266`.
- After this change the App also writes `...; data <40 hex>` for develop. Approvals already on
  open PR heads keep the old `; scope` form, so the head check must still accept it.
- The data scope is a new shape: sha256 of `develop\n` plus the flagged raw records, each
  `:<old mode> <new mode> <old blob> <new blob> <status>\t<path>` from
  `git -c core.quotepath=false diff --raw --no-abbrev --no-renames --no-relative base...head`.
  No flagged record gives the hash of `develop\n` alone (nothing to approve).

(c) Cross-file claims, each checked.
- CONFIRMED (scratch repo, 2026-11-06): `--raw` and `--name-only` quote identically under
  `core.quotepath=false`: a Latin-1 name is raw in both, a tab or quote name is C-quoted in
  both, and `${line#*$'\t'}` keeps the Latin-1 byte in `C.UTF-8`. So the verdict can read its
  paths from the raw listing without changing which names reach the classifier.
- CONFIRMED `scripts/codex-review-path-classifier.sh:155-165`: the set verdict is "any line
  matches any pattern" with per-line greps, so it equals the OR of single-path verdicts. The
  quoted-name refusal (`:151-152`) and empty-list refusal (`:130-132`) also apply per path.
- CONFIRMED: plain `git diff --raw` in `scope_of` (`ci.sh:138`) quotes a Latin-1 name; the
  check uses `GITQ` (`check.sh:86`). The legacy `; scope` hash is computed the same way at
  record and verify time, so it stays self-consistent; the new data scope uses `GITQ`.
- CONFIRMED (timed 2026-11-06): one `--data-bearing-only --paths-from` classifier call on one
  path takes about 40 ms. Per-path classification of a 500-file PR is about 20 s, so it runs
  only when the set verdict says something is flagged, and caches by path within one process.
- CONFIRMED `test.sh:445-446, 523-524`: the two "earlier head" tests approve `$EDIT`, which is
  not an ancestor of `$FIX`, so a first-parent walk from `$FIX` never reaches it. They stay
  green unchanged.
- CONFIRMED `test.sh:609-615`: "the recorded approval names its scope" expects the develop
  description in `; scope` form. Design step 2 of the approved plan changes that form, so this
  one assertion changes with the spec (`; data`), and a new staging case keeps `; scope`
  asserted. The plan said no existing test is rewritten; this one is the exception, stated in
  the PR.
- CONFIRMED: `AGENTS.md` and `.github/copilot-instructions.md` do not state the re-label-after-
  push rule (they only say agents never add the label), so they need no change. The plan listed
  them; nothing to edit. `docs/legal/2026-08-24_ai-governance-memo.md` does not state it either.
- ASSUMED, not load-bearing: GitHub accepts a 114-character description (Scot: assume 140).

## Proposal

Diagnosis: the approval is matched on the head only (`ci.sh:262`), and its scope hashes the
whole diff (`ci.sh:138`), so any push, code-only included, voids it.

Candidate A (chosen, the plan's design minus the revoke label):
1. `data-bearing-path-check.sh` develop branch lists paths from one raw listing (`raw_records`),
   and classifies them with `--paths-from` that list instead of letting the classifier diff on
   its own. New mode `--data-scope <base> <commit>...` (develop only) prints `<commit> <40 hex>`
   per commit: set verdict first (one classifier call); only if something is flagged,
   per-path classification with a cache. Flagged = data-bearing, a workflow path, or a
   CONTROL_FILES entry. Exit 3 when the set verdict is data-bearing but no single path is
   (drift guard), or any lookup fails.
2. CI, develop: compute `data_now` for the head. Record new approvals as
   `Synthetic data confirmed by <login>; data <data_now>`. At verdict time accept the head's own
   newest App `success` with `; scope <scope_now>` (legacy) or `; data <data_now>`; otherwise,
   when `data_now` is not the empty hash, walk `git rev-list --first-parent --max-count=50
   base..head`, compute every commit's data scope in one call, and go newest first while the
   scope equals `data_now` (stop at the first commit that differs), reading statuses on each;
   accept the first commit whose newest approval entry is App `success` matching
   `^Synthetic data confirmed by [A-Za-z0-9-]+; data <data_now>$`. The verdict description
   names the source commit. Nothing is posted as an approval by a carry.
3. Staging and main unchanged (head only, `; scope`).

Deviations from the plan, and why:
- Newline listing, not `--raw -z`: the classifier is line based. With `-z` a name holding a
  newline is printed raw and would split into two lines; without `-z` git quotes it, and the
  classifier refuses it (exit 3), as it does today.
- `--first-parent`, a 50-commit cap, and stopping at the first differing scope, instead of the
  whole `base..head` with "10 reads": a PR's earlier heads sit on its first-parent chain, and
  commits merged in from develop or another branch would only add cost (their diffs carry other
  PRs' data). The plan's "stop after 10 reads" would miss an approval behind 11 code-only
  commits pushed together, since every one of them shares the scope; stopping at the first
  differing scope bounds the reads by the run of unchanged commits instead, capped at 50. Every
  narrowing fails closed: the label is needed again.
- Old `; scope` approvals keep counting on their own head, so PRs open at merge time are not
  re-blocked; they are never carried.

Candidate B (rejected): an approval per flagged path and blob. More parsing, no added safety
(the plan's own finding).
Simplest alternative (rejected): keep hashing the whole diff but drop non-flagged lines with a
grep of the path patterns in the CI script. That duplicates the classifier's patterns in a
second file, which the check header forbids (`check.sh:48-50`).

Risks:
- Per-path classification cost on big flagged PRs (about 40 ms a path, cached). Bounded by the
  job's 15-minute timeout, which fails closed (the error step).
- A carried approval binds the flagged records exactly; a reviewer who approved data at commit X
  has approved the same bytes at the same paths on the same merge-base blobs, so content cannot
  change under it. What a carry does not cover is new unflagged content, which the check never
  covered.
- Rate: up to 50 extra status reads per run on a long unapproved stretch, on the workflow
  token.

Unresolved: none blocking. The 140 limit is assumed (Scot).

Tests (red first): carried across a code-only push (verdict names the source); not carried
after a content edit, a mode change, a new data file, a workflow or control edit; Latin-1 name
approved and carried, not carried after an edit; rename from a flagged to an unflagged path;
the classifier gaining a pattern; develop merged in with a changed merge-base blob (not
carried) and with an unrelated change (carried); approved commit force-pushed out; newest
source status `failure`, from `github-actions[bot]`, from a person; staging and main never
carried; a re-run carries and records nothing; legacy `; scope` on an older commit not
carried; description over 140 rejected by the stub, a 39-character login fits; a source 35
commits back carried, 55 back not.
Mutations that must fail: build the data scope from the name-only list (content case);
drop `core.quotepath=false` (Latin-1 case); drop the App-creator test in the walk (forged
case); hash paths only (mode-change case).

## Proposal review (adversary agent, 2026-11-06): "ship with conditions"; disposition

Each finding was checked here before acting on it.
- High, `$(...)` in a path name runs as code through a path-keyed bash array. Mechanism
  CONFIRMED only for `[ -v "A[$key]" ]` (bash 5.2.21: a name `x[$(touch M)]` created `M`);
  `${A[$key]+set}`, `${A[$key]}` and `A[$key]=`, the only forms the code uses, ran nothing
  (same probe). Kept the cache; added a comment forbidding `-v` and `(( ))` on it, the marker
  test (three names holding `$(touch ...)`), and the check now runs with `GH_TOKEN` and
  `STATUS_TOKEN` unset. Mutation `-v` makes the marker test fail.
- Medium, the plan's "different set" guard was dropped. Accepted: the paths called clean one at
  a time are classified again as a list and must come back false, else exit 3.
- Medium, a carried workflow approval does not cover the scripts it runs. Rejected, with
  Scot's decision (2026-11-06, "carry workflows too"): those scripts are unflagged today, so a
  later PR editing one needs no approval either; the carry does not widen what merges unseen.
- Medium, up to 50 status reads per run on the workflow token (1,000 an hour per repository,
  docs.github.com rate-limits page, fetched 2026-11-06). Accepted: the walk reads with the App
  token (installation minimum 5,000 an hour, same page). The head's own read is unchanged.
- Low, Rule 14: Scot gave explicit OK (2026-11-06) to change the develop description
  assertion in "the recorded approval names its scope"; a staging case keeps `; scope`.
- Low, whitespace names: `IFS= read -r` everywhere; tests for a trailing-space name (read
  whole) and a whitespace-only name (fails closed, exit 3; an approval cannot clear it, as
  the check header already says for unclassifiable names). Out of scope, existing today:
  `tmp.csv ` (trailing space) is not flagged by the classifier.
- Low, user-facing text: the check's approval and failure messages and the CI failure
  description are updated.
- Fact-sheet corrections accepted: APPROVED is also read at `check.sh:91-94` (validation
  only); the workflow posts App statuses inline too (`yml:142`, `yml:213`, verdict context
  only); the set verdict equals the OR of single-path verdicts except for a whitespace-only
  name, which now fails closed.

## Trace to the read

- `approved` is read once, at the check call in `data-bearing-path-check-ci.sh` (`env -u ...
  APPROVED="$approved" ...`). Every path that sets it true runs before that call: the head's
  own `scope`/`data` match, or the walk, which sets it only on an App `success` whose `data`
  equals `data_now`, on a first-parent commit whose own data scope equals `data_now` and every
  commit between it and the head likewise (the loop `break`s on the first differing scope).
- `data_now` is computed before the label branch, so a recorded develop approval and the
  later match use the same function (`data_scope` in the check) on the same listing
  (`raw_records`), which the develop verdict also reads.

## Falsification (mutated copies under the scratchpad, each run of the full suite)

| Mutant | Target case | Result |
| --- | --- | --- |
| scope from names only (modes and blobs dropped) | a content edit not kept | red (14 FAILs) |
| plain `git diff` (no `core.quotepath=false`) | Latin-1 kept / not kept | red (8) |
| walk accepts any creator | copied approval by github-actions[bot] / mallory | red (3) |
| hash the path, not the record | mode-only change not kept | red (14) |
| `read -r` without `IFS=` | trailing-space name read whole | red (2) |
| complement guard removed | path flagged in the list but not alone | red (2) |
| cache test with `[ -v ]` | `$(...)` name runs nothing | red (2) |
| walk reads with the workflow token | head read workflow, walk read App | red (2) |
| `continue` instead of `break` on a differing scope | changed and changed back | red (2) |
| `WALK_MAX=500` | approval more than 50 back | red (2) |

Final: `data-bearing-path-check-test.sh` OK (252 cases, about 64 s), classifier test OK (130).
