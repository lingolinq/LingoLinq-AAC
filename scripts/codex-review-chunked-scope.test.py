#!/usr/bin/env python3
"""Red test for the CODEX_REVIEW_CHUNKED_SCOPE=scot branch-name match.

The matcher lives inline in `.github/workflows/codex-review.yml` because the
Resolve Codex review evidence mode step runs before checkout and cannot call a
repo script. This test extracts that `if` condition from the YAML and evaluates
it in bash, so a revert or a wrong glob fails here rather than only when the
dormant gate is revived.
"""
import pathlib
import re
import shlex
import subprocess
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github/workflows/codex-review.yml"
CONDITION_RE = re.compile(
    r"^\s+scot\)\s*\n"
    r"\s+if (.+); then\s*$",
    re.MULTILINE,
)
OLD_CONDITION = (
    '[ "$PR_AUTHOR" = "swahlquist" ] || [[ "$PR_HEAD_REF" == scot/* ]]'
)

# author, head_ref, expected_match, why
CASES = [
    ("swahlquist", "melissa/fix/x", True, "author bypass"),
    ("other", "scot/chore/x", True, "legacy scot/<type>/<slug>"),
    (
        "other",
        "docs/scot-branch-naming-convention-f3117a76",
        True,
        "new <type>/scot-<slug>-<token>",
    ),
    (
        "other",
        "chore/scot-staging-slow-queue-capacity",
        True,
        "new form without token",
    ),
    ("other", "hotfix/scot-slug", True, "hotfix/<dev>-<slug>"),
    ("other", "fix/melissa-scot-thing", False, "other handle containing scot-"),
    ("other", "melissa/fix/x", False, "legacy other-handle form"),
    (
        "other",
        "feat/melissa-sms-consent-page",
        False,
        "new other-handle form",
    ),
    ("other", "feat/scot", False, "scot handle with no hyphenated slug"),
    ("other", "scot", False, "bare scot with no slash"),
]


def extract_condition():
    text = WORKFLOW.read_text()
    match = CONDITION_RE.search(text)
    if not match:
        raise AssertionError(
            f"could not find scot-arm if-condition in {WORKFLOW}"
        )
    return match.group(1)


def evaluate(author, ref, condition):
    script = (
        f"PR_AUTHOR={shlex.quote(author)}\n"
        f"PR_HEAD_REF={shlex.quote(ref)}\n"
        f"if {condition}; then echo MATCH; else echo MISS; fi\n"
    )
    result = subprocess.run(
        ["bash", "-c", script],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() == "MATCH"


class ChunkedScopeMatchTest(unittest.TestCase):
    def test_old_glob_misses_new_scot_form(self):
        self.assertFalse(
            evaluate(
                "other",
                "docs/scot-branch-naming-convention-f3117a76",
                OLD_CONDITION,
            )
        )

    def test_workflow_scot_arm_matches_expected_cases(self):
        condition = extract_condition()
        self.assertNotEqual(condition, OLD_CONDITION)
        for author, ref, expected, why in CASES:
            with self.subTest(why=why, author=author, ref=ref):
                self.assertEqual(
                    evaluate(author, ref, condition),
                    expected,
                    f"{why}: {author!r} {ref!r} under {condition}",
                )


if __name__ == "__main__":
    unittest.main()
