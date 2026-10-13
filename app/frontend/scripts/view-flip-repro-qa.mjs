/*
 * HUNT THE VIEW FLIP: does the navbar logo ever take a Basic user into Modern?
 *
 * Reported twice and not reproduced by a single click from a single page, so this walks a
 * VARIED ITINERARY before each click -- the report is that it happens "sometimes", which means
 * the state that matters is built up by where you have been, not by the click itself.
 *
 * Each round: force Basic, walk an itinerary, click the logo, read the view. It prints the
 * whole path for any round that flips, so the failing sequence is the output rather than
 * something to reconstruct afterwards.
 *
 *   node scripts/view-flip-repro-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 *   node scripts/view-flip-repro-qa.mjs --user district_admin --pass 'demo2025!' --rounds 12
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const ROUNDS = parseInt(args.arg('--rounds', '10'), 10);
const ORG = args.arg('--org', '1_26');
const { browser, page } = await launch(args);
await login(page, args);
await page.setViewport({ width: 1280, height: 900 });
const U = args.USER;

const ready = async () => {
  await page.waitForFunction(() => /ll-view-(basic|modern)/.test(document.body.className), { timeout: 45000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 900));
};
const view = () => page.evaluate(() =>
  document.body.classList.contains('ll-view-basic') ? 'BASIC'
    : (document.body.classList.contains('ll-view-modern') ? 'MODERN' : 'NONE'));

/* The itineraries. Deliberately mixed: pages that render the Basic shell, pages that do not,
   an org detail page (whose route loads a second user-bearing payload), the caseload (which
   Basic has no template for), and the account section. */
const BOARD = args.arg('--board', 'vocal-flair-84');
const STOPS = [
  '/', `/${U}/home`, '/organizations', `/organizations/${ORG}`, `/organizations/${ORG}/rooms`,
  `/${U}/boards`, `/${U}/extras`, `/${U}/account`, `/${U}/stats`, `/${U}/logs`,
  `/${U}/preferences`, '/caseload', `/${U}/goals`, `/${U}/badges`,
  /* THE BOARD ROUTES ARE THE ONE PLACE THE TWO VIEWS ARE DIFFERENT ROUTES rather than
     different templates -- Basic opens `user.board-alt` (/:user/board/:name) and Modern opens
     `user.board-detail`, chosen by `board_view_route`. `routes/index.js#_land_on_default` sends
     a user with a home board straight back to one of them, so the logo click and the board
     routing meet here. A walk that never opens a board never exercises that. */
  `/${U}/board/${BOARD}`, `/${U}/board-detail/${BOARD}`
];

async function forceBasic() {
  await page.goto(args.BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await ready();
  if (await view() === 'BASIC') { return true; }
  const ok = await page.evaluate(() => {
    const t = document.querySelector('.ll-viewswitch__trigger'); if (!t) { return false; } t.click(); return true;
  });
  if (!ok) { return false; }
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => {
    const e = [...document.querySelectorAll('.ll-viewswitch__item')].find((x) => /^basic/i.test(x.textContent.trim()));
    if (e) { e.click(); }
  });
  await new Promise((r) => setTimeout(r, 3000));
  return (await view()) === 'BASIC';
}

let flips = 0;
for (let round = 1; round <= ROUNDS; round++) {
  if (!await forceBasic()) { console.log('round ' + round + ': could not get into Basic, skipping'); continue; }
  // A different walk each round: 2-4 stops, rotated so every stop gets used.
  const len = 2 + (round % 3);
  const walk = [];
  for (let i = 0; i < len; i++) { walk.push(STOPS[(round * 3 + i) % STOPS.length]); }
  /* NAVIGATE BY CLICKING, NOT `page.goto`. A goto is a full page LOAD, which throws away
     exactly the accumulated in-app state the report depends on ("navigate around the site
     before clicking") -- the first version of this script did that and found nothing in six
     rounds precisely because every hop started from a clean boot. These are real SPA
     transitions: find an anchor for the target and click it, and only fall back to a load when
     no link to it exists from where we are. */
  const trail = [];
  for (const stop of walk) {
    const clickedLink = await page.evaluate((href) => {
      const a = [...document.querySelectorAll('a[href]')].find((e) => e.getAttribute('href') === href);
      if (!a) { return false; }
      a.click();
      return true;
    }, stop);
    if (!clickedLink) {
      await page.goto(args.BASE + stop, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    }
    await ready();
    const where = await page.evaluate(() => location.pathname);
    trail.push((clickedLink ? 'click ' : 'load ') + where + '=' + await view());
  }
  const clicked = await page.evaluate(() => {
    const a = document.querySelector('.nav-header__logo-link'); if (!a) { return false; } a.click(); return true;
  });
  if (!clicked) { console.log('round ' + round + ': no logo link after ' + trail.join(' -> ')); continue; }
  await new Promise((r) => setTimeout(r, 3500));
  await ready();
  const after = await view();
  const url = await page.evaluate(() => location.pathname);
  const flipped = after !== 'BASIC';
  if (flipped) { flips++; }
  console.log(('round ' + round).padEnd(9) + (flipped ? '*** FLIPPED ***  ' : 'ok               ') +
    trail.join(' -> ') + '  --logo--> ' + after + ' ' + url);
}
console.log('\n' + flips + ' flip(s) in ' + ROUNDS + ' rounds');
await browser.close();
