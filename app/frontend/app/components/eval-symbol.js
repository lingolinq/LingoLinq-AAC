import Component from '@ember/component';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';

/*
 * eval-symbol — renders a symbol image for an eval-item option.
 * Two-tier rendering:
 *   1. Mulberry-backed slugs (MULBERRY_SLUGS) — render an <img>
 *      pointing at a real Mulberry Symbol Set SVG bundled at
 *      /symbols/eval/{slug}.svg. Mulberry is the SLP-recognized
 *      AAC symbol library (CC BY-SA 4.0, mulberrysymbols.org).
 *   2. Custom-SVG slugs (SLUG_TO_SVG) — for words Mulberry doesn't
 *      cover, we hand-draw a sophisticated inline SVG. These use
 *      multiple paths, color blocking, and recognizable proportions
 *      so they read at small sizes.
 *
 * Mulberry attribution lives in docs/SYMBOLS.md and is also surfaced
 * in the eval report PDF footer.
 *
 * Public attrs:
 *   slug — string key
 *   size — pixel size (default 80)
 */

const OUT = '#46505F';
const ACC = '#2A9D8F';
const RED = '#E87A6F';
const GRN = '#7AB892';
const YEL = '#F0C75A';
const BLU = '#7AAED9';
const BRN = '#8B6F47';
const PNK = '#E89BA6';
const SKN = '#F2D1B0';

// Slugs that resolve to a custom PNG at /images/eval-{slug}.png.
// These take precedence over Mulberry and inline-SVG renderers —
// used when we have a designed PNG asset that we want to ship as
// the canonical symbol for a word.
const PNG_SLUGS = new Set(['apple', 'cup', 'hat', 'ball', 'shoe', 'juice', 'book', 'truck', 'dog', 'cat', 'eat', 'cookie', 'bread', 'plate', 'sock', 'phone', 'pencil']);

// Slugs that resolve to a Mulberry SVG bundled at /symbols/eval/{slug}.svg.
// See public/symbols/eval/ for the actual files.
const MULBERRY_SLUGS = new Set([
  'bread', 'pasta', 'food', 'plate', 'spoon', 'fork', 'drink',
  'juice', 'dog', 'cat', 'ball', 'car', 'truck', 'phone',
  'pencil', 'hat', 'shoe', 'toy', 'hammer', 'razor', 'snow', 'more',
  'help', 'eat', 'play', 'sleep', 'walk', 'run', 'happy', 'sad',
  'hungry', 'morning', 'family', 'doctor', 'i', 'cloud', 'sun',
  'leaf', 'week'
]);

