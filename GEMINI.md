GEMINI.md
🧠 LingoLinq-AAC Project Context
LingoLinq-AAC is a forked and rebranded AAC (Augmentative and Alternative Communication) application originally called "SweetSuite". This file provides essential context for Gemini AI sessions.

🏷️ CRITICAL: SweetSuite → LingoLinq Rename Strategy
The Rename Challenge
Original: Application was "SweetSuite"

Current: Rebranding to "LingoLinq" for customer-facing elements

Problem: Incomplete rename causing JavaScript namespace conflicts

Resolution Strategy
Backend: Keep SweetSuite names in internal/backend code where it works

Frontend: Use LingoLinq for user-facing elements only

Compatibility: Create bridges where both names coexist

Example: LingoLinqAAC.track_error = SweetSuite.track_error

Rule: NEVER break working SweetSuite functionality during rename

🐳 Docker Architecture
Why Docker?
Isolates legacy Ember 3.12 + Rails 6.1 stack from modern host tools

Allows development on Windows while using Linux container environment

Prevents version conflicts between legacy and modern tooling

Key Technical Details
Node Version: Use Node 18.x (works despite Ember 3.12 legacy constraints)

Build Context: Always build from project root, never subdirectories

Asset Pipeline: Rails precompilation with conditional obf gem loading

Environment Variables: Use DISABLE_OBF_GEM=true for stable builds

🔧 Common Issues & Patterns
JavaScript Namespace Conflicts
JavaScript

// Problem: LingoLinqAAC.track_error is not a function
// Solution: Create compatibility bridge
LingoLinqAAC.track_error = function(msg, stack) {
  return SweetSuite.track_error(msg, stack);
};
Docker Build Issues
Large JS files removed from git (symlink issues in GitHub Actions)

Use relative paths from project root in Dockerfile

Install bower with --allow-root flag in container

Legacy Dependencies
OBF Gem: Conditional loading to avoid compilation errors

Bower: Required for legacy frontend dependencies

Ember 3.12: Legacy but stable, upgrade planned incrementally

📍 Key Files & Locations
Critical Files
app/frontend/app/app.js:859 - JavaScript namespace compatibility bridge

docker/Dockerfile - Multi-stage build with Node 18.x

config/initializers/obf_footer.rb - Conditional obf gem loading

.github/workflows/deploy-fixer.yml - Automated deployment monitoring

Documentation
CLAUDE.md - Claude Code session context

.ai/docs/LOCAL_DEVELOPMENT.md - Development setup guide

.ai/docs/JAVASCRIPT_NAMESPACE_FIXES.md - Namespace conflict solutions

🌐 Deployment & Services
Local Development
Container: http://localhost:3000

Login: http://localhost:3000/login

Health: http://localhost:3000/health

Production (Fly.io)
URL: https://lingolinq-aac.fly.dev

App Name: lingolinq-aac

CI/CD: Deployed from the fix/deploy-single-stage branch

🎯 Core Principles for AI Sessions
Compatibility First: Create bridges, don't break working code

Docker Isolation: Use containerized environment for legacy stack

Incremental Updates: Stability over modernization until core issues resolved

Pattern Recognition: Apply SweetSuite/LingoLinq compatibility patterns consistently

Configuration Review First: Always read configuration files before suggesting deployment changes

🚨 MANDATORY PRE-FLIGHT CHECK: Deployment Questions
CRITICAL: When ANY user request involves deployment, configuration, or production issues, you MUST complete this analysis BEFORE suggesting solutions.

Quick Reference: See .ai/DEPLOYMENT_CHECKLIST.md for detailed examples, red flags, and troubleshooting patterns.

Phase 1: Read Critical Configuration Files
Read these files in order and summarize key findings:

README.md - Understand project history (Heroku fork), proven deployment methods, current status

.env.example - Identify ALL required environment variables and secrets

