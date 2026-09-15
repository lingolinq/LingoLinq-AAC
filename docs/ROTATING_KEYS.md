# Rotating Keys

Quick guide for rotating shared API keys. Anyone with access to 1Password Shared Dev can do this; pushing a rotated value to the running app additionally needs GCP Secret Manager access on the environment's project.

> Render was decommissioned on 2026-09-09. The old `scripts/sync-render-env.js` push step and the hourly `sync-render-secrets.yml` workflow are gone. Runtime secrets now live in GCP Secret Manager and reach Cloud Run by name through `.github/workflows/deploy-cloudrun.yml` (`--set-secrets`), so a rotated value takes effect when a new revision is deployed.

Only rotate keys if you can complete the full flow including verification.

Typical rotation time: ~5-10 minutes (15-20 for Stripe).

## When to rotate

- A key was committed to git or pasted somewhere public.
- Someone left the team.
- Routine cycle (every 6 months for non-exposed keys).

## The three shared keys

| Key | Provider URL | 1Password location |
|---|---|---|
| GitHub PAT (`GITHUB_PERSONAL_ACCESS_TOKEN`, org/MCP use) | https://github.com/settings/tokens | Shared Dev → "GitHub PAT" |
| Notion integration | https://www.notion.so/profile/integrations | Shared Dev → "Notion" |
| n8n API key | https://n8n.lingolinq.com/settings/api | Shared Dev → "n8n API" |

## The rotation flow

The same 5 steps for any of the three keys:

```
1. Go to the provider URL above and generate a new key. Copy the value.
   Do not revoke the old key yet.
2. Open the corresponding 1Password item and update the value field.
   (Field name varies per item - look for the CONCEALED field with caps name like NOTION_API_KEY.)
3. If the app reads the key at runtime, add a new version of the matching
   Secret Manager secret in each environment's GCP project (lingolinq-prod for
   production; lingolinq-nonprod for staging and dev), then run the Cloud Run
   deploy workflow for that environment so a new revision picks it up. The
   list of secrets each project must hold is in the header of
   .github/workflows/deploy-cloudrun.yml.
   Update your local LingoLinq-AAC/.env with the new value so your dev server uses it.
   ⚠️ Skipping this will cause local dev to use stale keys and fail silently.
4. Verify the new key works.
5. Revoke the old key.
```

Revoking first can cause downtime if key generation, 1Password update, the Secret Manager push, or verification fails.

Post a note to the `#key-rotations` Google Chat space when a shared value changes (key name and environments only, never the value) so everyone with a local `.env` knows to pull it.

## What you need on your machine first

- **1Password CLI** (`op`): https://1password.com/downloads/command-line. Sign in with your existing 1Password account.
- **gcloud** authenticated against the environment's project, for the Secret Manager step.
- **Node 22**: matches Rails app's Ember setup. `nvm use 22`.

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

# Notion
curl -s -H "Authorization: Bearer $NOTION_API_KEY" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/users/me | jq .name

# n8n
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" https://n8n.lingolinq.com/api/v1/workflows | jq '.data | length'
```

Each should return a non-empty value. If any fail, check the corresponding 1Password item and your local `.env`.

## Common gotchas

- **n8n JWTs expire**. Current rotation cycle: rotate when expiration is within 30 days (check the `exp` claim).
- **Notion integration access**: after rotation, confirm the expected pages/databases are still connected (notion.so/my-integrations → Access tab). New tokens inherit access, but it's worth verifying.
- **GitHub PAT scopes**: when generating, copy scope set from the old token's settings. If you get a 403 from gh CLI after rotation, you probably missed a scope.

## Stripe rotation (manual n8n step required)

Stripe rotation requires a manual n8n credential update.

Stripe is rotated separately from the three shared keys above because the n8n credential cannot be auto-synced. n8n's `stripeApi` schema requires a `signatureSecret` (the webhook signing secret) that is not tracked in our `.env`, so `sync-configs.js` intentionally skips the Stripe credential. Every other surface gets the new key automatically; the n8n credential must be updated by hand.

> **Manual n8n update required:** the Stripe credential in n8n must be updated by hand; the sync scripts do not touch it.

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
5. Add a new version of STRIPE_SECRET_KEY in GCP Secret Manager (lingolinq-prod
   and lingolinq-nonprod) and run the Cloud Run deploy workflow so the Rails app
   picks it up.
6. MANUAL REQUIRED: open https://n8n.lingolinq.com → Credentials →
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
3. Add a new version of STRIPE_WEBHOOK_SECRET in GCP Secret Manager and run the
   Cloud Run deploy workflow.
4. MANUAL REQUIRED: open the n8n "Stripe account" credential and paste the new
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

## Do NOT

- Do not revoke before verifying.
- Do not share keys in chat tools.
- Do not skip the Secret Manager push for a runtime key; the app keeps using the old value until a new revision deploys.

## Cross-references

- `~/ai-company-brain/docs/KEY_ROTATION.md` (Scot's machine) — fuller runbook covering all org keys, including ones not in this app.
- `.github/workflows/deploy-cloudrun.yml` header -- the list of Secret Manager secrets each GCP project must hold.
