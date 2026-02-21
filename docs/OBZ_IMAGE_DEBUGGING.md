# Debugging OBZ Board Import - Missing Images

When imported boards don't display images, use this guide to determine whether the problem is in **download/export** (images not in the file) or **import** (images in file but not displaying).

## Quick inspection: Is the OBZ valid and does it contain images?

### Option 1: Command-line (no Ruby needed)

```bash
# 1. Unzip the OBZ (it's a standard ZIP file)
unzip -l your_board.obz

# You should see:
#   manifest.json
#   board_<id>.obf (one or more JSON files)
#   images/image_<id>.png (or .jpg, .svg, etc.)

# 2. Extract and inspect manifest
unzip -p your_board.obz manifest.json | jq .

# 3. Check image paths in manifest
unzip -p your_board.obz manifest.json | jq '.paths.images'

# 4. List images in zip
unzip -l your_board.obz | grep images/
```

### Option 2: Ruby diagnostic script

```bash
ruby scripts/inspect_obz.rb path/to/your_board.obz
```

This reports:
- Whether manifest and board JSON are valid
- How many images are referenced by buttons
- Whether each image has `data`, `path`, or `url`
- Whether image files exist in the zip
- Any detected issues

## Interpreting results

### Images ARE in the OBZ (files present, paths correct)
→ **Problem is likely in import/display:**
- `Converters::LingoLinq.from_external` → `ButtonImage.process` / `upload_to_remote`
- Protected images: user may lack `enabled_protected_sources` for the image's `protected_source`
- Frontend: `process_for_displaying`, button image resolution in `app_state`

### Images are NOT in the OBZ (missing or path references broken)
→ **Problem is in export/download:**
- Export fetches images from `ButtonImage` URLs via `OBF::Utils.get_url`
- **Word Art images** (and webcam/file uploads): stored as data URIs only, no URL.
  - These are now exported by embedding `data` when `url` is blank (fixed in converters).
- Other failures can occur if:
  - Image URLs are inaccessible (auth, network, wrong host)
  - `Uploader.fronted_url` returns URLs the backend can't fetch
  - SVG/raster conversion fails (ImageMagick, etc.)

## OBZ structure reference

- **manifest.json**: `root` (main board path), `paths.images` (id → zip path)
- **board_&lt;id&gt;.obf**: JSON with `buttons` (each may have `image_id`), `images` array
- **images/image_&lt;id&gt;.&lt;ext&gt;**: Binary image files (png, jpg, etc.)

Each image in the board JSON should have either:
- `path`: relative path in zip (e.g. `images/image_1_123.png`) — content is in zip
- `data`: base64 data URI — embedded inline
- `url`: remote URL — fetch on import (less reliable for offline/import)
