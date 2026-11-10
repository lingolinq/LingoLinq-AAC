#!/usr/bin/env python3
"""Compare the sharded Ember test run with the single full run (shadow mode).

Usage: ci-shard-compare.py FULL_LOG SHARD_LOG [SHARD_LOG ...]
       ci-shard-compare.py --coverage SHARD_LOG [SHARD_LOG ...]

Each log is a job log holding testem's TAP output (`ok N ...`, `not ok N ...`, `skip N ...`,
`# tests N`); shard logs also carry the `[SHARD] selected=N registered=M` line written by
app/frontend/tests/helpers/apply-parallel-pool.js.

Exit 0 when the shards are a faithful split of the full run:
- the same tests ran, with the same results: the multiset of (status, test name) over all shard
  logs equals the full run's (so a test run twice and another never cannot cancel out);
- every shard ran at least one test and exactly the number it selected;
- every shard saw the same number of registered tests, and the selections add up to it.
Exit 1 otherwise, printing why. Exit 2 when a log cannot be read or holds no TAP summary.

--coverage needs no full run (what the shards can prove on their own, for when they replace the
full run): every shard ran exactly what it selected, all shards saw the same registered total,
the selections add up to it, and no test name was run by more than one shard.
"""
import collections
import json
import re
import sys

SUMMARY_RE = re.compile(r"# (tests|pass|skip|todo|fail)\s+(\d+)\s*$")
# A TAP result line, after GitHub's timestamp prefix if any. Browser-level errors print
# `[undefined ms]` and may have no browser version, so neither is assumed.
RESULT_RE = re.compile(r"(?:^|Z )(not ok|ok|skip|todo) \d+ (?:.+?) - \[(?:\d+|undefined) ms\] - (.+?)\s*$")
SHARD_RE = re.compile(r"\[SHARD\] selected=(\d+) registered=(\d+)")
# A test name the suite registers more than once (same module and name), with its count, logged by
# tests/helpers/apply-parallel-pool.js. Inside a JSON-escaped console line, so the name stops at an
# unescaped quote.
DUP_RE = re.compile(r'\[SHARD-DUP\] (\d+) ((?:[^"\\]|\\.)*)')
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
    problems += _line_count_check("the full run", full_counts, full_results)
    problems += shard_checks(shards)
    combined = collections.Counter()
    for _counts, results, _shard in shards:
        combined += results
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


def _line_count_check(label, counts, results):
    """A log's result lines must add up to its own "# tests" total; if lines are missing, the name
    checks below prove nothing about which tests ran."""
    parsed, total = sum(results.values()), counts.get("tests", 0)
    if parsed != total:
        return ["%s has %d result lines for %d tests" % (label, parsed, total)]
    return []


def shard_checks(shards):
    """Problems a set of shards can prove on its own, without a full run."""
    problems = []
    registered = set()
    selected_total = 0
    for index, (counts, _results, shard) in enumerate(shards):
        label = "shard %d" % (index + 1)
        ran = counts.get("tests", 0)
        if ran == 0:
            problems.append("%s ran 0 tests" % label)
        problems += _line_count_check(label, counts, _results)
        if shard is None:
            problems.append("%s logged no [SHARD] selection line" % label)
            continue
        selected, total = shard
        if ran != selected:
            problems.append("%s ran %d tests but selected %d" % (label, ran, selected))
        registered.add(total)
        selected_total += selected
    if len(registered) > 1:
        problems.append("shards saw different registered totals: %s" % sorted(registered))
    elif registered and selected_total != next(iter(registered)):
        problems.append("shard selections add up to %d, but %d tests are registered" % (selected_total, next(iter(registered))))
    return problems


def registered_duplicates(text):
    """{name: count} for the names the suite registers more than once ([SHARD-DUP] lines)."""
    allowed = {}
    for match in DUP_RE.finditer(text):
        try:
            name = json.loads('"%s"' % match.group(2))
        except ValueError:
            name = match.group(2)
        allowed[name] = max(allowed.get(name, 0), int(match.group(1)))
    return allowed


def coverage(shards, allowed=None):
    """--coverage: shard_checks, no test name run by more than one shard, and no name run more times
    in one shard than the suite registers it (a duplicate there means another test never ran, even
    when the counts add up). `allowed` is registered_duplicates() of the logs. Known gap: for a name
    the suite itself registers twice, one of the pair run twice and its twin never run cannot be told
    apart by name (two such names today, differing only by a trailing space)."""
    allowed = allowed or {}
    problems = shard_checks(shards)
    seen = {}
    repeated = []
    for index, (_counts, results, _shard) in enumerate(shards):
        per_name = collections.Counter()
        for (_status, name), count in results.items():
            per_name[name] += count
        for name, count in sorted(per_name.items()):
            if count > allowed.get(name, 1):
                repeated.append("run %d times in shard %d: %s" % (count, index + 1, name))
            seen.setdefault(name, []).append(index + 1)
    problems += repeated[:MAX_LISTED]
    if len(repeated) > MAX_LISTED:
        problems.append("... and %d more tests run more than once in a shard" % (len(repeated) - MAX_LISTED))
    overlap = sorted(name for name, where in seen.items() if len(where) > 1)
    for name in overlap[:MAX_LISTED]:
        problems.append("run by more than one shard (%s): %s" % (", ".join("shard %d" % i for i in seen[name]), name))
    if len(overlap) > MAX_LISTED:
        problems.append("... and %d more tests run by more than one shard" % (len(overlap) - MAX_LISTED))
    return problems


def main(argv):
    coverage_only = len(argv) > 1 and argv[1] == "--coverage"
    paths = argv[2:] if coverage_only else argv[1:]
    if len(paths) < (1 if coverage_only else 2):
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    parsed = []
    allowed = {}
    for path in paths:
        try:
            with open(path, encoding="utf-8", errors="replace") as handle:
                text = handle.read()
                result = parse(text)
                for name, count in registered_duplicates(text).items():
                    allowed[name] = max(allowed.get(name, 0), count)
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
    problems = coverage(parsed, allowed) if coverage_only else compare(parsed[0], parsed[1:])
    for problem in problems:
        print("MISMATCH: " + problem)
    if not problems:
        print("shards cover every registered test exactly once" if coverage_only else "shards match the full run")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
