/*
 * WHERE DOES EACH ACCOUNT-SECTION PAGE'S CONTENT ACTUALLY BEGIN, against the home page?
 *
 * Requested 2026-09-23 (Modern, GENTLE): "make all of the page content for account, goals,
 * logs, profile, recordings, reports, settings, subscriptions, and supervision move up on the
 * page to the same place it begins on the home page."
 *
 * The home-section pages were aligned to each other on 2026-09-21 by two declarations
 * (`#content` padding and the shell's nav clearance), scoped with `:has(.ll-appshell__navbar)`
 * so they could not reach the account pages, which have no nav. This measures the gap that
 * scope left behind, and it reports the CHAIN as well as the answer -- the 2026-09-21 work
 * found three independent offsets stacking, so a single number would not say what to change.
 *
 *   node scripts/account-pages-top-alignment-qa.mjs --user luna_garcia --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const { browser, page } = await launch(args);

/* THE REFERENCE IS `/`, NOT `/{u}/home`. Both render the Modern dashboard, but for an account
   with a home board `/{u}/home` can land in speak mode instead, where there is no app shell at
   all -- the first run of this script reported `#content` padding 0 and no shell for exactly
   that reason. `/` is the route the Dashboard pill itself points at for that user. */
const TARGETS = [
  { name: 'dashboard (ref)', path: '/' },
  { name: 'caseload', path: '/caseload' },
  { name: 'rooms', path: args.arg('--rooms', '/organizations/1_27/rooms') },
  { name: 'account',      path: '/{u}/account' },
  { name: 'goals',        path: '/{u}/goals' },
  { name: 'logs',         path: '/{u}/logs' },
  { name: 'profile',      path: '/{u}/edit' },
  { name: 'recordings',   path: '/{u}/recordings' },
  { name: 'reports',      path: '/{u}/stats' },
  { name: 'settings',     path: '/{u}/preferences' },
  { name: 'subscription', path: '/{u}/subscription' },
  { name: 'supervision',  path: '/{u}/supervision' }
];

function probe() {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const content = document.querySelector('#content');
  const shell = document.querySelector('.ll-appshell .md-shell');
  const ws = document.querySelector('.ll-appshell .md-workspace');

  /* THE FIRST THING THE EYE LANDS ON, not the workspace box: the 2026-09-21 measurements were
     taken this way and the two are not the same number -- a workspace with 40px of padding
     starts 40px above anything in it. Skips zero-height and hidden nodes, and skips the nav
     wrapper, which is pulled out of flow and would otherwise always answer first. */
  let firstY = null, firstWhat = null;
  const scope = ws || shell;
  if (scope) {
    const walk = scope.querySelectorAll('*');
    for (const el of walk) {
      if (el.closest('.ll-appshell__navbar')) { continue; }
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) { continue; }
      const r = el.getBoundingClientRect();
      if (r.height < 4 || r.width < 4) { continue; }
      if (!el.textContent.trim() && !el.querySelector('svg, img')) { continue; }
      firstY = Math.round(r.y);
      firstWhat = el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.');
      break;
    }
  }
  return {
    body: document.body.className.split(' ').filter((c) => c.indexOf('ll-') === 0).join(' '),
    contentClass: content ? content.className.trim() : '(none)',
    contentPad: content ? px(cs(content).paddingTop) : null,
    shellClass: shell ? shell.className.trim() : '(no appshell shell)',
    shellPad: shell ? px(cs(shell).paddingTop) : null,
    wsPad: ws ? px(cs(ws).paddingTop) : null,
    wsMargin: ws ? px(cs(ws).marginTop) : null,
    wsY: ws ? Math.round(ws.getBoundingClientRect().y) : null,
    navbar: !!document.querySelector('.ll-appshell__navbar'),
    firstY, firstWhat
  };
}

await login(page, args);
const u = args.USER;
console.log('\nWIDTH 1280 — gentle/modern top alignment\n');
console.log('page            nav  #content  shell  ws(pad/mar)   wsY   contentY  first element');
console.log('-'.repeat(104));
const rows = [];
for (const t of TARGETS) {
  await page.goto(args.BASE + t.path.replace('{u}', u), { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  const r = await page.evaluate(probe);
  rows.push([t.name, r]);
  console.log(
    t.name.padEnd(15) + (r.navbar ? 'yes' : 'no ').padEnd(5) +
    String(r.contentPad).padStart(6) + String(r.shellPad).padStart(9) +
    (r.wsPad + '/' + r.wsMargin).padStart(12) + String(r.wsY).padStart(7) +
    String(r.firstY).padStart(10) + '   ' + (r.firstWhat || '')
  );
}
const home = rows[0][1];
console.log('\nbody classes: ' + home.body);
console.log('\nDELTA vs home (positive = sits LOWER than home, needs to move up):');
for (const [name, r] of rows.slice(1)) {
  const d = (r.firstY != null && home.firstY != null) ? r.firstY - home.firstY : null;
  console.log('  ' + name.padEnd(15) + (d == null ? '?' : (d > 0 ? '+' : '') + d + 'px'));
}
await browser.close();
