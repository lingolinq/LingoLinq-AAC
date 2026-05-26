# Beta Feedback Virtual Meeting Specs

## Goal

Add spec coverage for the new beta feedback `request_virtual_meeting` field so
it is verified from message creation through the beta feedback admin API.

## Relevant files

- `app/models/contact_message.rb`
- `lib/json_api/beta_feedback.rb`
- `spec/models/contact_message_spec.rb`
- `spec/controllers/api/beta_feedback_controller_spec.rb`

## Diagnosis

- Verified `ContactMessage#process_params` persists
  `params['request_virtual_meeting']` into
  `settings['request_virtual_meeting']` as a boolean for beta feedback
  messages.
- Verified `JsonApi::BetaFeedback.build_json` includes
  `request_virtual_meeting` in both index rows and detail payloads.
- Verified existing specs cover beta feedback creation and admin fetches, but do
  not assert the new field in either the model persistence path or the
  controller JSON responses.

## Evidence

- `app/models/contact_message.rb`
- `lib/json_api/beta_feedback.rb`
- `spec/models/contact_message_spec.rb`
- `spec/controllers/api/beta_feedback_controller_spec.rb`

## Plan

1. Add a model spec that submits `request_virtual_meeting` and asserts the
   persisted setting is `true`.
2. Extend beta feedback controller specs to assert the field is serialized as a
   boolean in both index and show responses.
3. Run the focused specs and review lints on touched files.

## Result

- Added a `ContactMessage` model spec covering beta feedback submission with
  `request_virtual_meeting: 'true'` and asserting the persisted setting is the
  boolean `true`.
- Added beta feedback controller specs asserting `request_virtual_meeting`
  round-trips as `true` in both the index row JSON and the detail payload JSON.

## Verification

- Reviewed `lib/json_api/beta_feedback.rb` to confirm the field is serialized by
  the existing API layer and that the new specs target the real round-trip path.
- Ran `ReadLints` on the touched spec/log files; no linter errors were reported.
- Attempted `bundle exec rspec spec/models/contact_message_spec.rb
  spec/controllers/api/beta_feedback_controller_spec.rb`, but the run is
  blocked in this environment because Postgres peer authentication for user
  `postgres` failed before examples could execute.
