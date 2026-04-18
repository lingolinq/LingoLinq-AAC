# frozen_string_literal: true

# Content Security Policy for LingoLinq AAC.
#
# Ships in REPORT-ONLY mode. Violations are emitted as
# Content-Security-Policy-Report-Only headers; nothing is blocked yet.
# After one full deploy cycle on staging with violation review, flip
# content_security_policy_report_only to false to enforce.
#
# Rollout plan and allowlist rationale: docs/security/csp-rollout-plan.md

Rails.application.config.content_security_policy do |policy|
  policy.default_src :self

  policy.base_uri    :self
  policy.object_src  :none
  policy.frame_ancestors :none

  # SSO form posts go to external IdPs (Clever, Microsoft, Google,
  # generic SAML). Keep permissive for initial rollout; tighten after
  # reviewing reports from staging.
  policy.form_action :self, :https

  policy.img_src     :self, :https, :data, :blob
  policy.font_src    :self, :https, :data
  policy.media_src   :self, :https, :data, :blob

  # Ember 3.28 build output includes inline bootstrap code that
  # requires unsafe-inline / unsafe-eval. Follow-up PR will replace
  # these with per-request nonces once reports confirm coverage.
  policy.script_src  :self,
                     :unsafe_inline,
                     :unsafe_eval,
                     'https://api.opensymbols.org',
                     'https://js.hs-scripts.com',
                     'https://translate.google.com'

  policy.style_src   :self,
                     :unsafe_inline,
                     'https://fonts.googleapis.com'

  # Outbound API calls from the browser. wss covers the LLWebSocket
  # live-updates channel used by the Communicator surface.
  policy.connect_src :self,
                     :wss,
                     'https://api.iplocate.io',
                     'https://api.opensymbols.org',
                     'https://translate.google.com',
                     'https://*.s3.amazonaws.com',
                     'https://api.hubapi.com'

  policy.worker_src   :self, :blob
  policy.manifest_src :self
end

Rails.application.config.content_security_policy_report_only = true

# Future: wire a report collector endpoint so violations land in
# AiApiLog-style storage for triage.
# Rails.application.config.content_security_policy do |policy|
#   policy.report_uri '/api/v1/csp-reports'
# end
