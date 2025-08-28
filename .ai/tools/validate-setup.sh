#!/usr/bin/env bash

# Cross-Platform AI Development Environment Validator
# Validates Claude CLI, Gemini CLI, and MCP setup for LingoLinq AAC team

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Icons
SUCCESS="✅"
WARNING="⚠️ "
ERROR="❌"
INFO="ℹ️ "

echo -e "${BLUE}🚀 LingoLinq AAC - AI Development Environment Validator${NC}"
echo "=================================================="

# Function to check if command exists
check_command() {
    local cmd="$1"
    local name="$2"
    local required="$3"
    
    if command -v "$cmd" >/dev/null 2>&1; then
        echo -e "${SUCCESS} $name found: $(which "$cmd")"
        return 0
    else
        if [[ "$required" == "true" ]]; then
            echo -e "${ERROR} $name not found (required)"
            return 1
        else
            echo -e "${WARNING} $name not found (optional)"
            return 0
        fi
    fi
}

# Function to check environment variable
check_env_var() {
    local var="$1"
    local required="$2"
    
    if [[ -n "${!var}" ]]; then
        echo -e "${SUCCESS} $var is set"
        return 0
    else
        if [[ "$required" == "true" ]]; then
            echo -e "${ERROR} $var not set (required)"
            return 1
        else
            echo -e "${WARNING} $var not set (optional)"
            return 0
        fi
    fi
}

# Function to detect platform
detect_platform() {
    case "$(uname -s)" in
        Linux*)     PLATFORM=Linux;;
        Darwin*)    PLATFORM=Mac;;
        CYGWIN*)    PLATFORM=Windows;;
        MINGW*)     PLATFORM=Windows;;
        MSYS*)      PLATFORM=Windows;;
        *)          PLATFORM="Unknown"
    esac
    echo -e "${INFO} Platform detected: $PLATFORM"
}

# Function to check npm configuration
check_npm_config() {
    echo ""
    echo -e "${BLUE}📦 npm Configuration:${NC}"
    
    if ! check_command "npm" "npm" "true"; then
        echo -e "${ERROR} npm is required for CLI installation"
        return 1
    fi
    
    local npm_prefix
    npm_prefix=$(npm config get prefix 2>/dev/null || echo "")
    
    if [[ -n "$npm_prefix" ]]; then
        echo -e "${SUCCESS} npm prefix: $npm_prefix"
        
        # Check if npm bin is in PATH
        local npm_bin="$npm_prefix/bin"
        if [[ "$PLATFORM" == "Windows" ]]; then
            npm_bin="$npm_prefix"
        fi
        
        if echo "$PATH" | grep -q "$npm_bin"; then
            echo -e "${SUCCESS} npm bin directory is in PATH"
        else
            echo -e "${WARNING} npm bin directory ($npm_bin) not in PATH"
            echo -e "         Add this to your shell profile: export PATH=\"$npm_bin:\$PATH\""
        fi
    else
        echo -e "${WARNING} Could not determine npm prefix"
    fi
}

# Function to check AI CLIs
check_ai_clis() {
    echo ""
    echo -e "${BLUE}🤖 AI CLI Tools:${NC}"
    
    local claude_ok=0
    local gemini_ok=0
    
    # Check Claude CLI
    if check_command "claude" "Claude CLI" "true"; then
        local version
        version=$(claude --version 2>/dev/null || echo "Unable to get version")
        echo -e "   Version: $version"
        claude_ok=1
    else
        echo -e "   Install with: ${YELLOW}npm install -g @anthropic-ai/claude-cli${NC}"
    fi
    
    # Check Gemini CLI
    if check_command "gemini" "Gemini CLI" "false"; then
        local version
        version=$(gemini --version 2>/dev/null || echo "Unable to get version")
        echo -e "   Version: $version"
        gemini_ok=1
    else
        echo -e "   Install with: ${YELLOW}npm install -g @google/generative-ai-cli${NC}"
    fi
    
    return $((claude_ok == 1 ? 0 : 1))
}

# Function to check environment variables
check_env_vars() {
    echo ""
    echo -e "${BLUE}🔑 Environment Variables:${NC}"
    
    local anthropic_ok=0
    local google_ok=0
    
    if check_env_var "ANTHROPIC_API_KEY" "true"; then
        anthropic_ok=1
    else
        echo -e "   Set with: ${YELLOW}export ANTHROPIC_API_KEY=\"your-key-here\"${NC}"
    fi
    
    if check_env_var "GOOGLE_AI_API_KEY" "false"; then
        google_ok=1
    else
        echo -e "   Set with: ${YELLOW}export GOOGLE_AI_API_KEY=\"your-key-here\"${NC}"
    fi
    
    return $((anthropic_ok == 1 ? 0 : 1))
}

