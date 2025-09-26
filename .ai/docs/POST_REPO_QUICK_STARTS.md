# Post-Repository Quick Starts

## 15-Minute Environment Verification (All Roles)

### Step 1: Repository Validation
```bash
cd LingoLinq-AAC
git status                    # Should show main branch, clean working tree
git log --oneline -5          # Should show recent commits
ls -la                        # Should see app/, docs/, docker/, .ai/ directories
```

### Step 2: Docker Environment Test
```bash
docker-compose up -d          # Start all services
docker-compose ps             # All services should be "Up"
```

**Expected Output:**
```
postgres_db     Up      5432/tcp
redis_cache     Up      6379/tcp
backend         Up      3000/tcp (if psych issue resolved)
```

### Step 3: AI Tools Verification
```bash
# Test Claude Code MCP
claude
# In Claude, ask: "What is this LingoLinq AAC project about?"
# Should return specific project details, not generic responses

# Test Gemini CLI
gemini --all-files
# Ask: "What are the main Rails models in this application?"
# Should return specific model information
```

### Step 4: Quick Architecture Test
```bash
./bin/devin context           # Should return project architecture overview
./bin/devin update            # Should update context without errors
```

**Success Criteria:** All commands execute without errors, AI tools return project-specific information

---

## Role-Specific 30-Minute Deep Dives

### Rails Backend Developer

**Objective:** Understand data model and API structure

**Key Files Deep Dive:**
```bash
# 1. Core Models (10 minutes)
code app/models/user.rb       # User authentication and permissions
code app/models/board.rb      # Communication board structure
code app/models/button.rb     # Board button configuration
code app/models/log_session.rb # Usage tracking

# 2. API Controllers (10 minutes)
code app/controllers/api/boards_controller.rb
code app/controllers/api/users_controller.rb
code config/routes.rb         # API routing structure

# 3. Database Schema (10 minutes)
code db/schema.rb             # Current database structure
ls db/migrate/ | tail -10     # Recent migrations
```

**AI-Assisted Learning:**
```bash
./bin/devin ask "Explain the relationship between User, Board, and Button models"
./bin/devin ask "How does the API authentication work?"
./bin/devin ask "What are the main background job types in this application?"
```

**Validation Test:**
```bash
docker-compose exec backend rails console
# In console:
User.count                    # Should return user count
Board.first&.buttons&.count   # Should return button count for first board
```

### Ember Frontend Developer

**Objective:** Understand component architecture and data flow

**Key Files Deep Dive:**
```bash
# 1. Application Structure (10 minutes)
cd app/frontend
code app/router.js            # Route definitions
code app/controllers/application.js # App-level controller
code app/utils/app_state.js   # Central state management

# 2. Board Components (10 minutes)
code app/controllers/board/index.js # Board interaction logic
code app/components/board-selection-tool.js # Board picker component
code app/utils/persistence.js # Data persistence layer

# 3. Utilities (10 minutes)
code app/utils/speecher.js    # Speech synthesis
code app/utils/capabilities.js # Device capability detection
code app/adapters/application.js # API communication
```

**AI-Assisted Learning:**
```bash
gemini --all-files "How does the Ember app handle offline data storage?"
gemini --all-files "Explain the speech synthesis implementation"
gemini --all-files "How do communication boards render and handle interaction?"
```

**Validation Test:**
```bash
cd app/frontend
npm test                      # Should run test suite successfully
ember serve                   # Should start development server on :4200
```

### Full-Stack Developer

**Objective:** Understand end-to-end data flow and integration points

**Integration Points Analysis:**
```bash
# 1. API Integration (10 minutes)
code app/controllers/api/boards_controller.rb      # Rails API
code app/frontend/app/adapters/application.js      # Ember adapter
code app/frontend/app/models/board.js              # Ember model

# 2. Authentication Flow (10 minutes)
code app/controllers/sessions_controller.rb        # Rails session
code app/frontend/app/controllers/login.js         # Ember login
code app/frontend/app/utils/session.js             # Session management

# 3. Data Synchronization (10 minutes)
code app/frontend/app/utils/persistence.js         # Offline persistence
grep -r "sync" app/frontend/app/utils/             # Sync mechanisms
```

**AI-Assisted Learning:**
```bash
./bin/devin ask "Explain the end-to-end flow when a user creates a new communication board"
gemini --all-files "How does authentication work between Rails and Ember?"
./bin/devin ask "What happens when the app goes offline and comes back online?"
```

**Validation Test:**
```bash
# Test full stack
docker-compose up -d          # Backend services
cd app/frontend && ember serve # Frontend development
# Navigate to localhost:4200, test login and board creation
```

### DevOps/Infrastructure Developer

**Objective:** Understand deployment pipeline and infrastructure

**Infrastructure Analysis:**
```bash
# 1. Docker Configuration (10 minutes)
code docker/docker-compose.simple.yml    # Development environment
code docker/Dockerfile                   # Application containerization
code docker/README.md                    # Docker setup documentation

# 2. CI/CD Pipeline (10 minutes)
code .github/workflows/ci.yml            # GitHub Actions workflow
code Procfile                            # Heroku deployment configuration
code config/environments/production.rb   # Production settings

# 3. Configuration Management (10 minutes)
code .env.example                        # Environment variables template
code config/puma.rb                      # Application server config
code config/database.yml                 # Database configuration
```

