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

# Install bundler
RUN gem install bundler:2.7.1

# Copy Gemfiles and install gems
COPY Gemfile Gemfile.lock ./
RUN bundle config set --global without 'development test' && \
    bundle install --jobs $(nproc) --retry 3

# Copy package.json and install frontend build tools
# Note: We copy the package.json from the frontend directory specifically.
COPY app/frontend/package.json app/frontend/package-lock.json* app/frontend/
RUN cd app/frontend && npm install --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# Build the Ember frontend
# Install bower dependencies globally and build from app root
RUN cd app/frontend && \
    npx bower install --allow-root --config.interactive=false && \
    ./node_modules/.bin/ember build --environment=production

# Precompile Rails assets
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