fly.toml - Analyze deployment config, Dockerfile reference, release commands, health checks

Dockerfile.singlestage - Understand build process, dependencies, environment setup

config/puma.rb - Verify web server binding configuration (MUST bind to 0.0.0.0)

bin/render-start.sh - Check startup command (MUST use -C config/puma.rb)

Phase 2: Verify Current State
Before suggesting changes, verify:

[ ] Which Dockerfile is fly.toml using?

[ ] Are all required secrets configured? (DATABASE_URL, SECRET_KEY_BASE, RAILS_MASTER_KEY, DISABLE_OBF_GEM)

[ ] Is Puma binding to 0.0.0.0 (not localhost or 127.0.0.1)?

[ ] Is the startup script using -C config/puma.rb?

[ ] What is the current deployment status? (Delegate to Claude Code for flyctl status or flyctl logs)

Phase 3: Understand Known Issues
Check CLAUDE.md sections:

Current Status: What's already working?

Common Issues & Solutions: Has this been solved before?

Fixes Completed: What was already attempted?

Phase 4: Only THEN Suggest Solutions
After completing phases 1-3, provide:

Summary: Brief overview of what you found

Root Cause: Specific issue identified

Solution: Targeted fix with file references and line numbers

Verification: How to confirm the fix worked

DO NOT skip this process. Many deployment issues are configuration mismatches that only become clear after reviewing all files together.

Token Conservation Note: Reading files (Phase 1) is LOW token cost. Running deployment commands without understanding the configuration first is HIGH token cost and often leads to wasted debugging cycles.

🔄 Session Continuity
This file ensures Gemini AI sessions have persistent context about:

Why namespace conflicts occur (incomplete SweetSuite → LingoLinq rename)

How to resolve them (compatibility bridges, not mass renaming)

Docker strategies and architectural decisions

Proven patterns and successful solutions

Update this file when discovering new patterns or architectural insights.

🚨 Gemini Operational Guardrails
My primary directive is to conserve tokens. The output of shell commands is a major token cost. Therefore, I MUST adhere to the following rules to protect my daily token budget.

Rule 1: Assess Command Output
Before I execute any run_shell_command, I must first assess the potential size of its output.

  Forbidden Commands: I will NOT run commands that are known to produce large, uncontrolled output. These include, but are not limited to:     -   flyctl deploy     -   flyctl logs (Running this command in its default streaming mode WILL HANG the session. DO NOT USE.)     -   flyctl logs | tail -n [any number] (This command will also HANG and waste tokens.)     -   cat on files larger than 50 lines     -   ls -R or other recursive listings

  My Response Protocol: If I am asked to run a forbidden command, I MUST NOT execute it. Instead, I will respond with a message explaining the token risk and provide safer alternatives:     1.  Suggest the correct, non-streaming log command. The only safe command to get logs is: flyctl logs --no-tail | head -n 150. This command fetches recent logs and exits immediately.     2.  Recommend a more appropriate tool for the job. (e.g., "For deployments, please use Claude Code, which is more efficient for this task.")

Rule 2: Task Delegation
I will proactively delegate tasks that are not a good fit for my token model.

  Use Gemini CLI for (Low Token Cost):     -   Analysis & Refactoring: Reading specific files to understand logic and suggest improvements.     -   Code Generation: Writing new functions, tests, or documentation. D. -   Targeted Questions: Answering specific questions that have small, precise answers.     -   Filtered Log Review: Searching logs for specific error messages.

  Delegate to Claude Code for (High Token Cost):     -   Deployments: Running flyctl deploy and monitoring the output.     -   Interactive Debugging: Long troubleshooting sessions with many sequential commands.     -   Viewing Full Logs: When you need to see more than 20-30 lines of logs.

Rule 3: Promote Short Sessions
I will treat each user request as a self-contained, "surgical strike" to prevent the accumulation of command output in my context history. I should remind the user that starting a new session for a new task is more token-efficient.