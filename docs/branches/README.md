# Branch-Specific Documentation

This directory contains documentation that is specific to individual feature branches or epics.

## **Directory Structure**

Each branch gets its own subdirectory named after the branch:

```
branches/
├── feature-llm-enhanced-inflections/
│   ├── MULTI_LANGUAGE_GRAMMAR_EXPANSION.md
│   └── MULTI_LANGUAGE_TASKS.md
├── epic-ai-features/
│   └── (epic-specific docs)
├── epic-rebranding-and-ux-ui/
│   └── (epic-specific docs)
└── rails-6-to-7-upgrade/
    └── (upgrade-specific docs)
```

## **What Goes Here**

### **✅ Branch-Specific Content:**
- Feature requirements and specifications
- Implementation task breakdowns and tracking
- Branch-specific research and analysis
- Feature testing plans and results
- Progress reports for specific initiatives

### **✅ Epic-Level Planning:**
- Epic roadmaps and timelines  
- Stakeholder communications
- Epic-specific architecture decisions
- Epic success metrics and tracking

### **❌ What Does NOT Go Here:**
- Global project documentation (goes in `/docs/`)
- AI agent configurations (goes in `/.ai/`)
- Temporary session files (should be gitignored)
- Personal notes (keep locally)

## **Naming Conventions**

### **Directory Names:**
- Use the exact branch name with hyphens instead of slashes
- Examples:
  - `feature/llm-enhanced-inflections` → `feature-llm-enhanced-inflections/`
  - `epic/ai-features` → `epic-ai-features/`
  - `rails-6-to-7-upgrade` → `rails-6-to-7-upgrade/`

### **File Names:**
- Use UPPERCASE for major documentation (README, specifications)
- Use descriptive names that indicate content scope
- Examples:
  - `FEATURE_SPECIFICATION.md`
  - `IMPLEMENTATION_TASKS.md` 
  - `TESTING_PLAN.md`
  - `PROGRESS_REPORT.md`

## **Lifecycle Management**

### **Creating New Branch Documentation:**
1. Create directory when starting significant branch work
2. Add README.md explaining the branch's purpose
3. Document initial requirements and scope
4. Track implementation progress

### **Maintaining During Development:**
1. Update task lists and progress regularly
2. Document architectural decisions made
3. Record testing results and issues
4. Note any scope changes or pivots

### **After Branch Completion:**
1. **DO NOT DELETE** - keep for historical reference
2. Add final status and results summary
3. Archive any temporary files
4. Update links from other documentation

## **Cross-Reference Guidelines**

### **Linking to Global Docs:**
```markdown
See the global [API Documentation](../development/API_DOCUMENTATION.md)
```

### **Linking Between Branches:**
```markdown
This builds on work from [Epic AI Features](../epic-ai-features/OVERVIEW.md)
```

### **Linking from Global to Branch:**
```markdown
Current implementation in [LLM Inflections branch](branches/feature-llm-enhanced-inflections/)
```

## **Template Structure**

When creating a new branch directory, consider this template:

```
feature-your-branch-name/
├── README.md                    # Branch overview and status
├── FEATURE_SPECIFICATION.md    # Requirements and scope
├── IMPLEMENTATION_TASKS.md     # Detailed task breakdown
├── ARCHITECTURE_DECISIONS.md   # Branch-specific design choices
├── TESTING_PLAN.md            # How to test this feature
└── PROGRESS_REPORT.md         # Regular status updates
```

## **Getting Help**

- Check the main [Organization Guidelines](../../.ai/ORGANIZATION_GUIDELINES.md)
- Ask questions in team discussions before creating new structures
- Follow established patterns from existing branch directories

---

*This directory helps keep feature-specific documentation organized and prevents root-level clutter.*