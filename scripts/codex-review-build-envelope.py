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


def main():
    review_path, output_path = sys.argv[1], sys.argv[2]
    review = json.loads(pathlib.Path(review_path).read_text())

    envelope = {
        "pr_number": int(os.environ["PR_NUMBER"]),
        "head_sha": os.environ["HEAD_SHA"],
        "base_sha": os.environ["BASE_SHA"],
        "loop_n": int(os.environ["LOOP_N"]),
        "reviewer_route": os.environ["REVIEWER_ROUTE"],
        "run_id": os.environ["RUN_ID"],
        "review": review,
    }
    pathlib.Path(output_path).write_text(json.dumps(envelope))


if __name__ == "__main__":
    main()
