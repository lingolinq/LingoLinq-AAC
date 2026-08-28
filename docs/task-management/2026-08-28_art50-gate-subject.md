# Article 50 client gate: wrong subject in speak mode

Follow-up to merged PR #848. Two review findings from that PR, fixed globally in the shared
helper rather than narrowly in Focus Words.

Note the filename uses `2026-08-28_` and not `2026-08-28-`: `docs/task-management/YYYY-MM-DD-*.md`
is gitignored tree-wide, so a dash here would silently drop this file from the PR.

## Goal

P1: make the client-side Article 50(1) gate, the acknowledgement write, and the post-403 refresh
all operate on the same account the server's backstop judges.

P2: stop a slow post-403 refresh from silently discarding edits typed during it.

## Verified root cause (P1)

Traced end to end on `origin/staging` before writing anything.

| Side | Account it judges | Evidence |
|---|---|---|
| Server | `@api_user`, the token-authenticated user | `app/controllers/application_controller.rb:438-442`; `@api_user` is reassigned only for explicit `as_user` masquerade at `:190` and `:208`, never for speak mode |
| Client | `appState.currentUser` | `app/frontend/app/utils/article50_gate.js:67` (pre-fix) |

`appState.currentUser` is not the authenticated account in speak mode:
`app/frontend/app/services/app-state.js:2435-2449` (`set_current_user`) repoints it at
`speakModeUser` whenever one is set. The same file already documents this trap for a different
consumer at `:780-790`.

Consequences, in order of severity:

1. **Audit-trail integrity.** `ai-disclosure.js:109,116` POSTed the ack to
   `/api/v1/users/<currentUser.id>/article_50_disclosure_ack`, and
   `api/users_controller.rb:957-967` marks whatever user `params['user_id']` names, gated only by
   `allowed?(user, 'edit')`, which a supporter normally passes over their communicator. So a
   supporter's acknowledgement wrote an audited Article 50 disclosure onto a communicator who
   never saw the notice.
2. **Supporter dead-end.** The supporter's own record stayed unacknowledged, so the server kept
   returning 403, and the post-403 refresh reloaded the communicator (a record that could not
   change the outcome), landing the supporter in the "cannot be opened from here" branch every time.
3. Not a bypass. All five server ingresses fail closed on the authenticated account regardless of
   what the client decided.

`focus-words.js` was already inconsistent with itself: `:98` and `:190` used `sessionUser.id`
while the Art 50 path used `currentUser`.

## Why the fix is global, not Focus-Words-scoped

The acknowledgement POST lives in the shared `ai-disclosure.js`, so a Focus-Words-only change
cannot complete P1: the gate would detect the right account and the modal would still write to the
wrong one. Scoping narrowly would need a second subject path through the shared modal, which is
more code than the global fix and contradicts "do not create a second acknowledgement mechanism".

Because #848 already centralized the predicate, one helper change covers all four AI surfaces:

| Surface | Call site |
|---|---|
| Focus words | `focus-words.js:273,555,631` |
| Word prediction | `ai_word_predictor.js:52` via `word_suggestions.js:1133` |
| Board generation | `create-board-new.js:2020`, `new-board.js:421` |
| Eval narration | `eval-comprehensive-runner.js:370` |

## The trap this change had to avoid

`article50_gate.js#asAppState` maps only the literal key `'currentUser'` to the model.
`routes/index.js` and `routes/bento.js` hand `maybeShowSessionEntryGate` a MODEL, not an appState.
Had `needsAcknowledgement` started asking for `sessionUser` without updating that shim,
`art50Subject` would read `model.get('sessionUser') === undefined`, fall through to
`model.get('currentUser') === undefined`, and return false, so the session-entry disclosure would
silently never open again. Fail-OPEN, and no other suite would have caught it. The shim now maps
both keys, with a dedicated regression test.

The session-entry path is otherwise already correct: `routes/index.js:43` loads
`findRecord('user', 'self')`, which the server resolves to the authenticated account.

## Scope boundary held deliberately

`ai_feature_gate.js:85,127` also reads `currentUser` and was left alone. It answers a different
question ("may this data subject's data be processed by AI at all"), where the communicator IS the
right subject. Two questions about two different people; unifying them would be a real defect.

## P2: edits lost during a slow refresh

`_presentArticle50Gate` already read eight of its ten authored fields live from the component. Only
`ai_prompt` and `ai_word_count` arrived as arguments captured before the request. On the post-403
path those arguments are up to `art50_reload_timeout_ms` stale, and the description textarea and
count input stay editable throughout (only the Generate button is disabled, via
`ai_generate_disabled` reading `ai_generating`). So keystrokes typed during the refresh were
replaced by the pre-request snapshot when the modal reopened.

Chosen behavior: capture after the refresh, i.e. read those two fields at call time like the other
eight. Preferred over disabling the controls because it preserves every editable field rather than
taking them away, requires no new accessible busy state on inputs that are not actually unsafe to
edit, and removes the stale-closure class at both call sites instead of patching the one reachable
instance.

## Files changed

- `app/frontend/app/utils/article50_gate.js` - new `art50Subject`; `needsAcknowledgement` uses it;
  `asAppState` maps both identity keys
- `app/frontend/app/components/ai-disclosure.js` - ack POST targets `art50Subject`
- `app/frontend/app/components/focus-words.js` - post-403 refresh targets `art50Subject`;
  `_presentArticle50Gate` reads the AI fields at call time
- `app/frontend/app/components/eval-comprehensive-runner.js` - comment only; it asserted the
  subject was `appState.currentUser`, which was the intent but not what the code did

## Not changed

No production flag, no server-side enforcement, no deployment config, no compliance document, no
findings register entry, no attestation. Findings `LL-104bfa61dc`, `LL-a9d6d5a46b`, and
`LL-6723438462` untouched.

## Gotcha hit during this task

`.eslint-todo` anchors suppressions by line number. Inserting lines into
`tests/unit/utils/article50-gate-test.js` and `focus-words.js` shifted pre-existing entries
(`qunit/require-expect` at 97/109/134, `ember/require-computed-property-dependencies` at 301),
which the CI gate reports as new findings. Regenerated with `npm run lint:js:todo`; the diff must
show only line-number shifts, never new rule/file pairs.
