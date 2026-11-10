// The Modern top menu sits at the same height on every page that has one, in Gentle and in Focused,
// at full width, at 900px (where the menu joins the page flow) and at 640px (where it collapses to
// a dropdown). Written 2026-11-09 after three silent position regressions on one branch
// (traci/feat/modern-org-nav): each came from a rule in app.scss outweighing another, and each was
// found only by measuring. LOCAL dev stack only.
//
// What it pins:
//   1. The Organizations page's menu and an org page's tabs sit at the home page's menu height.
//   2. The page title starts below the menu (the Organizations page and an org page), and the two
//      titles start at the same height where the menu is out of the page flow (above 900px).
//   3. Goals, Recordings and Stats keep their content area where it is. These pages have no top
//      menu (the account rail only), so there is nothing to compare against: the content area's
//      top is pinned at the values measured identical on develop and this branch on 2026-11-09.
//      A reviewer caught a shared Gentle rule taking 30px off Goals and Recordings and 52px off
//      Stats; this is the check that would have. An INTENDED move updates the number here, with
//      the reason in the commit.
//
// Users: synthetic, from e2e/support/users-org-nav.rb (a made-up org and two managers):
//   DB_USER=... bin/rails runner app/frontend/e2e/support/users-org-nav.rb
// Run (Ember on 8184 proxying Rails on 5000, or set E2E_BASE_URL):
//   cd app/frontend && npx playwright test --project=menu-positions

const { test, expect } = require('@playwright/test');
const { assertLocalStack, signIn } = require('./support/local-session');

test.beforeAll(assertLocalStack);

const ORG_NAME = 'E2E Menu Positions Org';
const WIDTHS = [1440, 900, 640];
const USERS = [
  { layout: 'gentle', userName: 'e2e_orgnav_gentle' },
  { layout: 'focused', userName: 'e2e_orgnav_focused' },
];

// The menu in the app shell's nav slot: the pill strip, or its dropdown once collapsed. Returns
// its box once two animation frames agree, so a late style or font load is not measured midway.
async function menuBox(page) {
  return page.waitForFunction(() => {
    const slot = document.querySelector('.ll-appshell__navbar');
    if (!slot) { return null; }
    const shown = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    const strip = slot.querySelector('nav.md-pillnav--primary');
    const menu = shown(strip) ? strip : slot.querySelector('details.md-pillnav-dropdown');
    if (!shown(menu)) { return null; }
    const r = menu.getBoundingClientRect();
    const now = `${Math.round(r.top)},${Math.round(r.bottom)}`;
    if (window.__menuBoxLast !== now) { window.__menuBoxLast = now; return null; }
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  }, null, { timeout: 30_000, polling: 'raf' }).then((h) => h.jsonValue());
}

async function topOf(page, selector) {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 30_000 });
  const box = await el.boundingBox();
  return Math.round(box.y);
}

// Not `networkidle`: the app keeps polling, so the network is rarely idle. The menu holding still
// for two frames (menuBox) is the readiness signal instead.
async function open(page, path) {
  await page.goto(path);
  return menuBox(page);
}

// `.md-workspace` top, in px, measured on develop and this branch (2026-11-09). Above 900px the
// rail sits beside the content; at 900px and below it is a bar above it, hence the larger values.
const CONTENT_TOP = {
  gentle: {
    1440: { goals: 76, recordings: 76, stats: 26 },
    900: { goals: 154, recordings: 154, stats: 206 },
    640: { goals: 198, recordings: 198, stats: 250 },
  },
  focused: {
    1440: { goals: 116, recordings: 116, stats: 96 },
    900: { goals: 204, recordings: 204, stats: 210 },
    640: { goals: 248, recordings: 248, stats: 254 },
  },
};

// The content area's top once two animation frames agree.
async function contentTop(page) {
  return page.waitForFunction(() => {
    const ws = document.querySelector('.ll-appshell .md-workspace');
    if (!ws || ws.getBoundingClientRect().height === 0) { return null; }
    const now = Math.round(ws.getBoundingClientRect().top);
    if (window.__contentTopLast !== now) { window.__contentTopLast = now; return null; }
    return now;
  }, null, { timeout: 30_000, polling: 'raf' }).then((h) => h.jsonValue());
}

for (const { layout, userName } of USERS) {
  test.describe(`${layout} layout`, () => {
    // Four page loads per test, each waiting for the layout to settle.
    test.describe.configure({ timeout: 180_000 });
    let orgPath;

    test.beforeEach(async ({ page }) => {
      await signIn(page, userName, 'users-org-nav.rb');
      await expect(page.locator('body'), `${userName} should be saved in ${layout}`)
        .toHaveClass(layout === 'focused' ? /ll-layout-focused/ : /^(?!.*ll-layout-focused)/);
      if (!orgPath) {
        await page.goto('/organizations');
        const link = page.locator('a', { hasText: ORG_NAME }).first();
        await expect(link, 'run e2e/support/users-org-nav.rb first').toBeVisible({ timeout: 30_000 });
        orgPath = await link.getAttribute('href');
      }
    });

    for (const width of WIDTHS) {
      test(`the top menu is at the home page's height at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const home = await open(page, `/${userName}/home`);

        const directory = await open(page, '/organizations');
        expect(directory.top, 'Organizations page menu vs home').toBe(home.top);
        const directoryTitle = await topOf(page, '.md-shell--org-directory .md-hero__title');
        expect(directoryTitle, 'Organizations title below the menu').toBeGreaterThanOrEqual(directory.bottom);

        const org = await open(page, orgPath);
        await expect(page.locator('.ll-appshell__navbar .md-pillnav--org-tabs, .ll-appshell__navbar details.md-pillnav-dropdown').first()).toBeAttached();
        expect(org.top, 'org tabs vs home').toBe(home.top);
        const orgTitle = await topOf(page, '.md-shell--org .md-hero__title');
        expect(orgTitle, 'org title below the tabs').toBeGreaterThanOrEqual(org.bottom);
        if (width > 900) {
          expect(orgTitle, 'org title level with the Organizations title').toBe(directoryTitle);
        }

        const people = await open(page, `${orgPath}/people?section=managers`);
        expect(people.top, 'org tabs on a people section vs home').toBe(home.top);
      });

      test(`Goals, Recordings and Stats keep their content position at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        for (const section of ['goals', 'recordings', 'stats']) {
          await page.goto(`/${userName}/${section}`);
          expect(await contentTop(page), `${section}: content area top`).toBe(CONTENT_TOP[layout][width][section]);
        }
      });
    }
  });
}
