# Epic Plan: Tech Debt and Security

**Status:** Not Started

## 1. Goals
- Upgrade the core application frameworks (Rails, Ember.js) to stable, supported versions.
- Eliminate all known security vulnerabilities in both frontend and backend dependencies.
- Improve application performance and maintainability by refactoring outdated code.

## 2. Scope
- **Framework Upgrades:**
    - Plan and execute a Rails version upgrade.
    - Evaluate and execute an Ember.js upgrade or a phased replacement strategy.
- **Dependency Management:**
    - Run `bundle audit` and `npm audit` to identify all vulnerabilities.
    - Update or replace all gems and npm packages with known vulnerabilities.
- **Security Hardening:**
    - Address all issues identified in the `docs/01-Security-Audit-Report.md`.
    - Implement stricter Content Security Policy (CSP).
- **Code Refactoring:**
    - Identify and refactor deprecated code patterns.
    - Improve test coverage for critical areas before and after upgrades.

## 3. Key Tasks (Initial)
- [ ] Analyze `bundle audit` report and prioritize critical gem updates.
- [ ] Analyze `npm audit` report and prioritize critical package updates.
- [ ] Develop a detailed plan for the Rails version upgrade.
- [ ] Research and document the options for the Ember.js modernization path.
