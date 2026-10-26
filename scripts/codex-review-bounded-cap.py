#!/usr/bin/env python3
"""Print the bounded-evidence diff cap (bytes) from the trusted evidence policy.

codex-review.yml reads the cap in two steps that must agree on the same byte: "Choose evidence for
the diff size" (a bounded codex run past the cap switches to chunked evidence) and "Gather PR diff"
(cuts the bounded diff at the cap and records whether it did). Both call this helper on
.github/codex/evidence-policy.json from the trusted checkout, so the value lives in one place.

Exits non-zero, printing nothing on stdout, when the policy is missing or the cap is not a positive
integer: the calling step then fails instead of comparing against an empty or wrong cap.
"""
import json
import pathlib
import sys


def bounded_max_bytes(policy_path):
    value = json.loads(pathlib.Path(policy_path).read_text())["bounded_max_bytes"]
    # bool is an int subclass in Python; `true` must not read as a 1-byte cap.
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("bounded_max_bytes must be a positive integer")
    return value


def main(argv):
    if len(argv) != 2:
        print("usage: codex-review-bounded-cap.py POLICY_JSON", file=sys.stderr)
        return 2
    try:
        cap = bounded_max_bytes(argv[1])
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"bounded diff cap unreadable: {error.__class__.__name__}", file=sys.stderr)
        return 1
    print(cap)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
