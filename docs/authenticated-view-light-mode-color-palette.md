# Light Mode Authenticated-View Color Palette

Colors used on the dashboard when **Light mode** is active (`ll-bento-app-shell--light`). The shell uses the same design tokens as the default theme; light mode only removes the left teal bar on section groups. The **top navbar** uses a separate light-mode override.

---

## 1. Page & shell

| Role | Color | Where used |
|------|--------|-------------|
| **Page background** | `#fff` (white) | `#content.index.with_user` – behind the bento shell |
| **Shell background** | `transparent` | `.ll-bento-app-shell` – content area shows page bg |
| **Design token (reference)** | `#dcdde0` | `--ll-bento-bg` – defined on shell, used as fallback in tokens |

---

## 2. Background orbs (decorative blur)

| Orb | Colors | Usage |
|-----|--------|--------|
| **Orb A** | `rgba(95, 199, 255, 0.38)`, `rgba(123, 140, 255, 0.32)` | Top-left blue/indigo gradient |
| **Orb B** | `rgba(67, 198, 195, 0.30)`, `rgba(183, 155, 255, 0.28)` | Top-right teal/violet gradient |
| **Orb C** | `rgba(255, 138, 122, 0.28)`, `rgba(95, 199, 255, 0.22)` | Bottom-left coral/blue gradient |

Orbs use `filter: blur(22px)` and `opacity: 0.75`.

---

## 3. Device frame (main card)

| Role | Color | Notes |
|------|--------|--------|
| **Frame background** | `linear-gradient(135deg, rgba(255, 255, 255, 0.52) 0%, rgba(252, 253, 255, 0.45) 100%)` | Frosted glass |
| **Frame border** | `rgba(255, 255, 255, 0.45)` | 1px |
| **Shadow** | `var(--ll-bento-shadow-lg)` → `0 18px 50px rgba(19, 29, 56, 0.12)` | Card elevation |

---

## 4. Top bar (navbar) – **Light mode override**

| Role | Color | Notes |
|------|--------|--------|
| **Bar background** | `#4A7BA7` | Light mode only (`bento-light-mode-active`); overrides default bar |
| **Bar border (bottom)** | `rgba(255, 255, 255, 0.28)` | 1px |

*(When not in light mode, the default bar uses a gradient and `#1b2a4a` border.)*

---

## 5. Top bar contents (shared with default)

| Role | Color | Where |
|------|--------|--------|
| **Brand link bg** | `rgba(225, 228, 238, 0.98)` | `.ll-bento-brand-link` |
| **Brand link hover** | `#fff` | |
| **“Home Page” text** | `#3A6BC7` | `.ll-bento-bar__brand-home` |
| **Welcome label** | `rgba(31, 42, 68, 0.8)` | `.ll-bento-bar-welcome__label` |
| **Welcome text** | `rgba(31, 42, 68, 0.9)` | `.ll-bento-bar-welcome` |
| **Username / badge** | `#2A9D8F` (teal) | `.ll-bento-bar-welcome__link`, `__badge` |
| **Username hover** | `#238a7e` | |
| **Celebration icon** | `#2A9D8F` | `.ll-bento-bar-welcome__celebration-icon` |
| **Icon button bg** | `rgba(225, 228, 238, 0.98)` | `.ll-bento-bar .ll-bento-icon-btn` |
| **Icon button hover** | `#fff` | |
| **Refresh icon** | `#3d7a5c` | `.ll-bento-icon-btn--refresh .glyphicon-refresh` |

---

## 6. Tabs (Actions, Communicators, Boards, etc.)

| Role | Color | Where |
|------|--------|--------|
| **Tab row background** | `linear-gradient(135deg, rgba(255, 252, 250, 0.38) 0%, rgba(248, 250, 253, 0.32) 100%)` | `.ll-bento-tabs` |
| **Tab row border** | `rgba(255, 255, 255, 0.5)` | |
| **Tab underline (span)** | `#3A6BC7` | `.ll-bento-span` border-bottom |
| **Tab default bg** | Same gradient as tab row | `.ll-bento-tab` |
| **Tab default text** | `rgba(30, 36, 48, 0.72)` | |
| **Tab hover bg** | `rgba(255, 255, 255, 0.42)` → `rgba(248, 250, 253, 0.36)` | |
| **Tab active bg** | `linear-gradient(135deg, rgba(120, 195, 198, 0.72) 0%, rgba(200, 235, 240, 0.66) 50%, rgba(140, 190, 220, 0.72) 100%)` | `.ll-bento-tab--active` |
| **Tab active text** | `rgba(15, 20, 30, 0.98)` | |
| **Tab active border** | `rgba(110, 195, 200, 0.5)` | |

