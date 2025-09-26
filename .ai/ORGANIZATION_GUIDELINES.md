# LingoLinq AAC - AI Development Organization Guidelines

This document establishes clear guidelines for organizing AI development tools, documentation, and configurations across the LingoLinq AAC project.

## **Directory Structure Philosophy**

### **🌍 Global vs 🌿 Branch-Specific**

- **Global**: Tools and configurations that work across all branches
- **Branch-Specific**: Documentation and configs specific to a particular feature or epic

---

## **🗂️ Directory Organization**

### **Root Level (`/`)**
**Purpose**: Essential project files only
**Contents**:
- Core project files (`README.md`, `Gemfile`, etc.)
- Docker configurations (`.dockerignore`, `.env.docker.example`)
- Build and deployment scripts
- License and legal files

**❌ Should NOT contain**:
- Branch-specific documentation
- Temporary AI session files
- Feature-specific guides

### **AI Development (`.ai/`)**
**Purpose**: Global AI development tools and configurations

```
.ai/
├── agents/                    # AI agent configurations
│   ├── claude/
│   │   └── config.json       # Claude Code configuration (environment-agnostic)
│   └── project-constraints.json  # Global development constraints
├── context/                   # Shared AI context (global)
│   ├── AI_CONTEXT.md
│   ├── PROJECT_MAP.md
│   └── shared-state.json     # Multi-agent coordination
├── docs/                      # AI-related documentation
│   ├── AI_SESSION_GUIDE.md   # How to start AI sessions
│   └── AI_TOOLS_SETUP.md     # Setup instructions
├── tools/                     # AI development utilities
│   ├── deepwiki-mcp/         # MCP configurations
│   │   ├── claude-mcp-config.json
│   │   └── README.md
│   └── launch-agentic.ps1    # Agent launcher scripts
└── workflows/                 # AI workflow templates
    └── senior-dev-examples.md
```

### **Project Documentation (`docs/`)**
**Purpose**: Project-wide documentation and architecture

```
docs/
├── branches/                  # Branch-specific documentation
│   ├── feature-llm-enhanced-inflections/
│   │   ├── MULTI_LANGUAGE_GRAMMAR_EXPANSION.md
│   │   └── MULTI_LANGUAGE_TASKS.md
│   ├── epic-ai-features/
│   └── rails-6-to-7-upgrade/
├── development/               # Development guides (global)
├── architecture/              # System architecture (global)
├── epics/                     # Epic-level planning (global)
└── planning/                  # Project planning (global)
```

### **Claude Configuration (`.claude/`)**
**Purpose**: Claude Code permissions and settings
**Contents**:
- `settings.local.json` - Permissions and tool access (global)

### **DevContainer (`.devcontainer/`)**
**Purpose**: Development environment containers
**Contents**:
- `devcontainer.json` - VS Code dev container config (global)

---

## **🚦 Placement Rules**

### **✅ Place in Global Locations:**

1. **AI Tools & Configurations**
   - MCP server configurations
   - Agent coordination configs
   - Development environment scripts
   - Version constraint definitions

2. **Development Infrastructure**
   - Docker configurations
   - DevContainer setups
   - CI/CD configurations
   - Testing frameworks

3. **Project Architecture**
   - System design documents
   - API documentation
   - Security guidelines
   - Deployment procedures

### **✅ Place in Branch-Specific Locations:**

1. **Feature Documentation**
   - Feature requirements and specifications
   - Implementation task breakdowns
   - Branch-specific research notes
   - Feature-specific testing plans

2. **Epic-Specific Materials**
   - Epic planning documents
   - Progress tracking for specific initiatives
   - Stakeholder communications for specific projects

3. **Experimental Configurations**
   - Temporary agent setups for specific features
   - Branch-specific environment variables
   - Feature flags and toggles

---

## **🔧 Configuration Principles**

### **Environment-Agnostic Design**
- Use environment variables with fallbacks
- Avoid hardcoded localhost references
- Provide graceful degradation when services unavailable
- Support both local and containerized development

**Example:**
```json
{
  "coordination_api": {
    "enabled": false,
    "base_url": "${COORDINATION_SERVICE_URL:-http://localhost:4000/api}",
    "fallback_mode": "local_files"
  }
}
```

### **Path Conventions**
- Use relative paths in configurations
- Avoid absolute paths that break across environments
- Use forward slashes for cross-platform compatibility

**✅ Good:**
```json
"required_files": [".ai/agents/project-constraints.json"]
```

**❌ Bad:**
```json
"required_files": ["/home/user/project/.ai/agents/project-constraints.json"]
```

---

## **🔄 Migration Checklist**

When moving files to proper locations:

### **Before Moving:**
1. [ ] Identify if content is global or branch-specific
2. [ ] Check for references in other files
3. [ ] Verify no breaking changes to existing workflows

### **After Moving:**
1. [ ] Update any references to the old path
2. [ ] Test configurations still work
3. [ ] Update documentation with new locations
4. [ ] Commit changes with clear message

### **Documentation Updates:**
1. [ ] Update README.md if it references moved files
2. [ ] Update .gitignore if needed
3. [ ] Update CI/CD scripts if they reference moved files

---

## **🚨 Common Anti-Patterns to Avoid**

### **❌ Root Level Clutter**
Don't put temporary files, branch-specific docs, or AI session artifacts at the root level.

**Bad:**
```
/
├── FEATURE_X_PLANNING.md     # Branch-specific
├── ai-session-notes.md       # Temporary
├── debug-output.log          # Temporary
└── my-test-config.json       # Personal/temporary
```

### **❌ Hardcoded Environment Assumptions**
Don't assume specific environments, ports, or services.

**Bad:**
```json
{
  "api_url": "http://localhost:3000",
  "db_host": "192.168.1.100"
}
```

### **❌ Mixing Global and Branch-Specific**
Don't mix global configurations with feature-specific content.

**Bad:**
```
.ai/context/
├── AI_CONTEXT.md           # Global ✅
├── feature-x-notes.md      # Branch-specific ❌
└── shared-state.json       # Global ✅
```

---

## **🤝 Team Workflow**

### **For Contributors:**
1. **Check this guide** before adding new files
2. **Ask questions** if unsure about placement
3. **Follow naming conventions** established in existing directories
4. **Test changes** work in both local and Docker environments

### **For Maintainers:**
1. **Review file placement** in pull requests
2. **Enforce guidelines** consistently
3. **Update this document** when new patterns emerge
4. **Archive old patterns** that are no longer relevant

---

## **📞 Getting Help**

If you're unsure about where to place something:

1. **Check existing similar files** - where are comparable items located?
2. **Consider scope** - does this apply to one branch or all branches?
3. **Think about lifecycle** - is this temporary or permanent?
4. **Ask the team** - create an issue or discussion

---

*Last updated: 2025-09-05*  
*Maintainer: LingoLinq Development Team*