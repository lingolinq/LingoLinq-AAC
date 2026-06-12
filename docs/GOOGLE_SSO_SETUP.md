# Google SSO setup

Google Sign-In uses **OAuth 2.0 Web application** credentials. A Google **API key** (Maps, Translate, TTS, etc.) cannot be used for login.

## Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**.
2. Configure the consent screen (app name, support email).
3. **Credentials** → **Create credentials** → **OAuth client ID** → type **Web application**.
4. Add **Authorized JavaScript origins** for each environment, e.g.:
   - `http://localhost:8184` (local Ember dev server — user-facing port)
   - `https://www.lingolinq.com`
   - staging/dev hosts as needed
5. Add **Authorized redirect URIs** (must match exactly):
   - `http://localhost:8184/auth/google/callback`
   - `https://www.lingolinq.com/auth/google/callback`

Local Rails runs on port **5000** internally; Ember on **8184** proxies `/auth/*` to Rails via `app/frontend/server/index.js` (loaded before the SPA history fallback). OAuth token exchange runs server-side on Rails; all **browser redirects** use **8184**.

Optional env override:

```bash
FRONTEND_ORIGIN=http://localhost:8184
```

Do **not** register `:5000` as a Google redirect URI unless you are testing Rails directly without Ember.

### Troubleshooting: `Error 400: redirect_uri_mismatch`

Google shows the exact URI your app sent (e.g. `redirect_uri=http://localhost:8184/auth/google/callback`). That string must appear **verbatim** under **Authorized redirect URIs** for the same OAuth client whose `GOOGLE_OAUTH_CLIENT_ID` is in your `.env`.

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. Open your **OAuth 2.0 Client ID** (Web application) — the one matching `GOOGLE_OAUTH_CLIENT_ID`
3. Under **Authorized redirect URIs**, click **Add URI** and paste exactly:
   ```
   http://localhost:8184/auth/google/callback
   ```
4. Under **Authorized JavaScript origins**, ensure you also have:
   ```
   http://localhost:8184
   ```
5. **Save**. Changes can take a minute or two to apply.

Common mistakes:
- Registered `http://localhost:8184//auth/google/callback` (double slash) instead of `http://localhost:8184/auth/google/callback`
- Registered `http://localhost:5000/auth/google/callback` instead of **8184**
- Trailing slash (`.../callback/` vs `.../callback`)
- `https` instead of `http` for local dev
- Editing a different OAuth client than the one in `.env`

Scopes used: `openid`, `email`, `profile`.

## Environment variables

Set on each Render service (and locally):

```bash
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

Never commit secrets or expose the client secret in the Ember frontend.

## Feature flag

UI and routes are gated by the `google_sso` frontend feature flag in `lib/feature_flags.rb`. Enable per user via `settings.feature_flags.google_sso` or add to `ENABLED_FRONTEND_FEATURES` for global rollout.

After changing `ENABLED_FRONTEND_FEATURES`, clear the Sprockets cache so `globals.js` picks up the change:

```bash
rm -rf tmp/cache/assets && bin/fresh_start
```
