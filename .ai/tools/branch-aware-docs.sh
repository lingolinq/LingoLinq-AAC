#!/usr/bin/env bash

# Branch-Aware Documentation Management for LingoLinq AAC
# Handles documentation updates across branches intelligently

REPO_PATH="$(git rev-parse --show-toplevel)"
CURRENT_BRANCH=$(git branch --show-current)

echo "🌿 Branch-Aware Documentation Management"
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Configuration: Define documentation categories
declare -A GLOBAL_DOCS=(
    [".ai/tools/"]="true"
    [".ai/docs/TEAM_AI_TOOLS_QUICK_GUIDE.md"]="true"
    [".ai/tools/launch-agentic.ps1"]="true"
    ["bin/devin"]="true"
    ["bin/devin.cmd"]="true"
    ["bin/devin-simple.ps1"]="true"
    ["PROJECT_STATUS.md"]="true"
    ["README.md"]="true"
    ["GETTING_STARTED.md"]="true"
)

declare -A BRANCH_SPECIFIC_DOCS=(
    ["docs/planning/roadmaps/EMBER_UPGRADE_ROADMAP.md"]="ember-3-12-to-3-28-upgrade"
    ["docs/planning/roadmaps/RAILS_UPGRADE_ROADMAP.md"]="rails-6-to-7-upgrade"
    ["docs/planning/AI_FEATURES_PLAN.md"]="epic/ai-features"
    ["docs/planning/TECH_DEBT_AND_SECURITY_PLAN.md"]="epic/tech-debt-and-security"
    ["docs/planning/features/LLM_INFLECTIONS_SETUP.md"]="feature/llm-enhanced-inflections"
)

