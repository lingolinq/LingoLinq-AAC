#!/usr/bin/env node
// sync-render-env.test.js -- regression tests for the env-var wipe guard in
// scripts/sync-render-env.js.
//
// Covers the 2026-07-06 near-miss found during the Render API key rotation:
// getRenderEnvVars() swallowed read errors (e.g. a 401 from a revoked key)
// and returned [], and the --apply path builds its PUT payload from that
// list. Render's env-vars PUT replaces the service's ENTIRE list, so a
// failed read + --apply would have replaced prod's env vars with only the
// managed keys, wiping everything unmanaged (UPLOADS_S3_NO_ACL,
// UPLOADS_S3_CDN, ...). This copy of the script runs HOURLY with --apply,
// unattended, via .github/workflows/sync-render-secrets.yml. The fix: reads
// fail CLOSED (throw), sync skips the service and exits non-zero, apply
// refuses a zero-var read, and reads follow pagination cursors so a long
// list is never silently truncated.
//
// Run directly: node scripts/sync-render-env.test.js

const https = require('https');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The synchronizer normally reads the operator's brain .env file. Tests must
// never load it: even masked output can disclose secret prefixes in CI logs.
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sre-home-'));
const testConfigDir = path.join(testHome, 'ai-company-brain', 'config');
fs.mkdirSync(testConfigDir, { recursive: true });
fs.writeFileSync(path.join(testConfigDir, '.env'), [
  'BEDROCK_AWS_KEY=test-bedrock-key',
  'BEDROCK_AWS_SECRET=test-bedrock-secret',
].join('\n'));
os.homedir = () => testHome;

// --- https mock (patch before exercising the module under test) ------------

let routeHandler = null; // (options, bodyStr) => { statusCode, body }
const recordedRequests = [];

https.request = (options, cb) => {
  let bodyStr = '';
  return {
    on: () => {},
    write: (d) => { bodyStr += d; },
    end: () => {
      recordedRequests.push({ method: options.method, path: options.path, body: bodyStr });
      const { statusCode, body } = routeHandler(options, bodyStr);
      const res = new EventEmitter();
      res.statusCode = statusCode;
      cb(res);
      process.nextTick(() => {
        res.emit('data', body);
        res.emit('end');
      });
    },
  };
};

process.env.RENDER_API_KEY = 'test-key-never-used-for-real-calls';
// Keep notifyKeyRotation on its deterministic "skipping" path.
delete process.env.GOOGLE_CHAT_WEBHOOK_KEY_ROTATION;

const {
  getRenderEnvVars,
  sync,
  syncFailures,
  KEY_MANIFEST,
  valuesForRenderEnvironments,
} = require('./sync-render-env.js');

// --- tiny harness -----------------------------------------------------------

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`PASS: ${label}`);
    pass++;
  } else {
    console.log(`FAIL: ${label}${detail ? ` -- ${detail}` : ''}`);
    fail++;
  }
}

function resetState() {
  recordedRequests.length = 0;
  syncFailures.length = 0;
}

function putRequests() {
  return recordedRequests.filter(r => r.method === 'PUT');
}

function envVarPage(pairs, withCursor) {
  return JSON.stringify(pairs.map(([key, value], i) => ({
    envVar: { key, value },
    ...(withCursor ? { cursor: `cur-${key}-${i}` } : {}),
  })));
}

function testBedrockTargetsOnlyDevAndStaging() {
  const expected = { dev: 'test-value', staging: 'test-value' };
  for (const key of [
    'BEDROCK_AWS_KEY',
    'BEDROCK_AWS_SECRET',
    'BEDROCK_AWS_REGION',
    'BEDROCK_EXPECTED_AWS_ACCOUNT',
  ]) {
    const values = valuesForRenderEnvironments(KEY_MANIFEST[key], 'test-value');
    check(`Bedrock Render scope: ${key} targets dev and staging only`,
      JSON.stringify(values) === JSON.stringify(expected), JSON.stringify(values));
  }
  check('Bedrock credential source is environment-specific',
    KEY_MANIFEST.BEDROCK_AWS_KEY.perEnv === true &&
      KEY_MANIFEST.BEDROCK_AWS_SECRET.perEnv === true &&
      !KEY_MANIFEST.BEDROCK_AWS_KEY.vault &&
      KEY_MANIFEST.BEDROCK_AWS_KEY.item === 'BEDROCK_RUNTIME_AI');
}

