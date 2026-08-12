#!/usr/bin/env node
/**
 * sync-render-env.js
 *
 * Syncs environment variables to LingoLinq Render services (dev, staging, prod).
 * Reads secrets from 1Password vault (preferred) or falls back to a local .env file.
 *
 * Prerequisites:
 *   - 1Password CLI: https://developer.1password.com/docs/cli/get-started
 *   - Render API key in RENDER_API_KEY env var or .env file
 *   - `op signin` completed (for 1Password mode)
 *
 * Usage:
 *   node sync-render-env.js                    # dry-run (default, shows diff)
 *   node sync-render-env.js --apply            # push changes to Render
 *   node sync-render-env.js --apply --service prod   # push to prod only
 *   node sync-render-env.js --apply --service dev    # push to dev only
 *   node sync-render-env.js --source op        # read from 1Password (default)
 *   node sync-render-env.js --source env       # read from .env file
 *   node sync-render-env.js --audit            # show which vars are set on each service
 *   node sync-render-env.js --export-to-op     # export current .env keys to 1Password
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RENDER_SERVICES = {
  dev: {
    id: 'srv-d510c5emcj7s73966pug',
    name: 'lingolinq-dev',
    branch: 'develop',
  },
  staging: {
    id: 'srv-d510c13e5dus73c8lg10',
    name: 'lingolinq-staging',
    branch: 'staging',
  },
  prod: {
    id: 'srv-d510bsemcj7s73966i60',
    name: 'lingolinq-prod',
    branch: 'main',
  },
};

// Workers share env with their parent web service via env groups,
// but if you need to sync them separately, add them here.
const RENDER_WORKERS = {
  'dev-worker': {
    id: 'srv-d66jbilum26s73aa7mn0',
    name: 'lingolinq-dev-worker',
  },
  'prod-worker': {
    id: 'srv-d66jbgogjchc73erhnfg',
    name: 'lingolinq-prod-worker',
  },
};

// 1Password vault structure (post-2026-04-06 restructure):
//   - LingoLinq Admin: AWS Credentials, Render API (admin-only access)
//   - LingoLinq Shared Dev: ANTHROPIC_API_KEY, GEMINI_API_KEY, Notion, Stripe (test), Email Config, etc. (all devs)
//   - LingoLinq Staging: per-env Rails secrets, Stripe staging, etc.
//   - LingoLinq Prod: per-env Rails secrets, Stripe LIVE, Database, etc.
const VAULTS = {
  admin: 'LingoLinq Admin',
  shared: 'LingoLinq Shared Dev',
  dev: 'LingoLinq Shared Dev',  // dev-specific values stored in Shared Dev vault
  staging: 'LingoLinq Staging',
  prod: 'LingoLinq Prod',
};

// Keys that should be synced to Render services.
// Format: { renderEnvName: { vault, item, field, perEnv|shared, defaultValue,
//                            renderEnvironments } }
// `shared`: same value across all envs (read from vault[vault])
// `perEnv`: different value per configured Render environment (read from vault[env])
// `defaultValue`: hardcoded, no 1Password lookup
// `renderEnvironments`: optional allowlist. Use this when a key belongs on only
// a subset of Render services. Omitted means all Render services.
const KEY_MANIFEST = {
  // -- Rails app secrets (per-environment, in env-specific vault) --
  SECRET_KEY_BASE:       { vault: null, item: 'Rails Secrets', field: 'SECRET_KEY_BASE', perEnv: true },
  SECURE_ENCRYPTION_KEY: { vault: null, item: 'Rails Secrets', field: 'SECURE_ENCRYPTION_KEY', perEnv: true },
  SECURE_NONCE_KEY:      { vault: null, item: 'Rails Secrets', field: 'SECURE_NONCE_KEY', perEnv: true },
  COOKIE_KEY:            { vault: null, item: 'Rails Secrets', field: 'COOKIE_KEY', perEnv: true },
  SMS_ENCRYPTION_KEY:    { vault: null, item: 'Rails Secrets', field: 'SMS_ENCRYPTION_KEY', perEnv: true },

  // -- AWS (admin vault, shared across all envs) --
  AWS_KEY:               { vault: 'admin', item: 'AWS Credentials', field: 'AWS_KEY', shared: true },
  AWS_SECRET:            { vault: 'admin', item: 'AWS Credentials', field: 'AWS_SECRET', shared: true },

  // -- Bedrock runtime AI (Render dev + staging only) --
  // These are dedicated environment-specific Bedrock principals, not the
  // legacy AWS_KEY/AWS_SECRET pair above. AiClient ignores that legacy pair,
  // but does accept AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY. This synchronizer
  // never writes those standard names; do not assume their presence would
  // leave Bedrock dark if the dedicated pair were absent.
  //
  // Render production is deliberately EXCLUDED. Runtime production is Cloud
  // Run and mounts this pair from Secret Manager in deploy-cloudrun.yml; the
  // hourly Render sync must never duplicate that production credential there.
  BEDROCK_AWS_KEY: {
    item: 'BEDROCK_RUNTIME_AI',
    field: 'BEDROCK_AWS_KEY',
    perEnv: true,
    required: true,
    renderEnvironments: ['dev', 'staging'],
  },
  BEDROCK_AWS_SECRET: {
    item: 'BEDROCK_RUNTIME_AI',
    field: 'BEDROCK_AWS_SECRET',
    perEnv: true,
    required: true,
    renderEnvironments: ['dev', 'staging'],
  },
  // Explicit rather than falling back to a legacy Render AWS_REGION setting.
  // This region hosts the approved classic-plane Haiku inference profile.
  BEDROCK_AWS_REGION: {
    defaultValue: 'us-west-2',
    renderEnvironments: ['dev', 'staging'],
  },
  // Non-secret control configuration. A present but malformed value fails AI
  // closed, while an absent value would skip the account assertion entirely.
  BEDROCK_EXPECTED_AWS_ACCOUNT: {
    defaultValue: '239044785114',
    renderEnvironments: ['dev', 'staging'],
  },

  // -- Email (shared vault) --
  DEFAULT_EMAIL_FROM:    { vault: 'shared', item: 'Email Config', field: 'DEFAULT_EMAIL_FROM', shared: true },
  SYSTEM_ERROR_EMAIL:    { vault: 'shared', item: 'Email Config', field: 'SYSTEM_ERROR_EMAIL', shared: true },
  NEW_REGISTRATION_EMAIL:{ vault: 'shared', item: 'Email Config', field: 'NEW_REGISTRATION_EMAIL', shared: true },

  // -- AI/API keys (shared vault) --
  // Per-key 1Password items (the old combined "AI Keys" item was split into
  // per-key API-credential items on 2026-07-17). ANTHROPIC uses the standard
  // API-credential `credential` field; GEMINI uses a custom field of its own name.
  GEMINI_API_KEY:        { vault: 'shared', item: 'GEMINI_API_KEY', field: 'GEMINI_API_KEY', shared: true },
  ANTHROPIC_API_KEY:     { vault: 'shared', item: 'ANTHROPIC_API_KEY', field: 'credential', shared: true },

  // -- Google APIs (shared vault) --
  GOOGLE_TTS_TOKEN:      { vault: 'shared', item: 'Google APIs', field: 'GOOGLE_TTS_TOKEN', shared: true },
  GOOGLE_TRANSLATE_TOKEN:{ vault: 'shared', item: 'Google APIs', field: 'GOOGLE_TRANSLATE_TOKEN', shared: true },
  GOOGLE_PLACES_TOKEN:   { vault: 'shared', item: 'Google APIs', field: 'GOOGLE_PLACES_TOKEN', shared: true },
  YOUTUBE_API_KEY:       { vault: 'shared', item: 'Google APIs', field: 'YOUTUBE_API_KEY', shared: true },

  // -- Stripe (per-env: test for dev/staging, live for prod) --
  STRIPE_SECRET_KEY:     { vault: null, item: 'Stripe', field: 'STRIPE_SECRET_KEY', perEnv: true },
  STRIPE_PUBLIC_KEY:     { vault: null, item: 'Stripe', field: 'STRIPE_PUBLIC_KEY', perEnv: true },

  // -- External services (shared vault) --
  OPENSYMBOLS_SECRET:    { vault: 'shared', item: 'OpenSymbols', field: 'OPENSYMBOLS_SECRET', shared: true },
  IPLOCATE_API_KEY:      { vault: 'shared', item: 'External Services', field: 'IPLOCATE_API_KEY', shared: true },

  // -- Performance (shared, hardcoded) --
  LD_PRELOAD:            { defaultValue: '/usr/lib/x86_64-linux-gnu/libjemalloc.so.2' },
  MALLOC_CONF:           { defaultValue: 'background_thread:true,narenas:2,dirty_decay_ms:1000' },
  RAILS_SERVE_STATIC_FILES: { defaultValue: 'enabled' },

  // -- Auto-managed by Render (DO NOT sync) --
  // DATABASE_URL:  set by Render
  // REDIS_URL:     set by Render
  // LEADER_POSTGRES_URL:  set manually on prod for Octopus sharding
};

function renderEnvironmentsFor(config) {
  const environments = config.renderEnvironments || Object.keys(RENDER_SERVICES);
  if (!Array.isArray(environments) || environments.length === 0) {
    throw new Error('Manifest renderEnvironments must be a non-empty array');
  }
  for (const environment of environments) {
    if (!Object.prototype.hasOwnProperty.call(RENDER_SERVICES, environment)) {
      throw new Error(`Manifest names unknown Render environment: ${environment}`);
    }
  }
  return environments;
}

function valuesForRenderEnvironments(config, value) {
  return Object.fromEntries(renderEnvironmentsFor(config).map(environment => [environment, value]));
}

const ENV_FILE_PATH = path.join(os.homedir(), 'ai-company-brain', 'config', '.env');
const RENDER_API_BASE = 'https://api.render.com/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function getRenderApiKey() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY;
  const envVars = loadEnvFile(ENV_FILE_PATH);
  if (envVars.RENDER_API_KEY) return envVars.RENDER_API_KEY;
  console.error('Error: RENDER_API_KEY not found in environment or .env file');
  process.exit(1);
}

function renderApiRequest(method, reqPath, body = null) {
  const apiKey = getRenderApiKey();
  return new Promise((resolve, reject) => {
    const options = {
      method,
      hostname: 'api.render.com',
      path: `/v1${reqPath}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`Render API ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getRenderEnvVars(serviceId) {
  // Fail CLOSED: any failure here must THROW, never degrade to []. Render's
  // env-vars PUT replaces the service's ENTIRE list, and the apply path
  // builds its payload from this read -- so a swallowed error (e.g. a 401
  // from a revoked API key) that returned [] would turn --apply into "wipe
  // every unmanaged var on prod" (2026-07-06 near-miss during the Render
  // key rotation; this script runs hourly with --apply via
  // .github/workflows/sync-render-secrets.yml, unattended).
  const vars = [];
  let cursor = null;
  const PAGE_LIMIT = 100;
  const MAX_PAGES = 50; // far beyond any real service; a loop guard, not a cap
  const seenCursors = new Set();
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      throw new Error(`Pagination for ${serviceId} exceeded ${MAX_PAGES} pages -- aborting rather than trusting the read`);
    }
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const result = await renderApiRequest(
      'GET',
      `/services/${serviceId}/env-vars?limit=${PAGE_LIMIT}${cursorParam}`
    );
    if (!Array.isArray(result)) {
      throw new Error(`Unexpected env-vars response for ${serviceId}: ${JSON.stringify(result).slice(0, 200)}`);
    }
    if (result.length === 0) break;
    // Render wraps each var in { envVar: { key, value }, cursor }
    for (const item of result) vars.push(item.envVar || item);
    // Follow the cursor so a service with more vars than one page is read
    // completely -- a truncated read has the same wipe effect as a failed one.
    cursor = result[result.length - 1].cursor;
    if (result.length < PAGE_LIMIT || !cursor) break;
    if (seenCursors.has(cursor)) {
      throw new Error(`Pagination for ${serviceId} repeated cursor ${cursor} -- aborting rather than trusting the read`);
    }
    seenCursors.add(cursor);
  }
  return vars;
}

async function updateRenderEnvVars(serviceId, envVars) {
  // Render expects: PUT /services/{serviceId}/env-vars with body [{key, value}]
  const payload = envVars.map(({ key, value }) => ({ key, value }));
  return renderApiRequest('PUT', `/services/${serviceId}/env-vars`, payload);
}

function opRead(vaultName, itemTitle, fieldName) {
  try {
    // Use the render-sync service account token (has access to all 4 vaults)
    // Falls back to whatever token is in the env if OP_RENDER_SYNC_TOKEN is not set
    const envVars = loadEnvFile(ENV_FILE_PATH);
    const token = process.env.OP_RENDER_SYNC_TOKEN || envVars.OP_RENDER_SYNC_TOKEN || process.env.OP_SERVICE_ACCOUNT_TOKEN || '';
    const result = execSync(`op read "op://${vaultName}/${itemTitle}/${fieldName}"`, {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
    }).trim();
    return result;
  } catch {
    return null;
  }
}

function opIsSignedIn() {
  try {
    const envVars = loadEnvFile(ENV_FILE_PATH);
    const token = process.env.OP_RENDER_SYNC_TOKEN || envVars.OP_RENDER_SYNC_TOKEN || process.env.OP_SERVICE_ACCOUNT_TOKEN || '';
    if (!token) return false;
    execSync('op vault list', {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
    });
    return true;
  } catch {
    return false;
  }
}

function maskValue(val) {
  if (!val || val.length < 8) return '****';
  return val.slice(0, 4) + '...' + val.slice(-4);
}

// Services or required manifest values that failed to sync: current env vars
// unreadable, read as suspiciously empty in apply mode, missing required
// values, or the update PUT itself failed.
// Non-empty at exit -> exit code 1, so the GitHub Actions workflow (and any
// wrapper) sees the failure instead of a clean "Done."
const syncFailures = [];

function reportEnvReadFailure(serviceName, reason) {
  console.error(`  ERROR: ${reason}`);
  console.error(`  Skipping ${serviceName}: without a trusted read of its current env vars,`);
  console.error('  an apply would replace the ENTIRE env-var list with only the managed');
  console.error('  keys and wipe everything unmanaged (UPLOADS_S3_*, etc.).');
  syncFailures.push(serviceName);
}

function reportRequiredManifestValueFailure(key, environment, reason) {
  console.error(`  ERROR: Required ${key} for ${environment} is unavailable: ${reason}`);
  syncFailures.push(`${environment}:${key}`);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function audit(services) {
  console.log('\n=== Render Environment Variable Audit ===\n');

  for (const [envName, svc] of Object.entries(services)) {
    console.log(`--- ${envName.toUpperCase()} (${svc.name}) ---`);
    let vars;
    try {
      vars = await getRenderEnvVars(svc.id);
    } catch (err) {
      console.warn(`  Warning: Could not read env vars: ${err.message}\n`);
      continue;
    }
    if (vars.length === 0) {
      console.log('  (no vars found)\n');
      continue;
    }

    const sorted = vars.sort((a, b) => a.key.localeCompare(b.key));
    for (const v of sorted) {
      const val = v.value || '(empty)';
      console.log(`  ${v.key} = ${maskValue(val)}`);
    }
    console.log(`  Total: ${vars.length} variables\n`);
  }

  // Cross-environment comparison
  console.log('--- Cross-Environment Comparison ---');
  const allVars = {};
  for (const [envName, svc] of Object.entries(services)) {
    try {
      const vars = await getRenderEnvVars(svc.id);
      allVars[envName] = new Set(vars.map(v => v.key));
    } catch (err) {
      console.warn(`  Warning: skipping ${envName} in comparison (read failed: ${err.message})`);
    }
  }

  const allKeys = new Set();
  for (const keys of Object.values(allVars)) {
    for (const k of keys) allKeys.add(k);
  }

  const missing = [];
  const comparedEnvs = Object.keys(allVars);
  for (const key of [...allKeys].sort()) {
    const present = Object.entries(allVars)
      .filter(([, keys]) => keys.has(key))
      .map(([env]) => env);
    if (present.length < comparedEnvs.length) {
      const absent = comparedEnvs.filter(e => !present.includes(e));
      missing.push({ key, present, absent });
    }
  }

  if (comparedEnvs.length < Object.keys(services).length) {
    const unread = Object.keys(services).filter(e => !comparedEnvs.includes(e));
    console.log(`  Comparison INCOMPLETE: could not read [${unread.join(', ')}].`);
  }
  if (missing.length === 0) {
    console.log(comparedEnvs.length === Object.keys(services).length
      ? '  All environments have the same variables.\n'
      : '  No differences among the environments that could be read.\n');
  } else {
    console.log('  Variables missing from some environments:');
    for (const m of missing) {
      console.log(`  ${m.key}: missing from [${m.absent.join(', ')}]`);
    }
    console.log();
  }
}

async function sync(services, source, apply, dependencies = {}) {
  const isSignedIn = dependencies.isSignedIn || opIsSignedIn;
  const readSecret = dependencies.readSecret || opRead;
  console.log(`\n=== Sync Render Env Vars (source: ${source}, mode: ${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  // Load desired values
  let desiredValues = {};

  if (source === 'op') {
    if (!isSignedIn()) {
      console.error('Error: 1Password CLI not signed in. Run: op signin');
      process.exit(1);
    }
    console.log('Reading secrets from 1Password vaults...');
    for (const [key, config] of Object.entries(KEY_MANIFEST)) {
      // Handle keys with static default values (no 1Password needed)
      if (config.defaultValue) {
        desiredValues[key] = valuesForRenderEnvironments(config, config.defaultValue);
        continue;
      }
      if (config.shared) {
        // Read once from the configured vault, then distribute only to the
        // manifest's allowed Render environments.
        const vaultName = VAULTS[config.vault];
        if (!vaultName) {
          console.warn(`  Warning: ${key} has invalid vault key: ${config.vault}`);
          continue;
        }
        const val = readSecret(vaultName, config.item, config.field);
        if (val) {
          desiredValues[key] = valuesForRenderEnvironments(config, val);
        } else {
          console.warn(`  Warning: Could not read ${vaultName}/${config.item}/${config.field}`);
        }
      } else if (config.perEnv) {
        // Read once per allowed environment from that environment's vault.
        desiredValues[key] = {};
        for (const env of renderEnvironmentsFor(config)) {
          const vaultName = VAULTS[env];
          const val = readSecret(vaultName, config.item, config.field);
          if (val) {
            desiredValues[key][env] = val;
          } else {
            const location = `${vaultName}/${config.item}/${config.field}`;
            if (config.required) {
              reportRequiredManifestValueFailure(key, env, `Could not read ${location}`);
            } else {
              console.warn(`  Warning: Could not read ${location}`);
            }
          }
        }
      }
    }
  } else {
    // Read from .env file -- same value for all environments
    console.log(`Reading secrets from ${ENV_FILE_PATH}...`);
    const envVars = loadEnvFile(ENV_FILE_PATH);
    for (const [key, config] of Object.entries(KEY_MANIFEST)) {
      if (config.defaultValue) {
        desiredValues[key] = valuesForRenderEnvironments(config, config.defaultValue);
      } else if (envVars[key]) {
        desiredValues[key] = valuesForRenderEnvironments(config, envVars[key]);
      }
    }
  }

  // Do not write a partial configuration. In particular, the static Bedrock
  // region/account settings must not land without both credential fields.
  if (syncFailures.length > 0) {
    console.error('\nRequired manifest values are unavailable; no Render environment will be changed.');
    console.log('\nDone.\n');
    return;
  }

  // Track changes across all environments for end-of-run notification
  const appliedChanges = {};  // { KEY_NAME: Set<envName> }

  // Compare and update each service
  for (const [envName, svc] of Object.entries(services)) {
    console.log(`\n--- ${envName.toUpperCase()} (${svc.name}) ---`);
    let currentVars;
    try {
      currentVars = await getRenderEnvVars(svc.id);
    } catch (err) {
      reportEnvReadFailure(svc.name, `Could not read current env vars: ${err.message}`);
      continue;
    }
    const currentMap = {};
    for (const v of currentVars) {
      currentMap[v.key] = v.value;
    }

    const updates = [];
    const additions = [];
    const unchanged = [];

    for (const [key, envValues] of Object.entries(desiredValues)) {
      const desired = envValues[envName];
      if (!desired) continue;

      if (currentMap[key] === undefined) {
        additions.push({ key, value: desired });
      } else if (currentMap[key] !== desired) {
        updates.push({ key, value: desired, old: currentMap[key] });
      } else {
        unchanged.push(key);
      }
    }

    if (additions.length > 0) {
      console.log(`  NEW (${additions.length}):`);
      for (const a of additions) {
        console.log(`    + ${a.key} = ${maskValue(a.value)}`);
      }
    }

    if (updates.length > 0) {
      console.log(`  CHANGED (${updates.length}):`);
      for (const u of updates) {
        console.log(`    ~ ${u.key}: ${maskValue(u.old)} -> ${maskValue(u.value)}`);
      }
    }

    if (unchanged.length > 0) {
      console.log(`  Unchanged: ${unchanged.length} variables`);
    }

    if (additions.length === 0 && updates.length === 0) {
      console.log('  No changes needed.');
      continue;
    }

    if (apply) {
      // Belt-and-suspenders: every LingoLinq service carries unmanaged vars
      // (DATABASE_URL, UPLOADS_S3_*, ...), so a zero-var read in apply mode
      // is almost certainly a bad read, not a bare service. There is
      // deliberately no override flag; verify in the Render dashboard.
      if (currentVars.length === 0) {
        reportEnvReadFailure(svc.name, 'Current env-var list read as EMPTY.');
        continue;
      }
      // Merge: keep existing vars, add new ones, update changed ones
      const mergedVars = [...currentVars];
      for (const a of additions) {
        mergedVars.push({ key: a.key, value: a.value });
      }
      for (const u of updates) {
        const idx = mergedVars.findIndex(v => v.key === u.key);
        if (idx >= 0) mergedVars[idx].value = u.value;
      }

      try {
        await updateRenderEnvVars(svc.id, mergedVars);
        console.log(`  Applied ${additions.length + updates.length} changes.`);
        for (const a of additions) {
          if (!appliedChanges[a.key]) appliedChanges[a.key] = new Set();
          appliedChanges[a.key].add(envName);
        }
        for (const u of updates) {
          if (!appliedChanges[u.key]) appliedChanges[u.key] = new Set();
          appliedChanges[u.key].add(envName);
        }
      } catch (err) {
        console.error(`  Error updating ${svc.name}: ${err.message}`);
        syncFailures.push(svc.name);
      }
    } else {
      console.log(`  (dry-run -- use --apply to push changes)`);
    }
  }

  if (apply && Object.keys(appliedChanges).length > 0) {
    await notifyKeyRotation(appliedChanges);
  }

  console.log('\nDone.\n');
}

// ---------------------------------------------------------------------------
// Google Chat notification on key rotation
// ---------------------------------------------------------------------------

async function notifyKeyRotation(appliedChanges) {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_KEY_ROTATION;
  if (!webhookUrl) {
    console.log('\n(No GOOGLE_CHAT_WEBHOOK_KEY_ROTATION set -- skipping Chat notification)');
    return;
  }

  const keyLines = Object.entries(appliedChanges)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, envs]) => `• *${key}* (${[...envs].sort().join(', ')})`)
    .join('\n');

  const message = {
    text: [
      '🔑 *Key rotation pushed to Render*',
      '',
      keyLines,
      '',
      '_If you have any of these in your local `LingoLinq-AAC/.env`, pull the new value from 1Password (Shared Dev or Prod vault) and restart your dev server/MCP clients._',
      '',
      `Runbook: \`LingoLinq-AAC/docs/ROTATING_KEYS.md\``,
      `Pushed at ${new Date().toISOString()}`,
    ].join('\n'),
  };

  try {
    await new Promise((resolve, reject) => {
      const url = new URL(webhookUrl);
      const body = JSON.stringify(message);
      const req = https.request({
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300)
          ? resolve(data)
          : reject(new Error(`HTTP ${res.statusCode}: ${data}`)));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    console.log(`\nPosted rotation notice to Google Chat (${Object.keys(appliedChanges).length} keys changed).`);
  } catch (err) {
    console.error(`\nWarning: Could not post Chat notification: ${err.message}`);
  }
}

async function exportToOp() {
  console.log('\n=== Export .env Keys to 1Password ===\n');
  console.log('This generates the `op` CLI commands to populate your 1Password vault.');
  console.log('Install 1Password CLI first: https://developer.1password.com/docs/cli/get-started');
  console.log('WARNING: the commands below contain PLAINTEXT secret values.');
  console.log('Run this only in a terminal whose scrollback you control, and clear it after.');
  console.log('Replace <VAULT> with the target vault (see VAULTS at the top of this script).\n');

  const envVars = loadEnvFile(ENV_FILE_PATH);
  const categories = {
    // Render app secrets
    'Rails Secrets': ['SECRET_KEY_BASE', 'SECURE_ENCRYPTION_KEY', 'SECURE_NONCE_KEY', 'COOKIE_KEY', 'SMS_ENCRYPTION_KEY'],
    'AWS Credentials': ['AWS_KEY', 'AWS_SECRET'],
    'Email Config': ['DEFAULT_EMAIL_FROM', 'SYSTEM_ERROR_EMAIL', 'NEW_REGISTRATION_EMAIL'],
    'GEMINI_API_KEY': ['GEMINI_API_KEY'],
    'ANTHROPIC_API_KEY': ['ANTHROPIC_API_KEY'],
    'Google APIs': ['GOOGLE_TTS_TOKEN', 'GOOGLE_TRANSLATE_TOKEN', 'GOOGLE_PLACES_TOKEN', 'YOUTUBE_API_KEY'],
    'Stripe': ['STRIPE_SECRET_KEY', 'STRIPE_PUBLIC_KEY'],
    'OpenSymbols': ['OPENSYMBOLS_SECRET'],
    'IP Geolocation': ['IPLOCATE_API_KEY'],
    'WebSocket': ['LLWEBSOCKET_SHARED_VERIFIER', 'LLWEBSOCKET_ENCRYPTION_KEY'],
    // MCP/tool keys (not in Render but should be in 1Password)
    'GitHub PAT': ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    'Render API': ['RENDER_API_KEY'],
    'n8n API': ['N8N_API_KEY'],
    'Clockify': ['CLOCKIFY_API_KEY'],
    'Notion': ['NOTION_API_KEY', 'NOTION_N8N_API_KEY'],
    'HubSpot': ['HUBSPOT_ACCESS_TOKEN', 'HUBSPOT_CLIENT_SECRET'],
  };

  // 1Password field label per env var, for items whose secret lives in a field
  // whose name differs from the env var name. The ANTHROPIC_API_KEY item is an
  // API-Credential item storing its value in the standard `credential` field --
  // the same field the forward KEY_MANIFEST reads -- so the export helper must
  // emit `credential[password]=...`, not `ANTHROPIC_API_KEY[password]=...`, or a
  // recreated item would be unreadable by the sync (the warn-and-skip drift class
  // this file's manifest fix addresses). Keys absent here default to their own name.
  const opFieldLabel = { ANTHROPIC_API_KEY: 'credential' };

  for (const [itemName, keys] of Object.entries(categories)) {
    const fields = keys
      .filter(k => envVars[k])
      .map(k => `${opFieldLabel[k] || k}[password]=${envVars[k]}`);

    if (fields.length === 0) continue;

    console.log(`  Creating: ${itemName} (${fields.length} fields)`);
    const fieldArgs = fields.map(f => `--field "${f}"`).join(' ');

    // Print command for review (don't auto-execute to be safe).
    // <VAULT> is a deliberate placeholder: the 4-vault structure means the
    // right vault differs per item, so the operator must choose it.
    console.log(`    op item create --vault "<VAULT>" --category "API Credential" --title "${itemName}" ${fieldArgs}`);
  }

  console.log('\nReview the commands above and run them manually to populate 1Password.');
  console.log('For per-environment Rails secrets, create separate fields like:');
  console.log('  op item edit "Rails Secrets" --vault "LingoLinq Secrets" "SECRET_KEY_BASE/dev[password]=value"');
  console.log('  op item edit "Rails Secrets" --vault "LingoLinq Secrets" "SECRET_KEY_BASE/staging[password]=value"');
  console.log('  op item edit "Rails Secrets" --vault "LingoLinq Secrets" "SECRET_KEY_BASE/prod[password]=value"\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const apply = args.includes('--apply');
  const auditMode = args.includes('--audit');
  const exportMode = args.includes('--export-to-op');

  const sourceIdx = args.indexOf('--source');
  const source = sourceIdx >= 0 ? args[sourceIdx + 1] : 'op';

  const serviceIdx = args.indexOf('--service');
  const serviceFilter = serviceIdx >= 0 ? args[serviceIdx + 1] : null;

  let services = { ...RENDER_SERVICES };
  if (serviceFilter) {
    if (!services[serviceFilter]) {
      console.error(`Error: Unknown service "${serviceFilter}". Options: ${Object.keys(RENDER_SERVICES).join(', ')}`);
      process.exit(1);
    }
    services = { [serviceFilter]: services[serviceFilter] };
  }

  if (exportMode) {
    await exportToOp();
  } else if (auditMode) {
    await audit(services);
  } else {
    await sync(services, source, apply);
    if (syncFailures.length > 0) {
      console.error(`\nSync INCOMPLETE -- ${syncFailures.length} required item(s) or service(s) skipped or failed: ${[...new Set(syncFailures)].join(', ')}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

// Exported for tests (scripts/sync-render-env.test.js); CLI behavior is
// unchanged because main() only runs when invoked directly.
module.exports = {
  getRenderEnvVars,
  sync,
  syncFailures,
  KEY_MANIFEST,
  renderEnvironmentsFor,
  valuesForRenderEnvironments,
};
