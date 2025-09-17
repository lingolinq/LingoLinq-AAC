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
