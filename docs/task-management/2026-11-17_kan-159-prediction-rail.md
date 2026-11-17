# KAN-159: AI words never reach the Modern view prediction rail

Date: 2026-11-17. Branch `chore/scot-session-341c6a4f`, cut from `develop` at `d6b3cc859`.
Ticket text and the Oct 10 baseline were supplied by the planning session (private handoff file);
this log holds only what was verified in this worktree. All `file:line` cites are to this branch
before the fix.

## Symptom

With AI word prediction on, the Modern view (board-detail) rail shows built-in words only.

## Fact sheet

### (a) Where the values are read

- CONFIRMED. The rail renders `prediction_suggestions`
  (`app/frontend/app/controllers/user/board-detail.js:3460`), computed from `suggestions.list`.
  The lookup path writes `suggestions` through `_commit_suggestions` (`:3611`).
- CONFIRMED. AI words enter the list in `word_suggestions.lookup_with_ai`
  (`app/frontend/app/utils/word_suggestions.js:1190`): it calls `ai_word_predictor.predict`
  (`:1214`) and merges the answer with the built-in words (`:1224`).
- CONFIRMED. The classic controller issues its lookup inside a `runLater` at
  `app/frontend/app/controllers/board/index.js:182`. The only gate before it is the early return at
  `:166`, which also precedes the `set_suggestions` writes at `:178` and `:180`. A condition added
  to `:166` precedes every path through the observer.
- CONFIRMED. The app reads "which route is on screen" as
  `router.currentRouteName || current_route` on the app-state service
  (`app/frontend/app/services/app-state.js:1438` and `:1522`), and tests it with
  `indexOf('board-detail') !== -1`.

### (b) Every shape the values can hold

- `predict()` never rejects. It resolves `[]` when AI is off (`ai_word_predictor.js:63`), the
  sentence is empty (`:77`), it is backing off (`:90`), the budget is spent (`:95`), the request
  failed (`:140`), or **another caller arrived while it waited** (`:71-73` calling the function
  stored at `:105`). It resolves words from the cache (`:85`) or the network (`:135`).
- `predict()` has two callers in the app: `word_suggestions.js:1214` and the empty-result fallback
  at `board-detail.js:3678`. No app code passes `immediate`.
- Route name: `board.index`, `user.board-alt.index`, `user.board-detail.index`,
  `user.board-detail.edit`, the loading and error substates (`user.board-detail_loading`,
  `app-state.js:684`), any other route (the controller is a singleton and stays alive), and empty
  (unit tests; before the first transition).
- Writers of the Modern controller's `suggestions`: `_commit_suggestions` (`:3613`),
  `_begin_suggestion_lookup` (`:3410`), `_republish_suggestion_list` (`:1418`), the three clears
  (`:3723`, `:3771`, `:3778`), and, from outside the controller,
  `app/frontend/app/utils/edit_manager.js:2031-2036`, which also calls
  `controller.updateSuggestions()` directly (`:2034`).

### (c) Cross-file claims, each checked

- CONFIRMED. The Modern route keeps the classic controller alive and mirrors the board onto it:
  `app/frontend/app/routes/user/board-detail.js:345-347`.
- CONFIRMED. The classic controller also serves `user.board-alt.index`:
  `app/frontend/app/routes/user/board-alt/index.js:19` (`controllerName: 'board.index'`).
- CONFIRMED. The classic observer has no route check (`board/index.js:147-166`).
- CONFIRMED by test, not by reading: one replacement of `button_list` runs the classic lookup
  twice, and the Modern lookup eight times once the mirror into `sentence_parts` has run (the red
  runs below). The ticket's 13 and 4 were counted
  in the live app on Oct 10 and were not re-measured here.

## Mechanism

Each tap replaces `appState.button_list`. Every Modern lookup calls `predict()`, and each call
cancels the one before it with `[]`; those are stale by the lookup token and are discarded
(`board-detail.js:3743`). The Modern rail's last request is still waiting out the 300 ms debounce
when the classic controller's `runLater` lookup calls `predict()` with the same sentence. That
cancels the Modern request with `[]`, its token is still current, so the rail commits built-in
words only. The classic controller gets the AI words, for a bar the Modern view does not render.

## Red tests (written before the fix; results on unchanged code)

| File | Result on unchanged code |
|---|---|
| `tests/unit/utils/ai-word-predictor-shared-request-test.js` | 2 of 6 fail: the first of two same-sentence callers gets `[]`; a caller arriving while the request is on the wire sends a second request |
| `tests/unit/controllers/board-index-modern-view-quiet-test.js` | the two Modern view tests fail with 2 lookups issued (0 expected) |
| `tests/unit/controllers/user-board-detail-one-lookup-per-tap-test.js` | every test fails; with the real mirror into `sentence_parts` running, two taps issued 16 lookups (8 each) |

## Proposal

Three changes, each with its own test and its own mutation.

