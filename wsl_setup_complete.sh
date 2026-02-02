#!/bin/bash
set -e

echo "=========================================="
echo "LingoLinq WSL Development Setup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}==>${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

# Update package lists
print_step "Updating package lists..."
sudo apt-get update

# Install system dependencies
print_step "Installing system dependencies..."
sudo apt-get install -y \
    build-essential \
    libssl-dev \
    libreadline-dev \
    zlib1g-dev \
    libpq-dev \
    libsqlite3-dev \
    libyaml-dev \
    libxml2-dev \
    libxslt1-dev \
    libcurl4-openssl-dev \
    software-properties-common \
    libffi-dev \
    imagemagick \
    ghostscript \
    curl \
    git

# Install PostgreSQL
print_step "Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    sudo apt-get install -y postgresql postgresql-contrib
    sudo service postgresql start
    echo "PostgreSQL installed and started"
else
    echo "PostgreSQL already installed"
    sudo service postgresql start
fi

# Install Redis
print_step "Installing Redis..."
if ! command -v redis-server &> /dev/null; then
    sudo apt-get install -y redis-server
    sudo service redis-server start
    echo "Redis installed and started"
else
    echo "Redis already installed"
    sudo service redis-server start
fi

# Install rbenv if not present
print_step "Setting up rbenv..."
if [ ! -d "$HOME/.rbenv" ]; then
    git clone https://github.com/rbenv/rbenv.git ~/.rbenv
    echo 'export PATH="$HOME/.rbenv/bin:$PATH"' >> ~/.bashrc
    echo 'eval "$(rbenv init -)"' >> ~/.bashrc

    # Install ruby-build plugin
    git clone https://github.com/rbenv/ruby-build.git ~/.rbenv/plugins/ruby-build
else
    echo "rbenv already installed"
fi

# Load rbenv for this session
export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init -)"

# Install Ruby 3.4.4
print_step "Installing Ruby 3.4.4..."
if rbenv versions | grep -q "3.4.4"; then
    echo "Ruby 3.4.4 already installed"
else
    rbenv install 3.4.4
fi
rbenv global 3.4.4

# Install bundler
print_step "Installing bundler..."
gem install bundler

# Install nvm (Node Version Manager)
print_step "Setting up nvm..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
else
    echo "nvm already installed"
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Install Node versions
print_step "Installing Node.js versions..."
nvm install 22
nvm install 20
nvm alias default 22
nvm use 22

# Install bower globally
print_step "Installing bower..."
npm install -g bower

echo ""
echo "=========================================="
echo "Base system setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Close and reopen your terminal (or run: source ~/.bashrc)"
echo "2. Navigate to your project directory"
echo "3. Run the following commands:"
echo ""
echo "   # Set up environment file"
echo "   cp .env.example .env"
echo "   # Edit .env and configure required variables"
echo ""
echo "   # Install backend dependencies"
echo "   bundle install"
echo ""
echo "   # Install frontend dependencies"
echo "   cd app/frontend"
echo "   npm install"
echo "   bower install"
echo "   cd ../.."
echo ""
echo "   # Set up database"
echo "   rails db:create"
echo "   rails db:migrate"
echo "   rails db:seed  # Optional"
echo ""
echo "   # Start the application"
echo "   bin/fresh_start"
echo ""
print_warning "Make sure to configure your .env file with required values!"
print_warning "Minimum required: REDIS_URL, SECURE_ENCRYPTION_KEY, SECURE_NONCE_KEY, COOKIE_KEY, DEFAULT_HOST"
