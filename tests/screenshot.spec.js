const { test, expect } = require('@playwright/test');

test('LingoLinq-AAC Screenshots for Designers', async ({ page }) => {
  // Set viewport to common desktop size
  await page.setViewportSize({ width: 1280, height: 720 });

  // Navigate to the homepage
  await page.goto('/');

  // Wait a bit for any dynamic content to load
  await page.waitForTimeout(2000);

  // Take full page screenshot of homepage
  await page.screenshot({
    path: 'screenshots/homepage-full.png',
    fullPage: true
  });

  // Take viewport screenshot of homepage
  await page.screenshot({
    path: 'screenshots/homepage-viewport.png'
  });

  // Try to navigate to login page if it exists
  try {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'screenshots/login-page.png',
      fullPage: true
    });
  } catch (error) {
    console.log('Login page not accessible:', error.message);
  }

  // Try to find and screenshot any navigation menus
  try {
    const nav = page.locator('nav, .navigation, .menu, .navbar');
    if (await nav.count() > 0) {
      await nav.first().screenshot({ path: 'screenshots/navigation.png' });
    }
  } catch (error) {
    console.log('Navigation not found:', error.message);
  }

  // Try to find and screenshot main content area
  try {
    const main = page.locator('main, .main-content, .content, #content');
    if (await main.count() > 0) {
      await main.first().screenshot({ path: 'screenshots/main-content.png' });
    }
  } catch (error) {
    console.log('Main content not found:', error.message);
  }

  // Try to find and screenshot header
  try {
    const header = page.locator('header, .header, .top-bar');
    if (await header.count() > 0) {
      await header.first().screenshot({ path: 'screenshots/header.png' });
    }
  } catch (error) {
    console.log('Header not found:', error.message);
  }

  // Try to find and screenshot footer
  try {
    const footer = page.locator('footer, .footer, .bottom-bar');
    if (await footer.count() > 0) {
      await footer.first().screenshot({ path: 'screenshots/footer.png' });
    }
  } catch (error) {
    console.log('Footer not found:', error.message);
  }

  // Screenshot any forms on the page
  try {
    const forms = page.locator('form');
    const formCount = await forms.count();
    for (let i = 0; i < formCount; i++) {
      await forms.nth(i).screenshot({ path: `screenshots/form-${i + 1}.png` });
    }
  } catch (error) {
    console.log('Forms not found:', error.message);
  }

  // Try to find AAC-specific elements
  try {
    const aacElements = page.locator(
      '.board, .symbol, .button, .communication, .aac, .tile, .grid'
    );
    const aacCount = await aacElements.count();
    for (let i = 0; i < Math.min(aacCount, 5); i++) {
      await aacElements.nth(i).screenshot({
        path: `screenshots/aac-element-${i + 1}.png`
      });
    }
  } catch (error) {
    console.log('AAC elements not found:', error.message);
  }
});