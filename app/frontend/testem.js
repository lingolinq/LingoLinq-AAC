/*jshint node:true*/
module.exports = {
  "framework": "qunit",
  // Use ?hidepassed to collapse passed tests. Without it, full list is visible.
  "test_page": "tests/index.html",
  "disable_watching": true,
  "browser_disconnect_timeout": 120,
  "launch_in_ci": [
    "Chrome"
  ],
  // Empty = no auto-launch. Run `ember test --server`, then open
  // http://localhost:7357/tests/index.html?hidepassed in your browser manually.
  // Avoids headless Chromium hangs on WSL2. Use ["Chrome"] to auto-launch.
  launch_in_dev: [],
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
