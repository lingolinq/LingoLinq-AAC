# LingoLinq Renaming Plan (LingoLinq/LingoLinq to LingoLinq)

This plan is based on the analysis of the previous renaming commit (`76d23747f944d7a7ac1a4528c2c0f4568f9163a1`) and the suggested plan from Gemini. It outlines the steps to systematically replace "LingoLinq" and "LingoLinq" with "LingoLinq" throughout the codebase.

## Renaming Targets

| Old Name (Backend) | Old Name (Frontend/Display) | New Name | Context |
| :--- | :--- | :--- | :--- |
| `LingoLinq` | `LingoLinq` | `LingoLinq` | Main application name, module, and class names. |
| `lingolinq` | `aac-app` | `lingolinq` | Lowercase identifiers, file names, and configuration keys. |
| `LingoLinq` | `LingoLinq` | `LingoLinq` | Company name placeholder. |
| `lingolinq.com` | `lingolinq.com` | `lingolinq.com` | Default host and domain names. |

## 1. Preparation

1.  **Create a new git branch** for this renaming task to isolate the changes.
    ```bash
    git checkout -b feature/rename-to-lingolinq
    ```
2.  **Perform a global search** for the old names to confirm the scope before execution.
    ```bash
    grep -ri "LingoLinq" .
    grep -ri "LingoLinq" .
    grep -ri "myaacapp" .
    ```

## 2. Backend Renaming (Rails)

The primary backend identifier is `LingoLinq`.

1.  **Module and Class Renaming:**
    *   Search and replace `LingoLinq` with `LingoLinq` in all `.rb` files. This includes the main module definition in `config/application.rb` and any other references.
    *   Search and replace `LingoLinq` with `LingoLinq` in all `.rake` files.

2.  **Configuration Files:**
    *   **Database:** In `config/database.yml`, rename database names from `lingolinq-development` and `lingolinq-test` to `lingolinq-development` and `lingolinq-test`.
    *   **Session Store:** In `config/initializers/session_store.rb`, update the session key from `_sweet_suite_session` to `_lingolinq_session`.
    *   **Environment Variables (`.env.example`):**
        *   Update `DEFAULT_HOST` from `www.lingolinq.com` (or similar) to `www.lingolinq.com`.
        *   Update `DEFAULT_EMAIL_FROM` to use `LingoLinq <support@lingolinq.com>`.
        *   Update `CDWEBSOCKET_URL` from `https://ws.lingolinq.com/cable` to `https://ws.lingolinq.com/cable`.
        *   Update `window.default_app_name` and `window.defualt_company_name` placeholders in `app/assets/javascripts/globals.js.erb` to use `LingoLinq` as the default if environment variables are not set. (The previous commit used "LingoLinq" and "LingoLinq" as defaults).

3.  **Locale Files:**
    *   In `config/locales/en.yml` and other locale files, update all references to the application name.

## 3. Frontend Renaming (Ember)

The primary frontend identifier is `lingolinq` and the display name is "LingoLinq".

1.  **Ember App Configuration (The most critical part):**
    *   **`app/frontend/app/app.js`**:
        *   Rename the main application variable from `LingoLinq` to `LingoLinq`.
        *   Update the import from `import lingoLinqExtras from './utils/extras';` to `import lingolinqExtras from './utils/extras';`.
        *   Replace all references to `LingoLinq.track_error` with `LingoLinq.track_error`.
        *   Replace all references to `LingoLinq.testing` with `LingoLinq.testing`.
    *   **`app/frontend/config/environment.js`**:
        *   Update `modulePrefix` from `'lingolinq'` to `'lingolinq'`.
    *   **`app/frontend/ember-cli-build.js`**:
        *   Update asset paths from `/assets/lingolinq.css` to `/assets/lingolinq.css` and similar for `.js` files.
    *   **`app/frontend/app/index.html`**:
        *   Update `<title>` from "LingoLinq" (or similar) to "LingoLinq".
        *   Update the `id` of the main application element from `'lingolinq-app'` to `'lingolinq-app'`.

2.  **Codebase Strings & Templates:**
    *   Perform a case-insensitive search and replace for "LingoLinq" with "LingoLinq" in all `.js`, `.hbs`, and `.css` files.
    *   Perform a case-insensitive search and replace for "LingoLinq" with "LingoLinq" in all `.js`, `.hbs`, and `.css` files.
    *   Search and replace `lingolinq` with `lingolinq` in all frontend files.

## 4. General Files and Documentation

1.  **Documentation:**
    *   Review and update all `.md` files (`CHANGELOG.md`, `CODE_INVESTIGATION.md`, `TRANSLATIONS.md`, etc.) to replace "LingoLinq" and "LingoLinq" with "LingoLinq".
2.  **Public Files:**
    *   `public/manifest.json`: Update `"name"` and `"short_name"` to "LingoLinq".
    *   `public/locales/*.json`: Search and replace "LingoLinq" and "LingoLinq" with "LingoLinq".
