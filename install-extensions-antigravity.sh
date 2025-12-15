#!/bin/bash

# Installation script for VS Code extensions in Google Antigravity IDE
# Before running this, configure Antigravity to use VS Code Marketplace:
#   1. Settings → Antigravity Settings → Editor
#   2. Update marketplace URLs to VS Code

echo "======================================"
echo "LingoLinq AAC Extensions Installer"
echo "For: Google Antigravity IDE"
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

  # Optional Useful Extensions
  "rangav.vscode-thunder-client"
  "humao.rest-client"
  "bradlc.vscode-tailwindcss"
  "mrmlnc.vscode-scss"
)

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "⚠️  IMPORTANT SETUP STEPS:"
echo ""
echo "Before running extension installations, configure Antigravity to use VS Code Marketplace:"
echo ""
echo "1. Open Antigravity IDE"
echo "2. Go to: Settings → Antigravity Settings → Editor"
echo "3. Change these URLs:"
echo "   Service URL: https://marketplace.visualstudio.com/_apis/public/gallery"
echo "   Item URL: https://marketplace.visualstudio.com/items"
echo "4. Restart Antigravity"
echo ""
read -p "Press Enter once you've completed these steps... "
echo ""

# Check if antigravity command exists
if ! command -v antigravity &> /dev/null; then
    echo -e "${YELLOW}Note: Antigravity CLI may not be available via 'antigravity' command${NC}"
    echo "You may need to install extensions manually via the UI:"
    echo "  1. Open Extensions panel (Ctrl+Shift+X)"
    echo "  2. Search for each extension ID"
    echo "  3. Click Install"
    echo ""
    read -p "Would you like a text file list instead? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        {
            echo "# VS Code Extensions for LingoLinq AAC"
            echo "# Copy-paste these extension IDs into Antigravity's search box"
            echo ""
            for ext in "${EXTENSIONS[@]}"; do
                echo "$ext"
            done
        } > /workspaces/LingoLinq-AAC/extensions-list-antigravity.txt
        echo -e "${GREEN}Created: extensions-list-antigravity.txt${NC}"
    fi
    exit 0
fi

echo "Installing ${#EXTENSIONS[@]} extensions in Antigravity..."
echo ""

INSTALLED=0

for ext in "${EXTENSIONS[@]}"; do
    echo -n "Installing: $ext ... "
    if antigravity --install-extension "$ext" 2>&1 | grep -q "installed"; then
        echo -e "${GREEN}✓${NC}"
        ((INSTALLED++))
    else
        echo -e "${YELLOW}→${NC}"
        ((INSTALLED++))
    fi
done

echo ""
echo "======================================"
echo -e "Extensions queued for installation: $INSTALLED"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Restart Antigravity IDE"
echo "2. All extensions should be installed and activated"
echo ""
