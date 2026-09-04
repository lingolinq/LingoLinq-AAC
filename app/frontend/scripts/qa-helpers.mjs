/**
 * Shared plumbing for the Puppeteer QA scripts.
 *
 * Extracted from modal-audit-qa.mjs so behavioural probes can reuse the login
 * flow instead of copying it — the /login/device interstitial handling below is
 * subtle enough that a second, drifting copy would be a liability.
 *
 * PUPPETEER, not Playwright: `puppeteer ^24.42.0` is what this repo commits.
 */
/* eslint-env node */
import puppeteer from 'puppeteer';

export function cliArgs(argv) {
  const arg = (name, dflt) => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return {
    BASE: arg('--base', 'http://localhost:8184'),
    USER: arg('--user', 'example'),
    PASS: arg('--pass', 'password'),
    HEADED: argv.includes('--headed'),
    arg
  };
}

export async function launch({ HEADED }) {
  const browser = await puppeteer.launch({
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  return { browser, page };
}

export async function login(page, { BASE, USER, PASS }) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#identification', { timeout: 20000 }).catch(() => {});
  // Already signed in (persisted session)? Then there is no login form.
  if (!(await page.$('#identification'))) { return true; }

  await page.type('#identification', USER);
  await page.type('#password', PASS);
  await page.keyboard.press('Enter');

  await page.waitForFunction(() => !document.querySelector('#identification'), { timeout: 45000 })
    .catch(() => { throw new Error('login did not complete — check --user/--pass'); });

  /*
   * "Trust this device" (/login/device) is a SEPARATE route after the form, and
   * the app is not usable behind it — anything opened there renders over a
   * half-booted shell, which silently invalidates a whole run. Wait for the
   * button to exist before clicking; note page.waitForTimeout() was REMOVED in
   * Puppeteer 24, so `?.()` on it is a silent no-op rather than a wait.
   */
  const trust = await page
    .waitForSelector('button.login-btn--device', { timeout: 10000 })
    .catch(() => null);
  if (trust) { await trust.click().catch(() => {}); }

  // Only past /login is the app real. Fail loudly rather than probing a shell.
  await page
    .waitForFunction(() => !/\/login/.test(window.location.pathname), { timeout: 30000 })
    .catch(() => { throw new Error('stuck on ' + page.url() + ' — never reached the app'); });
  await new Promise((r) => setTimeout(r, 1500));
  return true;
}

/*
 * utils/modal.js assigns itself to `window.modal` and its open/close delegate to
 * the modal SERVICE via _getService(), so driving it exercises the same path a
 * real click does.
 */
export async function assertAppReady(page) {
  const ok = await page.evaluate(() => {
    try {
      if (!window.modal) { return 'window.modal is undefined'; }
      if (typeof window.modal.open !== 'function') { return 'window.modal.open is not a function'; }
      return !!window.modal._getService() || 'modal._getService() returned nothing (app not booted?)';
    } catch (e) { return 'threw: ' + e.message; }
  });
  if (ok !== true) { throw new Error('app not reachable in-page (' + ok + ')'); }
}