---

## 7. Design tokens (--ll-bento-*)

Defined on `.ll-bento-app-shell`, used across bento components:

| Token | Value | Use |
|-------|--------|-----|
| `--ll-bento-bg` | `#dcdde0` | Reference bg |
| `--ll-bento-ink` | `#1e2430` | Primary text |
| `--ll-bento-muted` | `rgba(30, 36, 48, 0.62)` | Secondary text |
| `--ll-bento-card` | `rgba(255, 252, 250, 0.88)` | Card bg |
| `--ll-bento-card-strong` | `rgba(255, 255, 255, 0.92)` | Strong card |
| `--ll-bento-stroke` | `rgba(20, 24, 36, 0.08)` | Borders |
| `--ll-bento-shadow-lg` | `0 18px 50px rgba(19, 29, 56, 0.12)` | Large shadow |
| `--ll-bento-shadow-md` | `0 10px 28px rgba(19, 29, 56, 0.05)` | Medium shadow |
| `--ll-bento-shadow-sm` | `0 6px 16px rgba(19, 29, 56, 0.06)` | Small shadow |
| `--ll-bento-primary-1` | `#4ec5c8` | Teal |
| `--ll-bento-primary-2` | `#5fb8ff` | Blue |
| `--ll-bento-primary-3` | `#7b8cff` | Indigo |
| `--ll-bento-secondary` | `#b8a8d8` | Lavender |
| `--ll-bento-functional-green` | `#5cb88a` | Success / speak |
| `--ll-bento-functional-coral` | `#e88a7a` | Premium / attention |
| `--ll-bento-icon-gloss` | `linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 50%)` | Icon highlight |
| `--ll-bento-icon-rim` | `inset 1px 1px 0 rgba(255, 255, 255, 0.42)` | Icon rim |
| `--ll-bento-material-inner-highlight` | `inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12)` | Glass inner light |
| `--ll-bento-material-counter-shadow` | `inset 0 -1px 2px rgba(0, 0, 0, 0.035)` | Glass depth |

---

## 8. Section labels

| Role | Color | Where |
|------|--------|--------|
| **Section label** | `#3D7A5C` | `.ll-bento-section-label` (“Primary Actions”, “More Tools”, “Filter”) |

---

## 9. Action cards & hero card

| Role | Color | Where |
|------|--------|--------|
| **Card background** | `rgba(255, 252, 250, 0.88)` | `.ll-bento-action-card`, `.ll-bento-hero-card` |
| **Card hover** | `rgba(240, 242, 245, 0.9)` | |
| **Card border** | `var(--ll-bento-stroke)` → `rgba(20, 24, 36, 0.08)` | |
| **Card title** | `var(--ll-bento-ink)` → `#1e2430` | |
| **Card subtitle** | `var(--ll-bento-muted)` | |
| **Action button (secondary)** | bg `#e8ecf2`, text `rgba(30, 36, 48, 0.9)`, border `#c8d0dc` | `.ll-bento-action-card__action-btn` |
| **Filter active card** | bg `rgba(240, 244, 250, 0.95)`, border `rgba(78, 205, 196, 0.35)` | `.ll-bento-action-card--filter-active` |
| **Extras expanded panel** | `linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(235, 240, 250, 0.22) 100%)` | `.ll-bento-extras-expanded` |
| **Extras expanded card** | `rgba(240, 242, 245, 0.9)` | `.ll-bento-action-card--extras-expanded` |
| **Emergency card** | bg `rgba(228, 245, 240, 0.9)`, border `rgba(200, 230, 220, 0.6)` | `.ll-bento-action-card--emergency` |

---

## 10. Action card icon containers

