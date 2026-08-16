# PR body — SLP report on the full eval (branch `traci/styling/checklist`)

Target: `staging`. Written per CLAUDE.md PR Preflight P1–P6. Not date-prefixed, so
it is committed and survives hand-off (`.gitignore:149` excludes `YYYY-MM-DD-*.md`).

---

## Scope — read this first

**The branch name is wrong for what this contains.** It is named `styling/checklist`
and it began as the SLP-facing report for the full eval. Verifying that feature
uncovered a chain of unrelated, pre-existing faults, and fixing them was the only way
to demonstrate the feature works at all — nothing had reached the server from the web
app since 2026-06-01.

So this PR carries, deliberately:

| Area | Why it is here |
|---|---|
| Eval report + workbook (the actual feature) | the original scope |
| Ember adapter request encoding | no log/eval push could persist without it |
| `logs_controller#create` user resolution | blocked every push with a misleading 400 |
| `LogSession` event normalization + eval fork identity | data loss, then record ambiguity |
| Login / permission cache (`passwords.rb`, `permissions.rb`) | every login poisoned the shared cache, which blocked the click-test |
| Board preview "pick" wiring | the report's own CTA could not do what it said |

Splitting it after the fact would produce a stack of PRs that cannot be tested
independently — each fix is only observable once the one beneath it is in place. That
was a deliberate call, not drift. If you want it split anyway, the natural seam is
"log pipeline" (`a77968512`, `6df5b1bbc`) vs "eval report" (everything else), and the
log-pipeline half must merge first.

11 commits, 39 files vs `staging` at time of writing, plus the uncommitted
preview/fork work described below.

---

## Fix status (P5)

| Item | Status | Evidence |
|---|---|---|
| Full-eval SLP report (recommendation, feature match) | Fixed | `eval-full-report.{js,hbs}`, `eval_full_recommend.js`; hand-checked against a faithful fixture |
| Fillable funding/IEP workbook, saved onto the eval | Fixed | `eval-workbook.{js,hbs}`, `eval_workbook.js`; browser round-trip below |
| Queued logs never pushed (`stashes.online` undefined) | Fixed | `a77968512` |
| Every write form-encoded since 2026-01-18 | Fixed | `adapters/application.js`; `content-type: application/json` captured in-app |
| `log[user_id]=""` treated as a real lookup | Fixed | `logs_controller.rb:185`, 3 specs |
| Index-keyed event Hash killed the background job | Fixed | `LogSession.normalize_events`, spec |
| Workbook accepted one character per field | Fixed | `09fdd0fe1` |
| Every login asserted valet mode, poisoning the permission cache | Fixed | `cb6a37324`, `passwords_spec` 39/39 |
| Two wrong-account paths in the report | Fixed | `7247b8cf5` |
| JSON scalar contract untested by construction | Fixed | `5228c36cc`, 9 specs, 6 negative-controlled |
| "Preview & choose for `<user>`" had no choose | Fixed (uncommitted) | see D2 below |
| Non-author eval fork duplicated `ref_id` | Fixed (uncommitted) | see D1 below |
| `same_author` never invalidated on session change | Fixed | `user/log.js`, 3 specs, negative-controlled |
| i18n generation blocked (6 keys invisible to the parser) | Fixed | 0 dups / 0 missing / 8197 strings |
| `i18n_generator.rb` unusable without a UTF-8 shell locale | Fixed | runs with `LANG`/`LC_ALL` unset |

---

## The two defects found by the P0 walkthroughs

Both were found by executing the flows in a browser against a running stack, not by
reading code.

### D1 — a non-author's eval fork inherited `ref_id`

The workbook is read-only for non-authors in the UI
(`eval-workbook.js#isAuthor`), and that holds completely: the banner names the author
reason, the fields are `disabled`, typing is a no-op, no save control renders, and the
page issues no writes. But it is a client flag. Replaying the author's *exact* captured
request body under the communicator's token (hannah_lee, who legitimately can view her
own eval) produced a second eval carrying the **same `ref_id`**.

