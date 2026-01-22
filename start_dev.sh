#!/bin/bash

# LingoLinq Full Stack Startup Script

echo "🚀 LingoLinq Full Stack Startup"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check Node
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18.x or 20.x${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node $(node -v)${NC}"

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
ENV_EOF
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

# Check if gems are installed
if ! bundle check &> /dev/null; then
    echo "📦 Installing Ruby gems..."
    bundle install
fi

# Check if npm packages are installed
if [ ! -d "app/frontend/node_modules" ]; then
    echo "📦 Installing Node packages..."
    cd app/frontend
    npm install
    cd ../..
fi

# Check database
echo ""
echo "🗄️  Checking database..."
if bundle exec rails runner "ActiveRecord::Base.connection" &> /dev/null; then
    echo -e "${GREEN}✅ Database connected${NC}"
else
    echo -e "${YELLOW}⚠️  Database not accessible. Attempting to create...${NC}"
    bundle exec rake db:create
    bundle exec rake db:migrate
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Starting servers..."
echo ""
echo "📍 Rails Backend: http://localhost:5000"
echo "📍 Ember Frontend: http://localhost:8184"
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
    exit 1
fi

echo -e "${GREEN}✅ Rails running (PID: $RAILS_PID)${NC}"

# Start Ember in background
echo "Starting Ember server..."
cd app/frontend
npx ember serve --port 8184 --proxy http://localhost:5000 > ../../log/ember_dev.log 2>&1 &
EMBER_PID=$!
cd ../..

# Wait a moment for Ember to start
sleep 5

# Check if Ember started successfully
if ! ps -p $EMBER_PID > /dev/null; then
    echo -e "${RED}❌ Ember failed to start. Check log/ember_dev.log${NC}"
    kill $RAILS_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✅ Ember running (PID: $EMBER_PID)${NC}"

echo ""
echo "🎉 Full stack is running!"
echo ""
echo "📱 Open your browser to: ${GREEN}http://localhost:8184${NC}"
echo ""
echo "📊 Logs:"
echo "   Rails: tail -f log/rails_dev.log"
echo "   Ember: tail -f log/ember_dev.log"
echo ""
echo "Press Ctrl+C to stop all servers..."
echo ""

# Wait for user to stop
wait $RAILS_PID $EMBER_PID
