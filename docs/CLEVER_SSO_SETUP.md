# Clever SSO and Secure Sync setup

Clever District SSO uses OAuth 2.0. New apps cannot certify SSO-only; this integration is SSO plus Secure Sync (rostering). Live districts also need a Clever Complete agreement.

Official guides:

- [Clever Single Sign-On Quickstart](https://dev.clever.com/docs/district-sso-1)
- [Clever SSO certification](https://dev.clever.com/docs/district-sso-certification-guide)
- [Clever Secure Sync certification](https://dev.clever.com/docs/secure-sync-certification-guide)
- [OAuth implementation](https://dev.clever.com/docs/oauth-implementation)
- [Log in with Clever button assets](https://dev.clever.com/docs/clever-sso-assets)

## Phase 0 dashboard checklist (human)

Do this in the Clever App Dashboard before end-to-end sandbox login works.

1. **Settings → Redirect URIs** (exact match, no trailing slash):
   - Local Ember: `http://localhost:8184/auth/clever/callback`
   - Staging HTTPS (set this as the **primary** URI for Portal and certification): `https://<staging-host>/auth/clever/callback`
2. **Settings → Instant Login**: enable student, teacher, staff, and district_admin.
3. Confirm the sandbox district and Custom Test Users.
4. Email **application-interest@clever.com** (or your Application Success Manager) and ask for **Secure Sync scopes on the development app**. Development apps start with SSO-only scopes; roster sync 404s until Secure Sync is enabled.

Suggested email:

```
Subject: Secure Sync scopes for LingoLinq development app

We are building a Clever Complete integration (SSO + Secure Sync) for LingoLinq AAC.
Please enable Secure Sync scopes on our development application so we can roster
district, schools, and users (no sections in v1) and complete certification.

Client ID: <CLEVER_CLIENT_ID>
App name: LingoLinq
```

Portal Instant Login always uses the primary redirect URI. Certification testing must hit the HTTPS staging URI, not localhost.

## Secrets

Do not commit plaintext client secrets. Store them in 1Password and reference them from `.env.op.local`:

```bash
CLEVER_CLIENT_ID=op://LingoLinq Shared Dev/Clever/CLEVER_CLIENT_ID
CLEVER_CLIENT_SECRET=op://LingoLinq Shared Dev/Clever/CLEVER_CLIENT_SECRET
```

Then run Rails under `op run`:

```bash
op run --env-file=.env.op.local -- bundle exec rails server
```

The client secret is used only on Rails (`POST https://clever.com/oauth/tokens` with HTTP Basic). It is never sent to Ember.

After certification, production uses a separate Clever app and separate credentials in GCP Secret Manager. Do not add `CLEVER_CLIENT_*` to `deploy-cloudrun.yml` until those Secret Manager items exist; a missing secret fails the deploy.

## Feature flag

`clever_sso` is in `AVAILABLE_FRONTEND_FEATURES` only (off globally). The Log in with Clever button also appears when `CLEVER_CLIENT_ID` is present (`window.clever_sso_available`). Portal and Instant Login hit `/auth/clever/callback` whenever credentials are configured.

## Bind a sandbox district

Do this in **LingoLinq**, not the Clever dashboard. Copy the district ID from Clever first.

1. Open the org at **Organizations → Settings** (Edit Organization Details). The site-admin org works; you do not need a child org.
2. In the **General** card, paste the Clever district ID and leave **Sync roster from Clever** on.
3. Click **Update Organization**.
4. Raise `total_licenses` high enough for the sandbox (Certification ISD is large). Users still provision as pending/unsponsored if seats run out.

The older **Authentication** SAML controls stay in the Administration card, which does not appear on the site-admin org. Clever bind is on General so `lingolinq_admin` can set it here.

## Login paths

- Clever Portal (required for certification)
- Instant Login: `https://clever.com/oauth/instant-login?client_id=<CLIENT_ID>&district_id=<DISTRICT_ID>`
- Log in with Clever on `/login`

Portal callbacks do not include `state`. The Rails callback must still succeed.

## Role mapping (v1)

| Clever | LingoLinq |
|--------|-----------|
| Student | Communicator (`org_user`) |
| Teacher | Supporter (`org_supervisor`) |
| Staff | Supporter (`org_supervisor`) |
| District admin | Org manager (`full_manager`) |
| Dual teacher + admin | One user, both supervisor and manager links |

Schools are stored on the org as `settings['clever_schools']`. Sections and Rooms are not synced in v1.

## Rostering

- Daily at 06:00 UTC via `scheduler:dispatch` (`sync_clever_rosters`)
- Best-effort update of that user on SSO login
- Primary identifier: Clever user ID (`UserLink` type `clever_auth`)
- Email match is in-org only
- Missing roster rows are archived on the Clever link and org membership is detached; the User and boards are not deleted
- The same Clever ID restores the account and membership if it reappears

## Certification answers (copy into the ASM form)

- API version: v3.0
- Key identifier: Clever user ID
- Top-level record: Organization (one per Clever district)
- School matching: store Clever school IDs on the org; no child orgs in v1
- User matching: Clever ID, then verified email inside that org, otherwise provision
- Sections / student-teacher associations: not synced in v1
- Updates: daily batch plus on login
- Missing fields: optional fields such as student email may be blank
- Archive: mark `clever_archived` and detach org membership; do not delete the User or boards
- Restore: clear the archive flag and re-attach membership when the Clever ID returns
- Dual-role users: one LingoLinq user keyed on the v3 `/users` id
- Shared devices: a new Clever login replaces other browser sessions for that user
- Logout: existing LingoLinq logout
- Failed login: `/login?clever_error=...` with a friendly message
- Signed-in identity: header and account menu show `display_name`

Sandbox SSO check before submit (one example each): student, teacher, staff, district_admin. Then ask the Application Success Manager to send the certification form. Review is typically 1–2 weeks. Sign the Clever Complete agreement before production credentials and live districts.

## Legal

Clever is a subprocessor for roster PII. Draft a row in `docs/legal/2026-08-16_subprocessor-register.md` before any **real** district. Sandbox/synthetic data is pre-tenant and does not start the 30-day customer notice clock. Scot signs register updates.
