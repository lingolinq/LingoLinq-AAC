#!/usr/bin/env python3
"""Extract the submit_review tool_use block from an Anthropic Messages API
response and write its input (the review verdict JSON) to the output file.

Usage: codex-review-claude-deep-extract-response.py <response-file> <output-file>
"""
import json
import pathlib
import sys


def main():
    response_path, output_path = sys.argv[1], sys.argv[2]

    resp = json.loads(pathlib.Path(response_path).read_text())
    for block in resp.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "submit_review":
            pathlib.Path(output_path).write_text(json.dumps(block["input"]))
            return 0

    sys.stderr.write("claude-deep: no submit_review tool_use block in response\n")
    sys.stderr.write(json.dumps(resp) + "\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
