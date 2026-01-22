#!/bin/bash

# LingoLinq Full Stack Startup Script (Development)
# This script starts Rails + Ember for quick development testing
# For full environment (with Redis/Resque), use: bin/fresh_start

echo "🚀 LingoLinq Development Server"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "Gemfile" ] || [ ! -d "app/frontend" ]; then
    echo -e "${RED}❌ Error: Must run from LingoLinq-AAC root directory${NC}"
    exit 1
fi

echo "📋 Checking prerequisites..."

# Check Ruby
if ! command -v ruby &> /dev/null; then
    echo -e "${RED}❌ Ruby not found. Please install Ruby ~3.4.3${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Ruby $(ruby -v | awk '{print $2}')${NC}"

# Check Node (root level - should be 20)
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js${NC}"
    exit 1
fi
ROOT_NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node $ROOT_NODE_VERSION (root)${NC}"

# Check if nvm is available for Node 18
NVM_AVAILABLE=false
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    NVM_AVAILABLE=true
    echo -e "${GREEN}✅ nvm available${NC}"
elif [ -s "/usr/local/share/nvm/nvm.sh" ]; then
    source "/usr/local/share/nvm/nvm.sh"
    NVM_AVAILABLE=true
    echo -e "${GREEN}✅ nvm available${NC}"
else
    echo -e "${YELLOW}⚠️  nvm not found (Ember needs Node 18)${NC}"
    echo -e "${YELLOW}   Install nvm or manually use Node 18 for Ember${NC}"
fi

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL client not found. Make sure PostgreSQL is installed and running.${NC}"
else
    echo -e "${GREEN}✅ PostgreSQL $(psql --version | awk '{print $3}')${NC}"
fi

echo ""
echo "🔧 Setting up environment..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating basic .env...${NC}"
    cat > .env << 'ENV_EOF'
# LingoLinq Environment Variables
DB_USER=postgres
RAILS_ENV=development
SECRET_KEY_BASE=development-secret-key-change-in-production
FRONTEND_URL=http://localhost:8184
BACKEND_URL=http://localhost:5000

# Redis (optional for start_dev.sh, required for bin/fresh_start)
REDIS_URL=redis://localhost:6379/
ENV_EOF
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

# Check if gems are installed
if ! bundle check &> /dev/null; then
    echo "📦 Installing Ruby gems..."
    bundle install
fi

# Setup Node 18 for Ember if nvm is available
if [ "$NVM_AVAILABLE" = true ]; then
    echo ""
    echo "🔄 Setting up Node 18 for Ember..."
    cd app/frontend
    nvm install 18 &> /dev/null || true
    nvm use 18
    EMBER_NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Using Node $EMBER_NODE_VERSION for Ember${NC}"
    cd ../..
else
    EMBER_NODE_VERSION=$ROOT_NODE_VERSION
    echo -e "${YELLOW}⚠️  Using Node $EMBER_NODE_VERSION for Ember${NC}"
    echo -e "${YELLOW}   Ember requires Node 18. Install nvm for automatic version switching.${NC}"
fi

# Check if npm packages are installed
if [ ! -d "app/frontend/node_modules" ]; then
    echo "📦 Installing Node packages..."
    cd app/frontend
    if [ "$NVM_AVAILABLE" = true ]; then
        nvm use 18
    fi
    npm install
    # Install bower packages if needed
    if [ ! -d "bower_components" ]; then
        echo "📦 Installing Bower packages..."
        npx bower install
    fi
    cd ../..
fi

# Check database
echo ""
echo "🗄️  Checking database..."
DB_EXISTS=false
if bundle exec rails runner "ActiveRecord::Base.connection" &> /dev/null; then
    echo -e "${GREEN}✅ Database connected${NC}"
    DB_EXISTS=true
else
    echo -e "${YELLOW}⚠️  Database not accessible. Creating...${NC}"
    bundle exec rake db:create
    bundle exec rake db:migrate
    DB_EXISTS=true
    
    # Ask about seeding
    echo ""
    echo -e "${BLUE}❓ Would you like to seed the database with example data?${NC}"
    echo "   This creates:"
    echo "   - User: example / password"
    echo "   - Some starter boards"
    echo ""
    read -p "Seed database? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🌱 Seeding database..."
        bundle exec rake db:seed
        echo -e "${GREEN}✅ Database seeded${NC}"
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  Login Credentials Created:${NC}"
        echo -e "${GREEN}  Username: example${NC}"
        echo -e "${GREEN}  Password: password${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Starting servers..."
echo ""
echo "📍 Rails Backend:  http://localhost:5000"
echo "📍 Ember Frontend: http://localhost:8184"
echo ""
echo -e "${YELLOW}Note: This starts Rails + Ember only (no Redis/Resque)${NC}"
echo -e "${YELLOW}      For full environment, use: bin/fresh_start${NC}"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $RAILS_PID $EMBER_PID 2>/dev/null
    wait $RAILS_PID $EMBER_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start Rails in background
echo "Starting Rails server..."
bundle exec rails s -p 5000 > log/rails_dev.log 2>&1 &
RAILS_PID=$!

# Wait a moment for Rails to start
sleep 3

# Check if Rails started successfully
if ! ps -p $RAILS_PID > /dev/null; then
    echo -e "${RED}❌ Rails failed to start. Check log/rails_dev.log${NC}"
    tail -20 log/rails_dev.log
    exit 1
fi

echo -e "${GREEN}✅ Rails running (PID: $RAILS_PID)${NC}"

# Start Ember with Node 18
echo "Starting Ember server (Node 18)..."
cd app/frontend

# Start Ember with proper Node version
if [ "$NVM_AVAILABLE" = true ]; then
    # Use nvm to ensure Node 18
    bash -c "source $HOME/.nvm/nvm.sh 2>/dev/null || source /usr/local/share/nvm/nvm.sh 2>/dev/null; \
             nvm use 18 &>/dev/null; \
             npx ember serve --port 8184 --proxy http://localhost:5000" > ../../log/ember_dev.log 2>&1 &
else
    # Fallback to system Node
    npx ember serve --port 8184 --proxy http://localhost:5000 > ../../log/ember_dev.log 2>&1 &
fi

EMBER_PID=$!
cd ../..

# Wait a moment for Ember to start
sleep 5

# Check if Ember started successfully
if ! ps -p $EMBER_PID > /dev/null; then
    echo -e "${RED}❌ Ember failed to start. Check log/ember_dev.log${NC}"
    tail -20 log/ember_dev.log
    kill $RAILS_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✅ Ember running (PID: $EMBER_PID, Node: $EMBER_NODE_VERSION)${NC}"

echo ""
echo "🎉 Development servers are running!"
echo ""
echo -e "📱 ${GREEN}Open your browser to: http://localhost:8184${NC}"
echo ""
if [ "$DB_EXISTS" = true ]; then
    echo "🔐 Default login (if seeded):"
    echo "   Username: example"
    echo "   Password: password"
    echo ""
fi
echo "📊 Logs:"
echo "   Rails: tail -f log/rails_dev.log"
echo "   Ember: tail -f log/ember_dev.log"
echo ""
echo "📚 For full environment (with Redis/Resque): bin/fresh_start"
echo ""
echo "Press Ctrl+C to stop all servers..."
echo ""

# Wait for user to stop
wait $RAILS_PID $EMBER_PID
