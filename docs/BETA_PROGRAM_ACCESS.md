# Beta program access (`beta_program_access`)

This document describes the **temporary** user preference used to mark accounts that should see beta-only pages, popups, or styling during controlled testing. It is intentionally **not** shown on the end-user Preferences screen; operators set it per user in the backend.

## What it is

- **Key:** `beta_program_access` (boolean), stored under `user.settings['preferences']['beta_program_access']`.
- **Default:** `true` for new self-service registrations (see `User.preference_defaults` in `app/models/user.rb`).
- **API / JSON:** The preference is included in the normal user JSON payload under `preferences` whenever the client receives a full user record with model permissions (same path as other `PREFERENCE_PARAMS` entries; see `lib/json_api/user.rb`).

## Registration defaults

- **Self-service signup (no start code):** New users get `beta_program_access: true` automatically during `User#generate_defaults`.
- **Org start code signup:** When a user registers with an organization start code, `Organization.parse_activation_code` sets `beta_program_access` from the org’s **`default_beta_program_access`** setting (`org.settings['default_beta_program_access']`).
  - **Unset or `true`:** User keeps beta access (same as site default).
  - **`false`:** User is opted out (`beta_program_access: false`).
- **Supervisor (user-issued) start codes:** Not affected by org settings; users keep the site default (`true`).
- **Org admin UI:** Organization → Settings → “Beta program access for start codes” toggle (`app/frontend/app/templates/organization/settings.hbs`).

## Beta welcome flow

After registration, Ember routes users with `beta_program_access` through `beta-welcome-message` → `beta-welcome`. Users **without** the flag go directly to home (`user.home`). Both beta welcome routes redirect away if the flag is off.

**Beta feedback** (nav link / drawer) is **not** gated on this flag today.

## Security (why we do it per user in production)

End users **cannot** turn this on for themselves through the standard preferences update API. In `User#process_params`, incoming `preferences['beta_program_access']` is **removed** unless the `updater` is an **admin** (`User#admin?`: site admin flag and/or organization admin manager—see `app/models/user.rb`).

Registration and start-code activation set the flag **server-side** only (trusted paths). Direct writes to `user.settings` in a **Rails console** (or other trusted server-side code) bypass the preferences API check and remain the usual way to adjust individual accounts.

## Enabling beta access for each tester

During beta you will typically repeat these steps **once per user** you want included (or rely on registration defaults above).

### 1. Open a Rails console

- **Development:** `bundle exec rails console` from the repo root.
- **Production / hosted:** Use your environment’s audited or approved console path. This project documents `bin/audit_console` and `AuditEvent` in `CLAUDE.md` and `README.md`—follow your team’s policy so production access stays audited.

### 2. Load the user and set the flag

By username (path):

```ruby
u = User.find_by_path('their_username')
u.settings['preferences'] ||= {}
u.settings['preferences']['beta_program_access'] = true
u.save!
```

By global id (if you have it from support tooling):

```ruby
u = User.find_by_global_id('1_12345')
u.settings['preferences'] ||= {}
u.settings['preferences']['beta_program_access'] = true
u.save!
```

### 3. Confirm

```ruby
u.settings['preferences']['beta_program_access']
# => true
```

### 4. Optional: batch a list of usernames

```ruby
%w[alice bob carol].each do |name|
  u = User.find_by_path(name)
  next unless u
  u.settings['preferences'] ||= {}
  u.settings['preferences']['beta_program_access'] = true
  u.save!
end
```

Adjust lookup if your identifiers are emails or global ids.

### 5. Client refresh

After `save!`, the **next** full user load from the API will include the updated preference. Testers may need a **full reload** of the web app (or sign out and back in) so Ember picks up the new `currentUser.preferences` payload, depending on how long their session caches the user record.

### Registration flow note

Email/password signup calls `session.override()`, which **hard-reloads** the app. The beta welcome route is not reached via an in-app transition; instead `register.js` sets `sessionStorage['ll_pending_beta_welcome']` and `index.js` redirects to `beta-welcome-message` on the next boot. The home tour (`ll_auto_open_home_tour`) is stashed **after** beta welcome agreement, not at initial signup.

## Frontend usage (for developers)

- **Service:** `app-state` exposes a boolean computed **`beta_program_access`** derived from `currentUser.preferences.beta_program_access`.
- **Root layout:** When true, the main Ember root (`#within_ember` in `app/frontend/app/templates/application.hbs`) gets the CSS class **`beta-program-access`**, so you can scope beta-only styles or quick checks without new user-facing copy.
- **Templates / components:** Gate UI with `{{#if this.app_state.beta_program_access}}` … `{{/if}}` (or the equivalent in JS), and use **i18n** for any strings shown to testers.

## Removing access

Per user:

```ruby
u = User.find_by_path('their_username')
u.settings['preferences'] ||= {}
u.settings['preferences']['beta_program_access'] = false
u.save!
```

Or delete the key (will fall back to default `true` on next `generate_defaults` for a new record; existing users keep whatever was last saved):

```ruby
u.settings['preferences'].delete('beta_program_access')
u.save!
```

## When the beta ends

1. Remove or disable **Ember** gates that depend on `app_state.beta_program_access` / the `beta-program-access` class.
2. Optionally clear the preference on affected users (see above).
3. Optionally remove the key from `PREFERENCE_PARAMS` and `preference_defaults` in `app/models/user.rb` once nothing references it (old rows can keep the key harmlessly if you leave the plumbing in place).

## Related: feature flags

For **named product features** rolled out gradually, the codebase also uses **`feature_flags`** (`lib/feature_flags.rb`, `user.settings['feature_flags']`, `User#enable_feature`). Use **`beta_program_access`** when you want a simple per-account switch for **ad-hoc beta UI** without registering a global frontend feature flag.

## Automated tests

Behavior is covered in:

- `spec/models/user_spec.rb` (defaults, who may set the preference via `process_params`)
- `spec/models/organization_spec.rb` (start-code activation respects org default)
- `spec/controllers/api/users_controller_spec.rb` (registration with/without start code)
- `spec/lib/json_api/user_spec.rb` (preference appears in `JsonApi::User.build_json` when set)
- `spec/lib/json_api/organization_spec.rb` (`default_beta_program_access` in org JSON)
