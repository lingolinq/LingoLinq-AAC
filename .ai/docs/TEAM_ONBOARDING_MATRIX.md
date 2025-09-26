# Team Onboarding Matrix - LingoLinq AAC

## Developer Role Classification

### Rails Backend Developer
**Skills:** Ruby, Rails, PostgreSQL, API design
**Primary Work:** Models, controllers, API endpoints, database schema

### Ember Frontend Developer
**Skills:** JavaScript, Ember.js, HTML/CSS, accessibility
**Primary Work:** Components, routes, templates, AAC UI/UX

### Full-Stack Developer
**Skills:** Rails + Ember, system integration
**Primary Work:** End-to-end features, API integration, performance

### DevOps/Infrastructure
**Skills:** Docker, deployment, CI/CD, monitoring
**Primary Work:** Development environment, deployment pipelines, performance

### AAC Specialist
**Skills:** Accessibility, communication devices, AAC workflows
**Primary Work:** User experience, accessibility compliance, AAC feature design

### QA/Testing Specialist
**Skills:** Testing frameworks, accessibility testing, AAC device testing
**Primary Work:** Test automation, regression testing, accessibility validation

---

## Pre-Repo Information Package

### Project Overview
- **Product:** Web-based AAC (Augmentative and Alternative Communication) application
- **Architecture:** Rails 6.1 backend + Ember 3.12 frontend
- **Users:** Individuals with communication disabilities, supervisors, organizations
- **Core Features:** Communication boards, speech synthesis, offline sync, usage tracking

### Technical Stack
- **Backend:** Ruby 2.7, Rails 6.1, PostgreSQL, Redis, Resque
- **Frontend:** Ember 3.12, JavaScript ES6+, SCSS, Web Speech API
- **Infrastructure:** Docker, AWS services (S3, SES, SNS), Heroku
- **Development:** AI-assisted development (Claude Code + MCP, Gemini CLI)

### Current Branch Strategy
```
main                          # Production-ready code
├── rails-6-to-7-upgrade     # Rails framework upgrade (6 weeks)
├── ember-3-12-to-3-28       # Ember modernization (4 weeks)
├── epic/ai-features         # AI integration strategy
├── epic/tech-debt-security  # Security improvements
├── epic/rebranding-ux-ui    # UI/UX modernization
├── feature/sso-integration  # SSO implementation (completed)
├── feature/llm-inflections  # Multi-language grammar
└── test/repo-reorganization # Testing environment
```

### Development Environment Options
1. **Docker (Recommended):** Full containerized environment
2. **Native:** Traditional Rails + Ember setup
3. **AI-Enhanced:** Claude Code + Gemini CLI integration

---

## Role-Based Quick Start (15 Minutes Each)

### Rails Backend Developer

**Priority 1: Environment Setup**
```bash
git clone <repo-url>
cd LingoLinq-AAC
docker-compose up -d
docker-compose exec backend rails db:create db:migrate
```

**Priority 2: Key Files to Review**
- `app/models/` - Core AAC models (User, Board, Button)
- `app/controllers/api/` - JSON API endpoints
- `config/routes.rb` - API routing structure
- `db/schema.rb` - Current database structure

**Priority 3: AI Development Setup**
```bash
claude --mcp-config ".ai/tools/deepwiki-mcp/claude-mcp-config.json"
# Ask: "Explain the Rails API structure and key models"
```

**Critical Understanding:**
- AAC board data structure and relationships
- User authentication and authorization model
- API versioning and JSON API compliance
- Background job processing with Resque

### Ember Frontend Developer

**Priority 1: Environment Setup**
```bash
git clone <repo-url>
cd LingoLinq-AAC/app/frontend
npm install
ember serve
```

**Priority 2: Key Files to Review**
- `app/frontend/app/router.js` - Route structure
- `app/frontend/app/controllers/board/` - Board interaction logic
- `app/frontend/app/utils/` - Core utilities (persistence, speech, etc.)
- `app/frontend/app/components/` - Reusable components

**Priority 3: AI Development Setup**
```bash
gemini --all-files
# Ask: "Explain the Ember app structure and communication board components"
```

**Critical Understanding:**
- Ember routing and data flow
- Offline functionality with IndexedDB
- Speech synthesis implementation
- Accessibility patterns for AAC users

### Full-Stack Developer

**Priority 1: Full Environment**
```bash
git clone <repo-url>
cd LingoLinq-AAC
./.ai/tools/launch-agentic.ps1  # Starts both AI tools
docker-compose up -d
```

**Priority 2: Integration Points**
- `app/controllers/api/` ↔ `app/frontend/app/adapters/`
- Authentication flow: Rails session ↔ Ember session
- Data sync: Rails API ↔ Ember persistence layer
- Real-time features: Rails + ActionCable ↔ Ember

**Priority 3: AI-Assisted Architecture Review**
```bash
./bin/devin ask "Explain the end-to-end data flow from frontend to backend"
gemini --all-files "How does offline sync work between Ember and Rails?"
```

### DevOps/Infrastructure

