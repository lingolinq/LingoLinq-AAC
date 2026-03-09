# LingoLinq Code Review Style Guide

## About This Project

LingoLinq is an AI-first AAC (Augmentative and Alternative Communication) SaaS
platform used by US school districts, hospitals, and European clients. It is a
Rails 7.23 backend with an Ember 3.28 frontend, deployed on Render.

## Compliance (flag violations immediately)

- FERPA, HIPAA, and GDPR compliance is required for all data handling
- AI APIs must NEVER receive user-identifiable data (PII). Flag any code that
  sends user names, emails, student IDs, health data, or session content to
  external AI services without scrubbing
- No hardcoded secrets, tokens, API keys, or credentials in source code
- Data isolation between school district accounts is mandatory. Flag any queries
  that could leak data across organizations

## Security

- Flag missing authorization checks in controllers
- Flag SQL injection risks (raw SQL with string interpolation)
- Flag mass assignment vulnerabilities (unpermitted params)
- Flag XSS risks in Ember templates (unescaped user input)
- Authentication tokens must never be logged or exposed in error messages

## Backend (Rails)

- Flag N+1 queries. Suggest `includes` or `preload` where appropriate
- Prefer service objects over fat models or controller logic
- ActiveRecord callbacks should be used sparingly
- Background jobs (Sidekiq) for anything that takes more than 200ms
- Use strong parameters in all controllers
- All new endpoints must have corresponding RSpec tests

## Frontend (Ember)

- Ember frontend requires Node 18. Flag any Node 20+ specific APIs in frontend code
- Prefer tracked properties and computed macros over observers
- Flag any use of jQuery or direct DOM manipulation
- Flag Ember deprecation warnings (sendAction, Ember.run, etc.)
- Components should not directly modify passed-in data (DDAU pattern)

## Code Style

- User-facing strings: double quotes. All other strings: single quotes
- All user-facing text must use i18n helpers for localization
- Commit messages follow conventional commits format: `type: short description`
- Keep methods under 20 lines where possible. Flag methods over 40 lines
- Flag commented-out code blocks. Dead code should be removed, not commented

## AAC-Specific Concerns

- New features MUST have feature flags. AAC users (often children or people with
  disabilities) are sensitive to UI changes. Sudden changes can disrupt communication
- Board rendering performance is critical. Flag expensive operations in rendering
  paths (deep object copies, synchronous API calls, large DOM manipulations)
- Accessibility is mandatory. Flag missing ARIA attributes, missing alt text,
  insufficient color contrast, and non-keyboard-accessible interactions
- Symbol/image loading must handle offline gracefully. Flag network-dependent
  rendering without fallbacks

## What NOT to Flag

- Do not suggest adding TypeScript. This is a JavaScript project
- Do not suggest switching from Ember to React or other frameworks
- Do not flag the use of Ember classic components (migration is in progress)
- Do not suggest upgrading Node versions in frontend code (Node 18 is required)
