# 📸 LingoLinq-AAC Playwright Screenshot Automation

This document describes the automated screenshot solution implemented for capturing LingoLinq-AAC application visuals for designers.

## 🎯 Purpose

Since the Rails application has persistent compatibility issues preventing reliable manual screenshots, we've implemented an automated Playwright solution that can capture application screenshots regardless of CSS/JavaScript loading issues.

## 🚀 Quick Start

### Prerequisites
- Node.js (version 18+ recommended)
- Docker application running with `docker-compose up`

### Taking Screenshots

```bash
# Method 1: Using npm script (recommended)
npm run screenshots

# Method 2: Direct Node execution
node take-screenshots.js

# Method 3: Using Playwright test framework
npx playwright test tests/screenshot.spec.js
```

## 📁 Generated Screenshots

Screenshots are saved to the `screenshots/` directory:

### Core Pages
- `homepage-full.png` - Full page homepage
- `homepage-viewport.png` - Viewport-sized homepage
- `login-page.png` - Login page
- `signup-page.png` - Registration page
- `about-page.png` - About page
- `help-page.png` - Help documentation
- `boards-page.png` - AAC boards interface

### Responsive Designs
- `homepage-mobile.png` - Mobile viewport (375x667)
- `homepage-tablet.png` - Tablet viewport (768x1024)
- `homepage-desktop-large.png` - Large desktop (1920x1080)

### UI Components
- `footer.png` - Footer component
- `navigation.png` - Navigation menu (if found)
- `header.png` - Header component (if found)
- `main-content.png` - Main content area (if found)
- `form.png` - Form elements (if found)
- `aac-elements.png` - AAC-specific components (if found)

## 🛠 How It Works

The Playwright automation:

1. **Launches Browser**: Uses Chromium engine for consistent rendering
2. **Navigates to Application**: Connects to http://localhost:3000
3. **Waits for Loading**: Gives the application time to load (ignores JS errors)
4. **Captures Screenshots**: Takes full-page and component-specific screenshots
5. **Tests Multiple Pages**: Attempts to navigate to common application routes
6. **Responsive Testing**: Captures screenshots at different viewport sizes
7. **Component Isolation**: Screenshots individual UI components when found

## ⚙️ Configuration

### Script Configuration (`take-screenshots.js`)

```javascript
// Browser settings
headless: false,          // Set to true for headless mode
timeout: 60000,           // Browser timeout
viewport: { width: 1280, height: 720 }  // Default viewport

// Application settings
baseURL: 'http://localhost:3000'
waitTime: 3000            // Time to wait for page load
```

### Playwright Test Configuration (`playwright.config.js`)

```javascript
// Test framework settings
baseURL: 'http://localhost:3000',
reporter: 'html',
retries: 2,
workers: 1
```

## 🔧 Customization

### Adding New Pages to Screenshot

Edit `take-screenshots.js` and add to the `pages` array:

```javascript
const pages = ['/login', '/signup', '/about', '/help', '/boards', '/new-page'];
```

### Adding New Components to Screenshot

Edit the `components` array:

```javascript
const components = [
  { selector: '.your-selector', name: 'your-component-name' },
  // ... existing components
];
```

### Changing Screenshot Settings

Modify screenshot options:

```javascript
await page.screenshot({
  path: 'screenshots/your-screenshot.png',
  fullPage: true,           // Capture full page
  quality: 90,              // JPEG quality (if using JPEG)
  type: 'png',              // png or jpeg
  clip: { x: 0, y: 0, width: 800, height: 600 }  // Crop area
});
```

## 📱 Responsive Screenshot Testing

The script automatically captures screenshots at multiple viewport sizes:

- **Mobile**: 375x667 (iPhone SE size)
- **Tablet**: 768x1024 (iPad size)
- **Desktop**: 1920x1080 (Large desktop)

## 🎨 For Designers

### Screenshot Usage Tips

1. **Full Page Screenshots**: Show complete page layout and flow
2. **Component Screenshots**: Isolated UI elements for detailed design work
3. **Responsive Screenshots**: How the application adapts to different screen sizes
4. **Cross-Page Comparison**: Consistency across different application sections

### What Screenshots Capture

- ✅ **HTML Structure**: All rendered HTML elements
- ✅ **CSS Styling**: Applied styles (even if some assets fail to load)
- ✅ **Layout**: Page structure and component positioning
- ✅ **Responsive Design**: How elements adapt to different viewports
- ❌ **Dynamic Interactions**: Screenshots are static captures
- ❌ **JavaScript Animations**: Only captures final rendered state

## 🚦 Troubleshooting

### Common Issues

**Screenshot script fails to connect:**
```bash
# Ensure Docker application is running
docker-compose up

# Check if application is accessible
curl http://localhost:3000
```

**Browser won't launch:**
```bash
# Reinstall Playwright browsers
npx playwright install
```

**Empty screenshots:**
```bash
# Try headed mode to see what's happening
# Edit take-screenshots.js and set: headless: false
```

**Missing components in screenshots:**
- The script uses CSS selectors to find components
- If components aren't found, they're skipped (not an error)
- Check the console output for "Found X elements" messages

## 🔄 Integration with Development Workflow

### Automated Screenshot Generation

You can integrate screenshot generation into your development workflow:

```bash
# After making UI changes
docker-compose up -d
npm run screenshots

# Review screenshots in screenshots/ directory
# Share with designers via your preferred method
```

### Continuous Screenshot Testing

Create a simple script to regularly capture screenshots:

```bash
#!/bin/bash
# capture-daily-screenshots.sh
cd /path/to/lingolinq-aac
docker-compose up -d
sleep 30  # Wait for application to start
npm run screenshots
```

## 📊 Technical Benefits

1. **Reliability**: Works even when CSS/JS assets fail to load
2. **Automation**: No manual browser interaction required
3. **Consistency**: Same rendering engine every time
4. **Comprehensive**: Captures multiple pages and viewports automatically
5. **Fast**: Complete screenshot suite in under 1 minute
6. **Isolated**: Doesn't depend on fixing underlying Rails issues

## 🎯 Next Steps

This Playwright solution provides immediate screenshot capability while the underlying Rails asset issues are resolved. Consider these enhancements:

1. **Screenshot Comparison**: Implement visual regression testing
2. **Automated Upload**: Send screenshots directly to design tools
3. **Scheduled Captures**: Set up automatic screenshot generation
4. **Interactive Testing**: Add user interaction scenarios
5. **Performance Metrics**: Capture page load timing data

## 🤝 Working with Designers

### Sharing Screenshots

1. **Direct File Sharing**: Screenshots saved to `screenshots/` directory
2. **Cloud Storage**: Upload to Google Drive, Dropbox, etc.
3. **Design Tools**: Import into Figma, Sketch, Adobe XD
4. **Version Control**: Commit screenshots to track UI changes over time

The screenshots provide designers with accurate visual representation of the current application state, enabling design iteration without requiring a fully functional development environment.