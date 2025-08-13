#!/bin/bash
# Advanced DeepWiki Integration Examples for Senior Developers

# 1. PRE-COMMIT HOOK INTEGRATION
# Add to .git/hooks/pre-commit
echo "🔍 AI-powered pre-commit review..."
./bin/devin ask "Review these staged changes for potential issues: $(git diff --cached --name-only | tr '\n' ' ')"

# 2. CI/CD INTEGRATION  
# Add to .github/workflows/code-review.yml
echo "📊 Generating AI code review for PR..."
./bin/devin ask "Analyze this pull request for architectural concerns, security issues, and code quality"

# 3. AUTOMATED DOCUMENTATION UPDATES
# Update docs when code changes
if [[ $(git diff --name-only HEAD~1 | grep -E "app/models|app/controllers") ]]; then
    echo "📝 Updating API documentation..."
    ./bin/devin ask "Generate updated API documentation for changed controllers"
fi

# 4. PERFORMANCE MONITORING INTEGRATION
# Daily performance analysis
./bin/devin ask "Based on recent changes, what performance metrics should we monitor?"

# 5. SECURITY SCANNING INTEGRATION  
# Weekly security review
./bin/devin ask "Perform a security audit of changes from the past week"

# 6. DEPENDENCY ANALYSIS
# Check for problematic dependencies
./bin/devin ask "Analyze our Gemfile and package.json for security vulnerabilities and outdated packages"

# 7. LOAD TESTING PREPARATION
# Before major releases
./bin/devin ask "What components should we load test based on recent architecture changes?"

# 8. INCIDENT RESPONSE AUTOMATION
# When alerts fire
./bin/devin ask "Given this error: '$ERROR_MESSAGE', what are the most likely causes and troubleshooting steps?"

# 9. CODE COMPLEXITY ANALYSIS
# Weekly code health check  
./bin/devin ask "Identify the most complex parts of our codebase and suggest simplification strategies"

# 10. TECHNICAL DEBT TRACKING
# Monthly technical debt review
./bin/devin ask "Create a prioritized list of technical debt items with impact and effort estimates"