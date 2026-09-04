# Supervisor pick-for-home — corrected status and PR material

**Branch:** `traci/styling/styling-updates`
**Purpose:** the accurate record for this work. It **supersedes the earlier
"Supervisee board-picker pick stall" checklist**, whose Evidence section is wrong
in two ways (below). Write the PR body from this file, not from that one.

Per-task working logs live under `docs/task-management/YYYY-MM-DD-*.md`, which
`.gitignore:149` excludes — so they are local-only and cannot be relied on for
hand-off. That is why this summary is deliberately named without a date prefix.

---

## 1. Corrections to the earlier checklist

**Claim: "Backend (`users_controller#update`): supervise-only home board allowed
only when payload is exactly `{ preferences: { home_board: … } }`
(`supervise_home_board_only_update?`)."**
Presented as pre-existing upstream behaviour. It was not. That method never
existed upstream — it was **added by `ed3420526` on this same branch** and
renamed by `023abd765`. The branch was citing itself.

**Claim: "`copy_board_links` already allows `supervise`
(`users_controller.rb:687`)", offered as precedent.**
Also introduced by `ed3420526` on this branch (`git log -L 687,688` confirms).
Circular.

**Claim: the root cause is a 400 from the payload-shape check.**
Partly right about the symptom, wrong about the flow being otherwise sound. When
the flow was actually executed in a browser for the first time it was broken in
**three independent places**, two of them client-side and upstream of any HTTP
request at all. See §2.

**Claim (in `023abd765`): the pick stall was fixed.**
It was not. The backend guard it shipped could never match a real request, so
every supervise-only pick still 400'd. Fixed in `3ad5f0cfb`.

---

## 2. What was actually wrong

| # | Defect | Layer | Fixed in |
|---|--------|-------|----------|
| 1 | `Utils.uniq(list)` threw on any one-arg call (`compare.toString()` dereferenced before the type check), killing `User#org_board_keys`, which `edit_manager#copy_board` reads before copying. Every pick died here with a generic toast and **zero** API calls. | Ember | `3ad5f0cfb` |
| 2 | `raw_events#modalDialogClickRelease` synthesized a click for `.modal-content` buttons; modern `{{on "click"}}` handlers also got the native click, so the CTA fired **twice** — two copies, second `POST /boards` 400 "board key already in use", error shown to the user *after* a copy had been created. | Ember | `3ad5f0cfb` |
| 3 | `supervise_home_board_update?` required the payload to contain **only** `preferences`. Ember's `user.save()` serializes the whole record (~25 keys), so the guard never matched and every supervise-only pick fell through to `allowed?(user,'edit')` → **400**. | Rails | `3ad5f0cfb` |
| 4 | `allowed?(a) \|\| allowed?(b)` in `boards#create` and `users#copy_board_links`. `allowed?` renders a 400 as a side effect, so the chain double-rendered: a clean 400 became a 500, and the newly-allowed path persisted a board then died rendering. | Rails | `9e1458e58` |
| 5 | Same double-render shape in `logs#show` and `logs#eval_pdf` (pre-existing; `logs#index` already carried the fix with a comment). | Rails | `c3a4121dd` |
| 6 | Bare `allows?` omits the scopes argument, falling back to RAW `permission_scopes` instead of the normalized `api_permission_scopes` — stricter than `allowed?`, denying integration and dev-key devices. | Rails | `c3a4121dd` |

Also: `preferences.home_board` could be persisted as `{}` (because `!!{}` is
truthy in Ruby), leaving the communicatee worse off than the `nil` they started
with. Now requires a Hash with an `id`.

---

## 3. Entry-point enumeration (CLAUDE.md P2)

Setting a communicatee's home board, and the board copy that precedes it.

| Entry point | Enforced at | Test |
|---|---|---|
| Fresh navigation to `/board-picker?user_id=…` | Rails `users#update` (client route is UX only) | QA script `direct-user-id-url`, `direct-picker-rendered` |
| Ember SPA transition (user/boards link, caseload "Choose Board") | same | QA script `boards-page-link`, `caseload-choose-board` |
| Direct `PUT /api/v1/users/:id` with a full record payload | `users_controller.rb` supervise branch → slice to `home_board` → `User#process_home_board` requires `board.allows?(self,'view')` or `allows?(updater,'share')` | `users_controller_spec` "set home board from a full user payload" |
| Direct `PUT` attempting other fields alongside `home_board` | discarded by `supervise_home_board_update_slice` | `users_controller_spec` "should not let a supervise-only supervisor change anything but the home board" |
| Direct `PUT` with empty `home_board: {}` | rejected (requires an `id`) | `users_controller_spec` "should not accept an empty home_board hash" |
| `POST /api/v1/boards` with `for_user_id` **and** `parent_board_id` (a copy) | `boards_controller.rb` — supervise permitted for copies only | `boards_controller_spec` "supervise-only supervisor to copy a board for a supervisee" |
| `POST /api/v1/boards` with `for_user_id`, **no** `parent_board_id` (authoring new) | still edit-only — unchanged boundary | `boards_controller_spec` "should not allow creating a board for a supervisee if you don't have edit privileges" (pre-existing, still passing) |
| `POST /api/v1/users/:id/copy_board_links` | supervise or edit, plus `new_board.user == user` | covered by existing `copy_board_links` specs |

**Not covered:** offline/cached clients were not separately exercised — the home
board is set server-side and syncs, but no offline test was run.

---

## 4. Fix status (CLAUDE.md P5)

| Item | Status | Evidence |
|---|---|---|
| Supervise-only pick sets the home board | Fixed | QA 27/27; `PUT /users/1_14 → 200` |
| Double board copy on one click | Fixed | `raw_events.js` guard; one `POST /boards` per pick |
| `Utils.uniq` one-arg crash | Fixed | `app/frontend/app/utils/misc.js` |
| `allowed?` double-render | Fixed (boards, users, logs) | 669 controller examples, 0 failures |
| `allows?` scope argument | Partial: this branch's 3 call sites only | 23 bare calls remain repo-wide |
| Sticky `board_picker_pick_in_progress` | Hardening only — no leak reproduced | `routes/board-picker.js` deactivate |

### Not covered by this PR
- 23 bare `allows?(@api_user, '…')` calls elsewhere in `app/controllers` (same
  latent class; needs its own change with its own specs).
- `logs_controller` fix has no coverage for `eval_pdf` specifically (the
  regression spec exercises `show`; both now share `log_viewable?`).
- `copy_board_links` "protected vocabulary owner" spec is an intermittent
  pre-existing flake (~1 in 4), unrelated to these changes.
- A `400: Not authorized (GET /api/v1/boards?user_id=1_7)` fires during picker
  load. Unrelated to the pick; not investigated.
- The 3 ApplicationController frontend test failures still have no baseline
  proving they pre-date this branch.

---

## 5. How to re-run the verification

```bash
# stack: Rails :5000, Ember :8184, AND a Resque worker (copy_board_links is
# Progress.schedule'd — with no worker the callback never fires)
cd app/frontend
npx playwright install chromium        # once per machine
node scripts/p1-board-picker-qa.mjs --user marcus_williams_slp --pass '…' \
  --full-pick --supervisee hannah_lee
# expect: 27 passed, 0 failed

bundle exec rspec spec/controllers/api/{boards,users,logs}_controller_spec.rb
# expect: 669 examples, 0 failures
```
