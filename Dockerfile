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
    GEM_HOME=/usr/local/bundle \
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

# Build the Ember frontend
# Install bower dependencies and build from app root
RUN cd app/frontend && \
    npx bower install --allow-root --config.interactive=false && \
    ./node_modules/.bin/ember build --environment=production

# Copy Ember build output to Rails assets directory instead of using symlinks
# This approach is more reliable in Docker environments
RUN mkdir -p /app/app/assets/javascripts && \
    cp /app/app/frontend/dist/assets/frontend.js /app/app/assets/javascripts/ && \
    cp /app/app/frontend/dist/assets/vendor.js /app/app/assets/javascripts/

# Precompile Rails assets in the same environment where gems are installed
# Precompile assets without initializing the full application
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

# Set up the entrypoint
COPY bin/render-start.sh ./bin/render-start.sh
RUN chmod +x ./bin/render-start.sh

# Expose port
EXPOSE 3000

# Healthcheck to ensure the application is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/status/heartbeat || curl -f http://localhost:3000/health || exit 1

CMD ["./bin/render-start.sh"]