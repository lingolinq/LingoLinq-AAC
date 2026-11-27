// Sync measurement (phase 0.2 of the sync proposal, docs/task-management/2026-11-15_offline-sync-research-proposal.md
// section 12). Each shape from support/sync-measure.rb is synced on a fresh device at each link speed, then synced
// again with nothing changed. Every result is written as one JSON line, so the same run before and after a change
// gives comparable numbers. It records, it does not judge: a sync that misses boards is a result, not a failure.
//
// Setup (a PRIVATE LOCAL lingolinq-e2e* database), as for e2e/sync.spec.js, plus the measurement seed:
//   1. seed:   bin/rails runner app/frontend/e2e/support/sync-measure.rb   (with the env from its header)
//   2. build:  cd app/frontend && npx ember build --environment production && cd ../.. && bin/rake extras:assert_js
//   3. server: bin/rails s -p 5077   (same database, upload settings blank)
//   4. run:    cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=measure-android-chrome
//              (or measure-desktop-chrome, measure-iphone, measure-android-emulator with an emulator in `adb devices`)
// Options (environment):
//   E2E_MEASURE_SHAPES   comma list of big, core, supervisor, caseload (default: all)
//   E2E_MEASURE_RATES    comma list of link speeds in kbps, or "full" for no limit (default: full,4000,800,400)
//   E2E_MEASURE_LATENCY  ms added each way (default 100)
//   E2E_MEASURE_OUT      the JSON-lines file (default: test-results/sync-measure.jsonl)
//   E2E_MEASURE_SHOTS    a directory: after each sync, a screenshot of Sync Details and its summary lines (for review of
//                        the wording, item 0.1), named <project>-<shape>-<rate>-<run>.png
//   E2E_MEASURE_SAMPLES  set to write <out>-samples.json: the first off-screen picture requests that are not the app's
//                        direct download, with their type, headers and sending frame (support/sync.js routePictures)
// The link is limited from the moment the board walk starts, as in the 2026-11-19 emulator baseline
// (2026-11-16_sync-late-copy-current.md, "Android emulator"); sign-in and the start of the sync run at full speed.

const fs = require('fs');
const path = require('path');
const { signIn } = require('./support/local-session');
const { test, waitForApp, startSync, waitForSyncEnd, deviceBoardKeys, devicePictureCount, openSyncDetails, closeSyncDetails } = require('./support/sync');

const SEED = 'sync-measure.rb';
const SHAPES = {
  big: { user: 'sync_m_big', note: 'dev shape: 57 boards, pictures inline in the JSON' },
  core: { user: 'sync_m_core', note: 'production shape: 61 boards, 2,104 pictures' },
  supervisor: { user: 'sync_m_supervisor', note: 'a supervisor of 3 supervisees: skin tones, sounds' },
  caseload: { user: 'sync_m_caseload', note: 'a supervisor of 12 small supervisees' },
};
const list = (value, fallback) => (value || fallback).split(',').map((s) => s.trim()).filter(Boolean);
const shapes = list(process.env.E2E_MEASURE_SHAPES, Object.keys(SHAPES).join(','));
const rates = list(process.env.E2E_MEASURE_RATES, 'full,4000,800,400');
const latency = parseInt(process.env.E2E_MEASURE_LATENCY || '100', 10);
const OUT = process.env.E2E_MEASURE_OUT || path.join(__dirname, '..', 'test-results', 'sync-measure.jsonl');

// E2E_MEASURE_SHOTS: Sync Details after a sync, as the person sees it, and the lines it shows.
async function shot(page, name) {
  const dir = process.env.E2E_MEASURE_SHOTS;
  if (!dir) { return null; }
  fs.mkdirSync(dir, { recursive: true });
  await openSyncDetails(page);
  await page.waitForTimeout(500);
  await page.locator('.la-sync-details-modal-wrap').screenshot({ path: path.join(dir, name + '.png') });
  const lines = await page.evaluate(() => Array.from(document.querySelectorAll('.la-sync-details-summary-line')).map((el) => el.innerText.trim()));
  await closeSyncDetails(page);
  return lines;
}

function record(row) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
}

