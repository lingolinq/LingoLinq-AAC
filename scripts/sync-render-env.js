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
//   - LingoLinq Shared Dev: AI Keys, Notion, Stripe (test), Email Config, etc. (all devs)
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
// Format: { renderEnvName: { vault, item, field, perEnv|shared, defaultValue } }
// `shared`: same value across all envs (read from vault[vault])
// `perEnv`: different value per env (read from vault[env])
// `defaultValue`: hardcoded, no 1Password lookup
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

  // -- Email (shared vault) --
  DEFAULT_EMAIL_FROM:    { vault: 'shared', item: 'Email Config', field: 'DEFAULT_EMAIL_FROM', shared: true },
  SYSTEM_ERROR_EMAIL:    { vault: 'shared', item: 'Email Config', field: 'SYSTEM_ERROR_EMAIL', shared: true },
  NEW_REGISTRATION_EMAIL:{ vault: 'shared', item: 'Email Config', field: 'NEW_REGISTRATION_EMAIL', shared: true },

  // -- AI/API keys (shared vault) --
  GEMINI_API_KEY:        { vault: 'shared', item: 'AI Keys', field: 'GEMINI_API_KEY', shared: true },
  ANTHROPIC_API_KEY:     { vault: 'shared', item: 'AI Keys', field: 'ANTHROPIC_API_KEY', shared: true },

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
  try {
    // Render API paginates at 20 by default -- use limit=100 to get all
    const result = await renderApiRequest('GET', `/services/${serviceId}/env-vars?limit=100`);
    if (!Array.isArray(result)) return [];
    // Render wraps each var in { envVar: { key, value }, cursor }
    return result.map(item => item.envVar || item);
  } catch (err) {
    console.warn(`  Warning: Could not read env vars for ${serviceId}: ${err.message}`);
    return [];
  }
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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function audit(services) {
  console.log('\n=== Render Environment Variable Audit ===\n');

  for (const [envName, svc] of Object.entries(services)) {
    console.log(`--- ${envName.toUpperCase()} (${svc.name}) ---`);
    const vars = await getRenderEnvVars(svc.id);
    if (vars.length === 0) {
      console.log('  (no vars found or access denied)\n');
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
    const vars = await getRenderEnvVars(svc.id);
    allVars[envName] = new Set(vars.map(v => v.key));
  }

  const allKeys = new Set();
  for (const keys of Object.values(allVars)) {
    for (const k of keys) allKeys.add(k);
  }

  const missing = [];
  for (const key of [...allKeys].sort()) {
    const present = Object.entries(allVars)
      .filter(([, keys]) => keys.has(key))
      .map(([env]) => env);
    if (present.length < Object.keys(services).length) {
      const absent = Object.keys(services).filter(e => !present.includes(e));
      missing.push({ key, present, absent });
    }
  }

  if (missing.length === 0) {
    console.log('  All environments have the same variables.\n');
  } else {
    console.log('  Variables missing from some environments:');
    for (const m of missing) {
      console.log(`  ${m.key}: missing from [${m.absent.join(', ')}]`);
    }
    console.log();
  }
}

async function sync(services, source, apply) {
  console.log(`\n=== Sync Render Env Vars (source: ${source}, mode: ${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  // Load desired values
  let desiredValues = {};

  if (source === 'op') {
    if (!opIsSignedIn()) {
      console.error('Error: 1Password CLI not signed in. Run: op signin');
      process.exit(1);
    }
    console.log('Reading secrets from 1Password vaults...');
    for (const [key, config] of Object.entries(KEY_MANIFEST)) {
      // Handle keys with static default values (no 1Password needed)
      if (config.defaultValue) {
        desiredValues[key] = { dev: config.defaultValue, staging: config.defaultValue, prod: config.defaultValue };
        continue;
      }
      if (config.shared) {
        // Read once from the shared vault, use for all envs
        const vaultName = VAULTS[config.vault];
        if (!vaultName) {
          console.warn(`  Warning: ${key} has invalid vault key: ${config.vault}`);
          continue;
        }
        const val = opRead(vaultName, config.item, config.field);
        if (val) {
          desiredValues[key] = { dev: val, staging: val, prod: val };
        } else {
          console.warn(`  Warning: Could not read ${vaultName}/${config.item}/${config.field}`);
        }
      } else if (config.perEnv) {
        // Read once per env from that env's vault
        desiredValues[key] = {};
        for (const env of ['dev', 'staging', 'prod']) {
          const vaultName = VAULTS[env];
          const val = opRead(vaultName, config.item, config.field);
          if (val) {
            desiredValues[key][env] = val;
          } else {
            console.warn(`  Warning: Could not read ${vaultName}/${config.item}/${config.field}`);
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
        desiredValues[key] = { dev: config.defaultValue, staging: config.defaultValue, prod: config.defaultValue };
      } else if (envVars[key]) {
        desiredValues[key] = { dev: envVars[key], staging: envVars[key], prod: envVars[key] };
      }
    }
  }

  // Compare and update each service
  for (const [envName, svc] of Object.entries(services)) {
    console.log(`\n--- ${envName.toUpperCase()} (${svc.name}) ---`);
    const currentVars = await getRenderEnvVars(svc.id);
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
      } catch (err) {
        console.error(`  Error updating ${svc.name}: ${err.message}`);
      }
    } else {
      console.log(`  (dry-run -- use --apply to push changes)`);
    }
  }

  console.log('\nDone.\n');
}

async function exportToOp() {
  console.log('\n=== Export .env Keys to 1Password ===\n');
  console.log('This generates the `op` CLI commands to populate your 1Password vault.');
  console.log('Install 1Password CLI first: https://developer.1password.com/docs/cli/get-started\n');

  const envVars = loadEnvFile(ENV_FILE_PATH);
  const categories = {
    // Render app secrets
    'Rails Secrets': ['SECRET_KEY_BASE', 'SECURE_ENCRYPTION_KEY', 'SECURE_NONCE_KEY', 'COOKIE_KEY', 'SMS_ENCRYPTION_KEY'],
    'AWS Credentials': ['AWS_KEY', 'AWS_SECRET'],
    'Email Config': ['DEFAULT_EMAIL_FROM', 'SYSTEM_ERROR_EMAIL', 'NEW_REGISTRATION_EMAIL'],
    'AI Keys': ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY'],
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

  for (const [itemName, keys] of Object.entries(categories)) {
    const fields = keys
      .filter(k => envVars[k])
      .map(k => `${k}[password]=${envVars[k]}`);

    if (fields.length === 0) continue;

    console.log(`  Creating: ${itemName} (${fields.length} fields)`);
    const fieldArgs = fields.map(f => `--field "${f}"`).join(' ');

    // Print command for review (don't auto-execute to be safe)
    console.log(`    op item create --vault "${OP_VAULT}" --category "API Credential" --title "${itemName}" ${fieldArgs}`);
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
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