| Icon type | Background | Border |
|-----------|------------|--------|
| **Speak** | `var(--ll-bento-icon-gloss), rgba(61, 122, 92, 0.14)` | `rgba(61, 122, 92, 0.28)` |
| **Reports** | `var(--ll-bento-icon-gloss), rgba(220, 238, 242, 0.85)` | `rgba(195, 220, 230, 0.5)` |
| **Ideas / Modeling** | `var(--ll-bento-icon-gloss), rgba(228, 235, 250, 0.85)` | `rgba(205, 218, 240, 0.5)` |
| **Extras** | `var(--ll-bento-icon-gloss), rgba(218, 198, 115, 0.26)` | `rgba(218, 198, 115, 0.45)` |
| **Green-yellow** | `var(--ll-bento-icon-gloss), rgba(245, 242, 228, 0.85)` | `rgba(230, 225, 205, 0.5)` |
| **Account** | `var(--ll-bento-icon-gloss), rgba(235, 235, 245, 0.85)` | `rgba(215, 215, 230, 0.5)` |
| **Suggested** | Same as Ideas | Same as Ideas |
| **Mine** | Same as Account | Same as Account |
| **Community** | Same as Green-yellow | Same as Green-yellow |
| **Recent** | Same as Reports | Same as Reports |
| **Icon border (generic)** | — | `rgba(210, 214, 224, 0.5)` |
| **Icon glyph** | — | `rgba(50, 60, 75, 0.75)` |

---

## 11. Getting Started card (blank slate)

| Role | Color | Where |
|------|--------|--------|
| **Card bg** | `linear-gradient(135deg, rgba(255, 252, 250, 0.38) 0%, rgba(248, 250, 253, 0.32) 100%)` | `.ll-bento-getting-started--main` |
| **Divider** | `linear-gradient(90deg, transparent, rgba(20, 127, 130, 0.5), rgba(58, 107, 199, 0.4), transparent)` | `.ll-bento-getting-started__divider` |

---

## 12. Browse Boards section

| Role | Color | Where |
|------|--------|--------|
| **Panel bg** | Same gradient as tabs / cards | `.ll-bento-browse-boards` |
| **Panel hover** | `rgba(248, 250, 253, 0.42)` → `rgba(240, 244, 250, 0.36)` | |

---

## 13. CTA / hero button (e.g. “Speak”)

| Role | Color | Where |
|------|--------|--------|
| **Button gradient** | `linear-gradient(135deg, #3db8bc 0%, #4eb5ff 50%, #5f7cff 100%)` | `.ll-bento-hero-card__btn` |
| **Button text** | `rgba(255, 255, 255, 0.98)` | |
| **Button shadow** | `0 12px 28px rgba(61, 184, 188, 0.32)` | |

---

## 14. Demo color swatches (default theme only, when visible)

| Swatch | Color | Usage |
|--------|--------|--------|
| **Navy** | `#1B365D` | Demo bg option |
| **Navy light** | `#C6CDD7` | Demo bg option |
| **Tab light** | `#E9F9F8` | Demo bg option |
| **Reset** | `#F0F0F0`, hover `#e8e8e8` | Reset demo bg |
| **Border toggle** | `#F0F0F0` | Section border toggle |

---

## 15. Bottom bar (page footer)

| Role | Color | Where |
|------|--------|--------|
| **Footer background** | `#e5e7eb` | `.page-footer` (default when not midday/coolBlue) |
| **Footer link** | `#1B365D` (--fs-navy) | `.page-footer a` |
| **Footer app name** | `#1B365D` | `.page-footer__app-name .nav-header__app-name-*` |

---

## 16. Alerts & badges

| Role | Color | Where |
|------|--------|--------|
| **Updates badge (danger)** | Bootstrap `label-danger` (red) | Pending updates count on tab |

---

## 17. Shadow summary

| Token | Value |
|-------|--------|
| **Shadow lg** | `0 18px 50px rgba(19, 29, 56, 0.12)` |
| **Shadow md** | `0 10px 28px rgba(19, 29, 56, 0.05)` |
| **Shadow sm** | `0 6px 16px rgba(19, 29, 56, 0.06)` |
| **Icon/card** | `0 4px 12px rgba(19, 29, 56, 0.06)` + icon-rim |

---

## Quick hex reference (light mode)

- **Page bg:** `#fff`
- **Navbar (light mode):** `#4A7BA7`
- **Accent blue:** `#3A6BC7`
- **Teal (username, links):** `#2A9D8F`, `#238a7e`
- **Refresh green:** `#3d7a5c`
- **Section label green:** `#3D7A5C`
- **Ink:** `#1e2430`
- **Navy (footer, links):** `#1B365D`
- **Bar border (default):** `#1b2a4a`
- **Primary teal:** `#4ec5c8`
- **Primary blue:** `#5fb8ff`
- **Primary indigo:** `#7b8cff`
- **Brand link / icon bg:** `rgba(225, 228, 238, 0.98)` → `#e1e4ee`
- **Footer bar:** `#e5e7eb`
- **Action button gray:** `#e8ecf2`, border `#c8d0dc`
- **CTA gradient:** `#3db8bc` → `#4eb5ff` → `#5f7cff`
