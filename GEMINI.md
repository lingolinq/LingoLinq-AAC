# GEMINI.md

## 🧠 LingoLinq-AAC Project Context

LingoLinq-AAC is a forked and rebranded AAC (Augmentative and Alternative Communication) application originally called "SweetSuite". This file provides essential context for Gemini AI sessions.

## 🏷️ **CRITICAL: SweetSuite → LingoLinq Rename Strategy**

### The Rename Challenge
- **Original**: Application was "SweetSuite"
- **Current**: Rebranding to "LingoLinq" for customer-facing elements
- **Problem**: Incomplete rename causing JavaScript namespace conflicts

### Resolution Strategy
- **Backend**: Keep SweetSuite names in internal/backend code where it works
- **Frontend**: Use LingoLinq for user-facing elements only
- **Compatibility**: Create bridges where both names coexist
- **Example**: `LingoLinqAAC.track_error = SweetSuite.track_error`
- **Rule**: NEVER break working SweetSuite functionality during rename

## 🐳 Docker Architecture

### Why Docker?
- Isolates legacy Ember 3.12 + Rails 6.1 stack from modern host tools
- Allows development on Windows while using Linux container environment
- Prevents version conflicts between legacy and modern tooling

### Key Technical Details
- **Node Version**: Use Node 18.x (works despite Ember 3.12 legacy constraints)
- **Build Context**: Always build from project root, never subdirectories
- **Asset Pipeline**: Rails precompilation with conditional obf gem loading
- **Environment Variables**: Use `DISABLE_OBF_GEM=true` for stable builds

## 🔧 Common Issues & Patterns

### JavaScript Namespace Conflicts
```javascript
// Problem: LingoLinqAAC.track_error is not a function
// Solution: Create compatibility bridge
LingoLinqAAC.track_error = function(msg, stack) {
  return SweetSuite.track_error(msg, stack);
};
```

### Docker Build Issues
- Large JS files removed from git (symlink issues in GitHub Actions)
- Use relative paths from project root in Dockerfile
- Install bower with `--allow-root` flag in container

### Legacy Dependencies
- **OBF Gem**: Conditional loading to avoid compilation errors
- **Bower**: Required for legacy frontend dependencies
- **Ember 3.12**: Legacy but stable, upgrade planned incrementally

## 📍 Key Files & Locations

### Critical Files
- `app/frontend/app/app.js:859` - JavaScript namespace compatibility bridge
- `docker/Dockerfile` - Multi-stage build with Node 18.x
- `config/initializers/obf_footer.rb` - Conditional obf gem loading
- `.github/workflows/deploy-fixer.yml` - Automated deployment monitoring

### Documentation
- `CLAUDE.md` - Claude Code session context
- `.ai/docs/LOCAL_DEVELOPMENT.md` - Development setup guide
- `.ai/docs/JAVASCRIPT_NAMESPACE_FIXES.md` - Namespace conflict solutions

## 🌐 Deployment & Services

### Local Development
- **Container**: http://localhost:3000
- **Login**: http://localhost:3000/login
- **Health**: http://localhost:3000/health

### Production (Render.com)
- **URL**: https://lingolinq-web.onrender.com
- **Service ID**: srv-d36f26umcj7s73dh0dag
- **CI/CD**: Automated GitHub Actions deployment monitoring

## 🎯 Core Principles for AI Sessions

1. **Compatibility First**: Create bridges, don't break working code
2. **Docker Isolation**: Use containerized environment for legacy stack
3. **Incremental Updates**: Stability over modernization until core issues resolved
4. **Pattern Recognition**: Apply SweetSuite/LingoLinq compatibility patterns consistently

## 🔄 Session Continuity

This file ensures Gemini AI sessions have persistent context about:
- Why namespace conflicts occur (incomplete SweetSuite → LingoLinq rename)
- How to resolve them (compatibility bridges, not mass renaming)
- Docker strategies and architectural decisions
- Proven patterns and successful solutions

Update this file when discovering new patterns or architectural insights.