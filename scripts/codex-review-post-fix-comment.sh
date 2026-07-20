#!/usr/bin/env bash
#
# codex-review-post-fix-comment.sh — posts the finding-id -> commit-SHA
# mapping comment required by the build spec (section 4) after claude-fix.yml
# pushes a fix commit.
#
# USAGE
#   scripts/codex-review-post-fix-comment.sh <pr_number> <commit_sha> <findings_json_file>
#
set -euo pipefail

PR_NUMBER="${1:?usage: $0 <pr_number> <commit_sha> <findings_json_file>}"
COMMIT_SHA="${2:?usage: $0 <pr_number> <commit_sha> <findings_json_file>}"
FINDINGS_FILE="${3:?usage: $0 <pr_number> <commit_sha> <findings_json_file>}"

if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "pr_number is not numeric" >&2
  exit 1
fi

BODY="$(python3 - "$FINDINGS_FILE" "$COMMIT_SHA" <<'PYEOF'
import json, sys

findings_file, sha = sys.argv[1], sys.argv[2]
findings = json.load(open(findings_file))

lines = [
    "## Claude fix pass",
    "",
    f"Commit: `{sha}`",
    "",
    "| Finding | Status |",
    "|---|---|",
]
for f in findings:
    fid = f.get("id", "?")
    lines.append(f"| {fid} | addressed in `{sha}` |")
lines.append("")
lines.append(
    "Any finding marked *disputed* in the commit message body was left "
    "unchanged on purpose; the next codex-review pass will route it to "
    "NEEDS_HUMAN rather than silently re-approving it."
)
print("\n".join(lines))
PYEOF
)"

gh pr comment "$PR_NUMBER" --body "$BODY"
