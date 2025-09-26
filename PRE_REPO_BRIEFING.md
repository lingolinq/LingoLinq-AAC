# LingoLinq AAC - Pre-Repository Briefing

## Project Classification
**Type:** Web-based AAC (Augmentative and Alternative Communication) application
**Domain:** Assistive technology for individuals with communication disabilities
**Scale:** Multi-tenant SaaS with offline capabilities
**Users:** 10k+ communicators, supervisors, organizations

## Technical Overview
**Architecture:** Rails API + Ember SPA + Progressive Web App
**Database:** PostgreSQL with Redis for caching/jobs
**Deployment:** Docker containers, AWS infrastructure
**Development:** AI-enhanced workflows (Claude Code + Gemini CLI)

## Core AAC Concepts You Need to Know
- **Communication Board:** Grid of buttons with symbols/text for expression
- **Augmentative Communication:** Technology that supplements speech
- **Switch Navigation:** Input method for users with limited mobility
- **Speech Synthesis:** Text-to-speech for button activation
- **Offline-First:** Must work without internet connectivity

## Current Technical State
**Rails:** 6.1.7 (security patched, upgrade to 7.0 planned)
**Ember:** 3.12 (modernization to 3.28 in progress)
**Security:** 93% vulnerability reduction completed
**Docker:** 95% functional (psych gem issue blocking)

## Active Development Branches
```
main                        # Production baseline
rails-6-to-7-upgrade       # Framework upgrade (6 weeks)
ember-3-12-to-3-28         # Frontend modernization (4 weeks)
epic/ai-features           # AI integration development
epic/tech-debt-security    # Security improvements
feature/llm-inflections    # Multi-language grammar
```

## Required Skills by Role

### Rails Backend Developer
**Must Have:** Ruby 2.7+, Rails 6+, PostgreSQL, JSON API design
**Should Have:** Resque background jobs, AWS S3 integration
**AAC Context:** User model complexity, board data relationships

### Ember Frontend Developer
**Must Have:** JavaScript ES6+, Ember 3+, accessibility patterns
**Should Have:** IndexedDB, Web Speech API, offline-first design
**AAC Context:** Communication board UI, switch navigation, speech synthesis

### Full-Stack Developer
**Must Have:** Rails + Ember integration, API design, data sync
**Should Have:** Progressive Web App concepts, offline data strategies
**AAC Context:** End-to-end communication workflows, multi-device sync

### DevOps/Infrastructure
**Must Have:** Docker, AWS services, CI/CD pipelines
**Should Have:** Heroku deployment, security scanning, monitoring
**AAC Context:** Reliability requirements for assistive technology

### QA/Testing
**Must Have:** RSpec, Ember testing, accessibility testing tools
**Should Have:** Screen reader testing, device compatibility testing
**AAC Context:** Communication workflow validation, accessibility compliance

## Development Environment Options

### Option 1: Docker (Recommended for New Developers)
**Pros:** Isolated, consistent, handles dependencies
**Cons:** Resource intensive, debugging complexity
**Setup Time:** 30 minutes
**Best For:** Windows developers, quick setup, avoiding dependency conflicts

### Option 2: Native Development
**Pros:** Direct access, faster development cycle, easier debugging
**Cons:** Dependency management, platform differences
**Setup Time:** 60-90 minutes
**Best For:** Experienced Rails/Ember developers, performance-sensitive work

### Option 3: AI-Enhanced Development
**Pros:** Context-aware assistance, automated documentation, intelligent code review
**Cons:** Learning curve for AI tools, requires setup
**Setup Time:** 45 minutes
**Best For:** Complex architecture work, learning the codebase quickly

## Known Blocking Issues

### Docker Environment (Affects 40% of team)
**Issue:** psych gem dependency prevents Rails server start
**Impact:** Cannot run full development environment in Docker
**Workaround:** Use `bundle exec` commands directly
**Timeline:** Fix in progress, 1-2 weeks estimated

### Security Vulnerabilities (Affects production)
**Rails:** 2 remaining CVEs requiring Rails 7.0 upgrade
**Frontend:** 175+ npm vulnerabilities need addressing
**Priority:** Rails upgrade branch active, frontend audit planned

### Performance (Affects user experience)
**Load Times:** Initial app load >3 seconds
**Bundle Size:** Ember app bundle needs optimization
**Offline Sync:** Occasional data conflicts during reconnection

## Pre-Repository Setup Requirements

### All Developers
1. **Docker Desktop** installed and running
2. **Git** configured with SSH keys for repository access
3. **Code Editor** with syntax highlighting for Ruby/JavaScript
4. **Terminal/Command Line** proficiency required

### Windows Developers (Additional)
1. **Git Bash** or **WSL2** for Unix-like commands
2. **PowerShell** execution policy configured for scripts
3. **Windows Terminal** recommended for better development experience

### AI Development (Optional but Recommended)
1. **Claude Code CLI** installed and configured
2. **Gemini CLI** access for codebase analysis
3. **Node.js** 16+ for MCP server functionality

## Security and Access Requirements

### Repository Access
- GitHub account with 2FA enabled
- SSH key configured for git operations
- Team invitation accepted and permissions verified

### Development Environment
- No production API keys in development
- Use `.env` file for local configuration
- Docker network isolation for services

### AAC Domain Compliance
- WCAG 2.1 AA accessibility standards
- HIPAA considerations for user data
- Assistive technology compatibility requirements

## Expected Productivity Timeline

### Week 1: Environment and Context
- Development environment fully functional
- Repository cloned and basic navigation
- AI tools configured and tested
- Core AAC concepts understood

### Week 2: Domain Knowledge
- Rails API structure understood
- Ember application architecture familiar
- Communication board data model clear
- Accessibility requirements known

### Week 3: Feature Development
- First bug fix or small feature completed
- Code review process familiar
- Testing workflow established
- Team integration complete

### Week 4: Independent Contribution
- Complex features can be tackled
- Architecture decisions can be made
- AAC domain expertise developing
- Mentoring newer team members possible

## Onboarding Success Metrics

### Technical Proficiency
- [ ] Can run full development environment
- [ ] Can execute test suites successfully
- [ ] Can use AI development tools effectively
- [ ] Can navigate codebase independently

### Domain Understanding
- [ ] Understands AAC communication workflows
- [ ] Recognizes accessibility requirements
- [ ] Knows offline-first design principles
- [ ] Familiar with assistive technology constraints

### Team Integration
- [ ] Participating in code reviews
- [ ] Contributing to architectural discussions
- [ ] Using team development workflows
- [ ] Escalating issues appropriately

## Questions to Ask During Onboarding

### Technical Architecture
- How does offline data sync work between Ember and Rails?
- What are the AAC-specific database relationships?
- How is speech synthesis implemented across devices?
- What accessibility patterns are used throughout the app?

### Development Workflow
- What is the branch strategy for different types of work?
- How do AI development tools integrate with daily workflow?
- What is the testing strategy for AAC-specific functionality?
- How are accessibility requirements validated?

### Domain Knowledge
- What are the primary user personas and their needs?
- How do communication boards differ from standard UI patterns?
- What assistive technologies must be supported?
- What compliance requirements affect development decisions?

## Next Steps After Repository Access
1. **Follow role-specific quick start** (`.ai/docs/TEAM_ONBOARDING_MATRIX.md`)
2. **Complete environment verification** checklist
3. **Schedule pairing session** with team lead
4. **Review current project status** (`PROJECT_STATUS.md`)
5. **Join team communication channels** and development workflows