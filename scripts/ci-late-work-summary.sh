#!/usr/bin/env bash
#
# ci-late-work-summary.sh - write the test harness's late-work lines from an Ember test log into the
# GitHub job summary: a count per tag, then the lines themselves. REPORT ONLY: it always exits 0, so
# it can never change whether a job passes.
#
# Usage: ci-late-work-summary.sh <ember-test.log> <job label>
#
# The tags (tests/helpers/index.js, tests/helpers/leak-check.js, tests/test-helper.js):
#   [queued-fetch]  a test ended with an Ember Data fetch still queued
#   [late-read]     a read or write on a destroyed service, logged instead of failed outside a
#                   timing-strict run (build-and-test)
#   [owner-gone]    late work from an earlier test skipped by an owner guard
# The harness self-tests in Unit | Helper | waitForQueuedStoreFetches leave fetches queued on purpose
# and log [queued-fetch] every run; they are not late work and are left out.
# A test name may hold an escaped quote, so a line runs to the first unescaped quote.

log="$1"
label="${2:-Ember tests}"
out="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

if [ ! -f "$log" ]; then
  echo "### Late work ($label): no test log (the test step did not run)" >> "$out"
  exit 0
fi

lines=$(grep -oE '\[(queued-fetch|owner-gone|late-read)\] ([^"\\]|\\.)*' "$log" 2>/dev/null \
  | grep -v '\[queued-fetch\].*Unit | Helper | waitForQueuedStoreFetches:' || true)

if [ -z "$lines" ]; then
  echo "### Late work ($label): none reported" >> "$out"
  exit 0
fi

{
  echo "### Late work ($label): reported by the harness, a test did not wait for work it started"
  echo '```'
  printf '%s\n' "$lines" | grep -oE '^\[[a-z-]+\]' | sort | uniq -c
  echo '```'
  echo '<details><summary>Lines (count, tag, test)</summary>'
  echo
  echo '```'
  printf '%s\n' "$lines" | sort | uniq -c | sort -rn | head -200
  echo '```'
  echo '</details>'
} >> "$out"
exit 0