// Sophisticated custom SVGs for words Mulberry doesn't cover (or
// covers poorly). Each is built from ~10-25 path elements with
// proper color blocking + outline so the symbol is recognizable at
// 64-90px tile sizes.
const SLUG_TO_SVG = {
  // ── animals (mascot-style heads with distinct features) ─────────
  animal: `
    <ellipse cx="12" cy="14" rx="7" ry="6" fill="${BRN}" fill-opacity="0.5" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M6 11l1-4 3 2M18 11l-1-4-3 2" fill="${BRN}" fill-opacity="0.65" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="9.5" cy="13" r="1.1" fill="${OUT}"/>
    <circle cx="14.5" cy="13" r="1.1" fill="${OUT}"/>
    <circle cx="9.5" cy="12.7" r="0.35" fill="#FFF"/>
    <circle cx="14.5" cy="12.7" r="0.35" fill="#FFF"/>
    <path d="M11 16q1 1 2 0" stroke="${OUT}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <ellipse cx="12" cy="15.5" rx="1.3" ry="0.9" fill="${OUT}"/>
  `,
  pet: `
    <ellipse cx="12" cy="15" rx="6" ry="5" fill="${BRN}" fill-opacity="0.55" stroke="${OUT}" stroke-width="1.4"/>
    <ellipse cx="7" cy="10" rx="2" ry="2.5" fill="${BRN}" fill-opacity="0.7" stroke="${OUT}" stroke-width="1.3" transform="rotate(-25 7 10)"/>
    <ellipse cx="17" cy="10" rx="2" ry="2.5" fill="${BRN}" fill-opacity="0.7" stroke="${OUT}" stroke-width="1.3" transform="rotate(25 17 10)"/>
    <circle cx="10" cy="14" r="1" fill="${OUT}"/>
    <circle cx="14" cy="14" r="1" fill="${OUT}"/>
    <path d="M11 17q1 1 2 0" stroke="${OUT}" stroke-width="1.3" fill="none"/>
    <ellipse cx="12" cy="16.2" rx="1" ry="0.7" fill="${OUT}"/>
    <path d="M12 3v3" stroke="${RED}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M10 5h4" stroke="${RED}" stroke-width="1.4" stroke-linecap="round"/>
  `,
  // ── objects ──────────────────────────────────────────────────────
  book: `
    <path d="M3 5l5 1c1.5 0.3 3 0.8 4 1.5v12c-1-0.7-2.5-1.2-4-1.5l-5-1z" fill="#F4E4BC" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M21 5l-5 1c-1.5 0.3-3 0.8-4 1.5v12c1-0.7 2.5-1.2 4-1.5l5-1z" fill="#FFFFFF" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 7.5v12" stroke="${OUT}" stroke-width="1.2"/>
    <path d="M5 9l4 0.8M5 11l4 0.8M5 13l4 0.8M5 15l4 0.8" stroke="${BRN}" stroke-width="0.7" stroke-opacity="0.6"/>
    <path d="M15 9l4-0.8M15 11l4-0.8M15 13l4-0.8M15 15l4-0.8" stroke="${BRN}" stroke-width="0.7" stroke-opacity="0.6"/>
  `,
  cookie: `
    <circle cx="12" cy="12" r="8.5" fill="#D4A55F" stroke="${OUT}" stroke-width="1.4"/>
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="${BRN}" stroke-width="0.6" stroke-opacity="0.5" stroke-dasharray="1 2"/>
    <ellipse cx="9" cy="9" rx="1.3" ry="1" fill="${OUT}" transform="rotate(-15 9 9)"/>
    <ellipse cx="14" cy="10.5" rx="1.2" ry="0.9" fill="${OUT}" transform="rotate(20 14 10.5)"/>
    <ellipse cx="10.5" cy="14" rx="1.1" ry="0.9" fill="${OUT}" transform="rotate(-30 10.5 14)"/>
    <ellipse cx="15" cy="14.5" rx="1" ry="0.8" fill="${OUT}" transform="rotate(15 15 14.5)"/>
    <ellipse cx="8" cy="12.5" rx="0.7" ry="0.5" fill="${OUT}"/>
    <ellipse cx="13" cy="7.5" rx="0.6" ry="0.5" fill="${OUT}"/>
    <circle cx="12" cy="12" r="0.6" fill="${BRN}" fill-opacity="0.4"/>
  `,
  pillow: `
    <path d="M3 9c0-2 2-3 5-3.5C10 5 12 4.5 14 5c2 0.5 4 1 6 3 0.5 1 0.5 4-0.5 5.5C18 16 16 17 14 17.5c-2 0.5-4 0.5-6 0-2-0.5-4-1.5-5-3.5-0.5-1-0.5-3 0-5z" fill="#F0E6F2" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M5 8c2-1 5-1.5 7-1.5s5 0.5 7 1.5M5 15c2 1 5 1.5 7 1.5s5-0.5 7-1.5" stroke="${OUT}" stroke-width="0.9" fill="none" stroke-opacity="0.5"/>
    <path d="M9 9q3-1 6 0" stroke="${BLU}" stroke-width="0.9" fill="none" stroke-opacity="0.7"/>
  `,
  tree: `
    <path d="M12 3l4 6h-2l3 5h-2l2 4H7l2-4H7l3-5H8z" fill="${GRN}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M10 6q2 1 4 0M9 10q3 1 6 0M8 14q4 1 8 0" stroke="#5A9070" stroke-width="0.7" fill="none" stroke-opacity="0.6"/>
    <rect x="10.5" y="18" width="3" height="3" fill="${BRN}" stroke="${OUT}" stroke-width="1.3"/>
  `,
  // Apple — premium-icon style: bold silhouette, deep red body with
  // a sweet top notch and a single bright leaf. Reads instantly as
  // "apple" at any size; a child would point at it and say "apple."
  // Drawn at 32×32 conceptual grid, scaled to 24×24 viewBox.
  apple: `
    <defs>
      <linearGradient id="apple-body" x1="0.3" y1="0.1" x2="0.7" y2="1">
        <stop offset="0%" stop-color="#FF7B6E"/>
        <stop offset="50%" stop-color="#E64C3E"/>
        <stop offset="100%" stop-color="#B53729"/>
      </linearGradient>
      <linearGradient id="apple-leaf" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7BC97A"/>
        <stop offset="100%" stop-color="#3F9351"/>
      </linearGradient>
    </defs>
    <ellipse cx="12" cy="21.6" rx="6" ry="0.7" fill="${OUT}" fill-opacity="0.15"/>
    <path d="M12 8.2 C 9.2 6.8 5 8.2 4 12 c -0.8 3 0.4 6.7 2.5 8.7 c 2 1.9 4 1.3 5.5 0.4 c 1.5 0.9 3.5 1.5 5.5 -0.4 c 2.1 -2 3.3 -5.7 2.5 -8.7 c -1 -3.8 -5.2 -5.2 -8 -3.8 z" fill="url(#apple-body)" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M11.4 8.4 c 0.2 0.6 0.4 1.2 0.6 1.6 c 0.2 -0.4 0.4 -1 0.6 -1.6" fill="none" stroke="${OUT}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 8 c 0.1 -1.6 0 -3 -0.4 -4" stroke="#4A2A14" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M11.7 4.2 C 11.9 3 13 2 14.5 1.7 C 16.5 1.4 18 2.3 18.4 3.8 C 18.8 5.3 17.7 6.7 16 7 C 14 7.4 12.2 6.4 11.7 4.8 z" fill="url(#apple-leaf)" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M13 4.6 c 1.3 -0.5 2.7 -0.6 4 -0.3" stroke="${OUT}" stroke-width="0.9" fill="none" stroke-opacity="0.5"/>
    <ellipse cx="7.8" cy="13" rx="1.3" ry="2.6" fill="#FFFFFF" fill-opacity="0.35" transform="rotate(-22 7.8 13)"/>
    <ellipse cx="9.2" cy="11.2" rx="0.6" ry="1.2" fill="#FFFFFF" fill-opacity="0.55" transform="rotate(-22 9.2 11.2)"/>
  `,
  // Cup — premium-icon style: bright child's drinking cup with a
  // bendy straw poking out the top, orange juice visible through
  // the cup wall. Tapered glass silhouette so it reads as "kid's
  // cup of juice" instantly — much more recognizable to a 3-5yo
  // than a coffee mug or sippy cup.
  cup: `
    <defs>
      <linearGradient id="cup-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#A4D8E5"/>
        <stop offset="100%" stop-color="#7FBCCD"/>
      </linearGradient>
      <linearGradient id="cup-juice" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFB347"/>
        <stop offset="100%" stop-color="#E07A1F"/>
      </linearGradient>
    </defs>
    <ellipse cx="12" cy="21.5" rx="6.5" ry="0.8" fill="${OUT}" fill-opacity="0.15"/>
    <path d="M14.5 3.5 v 4 q -0.5 1 -2 1 q -1.5 0 -1 -1.5 q 0.5 -1 0 -1.5" stroke="#E64C3E" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="14" cy="3.5" rx="1.5" ry="0.6" fill="#E64C3E" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M6 9 h 12 l -1.2 11 c -0.1 1 -0.9 1.8 -2 1.8 H 9.2 c -1.1 0 -1.9 -0.8 -2 -1.8 z" fill="url(#cup-glass)" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M7 12 l -0.7 7.5 c -0.05 0.7 0.4 1.4 1.1 1.5 H 15.6 c 0.7 -0.1 1.15 -0.8 1.1 -1.5 L 17 12 z" fill="url(#cup-juice)" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>
    <ellipse cx="12" cy="12" rx="5" ry="1" fill="${OUT}" fill-opacity="0.18"/>
    <path d="M6 9 h 12" stroke="${OUT}" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="12" cy="9" rx="6" ry="1.4" fill="none" stroke="${OUT}" stroke-width="1.6"/>
    <ellipse cx="12" cy="9" rx="6" ry="1.4" fill="#A4D8E5" fill-opacity="0.5"/>
    <ellipse cx="12" cy="8.8" rx="4.5" ry="0.7" fill="#FFB347"/>
    <path d="M8.5 11 q -0.4 4 0.2 8" stroke="#FFFFFF" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-opacity="0.55"/>
    <path d="M9.8 11 q -0.3 3 0.15 5" stroke="#FFFFFF" stroke-width="0.9" fill="none" stroke-linecap="round" stroke-opacity="0.4"/>
  `,
  sock: `
    <path d="M9 3v9c0 1-0.5 2-1.5 3l-3 3c-1 1-1 2.5 0 3.5l1 1c1 1 2.5 1 3.5 0l7-7c1-1 1.5-2 1.5-3V3z" fill="${BLU}" fill-opacity="0.5" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M9 6h8M9 9h8" stroke="${OUT}" stroke-width="0.9" fill="none" stroke-opacity="0.6"/>
    <path d="M9 3v3h8V3" stroke="${OUT}" stroke-width="1.5" fill="${BLU}" fill-opacity="0.7" stroke-linejoin="round"/>
    <path d="M5 17.5l4 4" stroke="${OUT}" stroke-width="0.9" fill="none" stroke-opacity="0.4"/>
  `,
  stairs: `
    <path d="M3 21h5v-3.5h4V14h4v-3.5h5V8h3v13z" fill="${ACC}" fill-opacity="0.25" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M3 21h5v-3.5h4V14h4v-3.5h5V8" stroke="${OUT}" stroke-width="1.4" fill="none" stroke-linejoin="round"/>
  `,
  // ── people / pronouns (clearer figures with hair, expression) ──
  you: `
    <circle cx="12" cy="7" r="3.2" fill="${SKN}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M9 5.5c0-2 1.5-3 3-3s3 1 3 3" fill="${BRN}" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="10.7" cy="7.3" r="0.5" fill="${OUT}"/>
    <circle cx="13.3" cy="7.3" r="0.5" fill="${OUT}"/>
    <path d="M11 8.5q1 0.5 2 0" stroke="${OUT}" stroke-width="0.9" fill="none"/>
    <path d="M5 21v-3c0-2.5 3-4.5 7-4.5s7 2 7 4.5v3" fill="${ACC}" fill-opacity="0.35" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M2.5 13l3.5 1.8-1-3.5z" fill="${RED}" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>
  `,
  they: `
    <circle cx="6" cy="8" r="2.6" fill="${SKN}" stroke="${OUT}" stroke-width="1.3"/>
    <circle cx="12" cy="6.5" r="2.8" fill="${SKN}" stroke="${OUT}" stroke-width="1.3"/>
    <circle cx="18" cy="8" r="2.6" fill="${SKN}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M4 8c0-1.5 1-2.5 2-2.5s2 1 2 2.5" fill="${BRN}" stroke="${OUT}" stroke-width="1.1"/>
    <path d="M10 6.5c0-1.7 1-3 2-3s2 1.3 2 3" fill="${PNK}" stroke="${OUT}" stroke-width="1.1"/>
    <path d="M16 8c0-1.5 1-2.5 2-2.5s2 1 2 2.5" fill="${OUT}" fill-opacity="0.7" stroke="${OUT}" stroke-width="1.1"/>
    <circle cx="5.3" cy="8.2" r="0.4" fill="${OUT}"/><circle cx="6.7" cy="8.2" r="0.4" fill="${OUT}"/>
    <circle cx="11.3" cy="6.7" r="0.4" fill="${OUT}"/><circle cx="12.7" cy="6.7" r="0.4" fill="${OUT}"/>
    <circle cx="17.3" cy="8.2" r="0.4" fill="${OUT}"/><circle cx="18.7" cy="8.2" r="0.4" fill="${OUT}"/>
    <path d="M2 21v-2.5C2 16.5 3.5 15 6 15s4 1.5 4 3.5V21M8 21v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3M14 21v-2.5c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5V21" fill="${ACC}" fill-opacity="0.3" stroke="${OUT}" stroke-width="1.3"/>
  `,
  it: `
    <rect x="5" y="6" width="14" height="12" rx="2" fill="${ACC}" fill-opacity="0.2" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M5 10h14" stroke="${OUT}" stroke-width="1.3"/>
    <circle cx="9" cy="8" r="0.7" fill="${OUT}"/>
    <circle cx="12" cy="8" r="0.7" fill="${OUT}"/>
    <text x="12" y="16.5" font-size="6" font-family="Helvetica" font-weight="bold" fill="${OUT}" text-anchor="middle">?</text>
  `,
  friend: `
    <circle cx="8.5" cy="8" r="3" fill="${SKN}" stroke="${OUT}" stroke-width="1.4"/>
    <circle cx="15.5" cy="8" r="3" fill="${SKN}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M6 6c0-1.8 1.2-3 2.5-3s2.5 1.2 2.5 3" fill="${BRN}" stroke="${OUT}" stroke-width="1.2"/>
    <path d="M13 6c0-1.8 1.2-3 2.5-3s2.5 1.2 2.5 3" fill="${YEL}" stroke="${OUT}" stroke-width="1.2"/>
    <circle cx="7.7" cy="8.3" r="0.45" fill="${OUT}"/>
    <circle cx="9.3" cy="8.3" r="0.45" fill="${OUT}"/>
    <path d="M7.8 9.4q0.7 0.5 1.4 0" stroke="${OUT}" stroke-width="0.9" fill="none"/>
    <circle cx="14.7" cy="8.3" r="0.45" fill="${OUT}"/>
    <circle cx="16.3" cy="8.3" r="0.45" fill="${OUT}"/>
    <path d="M14.8 9.4q0.7 0.5 1.4 0" stroke="${OUT}" stroke-width="0.9" fill="none"/>
    <path d="M2 21v-2.5c0-2 2-4 4-4h5c2 0 4 2 4 4V21M9 21v-2.5c0-2 2-4 4-4h5c2 0 4 2 4 4V21" fill="${ACC}" fill-opacity="0.3" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M11 12c1-0.5 1.5-1 1.5-1.5s-0.5-1 0-1 1 0.5 0.5 1.5C12.5 11.5 12 12 11 12z" fill="${RED}" stroke="${OUT}" stroke-width="1"/>
  `,
  stranger: `
    <circle cx="12" cy="7" r="3.2" fill="#C8CCD4" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M8.8 6c0-2 1.4-3.5 3.2-3.5s3.2 1.5 3.2 3.5" fill="#3A3A3A" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M10 7.5l1 0.5M14 7.5l-1 0.5" stroke="${OUT}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M11 9.5q1 0.3 2 0" stroke="${OUT}" stroke-width="0.9" fill="none"/>
    <path d="M5 21v-3c0-2.5 3-4.5 7-4.5s7 2 7 4.5v3" fill="#9CA3AF" fill-opacity="0.45" stroke="${OUT}" stroke-width="1.4"/>
    <text x="12" y="20" font-size="4" font-family="Helvetica" font-weight="bold" fill="${OUT}" text-anchor="middle">?</text>
  `,
  caregiver: `
    <circle cx="8" cy="7" r="2.7" fill="${SKN}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M5.5 5.5c0-1.8 1.2-3 2.5-3s2.5 1.2 2.5 3" fill="${BRN}" stroke="${OUT}" stroke-width="1.2"/>
    <circle cx="7.3" cy="7.3" r="0.4" fill="${OUT}"/>
    <circle cx="8.7" cy="7.3" r="0.4" fill="${OUT}"/>
    <path d="M7.3 8.3q0.7 0.4 1.4 0" stroke="${OUT}" stroke-width="0.9" fill="none"/>
    <circle cx="16" cy="9" r="2" fill="${SKN}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M14.5 8c0-1.2 0.7-2 1.5-2s1.5 0.8 1.5 2" fill="${YEL}" stroke="${OUT}" stroke-width="1.1"/>
    <circle cx="15.5" cy="9.2" r="0.3" fill="${OUT}"/>
    <circle cx="16.5" cy="9.2" r="0.3" fill="${OUT}"/>
    <path d="M2 21v-2c0-2 1.5-3.5 4-3.5h4c2.5 0 4 1.5 4 3.5v2M14 21v-1.5c0-1.7 1.3-3 3-3s3 1.3 3 3V21" fill="${ACC}" fill-opacity="0.3" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M9.5 12c1.5 1 2 2 4 2s2.5-1 4-2" stroke="${RED}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  `,
  landmark: `
    <path d="M5 20V10l7-6 7 6v10z" fill="#E8DBC0" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M10 20v-7h4v7" fill="${BRN}" fill-opacity="0.5" stroke="${OUT}" stroke-width="1.3"/>
    <rect x="7" y="13" width="2" height="2" fill="${BLU}" stroke="${OUT}" stroke-width="1"/>
    <rect x="15" y="13" width="2" height="2" fill="${BLU}" stroke="${OUT}" stroke-width="1"/>
    <path d="M12 4v-2" stroke="${RED}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M12 2l3 1.5-3 1.5z" fill="${RED}" stroke="${OUT}" stroke-width="1.2"/>
  `,
  // ── feelings ────────────────────────────────────────────────────
  tired: `
    <circle cx="12" cy="12" r="9" fill="#D4DBE5" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M6.5 10c1 0 2 0.3 3 0.7M14.5 10.7c1-0.4 2-0.7 3-0.7" stroke="${OUT}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M9 14q2-1 4 0M14 15.5q2-0.8 4 0" stroke="${OUT}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M15.5 5l1 1.5h-1l1 1.5" stroke="${BLU}" stroke-width="1.4" fill="none" stroke-linejoin="round"/>
    <path d="M19 3l0.5 1h-0.5l0.5 1" stroke="${BLU}" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
  `,
  comfortable: `
    <path d="M3 13c0-2 2-3 4-3h10c2 0 4 1 4 3v6H3z" fill="${ACC}" fill-opacity="0.35" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M3 19v2M21 19v2" stroke="${OUT}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M6 10c0-2.5 1-4 6-4s6 1.5 6 4" fill="${ACC}" fill-opacity="0.5" stroke="${OUT}" stroke-width="1.4"/>
    <circle cx="9" cy="14" r="0.6" fill="${OUT}"/>
    <circle cx="15" cy="14" r="0.6" fill="${OUT}"/>
    <path d="M10 16q2 1 4 0" stroke="${OUT}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  `,
  // ── abstract / state ────────────────────────────────────────────
  big: `
    <rect x="3" y="3" width="18" height="18" rx="2" fill="${ACC}" fill-opacity="0.2" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M3 12l4-4v3h10V8l4 4-4 4v-3H7v3z" fill="${ACC}" fill-opacity="0.7" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
  `,
  // ── verbs lacking Mulberry coverage ─────────────────────────────
  stop: `
    <path d="M7 3h10l4 4v10l-4 4H7l-4-4V7z" fill="${RED}" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <text x="12" y="15.5" font-size="6" font-family="Helvetica" font-weight="bold" fill="#FFF" text-anchor="middle" letter-spacing="-0.5">STOP</text>
  `,
  go: `
    <circle cx="12" cy="12" r="9" fill="${GRN}" stroke="${OUT}" stroke-width="1.5"/>
    <text x="12" y="15" font-size="7" font-family="Helvetica" font-weight="bold" fill="#FFF" text-anchor="middle">GO</text>
  `,
  yes: `
    <circle cx="12" cy="12" r="9" fill="${GRN}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M6.5 12.5l3.5 4 7-7.5" stroke="#FFF" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  no: `
    <circle cx="12" cy="12" r="9" fill="${RED}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M8 8l8 8M16 8l-8 8" stroke="#FFF" stroke-width="2.6" stroke-linecap="round"/>
  `,
  // ── cognitive ───────────────────────────────────────────────────
  remember: `
    <ellipse cx="12" cy="11" rx="7" ry="6" fill="${PNK}" fill-opacity="0.5" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M9 8c0-1 1-2 3-2M12 6c2 0 3 1 3 2" stroke="${OUT}" stroke-width="1.2" fill="none"/>
    <path d="M8 11q4 1 8 0M9 14q3 1 6 0" stroke="${OUT}" stroke-width="1" fill="none" stroke-opacity="0.6"/>
    <circle cx="6" cy="18" r="0.8" fill="${ACC}"/>
    <circle cx="8" cy="20" r="0.5" fill="${ACC}"/>
    <path d="M18 5l0.5 1.5h1.5l-1 1 0.5 1.5-1.5-1-1.5 1 0.5-1.5-1-1h1.5z" fill="${YEL}" stroke="${OUT}" stroke-width="1"/>
  `,
  forget: `
    <ellipse cx="12" cy="11" rx="7" ry="6" fill="#E8E8E8" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M9 8c0-1 1-2 3-2M12 6c2 0 3 1 3 2" stroke="${OUT}" stroke-width="1.2" fill="none"/>
    <circle cx="6" cy="18" r="0.8" fill="${OUT}" fill-opacity="0.4"/>
    <circle cx="8" cy="20" r="0.5" fill="${OUT}" fill-opacity="0.4"/>
    <path d="M8 11l8 0M9 14l6 0" stroke="${OUT}" stroke-width="1" stroke-dasharray="1 1" fill="none"/>
    <path d="M16 6l3 3M19 6l-3 3" stroke="${RED}" stroke-width="2" stroke-linecap="round"/>
  `,
  // ── water / temperature ─────────────────────────────────────────
  river: `
    <rect x="0" y="14" width="24" height="10" fill="${BLU}" fill-opacity="0.4"/>
    <path d="M0 15q3-1.5 6 0t6 0t6 0t6 0" stroke="${BLU}" stroke-width="1.4" fill="none"/>
    <path d="M0 18q3-1.5 6 0t6 0t6 0t6 0" stroke="${BLU}" stroke-width="1.4" fill="none" stroke-opacity="0.7"/>
    <path d="M0 21q3-1.5 6 0t6 0t6 0t6 0" stroke="${BLU}" stroke-width="1.4" fill="none" stroke-opacity="0.7"/>
    <path d="M2 13c2-2 4-3 6-3M16 11c2 0.5 4 1 6 3" fill="${GRN}" fill-opacity="0.6" stroke="${OUT}" stroke-width="1.3"/>
  `,
  'ice cube': `
    <path d="M4 9l8-4 8 4v9l-8 4-8-4z" fill="${BLU}" fill-opacity="0.35" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M4 9l8 4 8-4M12 13v9" stroke="${OUT}" stroke-width="1.3" fill="none"/>
    <path d="M7 7l4-2M17 7l-4-2" stroke="#FFF" stroke-width="1.5" fill="none" stroke-opacity="0.8"/>
  `,
  'hot tea': `
    <path d="M5 10h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${BRN}" fill-opacity="0.7" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M16 12h2.5a2 2 0 0 1 0 4H16" stroke="${OUT}" stroke-width="1.5" fill="none"/>
    <ellipse cx="10.5" cy="10" rx="5" ry="0.8" fill="#5C3A1F" stroke="${OUT}" stroke-width="1"/>
    <path d="M8 7q-1-2 0-4M11 7q-1-2 0-4M14 7q-1-2 0-4" stroke="${RED}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  `,
  // ── colored variants — recolored versions of base symbols ───────
  'red apple': `
    <path d="M12 8c-3 0-5 2-5 5 0 4 3 8 5 8s5-4 5-8c0-3-2-5-5-5z" fill="${RED}" stroke="${OUT}" stroke-width="1.4"/>
    <ellipse cx="10" cy="11" rx="1.5" ry="2.5" fill="#FFF" fill-opacity="0.4" transform="rotate(-20 10 11)"/>
    <path d="M12 8V6c0-1 1-2 2-2" stroke="${BRN}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M14 4c1.5 0 2.5 1 2.5 2.5-1.5 0-2.5-1-2.5-2.5z" fill="${GRN}" stroke="${OUT}" stroke-width="1.2"/>
  `,
  'green leaf': `
    <path d="M5 19c0-8 5-14 14-15-0.5 9-7 14-14 15z" fill="${GRN}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M5 19c4-3 8-7 13-13" stroke="${OUT}" stroke-width="1.2" fill="none"/>
    <path d="M8 16l2-2M11 13l2-2M14 10l2-2" stroke="${OUT}" stroke-width="0.9" fill="none" stroke-opacity="0.5"/>
  `,
  'blue ball': `
    <circle cx="12" cy="12" r="8" fill="${BLU}" stroke="${OUT}" stroke-width="1.5"/>
    <ellipse cx="9" cy="9" rx="2.5" ry="3.5" fill="#FFF" fill-opacity="0.35" transform="rotate(-25 9 9)"/>
    <path d="M4 12q8-6 16 0M4 12q8 6 16 0M12 4q-6 8 0 16M12 4q6 8 0 16" stroke="${OUT}" stroke-width="0.9" fill="none" stroke-opacity="0.5"/>
  `,
  'yellow sun': `
    <circle cx="12" cy="12" r="4.5" fill="${YEL}" stroke="${OUT}" stroke-width="1.5"/>
    <g stroke="${YEL}" stroke-width="2" stroke-linecap="round" fill="none">
      <line x1="12" y1="2" x2="12" y2="5.5"/>
      <line x1="12" y1="18.5" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5.5" y2="12"/>
      <line x1="18.5" y1="12" x2="22" y2="12"/>
      <line x1="4.9" y1="4.9" x2="7.4" y2="7.4"/>
      <line x1="16.6" y1="16.6" x2="19.1" y2="19.1"/>
      <line x1="4.9" y1="19.1" x2="7.4" y2="16.6"/>
      <line x1="16.6" y1="7.4" x2="19.1" y2="4.9"/>
    </g>
    <circle cx="10.5" cy="11" r="0.5" fill="${OUT}"/>
    <circle cx="13.5" cy="11" r="0.5" fill="${OUT}"/>
    <path d="M10.5 13.5q1.5 1 3 0" stroke="${OUT}" stroke-width="1" fill="none"/>
  `,
  // ── time ────────────────────────────────────────────────────────
  bedtime: `
    <path d="M16 3a8 8 0 1 0 5 13 7 7 0 0 1-5-13z" fill="#FFE49A" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="5" cy="5" r="0.6" fill="${YEL}"/>
    <circle cx="8" cy="3" r="0.5" fill="${YEL}"/>
    <circle cx="3" cy="9" r="0.4" fill="${YEL}"/>
    <circle cx="9" cy="7" r="0.4" fill="${YEL}"/>
    <path d="M3 20l4-3h10l4 3z" fill="${BRN}" fill-opacity="0.6" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M5 20v-2h14v2" stroke="${OUT}" stroke-width="1.3" fill="${BRN}" fill-opacity="0.4"/>
  `,
  // ── pain / hurt ─────────────────────────────────────────────────
  pain: `
    <circle cx="12" cy="12" r="9" fill="${RED}" fill-opacity="0.7" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M8 11l4-4M16 11l-4-4" stroke="${OUT}" stroke-width="1.5" fill="none"/>
    <path d="M8 17q4 -2 8 0" stroke="${OUT}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M3 5l1.5 1.5L3 8M5 3l1 1-1 1" stroke="${YEL}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  `,
  painful: `
    <circle cx="12" cy="12" r="9" fill="${RED}" fill-opacity="0.7" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M8 11l4-4M16 11l-4-4" stroke="${OUT}" stroke-width="1.5" fill="none"/>
    <path d="M8 17q4 -2 8 0" stroke="${OUT}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M3 5l1.5 1.5L3 8M5 3l1 1-1 1" stroke="${YEL}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  `
};

