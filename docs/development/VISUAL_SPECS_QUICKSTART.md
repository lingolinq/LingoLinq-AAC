# LingoLinq AAC - Visual Specifications Quick Start

**Problem Solved:** You needed to see what your communication boards actually look like (with real OpenSymbols, Modified Fitzgerald Key colors, and accurate architecture) to plan modernization.

**Solution:** A complete screenshot generation system built from your actual codebase.

## 🚀 3-Step Usage

### Step 1: Generate HTML Boards
```bash
node tools/board-screenshot-generator.js
```

**Output:** `generated-boards/` directory with:
- `basic_home.html` - Simple 2×2 board
- `core_vocabulary.html` - 3×3 common words
- `categories_board.html` - 4×3 navigation board
- `color-reference.html` - Modified Fitzgerald Key reference
- `index.html` - Gallery of all boards

**Preview boards:**
```bash
# Open in browser
start generated-boards/index.html        # Windows
open generated-boards/index.html         # macOS
xdg-open generated-boards/index.html     # Linux
```

### Step 2: Capture Screenshots
```bash
# Install Playwright first (one-time)
npm install playwright

# Capture all boards at all viewports
node tools/capture-boards.js
```

**Output:** `.ai/visual-specs/screenshots/` directory with:
- `*_desktop.png` (1920×1080) - For design reference
- `*_tablet.png` (768×1024) - Tablet layouts
- `*_mobile.png` (375×667) - Mobile layouts
- `capture-report.md` - Summary with previews

### Step 3: Review Visual Specs
```bash
# Open the comprehensive architecture guide
start .ai/visual-specs/BOARD_ARCHITECTURE.md

# Or the modernization comparison guide
start .ai/visual-specs/MODERNIZATION_GUIDE.md
```

## 📋 What You Get

### ✅ Accurate Visual Representations
- **Real colors**: Modified Fitzgerald Key from `app/frontend/app/app.js:409-422`
- **Real symbols**: OpenSymbols.org images (mulberry, arasaac)
- **Real layout**: Grid system from `app/frontend/app/models/board.js`
- **Real styling**: Button styles from `app/assets/stylesheets/coughdrop.css.scss`

### ✅ Multiple Sample Boards

**Basic Home (2×2):**
- I (pronoun - yellow)
- want (verb - green)
- food (noun - orange)
- help (verb - green)

**Core Vocabulary (3×3):**
- I, you, go, want, more, help, like, not, stop

**Categories (4×3):**
- home, food, actions, describe
- you, questions, people, time
- places, clothing, school, games

### ✅ Comprehensive Documentation

**`.ai/visual-specs/BOARD_ARCHITECTURE.md`:**
- Grid layout system (data structures, algorithms)
- Modified Fitzgerald Key color system (all 12 colors)
- Button architecture (templates, styling, actions)
- OpenSymbols integration (libraries, loading)
- Responsive design (breakpoints, sizing)
- Modernization recommendations

**`.ai/visual-specs/MODERNIZATION_GUIDE.md`:**
- Current state analysis (strengths & weaknesses)
- Modern AAC design patterns (TouchChat, Proloquo2Go)
- Before/after comparisons (buttons, backgrounds, grids)
- Color system enhancements (dark mode, high contrast)
- Implementation roadmap (4 phases)
- Success metrics & testing

**`.ai/visual-specs/README.md`:**
- Complete usage instructions
- Troubleshooting guide
- Customization examples

## 🎯 Common Use Cases

### For Designers

**Create Modernization Mockups:**
1. Review current screenshots in `.ai/visual-specs/screenshots/`
2. Read modernization guide: `.ai/visual-specs/MODERNIZATION_GUIDE.md`
3. Use screenshots as "before" state
4. Create "after" mockups in Figma/Sketch
5. Save mockups to `.ai/visual-specs/modernization/`

**Get Color Palette:**
```bash
# View color reference
start generated-boards/color-reference.html

# Colors are in BOARD_ARCHITECTURE.md with hex codes
```

### For Developers

**Understand Current Architecture:**
```bash
# Read comprehensive architecture doc
start .ai/visual-specs/BOARD_ARCHITECTURE.md

# Key files referenced:
# - app/frontend/app/models/board.js (grid system)
# - app/frontend/app/utils/button.js (button logic)
# - app/frontend/app/app.js:407-422 (colors)
# - app/assets/stylesheets/coughdrop.css.scss (styling)
```

**Test Responsive Layouts:**
```bash
# Screenshots are at 3 sizes: desktop, tablet, mobile
# Compare layouts in .ai/visual-specs/screenshots/
```

**Validate OpenSymbols:**
```bash
# Check symbol availability
curl -I https://opensymbols.s3.amazonaws.com/libraries/arasaac/hello.png

# Should return: HTTP/1.1 200 OK
```

### For Product Managers

**Show Stakeholders Current State:**
```bash
# Generate fresh screenshots
node tools/board-screenshot-generator.js
node tools/capture-boards.js

# Share .ai/visual-specs/screenshots/ directory
# Or open generated-boards/index.html for interactive demo
```

**Plan Modernization Phases:**
```bash
# Review implementation roadmap
start .ai/visual-specs/MODERNIZATION_GUIDE.md

# 4 phases outlined:
# Phase 1: CSS-only improvements (4-8 hours)
# Phase 2: Background & layout (16-24 hours)
# Phase 3: Dark mode & themes (24-32 hours)
# Phase 4: Technical modernization (80-120 hours)
```

## 🎨 Customization

### Add Your Own Board

Edit `tools/board-screenshot-generator.js`:

