#!/usr/bin/env python3
"""Tests for scripts/ci-shard-compare.py: run with `python3 scripts/ci-shard-compare.test.py`."""
import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("ci-shard-compare.py")
SPEC = importlib.util.spec_from_file_location("ci_shard_compare", SCRIPT)
compare_mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compare_mod)


def tap(total, failed=(), stamp="2026-10-06T12:00:00.0000000Z "):
    """A job log as GitHub stores it: timestamped TAP lines."""
    lines = []
    number = 0
    for name in failed:
        number += 1
        lines.append("%snot ok %d Chrome 147.0 - [12 ms] - %s" % (stamp, number, name))
    for _ in range(total - len(failed)):
        number += 1
        lines.append("%sok %d Chrome 147.0 - [3 ms] - module: a test" % (stamp, number))
    lines += ["%s# tests %d" % (stamp, total), "%s# pass  %d" % (stamp, total - len(failed)),
              "%s# skip  0" % stamp, "%s# todo  0" % stamp, "%s# fail  %d" % (stamp, len(failed))]
    return "\n".join(lines) + "\n"


class ShardCompareTest(unittest.TestCase):
    def check(self, full, *shards):
        return compare_mod.compare(compare_mod.parse(full), [compare_mod.parse(s) for s in shards])

    def test_a_faithful_split_matches(self):
        self.assertEqual(self.check(tap(10), tap(6), tap(4)), [])

    def test_the_same_failure_in_both_runs_matches(self):
        self.assertEqual(self.check(tap(10, ["m: broken"]), tap(6, ["m: broken"]), tap(4)), [])

    def test_a_count_mismatch_is_reported(self):
        # e.g. a mangled filter that dropped part of the suite
        self.assertIn("shards ran 9 tests, the full run 10", self.check(tap(10), tap(5), tap(4)))

    def test_a_shard_that_ran_nothing_is_reported(self):
        self.assertIn("shard 2 ran 0 tests", self.check(tap(10), tap(10), tap(0)))

    def test_a_failure_only_in_a_shard_is_reported(self):
        self.assertEqual(self.check(tap(10), tap(6, ["m: order dependent"]), tap(4)),
                         ["failed only in a shard: m: order dependent"])

    def test_a_failure_only_in_the_full_run_is_reported(self):
        self.assertEqual(self.check(tap(10, ["m: hidden by the split"]), tap(6), tap(4)),
                         ["failed only in the full run: m: hidden by the split"])

    def test_the_command_exits_by_outcome(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for name, text in {"full": tap(10), "a": tap(6), "b": tap(4), "short": tap(3), "empty": "no tap here\n"}.items():
                paths[name] = pathlib.Path(tmp) / name
                paths[name].write_text(text)
            run = lambda *names: subprocess.run([sys.executable, str(SCRIPT)] + [str(paths[n]) for n in names],
                                                capture_output=True, text=True).returncode
            self.assertEqual(run("full", "a", "b"), 0)
            self.assertEqual(run("full", "a", "short"), 1)
            self.assertEqual(run("full", "a", "empty"), 2)


if __name__ == "__main__":
    unittest.main()
