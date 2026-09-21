# develop CI lint-todo expiry: investigation, duplicate-work catch, and handoff

Date: 2026-09-19. Branch: `docs/scot-lint-todo-duplicate-session-coordination`. No code changed by
this session -- this is a record of an investigation that ended in deferring to another session's
already-merged fix, plus a routing decision on a second, unrelated finding.

## Goal

Diagnose why `develop`'s "Lint Ember templates" CI step had gone red with no frontend code change,
fix it, and give a full forward-looking view of any other `.lint-todo` entries about to do the same
thing.

## Investigation

- **Root cause, confirmed in code, not assumed:** `app/frontend/.lint-todo`'s entry for
  `deprecated-inline-view-helper` at `app/templates/organization/index.hbs:309` had `errorDate`
  1789689600000 = 2026-09-18T00:00:00Z. Read the actual comparison logic used by the lint tool
  (`node_modules/@lint-todo/utils/lib/date-utils.js` `isExpired()`: `today > date`, strict
  greater-than; `node_modules/@lint-todo/utils/lib/get-severity.js` `getSeverity()`) -- a
  grandfathered todo entry is promoted to a hard error starting the day **after** its `errorDate`,
  not on the date itself. Today (2026-09-19) is that day, so the entry flipped with zero code
  change. `git blame -L 309,309` on the line: last touched 2026-07-17 (Melissa), confirming no
  regression.
- **False positive, proven by reading the rule's source, not inferred from behavior:**
  `node_modules/ember-template-lint/lib/rules/deprecated-inline-view-helper.js`,
  `manageMustacheViewInvocation()`. It flags any hash-pair whose value's `.original` string starts
  with `"view"` split on `.`, without checking whether that value is a real Handlebars *path*
  expression (the actual pattern the old `{{view someProp}}` / `{{component prop=view.foo}}`
  helper produced) or just a quoted string literal. `{{t "View" key="view"}}` at
  `organization/index.hbs:309` passes the literal string `"view"` as an i18n lookup key, unrelated
  to Ember's removed classic view layer. `grep -rn 'key="view"' app/frontend/app` (and the JS
  equivalents) returned exactly this one call site, and the `"view"` key exists in all 13
  `public/locales/*.json` files.
- **Full 30-day expiry list, not just the two flagged entries:** rather than grep the raw file
  (misleading -- many stale `add`/`remove` pairs from historical re-baselines are still in the file),
  replayed the entire `.lint-todo` add/remove history in order, keyed by each entry's content hash
  (190 `add` lines, 188 `remove` lines in the file at the time). Net result: **only 2 entries are
  actually active**, and they are exactly the two already known:

  | File | Rule | Status on 2026-09-19 |
  |---|---|---|
  | `app/templates/organization/index.hbs:309` | `deprecated-inline-view-helper` | hard error (see above) |
  | `app/templates/application.hbs:135` | `no-nested-interactive` | still a warning; `errorDate` 2026-09-19T00:00:00Z means it promotes to a hard error starting **2026-09-20T00:00:00Z** |

  Nothing else in the file is due to expire within the next 30 days.
- Verified `npm run lint:hbs` (`ember-template-lint .`, confirmed against `package.json` and
  `.github/workflows/ci.yml:116-122`) actually exits 1 with these two findings -- first checked by
  piping through `tail`, which silently reports the pipeline's own exit code (0, from `tail`) rather
  than the lint command's; re-ran without the pipe and captured `$?` directly to get the real
  exit code (1).

## Decision point, then a reversal

Presented Scot two real fix options for the false positive: disable
`deprecated-inline-view-helper` in `.template-lintrc.js` (matches this repo's existing convention of
disabling a rule with a rationale comment, e.g. `no-duplicate-landmark-elements`,
`require-media-caption`) vs. rename the i18n key and update all 13 locale files, plus a scope
question on whether to fold the `no-nested-interactive` item into the same PR. Scot picked "disable
the rule" and "include both in one PR."

**Before creating a branch or writing any fix**, checked existing worktrees/branches for prior work
on this exact task (standing practice: grep open PRs and running sessions before implementing) and
found a different Claude Code session had already fixed the identical bug a few hours earlier:
branch `chore/scot-template-lint-view-helper-false-positive-5d62a7f8`, commit `3cf17fe52`, already
open as **PR #1020** with all 6 required CI checks green and mergeable.