```javascript
const SAMPLE_BOARDS = {
  my_board: {
    name: "My Custom Board",
    description: "Description here",
    grid: {
      rows: 2,
      columns: 2,
      order: [
        ['btn_1', 'btn_2'],
        ['btn_3', 'btn_4']
      ]
    },
    buttons: [
      {
        id: 'btn_1',
        label: 'hello',
        part_of_speech: 'social',  // Determines color
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
node tools/capture-boards.js my_board
```

### Export Real Board from Database

```bash
# Start Rails console
docker compose exec app rails console

# Export board JSON
board = Board.find_by(key: 'your-board-key')
puts JSON.pretty_generate({
  name: board.name,
  description: board.description,
  grid: board.settings['grid'],
  buttons: board.buttons.map { |b|
    {
      id: b['id'],
      label: b['label'],
      part_of_speech: b['part_of_speech'] || 'noun',
      image_url: (board.image_urls || {})[b['image_id']] || b['image']['url']
    }
  }
})

# Copy output and paste into SAMPLE_BOARDS in board-screenshot-generator.js
```

### Change Viewport Sizes

Edit `tools/capture-boards.js`:

```javascript
const CONFIG = {
  viewports: {
    desktop: { width: 1920, height: 1080 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 667 },
    // Add your custom size:
    custom: { width: 1440, height: 900 }
  }
};
```

## 🐛 Troubleshooting

### Images Don't Load

**Symptom:** Screenshots show buttons but no symbols.

**Solution:**
```bash
# Test OpenSymbols connectivity
curl -I https://opensymbols.s3.amazonaws.com/libraries/arasaac/hello.png

# Should return: HTTP/1.1 200 OK
# If not, check internet connection

# Alternatively, use different library:
# Change image_url in SAMPLE_BOARDS to use 'mulberry' instead of 'arasaac'
```

### Playwright Fails

**Symptom:** `Error: browserType.launch: Executable doesn't exist`

**Solution:**
```bash
# Install Playwright browsers
npx playwright install

# Or reinstall Playwright
npm install playwright
npx playwright install
```

### "Module not found" Errors

**Solution:**
```bash
# Install Node modules
npm install

# Specifically for Playwright
npm install playwright
```

### Screenshots Look Different in Browser

**Symptom:** Opening HTML directly shows different styling.

**Solution:**
```bash
# Hard refresh browser
# Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

# Or serve via HTTP
npm install -g http-server
cd generated-boards
http-server -p 8080
# Open http://localhost:8080
```

## 📊 File Locations

### Generated Files
```
generated-boards/              # HTML board files
├── basic_home.html
├── core_vocabulary.html
├── categories_board.html
├── color-reference.html
└── index.html

.ai/visual-specs/
├── screenshots/               # PNG screenshots
│   ├── basic_home_desktop.png
│   ├── basic_home_tablet.png
│   ├── basic_home_mobile.png
│   ├── ... (all boards × viewports)
│   └── capture-report.md
├── BOARD_ARCHITECTURE.md      # Technical architecture
├── MODERNIZATION_GUIDE.md     # Design comparisons
└── README.md                  # Usage guide
```

### Source Files
```
tools/
├── board-screenshot-generator.js  # HTML generator
├── capture-boards.js              # Screenshot capture
└── README.md                      # Tool documentation

app/frontend/app/
├── models/board.js                # Grid data structures
├── utils/button.js                # Button rendering
├── templates/button.hbs           # Button template
└── app.js:407-422                 # Fitzgerald colors

app/assets/stylesheets/
└── coughdrop.css.scss:1246-1650   # Button styles
```

## 🎓 Next Steps

### Phase 1: Review Current State (You Are Here)
- ✅ Generate boards and screenshots
- ✅ Review architecture documentation
- ✅ Understand Modified Fitzgerald Key system
- ✅ See OpenSymbols integration

### Phase 2: Design Modernization
1. Review `.ai/visual-specs/MODERNIZATION_GUIDE.md`
2. Create mockups in design tool (Figma, Sketch, etc.)
3. Share with stakeholders and AAC users
4. Gather feedback

### Phase 3: Implement Changes
1. Start with Phase 1 (CSS-only improvements)
2. Measure impact
3. Proceed to Phase 2 (layout updates)
4. Continue incrementally

### Phase 4: Test & Iterate
1. Visual regression testing (compare screenshots)
2. Accessibility testing (WCAG 2.1 AA)
3. User testing with AAC community
4. Iterate based on feedback

## 🔗 Key Resources

**Internal Documentation:**
- `.ai/visual-specs/BOARD_ARCHITECTURE.md` - Complete technical specs
- `.ai/visual-specs/MODERNIZATION_GUIDE.md` - Design comparisons
- `.ai/visual-specs/README.md` - Full usage guide
- `tools/README.md` - Tool documentation

**External Resources:**
- [OpenSymbols.org](https://www.opensymbols.org/) - Symbol library
- [Modified Fitzgerald Key](http://praacticalaac.org/strategy/communication-boards-colorful-considerations/) - Color system
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) - Accessibility guidelines
- [PrAACtical AAC](http://praacticalaac.org/) - AAC best practices

## 💡 Pro Tips

1. **Always regenerate before major design changes** to have a "before" baseline
2. **Capture at multiple viewports** to test responsive behavior
3. **Use color-reference.html** to ensure you maintain Fitzgerald Key compliance
4. **Share screenshots with AAC users** before implementing major changes
5. **Keep generated boards in version control** to track visual evolution

---

**Need Help?**
- Check `.ai/visual-specs/README.md` for detailed usage
- See `tools/README.md` for troubleshooting
- Review `BOARD_ARCHITECTURE.md` for technical details

**Created:** 2025-09-29
**Purpose:** Enable accurate visual specification and modernization planning for LingoLinq AAC