// --- tests ------------------------------------------------------------------

async function testReadFailureThrows() {
  resetState();
  routeHandler = () => ({ statusCode: 401, body: 'Unauthorized' });
  let threw = false;
  try {
    await getRenderEnvVars('srv-x');
  } catch (err) {
    threw = /401/.test(err.message);
  }
  check('getRenderEnvVars throws on 401 instead of returning []', threw);
}

async function testNonArrayResponseThrows() {
  resetState();
  routeHandler = () => ({ statusCode: 200, body: JSON.stringify({ message: 'weird shape' }) });
  let threw = false;
  try {
    await getRenderEnvVars('srv-x');
  } catch (err) {
    threw = /Unexpected env-vars response/.test(err.message);
  }
  check('getRenderEnvVars throws on non-array 200 response', threw);
}

async function testEmptyOkReadReturnsEmpty() {
  resetState();
  routeHandler = () => ({ statusCode: 200, body: '[]' });
  const vars = await getRenderEnvVars('srv-x');
  check('genuinely empty 200 read returns []', Array.isArray(vars) && vars.length === 0);
}

async function testPaginationFollowsCursor() {
  resetState();
  const page1 = Array.from({ length: 100 }, (_, i) => [`KEY_${i}`, `v${i}`]);
  const page2 = Array.from({ length: 30 }, (_, i) => [`KEY_${100 + i}`, `v${100 + i}`]);
  routeHandler = (options) => {
    if (options.path.includes('cursor=')) {
      return { statusCode: 200, body: envVarPage(page2, true) };
    }
    return { statusCode: 200, body: envVarPage(page1, true) };
  };
  const vars = await getRenderEnvVars('srv-x');
  check('pagination: full page triggers a cursor follow-up read', recordedRequests.length === 2);
  check('pagination: second request carries the last cursor',
    recordedRequests.length === 2 && recordedRequests[1].path.includes('cursor=cur-KEY_99-99'),
    recordedRequests[1] && recordedRequests[1].path);
  check('pagination: all 130 vars returned across pages', vars.length === 130);
}

async function testShortPageStopsPagination() {
  resetState();
  routeHandler = () => ({ statusCode: 200, body: envVarPage([['A', '1'], ['B', '2']], true) });
  const vars = await getRenderEnvVars('srv-x');
  check('pagination: short page stops after one request even with cursors present',
    recordedRequests.length === 1 && vars.length === 2);
}

async function testRepeatedCursorThrows() {
  resetState();
  const fullPage = Array.from({ length: 100 }, (_, i) => [`KEY_${i}`, `v${i}`]);
  routeHandler = () => ({ statusCode: 200, body: envVarPage(fullPage, true) });
  let threw = false;
  try {
    await getRenderEnvVars('srv-x');
  } catch (err) {
    threw = /repeated cursor/.test(err.message);
  }
  check('pagination: repeated cursor throws instead of looping forever', threw);
}

const TEST_SERVICE = { prod: { id: 'srv-test-prod', name: 'test-prod', branch: 'main' } };
const RENDER_SCOPE_SERVICES = {
  dev: { id: 'srv-test-dev', name: 'test-dev', branch: 'develop' },
  staging: { id: 'srv-test-staging', name: 'test-staging', branch: 'staging' },
  prod: { id: 'srv-test-prod', name: 'test-prod', branch: 'main' },
};

