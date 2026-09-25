# Restrict SSO configuration and account linking

Branch `chore/scot-session-660fd0df` (launcher branch; kept per the launcher contract). Base `origin/develop` at `9d9be1152`.

## Scope

- Organization external auth settings (`saml_metadata_url`, `saml_sso_url`, `saml_enforced`, `external_auth_shortcut`) are now changed only by accounts with `update_licenses` on the org (admin-org full managers), in `Api::OrganizationsController#update`. `#create` already requires `manage` on the admin org.
- `SessionController#saml_consume` signs in only through a `saml_auth` link recorded by the linking step (`lib/saml_login_policy.rb`). The account must be attached to the org, created by it or accepted by the holder, not a site-admin or admin-org-linked account, and have no outstanding parental-consent requirement.
- The linking step records who linked and when and never creates a session. The account itself may link; for an account the org created, a site admin or a full manager of that org may also link.

## Decisions (product owner, 2026-09-25)

- Links made before this change carry no record of the linking step and stop signing in; accounts link again.
- "Team account" means `User#admin?` or any link to the admin organization.
- Existing specs that expected sign-in by a matching user name or email were changed to expect refusal; sign-in flow specs now set up a recorded link first.

## Deferred

- `Organization.external_auth_for` still redirects password sign-in for enforced orgs, including accounts the new rules would refuse, and `spec/controllers/session_controller_spec.rb` "should redirect to oauth flow if required for user" asserts that behaviour. Aligning it needs owner approval.
- Moving the settings check into the model waits for PR #1055, which edits `app/models/organization.rb`.
- The org settings page still shows the external auth fields to org roles; their changes are ignored by the server.
