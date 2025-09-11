# Branch Assignment Strategy for New Development Team

## Overview
This document outlines how branches are organized for team assignment and provides clear ownership boundaries to prevent conflicts during parallel development.

## Branch Categories & Team Assignment

### 🏗️ **Core Infrastructure (Senior Developers)**

#### **ember-3-12-to-3-28-upgrade** 
- **Priority:** High
- **Team Size:** 2-3 senior developers
- **Scope:** Frontend modernization + security fixes
- **Dependencies:** Must complete before other frontend features
- **AI Tools:** General-purpose agents, security analysis tools
- **Security:** Owns resolution of 172 npm vulnerabilities
- **Timeline:** 6-8 weeks

#### **rails-6-to-7-upgrade**
- **Priority:** High  
- **Team Size:** 2-3 senior developers
- **Scope:** Backend modernization + performance improvements
- **Dependencies:** Can run parallel to Ember upgrade
- **AI Tools:** Rails-specific agents, performance monitoring
- **Security:** Ruby dependencies already secured via Gemfile.lock
- **Timeline:** 6-8 weeks

### 🎯 **High-Value Features (Mid-Level Developers)**

#### **epic/ai-features**
- **Priority:** High
- **Team Size:** 2-3 developers
- **Scope:** LLM integration, enhanced user experience
- **Dependencies:** None (can start immediately)
- **AI Tools:** AI-focused agents, token optimization tools
- **Special Notes:** Critical for competitive advantage
- **Timeline:** 4-6 weeks

#### **feature/print-performance-optimization**
- **Priority:** Medium-High
- **Team Size:** 1-2 developers
- **Scope:** PDF generation performance improvements
- **Dependencies:** None (isolated feature)
- **AI Tools:** Performance testing agents
- **Documentation:** Comprehensive optimization plan available
- **Timeline:** 2-3 weeks

#### **feature/website-translation-widget**
- **Priority:** High (Accessibility)
- **Team Size:** 1-2 developers
- **Scope:** International language support for AAC users
- **Dependencies:** None (preserved during cleanup)
- **AI Tools:** I18n-focused agents
- **Special Notes:** Critical for accessibility mission
- **Timeline:** 3-4 weeks

### 🔧 **Technical Improvements (Junior-Mid Developers)**

#### **epic/tech-debt-and-security**
- **Priority:** Medium
- **Team Size:** 1-2 developers
- **Scope:** Code quality, technical debt reduction
- **Dependencies:** Should coordinate with both upgrade branches
- **AI Tools:** Code quality agents, security scanners
- **Coordination:** Works with security fixes from Ember upgrade
- **Timeline:** Ongoing (3-week sprints)

#### **feature/llm-enhanced-inflections**
- **Priority:** Medium
- **Team Size:** 1 developer
- **Scope:** Improved grammar handling with AI
- **Dependencies:** None (standalone feature)
- **AI Tools:** LLM-specific agents
- **Timeline:** 2-3 weeks

#### **epic/rebranding-and-ux-ui**
- **Priority:** Medium
- **Team Size:** 1-2 developers (UI/UX focus)
- **Scope:** Visual redesign and user experience improvements
- **Dependencies:** Should coordinate with Ember upgrade for styling
- **AI Tools:** Design system agents
- **Timeline:** 4-5 weeks

### 🧪 **Experimental/Optional**

#### **feature/token-optimization-mcp**
- **Priority:** Low (Optimization)
- **Team Size:** 1 developer (part-time)
- **Scope:** AI token usage optimization
- **Dependencies:** None
- **AI Tools:** Specialized MCP agents
- **Timeline:** 1-2 weeks

#### **feature/sso-google-workspace-integration** (Local only)
- **Status:** Needs evaluation
- **Priority:** TBD
- **Notes:** Local branch, needs remote push and scope definition

## Branch Cleanup Actions

### ✅ **Completed Cleanup**
- ✅ Deleted `devin/1753718322-updates` (auto-generated)
- ✅ Archived `test/workflow-validation` 
- ✅ Archived `workflow-testing-dry-run`

### 🔍 **Needs Review**
- **test/repo-reorganization:** Evaluate completion status, archive if done

## Team Assignment Recommendations

### **Phase 1: Foundation (Weeks 1-8)**
**Priority:** Infrastructure upgrades
- **Team A:** ember-3-12-to-3-28-upgrade + security fixes
- **Team B:** rails-6-to-7-upgrade
- **Team C:** epic/ai-features (independent)

### **Phase 2: Feature Development (Weeks 6-12)**
**Priority:** High-value features (can overlap with Phase 1)
- **Team D:** feature/website-translation-widget
- **Team E:** feature/print-performance-optimization
- **Team F:** epic/rebranding-and-ux-ui

### **Phase 3: Enhancement (Weeks 10-16)**
**Priority:** Quality and optimization
- **Team G:** epic/tech-debt-and-security
- **Team H:** feature/llm-enhanced-inflections
- **Team I:** feature/token-optimization-mcp

## Coordination Guidelines

### **Cross-Team Dependencies**
1. **Ember → Frontend Features:** Rebranding/UX should coordinate with Ember upgrade
2. **Security → Tech Debt:** Security fixes from Ember team inform tech debt priorities
3. **AI Features → Token Optimization:** Coordinate to avoid duplicate work

### **Communication Protocols**
- **Daily Standups:** Team leads coordinate dependencies
- **Weekly Architecture Review:** Senior developers align on technical decisions
- **Bi-weekly Demo:** Teams showcase progress and identify integration points

### **Branch Protection Rules**
- **main:** Requires PR approval from 2 senior developers
- **Infrastructure branches:** Requires architecture team review
- **Feature branches:** Requires 1 approval + passing tests
- **Epic branches:** Requires epic owner approval

## AI Tool Assignment Strategy

### **Specialized by Domain**
- **Ember Team:** Frontend-focused agents, security analysis tools
- **Rails Team:** Backend agents, performance monitoring tools
- **AI Features Team:** LLM agents, token optimization tools
- **Print Team:** Performance testing agents
- **Translation Team:** I18n and accessibility agents

### **Shared Resources**
- **General-purpose agents:** Available to all teams
- **Security scanners:** Shared across infrastructure teams
- **Documentation agents:** Available for all documentation tasks

## Success Metrics by Branch

### **Infrastructure Branches**
- Zero build failures after modernization
- Security vulnerabilities < 10 (down from 172)
- Performance benchmarks maintained or improved

### **Feature Branches**
- User acceptance criteria met
- No regression in existing functionality
- Integration tests passing

### **Epic Branches**
- Strategic objectives achieved
- Technical debt reduced (measurable)
- User experience improvements validated

## Getting Started for New Team Members

1. **Read:** GETTING_STARTED.md, TEAM_ONBOARDING.md
2. **Setup:** Docker environment using existing stable containers
3. **Branch Assignment:** Coordinate with project lead
4. **AI Tools:** Review .ai/tools/ directory for branch-specific agents
5. **First Task:** Implement small fix to familiarize with codebase and tools

## Docker Environment Strategy

- **Main:** Stable baseline for all teams
- **Infrastructure branches:** May modify Docker setup (coordinate changes)
- **Feature branches:** Use existing Docker environment
- **Testing:** Always test in Docker before merging to main