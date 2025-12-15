#!/bin/bash
set -e

# Ensure clean environment
export PATH="$HOME/.rbenv/bin:$PATH"

if ! command -v rbenv &> /dev/null; then
    echo "rbenv not found, attempting to fix PATH..."
    export PATH="$HOME/.rbenv/bin:$PATH"
fi

# Init rbenv
eval "$(rbenv init -)"

echo "Installing Ruby 3.4.4..."
# Skip if already installed
if rbenv versions | grep -q "3.4.4"; then
    echo "Ruby 3.4.4 is already installed."
else
    rbenv install 3.4.4
fi

rbenv global 3.4.4
echo "Done. Ruby version:"
ruby -v
