#!/usr/bin/env python3
"""Assemble the codex-review prompt by injecting live state, memory, and
prior-loop context into .github/codex/review-prompt.md's placeholder blocks.

Usage: codex-review-assemble-prompt.py <output-file>
Reads LIVE_STATE and LOOP_N from the environment (set by codex-review.yml).
"""
import os
import pathlib
import re
import sys

PROMPT_PATH = pathlib.Path(".github/codex/review-prompt.md")
MEMORY_PATH = pathlib.Path(".github/codex/REVIEW-MEMORY.md")

_CI_MARKER_RE = re.compile(r"<!--\s*/?\s*CI_INJECT:[A-Z_]+\s*-->")


def defang_ci_markers(body):
    """Neutralize CI_INJECT delimiter strings that appear INSIDE an injected
    payload before it is spliced into the prompt.

    A payload can legitimately contain these markers -- most notably this
    repo's own `git diff` of review-prompt.md, which literally defines them, so
    any PR that edits the prompt injects a diff full of `<!-- CI_INJECT:* -->`
    lines. Left intact they break assembly two ways: (1) a later
    replace_block() call matches a marker embedded in an already-injected
    payload instead of the real template block, silently eating every hunk
    after it; and (2) the reviewer reads the first embedded `/CI_INJECT:DIFF`
    as the end of the diff and drops every later file. Rewrite the markers to a
    plainly-non-delimiter literal (`[[ ... ]]`) so the content stays readable
    but is no longer parsed as a block boundary by replace_block or the model.
    """
    return _CI_MARKER_RE.sub(
        lambda m: m.group(0).replace("<!--", "[[").replace("-->", "]]"),
        body,
    )


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
    # Defang every payload: any of them can contain CI_INJECT marker strings
    # (the diff of this very prompt file does), and an un-defanged marker inside
    # one payload would be mis-parsed as a block boundary by the replace_block
    # calls below and by the reviewer.
    prompt = replace_block(prompt, "LIVE_STATE", defang_ci_markers(live_state))
    prompt = replace_block(prompt, "DIFF", defang_ci_markers(pr_diff))
    prompt = replace_block(prompt, "REVIEW_MEMORY", defang_ci_markers(memory))
    prompt = replace_block(prompt, "PRIOR_LOOP", defang_ci_markers(prior_loop))

    pathlib.Path(output_path).write_text(prompt)


if __name__ == "__main__":
    main()
