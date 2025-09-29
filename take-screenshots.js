const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function takeScreenshots() {
  console.log('Starting LingoLinq-AAC screenshot capture...');

  // Create screenshots directory if it doesn't exist
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const browser = await chromium.launch({
    headless: false, // Set to true for headless mode
    timeout: 60000
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for page to load
    console.log('Waiting for page to load...');
    await page.waitForTimeout(3000);

    // Take homepage screenshots
    console.log('Taking homepage screenshots...');
    await page.screenshot({
      path: path.join(screenshotsDir, 'homepage-full.png'),
      fullPage: true
    });

    await page.screenshot({
      path: path.join(screenshotsDir, 'homepage-viewport.png')
    });

    // Try to navigate to other common pages
    const pages = ['/login', '/signup', '/about', '/help', '/boards'];

    for (const pagePath of pages) {
      try {
        console.log(`Navigating to ${pagePath}...`);
        await page.goto(`http://localhost:3000${pagePath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        await page.waitForTimeout(2000);

        const filename = pagePath.replace('/', '') || 'home';
        await page.screenshot({
          path: path.join(screenshotsDir, `${filename}-page.png`),
          fullPage: true
        });
        console.log(`Screenshot saved: ${filename}-page.png`);
      } catch (error) {
        console.log(`Could not access ${pagePath}: ${error.message}`);
      }
    }

    // Go back to homepage for component screenshots
    console.log('Returning to homepage for component screenshots...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Screenshot specific components
    const components = [
      { selector: 'nav, .navigation, .navbar, .menu', name: 'navigation' },
      { selector: 'header, .header, .top-bar', name: 'header' },
      { selector: 'main, .main-content, .content, #content', name: 'main-content' },
      { selector: 'footer, .footer, .bottom-bar', name: 'footer' },
      { selector: 'form', name: 'form' },
      { selector: '.board, .symbol, .button, .communication, .aac, .tile, .grid', name: 'aac-elements' }
    ];

    for (const component of components) {
      try {
        const elements = await page.locator(component.selector);
        const count = await elements.count();

        if (count > 0) {
          console.log(`Found ${count} ${component.name} element(s)`);
          await elements.first().screenshot({
            path: path.join(screenshotsDir, `${component.name}.png`)
          });
          console.log(`Screenshot saved: ${component.name}.png`);
        }
      } catch (error) {
        console.log(`Could not screenshot ${component.name}: ${error.message}`);
      }
    }

    // Take screenshots at different viewport sizes for responsive design
    const viewports = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1920, height: 1080, name: 'desktop-large' }
    ];

    for (const viewport of viewports) {
      try {
        console.log(`Taking ${viewport.name} screenshot...`);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(1000);

        await page.screenshot({
          path: path.join(screenshotsDir, `homepage-${viewport.name}.png`),
          fullPage: true
        });
        console.log(`Screenshot saved: homepage-${viewport.name}.png`);
      } catch (error) {
        console.log(`Could not take ${viewport.name} screenshot: ${error.message}`);
      }
    }

    console.log(`\\n✅ Screenshots completed! Check the 'screenshots' directory.`);
    console.log(`📁 Screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

// Run the script
takeScreenshots().catch(console.error);