// How many picture and sound addresses were answered more than once, by request method (support/sync.js routePictures).
function repeats(pictures) {
  const counts = Object.entries(pictures.byUrl || {});
  // The app's direct download adds `cr=1` (services/persistence.js store_url_now); a plain request is anything else.
  const direct = counts.filter(([key]) => /[?&]cr=1(&|$)/.test(key)).length;
  const methods = {};
  counts.forEach(([key]) => { const m = key.split(' ')[0]; methods[m] = (methods[m] || 0) + 1; });
  return {
    distinct_addresses: counts.length,
    fetched_more_than_once: counts.filter(([, n]) => n > 1).length,
    by_method: methods,
    direct_requests: direct,
    other_requests: counts.length - direct,
    repeat_example: (counts.find(([, n]) => n > 1) || [null])[0],
    other_example: (counts.find(([key]) => !/[?&]cr=1(&|$)/.test(key)) || [null])[0],
  };
}

// One sync: limit the link once the board walk starts, wait for the end, read the link and the device.
async function measuredSync(page, link, rate, warnings) {
  warnings.length = 0;
  link.setRate(null);
  link.setDelay(0);
  link.resetStats();
  const started = Date.now();
  await startSync(page);
  await page.waitForFunction(() => !!window.persistence.get('sync_progress') || !window.persistence.get('syncing'), null, { timeout: 120_000 }).catch(() => {});
  if (rate !== 'full') { link.setRate(parseInt(rate, 10)); }
  link.setDelay(latency);
  const end = await waitForSyncEnd(page, 3_500_000);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const stats = link.stats();
  link.setRate(null);
  link.setDelay(0);
  return {
    seconds,
    link_bytes: stats.bytes,
    link_requests: stats.requests,
    link_peak_open: stats.peak,
    link_refused: stats.refused,
    status: end.status,
    summary: end.summary,
    errors: end.last ? end.last.errors : null,
    failed: (end.failed || []).length,
    device_boards: (await deviceBoardKeys(page)).length,
    device_pictures: await devicePictureCount(page),
    warnings: warnings.slice(0, 20),
    // What the app itself counted for this sync (item 0.1, utils/sync_counters.js), beside the link's own counts above.
    app_counters: await page.evaluate(() => { const log = window.persistence.get('sync_log') || []; return (log[log.length - 1] || {}).counters || null; }),
  };
}

// Console lines that say part of a sync failed without failing it (services/persistence.js: a supervisee whose sync
// failed is a warning and the sync still "finished without errors"; time_promise logs a step that took too long).
const WARNING = /supervisee sync failed|promise timed out|took too long|failed to retrieve|failed retrieval/i;

for (const shape of shapes) {
  for (const rate of rates) {
    test(`measure ${shape} at ${rate === 'full' ? 'full speed' : rate + ' kbps'}`, async ({ syncPage: page, syncLink, pictures }, testInfo) => {
      const who = SHAPES[shape];
      if (!who) { throw new Error(`unknown shape ${shape}: one of ${Object.keys(SHAPES).join(', ')}`); }
      const warnings = [];
      page.on('console', (msg) => { const text = msg.text(); if (WARNING.test(text)) { warnings.push(text.slice(0, 200)); } });
      await signIn(page, who.user, SEED);
      await waitForApp(page);
      await page.waitForLoadState('networkidle').catch(() => {});
      const base = {
        at: new Date().toISOString(), project: testInfo.project.name, shape, user: who.user, note: who.note,
        rate_kbps: rate, latency_ms: latency, build: process.env.E2E_MEASURE_BUILD || null,
      };
      // Pictures the page fetched before the sync started (its own warm-up of linked boards), then counted per sync.
      const before = { pictures_before_sync: pictures.served, ...repeats(pictures) };
      pictures.byUrl = {};
      const servedAtStart = pictures.served;
      const first = await measuredSync(page, syncLink, rate, warnings);
      if (pictures.samples) { fs.writeFileSync(OUT.replace(/\.jsonl$/, '') + '-samples.json', JSON.stringify(pictures.samples, null, 2)); }
      first.sync_details = await shot(page, `${testInfo.project.name}-${shape}-${rate}-first`);
      record({ ...base, run: 'first', ...first, pictures_served: pictures.served - servedAtStart, before_sync: before, ...repeats(pictures) });
      pictures.byUrl = {};
      const servedBefore = pictures.served;
      const repeat = await measuredSync(page, syncLink, rate, warnings);
      repeat.sync_details = await shot(page, `${testInfo.project.name}-${shape}-${rate}-repeat`);
      record({ ...base, run: 'repeat', ...repeat, pictures_served: pictures.served - servedBefore, ...repeats(pictures) });
      testInfo.annotations.push({ type: 'measure', description: JSON.stringify({ first, repeat }) });
    });
  }
}
