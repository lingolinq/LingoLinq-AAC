# First sync on a new account: failed on the avatar, no new status view, and 100% at once (2026-11-16)

Report (Traci, real Android phone, dev, new account `tracitest`):
1. The first sync at sign-in: "Error syncing tracitest: promise timed out: sync user data", "Boards: 0 downloaded,
   7 updated, 6 cached". The new grouped view did not show; the old technical list did.
2. A manual sync from Extras then succeeded, but Sync Details said "100% ready offline" from the start, while it ran.

Learnings consulted: LEARNINGS-2026-01_to_2026-09.md (none on sync status); the #1322 logs
(2026-11-14_android-sync-slow-problems.md: the proxy route for pictures, 8 s then 20 s retries).

## Fact sheet

### A. The first sync failed on the profile picture
- CONFIRMED: "sync user data" is `time_promise(sync_user(...), "sync user data")` with the default 30 s
  (`services/persistence.js:2271`, `time_promise` :28-42).
- CONFIRMED: `sync_user` (:3451-3502) reloads the user (own 5 s limit, :3458), then `store_url_now(avatar_url)` with no
  limit of its own; any failure other than storage-full rejects "failed to save user avatar" (:3491-3501). So only the
  avatar download can outlast 30 s.
- CONFIRMED: a new account's avatar on dev/staging/prod is `https://<STATIC_S3_BUCKET>.s3.amazonaws.com/avatars/avatar-N.png`
  (`app/models/user.rb:2268-2302`). That bucket sends no `Access-Control-Allow-Origin` (curl, 2026-11-16), and it is not
  in `store_url_now`'s direct list (`cors_match`), so the download goes through `/api/v1/search/proxy` (the route
  measured in the #1322 log at up to about 49 s on the client, no outbound limit on the server).
- ASSUMED (not load-bearing): that the proxy was what stalled on Traci's phone. Dev logs not read (no gcloud here).
  The fix does not depend on it: whatever stalls, a profile picture must not fail the sync.
- CONFIRMED, same class: `sync_contacts` (:2514-2535) saves supervisors' and contacts' pictures inside plain
  `function` callbacks that call `this.store_url_quick_check` / `this.store_url_now`; in this ES module `this` is
  undefined there, so any supervisor or contact with a remote picture throws. And `RSVP.all_wait` rejects on the first
  failure (`utils/misc.js:147-159`), and the sync rejects on any step error. Either fails the whole sync.

### B. No new view after a failed first sync
- CONFIRMED: Sync Details draws the cards and "% ready offline" only `{{#if this.summary}}` (`components/sync-details.hbs:14,
  55, 80`); `summary_for` (`utils/sync_rollup.js:132-144`) uses `last_result`, which skips errored and canceled entries
  (`utils/sync_log_store.js:122-131`). A new account's only sync errored, so: no summary, no cards; the old technical
  list (`sync-details.hbs:169-215`, "Boards: %{num} downloaded,") is all there is.
- CONFIRMED: the drawer calls `summary_for(..., {latest_only: true})` (`components/sync-progress-drawer.js:67`); for a
  failed sync its stage is 'result' whatever the summary (:21-27), but for a canceled one a summary would turn 'result'
  into 'attention'. So the change below applies to Sync Details only (no `latest_only`).

### C. "100% ready offline" from the start of a re-sync
- CONFIRMED: while syncing, the summary is `rollup(sync_progress.board_statuses + errors)` (`sync_rollup.js:134-135`):
  only the boards reached so far. `overall.pct = saved / total` over those (:106-112). On a re-sync every board is
  already on the device, so the first board reached is 1 of 1: 100%.
- CONFIRMED: the sync keeps `sync_progress.total` = visited + to_visit across walks (`services/persistence.js:1972-1988`).
  It grows as linked boards are found. The last clean sync's rollup total is a second estimate.

## Proposal

