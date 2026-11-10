#!/usr/bin/env python3
"""scripts/codex-review-path-classifier.sh against a real git repository.

Moved unchanged from scripts/codex-review-chunked-scope.test.py (PathClassifierTest) when the CI
Codex review gate was removed on 2026-10-27: the rest of that file tested the removed workflow,
but this class tests the classifier the data-bearing-paths gate still reads. It covers what
scripts/tests/codex-review-path-classifier-test.sh does not: real git quoting of tab, newline,
quote and backslash names, a compliance rename, and uppercase data-file extensions.
Stdlib-only (unittest).
"""
import os
import pathlib
import subprocess
import tempfile
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]


class PathClassifierTest(unittest.TestCase):
    """scripts/codex-review-path-classifier.sh against a real repository (2026-10-02): a name git
    quotes (tab, newline, `"`, `\\`) must never reach a reviewer. Since the merge with develop
    (2026-10-09, approved by Traci) the classifier fails closed on such a name: exit 3, no route
    written, as scripts/tests/codex-review-path-classifier-test.sh also pins."""

    def classify(self, names, moves=(), expect_exit=0):
        """`names` are added at head. Each (old, new) in `moves` is committed at base, then renamed
        at head with one line appended, so git still pairs the two as a rename. With expect_exit=3
        the classifier must fail closed: that exit status and no route written (returns None)."""
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp) / "repo"
            repo.mkdir()
            git = ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t"]
            subprocess.run(git + ["init", "-q"], check=True)
            (repo / "README").write_text("base\n")
            for old, _new in moves:
                path = repo / old
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("".join("row %d\n" % i for i in range(20)))
            subprocess.run(git + ["add", "-A"], check=True)
            subprocess.run(git + ["commit", "-qm", "base"], check=True)
            base = subprocess.run(git + ["rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
            for old, new in moves:
                (repo / new).parent.mkdir(parents=True, exist_ok=True)
                subprocess.run(git + ["mv", old, new], check=True)
                with (repo / new).open("a") as handle:
                    handle.write("edited\n")
            for name in names:
                path = repo / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("x\n")
            subprocess.run(git + ["add", "-A"], check=True)
            subprocess.run(git + ["commit", "-qm", "head"], check=True)
            head = subprocess.run(git + ["rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
            output = pathlib.Path(tmp) / "out"
            output.write_text("")
            env = dict(os.environ, GITHUB_OUTPUT=str(output), CODEX_COMPLIANCE_PATHS="block")
            result = subprocess.run(
                [str(REPO_ROOT / "scripts/codex-review-path-classifier.sh"), base, head],
                cwd=repo, env=env, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, expect_exit, result.stderr)
            if expect_exit != 0:
                self.assertEqual(output.read_text(), "", "a route was written although the classifier failed")
                return None
            return dict(line.split("=", 1) for line in output.read_text().split())

    def test_ordinary_paths_go_to_codex(self):
        self.assertEqual(self.classify(["app/models/a.rb"])["reviewer_route"], "codex")

    def test_data_bearing_names_that_git_quotes_fail_closed(self):
        for name in ("db/data/a\tb.json", "dump\"x.sql", "back\\slash.csv", "db/data/a\nb.json", "notes\nx.sql"):
            with self.subTest(name=name):
                self.classify([name], expect_exit=3)

    def test_compliance_names_that_git_quotes_fail_closed(self):
        self.classify(["docs/legal/a\tb.md"], expect_exit=3)

    def test_renaming_a_data_bearing_file_out_is_still_blocked(self):
        # A rename's diff carries the old path and its rows, so the old name must be classified too.
        moved = self.classify([], moves=[("spec/fixtures/users.json", "lib/users.json")])
        self.assertEqual(moved["reviewer_route"], "blocked")

    def test_renaming_a_compliance_file_out_still_routes_to_claude_deep(self):
        moved = self.classify([], moves=[("docs/legal/policy.md", "docs/policy.md")])
        self.assertEqual(moved["reviewer_route"], "claude-deep")

    def test_an_uppercase_data_file_extension_is_still_blocked(self):
        # Excel and Windows exports are often named STUDENTS.CSV / Roster.XLSX; case must not
        # route a data file to the no-BAA model.
        for name in ("tmp/students.CSV", "Exports.XLSX", "dump/Patients.Sql"):
            self.assertEqual(self.classify([name])["reviewer_route"], "blocked", name)

    def test_an_uppercase_data_directory_is_still_blocked(self):
        self.assertEqual(self.classify(["spec/Fixtures/users.json"])["reviewer_route"], "blocked")


if __name__ == "__main__":
    unittest.main()
