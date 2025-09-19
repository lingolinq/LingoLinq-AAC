# Optimized LingoLinq Rails Dockerfile
FROM ruby:3.2.8-slim as base

RUN echo "🏗️  STEP 1: Installing system dependencies..."
# Install essential system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    git \
    curl \
    postgresql-client \
    libyaml-dev \
    shared-mime-info \
    libxml2-dev \
    libxslt1-dev \
    libffi-dev \
    libssl-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && echo "✅ System dependencies installed"

RUN echo "🏗️  STEP 2: Installing Node.js..."
# Install Node.js 18.x (required for Rails asset pipeline and Ember compatibility)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && echo "✅ Node.js installed"

# Verify critical versions
RUN echo "🔍 CONTAINER VERSIONS:" && \
    echo "Ruby: $(ruby -v)" && \
    echo "Node: $(node -v)" && \
    echo "NPM: $(npm -v)"

# Set working directory
WORKDIR /app
RUN echo "🏗️  STEP 3: Setting up Ruby environment..."

# Install bundler and copy Gemfiles
RUN gem install bundler && echo "✅ Bundler installed"
COPY Gemfile Gemfile.lock ./

RUN echo "🏗️  STEP 4: Installing Ruby gems..."
# Install Ruby dependencies (with cache optimization)
RUN bundle config set --local deployment 'false' && \
    echo "📦 Starting bundle install..." && \
    bundle install --jobs 4 --retry 3 && \
    echo "✅ Ruby gems installed successfully"

RUN echo "🏗️  STEP 5: Copying application code..."
# Copy the application code
COPY . .
RUN echo "✅ Application code copied"

RUN echo "🏗️  STEP 6: Building frontend assets..."
# Build frontend assets
WORKDIR /app/app/frontend
RUN echo "📦 Installing npm dependencies..." && \
    npm install --legacy-peer-deps --no-audit --no-fund && \
    echo "✅ NPM dependencies installed"

RUN echo "🎯 Installing bower dependencies..." && \
    if [ -f "bower.json" ]; then \
        npx bower install --allow-root --config.interactive=false && \
        echo "✅ Bower dependencies installed"; \
    else \
        echo "⚠️  No bower.json found, skipping"; \
    fi

RUN echo "🔨 Building Ember application..." && \
    (npm run build || ./node_modules/.bin/ember build --environment=production) && \
    echo "✅ Ember build completed"

RUN echo "🏗️  STEP 7: Preparing Rails application..."
# Return to app directory
WORKDIR /app

# Set production environment for asset compilation
ENV RAILS_ENV=production
ENV RACK_ENV=production
ENV NODE_ENV=production
ENV SECRET_KEY_BASE=dummy_secret_for_asset_compilation
ENV DISABLE_OBF_GEM=true

# Create required directories
RUN mkdir -p tmp/pids tmp/cache tmp/sockets log public/assets && \
    echo "✅ Directories created"

RUN echo "🏗️  STEP 8: Preparing assets and precompiling with obf gem disabled..."

# Create stub files for removed JavaScript assets to prevent compilation errors
RUN echo "// Stub file - will be regenerated during build" > app/assets/javascripts/frontend.js && \
    echo "// Stub file - will be regenerated during build" > app/assets/javascripts/vendor.js && \
    echo "✅ Created stub JavaScript files"

# Precompile assets with obf gem temporarily disabled and better error handling
RUN echo "🎨 Starting asset precompilation with obf gem isolation..." && \
    DISABLE_OBF_GEM=true RAILS_ENV=production SECRET_KEY_BASE=dummy_secret \
    bundle exec rake assets:precompile RAILS_GROUPS=assets --trace && \
    echo "✅ Assets precompiled successfully"

RUN echo "🏗️  STEP 9: Final setup..."
# Expose port
EXPOSE 3000

# Copy startup script
COPY bin/render-start.sh ./bin/render-start.sh
RUN chmod +x ./bin/render-start.sh

# Default command - use startup script for runtime asset compilation
CMD ["./bin/render-start.sh"]