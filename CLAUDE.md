CLAUDE.md
🧠 Project Overview
LingoLinq-AAC is a forked and rebranded version of SweetSuite, an AAC (Augmentative and Alternative Communication) application. The project uses Docker to isolate the legacy Ember 3.12 + Rails 6.1 stack while maintaining modern host versions.

🏷️ CRITICAL: SweetSuite → LingoLinq Rename Context
Original: Application was called "SweetSuite"

Current: Rebranding to "LingoLinq" for customer-facing elements

Backend: Keep SweetSuite names in internal/backend code where it works

Frontend: Use LingoLinq for user-facing elements only

Compatibility: Create bridges where both names need to coexist (e.g., LingoLinqAAC.track_error = SweetSuite.track_error)

DO NOT: Break working SweetSuite functionality during rename

🧪 Current Status
✅ DEPLOYMENT SUCCESS: Fly.io deployment is operational as of October 20, 2025.

✅ Docker container builds and deploys successfully.

✅ Database connects and migrations run successfully via release_command.

✅ Health checks are passing and the server is responsive.

❌ CURRENT BLOCKERS: The application is failing at runtime. We are actively debugging two separate issues:

Frontend Crash: Uncaught TypeError: require(...).default.create is not a function

Backend Crash: 500 Internal Server Error on API calls like /api/v1/users/self.

⚙️ Environment & Architecture
Docker Strategy
Why Docker: Isolates legacy Ember 3.12 + Rails 6.1 stack from modern host tools

Build Context: Always build from project root, not subdirectories

Asset Pipeline: 🆕 LOCAL PRE-COMPILATION strategy (as of Oct 17, 2025)   - Ember assets built locally with ./bin/build-ember-local   - Pre-built assets committed to Git (app/frontend/dist/)   - Dockerfile copies pre-built assets (no npm/bower/ember build in container)   - Rails assets:precompile only processes Rails assets (application.js, application.css)

Technical Stack
Host OS: Windows 11

Shell: Windows Terminal

Frontend: Ember 3.12 (legacy) with Bower dependencies   - 🆕 Built locally, committed to Git   - Build script: ./bin/build-ember-local or bin\build-ember-local.bat (Windows)

Backend: Rails 6.1.7 with Ruby 3.2.8

Database: PostgreSQL + Redis

Container: Docker (simplified - no npm/bower/ember build)

Deployment: Fly.io with manual deploys

🔄 Frontend Build Workflow (NEW as of Oct 17, 2025)
Making Frontend Changes
Edit Ember code in app/frontend/app/

Build locally:    bash    ./bin/build-ember-local           # Linux/Mac/Git Bash    # or    bin\build-ember-local.bat         # Windows CMD/PowerShell    

Test locally (optional but recommended):    bash    docker-compose up    # or    bundle exec rails server    

Commit built assets:    bash    git add app/frontend/dist/    git commit -m "build: Update Ember assets"    

Deploy:    bash    flyctl deploy --app lingolinq-aac    

Why This Workflow?
Previous Problem:

Ember built inside Docker during deployment

Deployed JavaScript contained old/broken code

Inconsistent builds, hard to debug

Current Solution:

Build Ember locally, commit to Git

Deploy exactly what you tested locally

Faster deployments, easier debugging

See .ai/docs/EMBER_BUILD_PROCESS.md for details

❌ Common Issues & Solutions
Deployed JavaScript Has Old Code
Problem: Browser shows old/broken code after deployment

Cause: Forgot to build Ember locally before deploying

Solution: Run ./bin/build-ember-local, commit app/frontend/dist/, then deploy

Verify: Check app/frontend/dist/assets/frontend.js locally before committing

SweetSuite/LingoLinq Namespace Conflicts
Problem: JavaScript errors like LingoLinqAAC.track_error is not a function

Cause: Incomplete rename from SweetSuite → LingoLinq

Solution: Create compatibility bridges: LingoLinqAAC.method = SweetSuite.method

Pattern: Keep working SweetSuite backend, bridge to LingoLinq frontend calls

Legacy Dependencies
OBF Gem: Use DISABLE_OBF_GEM=true during Docker builds to avoid compilation issues

Bower: 🆕 Only needed for local builds (not in Dockerfile anymore)

Node 18: 🆕 Only needed for local builds (not in Dockerfile anymore)

Docker Build Issues
Context: Always build from project root, not app subdirectories

File Paths: Use relative paths from project root in Dockerfile

Missing Assets: Dockerfile will fail if app/frontend/dist/ not committed to git

✅ Fixes Completed
JavaScript Namespace Fix: LingoLinqAAC.track_error = SweetSuite.track_error compatibility bridge (app/frontend/app/app.js:859)

