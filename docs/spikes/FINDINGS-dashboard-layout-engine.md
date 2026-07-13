# Spike findings — registry-driven layout engine vs the `dashboardLayout` matrix

**Date:** 2026-06-10 · **Status:** throwaway (see `dashboard-layout-engine.spike.js`)
**Question:** can a compact, registry + rule-based packer reproduce today's Dynamic
(and Balanced) grids — the bar being "renders identically to today" — so we can replace
the ~20-branch combinatorial `dashboardLayout()` matrix and make "add an item" O(1)?

## Result: a naïve packer matches **21/32** visibility combinations; 11 differ.

But the 11 split into two very different buckets:

### Bucket 1 — 7 are matrix *quirks*, where the candidate is actually cleaner
For these, today's matrix names grid areas for cards that are **turned OFF**
(e.g. `speak` only → today emits `["boards speak","boards extras"]` naming boards+extras
even though both are hidden; they only disappear because `cardHideStyle` sets
`display:none`). The candidate names **only visible cards**. These are very likely
**visually equivalent** today (hidden cells collapse), so the byte-mismatch is not a real
design difference — if anything the engine removes latent empty-cell/gap risk.

### Bucket 2 — 4 are *genuine curated arrangements* worth preserving
1. `caseload+extras+org` and `speak+extras+org` → today uses a **paired bottom row**
   (`extras org_mgmt`) with the third card full-width on top.
2. `caseload+speak+extras+boards` and `speak+extras+org+boards` → today makes **Boards a
   tall 2-row hero** in the left column when it has 3 companions (the candidate only gave
   it one row).

These are real design decisions, not quirks.

## Conclusion — feasible, with eyes open

- **Byte-parity with a trivial packer: NO** (21/32). So this is *not* a zero-thought drop-in.
- **Visual parity with a small rule set: YES, achievable.** The divergences reduce to
  ~3 explicit packing rules — (a) Boards span = full-width with ≤2 companions, tall-hero
  with 3; (b) Extras+Org form a paired row; (c) a lone trailing small spans full width
  (already in the candidate). That's **~3 rules + a registry replacing ~20 enumerated
  branches**, and adding a new item becomes: append one registry entry (key, component,
  span, `available`) + one tile component — no new layout branches, no template edits.
- The matrix's hidden-card quirks should be **dropped** (treat as bugs), not reproduced.

## Recommended shape for the real refactor (if we proceed)
1. Promote `HOME_SECTIONS` → a tile manifest: `{ key, component, span, available, defaultVisible }`.
2. Render the grid by mapping the manifest → `<DashboardTile>` (kills the bespoke inline cards).
3. Replace `dashboardLayout()` with `packGrid(visibleTiles, order)` implementing the 3 rules.
4. Keep Balanced as the existing thin transform (promote Speak→hero, drop Extras) over the
   manifest — and presets become data, not forked render paths.
5. Point the Dashboard Design modal preview at the SAME tiles/engine (kills preview drift —
   the exact class of bug we just fixed).

**Risk note:** this touches shared dashboard rendering used by every user, incl. tablets.
Recommend doing it as a phased plan with a visual before/after check per phase, not one big
swap. The spike says the engine is sound; the migration is where the care goes.
