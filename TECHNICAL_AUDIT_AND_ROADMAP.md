# LingoLinq AAC: Technical Audit and Strategic Roadmap

**Document Version:** 1.0
**Date:** 2025-08-04

## 1. Executive Summary

This document provides a comprehensive technical audit of the LingoLinq AAC application and outlines a strategic roadmap for its modernization and future development. The application is a complex, dual-framework system with a Ruby on Rails backend and an Ember.js frontend.

The immediate priority is to address significant technical debt, modernize the frontend, and resolve security vulnerabilities before embarking on new feature development. This roadmap is designed to be shared with third-party developers to provide clear scope and requirements for quotes and timelines.

## 2. Current Technology Stack

This audit is based on the **current, verified** application stack.

### Backend
- **Framework:** Ruby on Rails 6.1.0
- **Language:** Ruby 3.2.8
- **Database:** PostgreSQL
- **Background Jobs:** Resque with Redis
- **Key Dependencies:**
    - `devise` (Authentication)
    - `pundit` (Authorization)
    - `paper_trail` (Auditing)
    - `pg_search` (Search)
    - `aws-sdk` (AWS Integration)

### Frontend
- **Framework:** Ember.js (version appears to be ~3.x era, needs confirmation)
- **Language:** JavaScript (ES5/ES6)
- **Package Management:** npm & Bower (Bower is deprecated)
- **Key Dependencies:**
    - `ember-cli`
    - `jquery` (Legacy dependency)
    - Numerous `ember-` addons for specific functionality.

### Infrastructure
- **Containerization:** Docker (recently added, configuration in progress)
- **Deployment:** Assumed Heroku, with configurations for multi-platform releases (Web, Mobile, Desktop).

## 3. High-Level Technical Assessment

### Strengths
- **Mature Codebase:** The application is feature-rich with a solid foundation.
- **Rails 6.1:** The backend is on a relatively modern and stable version of Rails.
- **Docker Integration:** The recent addition of Docker is a major step towards environment consistency.
- **API-First Design:** The separation between the Rails API and Ember frontend is a good architectural pattern.

### Critical Challenges
1.  **Frontend Modernization (Highest Priority):** The Ember.js frontend is the largest source of technical debt. It uses the deprecated `bower` package manager and likely relies on outdated Ember patterns and vulnerable dependencies. This is a significant blocker to UI/UX improvements and future feature development.
2.  **Security Vulnerabilities:** Both backend (`bundle audit`) and frontend (`npm audit`) have numerous known vulnerabilities that must be addressed.
3.  **Branding and Codebase Inconsistency:** The codebase contains a mix of "CoughDrop," "SweetSuite," and "LingoLinq" branding, which creates confusion and maintenance overhead.
4.  **Testing Gaps:** While tests exist, coverage is likely inconsistent, especially for the frontend. Upgrades and refactoring will be risky without improving test coverage.

## 4. Strategic Roadmap

This roadmap is broken down into three parallel "epics" of work. This allows for concurrent development streams.

### Epic 1: Rebranding and UX/UI Modernization
- **Goal:** Create a consistent, modern, and accessible user experience under the LingoLinq brand.
- **Key Initiatives:**
    1.  **Full Rebranding:** Systematically remove all legacy "CoughDrop" and "SweetSuite" branding from user-facing views, assets, and documentation.
    2.  **Design System Implementation:** Establish a new design system (colors, typography, spacing) and implement it across the application.
    3.  **Component Refactoring:** Refactor core UI components (navigation, buttons, forms, modals) to align with the new design system.
    4.  **Accessibility Audit:** Perform and address findings from a WCAG 2.1 AA accessibility audit.

### Epic 2: Tech Debt and Security
- **Goal:** Stabilize the application, eliminate security risks, and modernize the underlying frameworks to ensure long-term maintainability.
- **Key Initiatives:**
    1.  **Frontend Modernization Strategy:**
        *   **Option A (Upgrade):** Plan and execute a multi-step upgrade of Ember.js to the latest version. This involves removing Bower, updating Ember CLI, and refactoring deprecated code.
        *   **Option B (Phased Replacement):** Begin replacing sections of the Ember.js app with a more modern framework (e.g., React, Vue) piece by piece. This is a longer-term strategy.
        *   **Decision on this strategy is the #1 priority for this epic.**
    2.  **Dependency Remediation:**
        *   Execute `npm audit fix --force` and `bundle audit` and manually resolve all critical and high vulnerabilities.
    3.  **Improve Test Coverage:** Increase RSpec and Ember test coverage to at least 80% for critical models, controllers, and components before and during major refactoring.
    4.  **Rails 7 Upgrade (Future):** Plan for a future upgrade to Rails 7 after the frontend is stabilized.

### Epic 3: AI Feature Integration
- **Goal:** Leverage AI to create innovative and powerful new capabilities for users.
- **Key Initiatives:**
    1.  **AI Service Layer:** Architect and build a generic service layer in the Rails backend to handle communication with external AI APIs (e.g., OpenAI, Anthropic).
    2.  **Proof-of-Concept: Predictive Text:** Implement a real-time, AI-powered text prediction feature as the first AI module.
    3.  **Proof-of-Concept: Image Generation:** Implement a feature allowing users to generate custom symbols for their communication boards using a text-to-image model.
    4.  **Feature Flagging:** Ensure all new AI features are developed behind feature flags to allow for controlled rollouts.

## 5. Next Steps & How to Quote

Third-party developers should use this document to provide quotes and timelines. We recommend providing separate quotes for:
1.  **Epic 1 (Rebranding/UX):** A fixed bid or time-and-materials estimate for the full rebranding and UI component refactoring.
2.  **Epic 2 (Tech Debt):**
    *   A small, initial quote for a **discovery phase** to determine the best Ember.js modernization strategy (Option A vs. B).
    *   A subsequent, larger quote to execute the chosen strategy.
3.  **Epic 3 (AI Features):** A separate quote for each proof-of-concept feature (Predictive Text, Image Generation).

This approach allows us to tackle our technical debt while simultaneously making progress on the user-facing product and future innovations.
