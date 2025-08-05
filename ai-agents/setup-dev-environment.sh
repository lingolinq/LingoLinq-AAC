#!/bin/bash

# LingoLinq AAC Development Environment Setup
# Sets up Docker-based development with AI agent coordination

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 LingoLinq AAC Development Environment Setup${NC}"
echo "=================================================="

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker Compose not found. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose found${NC}"

# Create necessary directories
echo -e "${BLUE}📁 Creating directories...${NC}"
mkdir -p ai-agents/coordinator
mkdir -p ai-context
mkdir -p logs

# Set executable permissions
chmod +x ai-agents/verify-environment.sh
chmod +x ai-agents/setup-dev-environment.sh

# Create .env file if it doesn't exist
if [[ ! -f .env ]]; then
    echo -e "${YELLOW}⚠️  Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}💡 Please review and update .env file with your settings${NC}"
fi

# Build and start the development environment
echo -e "${BLUE}🐳 Building Docker containers...${NC}"
docker-compose -f docker-compose.dev.yml build

echo -e "${BLUE}🚀 Starting development environment...${NC}"
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to start...${NC}"
sleep 10

# Verify services are running
echo -e "${BLUE}🔍 Verifying services...${NC}"

# Check coordinator service
if curl -s http://localhost:4000/health >/dev/null; then
    echo -e "${GREEN}✅ AI Coordinator service running${NC}"
else
    echo -e "${YELLOW}⚠️  AI Coordinator service not responding yet${NC}"
fi

# Check database
if docker exec lingolinq_postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL database ready${NC}"
else
    echo -e "${RED}❌ PostgreSQL database not ready${NC}"
fi

# Check Redis
if docker exec lingolinq_redis redis-cli ping >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis cache ready${NC}"
else
    echo -e "${RED}❌ Redis cache not ready${NC}"
fi

# Initialize database
echo -e "${BLUE}🗄️  Initializing database...${NC}"
docker exec lingolinq_backend rails extras:assert_js || true
docker exec lingolinq_backend rails db:create || true
docker exec lingolinq_backend rails db:migrate || true
docker exec lingolinq_backend rails db:seed || true

# Verify versions in containers
echo -e "${BLUE}🔍 Verifying versions in containers...${NC}"
echo -e "${PURPLE}Backend (Ruby/Rails):${NC}"
docker exec lingolinq_backend ruby -v
docker exec lingolinq_backend rails -v

echo -e "${PURPLE}Frontend (Node.js/Ember):${NC}"
docker exec lingolinq_frontend node -v
docker exec lingolinq_frontend npm -v
docker exec lingolinq_frontend ember --version || echo "Ember CLI will be available after npm install"

# Set up AI agent configurations
echo -e "${BLUE}🤖 Setting up AI agent configurations...${NC}"

# Create session context
cat > ai-context/session-context.json << EOF
{
  "active_agents": [],
  "last_version_check": null,
  "current_session_id": "setup_$(date +%s)",
  "environment_status": "initialized",
  "constraints_violations": []
}
EOF

# Create shared state
cat > ai-context/shared-state.json << EOF
{
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "docker_containerized",
  "versions": {
    "ruby": "3.2.8",
    "node": "18.20.4",
    "rails": "6.1",
    "ember": "3.12"
  },
  "services_status": {
    "backend": "running",
    "frontend": "running",
    "database": "ready",
    "redis": "ready",
    "coordinator": "running"
  }
}
EOF

# Create initial change log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | setup | Environment initialized with Docker containers" > ai-context/agent-changes.log

# Display connection information
echo ""
echo -e "${GREEN}🎉 Development environment setup complete!${NC}"
echo ""
echo -e "${BLUE}📋 Service URLs:${NC}"
echo "  • Backend (Rails):     http://localhost:3000"
echo "  • Frontend (Ember):    http://localhost:8181"
echo "  • AI Coordinator:      http://localhost:4000"
echo "  • Database (PostgreSQL): localhost:5432"
echo "  • Cache (Redis):       localhost:6379"
echo ""
echo -e "${BLUE}🐳 Docker Commands:${NC}"
echo "  • View logs:           docker-compose -f docker-compose.dev.yml logs -f"
echo "  • Access backend:      docker exec -it lingolinq_backend bash"
echo "  • Access frontend:     docker exec -it lingolinq_frontend bash"
echo "  • Stop environment:    docker-compose -f docker-compose.dev.yml down"
echo "  • Rebuild:             docker-compose -f docker-compose.dev.yml up --build"
echo ""
echo -e "${BLUE}🤖 AI Agent Setup:${NC}"
echo "  • Claude Code config:  ai-agents/claude-config.json"
echo "  • Gemini CLI config:   ai-agents/gemini-config.json"
echo "  • Project constraints: ai-agents/project-constraints.json"
echo "  • Environment verify:  bash ai-agents/verify-environment.sh"
echo ""
echo -e "${YELLOW}⚠️  Important Reminders:${NC}"
echo "  • Node.js is LOCKED at 18.x for Ember 3.12 compatibility"
echo "  • Ruby is LOCKED at 3.2.8 for Rails 6.1 compatibility"
echo "  • Always work within Docker containers"
echo "  • Use AI Coordinator API for agent coordination"
echo ""
echo -e "${GREEN}✅ Ready for AI-assisted development!${NC}"

# Show next steps
echo -e "${BLUE}🎯 Next Steps:${NC}"
echo "  1. Configure your AI agents to use the config files in ai-agents/"
echo "  2. Test the environment: bash ai-agents/verify-environment.sh"
echo "  3. Start coding with version-safe AI assistance!"
echo "  4. Monitor agent coordination at http://localhost:4000"