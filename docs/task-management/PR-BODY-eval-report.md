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
| Board preview "pick" wiring + remove chain | the report's own CTA could not do what it said |
| `models/user.js` identity (`_actual_id` / `global_id`) | the eval's own author was locked out of their workbook |

Splitting it after the fact would produce a stack of PRs that cannot be tested
independently — each fix is only observable once the one beneath it is in place. That
was a deliberate call, not drift. If you want it split anyway, the natural seam is
"log pipeline" (`a77968512`, `6df5b1bbc`) vs "eval report" (everything else), and the
log-pipeline half must merge first.

**15 commits, 73 files, +8149/−339 vs `staging`**, plus the working-tree changes
described under D3/D4 below (eval-workbook concurrency follow-up and the in-memory
author gate), which are not yet committed at time of writing.

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
| JSON scalar contract untested by construction | Partial: 4 of 21 `process_params` models | `5228c36cc` (9 specs) + `0128c531d` (12 specs); 17 models still uncovered — see "Not covered" |
| "Preview & choose for `<user>`" had no choose | Fixed | D2 below; `0128c531d` |
| Board-preview remove chain (broken in four places) | Fixed | D2 below; `0128c531d` |
| Non-author eval fork duplicated `ref_id` | Fixed | D1 below |
| `same_author` never invalidated on session change | Fixed | `user/log.js`, 3 specs, negative-controlled |
| `%%` rendered a double percent | Fixed | `0128c531d`, 8 template sites + 13 locale files |
| `||`/`?:` precedence bug in `utils/modal.js` | Fixed | `0128c531d` |
| Concurrent workbook saves clobbered each other's sections | Fixed | D3 below; `5fa24641c` |
| The eval's own author locked out of their workbook | Fixed | D4 below; `5fa24641c` |
| In-memory eval author gate trusted the `'self'` sentinel | Fixed (uncommitted) | D4 below |
| i18n generation blocked (6 keys invisible to the parser) | Fixed | 0 dups / 0 missing / 8197 strings |
| `i18n_generator.rb` unusable without a UTF-8 shell locale | Fixed | runs with `LANG`/`LC_ALL` unset |

---

## The defects found by executing the flows

All were found by running the flows in a browser against a running stack, not by
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

The **remove** chain was broken in four separate places along the same path; the primary
break was `services/modal` dropping `options.remove` before the component ever saw it.
`controllers/board-preview.js` (136 lines) was dead and is deleted.

### D3 — a workbook save wiped whatever another session had written

`log_session.rb:1875` is `self.data['eval'] = params['eval']` — wholesale replacement —
and the client sent the workbook it hydrated on load and never refreshed
(`didReceiveAttrs` re-hydrates only when `evalIdentity()` CHANGES, deliberately, so a
re-render cannot reset the field being typed in). Delivery is fire-and-forget through a
stash → push → Resque, so nothing compares state and the loser gets no error. Any
section the other session wrote simply disappeared.

Scope is narrower than "therapy teams lose each other's work": `canEdit` is `isAuthor`,
so it takes ONE account writing from two places — two tabs, laptop + tablet, or a tab
left open across a save made elsewhere.

Fix is `utils/eval_workbook#mergeForSend(stored, local, dirtyKeys)`: start from the
newest stored workbook, lay only the sections THIS session edited over it. Keying on
EDITED rather than on non-empty is the whole point, and it is what rules out the cheaper
server-side merge — a section the SLP deliberately CLEARED is dirty and must win.

### D4 — the author gate compared identities that were not identities

Two bugs, one root cause: **`'self'` is a sentinel, not an identity.**

`serializers/application.js` pins the session user's record id to the literal string
`'self'` so Ember Data never re-keys the identifier, parking the real id in
`_actual_id`. `models/user.js` never declared that attr, so **Ember Data dropped it** and
the record had no usable id at all during that window — locking the eval's own author out
of their own workbook. Observed live: `sessionUser.id === 'self'` while
`log.author.id === '1_24'`, held 40s+. Fixed by declaring `_actual_id` and adding the
`global_id` computed (matching `board.js` / `buttonset.js`), then comparing with that.

