# LingoLinq AAC - Visual Specifications

This directory contains visual specifications, architecture documentation, and design assets for LingoLinq AAC communication boards.

## 📁 Directory Structure

```
.ai/visual-specs/
├── README.md                      # This file
├── BOARD_ARCHITECTURE.md          # Detailed technical architecture
├── screenshots/                   # Generated board screenshots
│   ├── basic_home_desktop.png
│   ├── basic_home_tablet.png
│   ├── basic_home_mobile.png
│   ├── core_vocabulary_*.png
│   ├── categories_board_*.png
│   ├── color-reference.png
│   └── capture-report.md
└── modernization/                 # Future modernization mockups
    └── (to be created)
```

## 🚀 Quick Start

### Generate Board HTML Files

```bash
# Generate sample communication boards as HTML
node tools/board-screenshot-generator.js

# Output: generated-boards/*.html
# - basic_home.html
# - core_vocabulary.html
# - categories_board.html
# - color-reference.html
# - index.html (gallery)
```

### Capture Screenshots

```bash
# First, ensure Playwright is installed
npm install playwright

# Capture all boards at all viewport sizes
node tools/capture-boards.js

# Capture specific boards only
node tools/capture-boards.js basic_home core_vocabulary

# Output: .ai/visual-specs/screenshots/*.png
```

### View Generated Boards

```bash
# Open in browser (from project root)
start generated-boards/index.html        # Windows
open generated-boards/index.html         # macOS
xdg-open generated-boards/index.html     # Linux
```

## 📋 What's Included

### 1. Board Architecture Documentation

**File:** `BOARD_ARCHITECTURE.md`

Comprehensive technical documentation extracted from the codebase:
- Grid layout system and data structures
- Modified Fitzgerald Key color system
- Button rendering architecture
- OpenSymbols.org integration
- Responsive design specifications
- Modernization recommendations

### 2. Screenshot Capture System

**Tools:**
- `tools/board-screenshot-generator.js` - HTML generator from codebase
- `tools/capture-boards.js` - Playwright screenshot capture

**Features:**
- ✅ Uses actual Modified Fitzgerald Key colors from `app.js`
- ✅ Fetches real OpenSymbols.org images
- ✅ Accurate button styling from `coughdrop.css.scss`
- ✅ Grid layouts matching board model structure
- ✅ Multiple viewport sizes (desktop, tablet, mobile)
- ✅ Waits for all images to load before capture

### 3. Sample Communication Boards

Three representative board types:

#### Basic Home Board (2x2)
Simple 4-button layout for core communication:
- "I" (pronoun - yellow)
- "want" (verb - green)
- "food" (noun - orange)
- "help" (verb - green)

#### Core Vocabulary Board (3x3)
Common high-frequency words:
- Pronouns: I, you
- Verbs: go, want, help, like, stop
- Adjectives: more
- Negations: not

#### Category Navigation Board (4x3)
Main category selection for app navigation:
- home, food, actions, describe
- you, questions, people, time
- places, clothing, school, games

### 4. Color Reference

**File:** `generated-boards/color-reference.html`

Interactive reference for the Modified Fitzgerald Key showing:
- All 12 color categories
- Part of speech mappings
- Hex color codes
- Visual swatches

## 🎨 Modified Fitzgerald Key Colors

Quick reference of the color system used in LingoLinq AAC:

| Color | Parts of Speech | Hex |
|-------|----------------|-----|
| 🤍 White | Conjunctions, numbers | `#fff` |
| 💛 Yellow | Pronouns (people) | `#ffa` |
| 💚 Green | Verbs (actions) | `#cfa` |
| 🧡 Orange | Nouns | `#fca` |
| 💙 Blue | Adjectives (describing) | `#acf` |
| 💜 Purple | Questions | `#caf` |
| ❤️ Red | Negations | `#faa` |
| 🩷 Pink | Social words | `#fac` |
| 🤎 Brown | Adverbs | `#ca8` |
| 🩶 Gray | Determiners | `#ccc` |

## 📊 Screenshot Specifications

All screenshots are captured at these viewport sizes:

