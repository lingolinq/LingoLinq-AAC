# 2026-11-06 correct the retention promises on the public pages (#1050 / KAN-118)

## Fact sheet (Rule 12)

- Read at: `privacy.hbs` `privacy_security_retention_active` and `_inactive`, through `app/frontend/app/utils/i18n.js`, which prefers a locale value unless it starts with `*** `. `terms.hbs` `terms_termination_grace` carried the same 10-day claim and was not named in #1050.
- Shapes: 13 locale files; the 12 non-English ones held machine translations of the withdrawn English. Paths writing `schedule_deletion_at`: inactivity sweep, self-serve deletion, COPPA decline and offboarding.
- Cross-file facts: `app/models/concerns/subscription.rb` (12 months on `updated_at`; about 4 weeks for `:expired_communicator`; warnings at least 3 weeks apart; 36 hours; exemptions), `lib/flusher.rb` `flush_deleted_users` (daily, so "no sooner than"), `app/models/concerns/notifiable.rb` and `app/mailers/concerns/general.rb` (no mail without an address or with `email_disabled`), `lib/data_policy_enforcer.rb` (organization retention).

## Proposal review

Option taken: correct the copy to the code. Changing the code to match was rejected because it would alter destructive behaviour for children's accounts. The adversary pass blocked the first draft: the Terms line said signing in cancels deletion, which holds only for a password match on a self-serve deletion, so that promise was removed. Also fixed: expired plans take the shorter path, warnings are not guaranteed, and inactivity is not the only way an account or its logs are deleted. A second pass on the rewrite: only online use counts as use, because offline AAC use never reaches the server; a parent deletion happens through a decline or a verified request; and Terms deletion is scheduled, not unconditional.

## Consulted

`docs/task-management/learnings-archive/2026-11.md` (retracted citations). `spec/lib/privacy_locale_english_pins_spec.rb` header on the #1027-class regression.

## Not in this change

- Other promises under LL-933e61efd7: dwell data 3 years, tenant 90 days, backups 35 days, and the intro's "align with our Data Retention Schedule".
- `user_to_be_deleted` in `confirm-delete-user.js` says about 24 hours, and the `account_deleted` mail says "has been deleted" and 24 hours. The code is at least 36 hours.
- The unrendered orphan key `privacy_security_retention` in 12 locale files still holds old text.
- The Last Updated dates and `PRIVACY_POLICY_VERSION` are set to 2026-11-06 and should move to the real publish date.