**Current Issues Investigation:**
```bash
# Docker psych gem issue
docker-compose logs backend              # Check for psych gem errors
grep -r "psych" Gemfile*                 # Find psych dependencies
cat Gemfile.lock | grep psych            # Current psych version

# Security vulnerabilities
bundle audit                             # Ruby gem vulnerabilities
cd app/frontend && npm audit             # Node.js vulnerabilities
```

**Validation Test:**
```bash
docker-compose up -d                     # Should start all services
docker-compose exec backend rails runner "puts 'Rails OK'" # Test Rails access
docker-compose exec postgres psql -U postgres -l # Test database access
```

### QA/Testing Specialist

**Objective:** Understand testing infrastructure and coverage

**Test Infrastructure Analysis:**
```bash
# 1. Backend Testing (10 minutes)
ls spec/                                 # RSpec test structure
code spec/spec_helper.rb                 # Test configuration
code spec/models/user_spec.rb            # Example model test
rspec spec/models/ --format documentation # Run model tests

# 2. Frontend Testing (10 minutes)
cd app/frontend
ls tests/                                # Ember test structure
code tests/test-helper.js                # Test configuration
code tests/unit/models/user-test.js      # Example unit test
npm test                                 # Run Ember tests

# 3. Accessibility Testing (10 minutes)
grep -r "accessibility\|a11y" app/frontend/ # Accessibility patterns
code app/frontend/app/utils/capabilities.js # Device capabilities
```

**Coverage Analysis:**
```bash
# Backend coverage
rspec --format html --out coverage/index.html # Generate coverage report

# Frontend coverage
cd app/frontend
npm run test:coverage                    # Generate frontend coverage

# Accessibility testing
# Manual: Test with screen reader (NVDA/JAWS/VoiceOver)
# Automated: Check for accessibility testing tools
```

**Validation Test:**
```bash
# Full test suite
rspec                                    # Backend tests
cd app/frontend && npm test              # Frontend tests
# Manual accessibility test with keyboard navigation only
```

---

## Branch-Specific Context (5 Minutes Each)

### Working on Rails Upgrade Branch
```bash
git checkout rails-6-to-7-upgrade
./bin/devin update
./bin/devin ask "What are the main challenges in upgrading from Rails 6.1 to 7.0?"
bundle outdated                          # Check gem versions
```

### Working on Ember Modernization
```bash
git checkout ember-3-12-to-3-28-upgrade
cd app/frontend
./bin/devin update
gemini --all-files "What needs to be updated for Ember 3.28 compatibility?"
npm outdated                             # Check package versions
```

### Working on AI Features
```bash
git checkout epic/ai-features
./bin/devin update
./bin/devin ask "What AI features are being integrated into the AAC application?"
ls .ai/                                  # Review AI-related files
```

---

## Daily Development Workflow Verification

### Morning Startup (2 minutes)
```bash
git status                               # Check working tree status
git pull origin main                     # Update main branch
./bin/devin update                       # Refresh AI context
docker-compose ps                        # Verify services running
```

### Code Development Session
```bash
# Before starting work
./bin/devin context                      # Get current project context
git checkout -b feature/your-feature     # Create feature branch

# During development
gemini --all-files "specific question"   # Quick AI assistance
./bin/devin ask "complex question"       # Deep AI analysis

# Before committing
./bin/devin review HEAD~1                # AI code review
./bin/devin git-safe commit "message"    # Safe commit with validation
```

### End of Day (2 minutes)
```bash
git status                               # Check for uncommitted changes
./bin/devin analyze changes              # Review day's work
docker-compose down                      # Stop services (optional)
```

---

## Troubleshooting Quick Reference

### Environment Issues
```bash
# Docker services not starting
docker-compose down && docker-compose up -d
docker system prune                      # Clean up if space issues

# Rails server issues
docker-compose exec backend bundle install
docker-compose exec backend rails db:migrate

# Ember build issues
cd app/frontend && rm -rf node_modules && npm install
cd app/frontend && npm run build
```

### AI Tools Issues
```bash
# Claude MCP not connecting
ls .ai/tools/deepwiki-mcp/               # Verify MCP files exist
./bin/devin update                       # Refresh context

# Gemini not seeing full codebase
gemini --all-files --help               # Verify correct flags
gemini --version                         # Check Gemini version
```

### Git Workflow Issues
```bash
# Branch conflicts
git status                               # Check conflict status
./bin/devin git-safe stash-clean         # Clean working directory
git checkout main && git pull            # Get latest main

# Merge conflicts
./bin/devin ask "How should I resolve this merge conflict: $(git diff)"
```

---

## Success Validation Checklist

### Technical Setup Complete
- [ ] All docker services start without errors
- [ ] Both AI tools return project-specific information
- [ ] Can run test suites successfully
- [ ] Can access application in browser (if applicable)

### Domain Understanding Achieved
- [ ] Can explain AAC communication board concept
- [ ] Understands offline-first architecture principles
- [ ] Knows accessibility requirements for AAC users
- [ ] Familiar with speech synthesis implementation

### Development Workflow Operational
- [ ] Can create feature branch and make changes
- [ ] Can use AI tools for code assistance
- [ ] Can run appropriate test suites
- [ ] Can submit code for review

### Team Integration Ready
- [ ] Understands current project priorities
- [ ] Knows escalation paths for different issue types
- [ ] Can participate in code review process
- [ ] Ready to take on first assigned task