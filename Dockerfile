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

# Client-public config baked into globals.js.erb AT asset-precompile (build time), not read at
# runtime: window.maps_key (Google Maps embed) and window.default_host. These are emitted to the
# browser, so they are NOT secrets. They must be present during precompile or the compiled
# /assets/globals.js bakes dummy values (default_host=localhost, maps_key omitted). On Render this
# worked implicitly because the build env carried the real values; the GCP build must be told via
# --build-arg (see .github/workflows/deploy-cloudrun.yml "Build and push image"). Defaults keep the
# old dummy behavior so a bare `docker build` (local/dev) still succeeds.
ARG MAPS_KEY=""
ARG APP_DEFAULT_HOST="localhost"

# Precompile assets. Server secrets stay dummy (the asset pipeline never reads them); the two
# client-public build args above carry their real values into globals.js.erb.
RUN export SECRET_KEY_BASE=dummy_key_at_least_30_characters_long_for_build && \
    export COOKIE_KEY=dummy_key_at_least_30_characters_long_for_build && \
    export SECURE_ENCRYPTION_KEY=dummy_key_at_least_30_characters_long_for_build && \
    export SECURE_NONCE_KEY=dummy_key_at_least_30_characters_long_for_build && \
    export DATABASE_URL=postgres://postgres@localhost/dummy && \
    export REDIS_URL=redis://localhost:6379/0 && \
    export DEFAULT_HOST="$APP_DEFAULT_HOST" && \
    export MAPS_KEY="$MAPS_KEY" && \
    bundle exec rake extras:assert_js && \
    bundle exec rake extras:copy_terms && \
    bundle exec rake assets:precompile && \
    bundle exec rake assets:clean

# Entrypoint script
COPY bin/docker-entrypoint /usr/bin/
RUN chmod +x /usr/bin/docker-entrypoint

# Ensure the Resque worker entrypoint (copied in via the COPY . . above) is executable,
# regardless of how the host filesystem reported its mode bits. The web and worker
# processes share this image; the worker is launched via this script.
RUN chmod +x bin/docker-worker-entrypoint

# Non-root runtime user (least privilege)
RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid app --home-dir /app --no-create-home --shell /usr/sbin/nologin app && \
    chown -R app:app /app
USER app

ENTRYPOINT ["docker-entrypoint"]

# EXPOSE documents the local docker-compose port. Cloud Run ignores it and injects PORT
# (8080) at runtime; config/puma.rb already binds ENV['PORT'], so no change is needed there.
# The Cloud Run web service uses a startup probe against GET /api/v1/health before taking traffic.
EXPOSE 3000
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
