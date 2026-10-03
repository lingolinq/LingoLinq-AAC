/*
 * DOES THE PILL NAV SIT IN THE SAME PLACE ON EVERY PAGE IT SERVES?
 *
 * Reported 2026-09-21, on Modern + Focused: "all pillnav menus need to show in the same place
 * on the page ... they are varying all over the place on modern focused view". A nav that is
 * mounted ONCE and persists across transitions (templates/application.hbs) must not appear to
 * move when the page under it changes -- the whole point of persisting it is that it is the
 * fixed part of the screen.
 *
 * So this measures the nav's own box on each of the six Home-section destinations, in the
 * layout the report names, and prints the spread. Anything non-zero in `top` is the defect.
 * It also records the nav's WRAPPER and the page shell, because the nav has no position of
 * its own -- it is a sticky wrapper inside a column, so a difference can come from the
 * wrapper, from the shell's padding, or from an ancestor the page introduces.
 *
 * FOCUSED IS SET THROUGH THE UI, not by adding the body class by hand: `ll-layout-focused` is
 * re-applied from the user preference on every transition (services/app-state.js
 * #sync_layout_scope -> LingoLinq.set_layout_scope in app.js:504), so a hand-added class would
 * be correct on the page where it was added and gone on the next one -- which would look
 * exactly like the bug being measured. The run restores the original style at the end.
 *
 *   node scripts/pillnav-position-qa.mjs --user lingolinq_admin --pass 'admin2025!'
 *   node scripts/pillnav-position-qa.mjs --user lingolinq_admin --pass 'admin2025!' --style gentle
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const BASE = args.BASE;
const STYLE = args.arg('--style', 'focused');
/* The fix is scoped to >900px, where the rail is a fixed panel; at or below that the rail is
   an in-flow band and the nav belongs in the document with it. `--width` is here so both
   sides of that breakpoint can be measured rather than assumed. */
const WIDTH = parseInt(args.arg('--width', '1280'), 10);
const { browser, page } = await launch(args);
await page.setViewport({ width: WIDTH, height: 900 });

const DESTINATIONS = [
  ['dashboard', '/'],
  ['caseload', '/caseload'],
  ['boards', '/USER/boards'],
  ['extras', '/USER/extras'],
  ['organizations', '/organizations'],
  ['updates', '/USER/logs?type=note&nav=home']
];

const measure = () => page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const nav = document.querySelector('.md-pillnav');
  const shell = document.querySelector('.ll-appshell .md-shell');
  return {
    url: location.pathname + location.search,
    focused: document.body.classList.contains('ll-layout-focused'),
    modern: !document.body.classList.contains('ll-layout-classic'),
    nav: box('.md-pillnav'),
    wrapper: box('.ll-appshell__navbar'),
    shell: box('.ll-appshell .md-shell'),
    navPosition: nav ? getComputedStyle(nav).position : null,
    navMargin: nav ? getComputedStyle(nav).margin : null,
    wrapperTopStyle: document.querySelector('.ll-appshell__navbar')
      ? getComputedStyle(document.querySelector('.ll-appshell__navbar')).top : null,
    shellPaddingTop: shell ? getComputedStyle(shell).paddingTop : null,
    // The element the nav's wrapper actually sits in, named so a page-specific ancestor
    // shows up rather than being inferred.
    wrapperParent: document.querySelector('.ll-appshell__navbar')
      ? document.querySelector('.ll-appshell__navbar').parentElement.className : null,
    /* THE SCROLLPORT. The wrapper is `position: sticky`, and sticky resolves its `top`
       against the SCROLL CONTAINER's padding box -- `#content` -- not the viewport. So the
       nav's screen position is (top of #content's padding box) + (the sticky offset), and any
       per-page difference in #content's own box or padding moves the nav with it. Recorded
       here so the cause is read rather than inferred. */
    content: box('#content'),
    contentPaddingTop: document.getElementById('content')
      ? getComputedStyle(document.getElementById('content')).paddingTop : null,
    contentClass: document.getElementById('content') ? document.getElementById('content').className : null,
    topbarVar: getComputedStyle(document.documentElement).getPropertyValue('--topbar-height') ||
      getComputedStyle(document.body).getPropertyValue('--topbar-height'),
    appshell: box('.ll-appshell'),
    appshellMain: box('.ll-appshell__main')
  };
});

