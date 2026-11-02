# 2026-11-02 admin_reports home_boards scope (#1182)

## Fact sheet

### (a) Where is this value actually READ?

- `params['report']` is read for the non-admin allowlist at `app/controllers/api/organizations_controller.rb:347-348`. `/^status-/`, `/^access-/`, `/^device-/`, `/^vocab-/`, `/^grid-/` skip the `allowed?(org, 'impossible')` gate.
- The same param is read again for dispatch at `:359` onward. The home-board branch is `elsif params['report'].match(/home_boards/)` at `:403`, **before** the `status-` / `access-` / `device-` / `vocab-` / `grid-` branch at `:441-442`.
- That branch reads `UserBoardConnection.where(:home => true)` at `:404` with no org filter, walks to the root board, and returns `stats[root_board.key] = count`, dropping counts `<= 1` (`:429`). `res[:stats] = stats if stats` at `:753`.
- CONFIRMED (`organizations_controller.rb:347-348,403-429,441-442,753`).

### (b) What are ALL the shapes this can hold?

Writers of `params['report']`:

1. Frontend `available_reports` for admin orgs: `'home_boards'` and `'recent_home_boards'` (`app/frontend/app/controllers/organization/reports.js:41-42`). Non-admin menu does not offer those ids (`:54-59`).
2. Frontend `current_report` query param: any string, including hand-edited `status-home_boards` (`reports.js:20-21,65-77`).
3. Direct `GET /api/v1/organizations/:id/admin_reports?report=...` (`config/routes.rb:346`).

Reachable names that pass the non-admin allowlist **and** match `/home_boards/`: any allowlisted prefix plus the substring, including `status-home_boards`, `status-recent_home_boards`, `access-home_boards`, `device-home_boards`, `vocab-home_boards`, `grid-home_boards`. Unprefixed `home_boards` / `recent_home_boards` do **not** pass the allowlist, so a non-admin already hits `allowed?(org, 'impossible')` at `:349-350`.

CONFIRMED (`organizations_controller.rb:347-351`, `reports.js:34-59`, `routes.rb:346`).

### (c) Cross-file claims

- Existing spec `"should not work on non-admin orgs"` uses `report => 'premium_voices'`, not a `status-` name. CONFIRMED (`spec/controllers/api/organizations_controller_spec.rb:1104-1110`).
- Existing home_boards specs use `Organization.create(:admin => true)`. CONFIRMED (`:1279-1302`).
- `unused_` is anchored (`/^unused_/`) and org-scopes when `!org.admin?`. CONFIRMED (`:359-365`).
- The `status-` branch org-scopes via `UserLink.links_for(org)` (plus downstream orgs). CONFIRMED (`:441-450`).
- Other unanchored matches **before** `:441`: only `/home_boards/`. CONFIRMED (the `recent_` branch at `:430` is commented out).
- `not_logged_2` matches the later unanchored `/logged_/` at `:503` because `'not_logged_2'.match(/logged_/)` is truthy. Isolation still org-scopes; the report content may be wrong. Out of scope for this PR. CONFIRMED (`:503` vs `:535`).

## Diagnosis

A non-admin org manager can pass the allowlist with `report=status-home_boards` (a `status-` prefix), then the unanchored `/home_boards/` match runs the system-wide home-board census instead of the org-scoped status report. Board keys include the owner's username. GitHub #1182.

## Candidate fixes

### A. Anchor the dispatch match (chosen)

Replace `match(/home_boards/)` with exact names `home_boards` and `recent_home_boards`. Prefixed names fall through to the `status-` (etc.) branch, which is already org-scoped.

- Trade-off: `status-home_boards` becomes a status lookup for state `home_boards` (typically empty users, HTTP 200), not `Not authorized`. Issue #1182 suggested unauthorized; that assertion is wrong for this fix because the name is a valid allowlisted status report.
- Simplest alternative considered: a one-name special case for `status-home_boards`. Rejected; `access-home_boards` and the other prefixes would still leak.

### B. Org-scope the home_boards branch

Keep the unanchored match; filter connections to `org.approved_users` when `!org.admin?`.

- Rejected: prefixed names still run the wrong report (home-board census instead of status/access/device/vocab/grid). A non-admin would gain an undocumented org-scoped census via `status-home_boards`.

### C. `allowed?(org, 'impossible')` inside the home_boards branch

Non-admin prefixed names would 400. Matches the issue's suggested assertion.

- Rejected: admin `status-home_boards` would still run the system-wide census (wrong report). Prefixed names would never reach the status branch.

## Risks and unresolved

- Inner `match(/recent/)` stays; only the two exact names reach that branch, so `recent_home_boards` still uses the 3-month filter.
- Unresolved: whether a real org uses a user-status id of `home_boards`. No such id in `LingoLinq.user_statuses` usage found in the reports controller; treating it as a status lookup returning `[]` is safe.
- `not_logged_` vs `/logged_/` mixup is documented, not fixed here.

## Test

Controller spec: non-admin manager, two `UserBoardConnection` home rows on one foreign board (count > 1 so `:429` keeps the key), request `status-home_boards`, `status-recent_home_boards`, `access-home_boards`, `device-home_boards`, `vocab-home_boards`, and `grid-home_boards`. Expect HTTP 200, `json['stats'] == nil`, `json` has `'user'`, body does not include the board key. Adversarial review of this proposal required the last three prefixes so a three-name special-case cannot go green.

Mutation that must make it fail: restore `elsif params['report'].match(/home_boards/)`. Weakest passing state: a single home connection (count 1 is dropped, so an assertion only on the key's absence would pass with the bug still present).
