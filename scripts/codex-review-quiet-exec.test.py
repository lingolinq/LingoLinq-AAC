#!/usr/bin/env python3
"""Tests for the reviewer child environment in scripts/codex-review-quiet-exec.py.

The reviewer (`codex exec`) reads untrusted PR content and can run tools. It
must not inherit the job's GitHub token, other credentials, or the paths of the
runner's per-step file commands (which would let it change the environment of
later steps). Stdlib-only (unittest).
"""
import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
import unittest.mock

MODULE_PATH = pathlib.Path(__file__).with_name("codex-review-quiet-exec.py")
spec = importlib.util.spec_from_file_location("codex_review_quiet_exec", MODULE_PATH)
quiet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quiet)

REMOVED = (
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GITHUB_ENV",
    "GITHUB_PATH",
    "GITHUB_OUTPUT",
    "GITHUB_STATE",
    "GITHUB_STEP_SUMMARY",
    "ACTIONS_RUNTIME_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_URL",
    "RUNNER_TEMP",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "W2_HMAC_SECRET",
    "N8N_CODEX_RESULTS_HMAC_SECRET",
    "SOME_PASSWORD",
    "AWS_SECRET_ACCESS_KEY",
)
KEPT = ("PATH", "HOME", "LANG", "CODEX_HOME", "CODEX_API_KEY", "TMPDIR", "HTTPS_PROXY", "SSL_CERT_FILE")


class ChildEnvironmentTest(unittest.TestCase):
    def test_child_environment_drops_credentials_and_file_commands(self):
        environ = {name: "x" for name in REMOVED + KEPT}
        child = quiet.child_environment(environ)
        for name in REMOVED:
            with self.subTest(removed=name):
                self.assertNotIn(name, child)
        for name in KEPT:
            with self.subTest(kept=name):
                self.assertIn(name, child)

    def test_run_quiet_hands_the_scrubbed_environment_to_the_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "env.json"
            code = f"import json, os; json.dump(dict(os.environ), open({str(out)!r}, 'w'))"
            fake = {name: "x" for name in REMOVED + KEPT}
            fake["PATH"] = os.environ.get("PATH", "")
            with unittest.mock.patch.dict(os.environ, fake, clear=True):
                returncode, label = quiet.run_quiet([sys.executable, "-I", "-c", code], io.BytesIO(b""))
            self.assertEqual((returncode, label), (0, None))
            seen = json.loads(out.read_text())
            for name in REMOVED:
                with self.subTest(removed=name):
                    self.assertNotIn(name, seen)
            self.assertEqual(seen.get("CODEX_API_KEY"), "x")


if __name__ == "__main__":
    unittest.main()
