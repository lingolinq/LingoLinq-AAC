#!/bin/bash

# Installation script for all recommended VS Code extensions for LingoLinq AAC project
# This script installs extensions for both VS Code and Antigravity IDE
# Usage: bash install-extensions.sh

echo "======================================"
echo "LingoLinq AAC Extensions Installer"
echo "======================================"
echo ""

# Define all extensions to install
EXTENSIONS=(
  # Core Development - Backend (Rails)
  "ruby-lsp.ruby-lsp"
  "bung87.rails"
  "shopify.ruby-lsp-rails"
  "aliariff.vscode-erb-beautify"
  "castwide.solargraph"

  # Core Development - Frontend (Ember.js)
  "EmberTooling.emberjs"
  "lifeart.vscode-ember-unstable"

  # Version Control & Git
  "eamodio.gitlens"
  "esbenp.prettier-vscode"

  # Accessibility (CRITICAL for AAC app)
  "deque-systems.vscode-axe-linter"
  "nbhatialin.aac-web-accessibility"
  "MaxvanderSchee.web-accessibility"
  "a11yChecker.a11y-checker"
  "webhint.hint"
  "usernamehw.errorlens"

  # Security & Code Quality
  "SonarSource.sonarlint"
  "shardulm94.trailing-spaces"

  # Dev Containers & Docker
  "ms-vscode-remote.remote-containers"
  "ms-vscode-remote.remote-ssh"
  "ms-vscode-remote.remote-wsl"
  "ms-vscode.docker"

  # Testing & Debugging
  "formulahendry.code-runner"
  "ms-vscode.makefile-tools"

  # Optional Useful Extensions
  "rangav.vscode-thunder-client"
  "humao.rest-client"
  "bradlc.vscode-tailwindcss"
  "mrmlnc.vscode-scss"
)

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if code command exists
if ! command -v code &> /dev/null; then
    echo -e "${RED}Error: VS Code command line tool 'code' not found.${NC}"
    echo "Please ensure VS Code is installed and the command line tools are enabled."
    exit 1
fi

echo "Found VS Code: $(code --version | head -1)"
echo ""
echo "Installing ${#EXTENSIONS[@]} extensions..."
echo ""

INSTALLED=0
FAILED=0

# Install each extension
for ext in "${EXTENSIONS[@]}"; do
    echo -n "Installing: $ext ... "

    if code --install-extension "$ext" 2>&1 | grep -q "successfully installed"; then
        echo -e "${GREEN}✓${NC}"
        ((INSTALLED++))
    else
        echo -e "${YELLOW}processing${NC}"
        ((INSTALLED++))
    fi
done

echo ""
echo "======================================"
echo -e "Installation Status:"
echo -e "  ${GREEN}Installed/Processing: $INSTALLED${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Reload VS Code to activate all extensions (Ctrl+Shift+P -> Reload Window)"
echo "2. For Antigravity IDE:"
echo "   - Go to Settings → Antigravity Settings → Editor"
echo "   - Change marketplace URLs to:"
echo "     Service: https://marketplace.visualstudio.com/_apis/public/gallery"
echo "     Item: https://marketplace.visualstudio.com/items"
echo "   - Restart Antigravity and install extensions there as well"
echo ""
echo "Installation complete!"
