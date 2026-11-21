# 2026-11-16: token_check none sentinel (PR #1323 follow-up commit)

PR #1323 (Omer, KAN-124, part of #1033) moved the session token out of the `GET /api/v1/token_check`
URL into the `Authorization` header, and added `session_controller.rb:602` so a header-only check
validates. The Codex review of 21d47de raised one P2 (thread 4581964098): with no stored token, the
check could authenticate a stale in-memory token. Commit 74955995b, pushed to Omer's branch at Traci's
request, restores develop's answer for that case. #1323 merged to develop 2026-11-19 (dcf48b262).

This log was written after the commit, to record the fact sheet, the reviews and the falsification runs.
The facts below were read at 21d47de (the PR head before the fix) and at 74955995b.

## Fact sheet

- **Where the header is set:** the global ajax override in `app/frontend/app/utils/extras.js:221-238`
  (write at `:238`). It writes `Authorization: Bearer <token>` from `capabilities.access_token`, then
  `session.access_token`, then the `auth_settings` stash. It replaces any `Authorization` the caller
  passed. CONFIRMED at 21d47de. On develop after #1322 the lookup is `request_token` in
  `utils/request_identity.js`, same order.
- **Where the server reads the token:** `application_controller.rb:147-157`. The query `access_token`
  wins; `'none'` or blank counts as missing, and then the `Authorization` header is used. CONFIRMED.
  `token_check` (`session_controller.rb:599-603`) validates `params['access_token']`, and line 602
  copies the header token in only when the query value is blank. `'none'` is not blank, so it stays
  `'none'` and `valid_token?('none')` is false. CONFIRMED.
- **Shapes of the no-stored-token case:**
  (a) No token anywhere: no header, unauthenticated branch. Same before and after.
  (b) No stored token, but `capabilities` or the session still holds one (another tab signed out and
  its DELETE failed, or the 2FA-pending token in `login-form.js:296-302`): the wrapper adds it as a
  header. Develop sent `access_token=none` and failed closed. At 21d47de the query was blank, so
  line 602 accepted the stale token. CONFIRMED.
- **The fix:** `session.js:242` sends the literal `access_token=none` when no token is stored. Real
  tokens still never go in the URL. The request for case (b) is the same as develop's.

## Reviews

- Dual review of 21d47de (session code is on the dual-review list): `/review-pr` and an adversary
  pass, both approve with comments. Posted on the PR.
- Adversary review of the written fix proposal (option A, the sentinel, against option B, a
  wrapper opt-out): proceed with A, with changes. Edits line-neutral above `.eslint-todo` rows, a
  positive header control in the wire test, a corrected comment, and two RSpec examples.
- Adversary review of the finished commit: push as is. Its two wording fixes went into the commit.
- Codex re-review of 74955995b: "Didn't find any major issues."

## Falsification (2026-11-16, Node 22, Chrome 147)

- Ember `--filter "should send the none sentinel"` at 21d47de with the new test: failed on the
  sentinel assertion (actual -1, expected 0), and the `Bearer stale_token` precondition passed.
- `session.js:242` reverted to `?rnd=` only: 2 of 17 `check_token` tests fail (the new test and
  `should query remotely`). Sending `access_token=none&` always: 5 fail. Restored: 17 of 17 pass.
- RSpec `-e token_check`: 13 of 13 pass. Removing `&& params['access_token'].blank?` at line 602
  fails only `session_controller_spec.rb:1234` (the `none` example). Making the header win over the
  query fails only `:1243` (the query-wins example).
- `npm run lint:js:ci`: new=0.

## Lessons

Distilled into `learnings-archive/2026-11.md` (2026-11-16 entries).