# Function to check project-specific setup
check_project_setup() {
    echo ""
    echo -e "${BLUE}📁 Project Setup:${NC}"
    
    # Check if we're in the right directory
    if [[ -f "bin/devin" ]]; then
        echo -e "${SUCCESS} bin/devin script found"
    else
        echo -e "${ERROR} bin/devin script not found. Are you in the project root?"
        return 1
    fi
    
    # Check AI context directory
    if [[ -d ".ai/context" ]]; then
        echo -e "${SUCCESS} AI context directory exists"
    else
        echo -e "${WARNING} AI context directory not found"
        echo -e "   Run: ${YELLOW}./bin/devin generate${NC}"
    fi
    
    # Check MCP configuration
    if [[ -f ".ai/tools/mcp/claude-mcp-config.json" ]]; then
        echo -e "${SUCCESS} MCP configuration found"
    else
        echo -e "${WARNING} MCP configuration not found"
    fi
    
    return 0
}

# Function to test AI functionality
test_ai_functionality() {
    echo ""
    echo -e "${BLUE}🧪 Testing AI Functionality:${NC}"
    
    if command -v claude >/dev/null 2>&1 && [[ -n "$ANTHROPIC_API_KEY" ]]; then
        echo -e "${INFO} Testing Claude CLI..."
        if timeout 10s claude "Hello, respond with just 'OK'" 2>/dev/null | grep -q "OK"; then
            echo -e "${SUCCESS} Claude CLI test passed"
        else
            echo -e "${WARNING} Claude CLI test failed or timed out"
        fi
    else
        echo -e "${WARNING} Skipping Claude test (CLI or API key missing)"
    fi
    
    if command -v gemini >/dev/null 2>&1 && [[ -n "$GOOGLE_AI_API_KEY" ]]; then
        echo -e "${INFO} Testing Gemini CLI..."
        if timeout 10s gemini "Hello, respond with just 'OK'" 2>/dev/null | grep -q "OK"; then
            echo -e "${SUCCESS} Gemini CLI test passed"
        else
            echo -e "${WARNING} Gemini CLI test failed or timed out"
        fi
    else
        echo -e "${WARNING} Skipping Gemini test (CLI or API key missing)"
    fi
}

# Function to provide setup recommendations
provide_recommendations() {
    echo ""
    echo -e "${BLUE}💡 Setup Recommendations:${NC}"
    
    echo -e "1. ${INFO} Add to your shell profile (.bashrc, .zshrc, etc.):"
    echo -e "   ${YELLOW}export ANTHROPIC_API_KEY=\"your-key-here\"${NC}"
    echo -e "   ${YELLOW}export GOOGLE_AI_API_KEY=\"your-key-here\"${NC}"
    echo -e "   ${YELLOW}export PATH=\"\$(npm config get prefix)/bin:\$PATH\"${NC}"
    
    echo ""
    echo -e "2. ${INFO} Quick test commands:"
    echo -e "   ${YELLOW}./bin/devin validate${NC}"
    echo -e "   ${YELLOW}./bin/devin ask \"Hello, are you working?\"${NC}"
    
    echo ""
    echo -e "3. ${INFO} Read the complete setup guide:"
    echo -e "   ${YELLOW}cat .ai/tools/TEAM_SETUP.md${NC}"
}

# Main execution
main() {
    local exit_code=0
    
    detect_platform
    
    # Run all checks
    check_npm_config || exit_code=1
    check_ai_clis || exit_code=1
    check_env_vars || exit_code=1
    check_project_setup || exit_code=1
    
    # Test functionality if basic setup is complete
    if [[ $exit_code -eq 0 ]]; then
        test_ai_functionality
    fi
    
    provide_recommendations
    
    echo ""
    if [[ $exit_code -eq 0 ]]; then
        echo -e "${SUCCESS} ${GREEN}All critical components are properly configured!${NC}"
        echo -e "   You're ready to use the LingoLinq AAC AI development tools."
    else
        echo -e "${ERROR} ${RED}Some required components need attention.${NC}"
        echo -e "   Please address the issues above and run this validator again."
    fi
    
    exit $exit_code
}

# Run main function
main "$@"