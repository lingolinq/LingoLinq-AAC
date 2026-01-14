#!/bin/bash
# Fix corrupted .bashrc in dev container

echo "=== Fixing .bashrc ==="

# Create a clean .bashrc
cat > ~/.bashrc << 'EOF'
# Load NVM
export NVM_DIR="/usr/local/share/nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

# Set Node 20 as default
nvm use 20 >/dev/null 2>&1

# Helpful aliases
alias ll='ls -la'
alias node20='nvm use 20'
alias node18='nvm use 18'
EOF

echo "✓ Clean .bashrc created"

# Reload
source ~/.bashrc

echo "✓ Shell reloaded"
echo ""
echo "Current Node version: $(node -v)"
echo ""
echo "Quick commands:"
echo "  node20   - Switch to Node 20 (for Gemini CLI)"
echo "  node18   - Switch to Node 18 (for Ember frontend)"
echo ""
echo "Testing Gemini CLI..."
gemini --version || echo "Run 'node20' first if this failed"
