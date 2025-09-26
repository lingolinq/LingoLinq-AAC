# Branch-Specific Documentation Guidelines

This document explains where branch-specific documentation should be located and how to organize it.

## **Updated Organization**

Branch-specific documentation should now be maintained **within the actual branches**, not in the main branch. This ensures that:
- Branch documentation stays current with branch development
- Main branch stays clean and focused on global documentation
- Each team can maintain their own documentation without conflicts

## **Where to Put Branch Documentation**

### **✅ In Each Branch (Recommended):**
- Create a `docs/` directory within the branch
- Add branch-specific requirements and specifications
- Track implementation progress and decisions
- Document feature testing plans and results

### **✅ Global Documentation (Main Branch):**
- Project overview and architecture (`/docs/`)
- Epic planning and roadmaps (`/docs/epics/`)
- Team onboarding and setup guides (root directory)
- Cross-cutting development guides (`/docs/development/`)

### **❌ Avoid:**
- Branch-specific docs in main branch
- Duplicate documentation across branches
- Conflicting roadmaps and status files

## **Best Practices for Branch Documentation**

### **Creating Branch Documentation:**
1. Create a `docs/` directory in your feature branch
2. Add a README.md explaining the branch's purpose and status
3. Document requirements, progress, and decisions within the branch
4. Link to relevant global documentation in main branch

### **Linking Between Documentation:**
- **To Global Docs**: Reference main branch docs for shared information
- **Cross-Branch**: Coordinate through epic documentation in main
- **From Global**: Reference specific branches when needed

## **Current Main Branch Documentation Structure**

```
LingoLinq-AAC/
├── README.md                     # Project overview
├── GETTING_STARTED.md           # Setup guide
├── BRANCH_ASSIGNMENT_STRATEGY.md # Team organization
├── PROJECT_STATUS.md            # Current status
├── TEAM_ONBOARDING.md           # Onboarding guide
└── docs/
    ├── epics/                   # Epic planning and roadmaps
    ├── planning/                # Strategic planning
    ├── development/             # Development guides
    ├── architecture/            # System architecture
    └── ai/                      # AI development guides
```

This organization keeps main branch documentation focused on global concerns while enabling branches to maintain their own specific documentation.