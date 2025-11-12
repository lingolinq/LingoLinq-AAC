# LingoLinq Renaming Plan

This document outlines the steps to rename all instances of "LingoLinq" and "LingoLinq" to "LingoLinq" throughout the codebase. The new website URL will be `LingoLinq.com`.

## 1. Preparation

-   [ ] Create a new git branch for this renaming task to isolate the changes.
    ```bash
    git checkout -b feature/rename-to-lingolinq
    ```
-   [ ] Perform a global, case-insensitive search for "LingoLinq" and "LingoLinq" to understand the scope of changes.
    ```bash
    grep -ri "lingolinq" .
    grep -ri "aac app" .
    ```

## 2. Backend Renaming (Rails)

-   [ ] **Module Renaming:**
    -   In `config/application.rb`, rename `module LingoLinq` to `module LingoLinq`.
    -   Search for `module LingoLinq` in other `.rb` files and replace with `module LingoLinq`.

-   [ ] **Configuration Files:**
    -   `config/database.yml`: Rename databases from `lingolinq-development` and `lingolinq-test` to `lingolinq-development` and `lingolinq-test`.
    -   `config/initializers/session_store.rb`: Update the session key from `_sweet_suite_session` to `_lingolinq_session`.
    -   `config/environments/*.rb`: Replace any occurrences of `lingolinq.test` or similar hostnames with `lingolinq.test`.
    -   `.env.example`: Update `DEFAULT_HOST` to `www.lingolinq.com`, `DEFAULT_EMAIL` to `support@lingolinq.com`, and any other relevant variables.

-   [ ] **Codebase Strings & Identifiers:**
    -   Perform a case-sensitive search and replace for "LingoLinq" to "LingoLinq" in all `.rb` files.
    -   Perform a case-sensitive search and replace for "LingoLinq" to "LingoLinq" in all `.rb` files.

-   [ ] **Locale Files:**
    -   `config/locales/en.yml`: Update app name and other references.
    -   `public/locales/*.json`: Search and replace "LingoLinq" and "LingoLinq" with "LingoLinq".

## 3. Frontend Renaming (Ember)

-   [ ] **Ember App Configuration:**
    -   `app/frontend/app/app.js`:
        -   Update `modulePrefix` from `'lingolinq'` to `'lingolinq'`.
        -   Update `rootElement` from `'#lingolinq-app'` to `'#lingolinq-app'`.
        -   Update `loadInitializers(App, 'lingolinq')` to `loadInitializers(App, 'lingolinq')`.
    -   `app/frontend/app/index.html`:
        -   Update `<title>` from "LingoLinq" to "LingoLinq".
        -   Update `<body id="lingolinq-app">` to `<body id="lingolinq-app">`.
    -   `app/frontend/app/router.js`: Update `location` from `'lingolinq-history'` to `'lingolinq-history'`.
    -   `app/frontend/config/environment.js`: Update `modulePrefix` from `'lingolinq'` to `'lingolinq'`.
    -   `app/frontend/ember-cli-build.js`: Update asset paths from `/assets/lingolinq.css` to `/assets/lingolinq.css` and similar for `.js` files.

-   [ ] **Codebase Strings & Templates:**
    -   Perform a search and replace for "LingoLinq" and "LingoLinq" in all `.js` and `.hbs` files.

## 4. General Files

-   [ ] **Documentation:**
    -   Review and update all `.md` files (`CHANGELOG.md`, `CODE_INVESTIGATION.md`, `TRANSLATIONS.md`, etc.) to replace "LingoLinq" and "LingoLinq" with "LingoLinq".

-   [ ] **Public Files:**
    -   `public/manifest.json`: Update `"name"` and `"short_name"` to "LingoLinq".
    -   Review any other files in `public/` for instances of the old names.

## 5. Verification

-   [ ] **Backend:**
    -   Run the Rails test suite: `bundle exec rspec`
    -   Run the Rails database migrations: `rails db:migrate`
    -   Start the Rails server.

-   [ ] **Frontend:**
    -   Run the Ember test suite: `cd app/frontend && ember test`
    -   Run the Ember linter: `cd app/frontend && npm run lint`
    -   Build the Ember app: `cd app/frontend && ember build --environment production`

-   [ ] **Manual Testing:**
    -   Start the full application (`foreman start` or `heroku local`).
    -   Open the application in a browser and perform a manual smoke test to ensure all basic functionality is working as expected.

## 6. Commit

-   [ ] Once all steps are complete and verification has passed, commit the changes.
    ```bash
    git add .
    git commit -m "feat: Rename LingoLinq to LingoLinq"
    ```
