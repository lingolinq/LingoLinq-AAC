#!/usr/bin/env python3
"""Refuse to send a review envelope that carries anything shaped like a credential.

The review text is model output over PR-authored text, so a prompt injection could try to get a
secret into it. codex-review.yml runs this on /tmp/envelope.json before the POST to n8n W2, which
signs the envelope and posts the review publicly.

Checks the raw file and every JSON string in it (so a \\u-escaped secret is still found), with
zero-width characters removed, for:
  - credential formats: OpenAI/Anthropic (`sk-`), GitHub tokens, AWS access key ids and labelled
    secret access keys, Google API keys, PEM and PGP private keys, Stripe secret and restricted
    keys, Slack tokens and webhooks, JWTs, and URLs that carry a password;
  - the exact value of every variable in this process's environment whose name marks it as a
    credential (TOKEN, SECRET, PASSWORD, *_KEY, WEBHOOK), e.g. GH_TOKEN and the n8n secrets, with
    and without a URL's scheme.

There is deliberately no rule for `password = "..."` style assignments: specs in this repository
set fixture passwords that way, and a review quoting one would be refused for nothing.

Exit 0 when clean, 1 when something matched, 2 when the file cannot be read. Never prints a
matched value: only the names of the checks that matched.

Best effort, by design: an encoded or reversed secret is not found. It is the last check, not the
protection; the model has no tool to read a secret in the first place (codex-exec-args.txt and the
locked model catalog from codex-review-model-catalog.py).

USAGE
  python3 -I scripts/codex-review-secret-scan.py <envelope.json>
"""
import json
import os
import re
import sys

PATTERNS = {
    # Not after a letter or digit: "task-clean_old_..." holds "sk-" inside a word. "_", "=", quotes
    # and other punctuation in front still match, so KEY=sk-... and "sk-..." are found.
    "openai_or_anthropic_key": re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}"),
    "github_token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})"),
    # No word boundary in front: the key id is found even when glued to preceding letters.
    "aws_access_key_id": re.compile(r"(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Z])"),
    # A bare 40-character base64 string is too common to flag, so only a labelled one counts.
    "aws_secret_access_key": re.compile(r"(?i)aws_?secret_?(?:access_?)?key[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])"),
    "google_api_key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "private_key_block": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "pgp_private_key_block": re.compile(r"-----BEGIN PGP PRIVATE KEY BLOCK-----"),
    "stripe_key": re.compile(r"\b[sr]k_(?:live|test)_[0-9A-Za-z]{16,}"),
    "slack_token": re.compile(r"\bxox[abposr]-[0-9A-Za-z-]{10,}"),
    "slack_webhook": re.compile(r"hooks\.slack\.com/services/[0-9A-Za-z/_-]{10,}"),
    "jwt": re.compile(r"\beyJ[0-9A-Za-z_-]{8,}\.eyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}"),
    # Scheme capped at 32 characters: unbounded, the scan restarted a long forward run at every
    # word boundary and went quadratic (~3 s on 200k chars). Registered schemes are far shorter.
    "url_with_password": re.compile(r"\b[a-z][a-z0-9+.-]{0,31}://[^/\s:@\"']+:[^/\s@\"']+@"),
}
CREDENTIAL_NAME_RE = re.compile(r"(TOKEN|SECRET|PASSWORD|_KEY$|WEBHOOK)")
MIN_VALUE_LENGTH = 8
# Characters that render as nothing, so a secret split by them still reads as one.
ZERO_WIDTH_RE = re.compile("[​‌‍⁠﻿­]")
SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*://", re.IGNORECASE)


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
    texts = [ZERO_WIDTH_RE.sub("", t) for t in texts]
    hits = set()
    for name, pattern in PATTERNS.items():
        if any(pattern.search(t) for t in texts):
            hits.add(name)
    for name, value in environ.items():
        if CREDENTIAL_NAME_RE.search(name) and value and len(value) >= MIN_VALUE_LENGTH:
            forms = [form for form in {value, SCHEME_RE.sub("", value)} if len(form) >= MIN_VALUE_LENGTH]
            if any(form in t for form in forms for t in texts):
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
