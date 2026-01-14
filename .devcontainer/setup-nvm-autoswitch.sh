#!/bin/bash
# Add NVM auto-switching to bashrc

echo "Setting up NVM auto-switching..."

# Add NVM auto-switch function to bashrc
cat >> ~/.bashrc << 'EOF'

# Auto-switch Node version when entering directory with .nvmrc
autoload_nvmrc() {
  local nvmrc_path
  nvmrc_path="$(nvm_find_nvmrc)"

  if [ -n "$nvmrc_path" ]; then
    local nvmrc_node_version
    nvmrc_node_version=$(nvm version "$(cat "${nvmrc_path}")")

    if [ "$nvmrc_node_version" = "N/A" ]; then
      nvm install
    elif [ "$nvmrc_node_version" != "$(nvm version)" ]; then
      nvm use
    fi
  elif [ -n "$(PWD=$OLDPWD nvm_find_nvmrc)" ] && [ "$(nvm version)" != "$(nvm version default)" ]; then
    echo "Reverting to nvm default version"
    nvm use default
  fi
}

# Hook into cd command
cd() {
  builtin cd "$@" && autoload_nvmrc
}

# Run on shell startup
autoload_nvmrc

EOF

echo "✓ NVM auto-switching configured"
echo ""
echo "Reload your shell with: source ~/.bashrc"
