# Offline boards and sync (2026-11-05)

Branch `traci/fix/offline-boards-sync`, from `develop` at `d5966fc2b`. Goal: boards work offline
end to end, ending in one PR. Scot's offline app shell (`feat/scot-offline-app-shell-7a29ac97`) is
to be merged in once he pushes it; it is local to his machine, so work starts from `develop`.

Learnings grepped (`LEARNINGS.md`, `learnings-archive/`) for offline, board-detail,
board_detail_cache, persistence, prime_caches. Used: `findRecord` is offline-first
(LEARNINGS.md:93); `persistence.ajax` rejects `{fakeXHR, message, result}`
(archive 2026-10.md:493).

## Order of work

1. #1213 Modern board page reads the device (this section).
2. Other-owner boards: the parent `user` route fails offline. Touches `routes/user.js`, so it
   follows Scot's merge.
3. #1209 and the unsynced-folder dead end.
4. #1201, #1212, #1221 sync completeness.
5. #1034, N of M reporting, `all_reload`.
6. iPad web pictures (`prime_caches` without file storage).
7. mobile #3 and #1229 after a real-iPad test.

## Unit 1: #1213

### Fact sheet

(a) Where the board is read.
- CONFIRMED `routes/user/board-detail.js:119-127`: `model()` reads only `boardDetailCache`, an
  in-memory cache with a 5-minute TTL (`utils/board_detail_cache.js:27`). So besides cold starts, a
  board that was open online also fails offline once its entry is 5 minutes old.
- CONFIRMED `:300-322`: a miss reads `/tree?root_only=1`, then `/boards/<key>`, both network only.
- CONFIRMED `:526-542`: the grid is built from `_raw_board_data` through `_build_from_raw`, not from
  the record. `_build_from_raw` reads `raw.buttons`, `grid`, `id`, `key`, `image_urls`, `images`,
  `locale`, `translated_locales`, `translations` (`controllers/user/board-detail.js:2075-2700`).
- CONFIRMED `services/persistence.js:369-460`: `persistence.find('board', key)` resolves
  `record.raw`, which is the board JSON `sync` stored (`:2975`), the same shape
  `normalize_board_payload` produces for `handleRoot`. Device evidence: #1213 probe; `image_urls`
  is present in stored rows (bounded-reads log, 150.6 MB of it).

(b) Every shape of the rejection the route sees.
- `{offline: true, error, short_circuit: true}`: `persistence.ajax` while `online === false`
  (CONFIRMED `services/persistence.js:3942`).
- `{fakeXHR: {status: 0}, message, result}`: network failure or timeout with `online` true.
  `fakeXHR` reports 0 for a falsy `xhr.status` (CONFIRMED `utils/extras.js:148-150`, `:423`).
- `{fakeXHR: {status: 4xx|5xx, ...}, ...}`: a server answer (CONFIRMED same lines). This API
  answers a permission denial with 400 (CONFIRMED comment `routes/user.js`, `application_controller#allowed?`).
- `{stack, fakeXHR, message, result}`: an error in a 200 body (CONFIRMED `utils/extras.js:323`).
- `isDefinitive` (`:266`) reads `err.status`, which none of the three real server shapes carry
  (CONFIRMED). So today a real 404 or 400 is retried once. Harmless today, but a device fallback
  built on that check would serve a local copy after a real denial. The fallback must read
  `err.fakeXHR.status`.

(c) Cross-file claims.
- CONFIRMED `utils/board_detail_cache.js:194-200`, `:742`: prefetch and warm paths stop themselves
  when offline.
- CONFIRMED `controllers/user/board-detail.js:8730-8738`: a folder with a `/` key goes through
  `_preferred_board_detail_key` (`store.findRecord`, offline-first) to this same route, so folders
  are covered by the route fix.
- CONFIRMED `:8762`: a folder with only an id uses ajax. Not changed here; see open questions.
- CONFIRMED `routes/user/board-detail.js:639-645`: `cached_unless_revoked` is the existing offline
  revocation gate; the local read must pass through it.

