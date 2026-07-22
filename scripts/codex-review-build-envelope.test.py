#!/usr/bin/env python3
"""Regression tests for codex-review-build-envelope.py status mapping."""
import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("codex-review-build-envelope.py")
SPEC = importlib.util.spec_from_file_location("codex_review_build_envelope", MODULE_PATH)
build_envelope = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_envelope)


class ReviewOutcomeTest(unittest.TestCase):
    def test_current_runner_tool_call_failure_is_inconclusive(self):
        review = {
            "verdict": "NEEDS_HUMAN",
            "findings": [
                {
                    "category": "live_state",
                    "description": (
                        "Unable to perform required read-only PR inspection in this runner: "
                        "tool calls are failing before any shell command can run."
                    ),
                    "evidence": (
                        "The command channel rejected even the initial status command with "
                        "an output-schema validation error before execution."
                    ),
                    "suggested_fix": "Rerun the Codex review job with command execution available.",
                    "verifiable_check": "git rev-parse HEAD",
                }
            ],
        }

        outcome = build_envelope.review_outcome(review)

        self.assertEqual(outcome["kind"], "inconclusive_infrastructure")
        self.assertEqual(outcome["status_state"], "success")
        self.assertEqual(outcome["status_description"], "Codex review inconclusive (runner/sandbox)")

    def test_non_live_state_needs_human_still_requires_attention(self):
        review = {
            "verdict": "NEEDS_HUMAN",
            "findings": [
                {
                    "category": "claim_vs_code",
                    "description": "A human needs to decide whether this product claim is acceptable.",
                    "evidence": "No runner or sandbox failure.",
                    "suggested_fix": "Clarify the claim.",
                    "verifiable_check": "manual review",
                }
            ],
        }

        outcome = build_envelope.review_outcome(review)

        self.assertEqual(outcome["kind"], "requires_attention")
        self.assertEqual(outcome["status_state"], "failure")


if __name__ == "__main__":
    unittest.main()
