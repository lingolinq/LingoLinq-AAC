#!/usr/bin/env python3
"""The codex hardening arguments really take effect in the pinned codex release.

.github/codex/codex-exec-args.txt turns off every tool the reviewer model could use to act on the
runner (commands, browser, images, web search, plugins, hooks). codex accepts an unknown `-c` key
without complaint, so a misspelt or renamed feature would leave that tool ON with nothing failing.
This test runs the real binary at the version codex-review.yml installs and checks the effective
state. It needs no API key and makes no model call.

Run by the codex-review-tests job in ci.yml after it installs the pinned version. It fails, rather
than skipping, when `codex` is missing or is a different version.
"""
import os
import pathlib
import re
import subprocess
import tempfile
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github/workflows/codex-review.yml"
ARGS_FILE = REPO_ROOT / ".github/codex/codex-exec-args.txt"


def hardening_args():
    return [line for line in ARGS_FILE.read_text().splitlines() if line and not line.startswith("#")]


def config_overrides():
    args = hardening_args()
    return [args[i + 1] for i, arg in enumerate(args) if arg == "-c"]


def pinned_version():
    match = re.search(r"@openai/codex@(\d+\.\d+\.\d+)", WORKFLOW.read_text())
    if not match:
        raise AssertionError("codex-review.yml does not install an exact @openai/codex version")
    return match.group(1)


def codex(*args):
    with tempfile.TemporaryDirectory() as home:
        env = dict(os.environ, CODEX_HOME=home)
        env.pop("CODEX_API_KEY", None)
        env.pop("OPENAI_API_KEY", None)
        return subprocess.run(["codex", *args], capture_output=True, text=True, env=env, timeout=120)


def feature_states(*overrides):
    flags = [part for override in overrides for part in ("-c", override)]
    result = codex(*flags, "features", "list")
    if result.returncode != 0:
        raise AssertionError(f"`codex features list` failed: {result.stderr.strip()[:300]}")
    states = {}
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[-1] in ("true", "false"):
            states[parts[0]] = parts[-1] == "true"
    return states


class PinnedCodexHardeningTest(unittest.TestCase):
    def test_the_installed_codex_is_the_pinned_version(self):
        result = codex("--version")
        self.assertEqual(result.returncode, 0, "codex is not installed; ci.yml installs the pinned version first")
        self.assertIn(pinned_version(), result.stdout, "installed codex differs from the version codex-review.yml pins")

    def test_every_feature_override_names_a_real_feature_and_turns_it_off(self):
        features = {o.split("=", 1)[0][len("features."):]: o.split("=", 1)[1]
                    for o in config_overrides() if o.startswith("features.")}
        self.assertIn("shell_tool", features)
        defaults = feature_states()
        effective = feature_states(*config_overrides())
        for name, value in features.items():
            with self.subTest(feature=name):
                self.assertEqual(value, "false", "the hardening file should only turn features off")
                self.assertIn(name, defaults, "not a feature in the pinned codex: a typo here is silently ignored")
                self.assertFalse(effective[name], "the override did not take effect")

    def test_every_other_config_override_is_accepted(self):
        others = [o for o in config_overrides() if not o.startswith("features.")]
        self.assertIn('web_search="disabled"', others)
        for override in others:
            with self.subTest(override=override):
                result = codex("-c", override, "features", "list")
                self.assertEqual(result.returncode, 0, "codex rejected the override")
        # The check above can fail: an invalid value is rejected rather than ignored.
        self.assertNotEqual(codex("-c", 'web_search="not-a-mode"', "features", "list").returncode, 0)

    def test_exec_accepts_every_hardening_flag(self):
        result = codex("exec", *hardening_args(), "--help")
        self.assertEqual(result.returncode, 0, f"`codex exec` rejected a flag: {result.stderr.strip()[:300]}")


if __name__ == "__main__":
    unittest.main()
