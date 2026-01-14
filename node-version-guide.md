# Node Version Management Guide

## The Problem

LingoLinq-AAC requires **two different Node versions**:
- **Node 18**: Required for Ember 3.16 frontend
- **Node 20**: Required for Gemini CLI, modern tools, and root-level scripts

## The Solution

We use **NVM (Node Version Manager)** with **automatic directory-based switching**.

---

## Quick Reference

### Check Current Node Version
```bash
node -v
```

### Manual Switching (if auto-switch isn't working)

**Switch to Node 20** (for root directory, Gemini CLI):
```bash
nvm use 20
```

**Switch to Node 18** (for Ember frontend):
```bash
nvm use 18
```

---

## How Auto-Switching Works

The project has `.nvmrc` files that tell NVM which version to use:

```
LingoLinq-AAC/
├── .nvmrc          → "20" (Node 20 for root)
└── app/frontend/
    └── .nvmrc      → "18" (Node 18 for Ember)
```

When you `cd` between directories, NVM should automatically switch to the correct version.

---

## Setup Auto-Switching (One-Time)

If auto-switching isn't working, run this in your dev container terminal:

```bash
# Run the setup script
bash .devcontainer/setup-nvm-autoswitch.sh

# Reload your shell
source ~/.bashrc

# Test it - should show Node 20
node -v

# Change to frontend - should auto-switch to Node 18
cd app/frontend && node -v

# Go back to root - should auto-switch to Node 20
cd ../.. && node -v
```

---

## Common Workflows

### Running Gemini CLI (needs Node 20)
```bash
# Make sure you're in root directory
cd /workspaces/LingoLinq-AAC
node -v  # Should show v20.x.x
gemini --version
```

### Working on Ember Frontend (needs Node 18)
```bash
cd /workspaces/LingoLinq-AAC/app/frontend
node -v  # Should show v18.x.x
npm install
npm start
```

### Running Rails (Node version doesn't matter for Rails itself)
```bash
cd /workspaces/LingoLinq-AAC
bundle exec rails server
```

---

## Troubleshooting

### "SyntaxError: Invalid regular expression flags" when running gemini
**Problem**: You're on Node 18, but Gemini needs Node 20

**Solution**:
```bash
# Check version
node -v  # If it shows v18.x.x

# Switch to Node 20
nvm use 20

# Try again
gemini --version
```

### Ember build fails with module errors
**Problem**: You're on Node 20, but Ember needs Node 18

**Solution**:
```bash
cd /workspaces/LingoLinq-AAC/app/frontend

# Check version
node -v  # If it shows v20.x.x

# Switch to Node 18
nvm use 18

# Try again
npm install
```

### Auto-switching isn't working
```bash
# Re-run setup
bash .devcontainer/setup-nvm-autoswitch.sh
source ~/.bashrc

# Verify NVM is loaded
nvm --version

# Test switching
cd /workspaces/LingoLinq-AAC
echo "Root: $(node -v)"
cd app/frontend
echo "Frontend: $(node -v)"
```

---

## For Claude Code & Gemini CLI

**Important Instructions for AI Assistants:**

### Before Running Any Node/NPM Command:

1. **Check the directory** you're running the command in
2. **Verify the Node version** with `node -v`
3. **Use the correct version**:
   - Root directory commands: `nvm use 20 && <command>`
   - Frontend commands: `cd app/frontend && nvm use 18 && <command>`

### Safe Command Patterns:

**Running Gemini CLI:**
```bash
# Always use Node 20 for Gemini
nvm use 20 && gemini <command>
```

**Installing Frontend Dependencies:**
```bash
# Always use Node 18 for Ember
cd app/frontend && nvm use 18 && npm install
```

**Starting Ember Dev Server:**
```bash
# Always use Node 18 for Ember
cd app/frontend && nvm use 18 && npm start
```

**Running Tests:**
```bash
# Use Node 18 for frontend tests
cd app/frontend && nvm use 18 && npm test
```

---

## Quick Fix Script

If you're having version issues, run this:

```bash
# Create a quick fix script
cat > /tmp/fix-node.sh << 'EOF'
#!/bin/bash
echo "=== Node Version Quick Fix ==="
echo ""
echo "Current directory: $(pwd)"
echo "Current Node version: $(node -v)"
echo ""

if [[ $(pwd) == *"/app/frontend"* ]]; then
  echo "✓ In frontend directory - switching to Node 18"
  nvm use 18
else
  echo "✓ In root directory - switching to Node 20"
  nvm use 20
fi

echo ""
echo "New Node version: $(node -v)"
EOF

chmod +x /tmp/fix-node.sh

# Run it
/tmp/fix-node.sh
```

---

## Summary

| Location | Node Version | Why |
|----------|--------------|-----|
| Root (`/workspaces/LingoLinq-AAC`) | **20** | Gemini CLI, modern tools |
| Frontend (`/workspaces/LingoLinq-AAC/app/frontend`) | **18** | Ember 3.16 compatibility |

**Golden Rule**: When in doubt, check `node -v` before running any command!
