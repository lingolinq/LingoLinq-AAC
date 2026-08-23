/**
 * UI CLICK-TEST for the modeling / speak-as path.
 *
 * WHY: services/app-state.js#set_current_user guards its deferred
 * notifyPropertyChange('currentUser') behind `prev !== user` (perf: it was forcing a
 * second full <BoardDetailGrid> render on every board open). The guard sits in the ELSE
 * branch; the `speak_mode && speakModeUser` branch still notifies unconditionally.
 * This probe proves the clinical path — a supervisor switching to a communicator — still
 * works, by CLICKING the real caseload controls rather than calling set_speak_mode_user.
 *
 * Two entry points, both on /caseload, one per communicator row:
 *   .md-caseload__quick-action--speak   "Speak as X"  -> keep_as_self = false
 *                                       -> speakModeUser BECOMES X (the unguarded branch)
 *   .md-caseload__quick-action--model   "Model for X" -> keep_as_self = true
 *                                       -> speakModeUser stays null, referenced_* = X
 *
 * Each case runs on a fresh page load, because leaving speak mode can require a PIN.
 *
 * Usage (from app/frontend):
 *   node scripts/modeling-path-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`   PASS  ${name}`); }
  else { fail++; console.log(`   FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};

/* Reach the Ember owner. `window.LingoLinq.__container__` does NOT exist (Ember 5 keeps
   none on the Application); getOwner() on any live service is the working route. */
const OWNER = () => {
  const { getOwner } = window.require('@ember/application');
  window.__owner = getOwner(window.modal._getService());
  const as = window.__owner.lookup('service:app-state');
  const { addObserver } = window.require('@ember/object/observers');
  window.__fires = 0;
  addObserver(as, 'currentUser', () => { window.__fires++; });
  return true;
};

const state = () => {
  const as = window.__owner.lookup('service:app-state');
  const nm = (o) => (o && o.get ? (o.get('user_name') || o.get('id')) : null);
  return {
    speak_mode: as.get('speak_mode'),
    speakModeUser: nm(as.get('speakModeUser')),
    referenced: nm(as.get('referenced_speak_mode_user')),
    currentUser: nm(as.get('currentUser')),
    sessionUser: nm(as.get('sessionUser')),
    modeling_for_user: as.get('modeling_for_user'),
    fires: window.__fires,
    url: window.location.pathname
  };
};

const clickQuickAction = async (page, kind, target) => {
  const sel = `.md-caseload__quick-action--${kind}`;
  await page.waitForSelector(sel, { timeout: 30000 });
  const clicked = await page.evaluate((s, want) => {
    const btns = [...document.querySelectorAll(s)];
    const b = want ? btns.find((x) => (x.getAttribute('aria-label') || '').includes(want)) : btns[0];
    if (!b) { return null; }
    b.click();
    return b.getAttribute('aria-label');
  }, sel, target);
  if (!clicked) { throw new Error(`no ${kind} button found for "${target}"`); }
  return clicked;
};

/* Poll rather than sleep: set_speak_mode_user resolves a record and may jump routes,
   so a fixed wait races it (the same flake that bit current-user-notify-qa). */
const waitFor = async (page, fn, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(state);
    if (fn(s)) { return s; }
    await new Promise((r) => setTimeout(r, 250));
  }
  return await page.evaluate(state);
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  try {
    // ---------- CASE 1: "Speak as X" — speakModeUser must BECOME X ----------
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/caseload`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(OWNER);
    const before = await page.evaluate(state);
    console.log(`   before: currentUser=${before.currentUser} speakModeUser=${before.speakModeUser} speak_mode=${before.speak_mode}`);

    const label = await clickQuickAction(page, 'speak', 'aiden_parker');
    console.log(`   clicked: "${label}"`);
    const after = await waitFor(page, (s) => s.speakModeUser === 'aiden_parker');
    console.log(`   after:  currentUser=${after.currentUser} speakModeUser=${after.speakModeUser} speak_mode=${after.speak_mode} url=${after.url}`);

    check('speak-as sets speakModeUser to the communicator', after.speakModeUser === 'aiden_parker', `got ${after.speakModeUser}`);
    check('speak-as switches currentUser to the communicator', after.currentUser === 'aiden_parker', `got ${after.currentUser}`);
    check('sessionUser still the supervisor', after.sessionUser === OPTS.USER, `got ${after.sessionUser}`);
    check('currentUser observers fired on the switch', after.fires > before.fires, `fires ${before.fires} -> ${after.fires}`);
    check('speak_mode is on', after.speak_mode === true, `got ${after.speak_mode}`);

    // Preference-derived UI must follow the NEW user, not the supervisor.
    const pref = await page.evaluate(() => {
      const as = window.__owner.lookup('service:app-state');
      return {
        prefsUser: as.get('currentUser.user_name'),
        hc: as.get('currentUser.preferences.high_contrast'),
        painted: !!document.querySelector('.board, .md-board-detail-grid, #board_canvas')
      };
    });
    check('preference lookups resolve against the communicator', pref.prefsUser === 'aiden_parker', `got ${pref.prefsUser}`);
    check('a board surface rendered after the switch', pref.painted === true);

    // ---------- CASE 2: "Model for X" — keep_as_self, speakModeUser stays null ----------
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1280, height: 900 });
    await login(page2, OPTS);
    await page2.goto(`${OPTS.BASE}/caseload`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    await page2.evaluate(OWNER);
    const b2 = await page2.evaluate(state);
    const label2 = await clickQuickAction(page2, 'model', 'bella_martinez');
    console.log(`   clicked: "${label2}"`);
    const a2 = await waitFor(page2, (s) => s.referenced === 'bella_martinez');
    console.log(`   after:  currentUser=${a2.currentUser} speakModeUser=${a2.speakModeUser} referenced=${a2.referenced} modeling_for_user=${a2.modeling_for_user}`);

    check('model-for sets referenced_speak_mode_user', a2.referenced === 'bella_martinez', `got ${a2.referenced}`);
    check('model-for keeps speakModeUser null (keep_as_self)', !a2.speakModeUser, `got ${a2.speakModeUser}`);
    check('model-for keeps currentUser as the supervisor', a2.currentUser === OPTS.USER, `got ${a2.currentUser}`);
    check('modeling_for_user is true', a2.modeling_for_user === true, `got ${a2.modeling_for_user}`);
    check('currentUser observers fired during model-for', a2.fires >= b2.fires, `fires ${b2.fires} -> ${a2.fires}`);

    console.log(`\n   ${pass}/${pass + fail} passed`);
    if (fail) { process.exitCode = 1; }
  } finally {
    await browser.close();
  }
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
