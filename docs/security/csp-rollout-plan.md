# Content Security Policy Rollout Plan

**Owner:** Melissa (implementation) + Scot (compliance sign-off)
**Status:** Report-only (initial commit on `feat/csp-headers-report-only`)
**Target:** Enforcing CSP on all Rails-served responses by end of Q2 2026

## Why CSP

- Defense-in-depth against XSS. Even if a payload lands in a template, the browser refuses to execute inline/remote scripts outside the allowlist once CSP is enforced.
- Clickjacking protection via `frame-ancestors 'none'` — **note:** this directive has no effect in report-only mode and will not provide clickjacking protection until CSP is enforced (Phase 4). If immediate clickjacking protection is required, ship a separate `X-Frame-Options: DENY` header independently of this rollout.
- Required by FERPA/HIPAA reviewers as a baseline browser security control.
- Closes an open gap flagged in the April 2026 compliance status report.

## Rollout Phases

### Phase 1: Report-only + violation collector (this PR)

Ship `config/initializers/content_security_policy.rb` with `content_security_policy_report_only = true`
and the `/api/v1/csp-reports` collector endpoint.

The browser emits `Content-Security-Policy-Report-Only` headers. Violations generate console warnings
and reports are forwarded to Sentry (or logged when Sentry is unavailable) but nothing is blocked.
Zero user-visible risk.

**Exit criteria for Phase 1:**

- Deployed to staging for at least 2 full weeks.
- Manual walkthrough of every major surface: login, dashboard, communicator, board editor, admin, organization pages, SSO flows (Clever, Microsoft, Google, generic SAML).
- Staging violation reports remain clean during that period, with the allowlist reviewed and updated as needed.

### Phase 2: Tighten allowlist

Review collected violations. Remove allowlist entries that are never legitimately used. Narrow wildcards where possible (for example, replace `https://*.s3.amazonaws.com` with the specific bucket hostname once confirmed).

### Phase 3: Replace unsafe-inline / unsafe-eval with nonces

Ember 3.28's initial bootstrap and any `<script>` tags in Rails-served templates get a per-request nonce. The layout injects the nonce into `<script nonce=...>` and `<style nonce=...>` tags; the initializer's `script_src` and `style_src` switch to `:nonce` instead of `:unsafe_inline`.

This is the highest-value step but also the highest-risk. Do it only after Phase 2 stabilizes.

### Phase 4: Flip to enforcing

Set `content_security_policy_report_only = false`. Deploy to staging first, monitor for 48 hours, then promote to production.

## Allowlist rationale

| Directive | Entry | Why |
|---|---|---|
| `script-src` | `'unsafe-inline'`, `'unsafe-eval'` | Ember 3.28 bootstrap; replaced with nonces in Phase 3 |
| `script-src` | `api.opensymbols.org` | Symbol search pulls JS assets |
| `script-src` | `js.hs-scripts.com` | HubSpot tracking (gated by consent; remove if HubSpot is dropped) |
| `script-src` | `translate.google.com` | Google Translate TTS inline callback |
| `style-src` | `'unsafe-inline'` | Ember template-driven inline styles; nonces later |
| `style-src` | `fonts.googleapis.com` | Google Fonts CSS |
| `connect-src` | `wss:` | LLWebSocket live-update channel |
| `connect-src` | `api.iplocate.io` | IP geolocation |
| `connect-src` | `api.opensymbols.org` | Symbol search API |
| `connect-src` | `translate.google.com` | TTS playback |
| `connect-src` | `*.s3.amazonaws.com` | User uploads |
| `connect-src` | `api.hubapi.com` | HubSpot API |
| `img-src`, `font-src`, `media-src` | `:https`, `:data`, `:blob` | Broad during rollout; narrow once reports land |
| `form-action` | `:self`, `:https` | SSO posts; narrow to specific IdP hosts once confirmed |
| `frame-ancestors` | `'none'` | Blocks clickjacking once enforced (Phase 4); no effect in report-only mode |
| `object-src` | `'none'` | Hard block on Flash / plugin content |

## Known risks and mitigations

- **Ember might hit violations we didn't anticipate.** Report-only mode is the mitigation. Nothing breaks; we learn what the allowlist actually needs.
- **Third-party vendor updates may change asset hosts.** Track any host change that shows up in reports and add to the allowlist.
- **Browser extensions inject their own scripts.** These trigger violations but are out of scope for us; document to avoid confusion.

## Testing checklist before Phase 4 (enforcing)

- [ ] Login page loads cleanly, no console errors.
- [ ] Dashboard loads, avatar images render.
- [ ] Communicator surface renders the board, plays TTS, accepts input.
- [ ] Board editor saves, uploads work against S3.
- [ ] Symbol search returns results and renders images.
- [ ] SSO flows complete for Clever, Microsoft, Google, and SAML.
- [ ] Admin panel renders and all admin-specific JS works.
- [ ] Organization settings page saves without CSP errors.
- [ ] Mobile Cordova/Capacitor app still talks to the API (it shouldn't be affected, but confirm).

## References

- Rails CSP DSL: https://guides.rubyonrails.org/security.html#content-security-policy-header
- MDN CSP reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- April 2026 compliance status: Notion page `Engineering & Compliance Status - April 2026`
