#!/usr/bin/env python3
"""Extract the submit_review tool_use block from an Anthropic Messages API
response and write its input (the review verdict JSON) to the output file.

Usage: codex-review-claude-deep-extract-response.py <response-file> <output-file>
"""
import json
import pathlib
import sys


# Only these fixed labels are ever printed; any other value, including one the
# response carries in a known field, is reported as "unknown".
KNOWN_TYPES = {"message", "error"}
KNOWN_STOP_REASONS = {
    "end_turn",
    "max_tokens",
    "stop_sequence",
    "tool_use",
    "pause_turn",
    "refusal",
    "model_context_window_exceeded",
}
KNOWN_ERROR_TYPES = {
    "invalid_request_error",
    "authentication_error",
    "permission_error",
    "not_found_error",
    "request_too_large",
    "rate_limit_error",
    "api_error",
    "overloaded_error",
    "billing_error",
    "conflict_error",
    "timeout_error",
}
KNOWN_CONTENT_TYPES = {"text", "tool_use", "thinking", "redacted_thinking"}


def _label(value, known):
    if value is None:
        return "none"
    return value if isinstance(value, str) and value in known else "unknown"


def main():
    response_path, output_path = sys.argv[1], sys.argv[2]

    resp = json.loads(pathlib.Path(response_path).read_text())
    for block in resp.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "submit_review":
            pathlib.Path(output_path).write_text(json.dumps(block["input"]))
            return 0

    # Structural fields only. The response body is model output about PR
    # content and must not reach the public job log.
    error = resp.get("error") if isinstance(resp.get("error"), dict) else {}
    block_types = [
        _label(block.get("type"), KNOWN_CONTENT_TYPES) for block in resp.get("content", []) if isinstance(block, dict)
    ]
    sys.stderr.write(
        "claude-deep: no submit_review tool_use block in response "
        f"(type={_label(resp.get('type'), KNOWN_TYPES)} "
        f"stop_reason={_label(resp.get('stop_reason'), KNOWN_STOP_REASONS)} "
        f"error_type={_label(error.get('type'), KNOWN_ERROR_TYPES)} content_types={block_types})\n"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
