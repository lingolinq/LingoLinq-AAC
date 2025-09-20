# CLAUDE.md

## 🧠 Project Overview
LingoLinq-AAC is a forked and rebranded version of SweetSuite, an AAC (Augmentative and Alternative Communication) application. The project uses Docker to isolate the legacy Ember 3.12 + Rails 6.1 stack while maintaining modern host versions.

### 🏷️ **CRITICAL: SweetSuite → LingoLinq Rename Context**
- **Original**: Application was called "SweetSuite"
- **Current**: Rebranding to "LingoLinq" for customer-facing elements
- **Backend**: Keep SweetSuite names in internal/backend code where it works
- **Frontend**: Use LingoLinq for user-facing elements only
- **Compatibility**: Create bridges where both names need to coexist (e.g., `LingoLinqAAC.track_error = SweetSuite.track_error`)
- **DO NOT**: Break working SweetSuite functionality during rename

## 🧪 Current Status
- Docker container boots and renders startup page
- Page stuck on "loading" and login route never initializes
- Rails backend responds with HTTP 200
- JavaScript namespace errors resolved
- CI pipeline issues fixed
- Claude Code has been running tests and debugging in-session

## ⚙️ Environment & Architecture

### Docker Strategy
- **Why Docker**: Isolates legacy Ember 3.12 + Rails 6.1 stack from modern host tools
- **Node Version**: Use Node 18.x in container (legacy Ember 3.12 compatible)
- **Build Context**: Always build from project root, not subdirectories
- **Asset Pipeline**: Rails asset precompilation with conditional obf gem loading

### Technical Stack
- **Host OS**: Windows 11
- **Shell**: Windows Terminal
- **Frontend**: Ember 3.12 (legacy) with Bower dependencies
- **Backend**: Rails 6.1.7 with Ruby 3.2.8
- **Database**: PostgreSQL + Redis
- **Container**: Docker with multi-stage builds
- **Deployment**: Render.com with automated CI/CD

## ❌ Common Issues & Solutions

### SweetSuite/LingoLinq Namespace Conflicts
- **Problem**: JavaScript errors like `LingoLinqAAC.track_error is not a function`
- **Cause**: Incomplete rename from SweetSuite → LingoLinq
- **Solution**: Create compatibility bridges: `LingoLinqAAC.method = SweetSuite.method`
- **Pattern**: Keep working SweetSuite backend, bridge to LingoLinq frontend calls

### Legacy Dependencies
- **OBF Gem**: Use `DISABLE_OBF_GEM=true` during Docker builds to avoid compilation issues
- **Bower**: Required for legacy frontend dependencies, install with `--allow-root` in container
- **Node 18**: Works despite Ember 3.12 suggesting Node 16 compatibility

### Docker Build Issues
- **Context**: Always build from project root, not app subdirectories
- **File Paths**: Use relative paths from project root in Dockerfile
- **Symlinks**: Large JS files removed from git to avoid GitHub Actions symlink errors

## ✅ Fixes Completed
- Namespace errors resolved and committed
- `.ai/docs/LOCAL_DEVELOPMENT.md` created
- `.ai/docs/JAVASCRIPT_NAMESPACE_FIXES.md` and `EMBER_UPGRADE_RESEARCH.md` added
- GitHub issue opened for Ember modernization: https://github.com/swahlquist/LingoLinq-AAC/issues/5

## 🔜 Next Steps
- Clarify Node version recommendation from Claude
- Debug frontend "loading" issue (check console, network tab, API responses)
- Validate login route and staging functionality
- Begin Ember upgrade planning
- Maintain working Docker setup for contributor onboarding

## 🧩 Claude Code Instructions

### Core Principles
- **Preserve Working Code**: Never break existing SweetSuite functionality during LingoLinq migration
- **Compatibility First**: Create bridges between SweetSuite/LingoLinq namespaces rather than mass renaming
- **Docker Isolation**: Use containerized environment for all legacy stack development
- **Incremental Updates**: Prioritize stability over modernization until core issues resolved

### Decision Making Guidelines
- **SweetSuite vs LingoLinq**: Keep SweetSuite for internal/backend, use LingoLinq for user-facing only
- **Node Versions**: Use Node 18.x in Docker despite Ember 3.12 legacy constraints
- **Build Strategy**: Build from project root, use environment variables for conditional compilation
- **Error Handling**: Create compatibility shims rather than fixing root namespace issues

### Session Context
- Use this file as persistent architectural context across all Claude Code sessions
- Reference these patterns when encountering similar SweetSuite/LingoLinq conflicts
- Apply Docker-first approach to development and debugging
- Document new patterns discovered in this file for future sessions
