#!/bin/bash

# Exit on error
set -e

# Install nvm and node
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  # NVM not installed, install it
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
fi

[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 18
nvm install 20
nvm alias default 18
nvm use 18

# Install gemini with node 20
nvm exec 20 npm install -g @google/gemini-cli

# Install gems
gem install bundler -v 2.6.8 --conservative || true
bundle _2.6.8_ config set --local path 'vendor/bundle' || true
bundle _2.6.8_ install --jobs 4 || true
