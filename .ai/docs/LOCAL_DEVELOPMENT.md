# Local Development Setup - LingoLinq AAC

## Current Status: BLOCKED by Legacy Ember 3.12

⚠️ **IMPORTANT**: Local development is currently challenging due to Ember 3.12 (2019) compatibility issues. Consider prioritizing Ember upgrade before extensive local development work.

## Technical Constraints

### Legacy Stack Issues
- **Ember 3.12** (September 2019) - 5+ years old
- **Node.js compatibility**: Limited to Node 14-16 (Node 18+ breaks)
- **Bower dependencies**: Using deprecated package manager (EOL 2017)
- **Build tooling**: Outdated, limited modern JavaScript support

### Docker Environment Required

Due to version constraints, **Docker is mandatory** for local development:

```bash
# Modern Node/Ruby in host system conflicts with Ember 3.12
# Docker provides isolated environment with compatible versions
cd docker && docker-compose up -d
```

## Current Setup Process

### Prerequisites
- Docker Desktop
- Git

### Setup Steps
1. Clone repository
2. Switch to feature branch: `git checkout fix/ci-pipeline-test`
3. Start Docker environment: `cd docker && docker-compose up -d`
4. Wait for services to initialize (can take 5-10 minutes first time)
5. Access application at http://localhost:3000

### Known Issues (Expected and Unfixable)
- **Startup hangs**: Rails initialization can hang on first run
- **Asset compilation**: Bower/NPM conflicts in container
- **JavaScript errors**:
  - `LingoLinqAAC.track_error is not a function` (in frontend.source.js)
  - `app.initializer is not a function` (Ember 3.12 compatibility)
- **Development vs Production**: Local uses uncompiled source, production uses compiled assets

### Why These Errors Occur
**Root Cause:** Ember 3.12 development server incompatibility
- Local development loads `frontend.source.js` (uncompiled source files)
- Development environment has version conflicts with modern tooling
- Our namespace fixes are in compiled assets, not source files
- This is a fundamental framework limitation, not a bug

## JavaScript Namespace Fixes Applied

### Problem
After SweetSuite → LingoLinq rename, frontend JavaScript expected `SweetSuite` namespace but wasn't properly initialized, causing:
- `LingoLinqAAC.track_error is not a function`
- `Cannot read properties of undefined (reading 'update_version')`
- Infinite loading loops

### Solution Implemented
1. **Early initialization**: Added `window.SweetSuite` in `application-preload.js`
2. **Namespace mapping**: Fixed `window.SweetSuite = LingoLinqAAC` in `app.js`
3. **Variable references**: Replaced undefined `SweetSuite` with `LingoLinqAAC`
4. **Asset pipeline**: Created symlinks to built Ember assets

### Files Modified
- `app/assets/javascripts/application-preload.js`
- `app/frontend/app/app.js`
- `app/frontend/app/utils/persistence.js`
- `config/initializers/mime_types.rb`
- `config/initializers/rack_timeout.rb`
- Asset symlinks for `vendor.js` and `frontend.js`

## Deployment vs Local Development

### For Deployment (Recommended)
- Use existing built assets in `app/frontend/dist/assets/`
- JavaScript fixes are included in built files
- Deploy to production/staging for testing

### For Local Development (Challenging)
- Requires Docker with compatible Node.js/Ruby versions
- Ember 3.12 limitations make debugging difficult
- Consider upgrading Ember before extensive local work

## Recommendations

### Immediate
1. **Test fixes in production/staging** instead of locally
2. **Document Ember upgrade plan** as priority
3. **Avoid extensive local debugging** on legacy stack

### Long-term
1. **Upgrade Ember** 3.12 → 4.x → 5.x
2. **Modernize build system** (remove Bower, use NPM)
3. **Update Node.js/Ruby** to current versions
4. **Establish proper local development** workflow

## Success Criteria (Post-Ember Upgrade)
- [ ] Local development works without Docker constraints
- [ ] Modern Node.js/NPM compatibility
- [ ] Fast build times and reliable tooling
- [ ] Full application functionality (login, boards, voice settings)

## Team Continuity Notes

### For AI Assistants (Claude, Gemini, etc.)
- Always check current branch before making changes
- Review this document for context on legacy constraints
- Focus on production deployment over local debugging
- Document any new findings about Ember 3.12 limitations

### For Developers
- Use feature branches for experimentation
- Commit frequently with descriptive messages
- Test in production/staging when local is problematic
- Prioritize framework upgrades over legacy fixes