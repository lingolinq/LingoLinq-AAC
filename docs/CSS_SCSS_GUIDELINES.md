# CSS / SCSS Guidelines

Rules and gotchas for working with stylesheets in LingoLinq-AAC.

## SassC Compilation & Mixed-Unit Math

**Rule:** When mixing units (e.g. `px + vw`, `rem + vw`) inside CSS functions like `clamp()`, **always wrap the mixed-unit expression in `calc()`**.

### Why

SassC (the Sass compiler used by the Rails asset pipeline) attempts to evaluate arithmetic at compile time. When it encounters `12px + 2.5vw` it tries — and fails — because those units are incompatible at compile time. Wrapping in `calc()` tells SassC to leave the expression alone and let the browser evaluate it at runtime.

### Examples

```scss
// BAD — SassC will error on mixed units
padding: clamp(24px, 12px + 2.5vw, 48px);

// GOOD — calc() defers evaluation to the browser
padding: clamp(24px, calc(12px + 2.5vw), 48px);
```

Single-unit math (e.g. `24px + 8px`) does **not** need `calc()` because SassC can resolve it, but wrapping it anyway is harmless.

## CSS Compression Is Disabled

`config.assets.css_compressor` is set to `nil` in `config/environments/production.rb`.

### Why

- The Ember frontend CSS is already minified by `ember-cli-terser` during `ember build --production`.
- The only Rails-side CSS (e.g. `header_sizing`, bootstrap) is tiny — compressing it saves almost nothing.
- Setting the compressor to `:sass` forces all CSS through SassC a second time, which **re-triggers the mixed-unit compilation errors** described above, even if the source files are valid browser CSS.

**Do not re-enable `:sass` compression.** If CSS minification is ever needed on the Rails side, use a compressor that does not re-parse Sass (e.g. a simple whitespace/comment stripper).

## Dual Sass Compilers — Know Which One You're Using

The project has **two separate Sass compilers**:

| Compiler | Used by | Files it touches |
|----------|---------|------------------|
| **Dart Sass** (modern, maintained) | Ember via `ember-cli-sass` | `app/frontend/app/styles/app.scss` |
| **SassC / LibSass** (deprecated) | Rails/Sprockets via `sassc-rails` | `app/assets/stylesheets/*.scss` (currently only `header_sizing.scss`) |

**Rule:** Do NOT use modern Sass features in any `.scss` file under `app/assets/stylesheets/`. SassC/LibSass is deprecated and does not support:

- `@use` / `@forward` (use `@import` instead)
- `color.adjust()`, `color.scale()`, `math.div()` (use the legacy function equivalents)
- Mixed-unit `calc()` expressions inside Sass arithmetic
- Other features added after LibSass was deprecated (August 2020)

Modern Sass features are fine in `app/frontend/app/styles/app.scss` — that file is compiled by Dart Sass.
