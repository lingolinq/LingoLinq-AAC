# Clever SSO + Secure Sync

Date: 2026-09-15
Branch: `feat/melissa-clever-sso-rostering`

## Goal

District users can sign in through Clever (Portal, Instant Login, Log in with Clever) and LingoLinq accounts stay in sync with the district roster so the app can pass Clever certification.

## What landed

- OAuth start/callback at `/auth/clever/start` and `/auth/clever/callback`
- Portal callbacks work without `state`
- `UserLink` type `clever_auth` hashed like `google_auth`
- Daily + login roster sync of users and school IDs (no Rooms)
- Archive detaches org membership; restore re-attaches; User and boards stay
- Feature flag `clever_sso` (AVAILABLE only)
- Org settings: Clever district ID and roster sync toggle (visible without SAML)
- Docs: `docs/CLEVER_SSO_SETUP.md` (dashboard checklist, cert answers, scope email)

## Dashboard still needed (human)

1. Register redirect URIs in the Clever dashboard (local 8184 + staging HTTPS primary)
2. Enable Instant Login user types: student, teacher, staff, district_admin
3. Email application-interest@clever.com for Secure Sync scopes (template in setup doc)
4. Put `CLEVER_CLIENT_ID` / `CLEVER_CLIENT_SECRET` in 1Password and `.env.op.local` as `op://` refs
5. Bind a sandbox district ID on a LingoLinq org
6. After sandbox SSO works per user type, submit certification via the ASM

## Decisions

- One LingoLinq org per Clever district
- No child orgs or section/Room sync in v1
- Seats: sponsored when available, otherwise pending/unsponsored
- Archive the Clever link and detach org membership; never delete the User or boards
- Zeitwerk path for `CleverOAuth` is `lib/clever_o_auth.rb`
