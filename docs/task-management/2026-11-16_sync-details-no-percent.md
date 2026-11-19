# Sync Details: no percentage, the drawer's wording, and the cards after a failed first sync (2026-11-16)

Traci's decisions (2026-11-16, memory "Offline/sync UI decisions"; a fix, no feature flag):
- Sync Details never shows a percentage. While syncing: the drawer's moving bar and "Saved so far: N boards". After a
  sync: the drawer's wording, "All your boards are ready offline" / "N of M boards are ready offline". The two screens
  always agree.
- After a failed first sync, Sync Details shows the grouped cards (same styling, not the old technical list) under
  "Saved before the sync stopped", with no percentage and no Ready labels.

These are items 3 and 4 of `docs/task-management/2026-11-16_sync-status-first-sync.md` (PR #1327), held there for
Traci; her decisions replace the proposed "percentage capped at 99" (rejected: it mixes units and moves backward).

Learnings consulted: LEARNINGS.md and learnings-archive/2026-11.md for "sync details", "drawer", "percent" (the
#1327 review notes above; none other).

## Fact sheet

### (a) Where the values are read
- CONFIRMED: the percentage is read in one place, `components/sync-details.hbs:15` (`{{this.summary_pct}}% ready
  offline`), with its bar at :16 (`summary_bar_style`, `components/sync-details.js:64-65`). `summary_pct` has one
  other reader: `tests/unit/components/sync-details-grouped-test.js:43`.
- CONFIRMED: Sync Details' summary is `summary_for(persistence)` (`sync-details.js:52-54`); the drawer's is
  `summary_for(persistence, {latest_only: true})` (`components/sync-progress-drawer.js:67`).
- CONFIRMED: the drawer's wording is `result_title` (`sync-progress-drawer.js:96-104`): 'ready' → "All your boards are
  ready offline"; 'attention' → "%{ready} of %{total} boards are ready offline" over `summary.groups`.
- CONFIRMED: while syncing, Sync Details' lead already says "Syncing..." + `sync_progress_line` ("Saved so far: N
  boards.", `utils/sync_progress.js`), `sync-details.hbs:35-37`; the drawer shows a moving bar
  (`sync-progress-drawer.hbs:12-13`, `.ll-sync-drawer__bar`, reduced-motion handled in app.scss).
- CONFIRMED: the cards render only `{{#if this.summary}}` (`sync-details.hbs:80`); pills from `card.status`
  ("Ready offline", `sync-details.js:115`), the head's folder bar and "N of M folders saved" (:117-118), and the tabs
  "Needs attention / Ready offline / All boards" (:80-95).

### (b) Every shape the summary can hold (writers)
1. Syncing: `rollup(sync_progress rows so far + errors)` (`utils/sync_rollup.js:134-136`). Partial by nature.
2. A finished sync (clean or with problems), newest: `last_result` (`utils/sync_log_store.js:122-131`), `from_earlier`
   false.
3. A finished sync older than a later failed/canceled one: same, `from_earlier` true.
4. No finished sync at all (only errored/canceled entries, e.g. a new account's failed first sync): `null` today, so
   no cards; the old technical list is all there is. NEW SHAPE: the newest errored/canceled entry with rows, marked
   `partial` and `stopped: 'failed' | 'canceled'`.
5. No entries with rows: `null`.
- CONFIRMED: a failed sync's rows stop at the failing step and carry no failures (`services/persistence.js` failure
  branch), so in shape 4 every reached board reads "saved" and the totals are only what was reached:
  "N of M" and "Ready" would overclaim (`tests/unit/utils/sync-log-store-test.js:134-143`).
- The drawer passes `latest_only`, so shapes 3 and 4 never reach it (it stays as it is).

### (c) Cross-file claims
- CONFIRMED: no `.eslint-todo` or `.lint-todo` rows for sync-details, the drawer or sync_rollup (grep, 2026-11-16).
- CONFIRMED: `.la-sync-card--ready` has no CSS rule; `--attention` has (app.scss ~33529-33603). The card head is a
  5-column grid (40px / 1fr / 220px / 160px / 20px), stacked to 3 columns below 820px.

## Proposal

1. `utils/sync_log_store.js`: `partial_result(log)` → the newest errored or canceled entry with rows, used ONLY when
   `last_result` is null. `last_result` and its tests are unchanged.
2. `utils/sync_rollup.js` `summary_for`: when `last_result` is null and not `latest_only`, the partial entry's rollup
   with `partial: true`, `stopped`, `finished`.
3. One wording for both screens: `ready_title(summary)` (in `utils/sync_progress.js`, which already holds i18n sync
   lines): missing 0 → "All your boards are ready offline", else "N of M boards are ready offline". The drawer's
   `result_title` uses it for 'ready' and 'attention' (same strings, same keys); Sync Details uses it for shapes 2-3.
4. Sync Details summary band:
   - syncing: the drawer's moving bar (reuse `.ll-sync-drawer__bar`), then the existing lead ("Syncing... Saved so
     far: N boards."). No percentage, no "X of Y saved" line (the total grows while it runs).
   - shapes 2-3: `ready_title` in place of "N% ready offline" (same element), no bar; the "X of Y boards and folders
     are saved on this device." line stays (counts, not a percentage).
   - shape 4: no title, no bar; the lead says why it stopped (existing "Sync Failed..." / "The last sync didn't
     finish..."); the line says "N boards and folders are saved on this device." (the drawer's existing keys).
5. Shape 4 body: heading "Saved before the sync stopped", no tabs, every card; each card with no pill, no folder bar,
   head line "Home board · N folders saved", the saved folder list as now, no "N of M", and for a board with no saved
   folders "No folders were saved before the sync stopped." (not "has no folders inside", which may be false). A
   `--saved` card modifier (no colour) with the 3-column head, on the same pattern as `--attention`.
6. `summary_pct` and `summary_bar_style` removed (no reader left); the grouped test's `summary_pct` assertion is
   replaced by one on the title (the specification changed: Traci, 2026-11-16).

Alternatives:
- B: show shape 4 with the normal cards and a "partial" banner. Rejected: the cards' "Ready offline" pills and "N of M"
  would still overclaim, which the decision rules out.
- C: keep a bar after a sync, filled to saved/total. Rejected: a filled bar is a percentage in another form.
- Simplest: only hide the percentage. Rejected: leaves the failed-first-sync screen empty (the reported problem).

## Risks and open questions

- While a sync runs, the cards (with "Ready offline" pills and tabs) still show the rows so far. A board can read
  "Ready offline" before all its folders are found. Not covered by the decisions; left as is and asked of Traci.
- A canceled first sync gets shape 4 only when its entry has rows. The usual Cancel path logs `statuses: []` (`services/persistence.js` end_canceled_sync), so it shows no cards; a cancel that ends through the failure branch keeps its rows (corrected after the final review).
- Shape 4 after an app restart: the log is restored (`restore_sync_log`), so the same view shows; the lead is
  `restored_lead`'s "The last sync didn't finish...".
- New strings need translations (i18n generator) for 13 locales.

## Tests (red first) and mutations

- sync-log-store: `partial_result` picks the newest errored/canceled entry with rows; null when none; ignored when a
  finished entry exists (summary uses last_result). Mutation: drop the errored check → red.
- sync-rollup: `summary_for` with only an errored entry → partial summary with its rows; with `latest_only` → null;
  with a finished earlier entry → that one, not partial. Mutation: drop the fallback → red.
- sync-progress (or rollup) `ready_title`: missing 0 → all ready; 1 of 2 → "1 of 2 boards are ready offline".
- sync-details grouped: syncing → no title, `is_syncing` bar flag; finished → title from `ready_title`, no
  `summary_pct`; partial → heading flag, no tabs, cards with no status/pill, "N folders saved", no "of", the
  no-folders text. Mutations: pill back on partial → red; title from pct → red.
- drawer: existing tests keep passing (wording unchanged).

## Review (adversary, 2026-11-16): rethink shape 4; proceed with the percentage removal and the shared wording

Each finding checked in the code before acting (cites at d6b3cc859):
- High, CONFIRMED: the failure branch's log entry has no `roots` and merges no errors (`services/persistence.js`
  :2463-2472; only the success branch writes `roots: board_roots`, :2428, and merges `sync_progress.errors`,
  :2382-2396). Shape 4 would show one ungrouped card per board, each "Board" with no folders.
- High, CONFIRMED: rows are written when a board is looked up, before its reload, so a board whose reload failed
  later is still a "saved" row unless its error is merged.
- High, CONFIRMED: a storage failure ends through the SUCCESS branch (`end_sync_if_storage_failed`, :2398) and its
  entry carries only `issues: errors.length > 0`, so `last_result` treats it as finished and every row reads saved,
  while the drawer reports 'failed'. "All your boards are ready offline" would be shown exactly there.
- Medium, CONFIRMED: shape 3 (cards from an earlier finished sync after a failed one) would put a ready headline above
  "Sync Failed". Asked of Traci (below).
- Medium, PLAUSIBLE, accepted: after SYNC_LOG_KEEP (5) stops in a row the finished entry is gone and shape 4 can come
  from an older stopped sync than the status line describes: mark it `from_earlier` when it is not the newest entry.
- Medium, CONFIRMED: intro text counts only reached folders; the tabpanel's `aria-labelledby` would name a tab that
  is not rendered; cards filter by `current_tab`, so a tab picked during a sync could empty shape 4.
- Medium, CONFIRMED: test plan gaps (render test for pills/tabs/%; fixtures must match the real writer, which now
  writes roots; a direct `partial_result` test; storage-failed, eviction and drawer errored-only tests).
- Low, CONFIRMED: a `--saved` grid modifier is the override pattern Rule 0.7 forbids. Edit the original chevron rule.
- Not taken: "dual review" for the persistence.js change. Sync is in Rule 0.12's fix-proposal scope, but not on the
  dual-review list (auth, consent, other people's data, billing, AI, infra, data-bearing gate).

## Traci's decisions (2026-11-16, after the review)

- Shape 3: no ready headline; only the status line and "These results are from an earlier sync, ...".
- While a sync runs: no Ready labels and no Needs attention / Ready tabs; labels return when it ends.
- One PR for all of it.

## Revised proposal

Writers (`services/persistence.js`, line-neutral, all above the ESLint baseline's last row):
- R1. Failure branch log entry: `statuses: with_errors(statuses, errors)` (the merge the success branch does, via
  `utils/sync_rollup.js with_errors`; `final_rows` lets a later success win over an earlier error only when nothing
  failed after it) and `roots: board_roots` read from `sync_progress` before it is cleared.
- R2. Success branch: when `storage_failed`, the entry is `errored: true, storage_failed: true` (it did not save
  boards; the drawer already says 'failed'). `entry_copy` keeps `storage_failed` so a restored log still knows.

Readers:
- R3. `utils/sync_log_store.js partial_result(log)`: the newest errored or canceled entry with rows that is not a
  storage failure; `from_earlier` when it is not the newest entry. Used only when `last_result` is null.
- R4. `utils/sync_rollup.js summary_for`: syncing → rollup with `unfinished: true`; last_result → as now; else (not
  `latest_only`) partial_result → rollup with `unfinished: true, stopped: true, from_earlier`.
- R5. `utils/sync_progress.js ready_title(summary)` → "All your boards are ready offline" / "%{ready} of %{total}
  boards are ready offline" (groups), the drawer's existing keys; the drawer's `result_title` uses it.

Sync Details:
- Summary band: syncing → the moving bar (`.ll-sync-drawer__bar`) above the existing lead; finished and newest →
  `ready_title`; finished but `from_earlier` → no headline (Traci); unfinished → no headline. The "X of Y boards and
  folders are saved" line only for a finished summary; for a stopped one "N boards and folders are saved on this
  device." (the drawer's keys); none while syncing.
- Body, unfinished: no tabs, every card, no pill, no folder bar; the progress column holds "N folders saved"; the role
  line is the role alone (no "N folders inside"); the folder intro says neither a total nor "Each one is saved
  separately" over a partial list; a card with no saved folders says "No folders were saved before the sync stopped."
  (stopped) or nothing extra (syncing). Missing folders (merged failures) still list under "Not saved yet". Stopped →
  heading "Saved before the sync stopped" above the cards; tabpanel attributes only when tabs render.
- Card tone: `ready` / `attention` / `saved` (no colour rule: the base card).
- CSS: the chevron's own rule pins it to the head's last column on row 1, so a head without a pill keeps it at the
  right; check both widths in the browser (this also moves it to row 1 on today's narrow cards).
- `summary_pct` and `summary_bar_style` removed; the grouped test's `summary_pct` line becomes a `ready_title` check.

Tests (red first): failure-branch entry has roots and merged errors (persistence-sync); storage-failed entry is
errored + storage_failed and survives entry_copy; partial_result direct on [errored, finished] and [finished,
errored], storage-failed skipped, from_earlier; summary_for shapes incl. latest_only; ready_title; Sync Details
computed (syncing, finished newest, from_earlier, stopped); a render test of the modal for each shape (no "%", no
pill/tabs when unfinished, heading when stopped); drawer with an errored-only log → 'result' stage (unchanged).

## Implementation and verification (2026-11-17)

- Red first: 12 new or changed tests failed for the expected reasons (missing helpers; the failed sync's entry had no
  `roots` and no merged error; the storage-failed entry was not errored); the drawer's errored-only test was green
  before and after (it pins unchanged behaviour).
- Green: 209 of 210 on `--filter "/sync log store|sync rollup|sync-details grouped|sync-progress-drawer|failed sync's log entry|could not be saved as failed|storage|sync progress line|cancelled sync|sync-details/i"`
  (the 1 skip is the existing filesystem fix_url test the "storage" filter matches).
- Mutations, two runs, each mutant turning its own tests red:
  - A: failure entry without roots; storage entry without `errored`; `partial_result` without the errored/canceled
    check; `summary_for` without the `latest_only` gate; headline ignoring `from_earlier`.
  - B: `partial_result` without the storage skip; tabs filtering while unfinished; a Ready label on unfinished cards;
    failure entry without merged errors; `missing_count` for an unfinished summary.
- No ModalDialog render test: rendering it costs 8-27 s per test and broke QUnit's ceiling
  (`tests/integration/modal-close-button-test.js` header). Checked in a browser instead: production build served
  locally, Playwright at 1280 px and Pixel 7, the modal opened in each state (finished with a missing folder,
  finished all ready, earlier result, stopped first sync, running sync). In every state: no "%"; the headline only for
  the newest finished sync ("1 of 2 boards are ready offline" / "All your boards are ready offline"); no tabs, pills
  or `tabpanel` role when unfinished; "Saved before the sync stopped" only when stopped; the moving bar only while
  syncing; the chevron 20 px from the right edge of the card head on its first row at both widths; no horizontal
  overflow. The stopped heading first sat flush on the first card; moved inside the card list (12 px gap) and
  re-checked.
- Lint: `npm run lint:js:ci` only the known worktree false positive (`sync-details.js`, `toggle_technical`, now line
  270); `ember-template-lint` clean on sync-details.hbs.
- i18n: `i18n_generator.rb --generate` and `--merge`: 6 new keys, `sync_ready_offline_lower` dropped; the 12 other
  locales carry `***` English placeholders (shown in English, `utils/i18n.js:448`). Machine translation not run:
  1Password was signed out in this session (`extras:translate_ui_locales` needs GOOGLE_TRANSLATE_TOKEN).

## Final review (adversary, 2026-11-17, at 5ec336455): ship with changes, no Critical or High

All 8 earlier findings and every revised-proposal line confirmed implemented; persistence.js edits line-neutral; the
other readers of `errored` (technical list, restored_lead_kind, entry_copy/merge_logs, drawer) behave as intended.
Each finding checked:
- Medium (CONFIRMED by reading, not executed): the headline can describe another person's sync when a root sync for
  someone else (`controllers/user/index.js` `sync`, `persistence.sync(model.id, 'all_reload')`) logs a finished
  entry after the person's own failed sync. Checked: no template calls that `sync` action (grep of
  app/templates/user and the components), so no control reaches it today; the earlier review found the same. Not
  changed; the log entry's `user_id` would be the gate if that action is ever wired to a control. Pre-existing source
  ("87% ready" today).
- Low: the earlier-sync band still shows "X of Y boards and folders are saved" and "Save the N now". Traci's answer
  was about the ready headline only; kept as counts of that earlier sync under "These results are from an earlier
  sync". Noted in the PR for her.
- Low: "No folders are saved yet." for a running sync's card without folders was not in the proposal; kept (true, and
  the finished text "has no folders inside" may be false mid-sync). Recorded here.
- Low: no render test for the template guards. Not added: the stub approach (a pass-through modal-dialog) was not
  tried here; the guards were checked in the browser in every state. Follow-up.
- Low (PLAUSIBLE): errors recorded in the last ~75 ms before a stop may be missing from the stopped entry
  (`sync_progress.errors` is refreshed by update_sync_progress on each nextBoard). Not changed: calling it in the
  failure branch was not tested; a board missed this way reads saved under "Saved before the sync stopped".
  Follow-up.
- Low, fixed: the R1 test now restores `last_sync_status`, `sync_status_error` and `last_sync_at`; the "cancelled sync
  that resolves" comment is back above its own describe; this log's canceled-first-sync line corrected above; the
  card fields shared by finished and unfinished cards are written once (`finished_card` / `unfinished_card` + the
  shared lists). `overall.pct` kept: `tests/unit/utils/sync-rollup-test.js:49` still asserts it.

## A real failed first sync on four browsers (2026-11-17)

Set-up: a synthetic user `sync_e2e_failfirst` (home board with 3 folders and a second-level folder, Crisis Vocabulary in
the sidebar) with one contact whose picture is on a remote host (example.com address; private local e2e database). On
develop that contact makes the contacts step throw after the boards are saved (`sync_contacts` calls
`this.store_url_quick_check` with `this` undefined; fixed by #1327), so its first sync is a real failed first sync.
Branch build served locally, the e2e harness's link and picture routing, a fresh device each time, Sync Now, then
Sync Details. Opened through the dashboard's path (`modal.open('sync-details')`): Modern lands on the home board in
Speak Mode, where the drawer stays hidden by design.

| Browser | Sync | Log entry | Sync Details |
|---|---|---|---|
| Chromium, Pixel 7 profile | failed: "unspecified sync error" | errored, 6 rows, roots kept | "Sync Failed, see details below"; "6 boards and folders are saved on this device."; "Saved before the sync stopped"; 2 cards (home "4 folders saved", Crisis Vocabulary "Saved"); no %, tabs or pills |
| WebKit, iPhone 15 profile | same | same | same |
| Firefox, desktop | same | same | same |
| Chrome 124 on the Android emulator (ll_trace, tablet) | same | same | same |

Emulator note: Playwright's Android `launchBrowser` stalled on this AVD (new tabs stayed about:blank; the earlier
unexplained TTS-probe stall looks the same). Chrome was driven over its DevTools socket instead (`adb forward
tcp:9333 localabstract:chrome_devtools_remote`, a tab opened by intent, `connectOverCDP`), with DOM `click()` for
buttons (pointer input over that connection timed out).

Found on the way, not changed: `sync_logs` calls `this.store` inside plain callbacks (`services/persistence.js`
sync_logs), which would throw; it is unreachable today, since only that function writes the `bigLogs` row it reads.
Follow-up.

## Part 2 (2026-11-17): the Cancel path logs what it saved and what failed (for #1328)

Why: PR #1328 ("Boards on This Device", docs/task-management/2026-11-16_offline-boards-page.md in that branch) hides
another owner's liked board when this person's newest clean sync saw it without an error AND no later sync of theirs
shows an error for it (`utils/offline_board_list.js` `seen_by_last_sync`, reads `entry.statuses[].error`). This branch
already gives the failure branch's entry the errors it recorded. The Cancel path still logs `statuses: []`, so a board
refused during a sync the person cancelled stays listed. Traci (2026-11-17): close it on this branch, full process.
develop merged first (e55026ccb: #1326, #1327; one import-line conflict, both sides kept).

### Fact sheet
- (a) READ: Sync Details `partial_result` / `summary_for` (`utils/sync_log_store.js`, `utils/sync_rollup.js`) and the
  technical list read a canceled entry's `statuses`/`roots`; #1328 reads `statuses[].error` of every entry for the
  person. CONFIRMED (this branch's files; #1328's at its head 09fd218be).
- (b) Writers of a stopped entry (`services/persistence.js`, this branch):
  - Cancel that resolves: `end_canceled_sync` (:5113-5124): `sync_progress` cleared first, then `statuses: []`, no
    roots. Called from the success branch (:2376) while `sync_progress` is still set. CONFIRMED.
  - Cancel or failure that rejects: the failure branch (:2440-2470): `with_errors(statuses, sync_progress.errors)`,
    `roots`, `canceled` or `errored`. CONFIRMED.
  - `sync_progress.errors` is a COPY refreshed only by `update_sync_progress` at the top of each walk step (:3089 via
    :1972-1988); the live arrays are `sync_progress.progress_for[<user id>].board_errors` (:3070, :3087), pushed at
    :3359, :3378, :3380. On a cancel the walk returns before refreshing (:3078-3081), so the copy can miss the last
    board's error. CONFIRMED by reading (the earlier review's "~75 ms" Low).
  - `entry_copy` keeps `statuses[].error` (`utils/sync_log_store.js:44-50`), so an error row survives a restart.
    CONFIRMED.
- (c) Cross-file: services/persistence.js's last baselined row is 4465, so :5113 may take new lines and the failure
  branch must stay line-neutral. CONFIRMED (`.eslint-todo`).

### Proposal (A)
1. `utils/sync_rollup.js` `stopped_errors(progress)`: the concatenated live `board_errors` of every
   `progress.progress_for` entry (empty for none). Pure.
2. `end_canceled_sync`: BEFORE clearing `sync_progress`, read `board_statuses` (uniq by id, as the failure branch),
   `stopped_errors(...)` and `board_roots`; log `statuses: with_errors(statuses, errors), roots`.
3. The failure branch reads `stopped_errors(sync_progress)` instead of the `sync_progress.errors` copy (same line).
Effect on Sync Details: a cancelled sync now has rows, so with no finished sync it shows the stopped cards
(`stopped: 'canceled'`, already designed and tested on this branch); with a finished sync it is "from earlier" as
before (`last_result` skips canceled entries).
Candidates: (b) call `update_sync_progress()` before reading: rejected, it writes `sync_progress` fields and notifies
the drawer on a sync that is ending; (c) leave the Cancel entry empty: rejected (the #1328 gap).
Tests (red first): a cancel that resolves logs the visited board, an error recorded after the last refresh, and the
roots (mutants: `statuses: []`; reading the `sync_progress.errors` copy); the failure branch picks up an error recorded
after the last refresh (mutant: the copy); `stopped_errors` unit test.

### Item B (liked boards the server reports as revoked): recommend NOT doing it
`utils/board_revocation.js` `settled_decision` writes revocation marks only after a full, error-free, uncancelled sync of
every synced person ("short of a full, error-free sync ... no decision"), because a partial answer must never take a
board away from an AAC user (a supervisee's response covers only their own tree). Recording "revoked" from a stopped
sync, or hiding a board in #1328's list on that partial verdict, reverses that safeguard. The case left: with
"sync liked boards" on, a board unshared since the last clean sync, followed only by stopped syncs, stays listed on a
TRUSTED device (shared devices already hide other owners' private boards), where its device copy already opens today.
The next clean sync marks it. For Traci to confirm.

### Review of Part 2's proposal (adversary, 2026-11-17): proceed with changes; Traci: the High + the Cancel path

Checked: `board_lookup` records `'re-downloaded'` BEFORE the reload (`services/persistence.js:2780`); a passing failure
with no device copy is parked with no error (:3363), and a stop drops it; `final_rows` counts the row as saved
(`utils/sync_rollup.js:17`, `:52`). The batch step records `'downloaded'` before its store (:2971; the store's success
calls `note_device_boards`). CONFIRMED. So a stopped entry (failure branch, already on this branch, and Cancel) can show
boards as "saved on this device" that are not: High. Traci (2026-11-17): fix the High and the Cancel path; tag lookup
failures so #1328 hides a liked board only on those (that #1328 push needs Scot's OK for a third review round); the
non-error status for pictures dropped by a cancel is deferred.
Corrections to Part 2's text: the "Why" line is inverted (#1328 LISTS the board when the newest clean sync saw it
without an error and no later entry shows one, and hides it otherwise); `stopped` is a boolean (`utils/sync_rollup.js`),
not 'canceled'; no test computes a cancelled stopped summary yet. Item B's reason: `settled_decision` guards writing
device-wide marks; it says nothing about filtering one person's list, and the remaining case also covers "sync liked
boards" off with a stop before the walk reaches the board, and a sync that finished WITH problems (no marks, though #1328
then hides the board because the sync skipped it). The recommendation stands for Traci.

Revised units (one commit each, red first):
- H. `utils/sync_rollup.js` `note_board_done(sync_progress, id, key)` and `confirmed_statuses(statuses, sync_progress)`:
  at a stop, a `'downloaded'`/`'re-downloaded'` row counts as saved only when `board_lookup` finished it
  (`note_board_done`, called on the same lines as :2782's reload success and :2785) or the device database confirmed it
  (`sync_progress.device_boards`, `note_device_boards`); otherwise its status becomes `'not_saved'` (not an error, so
  #1328 does not hide on it; Sync Details counts it as not saved, `rollup` `ok = saved && !error`). Used by the failure
  branch (same line) and the Cancel path.
- A. `live_board_errors(sync_progress)` (not `stopped_errors`: that name is the failure branch's local): every
  `progress_for[*].board_errors` entry plus any `sync_progress.errors` entry not already among them (so R1's planted
  copy still counts, once; no fixture change). `end_canceled_sync` logs, before clearing `sync_progress`,
  `with_errors(confirmed_statuses(uniq(board_statuses)), live_board_errors(...))` and `roots`. The failure branch reads
  `live_board_errors` (same line).
- T. Content errors ("failed to sync completely", :3359) carry `content: true`, kept by `with_errors`, the success
  branch's merge (:2383-2394, line-neutral) and `entry_copy`; #1328's `seen_by_last_sync` ignores `content` rows
  (older untagged entries still hide: the safe side).
Tests: sync_rollup units (note/confirm/live errors, dedupe); `board_lookup` harness: a memory-only board whose reload
times out is not done, a reload that succeeds is (mutant: no note); `end_canceled_sync` with planted progress (a
supervisee's array alone holds an error; the copy is stale; one unconfirmed row; a specific roots key; mutants:
`statuses: []`, copy only, root's array only, roots dropped, no confirm); the failure branch with an unconfirmed row and
a live-only error (mutants: copy only, no confirm); grouped-test: a cancelled entry with rows (heading, summary line,
restored lead).

### Part 2 status when this session stopped (2026-11-17, Rule 0.13: three self-inflicted errors close together)

UNCOMMITTED in this worktree (not verified; do not push as is):
- `utils/sync_rollup.js`: `note_board_done`, `confirmed_statuses`, `live_board_errors` (H and A).
- `services/persistence.js`: `note_board_done` on the reload-success and fresh-download lines (:2782, :2785, same
  lines); the failure branch reads `confirmed_statuses` and `live_board_errors` (:2439-2440, same lines);
  `end_canceled_sync` logs confirmed rows, live errors and roots (+7 lines at :5115, below the baseline's last row 4465;
  every hunk above it is one-for-one, checked with `git diff -U0`); the import line.
- Tests: `tests/unit/utils/sync-rollup-test.js` (3), `tests/utils/persistence-sync-test.js` (2 in the #1212 harness,
  a new describe "a stopped sync's log entry" with 2), `tests/unit/components/sync-details-grouped-test.js` (1, a pin:
  passes before and after).
Last run (filter /sync|persistence|offline board list|board retry|revocation/i): 595 tests, 584 pass, 9 skipped
(pre-existing), 2 fail, both in the new describe:
1. the Cancel test called `persistence.end_canceled_sync` on the utils/persistence import (no such method there). Patched
   to call `persistenceTarget() || persistence` (the service); NOT re-run.
2. the failure-branch test failed the leak check: "LingoLinq.Board.refresh_data_urls was replaced and not restored".
   Not diagnosed. R1, which it copies, passes the same check; it may be fallout from (1) dying first. Run the describe
   alone after (1) is re-run.
Red runs before the code: all 7 new non-pin tests failed for the right reasons (missing helpers; empty Cancel rows).
Still to do: re-run; diagnose (2) if it remains; mutants (no note on :2782; no confirm in either stop path; copy-only
errors; root's array only; roots dropped; `statuses: []`); unit T (the `content` tag, here and in #1328, whose push needs
Scot's OK for a third review round); lint gate; final review; Traci's answer on item B; then a PR.

### Part 2, session 2 (2026-11-18): units H and A verified

- The new describe alone (port 7462): 2/2. Full filter `/sync|persistence|offline board list|board retry|revocation/i`:
  595 tests, 586 pass, 9 skipped (the same 9 as before), 0 fail.
  After the guarded reads, the M2 test and the comment move, the same filter: 596 tests, 587 pass, 9 skipped, 0 fail.
- The leak failure ("LingoLinq.Board.refresh_data_urls was replaced and not restored", charged to the failure-branch
  test): CONFIRMED as fallout from the Cancel test DYING. Reproduced under mutant M8: the Cancel test threw a TypeError
  (`by['me/core-parked'][0]` undefined), the beforeEach stub stayed, and the leak check charged it to the next test. The
  new tests now read rows guarded (`((by[k] || [])[0] || {}).status`), so a wrong value fails an assertion instead.
  That a dying synchronous test leaves the beforeEach stubs is a pre-existing harness trait, not changed here.
- WRONG, corrected 2026-11-19 (the final adversary review): "Saved-at-lookup is sound: the adapter's find resolves only
  after `store_eventually` resolves ... so a finished reload or fresh fetch was saved on the device. CONFIRMED." I read
  the adapter's `.then` (`services/persistence.js:4534-4538`) but not what it waits on. `store_eventually` returns
  `RSVP.resolve(obj)` as soon as the save is QUEUED (`services/persistence.js:652-663`; the adapter mixes in the utils
  copy, `adapters/application.js:2`, :48, `utils/persistence.js:646-656`), and the queue writes one entry per 200 ms. So
  `note_board_done` means "fetched and queued", not "on the device". Still narrower than before H (every looked-up row
  counted), but not the guarantee claimed. See the final review section below.
- Mutants (filter `/stopped sync's log entry|board reloads under a slow server|sync rollup/i`, 40 to 41 tests):
  M1 no note on reload success: killed (1). M2 no note on fresh download: SURVIVED at first (no test reached that line);
  added "marks a freshly downloaded board finished", then killed (1). M3 failure branch without `confirmed_statuses`:
  killed (1). M4 Cancel without it: killed (1). M5 failure branch reading only the copy: killed (1). M6
  `live_board_errors` reading only the first user: killed (3). M7 roots dropped: killed (1). M8 `statuses: []`: killed
  (1, by assertion, after the guarded reads).
- `with_errors`' comment had been left above the new helpers; moved back above `with_errors`.
- persistence.js hunks above 4465 one-for-one (2439-2440, 2782, 2785, 4987); +7 at 5115.
- H and A are one commit: one import line, the Cancel path (A) calls H's `confirmed_statuses`, and the describe's two
  tests check both. An H-only commit would be a state no run verified.

### Unit T, this branch (2026-11-18/19): content errors tagged

Facts (CONFIRMED by reading): the content error is pushed at `services/persistence.js:3359` as `{error, board_id,
board_key}`; lookup failures (:3378 deleted, :3380 retrieval) stay untagged. `with_errors` built `{id, key, error}`;
the success merge (:2383-2394) set `status.error` or pushed `{id, key, error}`; `entry_copy` kept `id, key, status,
error`. Each dropped any tag.
No test reaches :3359 (only a failed picture or sound save on the real walk does, and no harness drives one). Traci
(2026-11-18): build the error with a pure helper (`utils/sync_rollup.js` `content_error`, used on :3359, same line) and
unit-test it; accept that a mutant reverting :3359 to the literal survives (T6 below; for the PR's "Not covered").
Change: `content_error`; `with_errors` copies `content` only when set (no `content: undefined` key); the success merge
sets or clears it on an existing row and adds it to an error-only row (same lines); `entry_copy` keeps `content`.
persistence.js hunks one-for-one (2387, 2392, 3359, 4987). The utils copy (`utils/persistence.js:3377`) has its own
"failed to sync completely" line, untouched, as H and A left that copy (the app runs the service's sync).
Red: 4 new tests failed for the missing tag or helper. Green: 31/31 on `/sync rollup|sync log store|content failures
tagged/i`; full sync filter 600 tests, 591 pass, 9 skipped, 0 fail. Mutants: T1 helper without the tag: killed (1); T2 `with_errors` dropping it: killed (1); T3 tagging every
error: killed (2); T4 `entry_copy` dropping it: killed (1); T5 merge onto an existing row: killed (1); T6 :3359 not
using the helper: SURVIVED (the accepted gap); T7 merge on an error-only row: killed (1).

### Item B decided (Traci, 2026-11-19): not done
A stopped sync does not record "revoked". The recommendation above stands. Record the remaining case (on a trusted device, a
liked board unshared since the last clean sync stays listed until a clean sync) in the PR's "Not covered".

### Final review (2026-11-19)
PII pre-flight exit 0. REVIEWED=range 46dddb59195cdd1ceda3382f4b44da54054b3001 (46dddb59195cdd1ceda3382f4b44da54054b3001) ... HEAD (ff0699ae903f0940c7648622df85e950ac63a1ae) in /home/tracid/LingoLinq-AAC-sync-details
- `/review-pr` (senior pass): Approve. Its 2 Mediums and 1 Low were checked and dismissed: `end_canceled_sync` sees only
  the cancelled sync's own `sync_progress` (:2040-2049 absorb rule, :4905, :5114, :2376); the failure branch dedupes by
  id (:2462); `la-sync-card--saved` is unstyled on purpose (the base card is neutral; `--ready` has no rule either).
- `/adversary-review`: ship with conditions. Verified here:
  1. Medium, CONFIRMED: `store_eventually` resolves on queueing (above), so `note_board_done` overstates "saved".
  2. Medium, CONFIRMED: the stop paths never check failed writes. `writes_before` (:2042) is read only by the success
     branch (:2399, :2426); the failure branch and `end_canceled_sync` do not set `storage_failed`, so
     `partial_result`'s exclusion cannot fire for a stopped entry. A full device plus Cancel can show "saved before the
     sync stopped".
  3. Low (reported CONFIRMED, not yet re-checked): a board kept on a retry (`keep_stored_board`) can read `not_saved`
     (uniq keeps the first, unconfirmed row; nothing notes the kept one).
  4. Low, PLAUSIBLE (not re-checked): "failed retrieval" after the retry limit is untagged like a refusal; the
     `board_unauthorized` flag is dropped by `with_errors`/merge/`entry_copy`.
  5. Low (not re-checked): the running rollup counts in-flight downloads, so the count can drop after Cancel.
  6. Low (not re-checked): the technical list has no "not saved" case for `not_saved` rows.
  Open: Traci to decide the scope before any change (findings 1 and 2 need the /fix-proposal process).

## Part 3 (2026-11-19): findings 1 and 2 of the final review (fix-proposal)

### Fact sheet
(a) READ: `confirmed_statuses` (`utils/sync_rollup.js`) reads `sync_progress.boards_done` and `sync_progress.device_boards`
at a stop: failure branch (`services/persistence.js:2439`), `end_canceled_sync` (:5119). `partial_result` reads
`entry.storage_failed` (`utils/sync_log_store.js:137-147`). CONFIRMED.
(b) SHAPES of a 'downloaded'/'re-downloaded' row at a stop, with the writer of each:
  1. Fetched by `board_lookup` (reload or fresh), save QUEUED, not yet written. The adapter is the utils DSExtend: the
     service's `DSExtend` is a static on the Service class (`services/persistence.js:4243`), so the proxy's
     `prop in window.persistence` misses and falls back to the utils module (`utils/persistence.js:4569-4600`, :4233).
     Its find calls the utils `store_eventually` (:4392), which queues and resolves at once (:646-656). Today counted
     saved (`note_board_done`, :2782, :2785). CONFIRMED.
  2. Same, write done: on the device. CONFIRMED.
  3. Same, write FAILED: the utils `store` logs to `root.errors` and resolves (:759-771) and does NOT call
     `note_failed_write` (only the service `store` does, `services/persistence.js:772`), so `failed_writes` never counts
     it, and today it is counted saved. CONFIRMED.
  4. Batch step: 'downloaded' (:2971), the service `store`, and `note_device_boards` in its success handler (:2975),
     which runs on a FAILED write too (`store` resolves on failure, :772-777). Failure IS counted (`note_failed_write`).
     Today counted saved. CONFIRMED.
  5. The queue keeps draining after the stop (`utils/persistence.js:670-694`, a 200 ms timer that does not look at the
     sync), so a shape-1 board usually lands seconds later unless the app closes or the write fails. CONFIRMED.
  `device_boards` is created by the first `note_device_boards` call, which also sets `device_boards_read_at`
  (`utils/sync_board_fallback.js:63-66`); `known_on_device` treats an existing map as "the device was read"
  (:85-90). So nothing may CREATE that map except the device read. CONFIRMED.
(c) Cross-file: `writes_before` is set in `sync` (:2042) and is in scope in the failure branch (the success branch uses
it at :2399). `end_canceled_sync` gets no writes count (:2376 call). Lines above 4465 in services/persistence.js must stay
one-for-one; utils/persistence.js's last baselined row is 4358 (`.eslint-todo`), so its `store` (~:760) and its import
lines must be edited one-for-one too. CONFIRMED.

### Proposal
Finding 1, candidates:
- A (recommended). Confirm on the WRITE, not the fetch. One helper, `note_board_written(root, store, obj)`
  (utils/sync_rollup.js), called on the "Successfully stored object" line of BOTH `store` copies (same line): for
  store 'board' with a live `sync_progress`, mark `boards_done[id/key]`, and add to `device_boards` only if that map
  already exists (never create it). Remove the two `note_board_done` calls at :2782/:2785 (queue-time). Move :2975's
  `note_device_boards` into the same hook (it then runs only on a written board; a failed batch write is no longer
  noted, so a later lookup in the same sync downloads it again, which is correct). Effect: at a stop, a queued or
  failed write reads 'not_saved'. Cost: a board queued at Cancel that lands a second later still reads "not saved"
  in that entry (true at the stop; the next sync corrects it). Covers shapes 1, 3, 4.
- C (the review's). At the stop, demote boards still in the utils `eventual_store` queue. Rejected as the main fix:
  misses failed writes (shape 3) and the batch failure (shape 4), and reads another object's private queue.
- B. A, plus hold the stopped entry until the queue drains (bounded). Rejected: both stop paths are synchronous, Sync
  Details reads the log at once, and a bounded wait still guesses.
- D. A, plus flip a stopped entry's 'not_saved' row when its write lands later. Rejected for now: a log write on the
  store hot path; possible follow-up.
Finding 2: the failure branch computes `writes_failed_since(_this_sync, writes_before)` and sets `storage_failed` on its
entry (same line); `end_canceled_sync` takes `writes_before` from its caller (:2376) and does the same. And the utils
`store` calls `note_failed_write(root, error)` like the service copy, so a failed adapter write is counted (this also
makes a FINISHED sync whose only failures were adapter writes end as failed, which is #1268's intent; a behaviour change
on the success branch, for the review).
Risks: the store hot path gains a cheap call per write; `known_on_device` sees batch boards only after their write (one
extra download possible where a write failed); the utils counter change can turn a finished sync into "failed" on
devices where adapter writes fail today unnoticed.
Unresolved: is a 'cached' row trusted by the `retrieved` stamp (`known_on_device`) the same hole? (fetched since the
device read = queued, not written). Proposed: out of scope, record in "Not covered".
Tests (red first): unit `note_board_written` (marks done, adds to an existing map, never creates one, ignores other
stores); #1212 harness: a reload that finished but whose write has not run is NOT saved at a stop, and IS after the
service `store` writes it; a failed write is not; the failure branch and Cancel set `storage_failed` after a failed write
(and `partial_result` returns null); the utils `store` counts a failed write. Two EXISTING tests on this branch encode
the old spec ("marks a board finished when its reload finished", "marks a freshly downloaded board finished": saved at
lookup); they must change with it: needs Traci's OK (Rule #0.14).
Mutants: no hook in either store copy; hook creating `device_boards`; :2975 note left in place; no `storage_failed` in
each stop path; utils `store` without `note_failed_write`.

### Review of the Part 3 proposal (adversary, 2026-11-19, at c89734c6d): proceed with changes
Every CONFIRMED fact held. Verified here: `dbman.store` rewrites the record it is handed (`utils/dbman.js:146-159`:
`record.id` becomes "board::<id>", `record.raw` is encrypted), so the hook must read the CALLER's `obj`, unwrapped
(`obj[store] || obj`), never `record`; the utils proxy sends `persistence.store` to the service copy
(`utils/persistence.js:4590-4600`), so a test through the proxy never reaches the utils `store`; the batch fills
`key_lookups` before it stores (:2972-2973), so a failed batch write is NOT downloaded again in the same sync.
Correction to the proposal (Rule #0.10): "a later lookup in the same sync downloads it again" was false: the batch's
cached lookup is reused (:2758-2759); moving the :2975 note costs nothing.
Revised plan:
- Hook `note_board_written(root, store, obj)` reads `obj[store] || obj`; called AFTER `resolve(obj)` on the same line in
  both `store` copies, inside try/catch, so it can never hang a write (the batch waits on it, :2974-2978).
- Utils-copy tests drive the adapter path (DSExtend `findRecord` under `sync_testing`, as
  `tests/unit/utils/adapter-board-find-test.js`); the "no hook" mutant runs on each copy separately.
- `end_canceled_sync` gets `writes_before` from :2376; a missing one means "do not check" (the counter is never reset,
  and `writes_failed_since(root, undefined)` compares with 0).
- Drop `note_board_done` from the services import once its two calls go.
- Recommended NOT in this unit: `note_failed_write` in the utils `store`. With A, a failed board write is already not
  counted as saved; `failed_writes` is device- and session-wide, so counting every adapter write (user, buttonset,
  image rows, browsing, an earlier sync's queue) could fail finished syncs for writes that are not this sync's boards,
  with no evidence yet of how often adapter writes fail. For Traci.
- "Not covered" additions: a 'cached' row trusted by the `retrieved` stamp (queued, not confirmed); a fresh board
  served from memory with no device read (when `board_revisions` fails) reads not_saved though it is on the device;
  a board looked up by a key that was renamed; a board queued at Cancel that lands a second later still reads not
  saved in that entry.
- The two existing tests: the smallest change keeps their assertions and changes only the fixture (the stubbed reload
  or find stores `{board: {id: '1_1212', key: 'example/slow'}}` through the real path); new siblings pin the no-write
  case. Needs Traci's OK.
Traci (2026-11-19): change the two tests' setup (assertions kept; the stubbed reload/fetch stores through the real save
path; siblings for no write and a failed write). Leave `note_failed_write` out of the utils `store` (record in "Not
covered"). Order: unit F2 (storage_failed in both stop paths), then unit F1 (saved only on a written board).

### Unit F2 (2026-11-19): storage_failed in both stop paths
Code: the failure branch sets `storage_failed: writes_failed_since(_this_sync, writes_before) || undefined` (same line,
:2467); the :2376 call passes `writes_before`; `end_canceled_sync(..., writes_before)` checks only when given it.
Harness trap found on the way (CONFIRMED by a debug run): `primeSyncHarness` stubs `lingoLinqExtras.storage.store` so
only 'settings' writes reach the device database (`tests/utils/persistence-sync-test.js:649-656`); every other write
resolves without writing. A `capabilities.dbman.store_internal` stub therefore never sees a board write in this suite.
My first version of the F2 tests used that stub: the failure-branch test failed (no write was ever counted), and the
Cancel test passed for the wrong reason (a later 'settings' write failed). Rewritten to fail the 'board' write at
`lingoLinqExtras.storage.store` and pass every other store through. The existing `syncWithFailingWrites` tests
(:5801) also fail only a 'settings' write; noted, not changed.
Red (the committed pre-F2 code, the corrected tests): 3/3 fail on `storage_failed`. Green: 16/16 on the stop-path
describes; full sync filter 603 tests, 594 pass, 9 skipped, 0 fail; lint only the known false positive. Mutants: F2a
failure branch without the flag: killed (1); F2b :2376 not passing `writes_before`: killed (1); F2c Cancel checking with
no start count: killed (1); F2d Cancel entry without the flag: killed (2).

### Stop point (2026-11-19, Rule #0.13: three self-inflicted errors close together)
The errors: the wrong "saved at lookup" CONFIRMED claim (corrected above); a log command that hung on a stray `cat`
(its empty file removed); the first F2 tests failing for the wrong reason (harness trap above). F2 is committed and
verified (cee927b8f). Remaining, in order:
1. Unit F1 (the revised plan in "Review of the Part 3 proposal"): red tests first, including the two approved setup
   changes (the stubbed reload/fetch stores `{board: {id: '1_1212', key: 'example/slow'}}` through the real path;
   assertions kept) and their no-write / failed-write siblings; utils-copy tests through DSExtend `findRecord` under
   `sync_testing` (`tests/unit/utils/adapter-board-find-test.js`), and a board write failed at
   `lingoLinqExtras.storage.store` (NOT dbman: the harness trap). Then the hook (both `store` copies, after `resolve`,
   try/catch, reading `obj[store] || obj`), remove :2782/:2785 notes and the import, move :2975's note into the hook.
   Mutants: no hook in each copy separately; hook reading `record`; hook creating `device_boards`; :2975 left in place;
   a throwing helper.
2. The four Lows (all re-checked real, 2026-11-19): 3 (kept-on-retry reads not_saved: F1's hook covers it if the kept
   path's board was written, else note on keep), 4 (retry-limit failures untagged like refusals; #1328 hides on them:
   a `passing` tag, or tag refusals), 5 (running count drops after Cancel), 6 (technical list has no "not saved" or
   "kept" case). Traci to choose which go in this PR.
3. Re-run the final dual review on the new range, then /pr-preflight, then ask before pushing.
"Not covered" for the PR so far: pictures dropped by a cancel; a Cancel 2 s in replacing an earlier failed sync's
cards; a cancel during priming (rows with no roots); item B; the :3359 walk line untested; queued-save failures not
counted (`note_failed_write` not in the utils `store`); 'cached' rows trusted by the `retrieved` stamp; a fresh board
served from memory with no device read; a renamed key; a board queued at Cancel that lands a second later.

### Unit F1 (2026-11-19): a board counts as saved once its write succeeds. Code written; NOT fully verified
Code: `utils/sync_rollup.js` `note_board_written(root, store, obj)` (reads `obj[store] || obj`; marks `boards_done`; adds
to `device_boards` only when it exists); called after `resolve(obj)`, in try/catch, on the success line of both `store`
copies (`services/persistence.js:769`, `utils/persistence.js:757`, same lines); the queue-time notes at :2782/:2785
removed (both lines back to their pre-H form); the services import drops `note_board_done`; utils imports the helper
(:4642, same line). Every hunk one-for-one.
Deviation from the reviewed plan: :2975's `note_device_boards` is LEFT in place. A failed batch write is counted
(service `store`, `note_failed_write`), so F2 marks the stopped entry `storage_failed` and `partial_result` skips it; the
batch caches its lookups before storing (:2972-2973), so the map entry affects only `confirmed_statuses`. No test drives
a batch write to success, so a move could not be falsified without a new heavy harness.
Tests: the two approved setup changes (their reload/fetch now stores `{board: {id: '1_1212', key: 'example/slow'}}`
through the real store; assertions unchanged); new: a reloaded board whose save has not run, or failed (board write
failed at `lingoLinqExtras.storage.store`), is `not_saved`; a board written by the utils copy's own `store` (reached via
`Object.getPrototypeOf(persistence).store`) is saved; unit `note_board_written`. Red before the code: 4 fail for the right
reasons (missing helper; 're-downloaded' where 'not_saved' is expected; the utils write not counted). Green after: 64/64
on the related describes.
NOT yet run: the sibling "a freshly downloaded board ... while its save has not run" (added after the green run), the
F1 mutants (F1a no hook in the service store; F1b no hook in the utils store; F1c no unwrap; F1d creating
`device_boards`; F1f/F1g the old lookup-time notes back, written with `note_board_written(_this, 'board', {id, key})`
because `note_board_done` is no longer imported), and the full sync filter.
Stopped (Rule #0.13): a fourth self-inflicted error. A mutant-script edit failed its own assertion, but the run was
chained with `;` and started anyway; it was killed mid-mutant with F1a applied to services/persistence.js. Restored from
the script's own backup, the diff checked against F1 (hook present, :2782/:2785 as above). Next session: run the
narrow filter (the new sibling), then the six mutants (fix the F1f/F1g strings in the scratch script first), then the
full filter, then the dual review on the new range, then mark #1336 ready.
