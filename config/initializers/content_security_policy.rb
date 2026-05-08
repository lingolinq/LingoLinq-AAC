# frozen_string_literal: true

# Content Security Policy for LingoLinq AAC.
#
# REPORT-ONLY. Browsers emit Content-Security-Policy-Report-Only headers;
# nothing is blocked. Do NOT flip `content_security_policy_report_only` to
# false until we have at least 2 full weeks of clean staging reports with
# no uncovered violations on the core surfaces (communicator, board editor,
# admin, SSO flows).
#
# Report endpoint: POST /api/v1/csp-reports -> Api::V1::CspReportsController
# which forwards to Sentry when the Sentry Ruby SDK is present, and falls
# back to Rails.logger.warn otherwise.
#
# Rollout phases and per-directive allowlist rationale live in
# docs/security/csp-rollout-plan.md.
#
# Out of scope for this commit: removing :unsafe_inline / :unsafe_eval from
# script-src. That requires per-request nonces plumbed through the Ember
# index.html served by Rails and is tracked as a separate Phase 4 change.

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
                     'https://*.hs-analytics.net',
                     'https://*.hsforms.net',
                     'https://js.hsforms.net',
                     'https://cdn.jsdelivr.net',
                     'https://checkout.stripe.com',
                     'https://js.stripe.com',
                     'https://app.covidspeak.org',
                     'https://translate.google.com'

  policy.style_src   :self,
                     :unsafe_inline,
                     'https://fonts.googleapis.com'

  # Outbound API calls from the browser. wss covers the LLWebSocket
  # live-updates channel used by the Communicator surface.
  #
  # Sentry ingest hosts are kept ahead of adoption so that when/if the
  # Sentry browser SDK is wired in, reports are not blocked (currently
  # neither the Ruby nor JS SDK is present in this repo — see PR body).
  policy.connect_src :self,
                     :wss,
                     'https://api.iplocate.io',
                     'https://api.opensymbols.org',
                     'https://www.opensymbols.org',
                     'https://translate.google.com',
                     'https://*.s3.amazonaws.com',
                     'https://*.cloudfront.net',
                     'https://fonts.googleapis.com',
                     'https://fonts.gstatic.com',
                     'https://cdn.jsdelivr.net',
                     'https://api.hubapi.com',
                     'https://track.hubspot.com',
                     'https://forms.hsforms.com',
                     'https://forms-api.hsforms.com',
                     'https://*.ingest.sentry.io',
                     'https://*.ingest.us.sentry.io',
                     'https://api.flickr.com',
                     'https://openclipart.org',
                     'https://pixabay.com',
                     'https://www.googleapis.com',
                     'https://checkout.stripe.com',
                     'https://js.stripe.com',
                     'https://app.covidspeak.org'

  # Embedded iframes. Current surfaces (per template grep):
  #   - opensymbols.org (badge_maker, word_maker, editor embeds)
  #   - YouTube (video buttons) + img.youtube.com thumbnails
  #   - Clever / SSO integration iframe (embed-frame.hbs, dynamic src)
  #   - Lesson content iframe (lesson.hbs, dynamic src -> any https)
  #   - External link preview iframe (confirm-external-link.hbs, sandboxed)
  # Lesson and confirm-external-link iframes legitimately load arbitrary
  # external URLs, so frame-src stays broad (:https) until Phase 2 narrows
  # it based on collected violation reports. No embedded HubSpot form / Vimeo
  # currently in templates.
  policy.frame_src   :self,
                     :https,
                     'https://www.opensymbols.org',
                     'https://www.youtube.com',
                     'https://www.youtube-nocookie.com'

  policy.worker_src   :self, :blob
  policy.manifest_src :self

  # Violations from the browser post here; see
  # app/controllers/api/v1/csp_reports_controller.rb.
  policy.report_uri '/api/v1/csp-reports'
end

Rails.application.config.content_security_policy_report_only = true
