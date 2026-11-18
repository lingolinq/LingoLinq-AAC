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

# KAN-156: built-in words at once, AI words when they arrive; AI time limit and cap

Same branch, on top of the KAN-159 commit (`8395c2c31`). Cites are to that commit.

## Fact sheet

### (a) Where the values are read

- CONFIRMED. The Modern lookup commits to the rail in one place, when `lookup_with_ai` resolves:
  `board-detail.js:3741-3744` calling `_apply_suggestion_results` (`:3652`), which commits at
  `:3666`. `_run_suggestion_lookup` (`:3717-3750`) writes nothing before that, so the previous
  sentence's words stay on the rail, selectable, until the promise resolves.
- CONFIRMED. `lookup_with_ai` resolves once, after `RSVP.all` of the built-in lookup, the AI
  request and the saved-entries request (`word_suggestions.js:1220`).
- CONFIRMED. The AI request's timeout is read in the app's `$.ajax` wrapper: a caller's own
  `timeout` wins (`utils/extras.js:186`), otherwise a POST gets 20000 (`:190`). A timed-out POST is
  sent again once, 500 ms later, when `original_options.attempt <= 1` (`:362`); `attempt` is copied
  from the caller's options (`:179-182`).
- CONFIRMED. The client cap is read in `_has_budget` against `RATE_LIMIT` (`ai_word_predictor.js:18`).

### (b) Every shape

- `lookup_with_ai` returns the built-in promise alone when AI is off (`word_suggestions.js:1208`);
  otherwise the merged list. With an AI answer of `[]` that is the built-in list, minus any word
  that does not start with a word in progress (`:1144`), plus saved entries (`:1225-1235`).
  (Corrected after review: the first draft said simply "the built-in list".)
- `_apply_suggestion_results` receives the MERGED list. When that is empty (built-in empty, AI
  empty, no saved entries) it starts a second AI request of its own (`board-detail.js:3677-3678`)
  unless the sentence is empty or a word is in progress.
- The freeze (`_prediction_freeze_watch`, `:3290`) holds the rendered words when a write changes
  the word sequence while the rail is the dwell or scan target, and releases on an empty list. It
  has a one-shot exemption for the refresh that follows a committed prediction (`:3331-3344`),
  consumed by the FIRST write that changes the words.

### (c) Cross-file claims

- CONFIRMED. `lookup()` stamps the placeholder image on its own results, asynchronously, in
  `fallback_url().then` (`word_suggestions.js:716-720`).
- CONFIRMED. `utils/extras.js` is shared by every request in the app; nothing in this change edits it.
- CONFIRMED. The server clamps `count` to 8 (`board-detail.js:3266` cites `api/words_controller.rb:66`);
  not relevant to the limits changed here.

## Proposal

### 1. Built-in words first (Modern view only)

`_run_suggestion_lookup` starts the built-in lookup, commits its words through
`_apply_suggestion_results` as soon as they are ready (same token check as today), and hands the
same promise to `lookup_with_ai` so the built-in lookup is not run twice. The merged list is
committed when it arrives, exactly as today. Only when AI is on; with AI off `lookup_with_ai`
already returns the built-in words alone.

- An empty built-in result commits nothing early: the previous words stay until the merged answer,
  as today. Committing an empty list would blank the rail under a dwell and release the freeze.
- No loading flag on the early commit: the delayed dim cue would otherwise flash on every tap.
- Alternative considered: have `lookup_with_ai` call back when built-in words are ready. Rejected:
  the classic controller shares that function and its rendering carries an Android timing
  workaround; a promise passed in by the one caller that wants it changes nothing for the other.
- Alternative considered: blank or dim the rail while AI is out. Rejected: an empty rail is worse
  for a user already reaching for a word than a current built-in list.
- Risk: for direct touch, tiles can change about a second after they appear, when AI words are
  merged in ahead of the built-in ones. The freeze covers dwell and scanning only. To be measured
  and reported; changing the merge order is a separate decision.
- Mutation: do not commit the built-in words early.

### 2. Two second limit, one attempt

