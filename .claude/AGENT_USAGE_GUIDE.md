# Claude Code Agent Usage Guide

## 🤖 Available Specialized Agents

Claude Code has built-in subagents accessible via the `Task` tool. These run autonomously and report results back.

### General-Purpose Agent
**Use for:** Complex research, code search, multi-step tasks requiring iteration

**Example:**
```javascript
Task({
  subagent_type: "general-purpose",
  description: "Search for authentication code",
  prompt: "Find all authentication-related code in the app, focusing on session management and user login flows. Report back file locations and implementation patterns."
})
```

**When to use:**
- Searching for patterns across multiple files
- Researching how a feature is implemented
- Gathering information that requires multiple grep/read operations
- Tasks where you're not confident you'll find the right match in first few tries

### Statusline-Setup Agent
**Use for:** Configuring Claude Code status line settings

**Example:**
```javascript
Task({
  subagent_type: "statusline-setup",
  description: "Configure status line",
  prompt: "Set up the status line to show current git branch, Memory-Keeper session, and deployment status"
})
```

### Output-Style-Setup Agent
**Use for:** Creating custom Claude Code output styles

**Example:**
```javascript
Task({
  subagent_type: "output-style-setup",
  description: "Create deployment output style",
  prompt: "Create an output style for deployment logs that highlights errors in red and success messages in green"
})
```

## 🎯 Parallel Agent Execution

**Strategy:** Spawn multiple agents simultaneously to maximize efficiency

**Example - Deployment Readiness Check:**
```javascript
// Run all these in parallel with a single message containing multiple Task calls
Task({
  subagent_type: "general-purpose",
  description: "Verify Dockerfile completeness",
  prompt: "Check Dockerfile.singlestage has all required build steps: bundler install, npm install, bower install, ember build, rails assets precompile. Report any missing steps."
})

Task({
  subagent_type: "general-purpose",
  description: "Check deployment configs",
  prompt: "Review fly.toml, render.yaml, and railway.json for configuration issues. Report any misconfigurations or missing environment variables."
})

Task({
  subagent_type: "general-purpose",
  description: "Audit documentation",
  prompt: "Check that DEBUGGING_LOG.md, CLAUDE.md, and GEMINI.md are up-to-date with latest deployment attempts and solutions. Report any outdated information."
})
```

## 📋 Deployment-Specific Agent Patterns

### Pre-Deployment Validation
```javascript
Task({
  subagent_type: "general-purpose",
  description: "Pre-deployment validation",
  prompt: `Perform pre-deployment checks:
  1. Verify Dockerfile.singlestage syntax is valid
  2. Check all required files exist (Gemfile, package.json, fly.toml)
  3. Confirm no large binary files in build context (.dockerignore configured)
  4. Validate environment variable references
  Report: Ready for deployment (yes/no) and any blockers found`
})
```

### Post-Deployment Analysis
```javascript
Task({
  subagent_type: "general-purpose",
  description: "Analyze deployment logs",
  prompt: `Analyze the deployment logs for:
  1. Bundler version used (should be 2.7.1)
  2. Any gem loading errors
  3. Rails asset compilation success/failure
  4. Container startup errors
  Extract and summarize any ERROR or FATAL log lines`
})
```

### Code Pattern Search
```javascript
Task({
  subagent_type: "general-purpose",
  description: "Find SweetSuite references",
  prompt: `Search the entire codebase for remaining SweetSuite namespace references that might conflict with LingoLinq branding. Focus on:
  - JavaScript files (*.js, *.jsx)
  - View templates (*.erb, *.hbs)
  - Configuration files
  Report file locations and line numbers`
})
```

## 🚀 Integration with Memory-Keeper

Agents can save their findings directly to Memory-Keeper:

```javascript
Task({
  subagent_type: "general-purpose",
  description: "Research and log findings",
  prompt: `Research how the OBF gem is used in the codebase. After research:
  1. Save findings to Memory-Keeper with key 'obf-gem-usage'
  2. Include: files that reference it, why it was disabled, alternatives
  3. Category: 'note', Priority: 'normal'
  Use session ID: 14b615ae-deac-4eb7-9dc0-1fd2cc33eab7`
})
```

## ⚡ Best Practices

### DO:
- ✅ Use parallel agents for independent tasks
- ✅ Be specific about what the agent should report back
- ✅ Set clear success criteria in the prompt
- ✅ Have agents save important findings to Memory-Keeper
- ✅ Use agents for repetitive searches across large codebases

### DON'T:
- ❌ Use agents for simple file reads (use Read tool directly)
- ❌ Use agents for single grep operations (use Grep tool)
- ❌ Use agents for tasks requiring user interaction
- ❌ Make agents dependent on each other (run sequentially instead)

## 📝 Agent Handoff Protocol

When handing off complex tasks to Gemini CLI while Claude Code supervises:

1. **Claude Code sets up the environment:**
   - Create branch
   - Initialize Memory-Keeper session
   - Save context about the problem

2. **Spawn research agent:**
```javascript
Task({
  subagent_type: "general-purpose",
  description: "Create Gemini handoff doc",
  prompt: `Create a detailed handoff document for Gemini CLI:
  - Current problem summary
  - What's been tried (read from Memory-Keeper)
  - Specific tasks for Gemini
  - Success criteria
  - How to report results
  Save to .ai/GEMINI_HANDOFF.md`
})
```

3. **Gemini executes heavy lifting**
4. **Claude Code review agent validates results:**
```javascript
Task({
  subagent_type: "general-purpose",
  description: "Validate Gemini results",
  prompt: `Read Memory-Keeper session 14b615ae for Gemini's test results.
  Validate:
  - All required tests were run
  - Results are conclusive
  - No circular attempts (compare with previous attempts)
  Report: Ready to proceed (yes/no) and reasoning`
})
```

## 🎯 Custom Slash Commands Created

You can now use these streamlined commands:

- `/deploy-test` - Build and test Dockerfile.singlestage locally
- `/deploy-fly` - Deploy to Fly.io after validation
- `/rollback` - Emergency rollback to previous deployment

These commands integrate with Memory-Keeper for persistent tracking.
