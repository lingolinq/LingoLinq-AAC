# syntax=docker/dockerfile:1

# Stage 1: Build Ember Frontend
FROM node:20-bullseye AS frontend-builder
WORKDIR /app/frontend
# Install build dependencies for native modules (like sqlite3)
RUN apt-get update -qq && apt-get install -y \
    python3 \
    make \
    g++ \
    && ln -s /usr/bin/python3 /usr/bin/python

COPY app/frontend/package*.json ./
# We need to copy any local plugins/addons if they exist
COPY app/frontend/ ./
RUN npm install
RUN npx ember build --environment production

# Stage 2: Final Rails Image
FROM ruby:3.4.4-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update -qq && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    git \
    libvips \
    pkg-config \
    libyaml-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (needed for Rails asset pipeline)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest

# Set environment
ENV RAILS_ENV="production" \
    BUNDLE_WITHOUT="development test" \
    BUNDLE_DEPLOYMENT="1"

# Install gems
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copy application code
COPY . .

# Copy built Ember assets from the frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist ./app/frontend/dist

# Precompile assets with dummy keys
RUN export SECRET_KEY_BASE=dummy_key_at_least_30_characters_long_for_build && \
    export COOKIE_KEY=dummy_key_at_least_30_characters_long_for_build && \
    export SECURE_ENCRYPTION_KEY=dummy_key_at_least_30_characters_long_for_build && \
    export SECURE_NONCE_KEY=dummy_key_at_least_30_characters_long_for_build && \
    export DATABASE_URL=postgres://postgres@localhost/dummy && \
    export REDIS_URL=redis://localhost:6379/0 && \
    export DEFAULT_HOST=localhost && \
    bundle exec rake extras:assert_js && \
    bundle exec rake extras:copy_terms && \
    bundle exec rake assets:precompile && \
    bundle exec rake assets:clean

# Entrypoint script
COPY bin/docker-entrypoint /usr/bin/
RUN chmod +x /usr/bin/docker-entrypoint
ENTRYPOINT ["docker-entrypoint"]

EXPOSE 3000
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
