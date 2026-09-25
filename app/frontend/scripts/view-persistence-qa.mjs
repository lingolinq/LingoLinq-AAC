/*
 * DOES A VIEW CHOICE ACTUALLY STICK? Walk the site, switch Basic <-> Modern, and assert that
 * the choice both reached the server and survived a reload.
 *
 * WHY THIS AND NOT A "DID IT FLIP" TEST. The reported symptom -- "I clicked the logo and it put
 * me back in Modern" -- is intermittent: it needs a supervisee payload carrying a materialised
 * badge, which depends on what has been loaded. Hunting the flip directly found nothing in 28
 * rounds. The INVARIANT behind it is deterministic: a switch must produce a PUT and must still
 * be true after a reload. When that broke, the view reverted to whatever the server still held,
 * which is the flip -- in whichever direction the stored value happened to point.
 *
 * Fails loudly (exit 1) so it can gate a change; prints the failing round's trail.
 *
 *   node scripts/view-persistence-qa.mjs --user sarah_chen_slp --pass 'demo2025!' --rounds 6
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const ROUNDS = parseInt(args.arg('--rounds', '6'), 10);
const ORG = args.arg('--org', '1_26');
const { browser, page } = await launch(args);
await login(page, args);
await page.setViewport({ width: 1280, height: 900 });
const U = args.USER;

const ready = async () => {
  await page.waitForFunction(() => /ll-view-(basic|modern)/.test(document.body.className), { timeout: 45000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
};
const view = () => page.evaluate(() =>
  document.body.classList.contains('ll-view-basic') ? 'BASIC' : 'MODERN');
/* The dirty attribute is worth printing: when `supervisees` is dirty the record is carrying the
   payload that used to make serialization throw, so a pass in that state is the meaningful one. */
const dirty = () => page.evaluate(() => {
  try {
    const a = window.require('frontend/utils/app_state').default;
    return Object.keys(a.get('effective_view_user').changedAttributes()).join(',') || 'clean';
  } catch (e) { return 'n/a'; }
});

const WALKS = [
  ['/caseload'],
  ['/organizations', `/organizations/${ORG}`],
  [`/${U}/boards`, `/${U}/extras`],
  ['/caseload', `/organizations/${ORG}`, `/${U}/account`],
  [`/${U}/stats`, '/caseload'],
  [`/organizations/${ORG}/rooms`, `/${U}/logs`]
];

let failures = 0;
for (let round = 1; round <= ROUNDS; round++) {
  const walk = WALKS[(round - 1) % WALKS.length];
  await page.goto(args.BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await ready();
  for (const stop of walk) {
    await page.goto(args.BASE + stop, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await ready();
  }
  const before = await view();
  const want = before === 'BASIC' ? 'modern' : 'basic';
  const saves = [];
  const onReq = (r) => { if (r.method() === 'PUT' && /\/users\//.test(r.url())) { saves.push(r.url()); } };
  page.on('request', onReq);
  const opened = await page.evaluate(() => {
    const t = document.querySelector('.ll-viewswitch__trigger'); if (!t) { return false; } t.click(); return true;
  });
  if (!opened) { page.off('request', onReq); console.log('round ' + round + ': no view switcher after ' + walk.join(' -> ')); continue; }
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate((w) => {
    const e = [...document.querySelectorAll('.ll-viewswitch__item')]
      .find((x) => new RegExp('^' + w, 'i').test(x.textContent.trim()));
    if (e) { e.click(); }
  }, want);
  await new Promise((r) => setTimeout(r, 4000));
  page.off('request', onReq);
  const afterSwitch = await view();
  const wasDirty = await dirty();
  // The real test: does it survive a fresh load?
  await page.goto(args.BASE + '/organizations', { waitUntil: 'networkidle2', timeout: 60000 });
  await ready();
  const afterReload = await view();
  const expected = want.toUpperCase();
  const ok = saves.length > 0 && afterSwitch === expected && afterReload === expected;
  if (!ok) { failures++; }
  console.log(('round ' + round).padEnd(9) + (ok ? 'PASS  ' : 'FAIL  ') +
    before + ' -> ' + expected + ': switched=' + afterSwitch + ' reloaded=' + afterReload +
    ' PUTs=' + saves.length + ' dirty=' + wasDirty + '   after ' + walk.join(' -> '));
}
console.log('\n' + (ROUNDS - failures) + '/' + ROUNDS + ' rounds persisted the view choice');
await browser.close();
if (failures) { process.exitCode = 1; }
