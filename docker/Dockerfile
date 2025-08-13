# Optimized LingoLinq Rails Dockerfile
FROM ruby:3.2.8-slim as base

# Install essential system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    git \
    curl \
    postgresql-client \
    libyaml-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18.x (required for Rails asset pipeline and Ember compatibility)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Verify critical versions
RUN echo "🔍 CONTAINER VERSIONS:" && \
    echo "Ruby: $(ruby -v)" && \
    echo "Node: $(node -v)" && \
    echo "NPM: $(npm -v)"

# Set working directory
WORKDIR /app

# Install bundler and copy Gemfiles
RUN gem install bundler
COPY Gemfile Gemfile.lock ./

# Install Ruby dependencies (with cache optimization)
RUN bundle config set --local deployment 'false' && \
    bundle install --jobs 4 --retry 3

# Copy the application code
COPY . .

# Create required directories
RUN mkdir -p tmp/pids tmp/cache tmp/sockets log public/assets

# Expose port
EXPOSE 3000

# Default command
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]