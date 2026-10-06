#!/usr/bin/env python3
"""Compare the sharded Ember test run with the single full run (shadow mode).

Usage: ci-shard-compare.py FULL_LOG SHARD_LOG [SHARD_LOG ...]

Each log is a job log holding testem's TAP output (`ok N ...`, `not ok N ...`, `# tests N`).
Exit 0 when the shards are a faithful split of the full run: every shard ran at least one test,
the shard totals add up to the full total, and the same tests failed. Exit 1 otherwise, printing
why. Exit 2 when a log cannot be read or holds no TAP summary.

The shards use complementary QUnit filters, so a count mismatch means a filter was mangled on
its way to the test page; a failure that appears in only one of the two runs means a test's
result depends on which tests ran before it.
"""
import re
import sys

SUMMARY_RE = re.compile(r"# (tests|pass|skip|todo|fail)\s+(\d+)\s*$")
NOT_OK_RE = re.compile(r"not ok \d+ \S+ [\d.]+ - \[\d+ ms\] - (.+?)\s*$")


def parse(text):
    """Return ({'tests': n, 'pass': n, ...}, set of failed test names) from TAP output."""
    counts = {}
    failed = set()
    for line in text.splitlines():
        summary = SUMMARY_RE.search(line)
        if summary:
            counts[summary.group(1)] = int(summary.group(2))
            continue
        not_ok = NOT_OK_RE.search(line)
        if not_ok:
            failed.add(not_ok.group(1))
    return counts, failed


def compare(full, shards):
    """`full` and each of `shards` are (counts, failed). Returns a list of problems."""
    problems = []
    full_counts, full_failed = full
    shard_total = 0
    shard_failed = set()
    for index, (counts, failed) in enumerate(shards):
        ran = counts.get("tests", 0)
        if ran == 0:
            problems.append("shard %d ran 0 tests" % (index + 1))
        shard_total += ran
        shard_failed |= failed
    if shard_total != full_counts.get("tests", 0):
        problems.append("shards ran %d tests, the full run %d" % (shard_total, full_counts.get("tests", 0)))
    for name in sorted(full_failed - shard_failed):
        problems.append("failed only in the full run: %s" % name)
    for name in sorted(shard_failed - full_failed):
        problems.append("failed only in a shard: %s" % name)
    return problems


def main(argv):
    if len(argv) < 3:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    parsed = []
    for path in argv[1:]:
        try:
            with open(path, encoding="utf-8", errors="replace") as handle:
                counts, failed = parse(handle.read())
        except OSError as error:
            print("cannot read %s: %s" % (path, error), file=sys.stderr)
            return 2
        if "tests" not in counts:
            print("no TAP summary in %s" % path, file=sys.stderr)
            return 2
        parsed.append((counts, failed))
        print("%s: %s" % (path, " ".join("%s=%d" % item for item in sorted(counts.items()))))
    problems = compare(parsed[0], parsed[1:])
    for problem in problems:
        print("MISMATCH: " + problem)
    if not problems:
        print("shards match the full run")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
