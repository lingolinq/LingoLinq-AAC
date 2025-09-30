# LingoLinq AAC - Board Architecture Visual Specifications

This document provides detailed specifications for the communication board architecture, extracted from the actual codebase to enable accurate modernization planning.

## Table of Contents
1. [Grid Layout System](#grid-layout-system)
2. [Modified Fitzgerald Key Color System](#modified-fitzgerald-key-color-system)
3. [Button Architecture](#button-architecture)
4. [OpenSymbols Integration](#opensymbols-integration)
5. [Responsive Design](#responsive-design)
6. [Modernization Recommendations](#modernization-recommendations)

---

## Grid Layout System

### Data Structure
Communication boards use a 2D grid system defined in the board model:

```javascript
// From app/frontend/app/models/board.js:104-123
{
  grid: {
    rows: 3,        // Number of rows
    columns: 4,     // Number of columns
    order: [        // 2D array mapping positions to button IDs
      ['btn_1', 'btn_2', 'btn_3', 'btn_4'],
      ['btn_5', 'btn_6', 'btn_7', 'btn_8'],
      ['btn_9', 'btn_10', 'btn_11', 'btn_12']
    ]
  },
  buttons: [
    { id: 'btn_1', label: 'I', image_id: '123', ... },
    // ... more buttons
  ]
}
```

### Layout Algorithm
```javascript
// Grid iteration from app/frontend/app/models/board.js:109-111
for(var idx = 0; idx < grid.order[0].length; idx++) {      // columns
  for(var jdx = 0; jdx < grid.order.length; jdx++) {       // rows
    var id = grid.order[jdx][idx];                          // button ID
    // Position button at grid[row][col]
  }
}
```

### Common Grid Sizes
- **2x2**: Basic communication (4 buttons)
- **3x3**: Core vocabulary (9 buttons)
- **4x3**: Category navigation (12 buttons)
- **4x4**: Standard boards (16 buttons)
- **6x4**: Advanced boards (24 buttons)
- **8x6**: Complex vocabularies (48 buttons)

### CSS Positioning
```scss
// From app/assets/stylesheets/coughdrop.css.scss:1246-1276
.button {
  position: absolute;          // Absolute positioning within board
  border: 1px solid #ccc;      // Default border
  border-radius: 3px;          // Rounded corners
  cursor: pointer;             // Interactive cursor
  overflow: hidden;            // Clip content
  text-align: center;          // Center text
  padding: 0px;               // No default padding
}
```

**Dynamic Sizing:**
```javascript
// Button dimensions calculated based on viewport and grid size
buttonWidth = (boardWidth - padding * 2 - spacing * (columns - 1)) / columns
buttonHeight = (boardHeight - padding * 2 - spacing * (rows - 1)) / rows
```

---

## Modified Fitzgerald Key Color System

The app uses the Modified Fitzgerald Key, a standard color-coding system for AAC that helps users identify parts of speech visually.

### Color Mappings

From `app/frontend/app/app.js:407-422`:

| Color | Fill | Border | Usage | Part of Speech |
|-------|------|--------|-------|----------------|
| **White** | `#fff` | `#ccc` | Conjunctions, numbers | `conjunction`, `number` |
| **Yellow** | `#ffa` | `#dd0` | People/pronouns | `pronoun` |
| **Green** | `#cfa` | `#6d0` | Actions/verbs | `verb` |
| **Orange** | `#fca` | `#fca` | Nouns | `noun`, `nominative` |
| **Blue** | `#acf` | `#acf` | Describing/adjectives | `adjective` |
| **Purple** | `#caf` | `#caf` | Questions | `question` |
| **Red** | `#faa` | `#faa` | Negations | `negation`, `expletive`, `interjection` |
| **Pink** | `#fac` | `#fac` | Social words | `preposition`, `social` |
| **Brown** | `#ca8` | `#ca8` | Adverbs | `adverb` |
| **Gray** | `#ccc` | `#ccc` | Determiners | `article`, `determiner` |
| **Bluish** | `rgb(115,204,255)` | - | Other | (none) |
| **Black** | `#000` | `#000` | Contrast | (none) |

### Color Application Logic

```javascript
// From app/frontend/app/utils/button.js
function getButtonColor(partOfSpeech) {
  const colorMap = FITZGERALD_COLORS.find(c =>
    c.types.includes(partOfSpeech)
  );
  return colorMap || { fill: '#fff', border: '#ccc' }; // Default white
}
```

### References
- [PrAACtical AAC: Communication Boards - Colorful Considerations](http://praacticalaac.org/strategy/communication-boards-colorful-considerations/)
- [Talk Sense: CBB 8 Colour](http://talksense.weebly.com/cbb-8-colour.html)

---

## Button Architecture

### Template Structure
From `app/frontend/app/templates/button.hbs`:

```handlebars
<a href='#' style={{button.computed_style}} class={{button.computed_class}} data-id={{button.id}}>
  <!-- Pending state spinner -->
  {{#if button.pending}}
    <div class="pending">
      <img src={{path 'images/spinner.gif'}} />
    </div>
  {{/if}}

  <!-- Action indicator (folder, link, etc) -->
  <div class={{button.action_class}}>
    <span class="action">
      <img src={{button.action_image}} alt={{button.action_alt}} />
    </span>
  </div>

  <!-- Symbol image -->
  <span class='img_holder' style={{button.image_holder_style}}>
    {{#unless app_state.currentUser.hide_symbols}}
      <img src={{button.local_image_url}}
           rel={{button.original_image_url}}
           onerror="button_broken_image(this);"
           style={{button.image_style}}
           class={{if button.hc_image 'symbol hc' 'symbol'}}>
    {{/unless}}
  </span>

  <!-- Button label -->
  <div class={{button_symbol_class}}>
    <span class="button-label">{{button.label}}</span>
  </div>
</a>
```

### Button Data Model
```javascript
{
  id: 'btn_1',                    // Unique identifier
  label: 'food',                  // Display text
  vocalization: 'food',           // Speech output
  part_of_speech: 'noun',         // For color coding
  image_id: '12345',              // Reference to image record
  image_url: 'https://...',       // Symbol URL
  sound_id: '67890',              // Optional sound
  background_color: '#fca',       // Override color
  border_color: '#fca',           // Override border
  load_board: { key: 'food' },    // Navigation action
  url: 'https://...',             // Link action
  hidden: false,                  // Visibility
  level_modifications: {}         // Progressive disclosure
}
```

### Styling

**Image Sizing:**
```javascript
// From app/frontend/app/utils/button.js:379-397
image_holder_style: computed(
  'positioning.image_height',
  'positioning.image_top_margin',
  function() {
    // Images take ~65% of button height
    height: ${buttonHeight * 0.65}px;
    max-width: 90%;
    object-fit: contain;
  }
)
```

**Label Styling:**
```scss
.button-label {
  font-size: calc(buttonHeight * 0.15); // ~15% of button height
  font-weight: bold;
  color: #000;
  text-shadow: 1px 1px 0 rgba(255,255,255,0.3);
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### Action Types
Buttons can perform different actions indicated by icons:

1. **Talk** (default): Speak the label/vocalization
2. **Folder**: Navigate to another board (`load_board.key`)
3. **Link**: Open external URL
4. **App**: Launch app integration
5. **Integration**: Webhook or embedded integration
6. **Video**: Play YouTube video
7. **Book**: Display Tar Heel Reader book

**Action Icons:**
From `app/frontend/app/utils/button.js:97-109`:
```javascript
// Colored corner indicators in edit mode
// Folder icon in top-right corner for navigation buttons
```

---

## OpenSymbols Integration

### Image Sources
The app uses OpenSymbols.org, an open-source AAC symbol library:

**Base URL Pattern:**
```
https://opensymbols.s3.amazonaws.com/libraries/{library}/{symbol}
```

**Available Libraries:**
- `mulberry` - High-quality SVG symbols (preferred)
- `arasaac` - PNG symbols with transparent backgrounds
- `noun-project` - Simple icon-style symbols
- `symbolstix` - Professional symbol set
- `pcs` - Picture Communication Symbols (licensed)
- `pcs_hc` - High contrast PCS
- `lessonpix` - Educational symbols (licensed)

### Example Image URLs
From `app/frontend/app/app.js:464-489`:

```javascript
const symbolExamples = [
  { label: 'house', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/house.svg' },
  { label: 'food', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/food.svg' },
  { label: 'happy', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/happy.png' },
  { label: 'want', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/want.png' },
  // ... more examples
];
```

### Image Loading
From `app/frontend/app/utils/button.js:437-503`:

```javascript
// Priority order for image sources:
1. Local cached data URL (persistence.url_cache)
2. Board's bundled image_urls map
3. Image record from store (LingoLinqAAC.store)
4. Fallback: https://opensymbols.s3.amazonaws.com/libraries/arasaac/board_3.png
```

### High Contrast Mode
From `app/frontend/app/models/board.js:66`:

```javascript
hc_image_ids: DS.attr('raw'),  // Map of high-contrast image variants

// CSS filter applied to non-HC images in HC mode
filter: contrast(4.0) saturate(500);  // app/assets/stylesheets/coughdrop.css.scss:749
```

---

## Responsive Design

### Viewport Breakpoints

From `app/assets/stylesheets/header_sizing.scss`:

```scss
// Small devices (landscape phones, less than 768px)
@media (max-width: 767px) {
  .button { /* smaller sizing */ }
}

// Medium devices (tablets, 768px and up)
@media (min-width: 768px) {
  .button { /* standard sizing */ }
}

// Large devices (desktops, 992px and up)
@media (min-width: 992px) {
  .button { /* larger sizing */ }
}

// Extra large devices (large desktops, 1200px and up)
@media (min-width: 1200px) {
  .button { /* maximum sizing */ }
}
```

### Button Sizing Options

From board preferences:

- **Text Size:**
  - `text_small` - Compact labels
  - `text_medium` - Default
  - `text_large` - Enhanced readability
  - `text_huge` - Maximum accessibility

- **Border Width:**
  - `border_none` - No borders (seamless grid)
  - `border_small` - 1px borders
  - `border_medium` - 2px borders (default)
  - `border_large` - 4px borders
  - `border_huge` - 8px borders (high visibility)

### Board Background
From `app/assets/stylesheets/coughdrop.css.scss:43-96`:

```scss
#board_bg {
  background: rgb(125, 125, 125);  // Gray background
  box-shadow: 5px 5px 10px rgb(125, 125, 125);
  display: flex;
  flex-direction: column;
}
```

---

## Modernization Recommendations

Based on the current architecture, here are key areas for modernization:

### 1. **Visual Design Updates**

**Current Issues:**
- Gray background (`rgb(125,125,125)`) feels dated
- Button borders use simple solid colors
- No elevation/depth cues beyond basic shadows
- Limited animation/interaction feedback

**Recommendations:**
- ✨ Modern white or gradient backgrounds
- 🎨 Material Design-style elevation/shadows
- 🌊 Smooth transition animations (CSS transitions)
- 💫 Ripple effects on button press
- 🎯 Focus indicators for accessibility

### 2. **Grid System Improvements**

**Current Limitations:**
- Fixed grid sizes (must be defined upfront)
- Absolute positioning can cause overlap issues
- Limited flexibility for mixed button sizes

**Recommendations:**
- 📐 CSS Grid or Flexbox for responsive layouts
- 🔄 Dynamic grid that adapts to content
- 📱 Progressive enhancement for different screen sizes
- 🎨 Support for button spanning (2x1, 1x2, etc.)

### 3. **Symbol Library Modernization**

**Current System:**
- Mix of PNG and SVG formats
- External CDN dependencies (S3)
- Limited offline support

**Recommendations:**
- 🖼️ Standardize on SVG for scalability
- 💾 Local caching strategy with service workers
- 🎨 Dynamic color theming for symbols
- ♿ Enhanced alt text for screen readers

### 4. **Color System Evolution**

**Keep:**
- ✅ Modified Fitzgerald Key (industry standard)
- ✅ Part-of-speech color coding
- ✅ Customizable color overrides

**Enhance:**
- 🎨 WCAG 2.1 AA contrast compliance check
- 🌈 Optional alternative color schemes (dark mode, colorblind-friendly)
- 💡 Visual indicators beyond color alone
- 📊 Color palette customization per user

### 5. **Button Interaction Updates**

**Current:**
- Basic hover states
- Click-to-speak
- Dwell timer support

**Modern Alternatives:**
- 🎯 Multi-touch gestures
- 🖱️ Long-press for context menu
- 👆 Swipe actions for quick navigation
- ⌨️ Keyboard navigation improvements
- 🎤 Voice control integration

### 6. **Performance Optimizations**

**Current Approach:**
- Full board re-render on changes
- Eager image loading
- DOM manipulation via jQuery

**Modern Stack:**
- ⚡ Virtual DOM with React/Vue/Svelte
- 🚀 Lazy loading for images
- 📦 Code splitting for faster load times
- 💨 Web Workers for heavy computation
- 🎯 Progressive Web App (PWA) capabilities

### 7. **Accessibility Enhancements**

**Current Support:**
- Basic ARIA labels
- Screen reader compatibility
- High contrast mode

**Improvements Needed:**
- ♿ ARIA live regions for dynamic content
- 🎯 Focus management in modals/navigation
- ⌨️ Full keyboard navigation support
- 🔊 Comprehensive audio descriptions
- 📏 Scalable text without layout breaking
- 🎨 Color contrast validation tools

---

## Implementation Priority

### Phase 1: Foundation (MVP)
1. ✅ Document current architecture (this file)
2. ✅ Generate accurate screenshots
3. 🎨 Create modernized design mockups
4. 📋 User testing with sample designs

### Phase 2: Visual Updates (Low Risk)
1. 🎨 Update color palette (maintain Fitzgerald Key)
2. 🖼️ Improve button styling (shadows, borders, radius)
3. 🌊 Add smooth transitions
4. 📱 Responsive grid improvements

### Phase 3: Technical Modernization (Medium Risk)
1. ⚡ Migrate to modern framework (React/Vue)
2. 🚀 Implement lazy loading
3. 💾 Enhanced caching strategy
4. 🎯 PWA capabilities

### Phase 4: Feature Enhancements (Higher Risk)
1. 🎨 Alternative themes (dark mode, etc.)
2. 🎯 Gesture support
3. 🖱️ Advanced interactions
4. 🎤 Voice control

---

## Related Files

**Key Source Files:**
- `app/frontend/app/models/board.js` - Board data model
- `app/frontend/app/utils/button.js` - Button logic and rendering
- `app/frontend/app/templates/button.hbs` - Button template
- `app/frontend/app/app.js:407-422` - Fitzgerald Key colors
- `app/assets/stylesheets/coughdrop.css.scss` - Main styles

**Generated Resources:**
- `tools/board-screenshot-generator.js` - HTML generator
- `tools/capture-boards.js` - Screenshot capture
- `.ai/visual-specs/screenshots/` - Visual references

---

## Version History

- **v1.0** (2025-09-29): Initial documentation from codebase analysis
  - Grid layout system documented
  - Modified Fitzgerald Key color mappings
  - OpenSymbols integration details
  - Modernization recommendations

---

*This document is auto-generated from the LingoLinq AAC codebase architecture. Last updated: 2025-09-29*