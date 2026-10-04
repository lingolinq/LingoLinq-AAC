#!/usr/bin/env python3
"""scripts/codex-review-secret-scan.py: what it finds, what it leaves alone, and what it prints.

Every credential-shaped value below is assembled at runtime from parts, so this file holds no
string that looks like a real token to GitHub push protection or the secret-detection job.
"""
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("codex-review-secret-scan.py")
SPEC = importlib.util.spec_from_file_location("codex_review_secret_scan", SCRIPT)
secret_scan = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(secret_scan)


def fake(*parts):
    return "".join(parts)


ALNUM = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6"
UPPER = "A1B2C3D4E5F6G7H8"
B64 = "aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1eF3hJ5kL7n"  # 40 characters

# One example per check that should fire, keyed by the check's name.
POSITIVES = {
    "openai_or_anthropic_key": fake("sk", "-proj-", ALNUM),
    "github_token": fake("gh", "p_", ALNUM, "abcd"),
    "aws_access_key_id": fake("key=", "AK", "IA", UPPER),
    "aws_secret_access_key": fake("aws_secret_access_key", " = ", B64),
    "google_api_key": fake("AI", "za", ALNUM, "abc"),
    "private_key_block": fake("-----BEGIN ", "RSA PRIVATE KEY", "-----"),
    "pgp_private_key_block": fake("-----BEGIN ", "PGP PRIVATE KEY BLOCK", "-----"),
    "stripe_key": fake("sk", "_live_", ALNUM),
    "slack_token": fake("xo", "xb-", "123456789012-", ALNUM),
    "slack_webhook": fake("hooks.", "slack.com/services/", "T000/B000/", ALNUM),
    "jwt": fake("ey", "JhbGciOiJIUzI1NiJ9", ".", "ey", "JzdWIiOiIxMjM0NTY3ODkwIn0", ".", ALNUM),
    "url_with_password": fake("postgres://", "admin", ":", "hunter2hunter2", "@db.example.invalid/x"),
}


class SecretScanTest(unittest.TestCase):
    def test_each_credential_format_is_found(self):
        for name, value in POSITIVES.items():
            with self.subTest(check=name):
                self.assertIn(name, secret_scan.scan(f"the finding quotes {value} here", {}))

    def test_a_restricted_stripe_key_is_found(self):
        self.assertIn("stripe_key", secret_scan.scan(fake("rk", "_live_", ALNUM), {}))

    def test_a_secret_split_by_zero_width_characters_is_found(self):
        value = POSITIVES["github_token"]
        split = value[:6] + "​" + value[6:12] + "⁠" + value[12:]
        self.assertIn("github_token", secret_scan.scan(split, {}))

    def test_a_json_escaped_secret_is_found(self):
        value = POSITIVES["stripe_key"]
        escaped = json.dumps({"review": value}).replace(value[:2], "\\u0073\\u006b")
        self.assertIn("stripe_key", secret_scan.scan(escaped, {}))

    def test_an_environment_secret_is_found_with_or_without_its_scheme(self):
        environ = {"N8N_WEBHOOK_URL": "https://n8n.example.invalid/webhook/abc123"}
        for text in ("https://n8n.example.invalid/webhook/abc123", "n8n.example.invalid/webhook/abc123"):
            with self.subTest(text=text):
                self.assertIn("env:N8N_WEBHOOK_URL", secret_scan.scan(text, environ))

    def test_ordinary_review_text_is_clean(self):
        text = (
            "The sk-learn import is unused. Rename task_list to tasks. "
            "spec/models/user_spec.rb sets password: 'password' for the fixture user. "
            "See https://github.com/lingolinq/LingoLinq-AAC/pull/1103 and postgres://localhost/db. "
            "AKIA is the AWS prefix. BEGIN PUBLIC KEY blocks are fine."
        )
        self.assertEqual(secret_scan.scan(text, {"PATH": "/usr/bin"}), [])

    def test_a_hit_exits_one_and_never_prints_the_value(self):
        value = POSITIVES["stripe_key"]
        with tempfile.TemporaryDirectory() as tmp:
            envelope = pathlib.Path(tmp) / "envelope.json"
            envelope.write_text(json.dumps({"review": f"quoted {value}"}))
            result = subprocess.run([sys.executable, "-I", str(SCRIPT), str(envelope)],
                                    capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("stripe_key", result.stderr)
        self.assertNotIn(value, result.stdout + result.stderr)

    def test_a_clean_envelope_exits_zero_and_an_unreadable_one_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            envelope = pathlib.Path(tmp) / "envelope.json"
            envelope.write_text(json.dumps({"review": "looks fine"}))
            clean = subprocess.run([sys.executable, "-I", str(SCRIPT), str(envelope)], capture_output=True)
            missing = subprocess.run([sys.executable, "-I", str(SCRIPT), str(pathlib.Path(tmp) / "nope")],
                                     capture_output=True)
        self.assertEqual(clean.returncode, 0)
        self.assertEqual(missing.returncode, 2)


if __name__ == "__main__":
    unittest.main()
