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

## 5. Verification

1.  **Run Tests (if possible):** Run the test suites for both Rails and Ember to catch any breaking changes.
2.  **Manual Inspection:** Perform a final global search for the old names to ensure no critical instances were missed.
3.  **Commit:** Commit the changes with a clear message.
    ```bash
    git add .
    git commit -m "feat: Rename LingoLinq/LingoLinq to LingoLinq"
    ```