| Viewport | Dimensions | Use Case |
|----------|-----------|----------|
| Desktop | 1920×1080 | Primary development/design reference |
| Tablet | 768×1024 | iPad and Android tablets |
| Mobile | 375×667 | iPhone and smaller Android phones |

## 🔧 How It Works

### Board Generation Process

1. **Architecture Analysis** (`board-screenshot-generator.js`)
   - Reads Modified Fitzgerald Key colors from `app/frontend/app/app.js`
   - Applies button styling from `app/assets/stylesheets/coughdrop.css.scss`
   - Uses grid layout logic from `app/frontend/app/models/board.js`
   - Fetches real symbols from `opensymbols.s3.amazonaws.com`

2. **HTML Generation**
   - Creates standalone HTML files with embedded CSS
   - Each button uses actual color mappings based on part of speech
   - Images load from OpenSymbols.org CDN
   - Includes loading indicators for image readiness

3. **Screenshot Capture** (`capture-boards.js`)
   - Launches headless Chromium browser
   - Loads generated HTML files
   - Waits for all images to load completely
   - Captures at multiple viewport sizes
   - Generates markdown report with results

## 📝 Usage Examples

### Generate Custom Board

Edit `tools/board-screenshot-generator.js` to add your own board:

```javascript
const SAMPLE_BOARDS = {
  my_custom_board: {
    name: "My Custom Board",
    description: "Custom board description",
    grid: {
      rows: 2,
      columns: 3,
      order: [
        ['btn_1', 'btn_2', 'btn_3'],
        ['btn_4', 'btn_5', 'btn_6']
      ]
    },
    buttons: [
      {
        id: 'btn_1',
        label: 'hello',
        part_of_speech: 'social',  // Pink color
        image_url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/hello.png'
      },
      // ... more buttons
    ]
  }
};
```

Then regenerate:
```bash
node tools/board-screenshot-generator.js
node tools/capture-boards.js my_custom_board
```

### Extract Actual Board Data

To generate boards from real database data:

```bash
# Export board data from Rails console
docker compose exec app rails console

# In Rails console:
board = Board.find_by(key: 'example-board')
File.write('/app/board-export.json', {
  name: board.name,
  grid: board.settings['grid'],
  buttons: board.buttons
}.to_json)

# Then use the exported JSON in board-screenshot-generator.js
```

## 🎯 Next Steps

### For Designers
1. Review `BOARD_ARCHITECTURE.md` for current visual system
2. Check screenshots in `screenshots/` directory
3. Create modernization mockups in `modernization/` directory
4. Use `color-reference.html` as baseline for color updates

### For Developers
1. Use screenshots as "before" state for comparison
2. Reference `BOARD_ARCHITECTURE.md` for implementation details
3. Test responsive behavior across viewport sizes
4. Validate color contrast and accessibility

### For Product Managers
1. Review board examples with stakeholders
2. Identify high-priority visual improvements
3. Compare with modern AAC app competitors
4. Plan incremental modernization phases

## 🔗 Related Documentation

- `CLAUDE.md` - Project overview and development context
- `docs/architecture/UX-UI-Modernization-Plan.md` - UX/UI roadmap
- `app/frontend/app/app.js` - Color system source code
- `app/frontend/app/models/board.js` - Board data model
- `app/frontend/app/utils/button.js` - Button rendering logic

## 🐛 Troubleshooting

### Screenshots Missing Images

**Problem:** Generated screenshots don't show OpenSymbols images.

**Solutions:**
1. Check internet connection (images load from CDN)
2. Verify Playwright browser has network access
3. Check console output for 404 errors on specific symbols
4. Try using different symbol library (mulberry, arasaac)

### HTML Files Look Different from Screenshots

**Problem:** Opening HTML in browser looks different than screenshots.

**Cause:** Browser caching or missing images.

**Solutions:**
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Check browser console for errors

### Generator Script Fails

**Problem:** `board-screenshot-generator.js` throws errors.

**Solutions:**
1. Ensure Node.js is installed: `node --version`
2. Run from project root directory
3. Check output directory permissions
4. Verify JSON syntax if using custom boards

## 📄 License

These visual specifications are part of LingoLinq AAC and follow the same license as the main project.

---

**Generated:** 2025-09-29
**Maintained by:** LingoLinq Development Team
**Last Updated:** See git commit history