// Goal charts label each day, week and month with the local date (#1172) and put each session
// in its own local day, week and month (#1196), against a LOCAL dev stack only.
//
// Users and goals: synthetic, created by e2e/support/goals-1172.rb. Re-run it before each
// run, since its sessions are placed relative to today:
//   DB_USER=... bin/rails runner app/frontend/e2e/support/goals-1172.rb
// Run:
//   cd app/frontend && npx playwright test --project=goal-charts
//
// The browser runs in a fixed timezone with its clock pinned to a local time of day at which
// the UTC date and the local date differ (00:30 in Berlin, 20:00 in Los Angeles). It opens each
// goal from the goals list and reads the "Statistics By" grid: every monthly column must be the
// 1st of its month, every weekly column a Sunday and every daily column a day, consecutive, the
// last week or day being the browser's own; and each seeded session's status shows in the column
// of its own local month, week or day (#1196), worked out here from the session times the logs
// API returns. The seed puts sessions on both sides of a local midnight.
// Before the fixes all 6 cases failed: Berlin showed the last day of the month before, a
// Saturday and the UTC day, Los Angeles a Monday and the UTC day, and the boundary sessions sat
// in their UTC month and week.

const { test, expect } = require('@playwright/test');
const { assertLocalStack, signIn } = require('./support/local-session');

test.beforeAll(assertLocalStack);

const USER = 'e2e_goals_1172';
const MONTHLY = 'E2E Monthly Goal';
const WEEKLY = 'E2E Weekly Goal';
const DAILY = 'E2E Daily Goal';

const ZONES = [
  { timezoneId: 'Europe/Berlin', hour: 0, minute: 30 },
  { timezoneId: 'America/Los_Angeles', hour: 20, minute: 0 },
];

// The latest instant, at or before now, at which the wall clock in timeZone reads hour:minute.
function lastLocalTime(timeZone, hour, minute) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  const step = 15 * 60 * 1000;
  let t = Math.floor(Date.now() / step) * step;
  for (let i = 0; i < 4 * 48; i++, t -= step) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    if (Number(parts.hour) === hour && Number(parts.minute) === minute) { return new Date(t); }
  }
  throw new Error(`no ${hour}:${minute} in ${timeZone} in the last 48 hours`);
}

// A YYYY-MM-DD label as a calendar date, independent of any timezone.
function calendarDate(label) {
  const [y, m, d] = label.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function weekdayOf(label) {
  return calendarDate(label).getUTCDay();
}
function daysBetween(a, b) {
  return Math.round((calendarDate(b) - calendarDate(a)) / (24 * 60 * 60 * 1000));
}
function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function localParts(instant, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(instant).map((p) => [p.type, p.value]));
}

// The local date of instant in timeZone, as YYYY-MM-DD.
function localDate(instant, timeZone) {
  const parts = localParts(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// The Sunday that starts the local week containing instant, in timeZone, as YYYY-MM-DD.
function localSundayOf(instant, timeZone) {
  const parts = localParts(instant, timeZone);
  const back = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const sunday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back));
  return sunday.toISOString().substring(0, 10);
}

// The 1st of the local month containing instant, in timeZone, as YYYY-MM-DD.
function localMonthOf(instant, timeZone) {
  return localDate(instant, timeZone).substring(0, 8) + '01';
}

function uniqueSorted(list) {
  return Array.from(new Set(list)).sort();
}

