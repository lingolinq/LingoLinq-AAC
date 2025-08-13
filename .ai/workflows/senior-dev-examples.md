# Senior Developer DeepWiki Workflows

## 🌅 **Morning Routine (15 minutes)**

### Check what changed overnight
```bash
# Update context with recent changes
./bin/devin update

# Get overview of recent changes  
./bin/devin analyze changes

# Review any commits I missed
./bin/devin review HEAD~5..HEAD
```

### Quick architecture review
```bash
# Generate fresh project map
./bin/devin generate

# Ask AI about potential issues
./bin/devin ask "Any architectural concerns with recent changes?"
```

## 🔍 **Code Review Process**

### Before reviewing a PR
```bash
# Get context on the affected areas
./bin/devin ask "What are the main components in app/models/user.rb and their relationships?"

# Analyze the specific changes
./bin/devin ask "Review this commit for security issues: [commit-hash]"

# Check for breaking changes
./bin/devin ask "Will changing the User model affect the API endpoints?"
```

### During code review
```bash
# Quick architecture impact assessment
./bin/devin ask "If we change the authentication system, what other components are affected?"

# Security review
./bin/devin ask "Are there any security implications of this database migration?"
```

## 🚨 **Incident Response**

### When production breaks
```bash
# Quick context gathering
./bin/devin context | head -20

# Analyze recent deployments  
./bin/devin ask "What were the last 3 deployments and what could have broken?"

# Find related components
./bin/devin ask "What components interact with the payment system?"
```

### Root cause analysis
```bash
# Get full system context
./bin/devin ask "Map out the data flow for user registration"

# Identify failure points
./bin/devin ask "What are the most likely failure points in our Rails authentication?"
```

## 🏗️ **Architecture Planning**

### Planning new features
```bash
# Understand current state
./bin/devin ask "How is user data currently stored and accessed?"

# Plan integration points
./bin/devin ask "Where should I add LLM integration in the existing architecture?"

# Identify refactoring needs
./bin/devin ask "What technical debt should we address before adding AI features?"
```

### Technical debt assessment
```bash
# Get comprehensive overview
./bin/devin analyze repo

# Focus on specific areas
./bin/devin ask "What are the most complex parts of the codebase and why?"

# Plan refactoring
./bin/devin ask "What's the safest way to upgrade from Rails 6.1 to 7.2?"
```

## 👥 **Team Collaboration**

### Onboarding new developers
```bash
# Generate comprehensive overview
./bin/devin ask "Create a new developer onboarding guide covering architecture, key files, and development workflow"

# Explain complex parts
./bin/devin ask "Explain the Ember.js frontend integration and how it communicates with Rails"
```

### Documentation generation
```bash
# Export project knowledge
./bin/devin export wiki

# Create API documentation
./bin/devin ask "Generate API documentation for all the controllers in app/controllers/"
```

## 🔧 **Problem Solving**

### Debugging complex issues
```bash
# Get component relationships
./bin/devin ask "Show me all the files that interact with user authentication"

# Trace data flow
./bin/devin ask "Walk through the complete flow when a user creates a new board"

# Find similar issues
./bin/devin ask "Have we had similar database connection issues before?"
```

### Performance optimization
```bash
# Identify bottlenecks
./bin/devin ask "What are the most likely performance bottlenecks in our current architecture?"

# Plan optimizations
./bin/devin ask "How should we implement caching for the communication boards?"
```

## 📊 **Strategic Planning**

### Technology decisions
```bash
# Impact assessment
./bin/devin ask "What would be involved in switching from Ember to React?"

# Risk analysis  
./bin/devin ask "What are the risks of the current Node.js dependency versions?"

# Future planning
./bin/devin ask "How should we prepare the codebase for AI/LLM integration?"
```

### Compliance and security
```bash
# Security review
./bin/devin ask "Audit our authentication system for HIPAA compliance requirements"

# Compliance checking
./bin/devin ask "What changes are needed for COPPA compliance in the user registration flow?"
```