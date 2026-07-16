#!/usr/bin/env python3
"""Wrap the reviewer's model-output JSON with CI-trusted routing fields
before POSTing to n8n W2.

Without this, W2 would have to key its routing (which PR to comment on,
which commit status to resolve) off values the model itself asserted inside
review.json. Wrap them instead in an envelope of Actions-validated values so
W2 trusts CI ground truth, not model output.

Usage: codex-review-build-envelope.py <review-json-file> <output-file>
Reads PR_NUMBER, HEAD_SHA, BASE_SHA, LOOP_N, REVIEWER_ROUTE, RUN_ID from env.
"""
import json
import os
import pathlib
import sys


INFRASTRUCTURE_CATEGORY = "live_state"
INFRASTRUCTURE_MARKERS = (
    "bwrap:",
    "bubblewrap",
    "failed rtm_newaddr",
    "operation not permitted",
    "every shell invocation failed",
    "unable to complete the mandated read-only repository inspection",
    "sandbox",
)


def is_infrastructure_inconclusive(review):
    """Return true for runner/tooling failures, not real review findings."""
    if str(review.get("verdict", "")).upper() != "NEEDS_HUMAN":
        return False

    findings = review.get("findings")
    if not isinstance(findings, list) or not findings:
        return False

    has_infrastructure_marker = False
    for finding in findings:
        if not isinstance(finding, dict):
            return False
        if finding.get("category") != INFRASTRUCTURE_CATEGORY:
            return False
        text = " ".join(
            str(finding.get(key, ""))
            for key in ("description", "evidence", "suggested_fix", "verifiable_check")
        ).lower()
        if any(marker in text for marker in INFRASTRUCTURE_MARKERS):
            has_infrastructure_marker = True
    return has_infrastructure_marker


def review_outcome(review):
    verdict = str(review.get("verdict", "")).upper()
    if verdict == "APPROVE":
        return {
            "kind": "approved",
            "status_state": "success",
            "status_description": "Codex review approved",
            "human_label": "Approved",
        }
    if is_infrastructure_inconclusive(review):
        return {
            "kind": "inconclusive_infrastructure",
            "status_state": "success",
            "status_description": "Codex review inconclusive (runner/sandbox)",
            "human_label": "Inconclusive - runner/sandbox",
        }
    return {
        "kind": "requires_attention",
        "status_state": "failure",
        "status_description": "Codex review requires changes",
        "human_label": "Requires attention",
    }


def main():
    review_path, output_path = sys.argv[1], sys.argv[2]
    review = json.loads(pathlib.Path(review_path).read_text())
    outcome = review_outcome(review)

    envelope = {
        "pr_number": int(os.environ["PR_NUMBER"]),
        "head_sha": os.environ["HEAD_SHA"],
        "base_sha": os.environ["BASE_SHA"],
        "loop_n": int(os.environ["LOOP_N"]),
        "reviewer_route": os.environ["REVIEWER_ROUTE"],
        "run_id": os.environ["RUN_ID"],
        "review_outcome": outcome,
        "status": {
            "state": outcome["status_state"],
            "description": outcome["status_description"],
            "context": "codex-review/deep-pass",
        },
        "review": review,
    }
    pathlib.Path(output_path).write_text(json.dumps(envelope))


if __name__ == "__main__":
    main()
