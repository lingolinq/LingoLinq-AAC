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
- No frontend/backend code changed by this session; this file is the only change.

## Not done here, on purpose

- The `no-nested-interactive` fix itself (deciding what the corrected markup for the speak-bar
  toggle / board-intro button should be). Intentionally routed to Melissa/Traci given the blast
  radius (a control every AAC user touches) and the diagnose-then-propose-fixes-then-review
  discipline this repo's CLAUDE.md requires for a change like that.