The in-memory branch had the same hazard from the other direction, and it is the more
dangerous one. `utils/eval.js` stamped `assessment.author_id` from `sessionUser.id`, so
an eval started inside that window recorded the author as `'self'` — the same string for
**every** account. A second SLP on a shared device then compared `'self' === 'self'`,
matched, and was granted edit on the first SLP's eval: precisely the fork the stamp
exists to prevent, and the server answers by filing a DUPLICATE evaluation
(`log_session.rb:1075`). The stamp now records `global_id` and never the sentinel, and
the gate refuses `'self'` on either side regardless, because snapshots written by earlier
builds still carry it.

That last part fails closed for the legitimate author too, and that is deliberate:
nothing in the snapshot distinguishes the two cases. The cost is bounded — those
snapshots expire within `EVAL_PROGRESS_MAX_AGE_S` (24h) — and retyping a workbook beats
forking a clinical record.

---

## Entry-point enumeration (P2)

Writing a workbook onto a saved evaluation.

| Entry point | Enforced at | Test |
|---|---|---|
| Fresh navigation to `/:user/logs/:id` as the author | client `isAuthor` is UX; the write is an ordinary authored eval | browser round-trip, marker persisted to Postgres |
| Same route as a NON-author (communicator's own eval) | UI read-only; server drops the inherited `ref_id` | `log_session_spec` "eval author mismatch" ×4 |
| Direct `POST /api/v1/logs` replaying the author's captured body under another token | `log_session.rb` eval branch — fork keeps its own identity | verified live; audit row `eval_author_mismatch` |
| Direct `POST` naming a `log_session_id` the caller does own | unchanged — updates in place | "should still let the ACTUAL author update their own eval in place" |
| Same account, two concurrent sessions | client-side `mergeForSend` only — **the server still replaces wholesale** | 7 unit tests + two-tab browser probe, negative-controlled |
| In-memory eval recovered from the IndexedDB snapshot | client `isAuthor` against the stamped `author_id`; no server record exists yet | 7 component tests, negative-controlled |
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
- `spec/controllers/` — 1865 examples, 0 failures, 5 pending
- Full suite previously run at 6835 examples / 6 failures, all six confirmed
  pre-existing; three trace to a stale `user_integrations` row in the local test DB
  that `rails db:test:prepare` clears.

**Negative controls were run for every new spec**, and the results are reported honestly
rather than counted as coverage:
- of the 9 JSON-body specs in `5228c36cc`, **6 fail** without the fix (numbers, `false`,
  `duration_s`, button ids, numeric preferences, the no-clobber guard) and 3 pass either
  way because existing normalization already repairs the string forms;
- of the 12 JSON-body specs in `0128c531d`, **8 fail** without the fix and 4 are pins that
  pass in both states;
- of the 4 eval-fork specs, **3 fail** without the guard (fork count and the audit row);
  the 4th is the regression guard for the author's own update and passes in both states;
- of the 7 workbook-merge unit tests, **5 fail** without `mergeForSend` and 2 are pins;
- of the 3 new author-gate tests, **1 fails** without the sentinel guards — the
  different-SLP case, which is the one that matters. The other two pin the documented
  fail-closed trade and a positive control, and pass in both states. Stated explicitly
  because a test that cannot fail is not coverage.

**Browser** (Rails :5000, Ember :8184, Redis, Resque worker; marcus_williams_slp →
hannah_lee, eval `1_5383`)
- workbook typed → saved → `POST 200` with `application/json` → survived a hard reload,
  and the unique marker was confirmed **in Postgres**, not just in the UI;
- no duplicate eval created (both existing evals predate the run; only `updated_at` moved);
- author gate as hannah_lee: correct banner, `disabled` fields, typing blocked, no save
  control, zero writes issued;
- board pick landed on hannah_lee (0 → 95 boards, `home_board` set); marcus unchanged at
  62 boards and `home_board=nil`, in both the plain and mode-toggle runs;
- two-tab concurrent workbook edit: tab B's section survives tab A's save, verified by a
  fresh page load reading the real textareas rather than the API. The control (with the
  merge reverted) reproduced the clobber;
- zero console errors in every run; the Resque failed queue did not grow.

**Committed probes** — both are runnable, not one-off scratch work:
- `app/frontend/scripts/board-preview-footer-probe.mjs` — 10 assertions over 6 contexts,
  negative-controlled. This replaces the "template is not covered" gap in the previous
  revision of this document.
- `app/frontend/scripts/workbook-concurrent-probe.mjs` — the two-tab round trip above.

**Frontend suite** — `ember test --filter "eval"`: **89/89, 0 fail.** The eval-workbook
component suite is 13/13 (10 existing + 3 new author-gate cases).

> ⚠️ **Outstanding before merge:** the FULL `ember test` run has not been re-run since the
> author-gate change. The last complete run was **2005 tests / 1966 pass / 38 skip / 0
> fail**, before these 3 tests were added; expect 2008/1969/38/0. Confirm the `# skip`
> line reads **38** — a truncated run is otherwise indistinguishable from a failing one
> (CLAUDE.md RULE #0 item 10), and `ember serve` must be stopped first or it will truncate.

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

- **Offline/cached clients** were not exercised for any flow. Related and known: queued
  offline writes never drain on reconnect (`services/stashes.js:806`, TODO dated
  2026-01-20). Data is retained, not lost. This is the largest remaining data-integrity
  item and wants its own branch off `staging` — it is deliberately not in scope here.
- **17 of 21 `process_params` implementations have no JSON-body coverage.** This PR
  covers 4 (`user_badge`, `user_goal`, `button_image`, `utterance`). The sweep in
  `docs/task-management/2026-08-15-adapter-json-blast-radius.md` found the rest clean on
  four axes, but nothing enforces it. Named residual `!!params[...]` sites:
  `button_image` hc/badge, and `user_goal` global/template/template_header (admin-only).
  `board` and `user` public flags have specs, but I did not confirm they cover the
  boolean contract specifically.
- **The concurrent-edit fix is client-side only.** The server still replaces the eval
  blob wholesale, so a client that does not send a merged workbook still clobbers. A
  server-side merge was considered and rejected: it cannot distinguish a deliberately
  CLEARED section from an absent one.
- `persistence.createRecord` cannot distinguish "service not ready" from "offline".
- `_actual_id` is now sent on user saves as a side effect of declaring the attr.
  `User#process_params` is a whitelist (no mass-assignment), so the server ignores it —
  verified — but marking it `serialize: false` in `serializers/user.js` (the convention
  already used there for five response-only fields) was **not** done, because that call
  reaches `persistence#convert_model_to_json` and the offline store path, which was not
  traced. Deferred rather than guessed at.
- **~128 `***`-prefixed (untranslated) keys across 13 locale files still render English.**
  Generating them is content work, not a correctness risk — the fallback is verified
  above — but it is unfinished.
- Workbook and report are absent from the eval PDF; legacy/full evals have no PDF path
  at all — `logs_controller.rb:291` 404s unless `data['eval_mode']` is set, and the full
  eval stores `data['eval']`. That is a missing feature (Prawn work in `lib/eval_pdf.rb`),
  not an untested path.
- `ref_id` scan at `log_session.rb:1068` walks all users' evals.
- `saveHomeBoard` verification is only sound because the server re-serializes.
- Native mobile/desktop clients still post form-encoded; that path is unchanged and
  covered by the server-side defence-in-depth in `6df5b1bbc`.
- `app/services/persistence.js` has zero importers but is reachable by service
  injection, and duplicates `app/utils/persistence.js` (which has 128). Not investigated;
  flagged because it makes any persistence-path reasoning ambiguous.

## Author-Model: opus-5
