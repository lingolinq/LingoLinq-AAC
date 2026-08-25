# Fixture generator for app/frontend/scripts/n1-consent-pages-qa.mjs.
#
# That script drives the PARENT-facing COPPA pages -- the ones a parent lands on
# from the consent email -- and needs live, single-use tokens to do it. Tokens
# cannot be committed, so this builds them on demand against the local database
# and prints the four URLs the harness expects on stdout:
#
#   bundle exec rails runner scripts/n1-consent-fixtures.rb > /tmp/consent_pages.json
#   cd app/frontend && node scripts/n1-consent-pages-qa.mjs --fixtures /tmp/consent_pages.json
#
# Refuses to run outside development/test: it creates under-13 accounts and mints
# consent tokens, neither of which belongs in a real environment.
#
# Accounts are named with a timestamp so repeat runs do not collide, and are left
# behind deliberately -- the harness asserts on second-visit behaviour ("same link
# a second time"), so the records have to survive the run.

unless Rails.env.development? || Rails.env.test?
  abort "refusing to run in #{Rails.env}: this creates under-13 accounts and consent tokens"
end

require 'json'

host = JsonApi::Json.absolute_host
abort 'no host: set DEFAULT_HOST' if host.blank?

stamp = Time.now.to_i

def build_child(stamp, suffix)
  User.process_new({
    'name' => "qa_consent_#{suffix}_#{stamp}",
    'user_name' => "qa_consent_#{suffix}_#{stamp}",
    'email' => "qa_consent_#{suffix}_#{stamp}@example.com",
    'password' => 'abcdef123456',
    'terms_agree' => true,
    'coppa_under_13' => true,
    'parent_consent_email' => "qa_parent_#{suffix}_#{stamp}@example.com"
  }, { pending: true })
end

# 1. Approvable child, untouched.
approve = build_child(stamp, 'approve')

# 2. Same, but aged past the 14-day parent_consent_expires_at window.
expired = build_child(stamp, 'expired')
c = expired.settings['coppa']
c['parent_consent_expires_at'] = 15.days.ago.utc.iso8601
expired.settings['coppa'] = c
expired.save!

# 3. A child whose consent is already GRANTED, so the revoke link is live.
revoke = build_child(stamp, 'revoke')
revoke.grant_parental_consent!(revoke.settings['coppa']['parent_consent_token'])
revoke.reload

def consent_url(host, user, action, token)
  "#{host}/parental_consent/#{action}?user_id=#{user.global_id}&token=#{CGI.escape(token.to_s)}"
end

out = {
  'approve_valid' => consent_url(host, approve, 'complete', approve.settings['coppa']['parent_consent_token']),
  'approve_expired' => consent_url(host, expired, 'complete', expired.settings['coppa']['parent_consent_token']),
  'approve_bad_token' => consent_url(host, approve, 'complete', 'not-a-real-token'),
  'revoke_valid' => consent_url(host, revoke, 'revoke', revoke.settings['coppa']['parent_consent_revoke_token'])
}

warn "created qa_consent_{approve,expired,revoke}_#{stamp} in #{Rails.env}"
puts JSON.pretty_generate(out)