// Opens the goal from the goals list and returns the dates the grid shows: the date row's
// labels, and the date at the end of each status tooltip ("1 status, 2026-07-12"); plus when
// each of the goal's sessions started, read from the logs API.
async function openGoalDates(page, summary) {
  await page.goto(`/${USER}/goals`);
  await page.getByRole('link', { name: summary }).first().click();
  await page.waitForURL(new RegExp(`/${USER}/goals/[^/?#]+`));
  const goalId = page.url().split('/goals/')[1].split(/[/?#]/)[0];
  const dateRow = page.locator('.time_block_row.dates');
  // The row's cells float, so the row itself has no height; wait on a cell.
  await expect(dateRow.locator('.time_block').first(),
    `${summary} shows no Statistics By grid: re-run e2e/support/goals-1172.rb`).toBeVisible({ timeout: 30_000 });
  const labels = (await dateRow.locator('.time_block div').allTextContents()).map((t) => t.trim());
  const tooltips = await page.locator('.time_block_row:not(.dates) .time_block').evaluateAll((blocks) =>
    blocks.map((b) => b.getAttribute('title') || b.getAttribute('data-original-title') || '').filter((t) => t));
  const tooltipDates = tooltips.map((t) => t.split(', ').pop());
  const startedAt = await page.evaluate(async ({ user, goal }) => {
    const res = await window.persistence.ajax(`/api/v1/logs?user_id=${user}&goal_id=${goal}`, { type: 'GET' });
    return res.log.map((log) => log.started_at);
  }, { user: USER, goal: goalId });
  return { labels, tooltipDates, sessions: startedAt.map((t) => new Date(t)) };
}

for (const zone of ZONES) {
  test.describe(`goal charts in ${zone.timezoneId} at ${zone.hour}:${String(zone.minute).padStart(2, '0')}`, () => {
    test.use({ timezoneId: zone.timezoneId });

    let pinned;
    test.beforeEach(async ({ page }) => {
      await signIn(page, USER, 'goals-1172.rb');
      // install, not setFixedTime: time then runs on from the pinned instant, so the app's
      // delayed timers still fire. A few seconds of drift cannot change the date.
      pinned = lastLocalTime(zone.timezoneId, zone.hour, zone.minute);
      await page.clock.install({ time: pinned });
    });

    test('a monthly goal labels every month with its 1st', async ({ page }) => {
      const { labels, tooltipDates, sessions } = await openGoalDates(page, MONTHLY);
      expect(labels.length, 'the grid shows month columns').toBeGreaterThan(0);
      for (const label of labels) {
        expect(label, 'a month column').toMatch(/^\d{4}-\d{2}-01$/);
      }
      for (let i = 1; i < labels.length; i++) {
        expect(monthsBetween(labels[i - 1], labels[i]), `${labels[i - 1]} to ${labels[i]} is one month`).toBe(1);
      }
      expect(tooltipDates.length, 'the seeded statuses show in the grid').toBeGreaterThan(0);
      for (const date of tooltipDates) {
        expect(date, 'a status tooltip').toMatch(/^\d{4}-\d{2}-01$/);
      }
      expect(uniqueSorted(tooltipDates), 'each session shows in its own local month')
        .toEqual(uniqueSorted(sessions.map((t) => localMonthOf(t, zone.timezoneId))));
    });

    test('a weekly goal labels every week with its Sunday', async ({ page }) => {
      const { labels, tooltipDates, sessions } = await openGoalDates(page, WEEKLY);
      expect(labels.length, 'the grid shows week columns').toBeGreaterThan(0);
      for (const label of labels) {
        expect(label, 'a week column').toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(weekdayOf(label), `week column ${label} is a Sunday`).toBe(0);
      }
      for (let i = 1; i < labels.length; i++) {
        expect(daysBetween(labels[i - 1], labels[i]), `${labels[i - 1]} to ${labels[i]} is one week`).toBe(7);
      }
      expect(labels[labels.length - 1], 'the last column is the local week the browser is in')
        .toBe(localSundayOf(pinned, zone.timezoneId));
      expect(tooltipDates.length, 'the seeded statuses show in the grid').toBeGreaterThan(0);
      for (const date of tooltipDates) {
        expect(weekdayOf(date), `status tooltip ${date} is a Sunday`).toBe(0);
      }
      expect(uniqueSorted(tooltipDates), 'each session shows in its own local week')
        .toEqual(uniqueSorted(sessions.map((t) => localSundayOf(t, zone.timezoneId))));
    });

    test('a daily goal labels every day with its local date', async ({ page }) => {
      const { labels, tooltipDates, sessions } = await openGoalDates(page, DAILY);
      expect(labels.length, 'the grid shows day columns').toBeGreaterThan(0);
      for (let i = 1; i < labels.length; i++) {
        expect(daysBetween(labels[i - 1], labels[i]), `${labels[i - 1]} to ${labels[i]} is one day`).toBe(1);
      }
      expect(labels[labels.length - 1], 'the last column is the local day the browser is in')
        .toBe(localDate(pinned, zone.timezoneId));
      expect(tooltipDates.length, 'the seeded statuses show in the grid').toBeGreaterThan(0);
      expect(uniqueSorted(tooltipDates), 'each session shows on its own local day')
        .toEqual(uniqueSorted(sessions.map((t) => localDate(t, zone.timezoneId))));
    });
  });
}
