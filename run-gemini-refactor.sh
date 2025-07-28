#!/bin/bash

# Wrapper to launch Gemini CLI for refactor cleanup

echo "🔁 Switching to refactor/core-cleanup branch..."
git checkout refactor/core-cleanup || {
  echo "❌ Branch doesn't exist. Creating it..."
  git checkout -b refactor/core-cleanup
  git push -u origin refactor/core-cleanup
}

echo "🧼 Launching Gemini CLI in sandbox mode..."
gemini -s <<EOF
Analyze the \`auth\` module in this branch and simplify any redundant token validation logic. 
Provide suggestions first, then use diff previews before applying changes. 
Document everything in markdown after applying.
EOF