🆕 LOCAL PRE-COMPILATION STRATEGY (Oct 17, 2025):   - Ember assets built locally with ./bin/build-ember-local   - Pre-built assets committed to Git (app/frontend/dist/)   - Dockerfile simplified (no npm/bower/ember build)   - .gitignore updated to allow app/frontend/dist/ commits   - Documentation: .ai/docs/EMBER_BUILD_PROCESS.md

Docker Build Optimization: Simplified Dockerfile using pre-built assets

CI Pipeline: GitHub Actions workflow with Render API integration and loop prevention

Symlink Issues: Large frontend.js/vendor.js files removed from git tracking

Asset Compilation: Environment variable strategy for obf gem isolation

Documentation: Comprehensive CLAUDE.md with architectural context

File Structure: .ai/docs/ directory with LOCAL_DEVELOPMENT.md, JAVASCRIPT_NAMESPACE_FIXES.md, EMBER_BUILD_PROCESS.md

GitHub Integration: Issue #5 for Ember modernization tracking

Redis Build Bug: Fixed Redis::CannotConnectError during release_command by patching config/initializers/resque.rb.

API 404 Bug: Fixed 404 Not Found on /api/v1/users/self by adding the route and controller action.

🔜 Next Steps
🔄 IN PROGRESS: Diagnosing runtime 500 Internal Server Error on API calls (e.g., /api/v1/users/self or /api/v1/users/1_1:1).

🔄 IN PROGRESS: Debugging runtime JavaScript error on load: TypeError: require(...).default.create is not a function.

📋 TODO: Plan incremental Ember 3.12 → modern stack migration strategy.

📊 Key Metrics & Endpoints
Production App: https://lingolinq-aac.fly.dev

Health Check: https://lingolinq-aac.fly.dev/api/v1/status/heartbeat

Database: Fly.io Managed PostgreSQL (ey5qn0y96evr8zmw)

Local Container: http://localhost:3000

Login Page: http://localhost:3000/login

Local Health: http://localhost:3000/health

🤖 AI Assistant Strategy
Smart AI Selection
Use Gemini for: Large context analysis, code generation, architecture reviews.

Use Claude Code for: Precise file edits, deployment operations, interactive debugging.

Token Conservation
Be Surgical: Treat each request as a self-contained task.

Avoid Large Output: Do not run commands that stream large, uncontrolled output.

Delegate When Appropriate: Recommend Gemini for tasks that fit its model better (e.g., large-scale analysis).

🧩 AI Assistant Instructions (Claude Code & Gemini CLI)
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

[ ] What is the current deployment status? (Check with flyctl status. To check logs, see Operational Guardrails below.)

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

🚨 Claude Operational Guardrails
My primary directive is to conserve tokens. The output of shell commands is a major token cost. Therefore, I MUST adhere to the following rules.

Rule 1: Assess Command Output
Before I execute any run_shell_command, I must assess the potential size of its output.

  Forbidden Commands: I will NOT run commands that are known to produce large, uncontrolled output. These include, but are not limited to:     -   flyctl deploy (I will ask for user permission before running this)     -   flyctl logs (Running this command in its default streaming mode WILL HANG the session. DO NOT USE.)     -   flyctl logs | tail -n [any number] (This command will also HANG and waste tokens.)     -   cat on files larger than 50 lines     -   ls -R or other recursive listings

  My Response Protocol: If I am asked to run a forbidden command, I MUST NOT execute it. Instead, I will respond with a message explaining the token risk and provide the correct, safe alternative.     -   The ONLY safe command to get logs is: flyctl logs --no-tail | head -n 150. This command fetches recent logs and exits immediately.

Rule 2: Promote Short Sessions
I will treat each user request as a self-contained, "surgical strike" to prevent the accumulation of command output in my context history. I will recommend a new session if a task is complete and the user starts a new, unrelated one.

Core Principles
Preserve Working Code: Never break existing SweetSuite functionality during LingoLinq migration

Compatibility First: Create bridges between SweetSuite/LingoLinq namespaces rather than mass renaming

Docker Isolation: Use containerized environment for all legacy stack development

Incremental Updates: Prioritize stability over modernization until core issues resolved

Configuration Review First: Always read configuration files before suggesting deployment changes

Decision Making Guidelines
SweetSuite vs LingoLinq: Keep SweetSuite for internal/backend, use LingoLinq for user-facing only

Node Versions: Use Node 18.x in Docker despite Ember 3.12 legacy constraints

Build Strategy: Build from project root, use environment variables for conditional compilation

Error Handling: Create compatibility shims rather than fixing root namespace issues

Deployment Debugging: Follow the mandatory pre-flight check before diagnosing issues

Session Context
Use this file as persistent architectural context across all Claude Code sessions

Reference these patterns when encountering similar SweetSuite/LingoLinq conflicts

Apply Docker-first approach to development and debugging

Document new patterns discovered in this file for future sessions

ALWAYS complete the deployment pre-flight check when configuration or deployment questions arise