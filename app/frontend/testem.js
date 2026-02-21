const puppeteer = require('puppeteer');

module.exports = {
  framework: "qunit",
  test_page: "tests/index.html?hidepassed",
  disable_watching: true,
  launch_in_ci: ["Chrome"],
  launch_in_dev: ["Chrome"],
  browser_paths: {
    Chrome: puppeteer.executablePath()
  },
  browser_args: {
    chromium: {
      ci: [
        '--no-sandbox',
        '--headless',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--remote-debugging-port=0',
        '--window-size=1440,900'
      ],
      dev: [
        '--no-sandbox',
        '--headless',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--mute-audio',
        '--remote-debugging-port=0'
      ]
    },
    Chrome: {
      dev: ["--remote-debugging-port=0"],
      ci: [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--remote-debugging-port=0"
      ]
    }
  }
};
