#!/usr/bin/env python3
"""Assemble the codex-review prompt by injecting live state, memory, and
prior-loop context into .github/codex/review-prompt.md's placeholder blocks.

Usage: codex-review-assemble-prompt.py <output-file>
Reads LIVE_STATE and LOOP_N from the environment (set by codex-review.yml).
"""
import os
import pathlib
import sys

PROMPT_PATH = pathlib.Path(".github/codex/review-prompt.md")
MEMORY_PATH = pathlib.Path(".github/codex/REVIEW-MEMORY.md")


def replace_block(text, marker, replacement_body):
    start = f"<!-- CI_INJECT:{marker} -->"
    end = f"<!-- /CI_INJECT:{marker} -->"
    start_idx = text.index(start)
    end_idx = text.index(end) + len(end)
    return text[:start_idx] + start + "\n" + replacement_body + "\n" + end + text[end_idx:]


def main():
    output_path = sys.argv[1]

    live_state = os.environ["LIVE_STATE"]
    # PR_DIFF is optional/defensive: the workflow always sets it, but fall back
    # gracefully rather than crashing the assemble step if it is ever absent.
    pr_diff = os.environ.get("PR_DIFF", "").strip() or "(no diff was provided to this review)"
    memory = MEMORY_PATH.read_text()
    loop_n = int(os.environ["LOOP_N"])

    prior_loop = "N/A (loop 0 - first pass)."
    if loop_n > 0:
        prior_loop = (
            f"Loop {loop_n}: see the PR's existing codex-review comment thread "
            "for the prior verdict JSON and resolved findings; the comment "
            "carries marker <!-- codex-review loop:N sha:X -->."
        )

    prompt = PROMPT_PATH.read_text()
    prompt = replace_block(prompt, "LIVE_STATE", live_state)
    prompt = replace_block(prompt, "DIFF", pr_diff)
    prompt = replace_block(prompt, "REVIEW_MEMORY", memory)
    prompt = replace_block(prompt, "PRIOR_LOOP", prior_loop)

    pathlib.Path(output_path).write_text(prompt)


if __name__ == "__main__":
    main()
