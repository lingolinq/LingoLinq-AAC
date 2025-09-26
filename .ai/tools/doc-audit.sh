#!/usr/bin/env bash

# Documentation Audit Tool for LingoLinq AAC
# Scans all documentation files for outdated references and duplicates

REPO_PATH="$(git rev-parse --show-toplevel)"
AUDIT_REPORT="$REPO_PATH/.ai/context/DOCUMENTATION_AUDIT_REPORT.md"

echo "🔍 LingoLinq AAC Documentation Audit Report" > "$AUDIT_REPORT"
echo "Generated: $(date)" >> "$AUDIT_REPORT"
echo "" >> "$AUDIT_REPORT"

# Function to scan for outdated patterns
scan_outdated_patterns() {
    echo "## 🚨 Outdated References Found" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    # Scan for old Gemini references
    echo "### bin/devin-gemini References (OUTDATED)" >> "$AUDIT_REPORT"
    echo "\`bin/devin-gemini\` was removed but still referenced in:" >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    grep -r "bin/devin-gemini\|devin-gemini" --include="*.md" "$REPO_PATH" | grep -v node_modules | grep -v bower_components | grep -v ".git" | head -20 >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    # Scan for old launch patterns
    echo "### Outdated Launch Commands" >> "$AUDIT_REPORT"
    echo "Files mentioning old launch patterns:" >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    grep -r "gemini.*simple\|launch.*gemini" --include="*.md" "$REPO_PATH" | grep -v node_modules | grep -v bower_components | grep -v ".git" | head -10 >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    # Scan for SweetSuite references
    echo "### Legacy SweetSuite References" >> "$AUDIT_REPORT"
    echo "Old branding that should be updated:" >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    grep -r "SweetSuite\|CoughDrop" --include="*.md" "$REPO_PATH" | grep -v node_modules | grep -v bower_components | grep -v ".git" | head -10 >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"
}

# Function to identify duplicate content
scan_duplicates() {
    echo "## 📄 Potential Duplicate Documents" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    # Find similar file names
    echo "### Similar File Names" >> "$AUDIT_REPORT"
    find "$REPO_PATH" -name "*.md" -type f | grep -v node_modules | grep -v bower_components | sort | uniq -d >> "$AUDIT_REPORT" 2>/dev/null
    echo "" >> "$AUDIT_REPORT"

    # Find README files
    echo "### Multiple README Files" >> "$AUDIT_REPORT"
    find "$REPO_PATH" -name "*README*" -type f | grep -v node_modules | grep -v bower_components | sort >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    # Find setup/getting started docs
    echo "### Setup/Getting Started Documents" >> "$AUDIT_REPORT"
    find "$REPO_PATH" -name "*SETUP*" -o -name "*GETTING*" -o -name "*START*" | grep -v node_modules | grep -v bower_components | sort >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"
}

# Function to analyze documentation structure
analyze_structure() {
    echo "## 📊 Documentation Structure Analysis" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    echo "### Documentation Distribution" >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    find "$REPO_PATH" -name "*.md" -type f | grep -v node_modules | grep -v bower_components | sed 's|'"$REPO_PATH"'/||' | sort | head -30 >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    echo "### Documentation by Directory" >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    find "$REPO_PATH" -name "*.md" -type f | grep -v node_modules | grep -v bower_components | xargs dirname | sort | uniq -c | sort -nr >> "$AUDIT_REPORT"
    echo "\`\`\`" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"
}

# Function to generate recommendations
generate_recommendations() {
    echo "## ✅ Recommended Actions" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    echo "### Immediate Fixes Needed" >> "$AUDIT_REPORT"
    echo "1. **Update AI Development Guide** - Remove all \`bin/devin-gemini\` references" >> "$AUDIT_REPORT"
    echo "2. **Update SETUP.md** - Replace with current launch commands" >> "$AUDIT_REPORT"
    echo "3. **Clean DEVIN_CLEANUP_SUMMARY.md** - This can be archived or removed" >> "$AUDIT_REPORT"
    echo "4. **Update README.md** - Remove outdated launch references" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    echo "### Documentation Consolidation" >> "$AUDIT_REPORT"
    echo "- Consider merging multiple setup guides" >> "$AUDIT_REPORT"
    echo "- Archive obsolete planning documents to docs/archive/" >> "$AUDIT_REPORT"
    echo "- Standardize AI tool documentation in .ai/docs/" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"

    echo "### Quality Improvements" >> "$AUDIT_REPORT"
    echo "- Add last-updated dates to all major docs" >> "$AUDIT_REPORT"
    echo "- Cross-reference related documents" >> "$AUDIT_REPORT"
    echo "- Create index/navigation for docs/" >> "$AUDIT_REPORT"
    echo "" >> "$AUDIT_REPORT"
}

# Main execution
echo "🔍 Starting documentation audit..."

# Create sections
scan_outdated_patterns
scan_duplicates
analyze_structure
generate_recommendations

echo "## 🎯 Summary" >> "$AUDIT_REPORT"
echo "" >> "$AUDIT_REPORT"
TOTAL_MD_FILES=$(find "$REPO_PATH" -name "*.md" -type f | grep -v node_modules | grep -v bower_components | wc -l)
OUTDATED_REFS=$(grep -r "bin/devin-gemini" --include="*.md" "$REPO_PATH" | grep -v node_modules | grep -v bower_components | wc -l)

echo "- **Total Markdown Files:** $TOTAL_MD_FILES" >> "$AUDIT_REPORT"
echo "- **Files with Outdated References:** $OUTDATED_REFS" >> "$AUDIT_REPORT"
echo "- **Priority:** HIGH - Outdated AI tool references confusing to developers" >> "$AUDIT_REPORT"
echo "" >> "$AUDIT_REPORT"
echo "📍 **Next Step:** Review and apply fixes in recommended order" >> "$AUDIT_REPORT"

echo "✅ Audit complete! Report saved to: $AUDIT_REPORT"
echo "📖 Review the report and run the fix script to apply changes."