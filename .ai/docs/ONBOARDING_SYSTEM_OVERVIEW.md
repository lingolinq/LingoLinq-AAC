# Senior Dev Onboarding System - Complete

## System Organization

### Pre-Repository Package
**File:** `PRE_REPO_BRIEFING.md` (repo root)
**Purpose:** Information contractors need before getting repository access
**Content:**
- Project classification and technical stack
- AAC domain concepts they need to understand
- Current branch strategy and active work
- Role-specific skill requirements
- Known blocking issues and workarounds
- Environment setup options comparison
- Expected productivity timeline

### Role-Based Onboarding Matrix
**File:** `.ai/docs/TEAM_ONBOARDING_MATRIX.md`
**Purpose:** Targeted 15-minute quick starts by developer type
**Roles Covered:**
- Rails Backend Developer
- Ember Frontend Developer
- Full-Stack Developer
- DevOps/Infrastructure
- AAC Specialist
- QA/Testing Specialist

**Each Role Gets:**
- Priority 1: Immediate environment setup
- Priority 2: Key files to review first
- Priority 3: AI development setup
- Critical understanding points
- Current blocking issues specific to role

### Post-Repository Quick Starts
**File:** `.ai/docs/POST_REPO_QUICK_STARTS.md`
**Purpose:** Hands-on verification and deep dives once they have repo access
**Structure:**
- 15-minute environment verification (all roles)
- 30-minute role-specific deep dives
- Branch-specific context switching
- Daily workflow patterns
- Troubleshooting quick reference
- Success validation checklists

## Implementation Strategy

### For 3rd Party Contractors

**Step 1: Pre-Engagement (Send before contract starts)**
- Email `PRE_REPO_BRIEFING.md`
- Schedule 30-minute technical overview call
- Verify skill alignment with role requirements
- Set expectations for productivity timeline

**Step 2: Repository Access Day**
- Grant GitHub repository access
- Direct to role-specific section in `TEAM_ONBOARDING_MATRIX.md`
- Schedule pairing session within 48 hours
- Provide escalation contacts for blocking issues

**Step 3: First Week Validation**
- Complete `POST_REPO_QUICK_STARTS.md` verification
- Validate AI development tools working
- Review first small task completion
- Address any knowledge gaps identified

### For Internal Team Organization

**Documentation Hierarchy:**
```
LingoLinq-AAC/
├── PRE_REPO_BRIEFING.md              # Send before access
├── .ai/docs/
│   ├── TEAM_ONBOARDING_MATRIX.md     # Role-based quick starts
│   ├── POST_REPO_QUICK_STARTS.md     # Post-access verification
│   └── ONBOARDING_SYSTEM_OVERVIEW.md # This file
└── [existing documentation]
```

**Team Lead Responsibilities:**
1. **Pre-Contractor:** Send briefing, conduct technical overview
2. **Day 1:** Verify environment setup, assign pairing partner
3. **Week 1:** Review success validation, address blockers
4. **Week 2:** Assess domain knowledge, assign first real task

## Key Architecture Information Provided

### Technical Stack Clarity
- Rails 6.1 backend with planned 7.0 upgrade
- Ember 3.12 frontend with planned 3.28 modernization
- PostgreSQL + Redis infrastructure
- Docker development environment (with known issues)
- AI-enhanced development workflow

### AAC Domain Knowledge
- Communication board concepts and data structures
- Accessibility requirements and compliance
- Offline-first architecture principles
- Speech synthesis integration
- Assistive technology compatibility

### Current Development State
- Active branch strategy and purpose of each branch
- Known blocking issues and their workarounds
- Security vulnerabilities and remediation timeline
- Performance issues and optimization plans

## AI Development Integration

### Tools Provided
- Claude Code with DeepWiki MCP for deep architecture questions
- Gemini CLI with full codebase context for quick development help
- Automated project context management
- AI-powered code review capabilities

### Workflow Integration
- AI tool verification in environment setup
- Role-specific AI assistance examples
- Branch-aware context switching
- Daily development workflow with AI integration

## Branch Strategy Communication

### Active Branches Explained
- `main` - Production baseline
- `rails-6-to-7-upgrade` - Framework upgrade (6 weeks)
- `ember-3-12-to-3-28` - Frontend modernization (4 weeks)
- `epic/ai-features` - AI integration development
- `epic/tech-debt-security` - Security improvements
- `feature/llm-inflections` - Multi-language grammar

### Context Switching Support
- Branch-specific documentation references
- AI context updates when switching branches
- Role-specific impact of each branch
- Dependencies between branches

## Blocking Issues Transparency

### Current Blockers Documented
- Docker psych gem dependency preventing Rails server start
- Rails security vulnerabilities requiring 7.0 upgrade
- Frontend npm audit showing 175+ vulnerabilities
- Performance optimization needs

### Workarounds Provided
- Direct bundle exec commands for Rails development
- Alternative development environment options
- Priority order for addressing issues
- Timeline estimates for resolution

## Success Metrics and Validation

### Productivity Timeline
- Week 1: Environment functional, basic understanding
- Week 2: Domain knowledge acquired, workflow familiar
- Week 3: First feature completed, team integrated
- Week 4: Independent contribution, mentoring capable

### Validation Checklists
- Technical setup verification
- Domain understanding assessment
- Development workflow operational
- Team integration readiness

## Escalation Paths Defined

### Technical Issues
1. AI development guides and tools
2. Architecture documentation review
3. Team lead technical consultation
4. Senior developer pairing session

### Domain Knowledge Gaps
1. AAC concept documentation
2. AI-assisted domain learning
3. Accessibility expert consultation
4. User workflow observation

### Environment Problems
1. Platform-specific troubleshooting guides
2. Docker environment alternatives
3. Infrastructure team involvement
4. Development environment reset procedures

## Maintenance and Updates

### Keep Current
- Update blocking issues as they're resolved
- Refresh branch strategy as branches merge
- Update AI tool configurations as they evolve
- Revise role requirements based on technology changes

### Review Cycle
- Monthly review of contractor feedback
- Quarterly update of technical stack information
- Annual review of role definitions and requirements
- Continuous improvement based on onboarding success rates

## Integration with Existing Documentation

### Leverages Current Assets
- Existing AI development guides in `.ai/docs/`
- Current Docker setup documentation
- Established architecture documentation
- Working AI tool configurations

### Replaces Scattered Information
- Consolidates multiple setup guides
- Organizes role-specific information
- Provides single source of truth for onboarding
- Eliminates outdated or conflicting documentation

This onboarding system transforms ad-hoc contractor integration into a systematic, role-based process that gets developers productive quickly while ensuring they understand both the technical architecture and AAC domain requirements.