# Function to check if a file is global or branch-specific
classify_document() {
    local file="$1"
    local relative_path="${file#$REPO_PATH/}"

    # Check if it's explicitly marked as global
    for global_pattern in "${!GLOBAL_DOCS[@]}"; do
        if [[ "$relative_path" == *"$global_pattern"* ]]; then
            echo "GLOBAL"
            return
        fi
    done

    # Check if it's explicitly marked as branch-specific
    for doc_path in "${!BRANCH_SPECIFIC_DOCS[@]}"; do
        if [[ "$relative_path" == "$doc_path" ]]; then
            echo "BRANCH_SPECIFIC:${BRANCH_SPECIFIC_DOCS[$doc_path]}"
            return
        fi
    done

    # Auto-classify based on path patterns
    case "$relative_path" in
        .ai/context/*)
            echo "CONTEXTUAL" # Should be updated per branch but not propagated
            ;;
        docs/development/*)
            echo "GLOBAL" # Development setup is usually global
            ;;
        docs/planning/*)
            echo "BRANCH_SPECIFIC:$CURRENT_BRANCH" # Planning docs are usually branch-specific
            ;;
        docs/epics/*)
            echo "BRANCH_SPECIFIC:$CURRENT_BRANCH"
            ;;
        *.md)
            echo "REVIEW_NEEDED" # Other markdown files need manual review
            ;;
        *)
            echo "UNKNOWN"
            ;;
    esac
}

# Function to apply documentation updates across appropriate branches
apply_global_updates() {
    local update_type="$1"
    echo "🔄 Applying global documentation updates..."

    case "$update_type" in
        "ai-tools")
            echo "Updating AI tool documentation across all branches..."

            # Files that should be identical across all branches
            local global_ai_files=(
                ".ai/tools/launch-agentic.ps1"
                ".ai/docs/TEAM_AI_TOOLS_QUICK_GUIDE.md"
                "bin/devin"
                "bin/devin.cmd"
                "bin/devin-simple.ps1"
            )

            for file in "${global_ai_files[@]}"; do
                if [[ -f "$REPO_PATH/$file" ]]; then
                    echo "  📄 $file marked for global sync"
                fi
            done
            ;;
        "security")
            echo "Security updates typically apply to main branch first, then propagate during merges"
            ;;
    esac
}

# Function to analyze documentation health across branches
analyze_branch_docs() {
    echo "📊 Documentation Analysis Across Branches"
    echo ""

    # Get list of all branches
    local branches=($(git branch -r | grep -v HEAD | sed 's/origin\///'))

    for branch in "${branches[@]}"; do
        echo "🌿 Branch: $branch"

        # Check if branch has specific outdated patterns
        local outdated_count=$(git show "origin/$branch:.ai/tools/launch-agentic.ps1" 2>/dev/null | grep -c "devin-gemini" || echo "0")

        if [[ "$outdated_count" -gt 0 ]]; then
            echo "  ⚠️  Contains outdated references: $outdated_count"
        else
            echo "  ✅ Documentation appears current"
        fi

        # Check for branch-specific documentation
        local branch_docs=$(git ls-tree -r --name-only "origin/$branch" | grep "\.md$" | grep -E "(roadmap|plan|epic)" | wc -l)
        echo "  📋 Branch-specific docs: $branch_docs"
        echo ""
    done
}

# Function to create branch-specific update strategy
create_update_strategy() {
    echo "📋 Creating Update Strategy"
    echo ""

    cat > "$REPO_PATH/.ai/tools/BRANCH_UPDATE_STRATEGY.md" << 'EOF'
# Branch Documentation Update Strategy

## Global Documentation (Apply to ALL branches)
- `.ai/tools/` - AI development tools
- `.ai/docs/TEAM_AI_TOOLS_QUICK_GUIDE.md` - Team guide
- `bin/devin*` - AI wrapper scripts
- `PROJECT_STATUS.md` - Global project status
- `README.md` - Main project readme
- `docs/development/` - Development setup guides

## Branch-Specific Documentation (DO NOT merge across branches)
- `docs/planning/roadmaps/` - Branch-specific roadmaps
- `docs/epics/` - Epic-specific plans
- `docs/planning/features/` - Feature-specific documentation

## Contextual Documentation (Update per branch, don't propagate)
- `.ai/context/` - AI context files (generated per branch)
- Recent changes logs
- Branch-specific analysis

## Update Process

### For Global Changes:
1. Update in `main` branch first
2. Create merge strategy for other branches
3. Apply via pull requests to preserve branch history

### For Branch-Specific Changes:
1. Update only in relevant branch
2. Do NOT merge to other branches
3. Document in branch-specific planning docs

### For Security/Critical Updates:
1. Apply to `main` first
2. Cherry-pick to active development branches
3. Let inactive branches inherit via normal merge process

## Automation Rules

### Safe to Auto-Update:
- AI tool configurations (if identical across branches)
- Security patches in shared utilities
- Documentation typo fixes

### Requires Manual Review:
- Any planning documentation
- Branch-specific roadmaps
- Feature documentation that might conflict

### Never Auto-Update:
- Branch-specific roadmaps in wrong branch
- Feature docs outside their branch
- Contextual analysis (should be regenerated)
EOF

    echo "✅ Strategy documented in .ai/tools/BRANCH_UPDATE_STRATEGY.md"
}

# Main execution based on command
case "${1:-analyze}" in
    "analyze")
        analyze_branch_docs
        create_update_strategy
        ;;
    "classify")
        if [[ -z "$2" ]]; then
            echo "Usage: $0 classify <file_path>"
            exit 1
        fi
        result=$(classify_document "$2")
        echo "File: $2"
        echo "Classification: $result"
        ;;
    "apply-global")
        apply_global_updates "${2:-ai-tools}"
        ;;
    *)
        echo "Usage: $0 {analyze|classify <file>|apply-global [type]}"
        echo "  analyze       - Analyze documentation across all branches"
        echo "  classify      - Classify a specific file as global/branch-specific"
        echo "  apply-global  - Apply global updates across branches"
        ;;
esac