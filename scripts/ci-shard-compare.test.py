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

STAMP = "2026-10-06T12:00:00.0000000Z "


def tap(names, failed=(), shard=None, extra_lines=()):
    """A job log as GitHub stores it: timestamped TAP lines for the given test names."""
    lines = []
    if shard:
        lines.append(STAMP + '{"type":"log","text":"[SHARD] selected=%d registered=%d"}' % shard)
    for number, name in enumerate(names, 1):
        status = "not ok" if name in failed else "ok"
        lines.append("%s%s %d Chrome 147.0 - [3 ms] - %s" % (STAMP, status, number, name))
    lines += list(extra_lines)
    failures = len([n for n in names if n in failed]) + len([l for l in extra_lines if "not ok" in l])
    total = len(names) + len(extra_lines)
    lines += ["%s# tests %d" % (STAMP, total), "%s# pass  %d" % (STAMP, total - failures),
              "%s# skip  0" % STAMP, "%s# todo  0" % STAMP, "%s# fail  %d" % (STAMP, failures)]
    return "\n".join(lines) + "\n"


ALL = ["m%d: test %d" % (i, i) for i in range(10)]
A, B = ALL[:6], ALL[6:]


class ShardCompareTest(unittest.TestCase):
    def check(self, full, *shards):
        return compare_mod.compare(compare_mod.parse(full), [compare_mod.parse(s) for s in shards])

    def test_a_faithful_split_matches(self):
        self.assertEqual(self.check(tap(ALL), tap(A, shard=(6, 10)), tap(B, shard=(4, 10))), [])

    def test_the_same_failure_in_both_runs_matches(self):
        self.assertEqual(self.check(tap(ALL, [A[0]]), tap(A, [A[0]], shard=(6, 10)), tap(B, shard=(4, 10))), [])

    def test_a_test_run_twice_and_another_never_is_reported_despite_equal_totals(self):
        doubled = A[:-1] + [A[0]]  # A[0] twice, A[-1] never; totals still 10
        problems = self.check(tap(ALL), tap(doubled, shard=(6, 10)), tap(B, shard=(4, 10)))
        self.assertIn("in the full run only: ok %s" % A[-1], problems)
        self.assertIn("in a shard only: ok %s" % A[0], problems)

    def test_a_shard_that_ran_fewer_than_it_selected_is_reported(self):
        problems = self.check(tap(ALL[:9]), tap(A[:5], shard=(6, 10)), tap(B, shard=(4, 10)))
        self.assertIn("shard 1 ran 5 tests but selected 6", problems)

    def test_selections_that_do_not_cover_the_registered_tests_are_reported(self):
        # e.g. both shards mis-wired to the same half
        problems = self.check(tap(ALL), tap(A, shard=(6, 10)), tap(A, shard=(6, 10)))
        self.assertIn("shard selections add up to 12, but 10 tests are registered", problems)

    def test_different_registered_totals_are_reported(self):
        problems = self.check(tap(ALL), tap(A, shard=(6, 10)), tap(B, shard=(4, 11)))
        self.assertIn("shards saw different registered totals: [10, 11]", problems)

    def test_a_shard_without_its_selection_line_is_reported(self):
        self.assertIn("shard 2 logged no [SHARD] selection line", self.check(tap(ALL), tap(A, shard=(6, 10)), tap(B)))

    def test_a_shard_that_ran_nothing_is_reported(self):
        self.assertIn("shard 2 ran 0 tests", self.check(tap(A), tap(A, shard=(6, 6)), tap([], shard=(0, 6))))

    def test_a_failure_only_in_a_shard_is_reported(self):
        problems = self.check(tap(ALL), tap(A, [A[2]], shard=(6, 10)), tap(B, shard=(4, 10)))
        self.assertIn("in a shard only: not ok %s" % A[2], problems)
        self.assertIn("in the full run only: ok %s" % A[2], problems)

    def test_a_browser_level_error_with_undefined_ms_counts(self):
        error_line = STAMP + "not ok 7 PuppeteerChrome - [undefined ms] - error"
        problems = self.check(tap(ALL), tap(A, shard=(6, 10)), tap(B, shard=(4, 10), extra_lines=[error_line]))
        self.assertIn("in a shard only: not ok error", problems)

    def test_the_command_exits_by_outcome(self):
        with tempfile.TemporaryDirectory() as tmp:
            texts = {"full": tap(ALL), "a": tap(A, shard=(6, 10)), "b": tap(B, shard=(4, 10)),
                     "short": tap(B[:3], shard=(4, 10)), "empty": "no tap here\n"}
            paths = {}
            for name, text in texts.items():
                paths[name] = pathlib.Path(tmp) / name
                paths[name].write_text(text)
            run = lambda *names: subprocess.run([sys.executable, str(SCRIPT)] + [str(paths[n]) for n in names],
                                                capture_output=True, text=True).returncode
            self.assertEqual(run("full", "a", "b"), 0)
            self.assertEqual(run("full", "a", "short"), 1)
            self.assertEqual(run("full", "a", "empty"), 2)


class CoverageTest(unittest.TestCase):
    """--coverage: what the shards prove on their own, with no full run to compare against."""

    def cover(self, *shards):
        return compare_mod.coverage([compare_mod.parse(s) for s in shards])

    def test_a_complete_disjoint_split_passes(self):
        self.assertEqual(self.cover(tap(A, shard=(6, 10)), tap(B, shard=(4, 10))), [])

    def test_both_shards_wired_to_the_same_half_fails(self):
        problems = self.cover(tap(A, shard=(6, 10)), tap(A, shard=(6, 10)))
        self.assertIn("shard selections add up to 12, but 10 tests are registered", problems)
        self.assertIn("run by more than one shard (shard 1, shard 2): %s" % A[0], problems)

    def test_a_test_in_both_shards_fails_even_when_the_counts_add_up(self):
        a_with_overlap = A[:-1] + [B[0]]  # A[-1] dropped, B[0] doubled: counts still 6 + 4
        problems = self.cover(tap(a_with_overlap, shard=(6, 10)), tap(B, shard=(4, 10)))
        self.assertIn("run by more than one shard (shard 1, shard 2): %s" % B[0], problems)

    def test_an_incomplete_shard_fails(self):
        self.assertIn("shard 2 ran 3 tests but selected 4", self.cover(tap(A, shard=(6, 10)), tap(B[:3], shard=(4, 10))))

    def test_a_shard_without_its_selection_line_fails(self):
        self.assertIn("shard 2 logged no [SHARD] selection line", self.cover(tap(A, shard=(6, 10)), tap(B)))

    def test_the_command_exits_by_outcome(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for name, text in {"a": tap(A, shard=(6, 10)), "b": tap(B, shard=(4, 10))}.items():
                paths[name] = pathlib.Path(tmp) / name
                paths[name].write_text(text)
            run = lambda *names: subprocess.run([sys.executable, str(SCRIPT), "--coverage"] + [str(paths[n]) for n in names],
                                                capture_output=True, text=True).returncode
            self.assertEqual(run("a", "b"), 0)
            self.assertEqual(run("a", "a"), 1)


if __name__ == "__main__":
    unittest.main()
