#!/usr/bin/env node
// ember-route-crawl.mjs — runtime crawler for the /ember-audit-run orchestrator (Step 4).
//
// Visits app routes with Playwright, captures uncaught exceptions, console errors, and
// failed same-origin requests, and writes FINDER-SHAPED JSON that audit-merge.rb can
// ingest into audit-reports/ember-upgrade/FINDINGS-EMBER.json (evidence.type "runtime",
// no file anchor — the citation gate does not apply to runtime evidence).
//
// The register merge REFUSES findings containing PII/secret shapes (IP-like dotted
// quads, NNN_NNN global_id-like tokens, emails, bearer tokens...). Console/error text
// routinely contains 127.0.0.1 and user global_ids, so everything captured here is
// sanitized BEFORE it is written. Raw unsanitized output is never emitted.
//
// Usage:
//   node scripts/ember-route-crawl.mjs --base http://localhost:8184 \
//     [--routes scripts/ember-crawl-routes.json] [--out /tmp/ember-crawl.json] \
//     [--sha <auditedSha>] [--timeout 15000]
//
//   --routes: JSON array of URL paths. If omitted, param-less routes are discovered
//             from app/frontend/app/router.js (static paths only; parameterized routes
//             like /:user_id need a curated routes file with real dev-data paths).
//   Auth:     export CRAWL_STORAGE_STATE=/path/to/state.json (Playwright storage state
//             from a logged-in DEV session; never production credentials, never commit).
//   Browser:  uses the `playwright` package (install: `npm i -D playwright` in
//             app/frontend, or a global install). Honors PLAYWRIGHT_BROWSERS_PATH;
//             falls back to the preinstalled /opt/pw-browsers/chromium if launching
//             the default download fails.
//
// Read-only with respect to the app: it navigates and observes. It does NOT click
// through destructive actions; interactive click-crawling is deliberately out of scope
// (an AAC app's buttons speak, purchase, and message — a blind crawler must not press
// them). Deep interaction testing belongs to targeted Playwright specs, not this sweep.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}
const BASE = args.base || 'http://localhost:8184';
const OUT = args.out || '/tmp/ember-crawl.json';
const TIMEOUT = parseInt(args.timeout || '15000', 10);
const SETTLE_MS = 2500; // post-load settle for async renders

function sanitize(s) {
  return String(s)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
    .replace(/\b\d+_\d+(?:_[a-zA-Z0-9]+)?\b/g, '[gid]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+/g, '[jwt]')
    .replace(/\b(token|key|secret|password|auth)=[^&\s"']+/gi, '$1=[redacted]')
    .slice(0, 300);
}

function discoverRoutes() {
  // Static (param-less) paths from router.js. Nested `this.route` paths are not
  // composed here — discovery is a floor, not full coverage; use --routes for depth.
  const src = readFileSync('app/frontend/app/router.js', 'utf8');
  const routes = new Set(['/']);
  const re = /this\.route\('([^']+)'(?:,\s*\{\s*path:\s*'([^']*)'\s*\})?\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const path = m[2] !== undefined ? m[2] : `/${m[1]}`;
    if (!path || path.includes(':') || path.includes('*')) continue;
    routes.add(path.startsWith('/') ? path : `/${path}`);
  }
  routes.delete('/jasmine');
  return [...routes].sort();
}

const routes = args.routes
  ? JSON.parse(readFileSync(args.routes, 'utf8'))
  : discoverRoutes();

let sha = args.sha;
if (!sha) {
  try { sha = execSync('git rev-parse HEAD').toString().trim(); } catch { sha = 'unknown'; }
}

let pw;
try {
  pw = await import('playwright');
} catch {
  console.error('playwright not importable. Run `npm i -D playwright` in app/frontend (Chromium itself is preinstalled; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 avoids a re-fetch), or install globally.');
  process.exit(2);
}

async function launch() {
  try {
    return await pw.chromium.launch({ headless: true });
  } catch (e) {
    if (existsSync('/opt/pw-browsers/chromium')) {
      return await pw.chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
    }
    throw e;
  }
}

const browser = await launch();
const contextOpts = {};
if (process.env.CRAWL_STORAGE_STATE) contextOpts.storageState = process.env.CRAWL_STORAGE_STATE;
const context = await browser.newContext(contextOpts);

const findings = [];
const seen = new Set();
const slug = (r) => r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';

function addFinding(route, kind, severity, message) {
  const clean = sanitize(message);
  // Dedupe on route + first 80 chars of the sanitized message.
  const sig = `${route}|${kind}|${clean.slice(0, 80)}`;
  if (seen.has(sig)) return;
  seen.add(sig);
  findings.push({
    ruleKey: `runtime-${kind}-${slug(route)}`,
    title: `${kind === 'pageerror' ? 'Uncaught exception' : kind === 'console-error' ? 'Console error' : 'Failed request'} on ${route}`,
    severity,
    confidence: 'medium',
    frameworks: [],
    evidence: { type: 'runtime', source: `${route} (${kind})`, snippet: clean },
    remediation: { options: 'Localize to a file:line code finding (spawn ember-upgrade-auditor with this error), then fix per the matching breakage class.', timeframe: '' },
    status: 'open',
    notes: `Captured by ember-route-crawl.mjs. Runtime symptom; needs localization to a code finding where possible.`
  });
}

const summary = { visited: 0, failedNav: [], routes: routes.length };

for (const route of routes) {
  const page = await context.newPage();
  const url = BASE.replace(/\/$/, '') + route;
  page.on('pageerror', (err) => addFinding(route, 'pageerror', 'high', err.message || String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') addFinding(route, 'console-error', 'medium', msg.text());
  });
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(BASE) && !req.url().match(/\.(png|jpg|svg|gif|woff2?|mp3|wav)(\?|$)/)) {
      addFinding(route, 'requestfailed', 'medium', `${req.method()} ${sanitize(req.url())} -> ${req.failure()?.errorText}`);
    }
  });
  page.on('response', (res) => {
    if (res.url().startsWith(BASE) && res.status() >= 500) {
      addFinding(route, 'requestfailed', 'medium', `${res.request().method()} ${sanitize(res.url())} -> HTTP ${res.status()}`);
    }
  });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT });
    await page.waitForTimeout(SETTLE_MS);
    summary.visited += 1;
  } catch (e) {
    summary.failedNav.push({ route, error: sanitize(e.message) });
  }
  await page.close();
}

await browser.close();

writeFileSync(OUT, JSON.stringify({ domain: 'ember-runtime', auditedSha: sha, findings, crawlSummary: summary }, null, 2));
console.log(`Crawled ${summary.visited}/${routes.length} routes; ${findings.length} findings; ${summary.failedNav.length} nav failures -> ${OUT}`);