async function testBedrockSyncNeverTargetsRenderProd() {
  resetState();
  const defaults = [
    ['LD_PRELOAD', '/usr/lib/x86_64-linux-gnu/libjemalloc.so.2'],
    ['MALLOC_CONF', 'background_thread:true,narenas:2,dirty_decay_ms:1000'],
    ['RAILS_SERVE_STATIC_FILES', 'enabled'],
    ['UNMANAGED', 'preserve-me'],
  ];
  routeHandler = (options) => {
    if (options.method === 'GET') return { statusCode: 200, body: envVarPage(defaults, true) };
    return { statusCode: 200, body: '[]' };
  };
  await sync(RENDER_SCOPE_SERVICES, 'env', true);
  const puts = putRequests();
  const putServices = puts.map(request => request.path.match(/^\/v1\/services\/([^/]+)/)[1]).sort();
  check('Bedrock sync: applies only to Render dev and staging',
    JSON.stringify(putServices) === JSON.stringify(['srv-test-dev', 'srv-test-staging']));
  for (const request of puts) {
    const keys = new Set(JSON.parse(request.body).map(item => item.key));
    check(`Bedrock sync: ${request.path} carries all four required settings`,
      ['BEDROCK_AWS_KEY', 'BEDROCK_AWS_SECRET', 'BEDROCK_AWS_REGION', 'BEDROCK_EXPECTED_AWS_ACCOUNT']
        .every(key => keys.has(key)));
  }
}

async function testMissingRequiredBedrockCredentialsAbortBeforeAnyPut() {
  resetState();
  routeHandler = (options) => {
    if (options.method === 'GET') return { statusCode: 200, body: envVarPage([['UNMANAGED', 'preserve-me']], true) };
    return { statusCode: 200, body: '[]' };
  };
  await sync(RENDER_SCOPE_SERVICES, 'op', true, {
    isSignedIn: () => true,
    readSecret: () => null,
  });
  check('Bedrock sync: missing required credentials fail the sync',
    ['dev:BEDROCK_AWS_KEY', 'dev:BEDROCK_AWS_SECRET', 'staging:BEDROCK_AWS_KEY', 'staging:BEDROCK_AWS_SECRET']
      .every(failure => syncFailures.includes(failure)), JSON.stringify(syncFailures));
  check('Bedrock sync: missing credentials issue NO partial static-config PUT', putRequests().length === 0);
}

async function testApplySkipsOnReadFailure() {
  resetState();
  routeHandler = () => ({ statusCode: 401, body: 'Unauthorized' });
  await sync(TEST_SERVICE, 'env', true);
  check('apply: failed read pushes the service onto syncFailures',
    syncFailures.includes('test-prod'));
  check('apply: failed read issues NO PUT', putRequests().length === 0);
}

async function testApplyRefusesEmptyCurrentList() {
  resetState();
  routeHandler = () => ({ statusCode: 200, body: '[]' });
  await sync(TEST_SERVICE, 'env', true);
  check('apply: zero-var read is treated as a failure, not a bare service',
    syncFailures.includes('test-prod'));
  check('apply: zero-var read issues NO PUT', putRequests().length === 0);
}

async function testApplyPreservesUnmanagedVars() {
  resetState();
  const current = [
    ['UPLOADS_S3_NO_ACL', 'true'],
    ['UPLOADS_S3_CDN', 'https://cdn.example'],
    ['LD_PRELOAD', 'stale-value-to-update'],
  ];
  routeHandler = (options) => {
    if (options.method === 'GET') {
      return { statusCode: 200, body: envVarPage(current, true) };
    }
    return { statusCode: 200, body: '[]' };
  };
  await sync(TEST_SERVICE, 'env', true);
  const puts = putRequests();
  check('apply: happy path issues exactly one PUT', puts.length === 1);
  if (puts.length === 1) {
    const payload = JSON.parse(puts[0].body);
    const byKey = Object.fromEntries(payload.map(v => [v.key, v.value]));
    check('apply: unmanaged UPLOADS_S3_NO_ACL preserved in PUT payload',
      byKey.UPLOADS_S3_NO_ACL === 'true');
    check('apply: unmanaged UPLOADS_S3_CDN preserved in PUT payload',
      byKey.UPLOADS_S3_CDN === 'https://cdn.example');
    check('apply: managed LD_PRELOAD updated to manifest default',
      byKey.LD_PRELOAD === '/usr/lib/x86_64-linux-gnu/libjemalloc.so.2');
    check('apply: PUT payload is a superset of the current list',
      payload.length >= current.length);
  }
  check('apply: happy path records no failures', syncFailures.length === 0);
}

