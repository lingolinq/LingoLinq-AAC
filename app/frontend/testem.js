/*jshint node:true*/

// Resolve puppeteer's bundled Chromium if available. This lets `ember test` run on
// systems without a system Chrome (WSL2, CI containers) without requiring an apt
// install step. If puppeteer isn't installed, fall through to testem's default
// Chrome launcher which searches PATH.
let puppeteerChromePath = null;
try {
  puppeteerChromePath = require('puppeteer').executablePath();
} catch (e) { /* puppeteer not installed — fall back to system Chrome */ }

module.exports = {
  "framework": "qunit",
  // Use ?hidepassed to collapse passed tests. Without it, full list is visible.
  "test_page": "tests/index.html",
  "disable_watching": true,
  "browser_disconnect_timeout": 120,
  "launch_in_ci": [
    puppeteerChromePath ? "PuppeteerChrome" : "Chrome"
  ],
  // Empty = no auto-launch. Run `ember test --server`, then open
  // http://localhost:7357/tests/index.html?hidepassed in your browser manually.
  // Avoids headless Chromium hangs on WSL2. Use ["Chrome"] to auto-launch.
  launch_in_dev: [],
  launchers: puppeteerChromePath ? {
    PuppeteerChrome: {
      exe: puppeteerChromePath,
      args: [
        '--no-sandbox',
        '--headless=new',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--remote-debugging-port=0',
        '--window-size=1440,900'
      ],
      protocol: 'browser'
    }
  } : {},
  browser_args: {
    chromium: {
      dev: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--headless',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--remote-debugging-port=0',
        '--window-size=1440,900'
      ],
      ci: [
        '--no-sandbox',
        '--headless',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--remote-debugging-port=0',
        '--window-size=1440,900'
      ]
    },
    Chrome: {
      ci: [
        // --no-sandbox is needed when running Chrome inside a container
        process.env.CI ? '--no-sandbox' : null,
        '--headless',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--remote-debugging-port=0',
        '--window-size=1440,900'
      ].filter(Boolean)
    }
  }
};