// Alias map — labels that should render the same SVG as another slug.
const ALIAS = {
  'last week': 'week',
  'a stranger': 'stranger',
  'my family': 'family',
  'my caregiver': 'caregiver',
  'a pet': 'pet',
  'a landmark': 'landmark'
};

export default Component.extend({
  tagName: '',
  slug: null,
  size: 80,

  resolvedSlug: computed('slug', function() {
    const s = (this.get('slug') || '').toString().toLowerCase().trim();
    return ALIAS[s] || s;
  }),

  isPng: computed('resolvedSlug', function() {
    return PNG_SLUGS.has(this.get('resolvedSlug'));
  }),

  pngUrl: computed('resolvedSlug', function() {
    return '/images/eval-' + this.get('resolvedSlug') + '.png';
  }),

  isMulberry: computed('resolvedSlug', function() {
    return MULBERRY_SLUGS.has(this.get('resolvedSlug'));
  }),

  mulberryUrl: computed('resolvedSlug', function() {
    return '/symbols/eval/' + this.get('resolvedSlug') + '.svg';
  }),

  customMarkup: computed('resolvedSlug', 'size', function() {
    const slug = this.get('resolvedSlug');
    const inner = SLUG_TO_SVG[slug];
    if (!inner) { return htmlSafe(''); }
    const size = this.get('size') || 80;
    const svg = `<svg class="evq-symbol" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    return htmlSafe(svg);
  }),

  hasSymbol: computed('resolvedSlug', function() {
    const s = this.get('resolvedSlug');
    return PNG_SLUGS.has(s) || MULBERRY_SLUGS.has(s) || !!SLUG_TO_SVG[s];
  })
});
