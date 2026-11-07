# Sentence sync crashed button presses

Base: `develop` at `1e502ccf2`. Line numbers are at this branch's tree.

## Cause

`sync_send_utterance` (`app/frontend/app/services/app-state.js:1851`) observes
`stashes.working_vocalization` and runs inline from `utterance.js:314`, inside `add_button`, inside
`activate_button`. Commit `48a055d55` moved `shareable_voc` and the `ws_encrypt` callback to `this`
while both were plain functions, so `this` was undefined and the press ended there. Speech, the usage
log and `sync.send_update` all come later in `activate_button`.

It fired when `remote_modeling` was on and the user was paired, had `remote_modeling_auto_follow` on,
or had `followers.allowed`. Auto-follow needs no relay, so it applied with `ws_url` blank.

## Change

- `app-state.js`: both functions are arrows; the callback returns if the service is destroyed.
- `sync.js`: `in_room` is true only with an open connection and a subscription to that room. The sentence
  is sent to `ws_encrypt` only then, so with no relay it stays on the device.
- `app-state.js`: a sentence being encrypted is not encrypted again, a failed encrypt can retry, and the
  stored copy is dropped while sharing is off so a keepalive cannot send an old sentence.
- `app-state.js`: `shareable_voc` unloads the `utterance` record it creates.
- `app-state.js`: a press on a button whose sound is looked up no longer returns from `activate_button`
  before the usage log and `send_update`. Found in review; speech can finish later, the press cannot stop.
- `config/initializers/filter_parameter_logging.rb`: filters a param named exactly `text`. The sentence
  reaches `ws_encrypt` as `text`, which was unfiltered; the crash had been stopping that request.

## Verification

Measured in Chromium against the local app. Four presses by a communicator with auto-follow on, no relay:

| | Spoken | Usage logs | Crashes | `ws_encrypt` calls |
|---|---|---|---|---|
| Before | 0 | 0 | 3 | not measured |
| After | 4 | 4 | 0 | 0 |

In the "before" run the first press after sign-in did not reach `activate_button` at all, which is why
there are 3 crashes for 4 presses; it registers normally after the fix. The cause of that one press was
not traced.

Paired session after the fix, through upstream's `room_channel.rb` run unchanged on a test host:
communicator presses were spoken and logged and reached the supporter, the sentence bar matched on both
devices, a prompt cleared on accept, and the first press after pairing registered. `ws_encrypt` calls
across the session fell from 13 to 4.

Tests: `app-state-sync-utterance-test.js` (18) and `filter_parameter_logging_spec.rb`. Each of these
mutations went red on the expected test: plain `shareable_voc`, plain callback, no filter, bare `:text`,
early return on a known sound, early return on a loading sound, no wait for a loading sound, no unload, no
`isOpen`, no room check, no in-flight guard, no reset after a failed encrypt, old copy kept. The
destroyed-service checks have no test. `app-state` (56) and `sync` (153, 2 skipped) filters pass; the full
Ember and RSpec suites were left to CI.

## Review

`adversary-local` reviewed the proposal. Its log and relay-gate findings are fixed here. Its claim that
`sessionUser.id` is `'self'` in a real session was refuted: the browser run shows the global id, and the
communicator's own-room handlers ran. The canonical senior-dev pass approved with comments; the canonical
adversary pass blocked on the sound return, which this change now fixes along with its Medium findings on
the connection gate, the keepalive, repeat encrypts and unsaved records.

Round 2 of both passes, at `4d37a5531`: senior-dev approved with comments, adversary said ship, with Low
findings only. After that round `in_room` moved to the end of the condition, so it runs only for users
sharing a sentence, and became safe with no `connection`; that edit was not separately reviewed.

## Unresolved

- The observer still runs inline in the press; a future throw there would end the press again.
- An async write to a button (a sound or license) can change the sentence during an encrypt; that sentence
  then waits for the keepalive, up to 20 seconds.
- The send after encrypting does not re-check the room, and `in_room` is true before a subscription is
  confirmed. No plain text reaches a room either way.
- The sentence is encrypted for `sessionUser` and decrypted for the room owner, so sharing fails silently
  when they differ.
- The sound fallbacks after a rejected load have no tests, and a stalled load has no time limit.
- The sweep for `this` in nested plain functions found other sites from the same migration, for example
  `app-state.js:1571`, `:3463` (the tag path) and `persistence.js:586`. None were traced or changed here.
