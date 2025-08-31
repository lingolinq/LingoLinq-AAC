#!/bin/bash

# LingoLinq AAC - New Team Preparation Cleanup Script
# Run this before handing off to 3rd party developers

echo "🧹 Cleaning up duplicate documentation for new team..."

# Create backup of files we're removing
echo "📦 Creating backup of removed files..."
mkdir -p .cleanup-backup/$(date +%Y%m%d)
BACKUP_DIR=".cleanup-backup/$(date +%Y%m%d)"

# Backup and remove duplicate roadmaps (keep DEVELOPMENT_ROADMAP.md)
echo "🗺️  Consolidating roadmap files..."
if [[ -f ".ai/context/IMPLEMENTATION_ROADMAP.md" ]]; then
    cp ".ai/context/IMPLEMENTATION_ROADMAP.md" "$BACKUP_DIR/"
    rm ".ai/context/IMPLEMENTATION_ROADMAP.md"
    echo "   ✅ Removed IMPLEMENTATION_ROADMAP.md"
fi

if [[ -f ".ai/context/MODERNIZATION_ROADMAP.md" ]]; then
    cp ".ai/context/MODERNIZATION_ROADMAP.md" "$BACKUP_DIR/"
    rm ".ai/context/MODERNIZATION_ROADMAP.md"
    echo "   ✅ Removed MODERNIZATION_ROADMAP.md"
fi

if [[ -f ".ai/context/MASTER_IMPLEMENTATION_PLAN.md" ]]; then
    cp ".ai/context/MASTER_IMPLEMENTATION_PLAN.md" "$BACKUP_DIR/"
    rm ".ai/context/MASTER_IMPLEMENTATION_PLAN.md"
    echo "   ✅ Removed MASTER_IMPLEMENTATION_PLAN.md"
fi

if [[ -f "docs/planning/roadmaps/SENIOR_DEV_ROADMAP.md" ]]; then
    cp "docs/planning/roadmaps/SENIOR_DEV_ROADMAP.md" "$BACKUP_DIR/"
    rm "docs/planning/roadmaps/SENIOR_DEV_ROADMAP.md"
    echo "   ✅ Removed SENIOR_DEV_ROADMAP.md"
fi

if [[ -f "docs/planning/roadmaps/TECHNICAL_AUDIT_AND_ROADMAP.md" ]]; then
    cp "docs/planning/roadmaps/TECHNICAL_AUDIT_AND_ROADMAP.md" "$BACKUP_DIR/"
    rm "docs/planning/roadmaps/TECHNICAL_AUDIT_AND_ROADMAP.md"
    echo "   ✅ Removed TECHNICAL_AUDIT_AND_ROADMAP.md"
fi

# Update .ai/context/README.md to point to new roadmap
echo "📝 Updating AI context README..."
if [[ -f ".ai/context/README.md" ]]; then
    cp ".ai/context/README.md" "$BACKUP_DIR/"
    cat > ".ai/context/README.md" << 'EOF'
# LingoLinq-AAC AI Assistant Documentation

## Quick Start for AI Sessions
1. Read `LIGHTWEIGHT_CONTEXT.md` for project overview
2. Check `../DEVELOPMENT_ROADMAP.md` for current priorities
3. Review main `README.md` for setup instructions

## Key Files for New Team Context
- `LIGHTWEIGHT_CONTEXT.md` - Quick project summary (~200 tokens)
- `../DEVELOPMENT_ROADMAP.md` - Single source of truth for planning
- `../README.md` - Complete project documentation
- `TEAM_WORKFLOW.md` - AI development tools and commands

## Development Priorities
See `../DEVELOPMENT_ROADMAP.md` for current phase and priorities.
Phase 1 focus: Stabilize current architecture with security fixes.

Generated: $(date)
EOF
    echo "   ✅ Updated .ai/context/README.md"
fi

# Show what we kept vs removed
echo ""
echo "📋 Summary for New Team:"
echo "   ✅ KEPT: DEVELOPMENT_ROADMAP.md (single source of truth)"
echo "   ✅ KEPT: README.md (main project docs)"
echo "   ✅ KEPT: docker/README.md (Docker setup)"
echo "   ✅ KEPT: .ai/context/LIGHTWEIGHT_CONTEXT.md (AI quick context)"
echo "   🗑️  REMOVED: 5 duplicate roadmap files"
echo "   📦 BACKED UP: All removed files in $BACKUP_DIR/"
echo ""
echo "🎯 New team should start with:"
echo "   1. README.md - Project overview and setup"
echo "   2. DEVELOPMENT_ROADMAP.md - Current priorities"  
echo "   3. docker-compose up - Get running immediately"
echo ""
echo "✨ Ready for new team handoff!"