#!/bin/bash

# LingoLinq Environment Verification Script
# This script verifies that the development environment meets project constraints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 LingoLinq Environment Verification${NC}"
echo "=================================="

# Load constraints
CONSTRAINTS_FILE="$(dirname "$0")/project-constraints.json"
if [[ ! -f "$CONSTRAINTS_FILE" ]]; then
    echo -e "${RED}❌ ERROR: project-constraints.json not found${NC}"
    exit 1
fi

# Function to extract JSON values (basic implementation)
get_json_value() {
    local file="$1"
    local path="$2"
    grep -o "\"$path\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" | cut -d'"' -f4
}

# Get required versions
REQUIRED_RUBY=$(get_json_value "$CONSTRAINTS_FILE" "required" | head -1)
REQUIRED_NODE_MIN=$(get_json_value "$CONSTRAINTS_FILE" "minimum")
REQUIRED_NODE_MAX=$(get_json_value "$CONSTRAINTS_FILE" "maximum")

echo -e "${BLUE}Expected Versions:${NC}"
echo "  Ruby: $REQUIRED_RUBY"
echo "  Node.js: $REQUIRED_NODE_MIN to $REQUIRED_NODE_MAX"
echo ""

# Check Ruby version
echo -e "${BLUE}Checking Ruby version...${NC}"
if command -v ruby >/dev/null 2>&1; then
    CURRENT_RUBY=$(ruby -v | cut -d' ' -f2 | cut -d'p' -f1)
    echo "  Current Ruby: $CURRENT_RUBY"
    
    if [[ "$CURRENT_RUBY" == "$REQUIRED_RUBY" ]]; then
        echo -e "  ${GREEN}✅ Ruby version correct${NC}"
    else
        echo -e "  ${RED}❌ Ruby version mismatch! Required: $REQUIRED_RUBY, Found: $CURRENT_RUBY${NC}"
        echo -e "  ${YELLOW}⚠️  This will cause Rails 6.1 compatibility issues${NC}"
        exit 1
    fi
else
    echo -e "  ${RED}❌ Ruby not found${NC}"
    exit 1
fi

# Check Node.js version
echo -e "${BLUE}Checking Node.js version...${NC}"
if command -v node >/dev/null 2>&1; then
    CURRENT_NODE=$(node -v | sed 's/v//')
    CURRENT_NODE_MAJOR=$(echo "$CURRENT_NODE" | cut -d'.' -f1)
    echo "  Current Node.js: $CURRENT_NODE"
    
    if [[ "$CURRENT_NODE_MAJOR" == "18" ]]; then
        echo -e "  ${GREEN}✅ Node.js version compatible with Ember 3.12${NC}"
    else
        echo -e "  ${RED}❌ Node.js version incompatible! Required: 18.x, Found: $CURRENT_NODE${NC}"
        echo -e "  ${YELLOW}⚠️  This will break Ember 3.12 build process${NC}"
        
        if [[ "$CURRENT_NODE_MAJOR" -gt 18 ]]; then
            echo -e "  ${YELLOW}💡 Consider using Node Version Manager (nvm) to switch to Node.js 18${NC}"
            echo -e "     nvm install 18.20.4"
            echo -e "     nvm use 18.20.4"
        fi
        exit 1
    fi
else
    echo -e "  ${RED}❌ Node.js not found${NC}"
    exit 1
fi

# Check package managers
echo -e "${BLUE}Checking package managers...${NC}"

if command -v bundle >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Bundler found${NC}"
else
    echo -e "  ${YELLOW}⚠️  Bundler not found. Install with: gem install bundler${NC}"
fi

if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm -v)
    echo -e "  ${GREEN}✅ NPM found (v$NPM_VERSION)${NC}"
else
    echo -e "  ${RED}❌ NPM not found${NC}"
fi

if command -v bower >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Bower found${NC}"
else
    echo -e "  ${YELLOW}⚠️  Bower not found. Install with: npm install -g bower${NC}"
fi

if command -v ember >/dev/null 2>&1; then
    EMBER_VERSION=$(ember --version | grep "ember-cli" | cut -d':' -f2 | xargs)
    echo -e "  ${GREEN}✅ Ember CLI found ($EMBER_VERSION)${NC}"
else
    echo -e "  ${YELLOW}⚠️  Ember CLI not found. Install with: npm install -g ember-cli@3.12.0${NC}"
fi

# Check development services
echo -e "${BLUE}Checking development services...${NC}"

if command -v psql >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ PostgreSQL client found${NC}"
else
    echo -e "  ${YELLOW}⚠️  PostgreSQL client not found${NC}"
fi

if command -v redis-cli >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Redis client found${NC}"
else
    echo -e "  ${YELLOW}⚠️  Redis client not found${NC}"
fi

# Check Docker if using containerized development
if command -v docker >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Docker found${NC}"
    if command -v docker-compose >/dev/null 2>&1; then
        echo -e "  ${GREEN}✅ Docker Compose found${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Docker Compose not found${NC}"
    fi
fi

# Summary
echo ""
echo -e "${GREEN}🎉 Environment verification completed${NC}"
echo ""
echo -e "${BLUE}Next steps for LingoLinq development:${NC}"
echo "  1. If using Docker: docker-compose -f docker-compose.dev.yml up"
echo "  2. If using local: bundle install && cd app/frontend && npm install && bower install"
echo "  3. Setup database: rails extras:assert_js && rails db:create db:migrate db:seed"
echo "  4. Start services: foreman start (or individual services)"
echo ""
echo -e "${YELLOW}⚠️  Remember: Never upgrade Node.js beyond 18.x or Ruby beyond 3.2.8 without testing${NC}"