**Priority 1: Infrastructure Review**
- `docker/` - Development containerization
- `.github/workflows/` - CI/CD pipelines
- `config/environments/` - Environment configurations
- `Procfile`, `config/puma.rb` - Deployment configuration

**Priority 2: Current Issues**
- Docker psych gem dependency conflict (blocking deployment)
- Rails 6.1 → 7.0 upgrade needed for security patches
- Frontend npm audit shows 175+ vulnerabilities

**Priority 3: Deployment Pipeline**
```bash
# Current deployment process
docker-compose -f docker/docker-compose.simple.yml up -d
# Test: docker-compose ps should show all services healthy
```

### AAC Specialist

**Priority 1: AAC Feature Understanding**
- Communication board structure and navigation
- Button types and interaction patterns
- Speech synthesis and voice options
- Offline usage patterns for reliability

**Priority 2: Accessibility Requirements**
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Switch navigation support
- High contrast and customization options

**Priority 3: User Workflows**
```bash
# Use AI to understand AAC workflows
./bin/devin ask "Explain AAC communication board workflows and accessibility features"
```

### QA/Testing Specialist

**Priority 1: Testing Infrastructure**
- `spec/` - RSpec tests for Rails backend
- `app/frontend/tests/` - Ember test suite
- Accessibility testing tools and procedures
- Cross-browser/device testing requirements

**Priority 2: Test Execution**
```bash
# Backend tests
docker-compose exec backend rspec

# Frontend tests
cd app/frontend && npm test

# Accessibility testing
# Manual testing with screen readers required
```

**Priority 3: Test Coverage Analysis**
```bash
gemini --all-files "Analyze the current test coverage and identify gaps"
```

---

## Post-Repo Quick Reference Cards

### Essential Commands by Role

**Backend Developer:**
```bash
./bin/devin ask "Rails question"           # AI help with Rails
docker-compose exec backend rails console  # Rails console
docker-compose exec backend rspec          # Run tests
./bin/devin git-safe commit "message"      # Safe commits
```

**Frontend Developer:**
```bash
gemini --all-files "Ember question"        # AI help with Ember
cd app/frontend && ember serve             # Development server
cd app/frontend && npm test                # Run tests
./bin/devin analyze changes                # Review recent changes
```

**Full-Stack Developer:**
```bash
./.ai/tools/launch-agentic.ps1             # Launch both AI tools
./bin/devin update && ./bin/devin context  # Get full project context
./bin/devin analyze repo                   # Architecture analysis
./bin/devin review HEAD~5                  # AI code review
```

### Current Blocking Issues by Role

**Backend Developer:**
- Docker psych gem dependency prevents Rails server start
- Rails 6.1 has 2 remaining security vulnerabilities
- Background job processing needs monitoring setup

**Frontend Developer:**
- Ember 3.12 is outdated (upgrade branch: ember-3-12-to-3-28)
- 175+ npm vulnerabilities need addressing
- Accessibility compliance needs validation

**DevOps:**
- Docker deployment blocked by gem dependencies
- CI/CD pipeline needs security vulnerability scanning
- Production monitoring and alerting needs setup

---

## Architecture Quick Reference

### Data Flow
```
User Input → Ember Components → Ember Data → Rails API → PostgreSQL
          ←                   ← JSON Response ←         ←
```

### Key Integrations
- **Speech Synthesis:** Web Speech API + fallback services
- **Offline Storage:** IndexedDB with sync to Rails API
- **File Storage:** AWS S3 for images, sounds, backups
- **Background Jobs:** Resque workers for email, exports, cleanup

### Security Model
- Rails session-based authentication
- API token authentication for mobile apps
- CORS configuration for frontend requests
- Role-based access control (users, supervisors, admins)

---

## AI Development Workflow

### For Any Question:
1. **Claude Code (via MCP):** Architecture, complex analysis, AAC domain
2. **Gemini CLI:** Code syntax, debugging, quick questions

### Setup Verification:
```bash
# Test Claude MCP connection
claude
# Ask: "What is this LingoLinq AAC project about?"
# Should return detailed, specific project information

# Test Gemini full context
gemini --all-files
# Ask: "Explain the main Rails models"
# Should return specific model information
```

### Branch-Specific Context:
```bash
./bin/devin update     # Refresh context after branch switch
./bin/devin context    # Get current branch context
```

---

## Escalation Paths

### Technical Issues:
1. Check AI development guides: `.ai/docs/`
2. Use AI assistance: `./bin/devin ask` or `gemini --all-files`
3. Review architecture docs: `docs/development/`
4. Team lead escalation

### Environment Issues:
1. Docker troubleshooting: `docker/README.md`
2. AI tool setup: `.ai/docs/TEAM_AI_TOOLS_QUICK_GUIDE.md`
3. Platform-specific issues: Check OS-specific setup sections

### Domain Knowledge:
1. AAC concepts: Use `./bin/devin ask` with AAC terminology
2. Accessibility requirements: Review WCAG 2.1 AA standards
3. Communication device integration: Check device compatibility docs