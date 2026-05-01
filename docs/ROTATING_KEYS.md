# Rotating Keys

Quick guide for rotating shared API keys. Anyone with access to 1Password Shared Dev (or Admin for Render) can do this.

## When to rotate

- A key was committed to git or pasted somewhere public.
- Someone left the team.
- Routine cycle (every 6 months for non-exposed keys).

## The four shared keys

| Key | Provider URL | 1Password location |
|---|---|---|
| GitHub PAT (org/MCP use) | https://github.com/settings/tokens | Shared Dev → "GitHub PAT" |
| Render API key | https://dashboard.render.com/u/settings#api-keys | Admin → "Render API key" |
| Notion integration | https://www.notion.so/profile/integrations | Shared Dev → "Notion" |
| n8n API key | https://lingolinq-n8n.onrender.com/settings/api | Shared Dev → "n8n API" |

## The rotation flow

The same 5 steps for any of the four keys:

```
1. Go to the provider URL above and revoke the old key.
2. Generate a new key. Copy the value.
3. Open the corresponding 1Password item and update the value field.
   (Field name varies per item - look for the CONCEALED field with caps name like NOTION_API_KEY.)
4. From the LingoLinq-AAC repo root, run:
     node scripts/sync-render-env.js --apply --source op
   This pushes the new value to all 6 Render services (dev, staging, prod, workers, scheduler).
5. Update your local LingoLinq-AAC/.env with the new value so your dev server uses it.
```

That's it. The hourly GitHub Actions workflow `.github/workflows/sync-render-secrets.yml` re-runs step 4 on a cron, so even if you forget step 4, prod will be in sync within an hour.

### Auto-notification on rotation

When the sync script pushes a changed value to Render (either manually or via the hourly cron), it posts to the `#key-rotations` Google Chat space so everyone with a local `.env` knows to pull the new value. The notification contains the key name and which environments changed — no secret values are ever included.

