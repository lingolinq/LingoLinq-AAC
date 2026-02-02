const puppeteer = require('puppeteer');

module.exports = {
  test_page: "tests/index.html?hidepassed",
  disable_watching: true,

  launch_in_dev: ["Chrome"],
  launch_in_ci: ["Chrome"],

  browser_paths: {
    Chrome: puppeteer.executablePath()
  },

  browser_args: {
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
