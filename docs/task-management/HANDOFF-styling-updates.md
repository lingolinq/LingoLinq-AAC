# Handoff — `traci/styling/styling-updates`

Written for a fresh session with no prior context. Read this first, then
[board-picker-supervisee-pick-STATUS.md](./board-picker-supervisee-pick-STATUS.md)
for the PR material (P2 entry-point table, P5 status block, corrected evidence).

**State:** working tree clean. Branch is up to date with `origin/staging`
(0 commits behind). Dev stack is DOWN (Rails/Ember/Resque all exited).

---

## 1. Read this before trusting anything else

**Two documents on this branch are wrong, and one of them is the original brief.**

The "Supervisee board-picker pick stall" checklist (pasted in chat, not in the
repo) says the bug is a backend 400 caused by `supervise_home_board_only_update?`,
and cites `copy_board_links` as pre-existing precedent. Both claims describe code
that `ed3420526` **added on this same branch** — the branch was citing itself.
`023abd765` then claims to have fixed the stall; its guard could never match a
real request, so every pick still 400'd. Don't write a PR body from that doc; use
the STATUS doc instead.

Likewise the earlier hand-off asserted the 3 ApplicationController test failures
were pre-existing with "stack entirely inside sync-test-cleanup.js". Both halves
were false — see §4.

**Lesson that keeps repeating here: verify provenance with git before believing
any claim about what is pre-existing.** `git diff --quiet origin/staging..HEAD -- <path>`
settled three separate questions this session in seconds.

---

## 2. Commits (newest first)

| SHA | What |
|---|---|
| `6c2b843fb` | **NOT PUSHED.** Harness: run sync-heavy teardown after acceptance tests. Suite 6 fails → 3. |
| `ed548f155` | Fixed the 3 ApplicationController failures — they were ours, not pre-existing. |
| `0ad4a1124` | Hardened `board_picker_pick_in_progress`; landed the STATUS doc. |
| `402d5cc42` | Playwright as a devDependency; QA script default port 8185→8184; deleted dead duplicate. |
| `3ad5f0cfb` | The three real pick-for-home bugs (see §3). |
| `c3a4121dd` | `logs_controller` double-render; `allows?` scope argument. |
| `9e1458e58` | `allowed?` double-render in boards/users; supervise widening scoped to copies. |
| `1fe8b38e6` | Finished removing the "Shrink labels to fit" toggle (dead i18n key in 12 locales). |

**Push state is inconsistent.** Earlier commits pushed themselves without any
`git push` being run (confirmed via reflog "update by push" + `git ls-remote`);
`6c2b843fb` did not. Cause never identified — no git hooks in `.git/hooks`,
nothing obvious in `.claude/settings*.json`. **Check `git ls-remote` before
assuming a commit is or isn't on GitHub.**

---

## 3. The headline work: supervisor pick-for-home

`/board-picker?user_id=…`, supervise-only supervisor sets a communicatee's home
board. It had **never worked**, and the QA script that was supposed to prove it
could never run (it imports `playwright`; the repo committed only `puppeteer`).

First real browser execution found three independent defects:

1. `Utils.uniq(list)` threw on any one-arg call (`compare.toString()` dereferenced
   before the type check), killing `User#org_board_keys`, which
   `edit_manager#copy_board` reads before copying. Every pick died with a generic
   toast and **zero** API calls.
2. `raw_events#modalDialogClickRelease` synthesized a click for `.modal-content`
   buttons; modern `{{on "click"}}` handlers also got the native click, so the CTA
   fired twice — two copies, second `POST /boards` 400 "board key already in use",
   error shown to the user *after* a copy existed.
3. The backend guard required the payload to contain **only** `preferences`; Ember's
   `user.save()` sends the whole record (~25 keys), so it never matched.

Now verified green end to end: **27/27** on the committed QA script.

---

## 4. Test suite state

**Full suite: 1892 tests, 1851 pass, 38 skip, 3 fail.** (Was 6 fail.)

The failures were never flaky tests — they were a missing teardown. The global
`afterEach` in `tests/helpers/ember_helper.js` only runs
`teardownSyncHeavyTestHarness()` (→ `cancelHarnessAsyncWork()`, which cancels
persistence timers, drains `eventual_store`, clears `sync_actions`) for modules
matching a **name allowlist**. Acceptance modules weren't on it despite booting
the whole app, so their async work leaked into the next module, which died on a
~5s `waitsFor` timeout. Which test got hit moved with ordering — that is why it
looked like unrelated intermittent flakes:

| run | failures |
|---|---|
| baseline | ApplicationController ×3, dbman, persistence, speecher |
| board-lock excluded | modal, persistence, progress_tracker, speecher ×2 |
| with `6c2b843fb` | persistence ×2, speecher |

### The 3 remaining failures — two classes

**A. `persistence` DSAdapter ×2** — `"condition failed for more than 5500ms"`, a
`waitsFor` timeout. Which specific test trips it still moves between runs.

**B. `speecher load_beep`** — `"Died on test #1: [object Object]"`, an *exception*,
not a timeout. Fails in **every** full run, passes in isolation → deterministic
ordering dependency, not a race.

