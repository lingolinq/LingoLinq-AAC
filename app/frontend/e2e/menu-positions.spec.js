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
//   4. Basic (Focused): the left menu starts at the same height on the Organizations page and an
//      org page as on the home page. Basic shares page classes with Modern, so a Modern rule can
//      reach it; the red-team review caught one moving Basic's rail 10px.
//   5. An org member who cannot edit it (Modern) gets no org tabs and keeps the account menu.
//   3. Goals, Recordings and Stats keep their content area where it is. These pages have no top
//      menu (the account rail only), so there is nothing to compare against: the content area's
//      top is pinned at the values measured identical on develop and this branch on 2026-11-09.
//      A reviewer caught a shared Gentle rule taking 30px off Goals and Recordings and 52px off
//      Stats; this is the check that would have. An INTENDED move updates the number here, with
//      the reason in the commit.
//
// Users: synthetic, from e2e/support/users-org-nav.rb (a made-up org, three managers, one supervisor):
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

async function bottomOf(page, selector) {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 30_000 });
  const box = await el.boundingBox();
  return Math.round(box.y + box.height);
}

async function topOf(page, selector) {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 30_000 });
  const box = await el.boundingBox();
  return Math.round(box.y);
}

// Not `networkidle`: the app keeps polling, so the network is rarely idle. The menu holding still
// for two frames (menuBox) is the readiness signal instead.
// The test org's page, from the signed-in user's own org list (works for a non-editor too, who
// may not have the Organizations page).
async function orgPathFor(page) {
  const id = await page.evaluate((name) => {
    const orgs = window.LingoLinq.appState.get('currentUser.organizations') || [];
    const org = orgs.find((o) => o.name === name);
    return org && org.id;
  }, ORG_NAME);
  expect(id, 'run e2e/support/users-org-nav.rb first').toBeTruthy();
  return `/organizations/${id}`;
}

// The org tabs, and nothing else, in the app shell's menu slot: the home menu there instead would
// sit at the same height and pass the position checks.
async function expectOrgTabs(page) {
  const slotNav = page.locator('.ll-appshell__navbar nav');
  await expect(slotNav, 'one menu in the slot').toHaveCount(1);
  await expect(slotNav, 'and it is the org tabs').toHaveClass(/md-pillnav--org-tabs/);
}

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
      if (!orgPath) { orgPath = await orgPathFor(page); }
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
        await expectOrgTabs(page);
        expect(org.top, 'org tabs vs home').toBe(home.top);
        const orgTitle = await topOf(page, '.md-shell--org .md-hero__title');
        expect(orgTitle, 'org title below the tabs').toBeGreaterThanOrEqual(org.bottom);
        if (width > 900) {
          expect(orgTitle, 'org title level with the Organizations title').toBe(directoryTitle);
        } else {
          // At 900px and below the rail is a dropdown above the content: the title follows it closely
          // (reported 2026-11-09: "on small screens, the org page header is pushed way down low",
          // at 112px/152px below it). 60px is the org header's own 20px padding plus the 40px the home
          // page's header sits below the dropdown.
          const railBottom = await bottomOf(page, '#acct_rail_nav');
          expect(orgTitle - railBottom, 'org title close under the menu dropdown').toBeLessThanOrEqual(60);
          await open(page, '/organizations');
          const dirTitle = await topOf(page, '.md-shell--org-directory .md-hero__title');
          expect(dirTitle - await bottomOf(page, '#acct_rail_nav'), 'Organizations title close under the menu dropdown').toBeLessThanOrEqual(60);
          await open(page, orgPath);
        }

        const people = await open(page, `${orgPath}/people?section=managers`);
        await expectOrgTabs(page);
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

// Basic's left menu: the same height on the home page, the Organizations page and an org page.
test.describe('Basic, focused layout', () => {
  test.describe.configure({ timeout: 180_000 });
  const userName = 'e2e_orgnav_basic';

  async function railTop(page, path) {
    await page.goto(path);
    return page.waitForFunction(() => {
      const rail = document.querySelector('aside.ch-rail');
      if (!rail || rail.getBoundingClientRect().height === 0) { return null; }
      const now = Math.round(rail.getBoundingClientRect().top);
      if (window.__railTopLast !== now) { window.__railTopLast = now; return null; }
      return now;
    }, null, { timeout: 30_000, polling: 'raf' }).then((h) => h.jsonValue());
  }

  for (const width of [1440, 900]) {
    test(`the left menu does not move between pages at ${width}px`, async ({ page }) => {
      await signIn(page, userName, 'users-org-nav.rb');
      await expect(page.locator('body')).toHaveClass(/ll-view-basic/);
      await expect(page.locator('body')).toHaveClass(/ll-layout-focused/);
      await page.setViewportSize({ width, height: 900 });
      const orgPath = await orgPathFor(page);
      const home = await railTop(page, `/${userName}/home`);
      expect(await railTop(page, '/organizations'), 'Organizations page vs home').toBe(home);
      expect(await railTop(page, orgPath), 'org page vs home').toBe(home);
    });
  }
});

// Someone in the org who cannot edit it: no org tabs, the account menu, not the org one.
test.describe('Modern, an org member who cannot edit it', () => {
  test('gets no org tabs and keeps the account menu', async ({ page }) => {
    await signIn(page, 'e2e_orgnav_viewer', 'users-org-nav.rb');
    const orgPath = await orgPathFor(page);
    await page.goto(orgPath);
    await expect(page.locator('.md-shell--org .md-hero__title').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.md-pillnav--org-tabs'), 'no org tabs').toHaveCount(0);
    const rail = page.locator('#acct_rail_nav');
    await expect(rail).toBeVisible();
    // Trainings is an org-only row (the account menu has its own Reports and Settings rows).
    await expect(rail.locator(`a[href="${orgPath}/lessons"]`), 'no org rows').toHaveCount(0);
    await expect(rail, 'named as the account menu').toHaveAttribute('aria-label', 'Account menu');
    await expect(rail.locator('a[href$="/goals"]'), 'the account rows').toHaveCount(1);
  });
});