That PR used the *other* option: renamed the i18n key `view` to `view_log` at the one call site and
added a matching `view_log` row (identical existing value) to all 13 locale files, not the
rule-disable Scot had just picked in this thread. That same prior session had also independently
investigated `no-nested-interactive` and reached a materially different conclusion than "just
another rule false positive": it traced the app's main speak-bar/button-list toggle
(`<a href="#" tabindex="0" id="button_list">`, `application.hbs` ~line 126) and found one of its
conditional render branches nests a second interactive element inside it: the board-intro button
(`<div role="button" tabindex="0" data-bd-action="board_intro">`, ~line 135-136). That is a real,
pre-existing accessibility defect (two focusable/interactive elements, one inside the other), not a
rule limitation. The prior session deliberately left it out of PR #1020, calling it a genuine
UX/accessibility decision that "does not belong in a one-line i18n rename PR."

Flagged the conflict to Scot instead of proceeding on the original decision. His call:

1. Let PR #1020 stand as the fix. It already works, is fully tested, and is CI-green; don't ship a
   second, competing fix for the same bug.
2. Route the `no-nested-interactive` accessibility fix to Melissa/Traci rather than have either
   Claude session push a structural change to a control every AAC user depends on into a
   lint-housekeeping PR. This matches this repo's own Rule #0 discipline (diagnose fully, propose
   multiple candidate fixes, adversarial review) for a change of that blast radius.
   **Item 2 was superseded on 2026-09-20 -- see "Superseded" at the end of this file.**

Coordinated directly with the other session (cross-session message) to confirm stand-down and avoid
a duplicate PR; they confirmed and reported #1020 already merged.

## Outcome, verified independently rather than taken on the peer session's word

- `gh pr view 1020`: `state: MERGED`, merge commit `31570226f7ad641738d4a3b8524435eaa9ede9e8`,
  merged 2026-09-19T15:15:56Z.
- `git merge-base --is-ancestor 31570226f... origin/develop`: confirmed the merge commit is actually
  on `develop` (not just claimed).
- CI run for that exact merge commit (`gh run view`, job `build-and-test`): **`Lint Ember templates`
  step: success.** `Lint Ember JS`: success.
- **Caveat, not glossed over:** that same CI run's overall conclusion is `failure`. The failing step
  is `Run Ember tests (Chrome Headless)`, specifically test 157,
  `Unit | Component | boards-layout-toggle: choosing TOP-DOWN persists it to the user`. This matches
  a documented pre-existing flake class in this repo (`CLAUDE.md` Rule #0.10: a `localStorage`
  teardown race in `capabilities.sync_access_token` that "charges the resulting GLOBAL FAILURE to
  whichever test happens to be running"), not a regression introduced by PR #1020: confirmed
  `git diff <PR base>..<merge commit> --stat` touches neither `boards-layout-toggle` nor
  `capabilities.js`. Not chased further here; out of scope for this task, flagged for whoever
  triages CI flakes next.
- Filed the accessibility bug as a task in the Active Tasks Notion tracker (High priority, Area:
  Frontend) for Melissa/Traci, noting the 2026-09-20T00:00:00Z deadline before `no-nested-interactive`
  also starts hard-failing CI: https://app.notion.com/p/3e05fe8215c2814f994bdaf1863089ba
  **Repointed 2026-09-20 at review rather than implementation** (see "Superseded" below).
  Recorded here from Scot's instruction; this session neither read nor wrote Notion, so the
  tracker's live state is unverified from here.
- No frontend/backend code changed by this session; this file is the only change.

## Not done here, on purpose -- SUPERSEDED 2026-09-20

- The `no-nested-interactive` fix itself (deciding what the corrected markup for the speak-bar
  toggle / board-intro button should be). Intentionally routed to Melissa/Traci given the blast
  radius (a control every AAC user touches) and the diagnose-then-propose-fixes-then-review
  discipline this repo's CLAUDE.md requires for a change like that.
  **This no longer describes the state of the work. See below.**

## Superseded 2026-09-20: the fix was implemented after all

The routing decision above was reversed the next day. A later Claude Code session was briefed to
fix the defect directly and did so on branch
`fix/scot-nested-interactive-board-intro-0a736cbc`, commit `eb2483407`.

Neither Scot nor that session knew this document had already routed the work to Melissa/Traci; the
session found this file during its own pre-work check and surfaced the conflict before editing any
code. The duplicate-routing catch is the same class this document exists to record, except that
this time the duplicate writer was the brief itself rather than a parallel agent session.

What changed, so the record is not read as still-pending:

- **Implemented, not routed.** The board-intro control is now rendered as a sibling of
  `#button_list` instead of inside it, guarded by the conditions it previously sat under.
  `npm run lint:hbs` exits 0 and the `.lint-todo` entry is closed by the tool's own
  `--clean-todo` route (190 add / 190 remove / 0 active).
- **The Notion task is repointed at review rather than implementation.** Melissa reviewing a
  finished branch is cheaper than Melissa writing it. Per Scot's call, 2026-09-20.
- **Still open at the time of writing:** the repo's dual review (`/review-pr` plus
  `/adversary-review`), and one human check the implementing session could not do -- booting the
  app with `blank_status` on and an unviewed board intro to confirm the button still renders where
  it did. Scot took both.

