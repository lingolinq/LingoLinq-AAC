# LingoLinq-AAC Single-Stage Dockerfile
# Solution 3: Eliminates bundler version mismatch by using single environment throughout

FROM ruby:3.2.8-slim

# Set environment variables for consistent behavior
# Official Bundler Docker guide: https://bundler.io/guides/bundler_docker_guide.html
ENV LANG=C.UTF-8 \
    RAILS_ENV=production \
    RACK_ENV=production \
    NODE_ENV=production \
    BUNDLER_VERSION=2.5.6 \
    BUNDLE_WITHOUT=development:test \
    BUNDLE_FORCE_RUBY_PLATFORM=false \
    PATH=/usr/local/bundle/bin:/usr/local/bundle/gems/bin:$PATH

WORKDIR /app

# Install essential system dependencies + Node.js 18.x
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libyaml-dev \
    git \
    curl \
    postgresql-client \
    imagemagick \
    ghostscript \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install bundler 2.5.6 (stable version - 2.7.1 has runtime resolution bugs)
RUN gem install bundler:2.5.6

# Configure bundler to use a consistent gem path across all environments
# This creates a persistent .bundle/config that works in build, release, and run phases
RUN bundle config set --global path '/usr/local/bundle'

# Copy Gemfiles (lockfile will be generated cleanly in Linux environment)
COPY Gemfile Gemfile.lock ./

# Install gems in production environment with bundler 2.5.6
RUN bundle config set --local without 'development test' && \
    DISABLE_OBF_GEM=true bundle install --jobs $(nproc) --retry 3

# Copy package.json and install frontend build tools (including devDependencies for ember-cli)
# Temporarily override NODE_ENV to ensure devDependencies are installed
COPY app/frontend/package.json app/frontend/package-lock.json* app/frontend/
RUN cd app/frontend && NODE_ENV=development npm install --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# ============================================================================
# ASSET COMPILATION: Match bin/deploy_prep exactly
# ============================================================================
# The traditional deployment uses bin/deploy_prep which runs these steps:
# 1. rake extras:copy_terms - Copy legal templates from ERB to Ember HBS
# 2. rake extras:version - Generate version ID in application-preload.js
# 3. ember build - Build Ember frontend
# 4. rake assets:clean - Clean old Rails assets
# 5. rake assets:precompile - Precompile Rails assets
#
# These steps MUST happen in this exact order for CSS and JS to work correctly.
# ============================================================================

# Step 1: Copy terms and legal templates from ERB to Ember HBS
RUN echo "==> Copying terms and legal templates..."
RUN DISABLE_OBF_GEM=true bundle exec rake extras:copy_terms

# Step 2: Generate version ID and update application-preload.js
RUN echo "==> Generating version ID..."
RUN DISABLE_OBF_GEM=true bundle exec rake extras:version

# Step 3: Build the Ember frontend
RUN echo "==> Building Ember frontend..."
RUN cd app/frontend && \
    npx bower install --allow-root --config.interactive=false && \
    ./node_modules/.bin/ember build --environment=production && \
    cd ../..

# Step 4: Clean old Rails assets (matching deploy_prep)
RUN echo "==> Cleaning old Rails assets..."
RUN DISABLE_OBF_GEM=true RAILS_ENV=production bundle exec rake assets:clean || true
RUN rm -rf /app/public/assets/*

# Step 5: Create symlinks for Ember assets (matching traditional deployment)
# The Rails asset pipeline expects these symlinks during precompilation
RUN echo "==> Creating Ember asset symlinks..."
RUN mkdir -p /app/app/assets/javascripts && \
    cd /app/app/assets/javascripts && \
    ln -sf ../../frontend/dist/assets/frontend.js frontend.js && \
    ln -sf ../../frontend/dist/assets/vendor.js vendor.js

# Step 6: Precompile Rails assets (matching deploy_prep)
RUN echo "==> Precompiling Rails assets..."
RUN DISABLE_OBF_GEM=true \
    SECRET_KEY_BASE=dummy \
    RAILS_ENV=production \
    bundle exec rake assets:precompile --trace

# DIAGNOSTIC: List generated assets to verify fingerprinting
RUN echo "=== Generated Assets in /app/public/assets ===" && \
    ls -lah /app/public/assets/ && \
    echo "=== application.js files ===" && \
    ls -lah /app/public/assets/application*.js 2>/dev/null || echo "No application.js files found" && \
    echo "=== application.css files ===" && \
    ls -lah /app/public/assets/application*.css 2>/dev/null || echo "No application.css files found"

# Set up the startup scripts
COPY bin/docker-start.sh ./bin/docker-start.sh
RUN chmod +x ./bin/docker-start.sh

# Expose port
EXPOSE 3000

# Healthcheck to ensure the application is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/status/heartbeat || curl -f http://localhost:3000/health || exit 1

# Start the application using the diagnostic startup script
# Migrations are handled by Fly.io's release_command in fly.toml
# The startup script provides environment diagnostics and ensures proper binding
CMD ["./bin/docker-start.sh"]