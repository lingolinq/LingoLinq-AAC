# Rails 6.1.7 → 7.x Upgrade Roadmap

## 1. Overview

This document outlines the strategic plan for upgrading the LingoLinq-AAC platform's backend from Ruby on Rails 6.1.7 to a modern, stable version of Rails 7.x. This upgrade is critical for performance, security, and long-term maintainability.

**Project Goal:** Successfully migrate the entire Rails application to version 7.x with minimal downtime, ensuring all AAC-specific functionalities remain fully operational and performant.

**Timeline:** 6-week implementation plan.

---

## 2. Key Phases & Timeline

### Week 1: Preparation & Dependency Analysis
- **[ ] Task 1.1:** Establish a security baseline. Run a full security audit (e.g., `brakeman`, `bundle-audit`) on the current Rails 6.1.7 installation.
- **[ ] Task 1.2:** Create a dedicated `rails-7-upgrade-validation` branch off of `rails-6-to-7-upgrade`.
- **[ ] Task 1.3:** Update `Gemfile` to target Rails 7.x. Run `bundle update` and begin identifying dependency conflicts.
- **[ ] Task 1.4:** **Critical Dependency Analysis:** Pay special attention to custom AAC gems (`obf`, `accessible-books`, `permissable-coughdrop`). Investigate and document necessary updates for compatibility with Rails 7.

### Week 2-3: Initial Migration & Testing
- **[ ] Task 2.1:** Run the Rails 7 upgrade task: `rails app:update`.
- **[ ] Task 2.2:** Address configuration changes and resolve initial boot errors.
- **[ ] Task 2.3:** Begin executing the existing test suite. Document all failures and categorize them (e.g., "Deprecation," "Breaking Change," "Dependency Issue").
- **[ ] Task 2.4:** **AAC Workflow Testing:** Manually test critical user paths related to communication board functionality, speech synthesis, and content loading.

### Week 4: Refactoring & Bug Fixes
- **[ ] Task 4.1:** Systematically work through the test failures identified in Week 2-3.
- **[ ] Task 4.2:** Refactor code to address Rails 7 deprecations and adopt new framework conventions (e.g., replace `byebug` with `debug`, update controller concerns).
- **[ ] Task 4.3:** Address any issues found during manual AAC workflow testing.

### Week 5: Performance & Integration Testing
- **[ ] Task 5.1:** **Performance Benchmarking:** Conduct performance tests on key endpoints (e.g., board loading, user authentication) to compare against the Rails 6 baseline.
- **[ ] Task 5.2:** Deploy the upgraded application to a staging environment that mirrors production.
- **[ ] Task 5.3:** Conduct thorough end-to-end testing in staging, involving QA and key stakeholders if possible.

### Week 6: Production Deployment
- **[ ] Task 6.1:** Finalize the production deployment plan.
- **[ ] Task 6.2:** **Blue-Green Deployment:** Execute a blue-green deployment strategy to minimize downtime and allow for instant rollback.
- **[ ] Task 6.3:** **Rollback Procedure:** Have the documented rollback procedure on standby.
- **[ ] Task 6.4:** Monitor application performance and error rates closely post-deployment.

---

## 3. Risk Mitigation & Rollback

- **Risk:** Critical AAC functionality breaks post-deployment.
  - **Mitigation:** Comprehensive manual and automated testing of AAC workflows (Task 2.4, 4.3).
- **Risk:** Performance degradation.
  - **Mitigation:** Rigorous performance benchmarking before and after the upgrade (Task 5.1).
- **Risk:** Unforeseen production issues.
  - **Mitigation:** Use of a blue-green deployment strategy allows for immediate rollback to the stable Rails 6.1.7 environment. The rollback procedure will be documented and tested.
