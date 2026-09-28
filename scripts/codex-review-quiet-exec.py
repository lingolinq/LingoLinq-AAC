#!/usr/bin/env python3
"""Run a reviewer command without letting its output reach the job log.

`codex exec` prints its whole transcript: the prompt it was given (PR diff, PR
title and body, live state) and the model's answer. This repository is public,
so an Actions job log is public, and nothing the reviewer reads or writes may be
printed there. The transcript is buffered in an anonymous, already-unlinked
temporary file for the duration of the call and then discarded. On failure a
single line is printed: the exit code and a label from a FIXED list, derived by
pattern-matching the transcript. The matched text itself is never printed.

Usage (stdin is passed through to the command):
  codex-review-quiet-exec.py [--timeout SECONDS] -- <command> [args...]

Exit status is the command's own, or 124 on timeout.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile


# Checked in order; the first match wins. Only the label is ever printed.
# The quota label comes first because spend-limit exhaustion must be
# identifiable as a budget event, not confused with an auth failure. Patterns
# cover the messages `codex exec` itself prints (checked against codex-cli
# 0.156.1) as well as the raw API error codes.
FAILURE_LABELS = (
    ("quota_or_billing", re.compile(
        r"quota exceeded\. check your plan|insufficient_quota|exceeded your current quota"
        r"|hit your usage limit|billing_hard_limit|spend limit", re.I)),
    ("auth", re.compile(r"invalid_api_key|incorrect api key|\b401 unauthorized|status(?: code)?:? 401\b", re.I)),
    ("rate_limit", re.compile(
        r"rate limit exceeded|rate_limit_exceeded|\b429 too many requests|status(?: code)?:? 429\b", re.I)),
    ("context_length", re.compile(
        r"out of room in the model's context window|context window exceeded|context_length_exceeded"
        r"|maximum context length", re.I)),
    ("sandbox", re.compile(r"bwrap:|bubblewrap", re.I)),
)

# Errors are reported at the end of a transcript.
TAIL_CHARS = 4000


def failure_label(transcript, prompt=""):
    """Label a failed call. The echoed prompt is PR content and could match any
    pattern above by accident (or on purpose), so it is removed before matching."""
    if prompt:
        transcript = transcript.replace(prompt, "")
    tail = transcript[-TAIL_CHARS:]
    for label, pattern in FAILURE_LABELS:
        if pattern.search(tail):
            return label
    return "unclassified"


# The reviewer reads untrusted PR content and can run tools, so it gets only
# the environment it needs. Removed: every Actions/runner variable (the job's
# GitHub token, and the paths of the per-step file commands a child could use
# to change the environment of later steps) and anything named like a
# credential. CODEX_API_KEY is the one credential kept: it is how `codex exec`
# authenticates without writing a key file (see codex-review.yml).
SCRUBBED_ENV_RE = re.compile(
    r"^(?:GITHUB_|ACTIONS_|RUNNER_|INPUT_|STATE_)|TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY|_KEY$",
    re.I,
)
KEPT_CREDENTIALS = frozenset({"CODEX_API_KEY"})


def child_environment(environ):
    return {
        key: value
        for key, value in environ.items()
        if key in KEPT_CREDENTIALS or not SCRUBBED_ENV_RE.search(key)
    }


def run_quiet(command, stdin, timeout=None):
    """Run command with stdin, discarding its output.

    Returns (returncode, label): returncode is None on timeout, label is None on
    success. Never prints anything; callers decide what to report.

    Output goes to a file rather than a pipe so the call ends when the command
    exits, even if a process it started still holds the output open.
    """
    prompt = stdin.read() if stdin is not None else b""
    with tempfile.TemporaryFile() as buffer:
        try:
            result = subprocess.run(
                command,
                input=prompt,
                stdout=buffer,
                stderr=subprocess.STDOUT,
                timeout=timeout,
                env=child_environment(os.environ),
            )
        except subprocess.TimeoutExpired:
            return None, "timeout"
        if result.returncode == 0:
            return 0, None
        buffer.seek(0)
        transcript = buffer.read().decode("utf-8", errors="replace")
    return result.returncode, failure_label(transcript, prompt.decode("utf-8", errors="replace"))


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=None)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("no command given")
    returncode, label = run_quiet(command, sys.stdin.buffer, args.timeout)
    if returncode == 0:
        return 0
    shown = "timeout" if returncode is None else returncode
    print(f"model call failed: exit={shown} label={label}", file=sys.stderr)
    if returncode is None:
        return 124
    # A negative code means killed by that signal; report it the way a shell
    # would (128 + N) rather than letting sys.exit wrap it to 256 - N.
    return 128 - returncode if returncode < 0 else returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
