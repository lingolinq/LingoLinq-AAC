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
