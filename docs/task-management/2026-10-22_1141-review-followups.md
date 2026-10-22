# 2026-10-22: #1141 review follow-ups (items 1, 2, 3, 5, 6, 7, 8, 9)

Branch `traci/fix/1141-review-followups`, from `origin/develop` at 4bae48a9c. One PR, one commit per item.
Source: Scot's follow-up on #1141 (findings from Oct 14, plus the Oct 15 adversary pass). Item 4 is #1132,
not in scope. Voice transcription opt-out is a separate PR.

LEARNINGS consulted: `LEARNINGS.md` (.eslint-todo line anchoring, three-touch preference); archive
2026-10.md:243-265 (de-dupe at the caller, keyed on the state its own action produces), :361-372 (a tab's
token is two values; invalidate -> flush is device-wide), :406-413 (`new_board_ids` can miss boards);
LEARNINGS-2026-01_to_2026-09.md:3174-3225 (copy_id on roots), :6322 (user.save serializes the whole record),
:7166 (serialize rapid saves).

## Item 1: cancelled copy cleanup can delete boards the copy did not make (High)

### Facts
- (a) READ: `discard_cancelled_copy` (app/frontend/app/utils/board-copy.js:160-188) chooses what to delete from
  `ids` (the job's `new_board_ids`) PLUS every `load_board.id` on each board it deletes (:179-182). The only
  checks are owner, not-home, and `created >= since` (:176-177). CONFIRMED.
- (b) SHAPES of `copy_id` on a board the copy job made:
  - root: the client creates it with `parent_board_id` only (models/board.js:1050-1070), so board.rb:1883 and
    :1898 do not run; BoardSetCopier sets `copy_id = own id` when empty (app/services/board_set_copier.rb:30-33).
    The serializer omits `copy_id` when it equals the board's own id (lib/json_api/board.rb:146-147), so on the
    client the root's `copy_id` is EMPTY. CONFIRMED.
  - sub-board copied in phase 1: `copy_for(..., copy_id: @starting_new.global_id)` (board_set_copier.rb:80-82),
    stored by BoardCloner (app/cloners/board_cloner.rb:64). CONFIRMED.
  - private copy made in the relink phase: same value (board_set_copier.rb:336-338). CONFIRMED.
  - `assert_copy_id` (relinking.rb:52-53) returns at once when `copy_id` is set, so no backfill rewrites it. CONFIRMED.
  - Other writers (board.rb:717 import, :1883-1891 `copy_key`, :1898 `source_id`; api_json_bundle.rb:487;
    relinking.rb:282/:289 clustering) apply to boards NOT made by this job. The doc's "copy_id can point to the
    board a copy came from" describes :1898. CONFIRMED.
  - So for every board this job makes, `copy_id` is the root's id: CONFIRMED by code path.
- (c) `new_board_ids` = root id + `change_hash[id]` for the source's STORED downstream ids (app/models/user.rb:4652-4660),
  which can be stale; the link walk exists for that reason. The first entry is always the root. CONFIRMED.
- Exposure: a board the user owns, reachable by a link from a deleted copy, created within the window. E.g. a
  source button with `link_disabled` pointing at the user's own board is not copied
  (board_set_copier.rb:249 skips disabled links) and the copy keeps that link. ASSUMED reachable in practice;
  the test builds it directly.

### Candidates
- A (chosen). Lineage check in `discard_cancelled_copy`: a board is "this copy's" only if it is the root (matched by id,
  because its copy_id is not serialized) or its `copy_id` equals the root id; the link walk only continues through
  boards that pass. Root id = `root.get('id')`, else `ids[0]`. Keeps the walk, so a board the stale list missed is
  still removed. Client-only.
- B. Server reports every board the job made (`change_hash.values`), client deletes exactly those and drops the walk.
  Exact, but changes the job result and the server path; mapper keys need uniq. Rejected for this PR: A is enough
  once copy_id is confirmed reliable, and B touches the hottest server path.
- Rejected: "delete only reported ids" alone (Scot's fallback): brings back the left-behind copy seen 2026-10-11.

### Risks / unresolved
- A board the user makes DURING the copy window with "create board" from a new sub-board inherits copy_id = root
  (board.rb:1898) and would be deleted. Narrow (the copy is being cancelled; the source sub-board is deleted too).
- Existing fixtures in tests/unit/utils/home-copy-cancel-test.js have no copy_id on sub-board copies; they get the
  copy_id a real copy carries. That is the spec change Scot asked for, not a weakening.

### Test / mutation
- Red: a copy links to a recent board the user owns with no copy_id (or another copy's id) -> it stays.
- Mutation: drop the lineage check -> the test fails.

## Item 2: Basic "set home" double tap (classic-view.js)

### Facts
- (a) READ: BoardIcon is a classic component; its click handler reads `_this.onAction` (board-icon.js:393-406),
  the property it was rendered with. `@onAction={{this.basicTileAction}}` (classic-view.hbs:774), and
  `basicTileAction` is `_basicAssignFromTile` only while `basicAssigningHome` (classic-view.js:348-350). So a second
  tap before the re-render still calls `_basicAssignFromTile`. CONFIRMED by reading.
- `_basicAssign` (classic-view.js:369-383) turns the mode off only in `onAssigned`, after the owned save or when the
  dialog finishes (utils/basic_home_assign.js:41-51). No in-flight latch. CONFIRMED.
- Modern: `_assignHomeBoard` leaves the mode synchronously (available-boards-section.js:921-926), and its tap handler
  checks `assigningHome` at call time (:212-214). CONFIRMED.
- (c) modal.open returns a promise that settles when the dialog closes or is replaced (modal.js ~l.131-174). CONFIRMED.

### Candidates
- A (chosen). In `_basicAssign`: return at once unless the mode is on at call time and no assign is in flight; then
  turn the mode off synchronously, set `_basicSettingHome`, and clear it when the returned promise settles (either way).
  The key/user guard stays in basic_home_assign.js, so a tile with no key does not end the mode: check it first here too.
- B. Only the synchronous mode-off. Rejected: a tile tap after re-entering the mode while the first save is still in
  flight races (Scot asked for the in-flight guard).

### Test / mutation
- Two taps on two owned boards, the copies resolving in REVERSE order -> one copy call, one dialog, and the home is the
  first tap's board. A public-board tap during an owned save -> no second dialog.
- Mutations: remove the call-time mode check (second tap assigns); remove the latch (re-enter mode, tap -> second copy).

## Item 3: a stale failed request logs out a session that just signed back in (Medium)

### Facts
- (a) READ: the dead-session branch, utils/extras.js:407-411, calls `force_logout` on `dead_session && !already_dead
  && !speak_mode`. It does not look at the token the request was sent with. CONFIRMED.
- The token is `var token` (extras.js:222-233), set in the same promise executor and sent as `Authorization` (:237);
  the failure handler is inside that executor, so it is in scope (function-scoped `var`). It is undefined when the URL
  is not relative. CONFIRMED.
- `_checked_token_is_current(token)` (services/session.js:740-747): true for no token; else equal to this tab's
  `access_token` or `capabilities.access_token`; with neither set, the stored login decides. CONFIRMED.
- Same-tab sequence: request A and B carry T1; B fails -> teardown; user signs in (T2, authenticated, so
  `logout_under_way()` false); A fails with invalid_token -> force_logout ends the T2 session. CONFIRMED by reading.
- Cross-tab: tab A still holds T1 as its own `access_token`, so T1 is "current" there and the check does NOT stop tab A
  logging out; on the no-modal path `invalidate(true)` -> `stashes.flush()` (session.js:830, _stashes.js:179-213)
  removes the shared stored login that tab B just wrote. CONFIRMED by reading. NOT fixed here: skipping tab A's logout
  would leave it showing user A while `capabilities.sync_access_token` makes it send user B's token
  (session.js:730-739 explains why that is worse). Needs a decision on what the no-modal path may flush.

### Candidates
- A (chosen). Add `&& token_current(token)` to the dead-session condition, where `token_current` uses
  `session._checked_token_is_current` (typeof-checked like its neighbours). No token -> unchanged behaviour.
- B. Compare with the stored login instead. Rejected: in the same tab after a re-login the stored login and the tab's
  token agree, so it adds nothing over A, and it is wrong for the cross-tab case above.
- The success path (extras.js:297, `data.invalid_token` on a 200) has the same gap; left as is and noted (no failing
  case seen; separate change).

### Test / mutation
- Red: a failure whose request carried T1 while the session now holds T2 -> no force_logout. Mutation: drop the token check.

## Item 8: no test for the dead-session branch

Four cases, in tests/utils/extras-test.js (or a new unit file), driving the real failure handler through
`$.realAjax` stubbed to reject: (a) a 400 invalid_token logs out once; (b) not in speak mode; (c) not for a
"Not authorized" 400 (no `invalid_token`); (d) a second failure after the first is de-duped (logout_under_way).
Plus item 3's fifth case. Mutations: drop each condition in turn.

## Item 5: an old device can switch AI consent back on (Medium); #1134 (tour progress)

### Facts
- (a) READ: `User#process_params` (app/models/user.rb:2917-2935) writes every PREFERENCE_PARAMS key the request
  carries (`!= nil`); AI keys are normalized but still written. Progress (:3158-3183): every listed progress key the
  request carries REPLACES the stored one, and the guided-tour maps are sanitized, not merged. CONFIRMED.
- Five client paths save the whole record to record one small change: tour_offer.js:25-34 `mark_tour_offered`;
  guided-tour.js:1400-1413 `_markTourCompleted`, :1425-1438 `_markTourAutoShown`; controllers/application.js:1197-1225
  and controllers/user/board-detail.js `set_word_prediction` (identical bodies). `preferences` is `attr('raw')`
  (models/user.js:171) and the serializer sends it whole. CONFIRMED.
- (b) SHAPES of the request: whole `preferences` with every key (these five, the preferences page, every other
  user.save()); partial (`beta-welcome-mode.js:50-53` sends one key by ajax). No "changed keys" mechanism exists. CONFIRMED.
- (c) The online save path: services/persistence.js:4716-4736 `updateRecord` -> RESTAdapter `_super` ->
  serializer `serialize(snapshot)`; `snapshot.adapterOptions` carries `save({adapterOptions})`. The raw `user` hash
  reaches `process_params` (users_controller.rb:203-205). ASSUMED that adapterOptions reaches serialize through the
  custom adapter: to be checked in the test.
- Tour maps only ever gain entries on the client (no reset path in app/frontend). CONFIRMED by grep.

### Candidates
- A (chosen). A per-save list of the keys it changed.
  - Client: `user.save({ adapterOptions: { preference_keys: [...] } })`; the user serializer copies the list into the
    payload as `preference_keys`. Per save, so it cannot leak into a later save (a record attribute would).
  - Server: on UPDATE, when `preference_keys` is an Array, `params['preferences']` is reduced to the listed keys before
    anything reads it; `progress.<attr>` names one progress key. For a listed guided-tour map the stored map and the
    sent map are merged (union, then the existing sanitizer), so a stale device cannot drop a tour finished elsewhere.
  - The five paths send their one key. Two shared units: `utils/word_prediction_pref.js#set_word_prediction` (both
    controllers call it) and `utils/tours/tour_progress.js#mark_tour_progress(user, map, key)` (tour_offer and
    guided-tour call it).
- B. A dedicated partial endpoint, called by ajax. Rejected: the local record stays dirty, and a dirty record keeps its
  local attributes over a later reload, so the device would stop seeing a supervisor's changes.
- C. Server merges a whole stale object. Rejected (Scot): merging still overwrites consent.

### Risks / unresolved
- An app build older than this change, and any other whole-record save (the preferences page, the offline replay of a
  queued save), still writes every key. This closes the five paths named; it does not make consent keys immune to every
  whole save. Hardening all saves (AI keys only when listed) needs the preferences page to list its keys; out of scope,
  noted for Scot.
- With the list, `preferences.device` is not processed unless listed. set_word_prediction sets `device.updated` only to
  dirty the record; the controller reads it before process_params (users_controller.rb:225-237), so the device lookup is
  unchanged.

### Test / mutation
- RSpec: a save listing `word_suggestions` with a stale `ai_features_enabled: true` leaves AI off and sets word_suggestions;
  a save listing `progress.guided_tours_autoshown` keeps a stored completed map and unions the autoshown map; a save
  without the list behaves as today. Mutation: skip the slice -> AI flips on.
- QUnit: each of the five paths saves with the right `preference_keys`; the serializer puts the list in the payload.

## Item 7: seven new `.eslint-todo` rows (Medium)

Rows 1125-1126 (`dashboard-preview-boards-cache-test.js`) and 1132-1136 (`application-word-prediction-test.js`),
added in 57c314604 with the files. Fix: `assert.strictEqual(x, true|false, m)` -> `assert.true(x, m)` /
`assert.false(x, m)` (same strictness: qunit's assert.true is `=== true`), and the `|| null` logical in an assert at
63:24 moved out of the assertion. Delete the seven rows. Correct docs/task-management/2026-10-12_tour-redesign.md:193.
Approval for rewriting these assertions: Scot's review asks for exactly this.

## Item 6: copy cleanup after a logout may run as the next user (Medium, auth_spa_transition only)

### Facts
- (a) READ: trial-bar.js:146 `superseded` is true when `home_copy_pending` is null; `clear_user_state` nulls it
  (app-state.js:2196) on the SPA logout path only (session.js:781-787, 876-880). The cancelled branch then runs
  `discardCopy(ids, me, ...)` (trial-bar.js:152-155) with the next session's token. CONFIRMED.
- The dialog path (confirm-home-board-copy.js:155) reads `cancelRequested` from a component `modal.reset` may have
  destroyed; if false, copy_board saves the old user's home under the new session. ASSUMED reachable.
- `session.user_id` is set at session.js:319/539 and nulled at :851. CONFIRMED.

### Candidates
- A (chosen). In `copy_or_reuse_as_home` (the one place both callers go through): when cancellable, record
  `session.user_id` at the start; the cancel check also says yes once it differs (so no home save runs as someone else),
  and the rejection carries the starting id. `discard_cancelled_copy` takes that id and deletes nothing when the
  signed-in user has changed. Both callers pass it through.
- B. Guard only in trial-bar. Rejected: the dialog has the same exposure.

### Risks / unresolved
- A copy started before `session.user_id` is known (null) is not guarded. Boards left behind after a logout stay in the
  first user's My Boards (preferred over deleting as someone else).

### Test / mutation
- Red: cancelled copy, session.user_id changes before the discard -> nothing deleted; cancel check true once the id changes.
  Mutation: drop the id comparison.

## Item 9: comments cite a rake task that is not in the repo (Low)

The file was never committed on any ref (`git log --all` on the path is empty). The task log
(2026-10-10_modern-home-polish-and-compressed-view-removal.md:66-68) says it ran only on local development. Fix the three
comments (user.rb ~2599-2603, ~3508-3512; lib/feature_flags.rb:129-134) to say the stored value is ignored and no
backfill was landed. Landing the rake file instead is Scot's call (data-bearing path).

## Review outcomes (2026-10-22)

Two reviews of the proposal: an adversary pass (all items) and a security pass (items 1 and 5). What changed:

- Item 5, BLOCKING and fixed: `models/base.js#save` called `this._super()` bare, so `adapterOptions` never reached
  Ember Data and no list was sent (fact (c) above was wrong). Now forwarded; a test drives a real record through the
  real adapter to `$.realAjax` and checks the PUT body.
- Item 5: the confirmation_log compared a missing key as nil and logged every stored logging/cookie value as changed
  on any partial save. A key the request does not send is now skipped (spec). This also stops it for other partial
  saves (beta-welcome-mode.js), and for a supervisor's save whose logging keys the server deletes.
- Item 5: offline saves were replayed whole by sync_changed. The queued copy now keeps the list, a second queued
  save combines lists, a whole save already waiting keeps the replay whole, and the replay passes the list.
- Item 5 / #1134: tour maps are merged on EVERY save (stored entries first, so the cap never drops one stored), since
  many other whole saves also carried them and nothing resets them.
- Item 5: request spec through users#update; the list is read after the controller's permission slices.
- Item 2: tiles stay on the ignoring handler while an assign is in flight (a fast second tap opened the board); a
  synchronous throw releases the latch; added a late-tap test (the call-time check was not pinned).
- Item 8: the force_logout stand-in clears the token like the real teardown; added the invalid_token-alone case;
  the de-dupe test holds the token check open so it pins the de-dupe itself.
- Item 1: added a test that pins the age cutoff and that the walk never passes through a board the copy did not make.
  Wider risk note: board.rb's `source_id` create from the root or any new board, and a Root Key edit (board.rb ~1881),
  can give another board the root's copy_id during the copy window.
- Item 6: added "signed out, nobody signed in yet". Org, picker and for-someone-else copies are not cancellable and
  are not guarded.

## Final-diff reviews (2026-10-22)
- Senior-dev pass (diff file only): approve with comments. Acted on: a hung save no longer leaves Basic tiles dead (taps
  are ignored only for a 1.5 s double-tap window); the signed-in user is checked again just before each delete; both
  callers are tested to pass the copy's starting user. Checked and not changed: `copy_id` is a declared board attribute;
  `_basicAssign` has one caller; no save caller passes arguments; nothing on the server shrinks a tour map.
- Adversary pass: no Critical or High. Medium, fixed: the offline queue looked up the session user's waiting copy
  through persistence.find, which redirects 'self' to the real id, and dbman.find reads a non-numeric user key as a user
  name, so a listed save could overwrite a whole save still waiting. The copy is now read by its storage id
  (storage.find_all, the id index), any lookup failure keeps the replay whole, and a test drives two offline saves of the
  'self' user through the real adapter and local storage. Also strengthened: the cap spec pins that stored tours win, and
  the request spec now uses a supervise-only supervisor whose list cannot widen the write.

## Still open (for Scot)
- Item 2: on someone else's board the in-flight guard is released when the copy dialog closes; after a slow copy the
  dialog can be closed while the copy carries on, so a second assign started then can race the first.
- Item 5: a listed save cuts down only `preferences`; the rest of a stale record (name, email, description,
  external_device, ...) is still written as sent, as on every whole save today.
- Item 5: many other whole-record `user.save()` calls (count not verified) (saveHomeBoard, view style, word-suggestion position,
  the preferences page...) still write every key, so a stale device can still turn AI back on through them. The
  stronger fix is a server rule that writes AI consent keys only when a save lists them, with the preferences page,
  enable-ai-features and focus-words listing theirs.
- Item 5: a listed save replaces the record's preferences with the server's, so an unsaved local preference edit on
  that record is dropped in memory (PLAUSIBLE; no current flow found that leaves one).
- Item 3: another tab's no-modal logout still flushes the shared stored login (needs a decision on what that path may clear).
- The success-path invalid_token logout (extras.js ~297) has the same stale-token gap; not changed.
- utils/persistence.js and services/persistence.js carry the same offline edits, since both are reachable. Which copy's DSExtend the adapter mixes in was reported by the adversary pass (the utils copy) and not verified here.

## Verification
- RSpec: spec/models/user_preference_keys_spec.rb (12), spec/controllers/api/users_controller_preference_keys_spec.rb (3);
  with user_spec, the AI preference and EU consent specs and users_controller_spec: 908 examples, 0 failures.
- QUnit, targeted: home copy cancel 15, classic-view home assign 10, extras dead-session 6, preference keys 12, word
  prediction 6, tour offer 13, guided 39, trial-bar 19, confirm dialog 9, board-detail 197, session 181 (1 todo),
  persistence 181 (9 skips), serializer 4, all passing.
- Falsified: each guard mutated (lineage, session change, mode check, latch, stale token, de-dupe key, base save
  arguments, serializer list, queued-key rule, replay call site, server reduction, merge, confirmation guard); each
  turned its own tests red.
- `npm run lint:js:ci`: 0 new; 7 rows removed (item 7); 27 rows re-anchored (one offset per file, rule/column/hash matched).

## Progress
- [x] 1  - [x] 2  - [x] 5  - [x] 7  - [x] 3  - [x] 8  - [x] 6  - [x] 9
