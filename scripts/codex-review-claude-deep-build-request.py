#!/usr/bin/env python3
"""Build the Anthropic Messages API request body for the claude-deep reviewer
route. Reads the prompt and JSON Schema from files (never from shell
interpolation) and prints the request JSON to stdout.

Usage: codex-review-claude-deep-build-request.py <prompt-file> <schema-file>
"""
import json
import pathlib
import sys


def main():
    prompt_path, schema_path = sys.argv[1], sys.argv[2]

    prompt = pathlib.Path(prompt_path).read_text()
    schema = json.loads(pathlib.Path(schema_path).read_text())

    body = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 8192,
        "tools": [{
            "name": "submit_review",
            "description": "Submit the structured code review verdict.",
            "input_schema": schema,
        }],
        "tool_choice": {"type": "tool", "name": "submit_review"},
        "messages": [{"role": "user", "content": prompt}],
    }
    print(json.dumps(body))


if __name__ == "__main__":
    main()
