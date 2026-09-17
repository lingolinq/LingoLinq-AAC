# Homescreen shortcut still used the old coral/teal icon

## Diagnosis

Add to Home Screen reads `apple-touch-icon` in `app/views/layouts/application.html.erb`,
not the title-bar `<img>` (`LL_Logo_Line_Bright.png`). Production pointed those links at
`https://www.lingolinq.com/icons/logo-{60,76,120,152}.png`, the Nov 2025 overlapping
speech-bubble mark. Ember serve used `LL_Logo_Light_Muted.png` (current mark, but a
~6k-px source).

## Change

Regenerated `public/icons/logo-{60,76,120,152,180}.png` from the square current mark
(`app/frontend/public/images/LL_Logo_Light_Muted.png`) on a white background. Layout
and ember `index.html` now point at `/icons/logo-180.png?v=7`. Copies also live in
`app/frontend/public/icons/` so `ember serve` can resolve them.

Existing device shortcuts keep the icon they saved at install time; the user has to
remove and re-add the shortcut to pick up the new art.
