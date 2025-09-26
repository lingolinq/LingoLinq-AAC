#!/usr/bin/env bash

# Documentation Fix Tool for LingoLinq AAC
# Automatically fixes outdated references found in the audit

REPO_PATH="$(git rev-parse --show-toplevel)"

echo "🔧 LingoLinq AAC Documentation Fix Tool"
echo "Applying fixes for outdated references..."
echo ""

# Function to backup files before editing
backup_file() {
    local file="$1"
    cp "$file" "$file.backup.$(date +%Y%m%d)"
    echo "  📦 Backed up: $(basename "$file")"
}

# Function to fix AI Development Guide
fix_ai_development_guide() {
    local file="$REPO_PATH/docs/development/AI_DEVELOPMENT_GUIDE.md"
    echo "🔧 Fixing AI Development Guide..."

    if [[ -f "$file" ]]; then
        backup_file "$file"

        # Replace bin/devin-gemini references with gemini --all-files
        sed -i 's|chmod +x bin/devin-gemini|# Gemini setup is automatic - no file needed|g' "$file"
        sed -i 's|\\./bin/devin-gemini simple|gemini --all-files|g' "$file"
        sed -i 's|\\./bin/devin-gemini ask "question"|gemini --all-files "question"|g' "$file"
        sed -i 's|\\./bin/devin-gemini ask "Rails error: undefined method for Board"|gemini --all-files "Rails error: undefined method for Board"|g' "$file"
        sed -i 's|Use Gemini (`\\./bin/devin-gemini`) when:|Use Gemini (`gemini --all-files`) when:|g' "$file"
        sed -i 's|\\./bin/devin-gemini ask "Hello"|gemini --all-files "Hello"|g' "$file"
        sed -i 's|chmod +x bin/devin bin/devin-gemini|chmod +x bin/devin|g' "$file"
        sed -i 's|Use `\\./bin/devin-gemini simple` instead of other gemini commands|Use `gemini --all-files` for full codebase access|g' "$file"

        # Update table entries
        sed -i 's|`\\./bin/devin-gemini simple` | Start clean Gemini session | Quick questions, syntax help|`gemini --all-files` | Start with full codebase context | All development tasks|g' "$file"
        sed -i 's|`\\./bin/devin-gemini ask "question"` | Ask Gemini with basic context | Simple how-to questions, syntax checks|`gemini --all-files "question"` | Ask with full codebase context | Complex development questions|g' "$file"

        echo "  ✅ Updated AI Development Guide"
    else
        echo "  ❌ File not found: $file"
    fi
}

# Function to fix SETUP.md
fix_setup_md() {
    local file="$REPO_PATH/docs/development/SETUP.md"
    echo "🔧 Fixing SETUP.md..."

    if [[ -f "$file" ]]; then
        backup_file "$file"

        # Replace AI Assistants reference
        sed -i 's|- \\*\\*AI Assistants\\*\\*: `\\./bin/devin` (Claude), `\\./bin/devin-gemini` (Gemini)|- **AI Assistants**: `claude` (Claude + MCP), `gemini --all-files` (Gemini with full context)|g' "$file"

        echo "  ✅ Updated SETUP.md"
    else
        echo "  ❌ File not found: $file"
    fi
}

# Function to fix main README.md
fix_readme() {
    local file="$REPO_PATH/README.md"
    echo "🔧 Fixing main README.md..."

    if [[ -f "$file" ]]; then
        backup_file "$file"

        # Remove or update outdated launch references
        sed -i '/# Launch both Claude Code and Gemini assistants/c\# Launch both AI assistants\n./.ai/tools/launch-agentic.ps1' "$file"

        echo "  ✅ Updated README.md"
    else
        echo "  ❌ File not found: $file"
    fi
}

# Function to archive obsolete files
archive_obsolete_files() {
    echo "🗄️ Archiving obsolete files..."

    # Create archive directory
    mkdir -p "$REPO_PATH/.ai/archive"

    # Archive DEVIN_CLEANUP_SUMMARY.md (it's now obsolete)
    if [[ -f "$REPO_PATH/.ai/DEVIN_CLEANUP_SUMMARY.md" ]]; then
        mv "$REPO_PATH/.ai/DEVIN_CLEANUP_SUMMARY.md" "$REPO_PATH/.ai/archive/"
        echo "  📦 Archived DEVIN_CLEANUP_SUMMARY.md"
    fi
}

