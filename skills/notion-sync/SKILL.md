# Notion Sync Skill

## Purpose
Push audit results into Notion, creating the page hierarchy if it doesn't exist. Uses the Notion MCP tools.

## Target Hierarchy
```
LingoLinq Workspace
├── Engineering
│   └── Audits
│       ├── Full Audit Report (YYYY-MM-DD)
│       ├── Ember Audit (YYYY-MM-DD)
│       ├── Rails Audit (YYYY-MM-DD)
│       └── API Contract Audit (YYYY-MM-DD)
├── Compliance
│   └── GDPR/FERPA
│       ├── Compliance Report (YYYY-MM-DD)
│       └── Data Map
├── Product
│   └── MVP Readiness
│       └── Readiness Report (YYYY-MM-DD)
└── Infrastructure
    └── Security
        └── SOC2 Assessment (YYYY-MM-DD)
```

## Procedure

### Step 1: Discover or Create Hierarchy
1. Use `notion-search` to find existing pages: "Engineering", "Compliance", "Product", "Infrastructure"
2. If parent pages don't exist, use `notion-create-pages` to create them
3. Create sub-pages as needed

### Step 2: Format Findings
Transform skill output JSON into Notion-friendly content:
- Use callout blocks for severity (red=critical, orange=high, yellow=medium, blue=low, gray=info)
- Use tables for matrices (gem compat, addon compat)
- Use toggle blocks for detailed findings
- Use heading blocks for sections

### Step 3: Upsert Pages
- Search for existing page with matching title + date
- If found: update with `notion-update-page`
- If not found: create with `notion-create-pages`

### Step 4: Update Historical Log
- Append entry to "Audit History" page with date, scores, and link to full report

## MCP Tools Used
- `mcp__notion__notion-search` — find existing pages
- `mcp__notion__notion-create-pages` — create new pages
- `mcp__notion__notion-update-page` — update existing pages
- `mcp__notion__notion-fetch` — read page contents

## Output
```json
{
  "skill": "notion-sync",
  "pages_created": [],
  "pages_updated": [],
  "errors": [],
  "sync_date": "ISO-8601"
}
```