async function setStyle(style) {
  const trigger = await page.$('.ll-viewswitch__trigger');
  if (!trigger) { return false; }
  await trigger.click();
  await new Promise((r) => setTimeout(r, 400));
  const wanted = style === 'focused' ? 'Focused Style' : 'Gentle Style';
  const clicked = await page.evaluate((label) => {
    const items = Array.from(document.querySelectorAll('.ll-viewswitch__item'));
    const item = items.find((i) => (i.textContent || '').includes(label));
    if (!item) { return false; }
    item.click();
    return true;
  }, wanted);
  await new Promise((r) => setTimeout(r, 1200));
  return clicked;
}

await login(page, args);
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
const originalFocused = await page.evaluate(() => document.body.classList.contains('ll-layout-focused'));
const wantFocused = STYLE === 'focused';
if (originalFocused !== wantFocused) {
  const ok = await setStyle(STYLE);
  if (!ok) { console.log('WARNING: could not reach the View switcher; measuring whatever style is live'); }
}

const userName = await page.evaluate(() => {
  const link = document.querySelector('.md-acct-rail__row[href*="/"]');
  const m = link && link.getAttribute('href').match(/^\/([^/?]+)/);
  return m ? m[1] : null;
});
const name = userName || args.USER;

const rows = [];
for (const [label, path] of DESTINATIONS) {
  await page.goto(BASE + path.replace('USER', name), { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.ll-appshell', { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1100));
  rows.push({ label, ...(await measure()) });
}

const style = rows[0].focused ? 'FOCUSED' : 'GENTLE';
console.log('user: ' + name + '   style: ' + style + '   viewport ' + WIDTH + 'x900\n');
console.log('page           nav top  left  width   wrapper top  left   shell top  pad     wrapper parent');
for (const r of rows) {
  if (!r.nav) { console.log(r.label.padEnd(15) + 'NO NAV  (' + r.url + ')'); continue; }
  console.log(
    r.label.padEnd(15) +
    String(r.nav.top).padStart(7) + String(r.nav.left).padStart(6) + String(r.nav.width).padStart(7) +
    String(r.wrapper.top).padStart(13) + String(r.wrapper.left).padStart(6) +
    String(r.shell ? r.shell.top : null).padStart(11) + ' ' + String(r.shellPaddingTop).padStart(7)
  );
  console.log('               #content top=' + r.content.top + ' padTop=' + r.contentPaddingTop +
    '  appshell top=' + r.appshell.top + '  main top=' + r.appshellMain.top +
    '  sticky top=' + r.wrapperTopStyle + '  --topbar-height=' + (r.topbarVar || '(unset)').trim());
  console.log('               #content class: ' + r.contentClass);
}

const present = rows.filter((r) => r.nav);
const spread = (key, pick) => {
  const vals = present.map(pick);
  return Math.max(...vals) - Math.min(...vals);
};
console.log('\nSPREAD across the pages that have a nav (0 = aligned):');
console.log('  nav top:      ' + spread('top', (r) => r.nav.top));
console.log('  nav left:     ' + spread('left', (r) => r.nav.left));
console.log('  nav width:    ' + spread('width', (r) => r.nav.width));
console.log('  wrapper top:  ' + spread('wtop', (r) => r.wrapper.top));
console.log('  shell top:    ' + spread('stop', (r) => (r.shell ? r.shell.top : 0)));

if (originalFocused !== wantFocused) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  await setStyle(originalFocused ? 'focused' : 'gentle');
}

await browser.close();