### 1. Classic controller stays quiet in the Modern view

`board/index.js:166`: add "the active route name contains `board-detail`" to the existing early
return, read the same way `app-state.js:1438` reads it.

- Alternative considered: bail unless `board.index` is the active route (the ticket's wording).
  Rejected: it would switch prediction off on `user.board-alt.index` and in the existing unit tests,
  which build the controller with no route.
- Alternative considered: a flag the Modern route sets on the classic controller. Rejected: three
  route files would have to keep it true, and a missed reset silently disables classic prediction.
- Risk found in review: the classic bar is no longer kept current during a Modern session, and on a
  move from the Modern view to the classic board with the same board and sentence nothing the
  observer watched would change. The observer therefore also watches the router's route name, so
  arriving on a classic route runs a lookup. (An earlier draft of this log said a classic lookup
  could still run on entry to the Modern view. Review traced the router order and found the route
  name is already board-detail by the time observers run; that claim was wrong and is withdrawn.)
- Mutation that must turn the test red: remove the route condition.

### 2. One request per sentence in the predictor

`ai_word_predictor.js`: callers asking for the same sentence and language get the same pending
promise, whether it is still waiting or already on the wire. A different sentence still cancels a
request that has not been sent. A cleared sentence still cancels.

- Shape: the existing `predict` body is kept as it is under a new name, and a small `predict`
  wrapper in front of it holds a map of pending promises by the existing cache key. The entry for a
  waiting sentence is dropped the moment a different sentence replaces it, so a repeat ask is never
  handed the cancelled empty answer.
- Alternative considered: rewrite the cancel block in place. Rejected: the two `runloop` calls in
  that body are baselined by line in `.eslint-todo`; a wrapper leaves them where they are.
- Risk: the shared answer was requested with the first caller's `count`. The cache already ignores
  `count` (`_cache_key`, `:37`), so this matches existing behaviour.
- Mutation: make the wrapper call straight through.

### 3. One Modern lookup per turn

`board-detail.js` `updateSuggestions` (`:3752`): firings in the same turn collapse into one run of
the existing body, queued on a resolved promise. The lookup token and the freeze are untouched.

- Alternative considered: skip a firing whose inputs (sentence, language, board) equal the last
  lookup's. Rejected: `edit_manager.js:2031-2036` overwrites `suggestions` from outside and then
  calls `updateSuggestions()` expecting a lookup; a skip there would leave the rail blank. A
  coalesced run can never skip a needed refresh.
- Limit: firings in later turns (the mirror into `sentence_parts`) still run their own lookup, so
  this gives a small number of lookups per tap, not always exactly one. They share one AI request
  through change 2.
- Risk: the lookup, and a clear, start one microtask later than today.
- Mutation: make the queueing helper always answer "run now".

### Questions not resolved

- Lookups and AI requests per tap in the live app after the fix. The unit tests count them in a
  harness; a browser run against a real backend has not been done.
- Real dwell hardware and switch scanning; Cordova and Electron.

## Proposal review (adversary agent, before any app code was edited)

Reviewed at `d6b3cc859` plus the untracked tests and this log. Each finding was checked against the
code before it was accepted.

| Finding | Decision |
|---|---|
| High: once AI words reach the rail, every Modern lookup waits on the AI answer (`word_suggestions.js:1220`) and the previous sentence's words stay selectable meanwhile; today's bug hides this because the cancel makes the rail refresh with built-in words at once | Accepted as a ship condition, not a change to this unit: KAN-156 (built-in words at once, AI swapped in, 2 second limit) goes in the same PR |
| Medium: a shared answer must not skip the AI-enabled check for a later caller | Accepted. The wrapper runs `is_enabled` for every caller before the map; test added |
| Medium: a thrown lookup must not leave the queue flag stuck | Accepted. The queued flag clears before the body and the running flag in `finally`; test added |
| Medium: the end-to-end test passes with change 1 or change 2 alone, and never ran the real mirror | Accepted. It now runs the real mirror; each change keeps its own unit test as its mutation test |
| Low: settle clean-up must check the entry is still its own promise | Accepted; test extended with a fourth caller |
| Low: classic bar not refreshed on a move from Modern to classic | Accepted; see change 1 |
| Low: the entry-risk claim and the "8" figure in this log | Corrected above |
| Low: line-anchored lint baseline | Edits placed so no baselined row moves; `npm run lint:js:ci` reports `new=0` |

## Results after the fix (step 1 only)

- New tests: 7 + 7 + 7 pass.
- Existing modules, same filters before and after: `prediction` 115 pass and 6 fail before (the 6
  are the new tests), 122 pass after; `ai_word_predictor` 33 of 35 before, 36 of 36 after;
  `board/index` 16 of 19 before, 21 of 21 after; `word_suggestions` 26 of 26 both times.
- Lint gate: `findings=1545 baseline=1548 grandfathered=1545 new=0`.
