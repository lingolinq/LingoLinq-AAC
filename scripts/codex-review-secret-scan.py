#!/usr/bin/env python3
"""Refuse to send a review envelope that carries anything shaped like a credential.

The review text is model output over PR-authored text, so a prompt injection could try to get a
secret into it. codex-review.yml runs this on /tmp/envelope.json before the POST to n8n W2, which
signs the envelope and posts the review publicly.

Checks the raw file and every JSON string in it (so a \\u-escaped secret is still found) for:
  - credential formats: OpenAI/Anthropic (`sk-`), GitHub tokens, AWS access key ids, Google API
    keys, PEM private keys;
  - the exact value of every variable in this process's environment whose name marks it as a
    credential (TOKEN, SECRET, PASSWORD, *_KEY, WEBHOOK), e.g. GH_TOKEN and the n8n secrets.

Exit 0 when clean, 1 when something matched, 2 when the file cannot be read. Never prints a
matched value: only the names of the checks that matched.

Best effort, by design: a split, encoded or reversed secret is not found. It is the last check, not
the protection; the model has no tool to read a secret in the first place (codex-exec-args.txt).

USAGE
  python3 -I scripts/codex-review-secret-scan.py <envelope.json>
"""
import json
import os
import re
import sys

PATTERNS = {
    "openai_or_anthropic_key": re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    "github_token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})"),
    "aws_access_key_id": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "google_api_key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "private_key_block": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
}
CREDENTIAL_NAME_RE = re.compile(r"(TOKEN|SECRET|PASSWORD|_KEY$|WEBHOOK)")
MIN_VALUE_LENGTH = 8


def strings_in(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from strings_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)


def scan(text, environ):
    texts = [text]
    try:
        texts.extend(strings_in(json.loads(text)))
    except ValueError:
        pass
    hits = set()
    for name, pattern in PATTERNS.items():
        if any(pattern.search(t) for t in texts):
            hits.add(name)
    for name, value in environ.items():
        if CREDENTIAL_NAME_RE.search(name) and value and len(value) >= MIN_VALUE_LENGTH:
            if any(value in t for t in texts):
                hits.add(f"env:{name}")
    return sorted(hits)


def main(argv):
    if len(argv) != 2:
        print(f"usage: {argv[0]} <envelope.json>", file=sys.stderr)
        return 2
    try:
        with open(argv[1], encoding="utf-8", errors="replace") as handle:
            text = handle.read()
    except OSError as error:
        print(f"secret-scan: cannot read the envelope ({error.__class__.__name__})", file=sys.stderr)
        return 2
    hits = scan(text, os.environ)
    if hits:
        print(f"::error::secret-scan: the review envelope matched {', '.join(hits)}; not sending it", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
