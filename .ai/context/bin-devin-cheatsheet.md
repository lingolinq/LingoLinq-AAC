# bin/devin Command Cheatsheet

Quick reference for LingoLinq AAC project AI assistance commands.

## Context Management
```bash
bin/devin context          # Get full project context
bin/devin update           # Update context from recent changes  
bin/devin generate         # Generate fresh architecture map
```

## Claude Code Commands (Senior Dev Decisions)
```bash
bin/devin ask "question"                    # Ask Claude with full project context
bin/devin review HEAD~5..HEAD               # Claude code review with context
bin/devin analyze repo                      # Claude architecture analysis
bin/devin analyze changes                   # Claude recent changes analysis
```

## Gemini Commands (Heavy Lifting Tasks)
```bash
bin/devin gemini "question"                 # Ask Gemini with full project context
bin/devin review-gemini HEAD~5..HEAD       # Gemini detailed code review
bin/devin analyze-gemini repo               # Gemini comprehensive architecture analysis
bin/devin analyze-gemini changes            # Gemini detailed recent changes analysis
```

## Specialized Commands
```bash
bin/devin deepwiki <url>                    # Aggregate DeepWiki content
bin/devin export wiki                       # Export context as markdown
```

## Multi-Model Workflow Examples

### Architecture Decisions (Claude)
```bash
bin/devin ask "Should we migrate from Ember to React?"
bin/devin ask "Best approach for implementing user permissions?"
bin/devin review HEAD~3..HEAD               # Quick review for merge decisions
```

### Detailed Analysis (Gemini) 
```bash
bin/devin gemini "Generate comprehensive test coverage report and recommendations"
bin/devin gemini "Analyze all performance bottlenecks in our Rails controllers"
bin/devin analyze-gemini repo               # Deep technical debt analysis
bin/devin gemini "Create detailed migration plan for Ruby 3.2 upgrade"
```

### Code Reviews
```bash
# Quick senior dev review
bin/devin review HEAD~1

# Detailed analysis with suggestions  
bin/devin review-gemini HEAD~1
```

### Performance Analysis
```bash
# Strategic overview
bin/devin ask "What are our top 3 performance priorities?"

# Deep technical analysis
bin/devin gemini "Analyze database queries and suggest specific optimizations"
```

## Tips

**Token Management:**
- Use Claude for quick decisions and architecture guidance
- Use Gemini for detailed analysis, documentation, and large refactoring tasks

**Context Freshness:**
- Both commands automatically update project context before running
- Always provides current git status, recent changes, and architecture overview

**Branch Isolation:**
- Commands work from any directory in the project
- Context includes current branch and uncommitted changes

**When to Use Which:**
- **Claude:** "What should we do?" (strategy, decisions, quick reviews)
- **Gemini:** "How should we do it?" (detailed implementation, comprehensive analysis)