### Candidates (as first proposed; see "Review outcome" for what shipped)

A (recommended). When the last fetch gives up with a shape that means "no server answer" (offline
short circuit, or `fakeXHR.status === 0`), read `persistence.find('board', board_key)`. On a hit: set
`_raw_board_data`, normalize and push to the store as `handleRoot` does, pass through
`cached_unless_revoked`, resolve. On a miss: the existing `{error, boardname}`. Do NOT write to
`boardDetailCache`, so a device copy is never served as a fresh entry after reconnecting, and do not
start the background tree warm.

B. `store.findRecord('board', key)` as the issue suggests, then rebuild raw from the record.
Rejected: `_build_from_raw` needs the raw JSON, and the record does not expose all of it.

C. Check `persistence.online` first and skip the network. Rejected alone: it misses `online` true
with no route (no-internet Wi-Fi), the case A gets for free.

D. Offline, send Modern users to the legacy board page. Rejected: a surprise UI change for AAC users.

5xx is excluded on purpose: a server error while online keeps today's error page with its retry.
Open to review.

### Risks

- A stale device copy can show while online but unreachable; it is replaced on the next successful
  load because it is never cached.
- With `online` true and a hanging connection the fallback comes after /tree, show and the retry,
  up to about 24 s (8 s GET timeouts, `utils/extras.js:186-189`).
- `persistence.find` records `known_missing` on a miss; `store` clears it (`:712`).

### Open questions

1. Can `user.board-detail.edit` now open on a device copy offline, and does saving behave?
2. Is a folder with only an id reachable? If yes, it needs the same read.
3. Does anything need `local_result` on the raw, as the adapter sets (`services/persistence.js:4395`)?

### Test

New `tests/unit/routes/board-detail-offline-test.js`, through the real route `model()` with
`lingoLinqExtras.storage` faked as in `board-view-revoked-test.js`:
- offline, not in memory, on the device: resolves the record; `_raw_board_data` has the buttons.
- `fakeXHR.status` 0 with `online` true: same.
- offline, not on the device: the error state.
- real 400 and 404 with `online` true and a device copy: the error state, device not read.
- offline, marked revoked: the error state.
- device copy never enters `boardDetailCache`.

Mutations that must fail: remove the fallback; widen the check to any failure; write to the cache.

### Review outcome (2026-11-05, `/adversary-review` agent at `d5966fc2b`)

The first proposal was blocked; candidate A survived with conditions. Each finding below was checked
in the code before it was applied.

Corrections to the fact sheet above:
- The hang risk was wrong: a timed-out GET is tried at 8, 20 and 20 s (`utils/extras.js:188-190`,
  `:362`), so three calls take about 148 s, not 24 s.
- "Same shape" was too strong: device rows have no sibling `images` or `sounds`. The grid still works
  from `image_urls`.
- `warm_images` and `prefetch_linked` have no online guard (`utils/board_detail_cache.js:618`, `:690`).
- Line cites in (a) and (b) are off; the current ones are `:121-133`, `:235`, `:274-294`.
- The revocation gate does nothing when `online` is true (`utils/board_revocation.js:637`).

Applied:
- Excluding 5xx was wrong: the adapter and Basic view already fall back on it
  (`services/persistence.js:4485-4493`), so 5xx now falls back.
- 8-second deadline when a device copy exists (`DEVICE_COPY_WAIT_MS`), so a hang does not hold a
  board back. A late answer is cached for the next visit and does not swap the board on screen.
- Failures are latched across all attempts. The decision reuses `route_refuses_local`, so Speak Mode
  and home and sidebar boards keep their copy; a 404 on any attempt is the error page.
- The revocation gate is forced to offline on this path.
- A record already in memory is kept. An expired session copy is read through the new
  `boardDetailCache.peek`, and the newest of it and the row wins.
- Device copies are read-only: `sync_changed` has no conflict check (`services/persistence.js:3608`),
  so an offline edit of an old row could overwrite newer server work. Checked in the edit route,
  the one place every entry passes.