# Function to add updated timestamp to key files
add_timestamps() {
    echo "📅 Adding update timestamps..."

    local files=(
        "$REPO_PATH/docs/development/AI_DEVELOPMENT_GUIDE.md"
        "$REPO_PATH/docs/development/SETUP.md"
        "$REPO_PATH/.ai/docs/TEAM_AI_TOOLS_QUICK_GUIDE.md"
    )

    for file in "${files[@]}"; do
        if [[ -f "$file" ]]; then
            # Add timestamp at the top if it doesn't exist
            if ! grep -q "Last Updated:" "$file"; then
                temp_file=$(mktemp)
                echo "<!-- Last Updated: $(date '+%B %d, %Y') -->" > "$temp_file"
                echo "" >> "$temp_file"
                cat "$file" >> "$temp_file"
                mv "$temp_file" "$file"
                echo "  📅 Added timestamp to $(basename "$file")"
            fi
        fi
    done
}

# Function to create documentation index
create_doc_index() {
    echo "📚 Creating documentation index..."

    local index_file="$REPO_PATH/.ai/docs/README.md"

    cat > "$index_file" << 'EOF'
# LingoLinq AAC - AI Development Documentation

<!-- Last Updated: $(date '+%B %d, %Y') -->

## Quick Start Guides

- **[Team AI Tools Quick Guide](./TEAM_AI_TOOLS_QUICK_GUIDE.md)** - Essential guide for using Claude Code + MCP and Gemini CLI
- **[AI Development Commands](../tools/AI_DEVELOPMENT_COMMANDS.md)** - Complete command reference
- **[AI Tools Setup](./AI_TOOLS_SETUP.md)** - Initial setup and configuration

## Core Documentation

### Development Setup
- **[Getting Started](../../GETTING_STARTED.md)** - Main onboarding guide
- **[Development Setup](../../docs/development/SETUP.md)** - Technical setup guide
- **[Contributing](../../docs/development/CONTRIBUTING.md)** - Development workflow

### AI Integration
- **[AI Development Guide](../../docs/development/AI_DEVELOPMENT_GUIDE.md)** - Comprehensive AI development workflow
- **[AI Session Guide](./AI_SESSION_GUIDE.md)** - Session management and best practices

## Project Context

### Architecture & Planning
- **[Project Map](../context/PROJECT_MAP.md)** - High-level architecture overview
- **[Technical Audit](../context/CLAUDE_TECHNICAL_AUDIT.md)** - Comprehensive technical assessment
- **[Security Audit](../context/AUDIT_REPORT_2025.md)** - Security analysis and recommendations

### Current Status
- **[PROJECT_STATUS.md](../../PROJECT_STATUS.md)** - Current development status and priorities
- **[Documentation Audit](../context/DOCUMENTATION_AUDIT_REPORT.md)** - Documentation health check

## Branch-Specific Documentation

- **[Rails Upgrade](../../docs/planning/roadmaps/)** - Rails 6→7 upgrade timeline
- **[Ember Upgrade](../../docs/planning/roadmaps/)** - Ember 3.12→3.28 modernization
- **[Security & Tech Debt](../../docs/planning/roadmaps/)** - Security improvements and technical debt

## Tools & Utilities

- **[Documentation Audit Tool](../tools/doc-audit.sh)** - Scan for outdated references
- **[Documentation Fix Tool](../tools/doc-fix.sh)** - Automatically fix common issues
- **[Launch Script](../tools/launch-agentic.ps1)** - Start both AI assistants

---

*This index is automatically maintained. Last generated: $(date)*
EOF

    # Replace the date placeholder
    sed -i "s/\$(date '+%B %d, %Y')/$(date '+%B %d, %Y')/g" "$index_file"
    sed -i "s/\$(date)/$(date)/g" "$index_file"

    echo "  📚 Created documentation index"
}

# Main execution
echo "Starting automated documentation fixes..."
echo ""

# Apply fixes
fix_ai_development_guide
fix_setup_md
fix_readme
archive_obsolete_files
add_timestamps
create_doc_index

echo ""
echo "🎯 Fix Summary:"
echo "  ✅ Updated AI Development Guide"
echo "  ✅ Updated SETUP.md"
echo "  ✅ Updated README.md"
echo "  ✅ Archived obsolete files"
echo "  ✅ Added timestamps"
echo "  ✅ Created documentation index"
echo ""
echo "📦 Backup files created with .backup.YYYYMMDD extension"
echo "🔍 Run the audit tool again to verify fixes: ./.ai/tools/doc-audit.sh"
echo ""
echo "✅ Documentation cleanup complete!"