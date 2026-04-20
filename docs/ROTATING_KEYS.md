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

## Cross-references

- `~/ai-company-brain/docs/KEY_ROTATION.md` (Scot's machine) — fuller runbook covering all org keys, including ones not in this app.
- `docs/RENDER-ENV-MANIFEST.md` (in this repo) — full list of every env var Render expects.