If you don't see a notification after running sync with `--apply` but expected one, check:
1. `GOOGLE_CHAT_WEBHOOK_KEY_ROTATION` env var is set (in your shell or `.env`).
2. You actually ran with `--apply` (dry-run never notifies).
3. There was an actual change (unchanged keys don't trigger posts).

## What you need on your machine first

- **1Password CLI** (`op`): https://1password.com/downloads/command-line. Sign in with your existing 1Password account.
- **Render sync token**: a 1Password service-account token that lets `sync-render-env.js` read 1Password and push to Render. Ask Scot or Dominic for the value (they'll share via 1Password). Add to your local `.env` as `OP_RENDER_SYNC_TOKEN=...`.
- **Render API key**: the same value stored in 1Password Admin (Render API key item). Add to your local `.env` as `RENDER_API_KEY=...`.
- **Node 20**: matches Rails app's Ember setup. `nvm use 20`.

## Personal vs shared keys

Some keys are personal (each developer keeps their own, no sharing):

- **Your git push PAT**: lives in `~/.gitconfig` or your OS credential helper. You set this up once during git setup; it's not in 1Password and not shared. Manage it on your own. Different from the shared "GitHub PAT" item in Shared Dev (that one's for org/automation use, not git pushes).
- **Your personal Clockify key**: only you use it.

Everything else listed above is shared via 1Password.

## Verifying after rotation

Quick verification commands per key:

```
# GitHub PAT
curl -s -H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN" https://api.github.com/user | jq .login

# Render API key
curl -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services | jq '.[0].service.name'

# Notion
curl -s -H "Authorization: Bearer $NOTION_API_KEY" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/users/me | jq .name

# n8n
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" https://lingolinq-n8n.onrender.com/api/v1/workflows | jq '.data | length'
```

Each should return a non-empty value. If any fail, check the corresponding 1Password item and your local `.env`.

## Common gotchas

- **Render API key has no expiration** but Render allows multiple active keys. Always revoke the old one explicitly after rotation, otherwise it stays valid forever.
- **n8n JWTs expire**. Current rotation cycle: when the `exp` claim is within 30 days, regenerate.
- **Notion integration access**: after rotation, double-check the integration still has the right pages/databases connected (notion.so/my-integrations → Access tab). New tokens inherit access, but it's worth verifying.
- **GitHub PAT scopes**: when generating, copy scope set from the old token's settings. If you get a 403 from gh CLI after rotation, you probably missed a scope.

## Stripe rotation (manual n8n step required)

Stripe is rotated separately from the four shared keys above because the n8n credential cannot be auto-synced. n8n's `stripeApi` schema requires a `signatureSecret` (the webhook signing secret) that is not tracked in our `.env`, so `sync-configs.js` intentionally skips the Stripe credential. Every other surface gets the new key automatically; the n8n credential must be updated by hand.

Two Stripe values can rotate:

- `STRIPE_SECRET_KEY`: API secret key. Used by the Rails app, the `stripe` MCP, and n8n.
- `STRIPE_WEBHOOK_SECRET`: webhook signing secret. Only rotate if compromised. Used by the Rails app and the n8n credential's `signatureSecret` field.

### Flow for STRIPE_SECRET_KEY

```
1. Stripe Dashboard → Developers → API keys: roll the secret key.
   Choose a grace period (1 hour or longer) so the rest of the steps
   can finish before the old key dies.
2. Update STRIPE_SECRET_KEY in ~/ai-company-brain/config/.env.
3. Update STRIPE_SECRET_KEY in 1Password Shared Dev (item "Stripe").
4. node ~/ai-company-brain/scripts/sync-configs.js
   This pushes the new key to all MCP clients and posts a key-rotation
   notification to the #key-rotations Google Chat space via the
   GOOGLE_CHAT_WEBHOOK_KEY_ROTATION integration.
5. node ~/ai-company-brain/scripts/sync-render-env.js --apply --source op
   Pushes the new key to the Rails app on all 6 Render services.
6. MANUAL: open https://lingolinq-n8n.onrender.com → Credentials →
   "Stripe account". Paste the new STRIPE_SECRET_KEY. Leave
   signatureSecret unchanged. Save. sync-configs.js does NOT touch
   this credential, so this step is on you.
7. Stripe Dashboard: revoke the old key ("Expire now" on the rolled key).
8. Verify (see below).
```

### Flow for STRIPE_WEBHOOK_SECRET (only if compromised)

```
1. Stripe Dashboard → Developers → Webhooks → select endpoint →
   Roll signing secret.
2. Update STRIPE_WEBHOOK_SECRET in ~/ai-company-brain/config/.env
   and 1Password Shared Dev.
3. node ~/ai-company-brain/scripts/sync-render-env.js --apply --source op
4. MANUAL: open the n8n "Stripe account" credential and paste the new
   value into the signatureSecret field. Save.
5. Stripe Dashboard: revoke the old signing secret.
```

### Verifying after Stripe rotation

```
# Old key should return 401
curl -s -o /dev/null -w "%{http_code}\n" -u sk_OLD_KEY: \
  https://api.stripe.com/v1/customers
# expect: 401

# New key should return JSON
curl -s -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/customers \
  | jq '.object'
# expect: "list"
```

Then test one MCP call (`mcp__stripe`) and trigger one n8n workflow that uses the Stripe credential to confirm the n8n update took.

### Why Stripe is special

Future-you will read this and wonder why Stripe is the only key with its own section. The reason: every other auto-synced n8n credential has a single rotating field (an API key or token). The n8n `stripeApi` schema bundles the API key together with the webhook signing secret as required fields, and we have no clean way to track the signing secret in `.env` without leaking it into MCP client configs that don't need it. Treating Stripe as manual is the simplest correct answer. The exclusion is documented at the source in `~/ai-company-brain/config/mcp-servers.json` under the `n8n` description.

## Cross-references

- `~/ai-company-brain/docs/KEY_ROTATION.md` (Scot's machine) — fuller runbook covering all org keys, including ones not in this app.
- `docs/RENDER-ENV-MANIFEST.md` (in this repo) — full list of every env var Render expects.