That is the part that matters: `utils/eval#find_saved_log_id` matches on `ref_id`, takes
the first hit, and its own comment calls the matching STRICT — it deliberately has no
"just take the newest" fallback, precisely so a workbook never attaches to the wrong
evaluation. Two records answering to one `ref_id` defeats that for **both** accounts.

The fork itself is **intentional** and stays — `log_session_spec.rb:1171` specifies that
an eval resumed by a different author becomes that author's own record. An earlier,
broader guard that refused the write outright broke that spec; the shipped fix drops only
the inherited `ref_id` and records an `AuditEvent` (global_ids only, no eval content).

Verified live afterwards: original untouched, fork present with `ref_id=nil`, zero
duplicate `ref_id`s, audit row written.

### D2 — the report's "Preview & choose for `<user>`" could not choose

`board-preview.js`'s pick CTA was gated solely on `appState.tour_board_picker_active`,
which only the board-picker *tour* sets. The eval report opens the preview with
`recommend: true` — an option threaded from `utils/modal#board_preview` through
`services/modal` onto the settings object and then **read by nothing**. So the report's
preview rendered the ordinary details footer, whose primary CTA (`select` → "Try This
Board") opens the board in speak mode for whoever is *signed in*. It never copies to the
communicator. The card's headline action was unreachable, and every downstream piece —
`pick_for_home`, `_finishPickForHome`'s `pickingForOther` branch, the whole
`setup_user` claim/release lifetime in `recommended_home_board.js` — was already built
and waiting.

Fix wires `recommend` into the component and renames the computed to
`pick_for_home_mode`; the dismiss label is now context-appropriate ("Back to Picker"
only in the tour).

---

## Entry-point enumeration (P2)

Writing a workbook onto a saved evaluation.

| Entry point | Enforced at | Test |
|---|---|---|
| Fresh navigation to `/:user/logs/:id` as the author | client `isAuthor` is UX; the write is an ordinary authored eval | browser round-trip, marker persisted to Postgres |
| Same route as a NON-author (communicator's own eval) | UI read-only; server drops the inherited `ref_id` | `log_session_spec` "eval author mismatch" ×4 |
| Direct `POST /api/v1/logs` replaying the author's captured body under another token | `log_session.rb` eval branch — fork keeps its own identity | verified live; audit row `eval_author_mismatch` |
| Direct `POST` naming a `log_session_id` the caller does own | unchanged — updates in place | "should still let the ACTUAL author update their own eval in place" |
| Offline / cached client | **Not covered** — no offline test was run | — |

Assigning the recommended board to a communicator.

| Entry point | Enforced at | Test |
|---|---|---|
| Report card → preview → "Pick this Board" | `pick_for_home` resolves `setup_user \|\| currentUser`; server `users#update` | live: board + home board land on hannah_lee, marcus unchanged |
| Same, with the report toggled to School mode mid-preview (card unmounts) | `recommended_home_board.js` owns the claim for the preview's lifetime | live: `setup_user` survives the unmount, releases on close |
| Direct `PUT /api/v1/users/:id` | pre-existing supervise/edit branch | `users_controller_spec` (unchanged by this PR) |

---

## Verification

**Backend**
- `spec/models/log_session_spec.rb` — 187 examples, 0 failures, 5 pending
- `log_session` + `logs_controller` + `log_snapshot` — 287 examples, 0 failures
- `logs` + `boards` + `users` controllers — 682 examples, 0 failures, 3 pending
- `spec/models/concerns/passwords_spec.rb` — 39/39
- Full suite previously run at 6835 examples / 6 failures, all six confirmed
  pre-existing; three trace to a stale `user_integrations` row in the local test DB
  that `rails db:test:prepare` clears.

**Negative controls were run for every new spec**, and the results are reported honestly
rather than counted as coverage:
- of the 9 JSON-body specs in `5228c36cc`, **6 fail** without the fix (numbers, `false`,
  `duration_s`, button ids, numeric preferences, the no-clobber guard) and 3 pass either
  way because existing normalization already repairs the string forms;
- of the 4 eval-fork specs, **3 fail** without the guard (fork count and the audit row);
  the 4th is the regression guard for the author's own update and passes in both states.

**Browser** (Rails :5000, Ember :8184, Redis, Resque worker; marcus_williams_slp →
hannah_lee, eval `1_5383`)
- workbook typed → saved → `POST 200` with `application/json` → survived a hard reload,
  and the unique marker was confirmed **in Postgres**, not just in the UI;
- no duplicate eval created (both existing evals predate the run; only `updated_at` moved);
- author gate as hannah_lee: correct banner, `disabled` fields, typing blocked, no save
  control, zero writes issued;
- board pick landed on hannah_lee (0 → 95 boards, `home_board` set); marcus unchanged at
  62 boards and `home_board=nil`, in both the plain and mode-toggle runs;
- zero console errors in every run; the Resque failed queue did not grow.

**Frontend suite** — `ember test`: **1992 tests, 1953 pass, 38 skip, 1 todo, 0 fail.**
Baseline before this work was 1987/1948/38/1/0, so the delta is exactly the 5 new
board-preview specs and nothing else moved. The 38 skips are pre-existing `xit`/
`xdescribe` in persistence/scanner/speecher/buttonset/filesystem — none in eval or
board-preview. Note the four eval test files previously recorded as "known stale" are
NOT stale: `eval_recommend`, `eval_session`, `eval_auto_score` and
`eval_recommend.fromTargeted` all run and pass.

**Print stylesheet** (`_eval_quick.scss:2315+`, rendered under `media: print`) — 11/11
assertions. Printed for a funding submission the on-screen collapsed state must not
decide what reaches the page, and it does not: with the workbook collapsed on screen,
print forces the body open, forces the 1 STARTED section's body open, drops all 6
untouched sections, hides the mode switcher / actions / buttons / read-only banner, and
the SLP's typed answer text is present in the output.

**i18n fallback** — a missing key returns the English default passed as `i18n.t`'s 2nd
argument; a locale loaded WITHOUT the new keys renders readable English with
interpolation intact ("Preview & choose for hannah_lee"); a `*** `-prefixed
(marked-untranslated) entry also falls back. Never a raw key or a blank. Worth noting
`i18n.langs` currently has no language files loaded at all (`preferred: en-US`,
`loaded_langs: []`), so normal operation already runs on this fallback path.

---

## Not covered by this PR

- **Offline/cached clients** were not exercised for either flow.
- **The board-preview TEMPLATE is not covered.** The new unit specs pin the footer
  *decision* (`pick_for_home_mode`), not the markup, so a regression in the shared
  preview footer would still pass the whole suite. Verified by hand in the browser
  instead; the three contexts to re-check are library preview, board-picker tour, and
  the button-settings (`return_only`) preview.
- The ~18 other `process_params` implementations have **no JSON-body coverage**. The
  sweep in `docs/task-management/2026-08-15-adapter-json-blast-radius.md` found them
  clean on four axes, but nothing enforces it.
- `persistence.createRecord` cannot distinguish "service not ready" from "offline".
- Concurrent workbook edits are last-write-wins; the author gate limits this to one
  account but not one tab.
- Workbook and report are absent from the eval PDF; legacy/full evals have no PDF path
  at all — `logs_controller.rb:291` 404s unless `data['eval_mode']` is set, and the full
  eval stores `data['eval']`. That is a missing feature (Prawn work in `lib/eval_pdf.rb`),
  not an untested path.
- i18n: ~130 new keys in `en.json` only. The FALLBACK is verified (below), so a locale
  without them degrades to readable English; generating the translations is content work,
  not a correctness risk.
- `%%` renders a double percent in `eval-quick-report.hbs` (pre-existing).
- Native mobile/desktop clients still post form-encoded; that path is unchanged and
  covered by the server-side defence-in-depth in `6df5b1bbc`.

## Author-Model: opus-5