- `reload_on_connect` replaces a device copy on reconnect, except in Speak Mode, where it refreshes on
  the next board.
- No warm or prefetch on a device copy. A row without `buttons` is a miss. A row the store cannot take
  is a miss.

Answers to the open questions: edit, see above. An id-only folder is reachable only through the API or
old data; moved to unit 3. `local_result` has no reader, so it is not set.

Line-number constraint: `.eslint-todo` keys rows by line, so `model` was renamed in place to
`_model_from_cache_or_server` with same-line-count edits, and new code sits below the last baselined
row. The baseline is unchanged.

### Verification

- Red first: 11 of 15 route tests failed on unchanged code; the other 4 are negative cases.
- Targeted run, filter `device.copy|board views and revoked|cold boot|reload.on.connect|board.detail`:
  244 of 244. `eslint-todo-gate`: 0 new findings. Full suite not run (left to CI).
- Mutations, each red: gate reads `online`; no in-memory check; memory copy unused; no deadline; edit
  check removed; 404 check removed; reconnect ignores Speak Mode. Run alone because the combined run
  was ambiguous: late-answer guard; `/tree` failure not latched.
- Two test mistakes, both fixed: stubbing the `utils/persistence` proxy (LEARNINGS.md:248), and using
  the real service, whose `online` reaction hung later modules at `settled()`.

### Not verified, carried forward

- NOT run on a device or emulator. #1213's acceptance needs: Wi-Fi off, cold start, Speak Mode opens
  the home board, buttons speak with pictures, folders work; on iOS and Android.
- A cold boot straight onto a board-detail URL still fails in the parent `user` route, own boards
  included (`routes/user.js:50-56`, `adapters/user.js:9-15`). Native starts at `/`, so it passes there;
  Scot's shell makes this reachable on the web. Unit 2 must cover own boards too.
- A device read that never settles because extras never become ready (`services/persistence.js:371`)
  would still leave the page loading.
- A late answer for a previous board can still overwrite `_raw_board_data` if the current board came
  from the server. The race is pre-existing; the deadline makes it a little more likely.
- 429 is treated as no answer. Decide if that is right (a school NAT shares one throttle bucket).
- `board_edit_needs_connection` is in `en.json` only; run `i18n_generator.rb` once at the end of the
  branch.
- Status 0 meaning "no answer" is unconfirmed on a native build.

### Code reviews at `523461eaf` (2026-11-06): BLOCKED, not ready to merge

The earlier review covered the proposal only. Two independent reviews of the committed code ran after
Traci asked; `/review-pr` has not run. Adversary verdict: block on a High.

Corrections to claims above and in commit `cf3cfeac6`:
- "Replaced on reconnect" is false. The Modern page forces Speak Mode on for everyone
  (`routes/user/board-detail.js:577-579`, `services/app-state.js:3493`), so the branch in
  `utils/reload_on_connect.js` does not run on the page; the test used a state the page never has.
- The Speak Mode exemption reads as "the communicator keeps a voice", but on Modern it covers every user
  after the first board, so denial and revocation checks hold only on first entry.
- "Opens for speaking only" is false: the share modal saves a device copy (`components/share-board.js`).
- "A record in memory is kept" protects identity only; `_build_from_raw` writes the older buttons onto it
  (`controllers/user/board-detail.js:2182-2185`).
- Online past 8 s is a regression: the device copy wins silently, read-only, when the server may answer
  moments later.

Findings to fix regardless of decisions: per-navigation token (High: an abandoned navigation can paint
one board's words under another's title); clear the flag on exit; arm the deadline whatever `online` says;
late refusal after the deadline; `local_db_is_current_user` plus a signed-in check before the device read;
timeout on the device read; `usable_copy` on server answers; 404 in a 200 body; the test gaps listed by the
review. Decisions for Traci: Speak Mode exemption, shared devices, notice for device copies, reconnect
behaviour, share and other actions on a device copy. Not verified: production value of
`auth_spa_transition`. Merging #1268 does not fix `online` true cold boots.
