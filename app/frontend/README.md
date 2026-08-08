# Ember frontend

This directory contains the Ember.js client for LingoLinq-AAC.

## Prerequisites

- Node.js 22, as specified by the repository's `.nvmrc`
- npm
- A running Rails backend for API-backed development

## Install

From the repository root:

```bash
cd app/frontend
npm install
```

## Run

```bash
cd app/frontend
npx ember serve
```

The development server normally runs on port 8184. The Rails application serves the compiled frontend assets in deployed environments.

## Test and lint

```bash
cd app/frontend
npx ember test
npm run lint:js
npm run lint:hbs
```

Use the smallest relevant test command while developing, then run the full affected suite before opening a pull request.

## Frontend conventions

- Use the existing i18n helpers for every user-facing string.
- Keep platform-specific behavior behind the capabilities layer.
- Preserve offline synchronization and packaged-app compatibility.
- Put user-facing changes behind feature flags when appropriate.
- See the repository root [README](../../README.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md) for shared setup and review conventions.