3.  **CSS Comments:**
    *   Replace `/* LingoLinq added */` with `/* LingoLinq added */` in CSS files like `app/assets/stylesheets/jquery.minicolors.css.erb`.

## 5. Logo and Branding Asset Replacement

All CoughDrop AAC logos and branding assets need to be replaced with LingoLinq branding. The codebase contains logos in multiple formats and sizes for different platforms (web, iOS, Android, desktop).

### 5.1. Logo Asset Inventory

**Main Logo Files** (`public/images/`):
- `logo-big.png` - 200x200px PNG - Primary logo used throughout the application
- `logo-small.png` - 40x40px PNG - Small version for thumbnails and icons
- `logo-old.png` - 40x40px PNG - Legacy branding (can be deleted or replaced)
- `logo_white.svg` - 5.1 KB SVG - White version for light backgrounds

**App Icons** (`public/icons/`) - iOS home screen and app icons:
- `logo-60.png` - 60x60px PNG - Apple touch icon
- `logo-76.png` - 76x76px PNG - Apple touch icon for iPad
- `logo-120.png` - 120x120px PNG - Apple touch icon high-resolution
- `logo-152.png` - 152x152px PNG - Apple touch icon for iPad Retina

**Frontend Public Logo** (`app/frontend/public/`):
- `logo.png` - 40x40px PNG

**Favicon Files** (`public/`):
- `favicon.ico` - 26 KB ICO file with 4 icons (16x16, 32x32, 32-bit)
- `favicon-old.ico` - 4.2 KB ICO - Legacy favicon (can be deleted or replaced)

**Mascot/Character Assets** (`public/status/`):
- `cuttlefish-coughdrop.svg` - 16 KB SVG - Original CoughDrop cuttlefish mascot
- `cuttlefish-lingolinq.svg` - 16 KB SVG - Updated LingoLinq mascot (already updated)
- `logo-big.png` - Duplicate of main logo for status pages

**Symbol Library Integration Logos** (`public/images/`):
- `lessonpix-coughdrop.png` - 51 KB PNG - Integration logo for LessonPix
- `pcs-coughdrop.png` - 47 KB PNG - Integration logo for PCS symbols

### 5.2. Logo Replacement Strategy

#### Option A: Using AI Tools (Recommended for VS Code Codespaces)

Since you're using Claude Code and Gemini CLI in VS Code Codespaces, you can:

1. **Generate new LingoLinq logo variations** using AI image generation tools:
   - Use Gemini or other AI tools to create logo variations in different sizes
   - Ensure brand consistency across all sizes
   - Create both color and white versions

2. **Automate batch resizing** using ImageMagick (already installed in the environment):
   ```bash
   # Resize a master logo to different sizes
   convert logo-master.png -resize 200x200 public/images/logo-big.png
   convert logo-master.png -resize 40x40 public/images/logo-small.png
   convert logo-master.png -resize 60x60 public/icons/logo-60.png
   convert logo-master.png -resize 76x76 public/icons/logo-76.png
   convert logo-master.png -resize 120x120 public/icons/logo-120.png
   convert logo-master.png -resize 152x152 public/icons/logo-152.png
   convert logo-master.png -resize 40x40 app/frontend/public/logo.png
   ```

3. **Create favicon** from master logo:
   ```bash
   # Create multi-size favicon.ico
   convert logo-master.png -resize 16x16 favicon-16.png
   convert logo-master.png -resize 32x32 favicon-32.png
   convert favicon-16.png favicon-32.png public/favicon.ico
   ```

#### Option B: Manual Design and Replacement

1. **Design or obtain LingoLinq logos** in the following specifications:
   - Master logo: High-resolution PNG (at least 512x512px) or vector SVG
   - Color scheme: Define LingoLinq brand colors
   - White version: SVG or PNG with transparent background

2. **Create all required sizes** using a design tool (Figma, Sketch, Photoshop, etc.)

### 5.3. Step-by-Step Replacement Instructions

1. **Prepare New Logo Assets:**
   - Place your master LingoLinq logo in a temporary directory
   - Create all required sizes using ImageMagick or design tools
   - Ensure all logos are optimized for web (compressed but high quality)

2. **Replace Main Logos:**
   ```bash
   # Backup existing logos first
   mkdir -p backup/logos
   cp public/images/logo-*.png backup/logos/
   cp public/images/logo_white.svg backup/logos/

   # Replace with new LingoLinq logos
   cp /path/to/new/logo-big.png public/images/logo-big.png
   cp /path/to/new/logo-small.png public/images/logo-small.png
   cp /path/to/new/logo-white.svg public/images/logo_white.svg
   ```

