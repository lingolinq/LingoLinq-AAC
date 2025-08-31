# LingoLinq AAC - Development Roadmap
*Single source of truth for development planning - update this file instead of creating new roadmaps*

## Current Architecture State (August 2025)

### ✅ What's Working & Current
- **Rails**: 6.1.7.10 (security patched, 25+ CVEs fixed)
- **Core AAC Features**: Communication boards, user management, board sharing all functional
- **Database**: PostgreSQL with Redis caching
- **Security**: Major vulnerability fixes applied
- **Docker**: Production-ready environment locked to legacy versions

### ⚠️ Development Environment Split
**Local Development (Modern):**
- Node.js 22.14.0 (current, works fine)
- Ruby 3.2.8+ (can use newer versions)
- Modern tooling available

**Docker/Production (Legacy Compatibility):**
- Node.js 18.20.8 (locked for production compatibility)  
- Ruby 3.2.8 (locked for current production environment)
- **Purpose**: Deploy current architecture without breaking changes

### 🔴 Known Issues Requiring Work
1. **Frontend Dependencies**: 52+ npm vulnerabilities in Ember.js 3.12 ecosystem
2. **Ember.js**: Version 3.12 (EOL, needs 4.x+ or React migration)
3. **Mobile Apps**: Cordova packaging needs modernization
4. **Documentation**: 9+ duplicate roadmap files confusing new developers

## Development Approach for New Teams

### Phase 1: Stabilize Current Architecture (1-2 months)
**Goal**: Make current system production-ready without major framework changes

**Priority Tasks:**
1. **Fix npm vulnerabilities**: `npm audit fix` in `/app/frontend/`
2. **Ember.js patch upgrade**: 3.12 → 3.28 (security fixes, no breaking changes)
3. **Clean up documentation**: Consolidate 9+ roadmap files into this one
4. **Squash commit history**: Remove documentation churn from recent month

**Why This Approach:**
- Low risk: No major framework changes
- Fast deployment: Current Docker setup works
- Team onboarding: Less moving parts to understand

### Phase 2: Modern Migration Planning (2-4 months)
**Goal**: Plan transition to modern frontend while maintaining functionality

**Decision Points:**
1. **Frontend Strategy**: Ember 5.x vs React migration vs Vue
2. **Mobile Strategy**: Continue Cordova vs React Native vs PWA
3. **Deployment Strategy**: Continue Docker vs cloud-native

### Phase 3: Implementation (3-6 months)
Based on decisions from Phase 2

## New Team Quick Start

### Recommended Development Path
```bash
# 1. Use Docker for consistency (matches production)
docker-compose up

# 2. Access at http://localhost:3000

# 3. For modern local development (optional)
bundle install  # Uses your system Ruby (3.2.8+)
cd app/frontend && npm install  # Uses your Node 22.x
foreman start
```

### AI Development Tools
```bash
./bin/devin ask "question"        # Quick help (~200 tokens)
./bin/devin ask-full "question"   # Full context (~4K tokens)
./bin/devin validate             # Check AI CLI setup
```

**📖 Complete Setup Guide**: See `AI_TOOLS_SETUP.md` for detailed installation and usage instructions.

### Key Files to Understand
1. **`README.md`** - Complete project overview and setup
2. **`docker/README.md`** - Docker development guide  
3. **`app/models/board.rb`** - Core communication board logic
4. **`app/frontend/app/`** - Ember.js frontend (needs work)
5. **`lib/converters/cough_drop.rb`** - OBF format conversion (had hardcoded sleep(10)!)

## Architecture Context for New Teams

### Why These Technology Choices
- **Rails + Ember**: Historical choice, works but Ember 3.12 is EOL
- **PostgreSQL**: Solid choice, handles multi-tenant AAC data well
- **Docker**: Ensures production compatibility during transition
- **OBF Format**: Industry standard for AAC board interchange

### Technical Debt Priorities
1. **Highest Risk**: Ember.js 3.12 security vulnerabilities
2. **Medium Risk**: npm dependency vulnerabilities  
3. **Low Risk**: Rails 6.1 → 7.x (already security patched)

### What NOT to Change Yet
- Database schema (complex, working)
- Core Rails models (stable, well-tested)
- OBF conversion logic (just fixed performance issues)
- Docker deployment setup (production-ready)

## Files to Clean Up Before New Team
```bash
# Remove duplicate roadmaps (keep only this file)
rm .ai/context/IMPLEMENTATION_ROADMAP.md
rm .ai/context/MODERNIZATION_ROADMAP.md  
rm .ai/context/MASTER_IMPLEMENTATION_PLAN.md
rm docs/planning/roadmaps/SENIOR_DEV_ROADMAP.md
rm docs/planning/roadmaps/TECHNICAL_AUDIT_AND_ROADMAP.md

# Consider squashing these documentation commits:
# 09c039c87 docs: Create comprehensive project documentation
# 254feecca docs: Update documentation and paths after reorganization
# 4c1f4c6be docs: Update documentation and paths after reorganization
```

## Success Metrics for Phase 1
- [ ] Zero high/critical npm vulnerabilities
- [ ] Ember 3.12 → 3.28 upgrade completed
- [ ] Single roadmap file (this one) 
- [ ] Clean commit history for new team
- [ ] All core AAC features still working
- [ ] Docker deployment still functional

---

**For New Teams**: Start with Phase 1 stabilization. The current architecture works - it just needs security fixes and cleanup before major modernization.