**Root cause for B is traced.** `speecher.load_sound` does `speecher[attr] = data_uri`
([app/utils/speecher.js:986](../../app/frontend/app/utils/speecher.js#L986)),
permanently rewriting the singleton's twelve default sound URLs (defined at
lines 38+). Once replaced, the early-return branches at lines 982–983
(`^data:` / `!LingoLinq.remote_url(...)`) take a different path than the test
assumes, and the unstubbed `store_url_now` fallback fires. `load_beep` loads all
twelve while the test stubs `find_url` to resolve only the beep URL and reject
the rest.

**Recommended next step:** snapshot and restore `speecher`'s sound URL attrs in
`teardownSyncHeavyTestHarness` — same shape as the fix in `6c2b843fb`. ~20 min
including one verification run. Then re-run for A, which may share the cause.

---

## 5. Environment — read before running anything

- **Node 22 is required.** npm silently ran under Node 16 once and triggered a
  failed native rebuild. Always:
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22`
- **`cd app/frontend` FIRST.** Background shell calls do NOT inherit a previous
  `cd`. Four npm/ember commands were fired from the repo root this session (all
  caught before damage). The repo root has its own `package.json` and no
  `node_modules`.
- **Never `npm install` without `--no-save --no-package-lock`** unless you intend
  to change the lockfile. A plain install bumped puppeteer inside its caret range
  to 24.43.1, which wants Chrome 148 while the cache has 147 — that breaks
  `ember test` entirely (`spawn …/chrome ENOENT`). Restored to the locked 24.42.0.
- Installed and matching the lockfile now: playwright 1.62.1, puppeteer 24.42.0.
  Browsers cached: `~/.cache/ms-playwright/chromium-1234`,
  `~/.cache/puppeteer/chrome/linux-147.0.7727.57`.
- `sqlite3@4.2.0` (transitive via `websql`) cannot build against Node 22 and does
  not load. Unreferenced by the build; does not affect serve/build/tests.
- **`.gitignore:149` excludes `docs/task-management/YYYY-MM-DD-*.md`**, so dated
  working logs are LOCAL ONLY and never reach a fresh clone. That is why this file
  and the STATUS doc have no date prefix. Three dated logs from this session exist
  locally and are not tracked.

### Running the QA script

```bash
# needs Rails :5000, Ember :8184, AND a Resque worker — copy_board_links is
# Progress.schedule'd, so with no worker the callback never fires and the home
# board is never set (presents as a frontend hang)
PORT=5000 DB_USER=tracid PGPASSWORD=password bundle exec puma -C config/puma.rb
bin/ember-server
DB_USER=tracid PGPASSWORD=password QUEUES=priority,default,slow INTERVAL=0.1 \
  TERM_CHILD=1 bundle exec rake environment resque:work

cd app/frontend
node scripts/p1-board-picker-qa.mjs --user marcus_williams_slp --pass 'demo2025!' \
  --full-pick --supervisee hannah_lee     # expect 27 passed, 0 failed
```

Test data already exists: `marcus_williams_slp` (1_5) supervises `hannah_lee`
(1_14) with **supervise:true, edit:false** — the exact shape the bug needs. Reset
between runs:

```ruby
c = User.find_by_path("hannah_lee")
Board.where(user_id: c.id).where("created_at > ?", 24.hours.ago).each(&:destroy)
c.reload; c.settings["preferences"].delete("home_board"); c.save
```

Backend specs: `bundle exec rspec spec/controllers/api/{boards,users,logs}_controller_spec.rb`
→ 669 examples, 0 failures.

---

## 6. Outstanding

**Before a PR opens**
- P2 entry-point table exists in the STATUS doc but needs Scot's sign-off — the
  supervise-for-copy widening is a real authorization change.
- Push `6c2b843fb`.

**Engineering, own PR**
- 23 bare `allows?(@api_user, '…')` calls in `app/controllers/` missing the scopes
  argument. **Assessed: these fail CLOSED**, not open — bare `allows?` uses raw
  `permission_scopes` and appends `'*'`, which never intersects the `'full'` that
  permission rules require, whereas `allowed?` normalizes blank/`['*']` → `['full']`.
  So they are **availability bugs, not vulnerabilities** — they deny integration
  and dev-key devices. Deliberately not bulk-edited; several need per-site judgment.
- The 3 remaining test failures (§4).
- `copy_board_links` "protected vocabulary owner" spec flakes ~1 in 4 (pre-existing,
  unrelated).
- Board-detail boots ~30s under test; `resume_scanning` retries 10× per `visit()`.
  Makes two-boot acceptance tests need `assert.timeout(120000)`.

**Closed as not-reproducible**
- `400: Not authorized (GET /api/v1/boards?user_id=1_7)` during picker load. All
  variants return 200 on an authenticated session; `1_7` is a legitimate supervisee
  with full permissions. Most likely a stale Redis permission-cache entry.

**Product decisions — need Traci, not code**
- Four labels still truncate at 667×375 (recommendation: accept as a density limit;
  don't go below the 9px floor).
- The 3-line change leaves a ~2.7px symbol on tiny cards (recommendation: cap the
  label at ~70% of card height — an invisible symbol is worse than a clipped word
  for pre-literate users).
- Consent-page CTAs were removed (recommendation: restore or get explicit sign-off;
  it's a legal surface).
- Two missing regression specs: cancelled touch/blur, and label truncation at N
  viewports.