1. `sync_user`: the avatar gets its own limit (15 s, so user reload 5 s + avatar 15 s stays under the step's 30 s) and
   never fails the sync: on any failure except storage full it resolves (the picture is retried next sync; the app
   already falls back when it is missing, `avatar_url_with_fallback`). Storage full still fails, as today (boards
   cannot save either).
2. `sync_contacts`: use the service, not `this`, and make each contact picture best-effort with the same limit
   (storage full still fails).
3. `summary_for` without `latest_only`: when there is no clean result, use the newest entry that has board rows
   (errored or canceled), marked `failed` / `canceled`. Sync Details then shows the cards for what that sync saved, under
   its existing "Sync Failed" line. The drawer is unchanged.
4. While syncing: `overall.pct` = saved / max(rows so far, `sync_progress.total`, the last clean sync's total), and at
   most 99 until the sync ends. `total`, `saved` and `missing` are unchanged (the text line and the drawer use them).

Rejected: a longer "sync user data" limit (the picture still fails the sync, later); serving the default avatars from
the app (`public/avatars/avatar-0..9.png` exist) instead of S3 (a server change to `generated_avatar_url` that affects
emails and every client; worth doing as its own change, does not fix contacts or any custom avatar on a slow host);
CORS on the static bucket (infra; same limits).

## Risks and open questions

- An avatar that keeps failing is silently not offline; the header falls back to the default picture.
- Fix 4's estimate can still jump (a new account has no earlier total; to_visit grows as folders are found). Capped
  at 99 so it never claims done early.
- Speak Mode: decided by Traci (2026-11-16): nothing may interrupt Speak Mode, so no sync status shows there; the sync
  must keep running in the background. Unchanged here; e2e/sync.spec.js "using the board during a sync" checks that the
  sync is not cancelled through Speak Mode.

## Tests (red first) and mutations

- persistence-sync: the avatar download never answers (or rejects) → the sync still succeeds (mutation: restore the
  reject → red; drop the time limit with a never-answering download → the step times out, red).
- persistence-sync: a supervisor with a remote picture whose download fails → the sync succeeds and the picture was
  attempted (mutation: put back `this.` → TypeError, red).
- sync-rollup: an errored-only log → summary with `failed` and the rows; with a clean entry earlier → that one; with
  `latest_only` → null as today (mutation: drop the fallback → red).
- sync-rollup: syncing with 1 cached row, `sync_progress.total` 13 → pct 7, not 100; all rows saved while syncing →
  99 (mutations: drop the max → 100, red; drop the cap → 100, red).

## Review (adversary, 2026-11-16) and what was done

Verdict: proceed with changes for 1 and 2; rethink 3 and 4. Checked each finding myself.

- Items 1 and 2, done (`utils/optional_picture.js`; `services/persistence.js` sync_user, sync_contacts, sync_tags,
  line-neutral, the import last). With the review's conditions: `sync_tags` had the same `this` bug (:2493) and is fixed
  here; contact pictures go through the `store_url` queue (one at a time on Android) instead of starting at once; tests
  added for the mutants it listed (contact picture never answering, contact quota, user reload failure still failing,
  the limit under 25 s). The `utils/persistence.js` twin is unreachable for sync (the review traced every call through
  the Proxy to the service), so it is not edited.
- Corrected risks: `quota_maxed` is also set when file-system permission is refused (:1803-1814), when boards still
  save to the database; that case still fails the sync, as before this change (not made worse). A quota error after the
  15 s limit is dropped. The header's avatar has no offline fallback (`models/user.js:378-383`, `nav-bar.hbs:21`):
  a picture that never saved shows broken offline; pre-existing, not changed here.
- Reach: in deployed environments every sync of a communicator with a supervisor failed in `sync_contacts` (the
  `this` throw); local dev and e2e use relative `/avatars/` paths, so neither reproduces A. Needs a check on dev after
  merge with a communicator who has a supervisor.
- Items 3 and 4: held for Traci. (3) A failed sync's rows stop at the first failing step and carry no failures, so its
  cards would read "100% ready offline", the overclaim `tests/unit/utils/sync-log-store-test.js:134-143` forbids.
  (4) Traci decided on 2026-11-11 "a moving bar, not a percentage" while syncing (`sync-progress-drawer.hbs:12`); the
  proposed percentage mixes units, moves backward (simulated 99 → 3 when a supervisee walk starts) and disagrees with
  the text beside it. The red tests for 3 and 4 are set aside, not committed.
