# CLAUDE.md

## 🧠 Project Overview
Deploy Claude Code locally to validate legacy Ember 3.12 workflows before major repo updates. Use Docker to isolate legacy stack while maintaining modern host versions of Node, Ruby, etc.

## 🧪 Current Status
- Docker container boots and renders startup page
- Page stuck on "loading" and login route never initializes
- Rails backend responds with HTTP 200
- JavaScript namespace errors resolved
- CI pipeline issues fixed
- Claude Code has been running tests and debugging in-session

## ⚙️ Environment
- Host OS: Windows 11
- Shell: Windows Terminal
- Frontend: Ember 3.12 (legacy)
- Backend: Rails
- Container: Docker (Node 18, Ruby, Bower)
- Host Versions: Node 18+, Ruby 3.x

## ❌ Known Issues
- Claude suggests reverting to Node 16 despite Node 18 working in container
- Login page stuck on "loading"—likely frontend runtime or API connectivity issue
- Context window in Claude thread nearly full—risk of losing session history

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

## 🧩 Claude Instructions
- Use this file as persistent context across sessions
- Prioritize debugging frontend loading issue before upgrade
- Avoid suggesting full thread recap unless explicitly requested
- Use subagents for test running and config validation if needed
