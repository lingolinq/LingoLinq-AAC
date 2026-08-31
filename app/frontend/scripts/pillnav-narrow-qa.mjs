/*
 * What does the SLP pill-nav actually DO at narrow widths, per page and per view?
 *
 * Written to re-check checklist item J10 ("at 375px the pill-nav sits at top 0 on every
 * page — confirm that's the intended collapsed variant and not a nav that vanished").
 * The static read says UserPillNav (Boards/Caseload/Reports) renders no dropdown at all,
 * so "collapsed variant" may not exist on those pages. This reports what is on screen.
 *
 *   node scripts/pillnav-narrow-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const { browser, page } = await launch(args);

const WIDTHS = [460, 440, 375];
const ROUTES = [
  ['dashboard', '/'],
  ['boards', '/{u}/boards'],
  ['caseload', '/caseload']
];

function probe() {
  const vis = el => {
    if (!el) { return null; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      display: cs.display,
      visibility: cs.visibility,
      shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0,
      h: Math.round(r.height),
      y: Math.round(r.y)
    };
  };
  const pills = Array.from(document.querySelectorAll('.md-pillnav__pill'))
    .filter(p => { const r = p.getBoundingClientRect(); return r.height > 0 && r.width > 0; });
  const rows = new Set(pills.map(p => Math.round(p.getBoundingClientRect().y)));
  return {
    navDashboard: vis(document.querySelector('.md-pillnav--dashboard')),
    navUser: vis(document.querySelector('.md-pillnav--user')),
    dropdown: vis(document.querySelector('.md-pillnav-dropdown')),
    visiblePills: pills.length,
    pillRows: rows.size
  };
}

try {
  await login(page, args);
  const uname = args.USER;

  for (const layout of ['gentle', 'focused']) {
    console.log(`\n================ ${layout.toUpperCase()} VIEW ================`);
    for (const [name, path] of ROUTES) {
      const url = args.BASE + path.replace('{u}', uname);
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      // Apply the layout the same way the app's own class toggle does.
      await page.evaluate(l => {
        document.body.classList.toggle('ll-layout-focused', l === 'focused');
      }, layout);
      await new Promise(r => setTimeout(r, 600));

      for (const w of WIDTHS) {
        await page.setViewport({ width: w, height: 900 });
        await new Promise(r => setTimeout(r, 450));
        const out = await page.evaluate(probe);
        const nav = out.navDashboard || out.navUser;
        const navState = nav ? (nav.shown ? `shown (${out.visiblePills} pills on ${out.pillRows} row(s))` : 'HIDDEN') : 'absent';
        const dd = out.dropdown ? (out.dropdown.shown ? 'shown' : 'hidden') : 'absent';
        const verdict = (!nav || !nav.shown) && dd !== 'shown' ? '  <-- NO NAV AT ALL' : '';
        console.log(`  ${name.padEnd(10)} ${String(w).padStart(4)}px  nav: ${navState.padEnd(34)} dropdown: ${dd}${verdict}`);
      }
    }
  }
} finally {
  await browser.close();
}
