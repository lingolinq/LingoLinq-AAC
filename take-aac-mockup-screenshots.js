const { chromium } = require('playwright');

async function takeAAcMockupScreenshots() {
  console.log('🎬 Starting AAC mockup screenshot capture...');

  const browser = await chromium.launch({
    headless: false,
    timeout: 60000
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  // Navigate to the application
  console.log('📍 Navigating to application...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait a moment for any initial loading
  await page.waitForTimeout(2000);

  // Inject comprehensive AAC interface styles and mockup content
  const aacStyles = `
    /* Reset and base styles */
    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }

    /* Header */
    .aac-header {
      background: rgba(255, 255, 255, 0.95);
      padding: 15px 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      backdrop-filter: blur(10px);
    }

    .aac-logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .aac-logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(45deg, #4facfe 0%, #00f2fe 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 18px;
    }

    .aac-logo-text {
      font-size: 24px;
      font-weight: 700;
      color: #2c3e50;
    }

    .aac-user-menu {
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .aac-user-avatar {
      width: 35px;
      height: 35px;
      background: linear-gradient(45deg, #ff6b6b, #ee5a52);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }

    /* Main content area */
    .aac-main {
      display: flex;
      height: calc(100vh - 70px);
    }

    /* Sidebar */
    .aac-sidebar {
      width: 280px;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      padding: 20px;
      overflow-y: auto;
      border-right: 1px solid rgba(0,0,0,0.1);
    }

    .aac-sidebar h3 {
      color: #2c3e50;
      margin-bottom: 15px;
      font-size: 18px;
    }

    .aac-board-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .aac-board-item {
      padding: 12px 15px;
      margin-bottom: 8px;
      background: white;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 2px solid transparent;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .aac-board-item:hover {
      background: #f8f9fa;
      border-color: #4facfe;
    }

    .aac-board-item.active {
      background: #4facfe;
      color: white;
      border-color: #4facfe;
    }

    .aac-board-icon {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    /* Communication board grid */
    .aac-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
    }

    .aac-board-header {
      background: rgba(255, 255, 255, 0.9);
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      text-align: center;
      backdrop-filter: blur(10px);
    }

    .aac-board-title {
      font-size: 28px;
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 8px;
    }

    .aac-board-description {
      color: #7f8c8d;
      font-size: 16px;
    }

    .aac-symbol-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .aac-symbol {
      background: white;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      border: 3px solid transparent;
      position: relative;
      overflow: hidden;
    }

    .aac-symbol:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.15);
      border-color: #4facfe;
    }

    .aac-symbol:active {
      transform: translateY(-2px);
      background: #4facfe;
      color: white;
    }

    .aac-symbol-image {
      width: 80px;
      height: 80px;
      margin: 0 auto 15px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      color: white;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }

    .aac-symbol-text {
      font-size: 16px;
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 5px;
    }

    .aac-symbol-category {
      font-size: 12px;
      color: #7f8c8d;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Sentence builder */
    .aac-sentence-builder {
      background: rgba(255, 255, 255, 0.95);
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      backdrop-filter: blur(10px);
    }

    .aac-sentence-title {
      font-size: 18px;
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 15px;
    }

    .aac-sentence-display {
      background: #f8f9fa;
      border: 2px dashed #dee2e6;
      border-radius: 8px;
      padding: 20px;
      min-height: 80px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .aac-sentence-word {
      background: #4facfe;
      color: white;
      padding: 8px 15px;
      border-radius: 20px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .aac-sentence-controls {
      margin-top: 15px;
      display: flex;
      gap: 10px;
    }

    .aac-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .aac-btn-primary {
      background: #4facfe;
      color: white;
    }

    .aac-btn-secondary {
      background: #6c757d;
      color: white;
    }

    .aac-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    /* Quick actions */
    .aac-quick-actions {
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .aac-quick-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: white;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
    }

    .aac-quick-btn:hover {
      transform: scale(1.1);
    }

    /* Category-specific colors */
    .category-food { background: linear-gradient(45deg, #ff9a9e 0%, #fad0c4 100%); }
    .category-people { background: linear-gradient(45deg, #a8edea 0%, #fed6e3 100%); }
    .category-actions { background: linear-gradient(45deg, #ffecd2 0%, #fcb69f 100%); }
    .category-feelings { background: linear-gradient(45deg, #667eea 0%, #764ba2 100%); }
    .category-places { background: linear-gradient(45deg, #f093fb 0%, #f5576c 100%); }
    .category-objects { background: linear-gradient(45deg, #4facfe 0%, #00f2fe 100%); }

    /* Responsive design */
    @media (max-width: 768px) {
      .aac-main {
        flex-direction: column;
        height: auto;
      }

      .aac-sidebar {
        width: 100%;
        height: auto;
        max-height: 200px;
      }

      .aac-symbol-grid {
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
      }

      .aac-symbol {
        padding: 15px;
      }

      .aac-symbol-image {
        width: 60px;
        height: 60px;
        font-size: 30px;
      }
    }

    /* Hide original content */
    body > * {
      display: none !important;
    }

    .aac-app {
      display: block !important;
    }
  `;

  // Inject styles
  await page.addStyleTag({ content: aacStyles });

  // Create mockup AAC interface
  const aacInterface = `
    <div class="aac-app">
      <header class="aac-header">
        <div class="aac-logo">
          <div class="aac-logo-icon">LL</div>
          <div class="aac-logo-text">LingoLinq AAC</div>
        </div>
        <div class="aac-user-menu">
          <div class="aac-user-avatar">JS</div>
        </div>
      </header>

      <main class="aac-main">
        <aside class="aac-sidebar">
          <h3>Communication Boards</h3>
          <ul class="aac-board-list">
            <li class="aac-board-item active">
              <div class="aac-board-icon category-food">🍎</div>
              <span>Food & Drinks</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-people">👥</div>
              <span>People & Family</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-actions">🏃</div>
              <span>Actions & Verbs</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-feelings">😊</div>
              <span>Feelings</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-places">🏠</div>
              <span>Places</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-objects">🎾</div>
              <span>Objects & Toys</span>
            </li>
          </ul>
        </aside>

        <div class="aac-content">
          <div class="aac-sentence-builder">
            <div class="aac-sentence-title">My Message</div>
            <div class="aac-sentence-display">
              <div class="aac-sentence-word">I</div>
              <div class="aac-sentence-word">want</div>
              <div class="aac-sentence-word">apple</div>
            </div>
            <div class="aac-sentence-controls">
              <button class="aac-btn aac-btn-primary">🔊 Speak</button>
              <button class="aac-btn aac-btn-secondary">Clear</button>
            </div>
          </div>

          <div class="aac-board-header">
            <div class="aac-board-title">Food & Drinks</div>
            <div class="aac-board-description">Choose what you want to eat or drink</div>
          </div>

          <div class="aac-symbol-grid">
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🍎</div>
              <div class="aac-symbol-text">Apple</div>
              <div class="aac-symbol-category">Fruit</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🍌</div>
              <div class="aac-symbol-text">Banana</div>
              <div class="aac-symbol-category">Fruit</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🥛</div>
              <div class="aac-symbol-text">Milk</div>
              <div class="aac-symbol-category">Drink</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🍞</div>
              <div class="aac-symbol-text">Bread</div>
              <div class="aac-symbol-category">Food</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🧀</div>
              <div class="aac-symbol-text">Cheese</div>
              <div class="aac-symbol-category">Food</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">💧</div>
              <div class="aac-symbol-text">Water</div>
              <div class="aac-symbol-category">Drink</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🍪</div>
              <div class="aac-symbol-text">Cookie</div>
              <div class="aac-symbol-category">Snack</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🥕</div>
              <div class="aac-symbol-text">Carrot</div>
              <div class="aac-symbol-category">Vegetable</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🍕</div>
              <div class="aac-symbol-text">Pizza</div>
              <div class="aac-symbol-category">Food</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🍝</div>
              <div class="aac-symbol-text">Pasta</div>
              <div class="aac-symbol-category">Food</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🥤</div>
              <div class="aac-symbol-text">Juice</div>
              <div class="aac-symbol-category">Drink</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-food">🍦</div>
              <div class="aac-symbol-text">Ice Cream</div>
              <div class="aac-symbol-category">Dessert</div>
            </div>
          </div>
        </div>
      </main>

      <div class="aac-quick-actions">
        <button class="aac-quick-btn" style="background: #28a745;" title="Yes">✓</button>
        <button class="aac-quick-btn" style="background: #dc3545;" title="No">✗</button>
        <button class="aac-quick-btn" style="background: #ffc107;" title="Help">?</button>
      </div>
    </div>
  `;

  // Replace page content with AAC mockup
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, aacInterface);

  // Wait for rendering
  await page.waitForTimeout(1000);

  // Take desktop screenshot
  console.log('📸 Taking desktop AAC interface screenshot...');
  await page.screenshot({
    path: 'screenshots/aac-food-board-desktop.png',
    fullPage: true
  });

  // Take tablet screenshot
  console.log('📱 Taking tablet AAC interface screenshot...');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'screenshots/aac-food-board-tablet.png',
    fullPage: true
  });

  // Take mobile screenshot
  console.log('📱 Taking mobile AAC interface screenshot...');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'screenshots/aac-food-board-mobile.png',
    fullPage: true
  });

  // Create People & Family board
  console.log('👥 Creating People & Family board...');
  await page.setViewportSize({ width: 1280, height: 720 });

  const peopleBoard = `
    <div class="aac-app">
      <header class="aac-header">
        <div class="aac-logo">
          <div class="aac-logo-icon">LL</div>
          <div class="aac-logo-text">LingoLinq AAC</div>
        </div>
        <div class="aac-user-menu">
          <div class="aac-user-avatar">JS</div>
        </div>
      </header>

      <main class="aac-main">
        <aside class="aac-sidebar">
          <h3>Communication Boards</h3>
          <ul class="aac-board-list">
            <li class="aac-board-item">
              <div class="aac-board-icon category-food">🍎</div>
              <span>Food & Drinks</span>
            </li>
            <li class="aac-board-item active">
              <div class="aac-board-icon category-people">👥</div>
              <span>People & Family</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-actions">🏃</div>
              <span>Actions & Verbs</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-feelings">😊</div>
              <span>Feelings</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-places">🏠</div>
              <span>Places</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-objects">🎾</div>
              <span>Objects & Toys</span>
            </li>
          </ul>
        </aside>

        <div class="aac-content">
          <div class="aac-sentence-builder">
            <div class="aac-sentence-title">My Message</div>
            <div class="aac-sentence-display">
              <div class="aac-sentence-word">I</div>
              <div class="aac-sentence-word">love</div>
              <div class="aac-sentence-word">mom</div>
            </div>
            <div class="aac-sentence-controls">
              <button class="aac-btn aac-btn-primary">🔊 Speak</button>
              <button class="aac-btn aac-btn-secondary">Clear</button>
            </div>
          </div>

          <div class="aac-board-header">
            <div class="aac-board-title">People & Family</div>
            <div class="aac-board-description">Talk about family members and people you know</div>
          </div>

          <div class="aac-symbol-grid">
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👩</div>
              <div class="aac-symbol-text">Mom</div>
              <div class="aac-symbol-category">Family</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👨</div>
              <div class="aac-symbol-text">Dad</div>
              <div class="aac-symbol-category">Family</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👶</div>
              <div class="aac-symbol-text">Baby</div>
              <div class="aac-symbol-category">Family</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👧</div>
              <div class="aac-symbol-text">Sister</div>
              <div class="aac-symbol-category">Family</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👦</div>
              <div class="aac-symbol-text">Brother</div>
              <div class="aac-symbol-category">Family</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👴</div>
              <div class="aac-symbol-text">Grandpa</div>
              <div class="aac-symbol-category">Family</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👵</div>
              <div class="aac-symbol-text">Grandma</div>
              <div class="aac-symbol-category">Family</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👨‍🏫</div>
              <div class="aac-symbol-text">Teacher</div>
              <div class="aac-symbol-category">School</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👨‍⚕️</div>
              <div class="aac-symbol-text">Doctor</div>
              <div class="aac-symbol-category">People</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👮</div>
              <div class="aac-symbol-text">Police</div>
              <div class="aac-symbol-category">People</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">👫</div>
              <div class="aac-symbol-text">Friends</div>
              <div class="aac-symbol-category">Social</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-people">🙋</div>
              <div class="aac-symbol-text">Me</div>
              <div class="aac-symbol-category">Self</div>
            </div>
          </div>
        </div>
      </main>

      <div class="aac-quick-actions">
        <button class="aac-quick-btn" style="background: #28a745;" title="Yes">✓</button>
        <button class="aac-quick-btn" style="background: #dc3545;" title="No">✗</button>
        <button class="aac-quick-btn" style="background: #ffc107;" title="Help">?</button>
      </div>
    </div>
  `;

  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, peopleBoard);

  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'screenshots/aac-people-board-desktop.png',
    fullPage: true
  });

  // Create Actions & Verbs board
  console.log('🏃 Creating Actions & Verbs board...');

  const actionsBoard = `
    <div class="aac-app">
      <header class="aac-header">
        <div class="aac-logo">
          <div class="aac-logo-icon">LL</div>
          <div class="aac-logo-text">LingoLinq AAC</div>
        </div>
        <div class="aac-user-menu">
          <div class="aac-user-avatar">JS</div>
        </div>
      </header>

      <main class="aac-main">
        <aside class="aac-sidebar">
          <h3>Communication Boards</h3>
          <ul class="aac-board-list">
            <li class="aac-board-item">
              <div class="aac-board-icon category-food">🍎</div>
              <span>Food & Drinks</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-people">👥</div>
              <span>People & Family</span>
            </li>
            <li class="aac-board-item active">
              <div class="aac-board-icon category-actions">🏃</div>
              <span>Actions & Verbs</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-feelings">😊</div>
              <span>Feelings</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-places">🏠</div>
              <span>Places</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-objects">🎾</div>
              <span>Objects & Toys</span>
            </li>
          </ul>
        </aside>

        <div class="aac-content">
          <div class="aac-sentence-builder">
            <div class="aac-sentence-title">My Message</div>
            <div class="aac-sentence-display">
              <div class="aac-sentence-word">I</div>
              <div class="aac-sentence-word">want</div>
              <div class="aac-sentence-word">to</div>
              <div class="aac-sentence-word">play</div>
            </div>
            <div class="aac-sentence-controls">
              <button class="aac-btn aac-btn-primary">🔊 Speak</button>
              <button class="aac-btn aac-btn-secondary">Clear</button>
            </div>
          </div>

          <div class="aac-board-header">
            <div class="aac-board-title">Actions & Verbs</div>
            <div class="aac-board-description">Express what you want to do or what's happening</div>
          </div>

          <div class="aac-symbol-grid">
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🏃</div>
              <div class="aac-symbol-text">Run</div>
              <div class="aac-symbol-category">Movement</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🚶</div>
              <div class="aac-symbol-text">Walk</div>
              <div class="aac-symbol-category">Movement</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🤸</div>
              <div class="aac-symbol-text">Jump</div>
              <div class="aac-symbol-category">Movement</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🎮</div>
              <div class="aac-symbol-text">Play</div>
              <div class="aac-symbol-category">Activity</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🍽️</div>
              <div class="aac-symbol-text">Eat</div>
              <div class="aac-symbol-category">Daily</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🚿</div>
              <div class="aac-symbol-text">Wash</div>
              <div class="aac-symbol-category">Daily</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">😴</div>
              <div class="aac-symbol-text">Sleep</div>
              <div class="aac-symbol-category">Daily</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">📚</div>
              <div class="aac-symbol-text">Read</div>
              <div class="aac-symbol-category">Learning</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">✏️</div>
              <div class="aac-symbol-text">Write</div>
              <div class="aac-symbol-category">Learning</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🎵</div>
              <div class="aac-symbol-text">Sing</div>
              <div class="aac-symbol-category">Activity</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">🎨</div>
              <div class="aac-symbol-text">Draw</div>
              <div class="aac-symbol-category">Creative</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-actions">👀</div>
              <div class="aac-symbol-text">Watch</div>
              <div class="aac-symbol-category">Activity</div>
            </div>
          </div>
        </div>
      </main>

      <div class="aac-quick-actions">
        <button class="aac-quick-btn" style="background: #28a745;" title="Yes">✓</button>
        <button class="aac-quick-btn" style="background: #dc3545;" title="No">✗</button>
        <button class="aac-quick-btn" style="background: #ffc107;" title="Help">?</button>
      </div>
    </div>
  `;

  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, actionsBoard);

  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'screenshots/aac-actions-board-desktop.png',
    fullPage: true
  });

  // Create Feelings board
  console.log('😊 Creating Feelings board...');

  const feelingsBoard = `
    <div class="aac-app">
      <header class="aac-header">
        <div class="aac-logo">
          <div class="aac-logo-icon">LL</div>
          <div class="aac-logo-text">LingoLinq AAC</div>
        </div>
        <div class="aac-user-menu">
          <div class="aac-user-avatar">JS</div>
        </div>
      </header>

      <main class="aac-main">
        <aside class="aac-sidebar">
          <h3>Communication Boards</h3>
          <ul class="aac-board-list">
            <li class="aac-board-item">
              <div class="aac-board-icon category-food">🍎</div>
              <span>Food & Drinks</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-people">👥</div>
              <span>People & Family</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-actions">🏃</div>
              <span>Actions & Verbs</span>
            </li>
            <li class="aac-board-item active">
              <div class="aac-board-icon category-feelings">😊</div>
              <span>Feelings</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-places">🏠</div>
              <span>Places</span>
            </li>
            <li class="aac-board-item">
              <div class="aac-board-icon category-objects">🎾</div>
              <span>Objects & Toys</span>
            </li>
          </ul>
        </aside>

        <div class="aac-content">
          <div class="aac-sentence-builder">
            <div class="aac-sentence-title">My Message</div>
            <div class="aac-sentence-display">
              <div class="aac-sentence-word">I</div>
              <div class="aac-sentence-word">feel</div>
              <div class="aac-sentence-word">happy</div>
            </div>
            <div class="aac-sentence-controls">
              <button class="aac-btn aac-btn-primary">🔊 Speak</button>
              <button class="aac-btn aac-btn-secondary">Clear</button>
            </div>
          </div>

          <div class="aac-board-header">
            <div class="aac-board-title">Feelings & Emotions</div>
            <div class="aac-board-description">Share how you feel and express your emotions</div>
          </div>

          <div class="aac-symbol-grid">
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😊</div>
              <div class="aac-symbol-text">Happy</div>
              <div class="aac-symbol-category">Positive</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😢</div>
              <div class="aac-symbol-text">Sad</div>
              <div class="aac-symbol-category">Negative</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😠</div>
              <div class="aac-symbol-text">Angry</div>
              <div class="aac-symbol-category">Negative</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😨</div>
              <div class="aac-symbol-text">Scared</div>
              <div class="aac-symbol-category">Negative</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😴</div>
              <div class="aac-symbol-text">Tired</div>
              <div class="aac-symbol-category">Physical</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">🤗</div>
              <div class="aac-symbol-text">Excited</div>
              <div class="aac-symbol-category">Positive</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">🤒</div>
              <div class="aac-symbol-text">Sick</div>
              <div class="aac-symbol-category">Physical</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😌</div>
              <div class="aac-symbol-text">Calm</div>
              <div class="aac-symbol-category">Positive</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😕</div>
              <div class="aac-symbol-text">Worried</div>
              <div class="aac-symbol-category">Negative</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">🥰</div>
              <div class="aac-symbol-text">Love</div>
              <div class="aac-symbol-category">Positive</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">😤</div>
              <div class="aac-symbol-text">Frustrated</div>
              <div class="aac-symbol-category">Negative</div>
            </div>
            <div class="aac-symbol">
              <div class="aac-symbol-image category-feelings">🤔</div>
              <div class="aac-symbol-text">Confused</div>
              <div class="aac-symbol-category">Neutral</div>
            </div>
          </div>
        </div>
      </main>

      <div class="aac-quick-actions">
        <button class="aac-quick-btn" style="background: #28a745;" title="Yes">✓</button>
        <button class="aac-quick-btn" style="background: #dc3545;" title="No">✗</button>
        <button class="aac-quick-btn" style="background: #ffc107;" title="Help">?</button>
      </div>
    </div>
  `;

  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, feelingsBoard);

  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'screenshots/aac-feelings-board-desktop.png',
    fullPage: true
  });

  console.log('✅ AAC mockup screenshots completed!');
  console.log('📁 Screenshots saved in screenshots/ directory:');
  console.log('  - aac-food-board-desktop.png');
  console.log('  - aac-food-board-tablet.png');
  console.log('  - aac-food-board-mobile.png');
  console.log('  - aac-people-board-desktop.png');
  console.log('  - aac-actions-board-desktop.png');
  console.log('  - aac-feelings-board-desktop.png');

  await browser.close();
}

takeAAcMockupScreenshots().catch(console.error);