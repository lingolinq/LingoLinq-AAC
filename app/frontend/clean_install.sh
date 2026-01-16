#!/bin/bash
exec 2>&1
export NVM_DIR="/usr/local/share/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "Using Node Version: $(nvm run 18 --version)"
nvm use 18

cd app/frontend

echo "Removing node_modules and bower_components..."
rm -rf node_modules bower_components

echo "Installing NPM dependencies..."
npm install --no-audit

echo "Installing Bower dependencies..."
# Bower is likely in node_modules/.bin/bower or global?
# We should check if it's in package.json devDependencies? No, usually global or separate.
# But package.json scripts has "bower install".
# Let's try npx bower install
npx bower install --allow-root

echo "Install complete."