3. **Replace App Icons:**
   ```bash
   # Backup existing icons
   cp public/icons/logo-*.png backup/logos/icons/

   # Replace with new LingoLinq icons
   cp /path/to/new/logo-60.png public/icons/logo-60.png
   cp /path/to/new/logo-76.png public/icons/logo-76.png
   cp /path/to/new/logo-120.png public/icons/logo-120.png
   cp /path/to/new/logo-152.png public/icons/logo-152.png
   ```

4. **Replace Frontend Logo:**
   ```bash
   cp /path/to/new/logo-40.png app/frontend/public/logo.png
   ```

5. **Replace Favicon:**
   ```bash
   cp public/favicon.ico backup/logos/
   cp /path/to/new/favicon.ico public/favicon.ico
   ```

6. **Update Status Page Logo:**
   ```bash
   cp /path/to/new/logo-big.png public/status/logo-big.png
   ```

7. **Handle Mascot Assets:**
   - **Option A:** Keep the existing `cuttlefish-lingolinq.svg` if the mascot design works for LingoLinq
   - **Option B:** Update the mascot SVG with new branding:
     ```bash
     # Edit cuttlefish-lingolinq.svg to update colors, text, or design
     # The SVG is used in error pages and maintenance pages
     ```
   - **Cleanup:** Delete or archive the old CoughDrop mascot:
     ```bash
     rm public/status/cuttlefish-coughdrop.svg
     # or move to backup
     mv public/status/cuttlefish-coughdrop.svg backup/logos/
     ```

8. **Update Symbol Library Integration Logos:**
   - Create new integration logos showing LingoLinq + partner branding:
     ```bash
     # Backup old logos
     cp public/images/lessonpix-coughdrop.png backup/logos/
     cp public/images/pcs-coughdrop.png backup/logos/

     # Replace with LingoLinq versions
     cp /path/to/new/lessonpix-lingolinq.png public/images/lessonpix-lingolinq.png
     cp /path/to/new/pcs-lingolinq.png public/images/pcs-lingolinq.png

     # Delete old files
     rm public/images/lessonpix-coughdrop.png
     rm public/images/pcs-coughdrop.png
     ```
   - Update code references (if any) from `*-coughdrop.png` to `*-lingolinq.png`

9. **Clean Up Legacy Files:**
   ```bash
   # Remove or archive old logo files
   rm public/images/logo-old.png
   rm public/favicon-old.ico
   # or move to backup directory
   ```

### 5.4. Code Reference Updates

After replacing logo files, verify that no hardcoded references need updating:

1. **Check domain-specific logo URLs** in these files:
   - `app/views/layouts/application.html.erb` (lines 63-66) - Apple touch icon URLs
   - `app/frontend/app/utils/capabilities.js` (line 1004) - Social sharing logo URL
   - Both currently reference `mylingolinq.com` domain - update to `lingolinq.com` if needed

2. **Verify logo fallback paths** remain correct:
   - `/images/logo-big.png` - used throughout templates
   - `/images/logo-small.png` - cached in routes.rb
   - `cuttlefish-lingolinq.svg` - used in error pages

3. **Update template references** if filenames changed:
   - Search for any hardcoded references to old logo filenames
   - Update integration logo references if renamed (lessonpix/pcs)

### 5.5. Logo Optimization

After replacing logos, optimize them for web performance:

```bash
# Install optimization tools (if not already available)
npm install -g pngquant imageoptim-cli

# Optimize PNG files
pngquant --quality=65-80 public/images/logo-big.png --output public/images/logo-big.png --force
pngquant --quality=65-80 public/images/logo-small.png --output public/images/logo-small.png --force
pngquant --quality=65-80 public/icons/logo-*.png --ext .png --force

# Or use ImageMagick for batch optimization
for file in public/images/logo-*.png public/icons/logo-*.png; do
  convert "$file" -strip -quality 85% "$file"
done
```

### 5.6. Logo Verification Checklist

- [ ] All logo files replaced with LingoLinq branding
- [ ] Logo sizes match specifications (200x200, 40x40, 60x60, etc.)
- [ ] Logos are optimized for web (compressed, reasonable file sizes)
- [ ] Favicon displays correctly in browser tabs
- [ ] Apple touch icons work on iOS devices
- [ ] White logo version has transparent background
- [ ] Mascot SVG updated or kept as appropriate
- [ ] Symbol library integration logos updated
- [ ] Legacy/old logo files removed or archived
- [ ] All code references point to correct file paths
- [ ] Test the application visually to ensure logos appear correctly
- [ ] Check error pages (404, 500) display correct logos and mascot
- [ ] Check maintenance page displays correct branding

## 6. Verification

1.  **Run Tests (if possible):** Run the test suites for both Rails and Ember to catch any breaking changes.
2.  **Manual Inspection:** Perform a final global search for the old names to ensure no critical instances were missed.
3.  **Commit:** Commit the changes with a clear message.
    ```bash
    git add .
    git commit -m "feat: Rename LingoLinq/LingoLinq to LingoLinq"
    ```
