# Modern view (board-detail): a folder tap takes ~30 s and clears the sentence bar (2026-11-14)

Report (Traci): real Android phone, Chrome Home Screen web app, dev.lingolinq.com, `lingolinq_admin`. Tapping a
sub-board in board-detail takes about 30 s and clears the sentence bar, which already held typed characters.
Basic view (board-alt) not tried.

## Slow: what the code does on a folder tap (CONFIRMED by reading)

1. `controllers/user/board-detail.js` ~:8729-8737: `board_saved_here` (online: resolves at once,
   `utils/board_device_copy.js:64-65`), `_preferred_board_detail_key` (a library sub-board's owner equals the route
   user, so no request, `controllers/user/board-detail.js:6574-6578`), then `transitionTo('user.board-detail', ...)`.
2. `routes/user/board-detail.js` `model` -> `_model_from_cache_or_server` (~:114-260): memory cache hit paints at once;
   a miss asks `/tree?root_only=1` with one try of `DEVICE_COPY_WAIT_MS` = 8 s (`utils/board_device_copy.js:14`,
   `_one_try` ~:678-685). No answer and a device copy: the copy (~:689-699). No answer and NO copy: "patient" (a
   second /tree request with the transport's normal limits), then `request_show` (`/boards/<key>`).
3. The Core 60 sub-boards are 0.92 to 2.02 MB each (see `2026-11-14_android-sync-slow-problems.md`); the 9 that failed
   to sync are exactly the ones with no device copy, so a tap on one of them takes the patient path. On a phone link
   shared with a running sync (6 threads of 1 to 2 MB boards) that chain plausibly reaches ~30 s. PLAUSIBLE: not
   measured on the device; not known whether the sync was running at the time, or which sub-board was tapped.

## Sentence cleared: candidates (none confirmed)

- The bar shows `sentence_parts` (controller), mirrored from the global `app_state.button_list` by the observer
  `_sync_sentence_from_global` -> `sync_sentence_from_button_list` (~:1733-1795). A comment (~:1838-1842) says the
  mirror is add-only and that typed / quick-phrase / Phrase Builder words live ONLY in `sentence_parts`. The code
  REBUILDS `sentence_parts` from the global list whenever they differ (~:1787-1789), so any `button_list` change would
  drop local-only words. CONFIRMED that the rebuild happens; NOT confirmed that a folder tap changes `button_list`.
- Leaving the route clears it: `resetController(controller, isExiting)` sets `sentence_parts` to [] only when
  exiting (`routes/user/board-detail.js:599-612`). A folder tap stays on `user.board-detail`, but the failure paths
  can leave: `afterModel` -> `leave_unsaved_board` -> `replaceWith('offline_boards')` when there is no connection
  and no home board copy (`utils/board_device_copy.js:78-90`); an error page.
- `toggle_mode` clears the global utterance (`services/app-state.js:1636`); `global_transition` reaches it only
  from edit mode (~:767). Not this case.
- A page reload (Chrome discarding the tab under memory pressure during the sync) would rebuild the global list from
  `stashes.working_vocalization` (`utils/utterance.js:36`) and lose local-only words. Not checked.

## Needed

- How the characters were entered (letter buttons on a keyboard board, the phone keyboard into the bar, Phrase Builder).
- Whether a sync was running, whether the page reloaded (blank screen or splash), which board was tapped.
- A local reproduction in Modern view: type, tap a folder, watch `sentence_parts` and `button_list`.

## Update (Traci, 2026-11-14)

- Sequence: tapped Sync, went to the Speak page while the sync ran, tapped the "those" folder on Quick Core 60.
  `lingolinq/core-60-those` (1.19 MB) is one of the 9 boards that failed to sync, so it had no device copy: the
  patient path (8 s /tree root_only, patient /tree, then /boards show) while 6 sync threads shared the link. Slowness
  diagnosis CONFIRMED in sequence (board size measured, no device copy known from Sync Details); timing on the device
  not measured. Step 1 of the sync fix removes most of it (synced boards open from the device copy).
- Sentence bar, narrowed (CONFIRMED by reading): `sentence_parts` is emptied only by controller init (~:677),
  `resetController` on exit (route ~:612), the Clear action (~:8927), or the rebuild from `app_state.button_list`
  (~:1787-1789: a global clear empties it; any global change drops local-only words). Every other writer appends
  (~:1618, ~:9338, ~:9434). The only `observer`s in utils/utterance.js are `set_button_list`, `update_hint`,
  `set_ghost_utterance` (:61, :485, :1272). Not yet found: what empties the global list, or exits the route, on this
  tap. Still unknown: how the characters were typed.
- RESUME HERE: grep utterance.clear / rawButtonList writers reachable during a sync (persistence sync end, user
  refresh, `utils/sync.js:887` remote modeling) and during the model hook's failure paths; then reproduce locally.
