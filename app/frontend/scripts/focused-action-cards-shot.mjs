/* Screenshot + measure the Focused-view "Create a Board" / "Edit Dashboard" action cards
 * and the "communicators need attention" card they sit above, so hierarchy changes can be
 * judged rather than guessed.
 *   node scripts/focused-action-cards-shot.mjs --user lingolinq_admin --pass 'admin2025!' --out /tmp/shots
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';
import { mkdirSync } from 'fs';

const args = cliArgs(process.argv);
const BASE = args.arg('--base', 'http://localhost:8184');
const USER = args.arg('--user', 'lingolinq_admin');
const PASS = args.arg('--pass', 'admin2025!');
const OUT  = args.arg('--out', '/tmp/shots');
const TAG  = args.arg('--tag', 'before');
mkdirSync(OUT, { recursive: true });
const { browser, page } = await launch(args);

await page.setViewport({ width: 1440, height: 1000 });
await login(page, { BASE, USER, PASS });
await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const info = await page.evaluate(() => {
  const g = (sel) => document.querySelector(sel);
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const box = (el) => { if (!el) { return null; } const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }; };
  const card = g('.md-card--create-board');
  const icon = g('.md-card--create-board .md-card__icon');
  const glyph = g('.md-card--create-board .md-card__icon-glyph');
  const sub = g('.md-card--create-board .md-card__sub');
  const title = g('.md-card--create-board .md-card__title');
  const attention = g('.md-card--attention');
  const measure = (sel) => {
    const c = g(sel); if (!c) { return null; }
    const ic = c.querySelector('.md-card__icon'); const ti = c.querySelector('.md-card__title');
    const su = c.querySelector('.md-card__sub');
    const r = (el) => el ? Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height) : null;
    return { card: r(c), icon: r(ic), iconRadius: ic ? getComputedStyle(ic).borderRadius : null,
             titleSize: ti ? getComputedStyle(ti).fontSize : null,
             titleWeight: ti ? getComputedStyle(ti).fontWeight : null,
             subSize: su ? getComputedStyle(su).fontSize : null,
             subColor: su ? getComputedStyle(su).color : null };
  };
  const dot = sub ? getComputedStyle(sub, '::before') : null;
  return {
    focused: document.body.classList.contains('ll-layout-focused'),
    card: box(card), cardShadow: cs(card, 'boxShadow'),
    icon: box(icon), iconRadius: cs(icon, 'borderRadius'),
    glyph: box(glyph),
    titleColor: cs(title, 'color'), titleSize: cs(title, 'fontSize'), titleWeight: cs(title, 'fontWeight'),
    subColor: cs(sub, 'color'), subSize: cs(sub, 'fontSize'),
    dotBg: dot ? dot.backgroundColor : null, dotSize: dot ? dot.width + '/' + dot.height : null,
    attention: box(attention), attentionShadow: cs(attention, 'boxShadow'),
    compare: {
      createBoard: measure('.md-card--create-board'),
      editDashboard: measure('.md-card--edit-dashboard'),
      caseload: measure('.md-card--caseload-as-button, .md-card--caseload'),
      speak: measure('.md-card--speak'),
      attentionCard: measure('.md-card--attention')
    }
  };
});
console.log(JSON.stringify(info, null, 2));

const el = await page.$('.md-grid--dashboard') || await page.$('.md-workspace');
if (el) { await el.screenshot({ path: `${OUT}/focused-grid-${TAG}.png` }); console.log(`shot: ${OUT}/focused-grid-${TAG}.png`); }
const cb = await page.$('.md-card--create-board');
if (cb) { await cb.screenshot({ path: `${OUT}/create-board-${TAG}.png` }); console.log(`shot: ${OUT}/create-board-${TAG}.png`); }
await browser.close();
