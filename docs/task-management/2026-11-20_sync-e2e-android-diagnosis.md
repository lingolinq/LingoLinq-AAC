# Sync e2e suite: the Android Chrome failures (2026-11-20)

Session work that finished and opened PR #1345 (the offline sync e2e suite, merged 2026-11-21 as `e0b8ae7c3`).
Handoff: `~/offline-sync-handoff/HANDOFF-2026-11-19.md` section 1.

## Starting point

A run of the suite against develop 9d96df96f (#1334): desktop Chrome, Firefox and Safari, iPhone and iPad 9/9;
Android Chrome (Pixel 7 profile) 8/9. "The link drops during a sync and comes back" (scenario 3) failed with
`button image failed to sync, .../sync-e2e-basic-home-1.png`. The run's trace had been overwritten by the
later projects' runs, so the scenario was re-run alone.

## Failure 1: scenario 3 on Android Chrome (test setup)

- Reproduced 3 of 3 (`--repeat-each=3 --trace=on`).
- The trace shows `home-6.png`: its direct download was aborted while the link was down
  (`net::ERR_INTERNET_DISCONNECTED`), then its fallback to `/api/v1/search/proxy` reached the server after the link
  came back. The server fetched the real CDN, where the test pictures do not exist, and answered 400
  "File not retrieved, status 403". The server log shows the same.
- The app treats a 400 as a real failure, not a passing one (`utils/sync_board_fallback.js` `passing_failure`), so
  `judge_content` reported the board instead of parking it. That is correct app behaviour; in production the proxy
  fetches the real picture.
- Why only Android: `store_url` runs one picture at a time on Android (`max_watchers = 1`, desktop 3), so the queue
  was still emptying when the link came back.
- Fix (test setup only): `routePictures` in `e2e/support/sync.js` also answers the proxy for the picture host, cut
  off and delayed like the link, with the proxy's JSON shape. After: 3 of 3 passed and the server received no proxy
  requests for the test host.

## Failure 2: scenario 7 on Android Chrome (test setup)

- The full six-project run after fix 1 failed "using the board during a sync" once on Android Chrome: the
  "Larger screen recommended" overlay blocked `tapCell`'s click until the 10-minute test timeout.
- The overlay appears only after the buttons are measured, which waits for resizing to settle
  (`controllers/user/board-detail.js` `portrait_overlay_eligible`). `tapCell` checked for it once, before it appeared.
- Fix: `page.addLocatorHandler` taps "Continue Anyway" whenever the overlay appears. After: scenario 7 passed 3/3 on
  Android Chrome and 1/1 on desktop Chrome and iPhone, and the full Android Chrome project passed 9/9.

## Also found, not fixed

A failed board's error names the board's first failed picture (`home-1`, retryable), not the one that caused the
failure (`home-6`, the 400): `utils/board_content_retry.js` `judge_content`, `res.fail = required[0]`. Display only.
Added to #1341.

## Lint

The two fixtures with no dependencies (`syncLink`, `pictures`) use Playwright's required `({}, use)` form, which
`no-empty-pattern` flags in CI's `lint:js:ci` gate. Traci chose inline `eslint-disable-next-line` comments with the
reason (2026-11-20).

## Result

#1345: desktop Chrome, Firefox and Safari, Android Chrome, iPhone and iPad all 9/9; the Android emulator project was
not run. Codex connector review: no findings. Data-bearing check: passed without a label.
