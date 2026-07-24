#!/usr/bin/env python3
"""Assemble the envelope manifest consumed by codex-review-build-envelope.py
--manifest, from the per-chunk review files the reviewer step produced.

This decouples the reviewer steps (which just drop review JSON on disk in a
predictable naming scheme) from the fold step (which needs, per chunk, that
chunk's diff file plus its convergence-run review files, in order). It also
turns the two fail-closed edge cases into ordinary blocked chunks so the fold
step needs no special-casing:

- Overflow tail: files beyond the --max-chunks cap were never reviewed. We
  synthesize a NEEDS_HUMAN review for them so the PR fails closed (a genuinely
  enormous PR still routes to a human, exactly the pre-chunking behavior, but
  only for the tail past the cap).
- Blocked (Tier 1 data-bearing path): no external reviewer may see the diff, so
  there are no chunks; the pre-written synthetic review becomes the sole chunk
  with an empty diff (the injection guard is then a no-op on it).

Review-file naming (written by the reviewer step): for chunk index i (from the
chunker manifest), its convergence runs are
  <reviews-dir>/chunk-<i:02d>-run-1.json, ...-run-2.json, ...-run-3.json
in run order. Missing later runs (no tiebreaker) are simply absent.

Usage:
  codex-review-assemble-manifest.py --route <codex|claude-deep|blocked> \
      --out <envelope-manifest.json> \
      [--chunk-manifest <chunker-manifest.json>] [--reviews-dir <dir>] \
      [--blocked-review <path>]
"""
import argparse
import glob
import json
import os
import pathlib


OVERFLOW_REVIEW = {
    "verdict": "NEEDS_HUMAN",
    "findings": [
        {
            "id": "CHUNK-OVERFLOW-1",
            "severity": "HIGH",
            "category": "path_coverage",
            "file": "(diff-wide)",
            "line": None,
            "description": (
                "This PR is large enough that its diff exceeded the reviewer's "
                "per-run chunk budget: some changed files past the chunk cap "
                "were not reviewed. Fail closed -- a human must review the "
                "uncovered files."
            ),
            "evidence": "codex-review-chunk-diff.py reported files beyond --max-chunks.",
            "suggested_fix": (
                "Split this PR into smaller PRs, or raise CODEX_MAX_DIFF_BYTES / "
                "CODEX_MAX_DIFF_CHUNKS if the runner budget allows, then re-run."
            ),
            "verifiable_check": "scripts/codex-review-chunk-diff.py --diff <diff> --out-dir <dir>",
        }
    ],
    "checks_run": {"register_drift": "n/a", "modes": "n/a", "ci": "n/a"},
    "resolved_from_prior_loop": [],
}


def _chunk_reviews(reviews_dir, index):
    pattern = os.path.join(reviews_dir, f"chunk-{index:02d}-run-*.json")
    # Sort by the run number so convergence sees runs in order.
    return sorted(
        glob.glob(pattern),
        key=lambda p: int(p.rsplit("-run-", 1)[1].split(".")[0]),
    )


def build_manifest(args):
    if args.route == "blocked":
        return {"chunks": [{"diff": None, "reviews": [args.blocked_review]}]}

    chunker = json.loads(pathlib.Path(args.chunk_manifest).read_text())
    chunks = []
    for entry in chunker.get("chunks", []):
        index = entry["index"]
        reviews = _chunk_reviews(args.reviews_dir, index)
        if not reviews:
            # A chunk with no review files means the reviewer never produced a
            # verdict for it (crash/timeout on that pass). Fail closed for it.
            overflow_path = os.path.join(args.reviews_dir, f"chunk-{index:02d}-missing.json")
            pathlib.Path(overflow_path).write_text(json.dumps(OVERFLOW_REVIEW))
            reviews = [overflow_path]
        chunks.append({"diff": entry["path"], "reviews": reviews})

    if chunker.get("overflow_files"):
        overflow_path = os.path.join(args.reviews_dir, "chunk-overflow.json")
        pathlib.Path(overflow_path).write_text(json.dumps(OVERFLOW_REVIEW))
        chunks.append({"diff": None, "reviews": [overflow_path]})

    return {"chunks": chunks}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--route", required=True, choices=["codex", "claude-deep", "blocked"])
    parser.add_argument("--out", required=True)
    parser.add_argument("--chunk-manifest", default=None)
    parser.add_argument("--reviews-dir", default=None)
    parser.add_argument("--blocked-review", default=None)
    args = parser.parse_args()

    manifest = build_manifest(args)
    pathlib.Path(args.out).write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
