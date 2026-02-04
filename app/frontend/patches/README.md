# Ember CLI Template Lint Patch

## Overview

This directory contains a patch for `ember-cli-template-lint@2.0.2` that fixes a deprecation warning in Ember 3.28+.

## The Problem

The `ember-cli-template-lint` package (v2.0.2) uses an **abandoned class-based plugin API** that triggers this deprecation warning:

```
DEPRECATION: Using class based template compilation plugins is deprecated, 
please update to the functional style: RemoveConfigurationHtmlCommentsPlugin
[deprecation id: template-compiler.registerPlugin]
```

### Why We Can't Upgrade

- `ember-cli-template-lint` is **abandoned** - version 2.0.2 is the final release
- No upgrade path exists (no version 3.x+)
- The package has been effectively replaced by using `ember-template-lint` directly in modern Ember apps

## The Solution

This patch converts the `RemoveConfigurationHtmlCommentsPlugin` from class-based to functional style, using the modern `visitor` pattern expected by Ember 3.28+.

### What This Patch Does

1. **Converts plugin API** (`lib/plugins/remove-configuration-html-comments.js`):
   - FROM: Class-based `prototype.transform` method with `Walker`
   - TO: Functional plugin with `visitor.Program()` pattern

2. **Updates plugin registration** (`index.js`):
   - Passes function reference instead of invoking it
   - Allows Ember to call the plugin factory correctly

3. **Fixes splice bug**:
   - Adds `i--` after removing array elements to prevent skipping items

## How It's Applied

The patch is automatically applied via `postinstall` script:

```json
"scripts": {
  "postinstall": "patch-package"
}
```

Every time you run `npm install`, the patch is reapplied to ensure consistency.

## Verification

After applying this patch:
- ✅ Build completes successfully
- ✅ Zero "class based template compilation plugins" deprecation warnings
- ✅ Template linting continues to work correctly

## Maintenance

### When to Remove This Patch

Remove this patch when upgrading to:
- Ember 4.0+ (which may drop support for `ember-cli-template-lint` entirely)
- A modern Ember setup using `ember-template-lint` directly without the CLI addon

### Troubleshooting

If the patch fails to apply:
```bash
# Reinstall from scratch
rm -rf node_modules
npm install
```

If you need to recreate the patch:
```bash
# Make your changes to node_modules/ember-cli-template-lint/
npx patch-package ember-cli-template-lint
# Patch will be saved to patches/ember-cli-template-lint+2.0.2.patch
```

## Technical Details

See the patch file for the exact changes. Key modifications:

- **File 1**: `index.js` (1 line changed)
- **File 2**: `lib/plugins/remove-configuration-html-comments.js` (32 lines changed)

Total: 68 lines in diff format

## Related

- Original deprecation: https://deprecations.emberjs.com/v3.x#toc_template-compiler-registerPlugin
- Package source: https://github.com/ember-template-lint/ember-cli-template-lint
- Modern linting: Use `ember-template-lint` directly (already a dependency)