Two facts in this file did not survive the later session's verification and should not be cited:

- The violation is at `application.hbs:152`, not the `~line 135-136` recorded above. The `135` in
  the `.lint-todo` row is stale: entries match by content hash, not line number.
- The `no-nested-interactive` entry became a hard error at **2026-09-20T00:00:00Z**, not during
  2026-09-19. `@lint-todo/utils` `getDatePart()` builds "today" from `Date.UTC(...)`, so the flip
  happened at UTC midnight while local time was still 2026-09-19 evening. `develop` was not red on
  this entry for most of 09-19.

## Dual review, 2026-09-20: two High findings, one of them a false claim in the fix itself

`/dual-review` (codex senior-dev pass + claude adversary pass) on `a8c8a7d68` returned
request-changes. Both passes independently reached the same blocking finding.

- **H1, layout is NOT neutral.** `eb2483407`'s commit message asserts "Layout is unchanged ...
  its containing block is the same before and after." That is **false**, and the message is left
  as written because history is a record; this section supersedes it. `.button_list` carries
  `position: relative` (`app/frontend/app/styles/app.scss:4251`) and the anchor carries that class
  via `button_list_class` (`app/frontend/app/controllers/application.js:2107`), so `a#button_list`
  **was** the containing block. Measured on dev in Classic view: moving the control to a sibling
  shifted it **+776px left and +17.5px top**, out of the sentence bar and next to the account
  avatar, with `offsetParent` changing from `A#button_list` to `HEADER`. Fixed by adding
  `position: relative` to the wrap's existing rule at `app.scss:2510`.
- **H2, no keyboard activation.** The control is a `div[role="button"][tabindex="0"]` whose only
  handler is `{{on "click"}}`; Space/Enter do not synthesize a click on a div, and it matches none
  of the delegated keyup targets (`.button` at `raw_events.js:492`, `.integration_target` at
  `:500`). Pre-existing, not introduced here. Fixed alongside H1 using the same synth mechanism as
  the speak-menu case at `raw_events.js:535-541`.

**Why four green checks missed H1.** `lint:hbs`, `lint:js:ci`, `ember build` and the
`board-detail global header` acceptance test all passed on the broken version. None of them can
observe a CSS containing-block change. Green gates were treated as coverage they never provided.

**The eval header already had the fix.** `app.scss:98001` sets `position: relative` on
`#speak.md-eval-header .speak-bar__button-list-wrap`, added 2026-05-04 in `0e42a9471`
("Refactor quick assessment modal layout and functionality"). That commit was eval-scoped and
never addressed normal mode, so the same containing-block need sat unfixed in Classic speak mode.
The H1 fix makes normal mode match what eval mode has done since May.

**A second wrong fact, also corrected here:** `raw_events.js:88` was cited in review as evidence
the call path survived. It never routed this control at all -- `:90` gates on `!btn.id` and
`.extra-btn` has no `id`. The claim in `eb2483407`'s message about `closest()` and the
`data-bd-action` walk is separately true and is NOT affected.

**Routed to the dev team, not fixed here:** the board-intro control is unreachable by switch
scanning entirely (`app/frontend/app/utils/scanner.js:252` sweeps
`#speak button:visible, #button_list, a.btn`), and hard-loading a Classic board URL returns 404
because `config/routes.rb` has SPA fallbacks for `board-detail` (`:109-110`) and none for
`board/:boardname`.

A third hazard was found while fixing it, and belongs with whoever maintains the suppression
guidance: `--clean-todo` defaults to TRUE outside CI and purges **expired** entries whether or not
the underlying violation was fixed. It does not hide the defect -- the violation is reported as a
hard error in the same run, exit 1 -- but it erases the record that the item was ever a dated
suppression, which is what makes "was this fixed, or did it just age out" unanswerable later.
