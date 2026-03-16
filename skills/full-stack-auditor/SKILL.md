# Full-Stack Auditor Skill

## Purpose
Master audit skill that orchestrates all domain-specific audits and produces an aggregate MVP readiness score.

## Procedure
1. Invoke each domain skill (or delegate to subagents)
2. Collect all findings
3. Compute MVP readiness score
4. Generate unified report

## MVP Readiness Score (0-100)
Weighted average across domains:
| Domain | Weight | Criteria |
|--------|--------|----------|
| Ember Health | 20% | Deprecation count, build success, test pass rate |
| Rails Health | 20% | Gem currency, CVE count, deprecation count |
| API Contracts | 15% | Mismatch count, coverage of endpoints |
| Compliance | 20% | GDPR/FERPA checklist completion |
| Dependencies | 10% | Outdated count, vulnerability count |
| Infrastructure | 15% | SOC2 checklist, Render health, monitoring |

## Score Interpretation
- 80-100: MVP ready, proceed to launch prep
- 60-79: Significant work needed, prioritize critical findings
- 40-59: Major blockers exist, address before MVP planning
- 0-39: Foundational issues, needs architectural review

## Output Format
```json
{
  "audit_date": "ISO-8601",
  "mvp_readiness_score": "0-100",
  "domain_scores": {
    "ember": { "score": "0-100", "findings_count": "N", "critical": "N" },
    "rails": { "score": "0-100", "findings_count": "N", "critical": "N" },
    "api": { "score": "0-100", "findings_count": "N", "critical": "N" },
    "compliance": { "score": "0-100", "findings_count": "N", "critical": "N" },
    "dependencies": { "score": "0-100", "findings_count": "N", "critical": "N" },
    "infrastructure": { "score": "0-100", "findings_count": "N", "critical": "N" }
  },
  "top_blockers": [],
  "recommendations": []
}
```
