/*
 * Do the six pages that GAINED the account rail actually survive it?
 *
 * The account pill row was retired on 2026-09-21 (commit 075152829) and
 * `accountRailContext` widened by six routes, so user.log / user.goal / user.badges /
 * user.history / user.lessons / user.focus now render beside a 208px fixed panel that they
 * have never rendered beside before. Above 900px that panel eats 208px of content width;
 * at 900px and below it becomes an in-flow auto-fit grid ABOVE the page. Neither had been
 * looked at, so this reports what is actually on screen.
 *
 * It also pins two things the unit tests cannot see: that `.md-pillnav--user` is gone
 * everywhere, and that the two email-link landings (password_reset, confirm_registration)
 * have NO nav of any kind.
 *
 *   node scripts/account-rail-pages-qa.mjs --user luna_garcia --pass 'demo2025!'
 *   node scripts/account-rail-pages-qa.mjs --user luna_garcia --pass 'demo2025!' --shots /tmp/out
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';
import { mkdirSync, writeFileSync } from 'fs';

const args = cliArgs(process.argv);
const { browser, page } = await launch(args);
const SHOTS = args.arg('--shots', '');
if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); }

/* 1440 = roomy desktop; 1100 and 950 straddle the 901-1200 pinch band where the shell's
   208px padding applies but the workspace has not yet hit its own narrow rules; 900 is the
   breakpoint itself; 600 and 375 are the in-flow grid at two and one columns. */
const WIDTHS = [1440, 1100, 950, 900, 600, 375];
const SHOT_WIDTHS = [1100, 375];

/* `enter` navigates to the page. The two detail routes have dynamic ids, so they are reached
   by CLICKING the first real link on their list page rather than by guessing an id. */
const TARGETS = [
  { name: 'account',  kind: 'rail', path: '/{u}/account' },   // control: had the rail already
  { name: 'logs',     kind: 'rail', path: '/{u}/logs' },      // control: had the rail already
  { name: 'log',      kind: 'rail', path: '/{u}/logs', click: 'a[href*="/logs/"]' },
  { name: 'goal',     kind: 'rail', path: '/{u}/goals', click: 'a[href*="/goals/"]' },
  { name: 'badges',   kind: 'rail', path: '/{u}/badges' },
  { name: 'lessons',  kind: 'rail', path: '/{u}/lessons' },
  { name: 'focus',    kind: 'rail', path: '/{u}/focus' },
  { name: 'history',  kind: 'rail', path: '/{u}/history' },
  { name: 'pwreset',  kind: 'nonav', path: '/{u}/password_reset/bogus-code' },
  { name: 'confirm',  kind: 'nonav', path: '/{u}/confirm_registration/bogus-code' }
];

function probe() {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) { return null; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0,
      h: Math.round(r.height), y: Math.round(r.y),
      x: Math.round(r.x), w: Math.round(r.width),
      pos: cs.position,
      cols: cs.gridTemplateColumns && cs.gridTemplateColumns !== 'none'
        ? cs.gridTemplateColumns.split(' ').length : null
    };
  };
  // Anything inside the page content that is wider than its own box, i.e. clipped or
  // forcing a scrollbar. Reported with a selector so it can be found again.
  const main = document.querySelector('.md-main--user, .md-workspace, #content');
  const overflowing = [];
  if (main) {
    main.querySelectorAll('*').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const cs = getComputedStyle(el);
        // `auto`/`scroll` means it was DESIGNED to scroll; that is fine, not a finding.
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') { return; }
        overflowing.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
          over: el.scrollWidth - el.clientWidth,
          clip: cs.overflowX
        });
      }
    });
  }
  const cur = document.querySelector('.md-acct-rail [aria-current="page"]');
  return {
    rail: box('.md-acct-rail'),
    pillUser: box('.md-pillnav--user'),          // must always be null now
    pillAny: box('.md-pillnav'),
    shellRail: !!document.querySelector('.md-shell--user-rail'),
    gutter: !!document.querySelector('.md-bare-rail-gutter'),
    workspace: box('.md-workspace'),
    activeRow: cur ? cur.textContent.trim().split('\n')[0].slice(0, 20) : null,
    docOverflow: Math.max(0, document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth),
    overflowing: overflowing.slice(0, 4)
  };
}

const findings = [];
const rows = [];

try {
  await login(page, args);
  const u = args.USER;

  for (const t of TARGETS) {
    const url = args.BASE + t.path.replace('{u}', u);
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 900));

    if (t.click) {
      const link = await page.$(t.click);
      if (!link) { console.log(`  !! ${t.name}: no "${t.click}" to click on ${url} — SKIPPED`); continue; }
      await link.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 1800));
    }
    const landed = page.url();

    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 950 });
      await new Promise((r) => setTimeout(r, 500));
      const o = await page.evaluate(probe);
      rows.push({ name: t.name, w, o, landed });

      if (o.pillUser) { findings.push(`${t.name} @${w}: .md-pillnav--user STILL RENDERS`); }
      if (t.kind === 'rail' && !(o.rail && o.rail.shown)) { findings.push(`${t.name} @${w}: rail MISSING`); }
      if (t.kind === 'nonav' && o.rail && o.rail.shown) { findings.push(`${t.name} @${w}: rail present on an email-link page`); }
      if (t.kind === 'nonav' && o.pillAny && o.pillAny.shown) { findings.push(`${t.name} @${w}: a pill nav is present on an email-link page`); }
      if (o.docOverflow > 2) { findings.push(`${t.name} @${w}: page scrolls horizontally by ${o.docOverflow}px`); }
      for (const ov of o.overflowing) { findings.push(`${t.name} @${w}: ${ov.sel} clipped by ${ov.over}px (overflow-x:${ov.clip})`); }

      if (SHOTS && SHOT_WIDTHS.includes(w)) {
        await page.screenshot({ path: `${SHOTS}/${t.name}-${w}.png`, fullPage: false }).catch(() => {});
      }
    }
  }

  console.log('\n=== GEOMETRY ===');
  console.log('page      width  rail                              workspace        activeRow');
  for (const { name, w, o } of rows) {
    const rail = o.rail && o.rail.shown
      ? `${o.rail.pos.padEnd(8)} h${String(o.rail.h).padStart(4)} y${String(o.rail.y).padStart(4)}${o.rail.cols ? ' ' + o.rail.cols + 'col' : ''}`
      : (o.rail ? 'present-but-hidden' : 'absent');
    const ws = o.workspace ? `x${String(o.workspace.x).padStart(4)} w${String(o.workspace.w).padStart(4)}` : '-';
    console.log(`${name.padEnd(9)} ${String(w).padStart(5)}  ${rail.padEnd(33)} ${ws.padEnd(16)} ${o.activeRow || '-'}`);
  }

  console.log('\n=== FINDINGS ===');
  if (!findings.length) { console.log('none'); }
  for (const f of findings) { console.log('  - ' + f); }
  if (SHOTS) {
    writeFileSync(`${SHOTS}/findings.txt`, findings.join('\n') || 'none');
    console.log(`\nscreenshots + findings.txt -> ${SHOTS}`);
  }
} finally {
  await browser.close();
}
