const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function takeStyledScreenshots() {
  console.log('Starting LingoLinq-AAC styled screenshot capture...');

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const browser = await chromium.launch({
    headless: false,
    timeout: 60000
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  // Basic CSS to make the unstyled content look better for designers
  const basicStyles = `
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        background: #f8f9fa;
      }
      h1, h2, h3, h4, h5, h6 {
        color: #2c3e50;
        margin-bottom: 0.5em;
      }
      h1 { font-size: 2.5em; color: #e74c3c; }
      h2 { font-size: 2em; color: #3498db; }
      h3 { font-size: 1.5em; color: #27ae60; }

      .header, header {
        background: #34495e;
        color: white;
        padding: 1rem;
        margin: -20px -20px 20px -20px;
        border-radius: 0 0 8px 8px;
      }

      .navigation, nav {
        background: #2c3e50;
        padding: 0.5rem;
        margin: 10px -20px;
      }

      .navigation a, nav a {
        color: white;
        text-decoration: none;
        padding: 0.5rem 1rem;
        margin-right: 1rem;
        border-radius: 4px;
        background: #3498db;
      }

      .main-content, main {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin: 20px 0;
      }

      .board, .symbol, .button, .communication, .aac, .tile, .grid {
        border: 2px solid #3498db;
        padding: 1rem;
        margin: 0.5rem;
        background: white;
        border-radius: 8px;
        display: inline-block;
        min-width: 100px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      form {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin: 20px 0;
      }

      input, textarea, select {
        width: 100%;
        padding: 0.75rem;
        margin: 0.5rem 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
      }

      button, input[type="submit"] {
        background: #3498db;
        color: white;
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
      }

      button:hover, input[type="submit"]:hover {
        background: #2980b9;
      }

      .footer, footer {
        background: #ecf0f1;
        padding: 1rem;
        margin: 20px -20px -20px -20px;
        text-align: center;
        border-radius: 8px 8px 0 0;
        border-top: 3px solid #3498db;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
      }

      th, td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }

      th {
        background: #3498db;
        color: white;
      }

      .alert, .notice, .error {
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 4px;
      }

      .alert { background: #d4edda; border-left: 4px solid #27ae60; }
      .notice { background: #d1ecf1; border-left: 4px solid #3498db; }
      .error { background: #f8d7da; border-left: 4px solid #e74c3c; }

      /* AAC-specific styling */
      .aac-board {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
        padding: 20px;
        background: #ecf0f1;
        border-radius: 12px;
      }

      .aac-symbol {
        background: linear-gradient(135deg, #74b9ff, #0984e3);
        color: white;
        padding: 20px;
        text-align: center;
        border-radius: 12px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        font-weight: bold;
        min-height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Mobile responsiveness */
      @media (max-width: 768px) {
        body { padding: 10px; }
        .header, .footer { margin: -10px -10px 10px -10px; }
        .navigation { margin: 10px -10px; }
        .aac-board { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
      }
    </style>
  `;

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Inject our CSS to style the unstyled content
    console.log('Injecting designer-friendly CSS...');
    await page.addStyleTag({ content: basicStyles.replace('<style>', '').replace('</style>', '') });

    // Wait for styles to apply
    await page.waitForTimeout(2000);

    // Take styled screenshots
    console.log('Taking styled homepage screenshots...');
    await page.screenshot({
      path: path.join(screenshotsDir, 'homepage-styled-full.png'),
      fullPage: true
    });

    await page.screenshot({
      path: path.join(screenshotsDir, 'homepage-styled-viewport.png')
    });

    // Try different pages with styling
    const pages = ['/login', '/signup', '/about', '/help', '/boards'];

    for (const pagePath of pages) {
      try {
        console.log(`Taking styled screenshot of ${pagePath}...`);
        await page.goto(`http://localhost:3000${pagePath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });

        // Re-inject styles for each page
        await page.addStyleTag({ content: basicStyles.replace('<style>', '').replace('</style>', '') });
        await page.waitForTimeout(1000);

        const filename = pagePath.replace('/', '') || 'home';
        await page.screenshot({
          path: path.join(screenshotsDir, `${filename}-styled.png`),
          fullPage: true
        });
        console.log(`Styled screenshot saved: ${filename}-styled.png`);
      } catch (error) {
        console.log(`Could not access ${pagePath}: ${error.message}`);
      }
    }

    // Responsive styled screenshots
    const viewports = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1920, height: 1080, name: 'desktop-large' }
    ];

    await page.goto('http://localhost:3000');
    await page.addStyleTag({ content: basicStyles.replace('<style>', '').replace('</style>', '') });

    for (const viewport of viewports) {
      try {
        console.log(`Taking styled ${viewport.name} screenshot...`);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(1000);

        await page.screenshot({
          path: path.join(screenshotsDir, `homepage-styled-${viewport.name}.png`),
          fullPage: true
        });
        console.log(`Styled screenshot saved: homepage-styled-${viewport.name}.png`);
      } catch (error) {
        console.log(`Could not take ${viewport.name} screenshot: ${error.message}`);
      }
    }

    console.log(`\\n✅ Styled screenshots completed! Check the 'screenshots' directory.`);
    console.log(`📁 Screenshots saved to: ${screenshotsDir}`);
    console.log(`\\n🎨 These styled screenshots show how the app would look with proper CSS.`);

  } catch (error) {
    console.error('Error taking styled screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeStyledScreenshots().catch(console.error);