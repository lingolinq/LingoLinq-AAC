// Browser check: a link in the mobile drawer navigates IN THE APP, without reloading the page
// (2026-10-02, reported: "I click Sign In and it refreshes the page and doesn't take me to the
// login page").
//
// WHY A BROWSER TEST. The drawer links carry `{{on "click" <close the drawer>}}`, which runs before
// LinkTo's own click handler. Closing re-renders the drawer away (`{{#if @isOpen}}`,
// components/la-mobile-drawer.hbs) between the two listeners -- the browser runs microtasks between
// listeners only for a REAL user click, not for element.click() or dispatchEvent, so a unit test
// cannot see it. LinkTo's handler is torn down before it runs, nothing calls preventDefault, and the
// browser follows the plain href: a full page load.
//
// Checks, at 390px: signed out, hamburger -> Sign In; signed in, hamburger -> Find Board. Each must
// reach its page with the window still the same document (a marker set before the click survives).
// Localhost only. Usage: node scripts/drawer-link-reload-qa.mjs [--headed]

import { cliArgs, launch, login } from './qa-helpers.mjs';

const { BASE, HEADED } = cliArgs(process.argv);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickDrawerLink(page, hamburgerSel, linkText) {
  await page.evaluate(() => { window.__drawerMarker = 'same-document'; });
  let ham = null;
  for (const h of await page.$$(hamburgerSel)) { if (await h.boundingBox()) { ham = h; break; } }
  if (!ham) { throw new Error('no visible hamburger ' + hamburgerSel); }
  await ham.click();                                   // a real click, as a person makes it
  await wait(600);
  const links = await page.$$('.la-mobile-drawer__link');
  let target = null;
  for (const l of links) {
    if ((await page.evaluate((e) => e.textContent.trim(), l)) === linkText && (await l.boundingBox())) { target = l; break; }
  }
  if (!target) { throw new Error('no visible drawer link "' + linkText + '"'); }
  await target.click();                                // real click: this is where it reloaded
  await wait(2500);
  return page.evaluate(() => ({ marker: window.__drawerMarker || null, path: location.pathname, drawerOpen: !!document.querySelector('.la-mobile-drawer') }));
}

const { browser, page } = await launch({ HEADED });
try {
  await page.setViewport({ width: 390, height: 844 });

  // Signed out: the landing navbar's drawer.
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(2500);
  const out = await clickDrawerLink(page, '.la-topbar-hamburger', 'Sign In');
  record('signed out: Sign In opens the login page', out.path === '/login' && !!(await page.$('#identification')), out.path);
  record('signed out: without reloading the page', out.marker === 'same-document', 'marker ' + out.marker);
  record('signed out: the drawer closed', !out.drawerOpen);

  // Signed in: the app navbar's drawer.
  await login(page, { BASE, USER: 'example', PASS: 'password' });
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(3000);
  const inn = await clickDrawerLink(page, '.la-topbar-hamburger', 'Find Board');
  record('signed in: Find Board opens search', /^\/search/.test(inn.path), inn.path);
  record('signed in: without reloading the page', inn.marker === 'same-document', 'marker ' + inn.marker);
  record('signed in: the drawer closed', !inn.drawerOpen);
} catch (e) {
  console.error('  harness error:', e && e.message);
  results.push({ name: 'harness', pass: false });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
if (!results.length) { console.log('NO CHECKS RAN, treating as a failure.'); process.exit(1); }
process.exit(failed ? 1 : 0);