`_fetch` passes `timeout: 2000` and marks the request as already on its last attempt, so the
wrapper neither applies 20 seconds nor sends it again. `utils/extras.js` is not edited. Applies to
both views.

- Mutation: remove the two options.

### 3. Cap 60 a minute

`RATE_LIMIT` 15 to 60. The 30 second pause after a refusal stays.

- Mutation: set it back to 15.

## Proposal review (adversary agent, before any KAN-156 app code was edited)

Reviewed at `8395c2c31` plus the uncommitted proposal and tests.

| Finding | Decision |
|---|---|
| High: with no word in progress the merge puts AI words first and the server returns as many as were asked for, so a full AI answer replaces EVERY built-in tile. Built-in first would therefore change the whole rail twice per tap, the second time 0.3 to 2.3 seconds after the tap, and direct touch has no freeze | Accepted. Part 1 (built-in first) is NOT implemented. It needs a product decision on how the two lists share the rail; see "Open decision" |
| Medium: the early write would consume the one-shot post-commit exemption, so the AI list would then be frozen for a gaze user who keeps looking at the rail | Accepted; belongs to the same decision |
| Medium: a symbol resolved for an early built-in item is painted on the old item object, not the merged copy | Accepted; any future early commit has to carry the image across |
| Medium: spelling corrections shown early would vanish when the merge applies its prefix filter | Accepted; an early commit must be limited to "no word in progress" or use the same filter |
| Medium: 2 seconds is not grounded in measured latency, and the server finishes (and bills) a request the client gave up on; when the built-in list is empty a timed-out turn sends a second request through the fallback at `board-detail.js:3677` | Partly accepted. 2 seconds is the figure in the ticket and the approved plan; it is shipped as is and the latency check is listed under "Not verified". The fallback resend exists today for any failed AI answer; it is not changed here and is listed as a follow-up |
| Low: no server-side limit behind the 60 a minute cap | Known; the server limit is a separate proposal. The file header now says the client cap is the only brake |
| Low: weak or pre-passing tests | The limits test now also asserts a timeout neither pauses AI nor is cached. The built-in-first tests are parked, not committed |
| Low: lint baseline placement; missing rejection handler; fact-sheet errors | Fact sheet corrected above; the rest applies to part 1 only |

Checked and held up: `attempt: 2` is read only where the wrapper counts attempts and picks its
default timeout; a timeout is rejected with status 0, which does not trigger the 30 second pause
and is never written to the client cache.

## What shipped for KAN-156

- Parts 2 and 3: `_fetch` passes `timeout: 2000` and `attempt: 2`; `RATE_LIMIT` is 60.
- Red before the fix (`tests/unit/utils/ai-word-predictor-limits-test.js`): the timed-out request
  was sent twice; the twenty-first request in a minute got no words. Green after.
- The pre-fix red run is the falsification for both: it is the same tests against the code with
  the two options absent and the cap at 15.

## Open decision (Scot): what the rail shows while the AI answer is out

After KAN-159 the Modern rail keeps the previous sentence's words until the AI answer arrives
(about a second on dev in October, at most about 2.3 seconds with the new limit), then changes
once. Before KAN-159 it changed at once to built-in words and never showed AI words. Three ways
forward; none is implemented:

1. Leave it: one change per tap, late.
2. The ticket's wording: built-in words at once, then the whole rail changes again when AI answers.
3. Reserved slots: built-in words fill some tiles at once, AI words appear in the remaining tiles
   when they arrive, and no tile changes its word once shown.

**Decided (Scot, 2026-11-17):** option 1 ships in this PR; option 3 is built afterwards as its own
piece of work (it needs layout choices and its own proposal and review). Until then the previous
sentence's words stay on the rail, and can be selected, while the AI answer is out.

## Not verified

- Lookups, AI requests and timings per tap in a real browser against a real backend, before or
  after. The counts in this log come from unit tests with the network replaced.
- Real Bedrock latency against the 2 second limit.
- Real dwell hardware, switch scanning, Cordova and Electron.

## Follow-ups noted, not done

- The Modern fallback at `board-detail.js:3677` asks the AI a second time when the merged list is
  empty, including after a timeout.
- Per-user server limit on `POST /api/v1/words/predict`.