async function testPartialReadThrowsAndNeverPuts() {
  // The truncation boundary: page 1 succeeds, page 2 fails. A partial list
  // must never survive into a PUT -- it wipes the tail the same as a failed
  // read wipes everything.
  resetState();
  const page1 = Array.from({ length: 100 }, (_, i) => [`KEY_${i}`, `v${i}`]);
  routeHandler = (options) => {
    if (options.method === 'GET' && !options.path.includes('cursor=')) {
      return { statusCode: 200, body: envVarPage(page1, true) };
    }
    return { statusCode: 401, body: 'Unauthorized' };
  };
  let threw = false;
  try {
    await getRenderEnvVars('srv-x');
  } catch (err) {
    threw = /401/.test(err.message);
  }
  check('partial read: page-2 failure throws (no partial list returned)', threw);

  resetState();
  routeHandler = (options) => {
    if (options.method === 'GET' && !options.path.includes('cursor=')) {
      return { statusCode: 200, body: envVarPage(page1, true) };
    }
    return { statusCode: 401, body: 'Unauthorized' };
  };
  await sync(TEST_SERVICE, 'env', true);
  check('partial read: apply skips the service and records the failure',
    syncFailures.includes('test-prod'));
  check('partial read: apply issues NO PUT', putRequests().length === 0);
}

function testMainExitsNonZeroOnReadFailure() {
  // Drive the real CLI entrypoint in a child process, with an https mock
  // preloaded via --require so no real network is touched, and assert the
  // process-level exit-1 contract the GitHub Actions workflow depends on.
  const { execFileSync } = require('child_process');
  const mockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sre-test-')), 'https-401-mock.js');
  fs.writeFileSync(mockPath, `
    const https = require('https');
    const { EventEmitter } = require('events');
    https.request = (options, cb) => ({
      on: () => {},
      write: () => {},
      end: () => {
        const res = new EventEmitter();
        res.statusCode = 401;
        cb(res);
        process.nextTick(() => { res.emit('data', 'Unauthorized'); res.emit('end'); });
      },
    });
  `);
  let exitCode = 0;
  let output = '';
  try {
    output = execFileSync(
      process.execPath,
      ['--require', mockPath, path.join(__dirname, 'sync-render-env.js'), '--source', 'env'],
      {
        encoding: 'utf8',
        env: { ...process.env, HOME: testHome, RENDER_API_KEY: 'test-key' },
        stdio: 'pipe',
      }
    );
  } catch (err) {
    exitCode = err.status;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }
  check('main: exits 1 when services are skipped (contract the CI workflow relies on)',
    exitCode === 1, `exit code was ${exitCode}`);
  check('main: failure summary names the skipped services',
    /Sync INCOMPLETE/.test(output));
  check('main: failed dry-run output contains no NEW/CHANGED wipe-diff lines',
    !/NEW \([0-9]+\)|CHANGED \([0-9]+\)/.test(output));
}

async function testDryRunNeverPuts() {
  resetState();
  routeHandler = () => ({ statusCode: 200, body: envVarPage([['ONLY_VAR', 'x']], true) });
  await sync(TEST_SERVICE, 'env', false);
  check('dry-run: issues NO PUT even with pending changes', putRequests().length === 0);
}

// --- run --------------------------------------------------------------------

(async () => {
  testBedrockTargetsOnlyDevAndStaging();
  await testReadFailureThrows();
  await testNonArrayResponseThrows();
  await testEmptyOkReadReturnsEmpty();
  await testPaginationFollowsCursor();
  await testShortPageStopsPagination();
  await testRepeatedCursorThrows();
  await testBedrockSyncNeverTargetsRenderProd();
  await testMissingRequiredBedrockCredentialsAbortBeforeAnyPut();
  await testApplySkipsOnReadFailure();
  await testApplyRefusesEmptyCurrentList();
  await testApplyPreservesUnmanagedVars();
  await testPartialReadThrowsAndNeverPuts();
  testMainExitsNonZeroOnReadFailure();
  await testDryRunNeverPuts();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
