// Shared by the offline app shell specs (offline-launch.spec.js, offline-kill-switch.spec.js).
//
// These run against RAILS directly (it serves /sw.js and the page), never `ember serve`, and need a
// persistent browser profile: the kill-switch spec reopens the profile the launch spec left behind,
// so it can see the worker and caches that run installed.

const os = require('os');
const path = require('path');
const { chromium, devices } = require('@playwright/test');
const { assertLocalStack } = require('./local-session');

const CACHE_PREFIX = 'll-offline-shell-';

function baseURL() {
  return process.env.E2E_BASE_URL || 'http://localhost:8184';
}

function profileDir(name) {
  return path.join(process.env.E2E_OFFLINE_PROFILE_DIR || path.join(os.tmpdir(), 'll-offline-shell-e2e'), name);
}

// options.locale sets the browser language (navigator.language), which picks the interface language.
async function openProfile(name, options) {
  assertLocalStack();
  const { viewport, userAgent, deviceScaleFactor } = devices['Desktop Chrome'];
  return chromium.launchPersistentContext(profileDir(name), {
    baseURL: baseURL(),
    viewport: viewport,
    userAgent: userAgent,
    deviceScaleFactor: deviceScaleFactor,
    locale: (options && options.locale) || 'en-US',
  });
}

// What the page can see of the worker and its caches.
async function workerState(page) {
  return page.evaluate(async (prefix) => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const keys = await caches.keys();
    return {
      registrations: registrations.map((r) => {
        const w = r.active || r.waiting || r.installing;
        return w ? new URL(w.scriptURL).pathname : null;
      }),
      caches: keys.filter((k) => k.indexOf(prefix) === 0),
    };
  }, CACHE_PREFIX);
}

module.exports = { CACHE_PREFIX, baseURL, openProfile, profileDir, workerState };
