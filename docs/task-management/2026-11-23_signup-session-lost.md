# 2026-11-23 Native sign-up leaves the user logged out (#1204)

## Reproduction (develop 3ccf3003e, iPad Air 13-inch simulator, shell master 85e66a8, local Rails)
Real `routes/register.js` saveProfile, with a probe logging call order (names only, no token values):

| ms | Event |
|---|---|
| 7865 | `override`, meta carries access_token, user_name, user_id |
| 7866 | `restore` (no token) starts `get_db_id`, which waits on a native `stat` of `db_stats.json` |
| 7866 | `flush`, `setup`, `persist_object auth_settings`: stored; `reload('/')` |
| 7868 | `get_db_id` answers; `invalidate()` runs, now sees a stored login, so it is a FULL logout |
| 7868 | flush erases `auth_settings`, sets `lingolinq_just_logged_out`; second `reload('/')` |
| boot 2 | no `auth_settings`, `isAuthenticated` unset, landing page (9 s later still so) |

## Fact sheet
- (a) READ. `restore` (`services/session.js:556-588`) decides "session lost" from `store_data` read BEFORE the
  lookup, then runs `do_it` after `stashes.get_db_id`. `invalidate` (`:811`) re-reads the stored login at that later
  time and treats it as the one to end. CONFIRMED (code and trace).
- (b) SHAPES when the recovery fires. CONFIRMED: nothing stored (`invalidate`, not full, harmless on web); a stored
  login with no token (`force_logout` at once); a `db_id` from the lookup (the authDBID cookie, or
  `kvstash.values.user_name` when the lookup rejects: `force_logout`); a login stored while waiting (`override`,
  or `confirm_authentication`, `:98`).
- (c) Cross-file. CONFIRMED: `override` has two callers, `routes/register.js:116` and `routes/index.js:371`;
  both always reload afterwards. Existing test `tests/utils/session-test.js:480` stubs `restore` and expects
  its return value merged into the stored data, so it cannot see this. On the web `get_db_id` resolves at once
  (`services/stashes.js` get_db_id, last branch), so the recovery ends before anything is stored.
- The issue's "no db_stats.json write": `utils/_stashes.js:16` and `services/stashes.js:17` each keep their own
  `stash_capabilities`. The only `setup_database` call (`utils/capabilities.js:218`) runs before the service exists,
  so it connects the legacy copy and the service's stays null: no write at sign-up or login (CONFIRMED by the trace).
  `get_db_id` does start the read (it uses the passed `cap`) but discards the content. Separate gap, not fixed here.

## Proposal
1. `override` marks the session as being replaced before anything else; the lost-session recovery does nothing
   while that mark is set, checked both on entry and again after the lookup. The page reload drops the mark.
2. After the lookup, the recovery re-reads the stored login and stops if a token is there now (covers a login
   by `confirm_authentication` during the wait).

Alternatives:
- `override` reads the stored data without calling `restore`. Simplest, but leaves a recovery that an EARLIER
  restore started (tests 2 and 3), and fails the existing test above, which needs `restore`'s return value merged.
- Only part 2. Fixes the trace, but not a lookup that ends during `flush`, nor a stored login with no token.

Risks: a mark left set would hide a real lost session, if `override` never reloads. `flush` and `persist_object`
both resolve on a timer (1.5 s, 500 ms), and the recovery is the only reader.
Must use restore's own expression for the re-read (stash, else fallback): `invalidate` reads the fallback too.

## Proposal review (local adversary, read-only): approve with changes, all applied
Re-read includes the fallback; tests extended (earlier restore pending, remembered user, in-memory login); one test used
an unreachable state and was replaced; the fact sheet above corrected. Pre-existing, not changed here:
- `override` merges the PRIOR session, so a sign-up while masquerading or modeling keeps `as_user_id`,
  `original_user_name` and `modeling_session` under the new token (Medium, CONFIRMED by reading).
- `invalidate` does not clear `auth_settings_fallback_data`, so after a logout with no reload `restore` might bring
  the signed-out user back (Medium, PLAUSIBLE, not reproduced).

## Verified
- `tests/unit/services/session-override-recovery-test.js`: 12 pass; 11 of 12 fail on the original code (the other is
  the control, a really lost session still recovers).
- Mutations, each red: no entry check (1 test), no after-lookup check (2), no re-read (2), no fallback in it (1).
- `--filter session`: 289 tests, 288 pass, 1 todo, 0 fail. `lint:js:ci`: same counts (5 new) with and without the change.
- iPad Air 13-inch simulator: signed up, logged in after the reload, logged in after a cold restart.
- Android 15 phone emulator: the same (the bug itself was not reproduced there first). Both against local Rails
  with synthetic accounts, with the sign-up form submitted by script through the real route action.
- Web sign-up (production build, headless Chrome, fresh profile): `override` and one reload, no `invalidate`; logged in
  after it and after a page reload. With the stored login then removed, a reload lands on the login page.
- Not run: a physical device; the full Ember suite locally (load average 19 with other sessions building; left to CI).

## Canonical review (on 7bb70f846)
`REVIEWED=range origin/develop (03a5dacf8b3b96a260cd308a120789144c93289d) ... traci/fix/signup-session-lost (7bb70f84656fb0d228ec6622ec9981769383355b) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC-signup-session`
- Senior-dev (`/review-pr`): approve with comments; no Critical or High. Its Medium (a plain login has no mark) was
  checked and does not apply: `confirm_authentication` persists first, with no flush before it (`session.js:98`), and
  `flush` removes localStorage in the same tick as the re-read, so no login can be stored between check and erase.
- Adversary: ship, on condition the learnings file is merged with develop (done). Two Low, pre-existing: a plain login in
  the tick after `flush` can lose in-memory state (the stored login survives); the force-logout dialog's button ends
  whatever login exists when it is pressed (`components/force-logout.js:41`).
