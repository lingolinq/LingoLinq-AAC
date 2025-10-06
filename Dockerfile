# LingoLinq-AAC Canonical Dockerfile
# This single file handles development and production builds using multi-stage builds.
# It consolidates the learnings from 14 previous Dockerfiles.

#------------------------------------------------------------------------------
# BASE STAGE
# Defines the common environment for all subsequent stages.
# Using ruby:3.2.8-slim as it's the proven base.
#------------------------------------------------------------------------------
FROM ruby:3.2.8-slim as base

# Set environment variables for consistent behavior
ENV LANG C.UTF-8
ENV RAILS_ENV=production \
    RACK_ENV=production \
    NODE_ENV=production

WORKDIR /app

# Install essential system dependencies + Node.js 18.x
# This combination is required for the Rails 6.1 + Ember 3.12 stack.
# Added libyaml-dev to fix psych gem build error.
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

#------------------------------------------------------------------------------
# BUILD STAGE
# Pre-installs gems and node modules, and builds assets.
# Layers are structured to maximize Docker cache efficiency.
#------------------------------------------------------------------------------
FROM base as build

# Install bundler 2.5.6 (2.7.1 has platform resolution bugs)
RUN gem install bundler:2.5.6

# Force platform-specific gems to avoid multi-platform lockfile issues
ENV BUNDLE_FORCE_RUBY_PLATFORM=false

# Copy Gemfiles and install gems
COPY Gemfile Gemfile.lock ./
RUN bundle config set --global without 'development test' && \
    DISABLE_OBF_GEM=true bundle install --jobs $(nproc) --retry 3

# Copy package.json and install frontend build tools (including devDependencies for ember-cli)
# Note: We copy the package.json from the frontend directory specifically.
COPY app/frontend/package.json app/frontend/package-lock.json* app/frontend/
RUN cd app/frontend && NODE_ENV=development npm install --legacy-peer-deps

# Copy the rest of the application code
# CACHE_BUST: Oct 6 2025 - Force rebuild to pick up conditional Redis initializer
COPY . .

# Build the Ember frontend
# Install bower dependencies globally and build from app root
RUN cd app/frontend && \
    npx bower install --allow-root --config.interactive=false && \
    ./node_modules/.bin/ember build --environment=production

# Precompile Rails assets
# Set dummy environment variables required during asset compilation
ENV DISABLE_OBF_GEM=true \
    MAX_ENCRYPTION_SIZE=25000000 \
    MAX_FILE_SIZE=25000000 \
    SECURE_ENCRYPTION_KEY=dummy_key_for_build_at_least_24_chars \
    SECURE_NONCE_KEY=dummy_nonce_for_build_at_least_24_chars \
    COOKIE_KEY=dummy_cookie_key_for_build

RUN SECRET_KEY_BASE=dummy bundle exec rake assets:precompile

#------------------------------------------------------------------------------
# PRODUCTION STAGE
# Creates the final, lean production image by copying artifacts from the build stage.
#------------------------------------------------------------------------------
FROM base as production

# Copy installed gems from the build stage
COPY --from=build /usr/local/bundle /usr/local/bundle

# Copy compiled assets and application code from the build stage
COPY --from=build /app /app

# Expose port and set the entrypoint
EXPOSE 3000
COPY bin/render-start.sh ./bin/render-start.sh
RUN chmod +x ./bin/render-start.sh

# Healthcheck to ensure the application is running
# Using the Rails heartbeat endpoint that returns {active: true}
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/status/heartbeat || curl -f http://localhost:3000/health || exit 1

CMD ["./bin/render-start.sh"]