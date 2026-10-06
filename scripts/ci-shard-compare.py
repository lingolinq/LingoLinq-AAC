#!/usr/bin/env python3
"""Compare the sharded Ember test run with the single full run (shadow mode).

Usage: ci-shard-compare.py FULL_LOG SHARD_LOG [SHARD_LOG ...]

Each log is a job log holding testem's TAP output (`ok N ...`, `not ok N ...`, `skip N ...`,
`# tests N`); shard logs also carry the `[SHARD] selected=N registered=M` line written by
app/frontend/tests/helpers/apply-parallel-pool.js.

Exit 0 when the shards are a faithful split of the full run:
- the same tests ran, with the same results: the multiset of (status, test name) over all shard
  logs equals the full run's (so a test run twice and another never cannot cancel out);
- every shard ran at least one test and exactly the number it selected;
- every shard saw the same number of registered tests, and the selections add up to it.
Exit 1 otherwise, printing why. Exit 2 when a log cannot be read or holds no TAP summary.
"""
import collections
import re
import sys

SUMMARY_RE = re.compile(r"# (tests|pass|skip|todo|fail)\s+(\d+)\s*$")
# A TAP result line, after GitHub's timestamp prefix if any. Browser-level errors print
# `[undefined ms]` and may have no browser version, so neither is assumed.
RESULT_RE = re.compile(r"(?:^|Z )(not ok|ok|skip|todo) \d+ (?:.+?) - \[(?:\d+|undefined) ms\] - (.+?)\s*$")
SHARD_RE = re.compile(r"\[SHARD\] selected=(\d+) registered=(\d+)")
MAX_LISTED = 20


def parse(text):
    """Return (summary counts, Counter of (status, name), (selected, registered) or None)."""
    counts = {}
    results = collections.Counter()
    shard = None
    for line in text.splitlines():
        summary = SUMMARY_RE.search(line)
        if summary:
            counts[summary.group(1)] = int(summary.group(2))
            continue
        result = RESULT_RE.search(line)
        if result:
            results[(result.group(1), result.group(2))] += 1
            continue
        selection = SHARD_RE.search(line)
        if selection and shard is None:
            shard = (int(selection.group(1)), int(selection.group(2)))
    return counts, results, shard


def compare(full, shards):
    """`full` and each of `shards` are parse() results. Returns a list of problems."""
    problems = []
    full_counts, full_results, _ = full
    combined = collections.Counter()
    registered = set()
    selected_total = 0
    for index, (counts, results, shard) in enumerate(shards):
        label = "shard %d" % (index + 1)
        ran = counts.get("tests", 0)
        if ran == 0:
            problems.append("%s ran 0 tests" % label)
        if shard is None:
            problems.append("%s logged no [SHARD] selection line" % label)
        else:
            selected, total = shard
            if ran != selected:
                problems.append("%s ran %d tests but selected %d" % (label, ran, selected))
            registered.add(total)
            selected_total += selected
        combined += results
    if len(registered) > 1:
        problems.append("shards saw different registered totals: %s" % sorted(registered))
    elif registered and selected_total != next(iter(registered)):
        problems.append("shard selections add up to %d, but %d tests are registered" % (selected_total, next(iter(registered))))
    shard_total = sum(c.get("tests", 0) for c, _r, _s in shards)
    if shard_total != full_counts.get("tests", 0):
        problems.append("shards ran %d tests, the full run %d" % (shard_total, full_counts.get("tests", 0)))
    only_full = full_results - combined
    only_shards = combined - full_results
    for (status, name), count in sorted(only_full.items())[:MAX_LISTED]:
        problems.append("in the full run only: %s %s%s" % (status, name, " (x%d)" % count if count > 1 else ""))
    for (status, name), count in sorted(only_shards.items())[:MAX_LISTED]:
        problems.append("in a shard only: %s %s%s" % (status, name, " (x%d)" % count if count > 1 else ""))
    hidden = len(only_full) + len(only_shards) - min(len(only_full), MAX_LISTED) - min(len(only_shards), MAX_LISTED)
    if hidden > 0:
        problems.append("... and %d more result differences" % hidden)
    return problems


def main(argv):
    if len(argv) < 3:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    parsed = []
    for path in argv[1:]:
        try:
            with open(path, encoding="utf-8", errors="replace") as handle:
                result = parse(handle.read())
        except OSError as error:
            print("cannot read %s: %s" % (path, error), file=sys.stderr)
            return 2
        if "tests" not in result[0]:
            print("no TAP summary in %s" % path, file=sys.stderr)
            return 2
        parsed.append(result)
        counts, results, shard = result
        print("%s: %s | %d results%s" % (path, " ".join("%s=%d" % item for item in sorted(counts.items())),
                                         sum(results.values()),
                                         " | selected=%d registered=%d" % shard if shard else ""))
    problems = compare(parsed[0], parsed[1:])
    for problem in problems:
        print("MISMATCH: " + problem)
    if not problems:
        print("shards match the full run")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
