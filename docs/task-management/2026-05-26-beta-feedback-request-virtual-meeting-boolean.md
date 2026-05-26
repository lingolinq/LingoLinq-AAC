# Beta Feedback request_virtual_meeting boolean

## Goal

Address the beta feedback `request_virtual_meeting` boolean handling so the
create path accepts common truthy values consistently with the other beta
feedback boolean params.

## Evidence

- `app/models/contact_message.rb` was handling
  `request_virtual_meeting` with a strict `== true || == 'true'` check, while
  nearby beta feedback flags already use
  `ActiveModel::Type::Boolean.new.cast(...)`.
- That strict check ignored common Rails truthy inputs such as `'1'` and
  `'on'`, even though those values are accepted elsewhere in the codebase.
- `spec/models/contact_message_spec.rb` already covered the basic `'true'`
  case, so the gap was specifically around broader boolean-casting behavior.

## Decision

Update `ContactMessage#process_params` to use
`ActiveModel::Type::Boolean.new.cast(params['request_virtual_meeting'])` so it
matches the existing beta feedback boolean handling pattern and accepts common
truthy forms.

## Result

- Replaced the strict comparison in `app/models/contact_message.rb` with
  Rails' boolean caster.
- Expanded the model spec to verify `true`, `'true'`, `'1'`, and `'on'` all
  persist `settings['request_virtual_meeting']` as `true`.

## Verification

- `ReadLints` reported no diagnostics in the touched model/spec/log files.
- Attempted `bundle exec rspec spec/models/contact_message_spec.rb`, but the
  run is blocked in this environment because Postgres peer authentication for
  user `postgres` failed before examples could execute.
