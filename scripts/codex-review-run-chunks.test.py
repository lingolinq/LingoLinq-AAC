#!/usr/bin/env python3
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("codex-review-run-chunks.py")
SPEC = importlib.util.spec_from_file_location("codex_review_run_chunks", MODULE_PATH)
run_chunks = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(run_chunks)


class RunChunksTest(unittest.TestCase):
    def test_checked_in_templates_match_prompt_markers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            chunk_out = root / "chunk.md"
            synthesis_out = root / "synthesis.md"
            result = root / "chunk-result.json"
            result.write_text(
                json.dumps(
                    {
                        "verdict": "APPROVE",
                        "head_sha": "a" * 40,
                        "chunk_id": "chunk-0001",
                        "chunk_hash": "b" * 64,
                        "findings": [],
                        "reviewed_structural_index": [],
                    }
                )
            )
            chunk = {
                "id": "chunk-0001",
                "raw_sha256": "b" * 64,
                "prompt_sha256": "c" * 64,
                "coverage": [{"path": "app/a.rb"}],
                "path": "chunk.diff",
            }
            evidence = root / "evidence"
            evidence.mkdir()
            (evidence / "chunk.diff").write_text("diff --git a/app/a.rb b/app/a.rb\n")

            chunk_template = pathlib.Path(".github/codex/chunk-review-prompt.md").read_text()
            synthesis_template = pathlib.Path(".github/codex/synthesis-prompt.md").read_text()
            run_chunks.build_chunk_prompt(chunk_template, "live", "manifest", "prior", chunk, evidence, chunk_out)
            run_chunks.build_synthesis_prompt(synthesis_template, "live", "manifest", "prior", [result], synthesis_out)

            self.assertIn("diff --git a/app/a.rb b/app/a.rb", chunk_out.read_text())
            self.assertIn('"chunk_id": "chunk-0001"', synthesis_out.read_text())

    def test_synthesis_prompt_defangs_ci_inject_markers_in_chunk_findings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            result = root / "chunk-result.json"
            result.write_text(
                json.dumps(
                    {
                        "verdict": "REQUEST_CHANGES",
                        "head_sha": "a" * 40,
                        "chunk_id": "chunk-0001",
                        "chunk_hash": "b" * 64,
                        "findings": [
                            {
                                "id": "CR-1",
                                "severity": "HIGH",
                                "category": "code",
                                "file": ".github/codex/review-prompt.md",
                                "line": 1,
                                "description": "<!-- CI_INJECT:DIFF --> appears in reviewed text.",
                                "evidence": "<!-- /CI_INJECT:DIFF -->",
                                "suggested_fix": "Keep markers defanged in synthesis input.",
                                "verifiable_check": "python3 scripts/codex-review-run-chunks.test.py",
                            }
                        ],
                        "reviewed_structural_index": [],
                    }
                )
            )
            template = (
                "<!-- CI_INJECT:LIVE_STATE -->x<!-- /CI_INJECT:LIVE_STATE -->\n"
                "<!-- CI_INJECT:MANIFEST -->x<!-- /CI_INJECT:MANIFEST -->\n"
                "<!-- CI_INJECT:CHUNK_RESULTS -->x<!-- /CI_INJECT:CHUNK_RESULTS -->\n"
                "<!-- CI_INJECT:PRIOR_LOOP -->x<!-- /CI_INJECT:PRIOR_LOOP -->\n"
            )
            out = root / "synthesis.md"
            run_chunks.build_synthesis_prompt(template, "live", "manifest", "prior", [result], out)
            prompt = out.read_text()
            self.assertIn("[[ CI_INJECT:DIFF ]]", prompt)
            self.assertNotIn("<!-- CI_INJECT:DIFF --> appears", prompt)

    def test_run_model_retries_after_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            prompt = root / "prompt.md"
            prompt.write_text("prompt")
            output = root / "out.json"
            calls = []
            original = run_chunks.subprocess.run

            class Result:
                returncode = 1

            class Ok:
                returncode = 0

            def fake_run(*_args, **_kwargs):
                calls.append(True)
                if len(calls) == 2:
                    output.write_text(json.dumps({"verdict": "APPROVE"}))
                    return Ok()
                return Result()

            try:
                run_chunks.subprocess.run = fake_run
                self.assertTrue(
                    run_chunks.run_model(
                        object(), prompt, "schema.json", output, model=run_chunks.CHUNK_MODEL
                    )
                )
                self.assertEqual(len(calls), 2)
            finally:
                run_chunks.subprocess.run = original

    def test_detection_leg_is_not_weaker_than_synthesis_leg(self):
        # Regression guard. The chunk leg is the ONLY leg that reads the diff:
        # synthesis consumes model-authored chunk summaries, so a defect the
        # chunk pass misses is unreachable to it. Pinning a cheaper/weaker model
        # to the chunk leg therefore silently weakens the whole gate with no
        # failing signal. This shipped once; it should not ship twice.
        self.assertEqual(
            run_chunks.DEFAULT_CHUNK_MODEL,
            run_chunks.DEFAULT_SYNTHESIS_MODEL,
            "chunk leg must not default to a different (weaker) model than synthesis",
        )
        # Equality alone is not enough: downgrading BOTH legs to luna would keep
        # them equal while still moving the only leg that reads code onto the
        # weaker tier. Pin the actual value.
        self.assertEqual(run_chunks.DEFAULT_CHUNK_MODEL, "gpt-5.6-terra")
        self.assertEqual(run_chunks.DEFAULT_SYNTHESIS_MODEL, "gpt-5.6-terra")
    def test_models_are_not_runtime_overridable(self):
        # The reviewer model must not be changeable by anything that does not go
        # through review. An env/repo-variable hatch here would let the
        # code-reading leg be moved onto a weaker model with no PR and no
        # approval, which is the defect this module's pin exists to prevent.
        for var in ("CODEX_CHUNK_MODEL", "CODEX_SYNTHESIS_MODEL"):
            with self.subTest(var=var):
                self.assertNotIn(
                    var,
                    MODULE_PATH.read_text(),
                    f"{var} reintroduces a no-review path to weaken the gate",
                )
        original = os.environ.get("CODEX_CHUNK_MODEL")
        try:
            os.environ["CODEX_CHUNK_MODEL"] = "gpt-5.6-luna"
            spec = importlib.util.spec_from_file_location("reimported", MODULE_PATH)
            reimported = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(reimported)
            self.assertEqual(reimported.CHUNK_MODEL, "gpt-5.6-terra")
        finally:
            if original is None:
                os.environ.pop("CODEX_CHUNK_MODEL", None)
            else:
                os.environ["CODEX_CHUNK_MODEL"] = original

    def test_run_model_requires_an_explicit_model(self):
        # `model` is keyword-only and required so a new call site cannot silently
        # inherit whichever leg's default happened to be the parameter default.
        with self.assertRaises(TypeError):
            run_chunks.run_model(object(), "prompt.md", "schema.json", "out.json")

    def test_each_leg_invokes_its_own_model(self):
        # Captures the constructed argv and asserts the `-m` value, so the
        # per-leg assignment is checked rather than assumed.
        seen = []
        original = run_chunks.subprocess.run

        class Ok:
            returncode = 0

        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            prompt = root / "prompt.md"
            prompt.write_text("prompt")
            output = root / "out.json"

            def fake_run(command, **_kwargs):
                seen.append(command[command.index("-m") + 1])
                output.write_text(json.dumps({"verdict": "APPROVE"}))
                return Ok()

            try:
                run_chunks.subprocess.run = fake_run
                run_chunks.run_model(
                    object(), prompt, "schema.json", output, model=run_chunks.CHUNK_MODEL
                )
                run_chunks.run_model(
                    object(), prompt, "schema.json", output, model=run_chunks.SYNTHESIS_MODEL
                )
            finally:
                run_chunks.subprocess.run = original

        self.assertEqual(seen, [run_chunks.CHUNK_MODEL, run_chunks.SYNTHESIS_MODEL])

    def test_needs_tiebreak_for_approve_block_split(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            approve = root / "approve.json"
            block = root / "block.json"
            approve.write_text(json.dumps({"verdict": "APPROVE"}))
            block.write_text(json.dumps({"verdict": "REQUEST_CHANGES"}))
            self.assertTrue(run_chunks.needs_tiebreak([approve, block]))

    def test_choose_decisive_path_returns_majority_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            first = root / "first.json"
            second = root / "second.json"
            third = root / "third.json"
            first.write_text(json.dumps({"verdict": "APPROVE"}))
            second.write_text(json.dumps({"verdict": "REQUEST_CHANGES"}))
            third.write_text(json.dumps({"verdict": "REQUEST_CHANGES"}))
            self.assertEqual(run_chunks.choose_decisive_path([first, second, third]), second)

    def test_synthesis_payload_preserves_all_tiebreak_findings_grouped_by_chunk(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            first = root / "chunk-0001-review-1.json"
            second = root / "chunk-0001-review-2.json"
            third = root / "chunk-0001-review-3.json"
            base = {
                "head_sha": "a" * 40,
                "chunk_id": "chunk-0001",
                "chunk_hash": "b" * 64,
                "reviewed_structural_index": [],
            }
            first.write_text(json.dumps({**base, "verdict": "APPROVE", "findings": []}))
            second.write_text(
                json.dumps(
                    {
                        **base,
                        "verdict": "REQUEST_CHANGES",
                        "findings": [
                            {
                                "id": "CR-1",
                                "severity": "HIGH",
                                "category": "code",
                                "file": "app/a.rb",
                                "line": 1,
                                "description": "First blocker.",
                                "evidence": "Second run found this.",
                                "suggested_fix": "Fix first blocker.",
                                "verifiable_check": "rspec spec/a_spec.rb",
                            }
                        ],
                    }
                )
            )
            third.write_text(
                json.dumps(
                    {
                        **base,
                        "verdict": "REQUEST_CHANGES",
                        "findings": [
                            {
                                "id": "CR-2",
                                "severity": "HIGH",
                                "category": "code",
                                "file": "app/b.rb",
                                "line": 2,
                                "description": "Second blocker.",
                                "evidence": "Third run found this.",
                                "suggested_fix": "Fix second blocker.",
                                "verifiable_check": "rspec spec/b_spec.rb",
                            }
                        ],
                    }
                )
            )

            group = run_chunks.chunk_result_group([first, second, third])
            self.assertEqual(group["convergence"]["final_kind"], "blocked")
            self.assertEqual(group["convergence"]["reason"], "1/3 approve (majority)")
            self.assertEqual(group["decisive_path"], str(second))
            self.assertEqual(len(group["runs"]), 3)

            template = (
                "<!-- CI_INJECT:LIVE_STATE -->x<!-- /CI_INJECT:LIVE_STATE -->\n"
                "<!-- CI_INJECT:MANIFEST -->x<!-- /CI_INJECT:MANIFEST -->\n"
                "<!-- CI_INJECT:CHUNK_RESULTS -->x<!-- /CI_INJECT:CHUNK_RESULTS -->\n"
                "<!-- CI_INJECT:PRIOR_LOOP -->x<!-- /CI_INJECT:PRIOR_LOOP -->\n"
            )
            out = root / "synthesis.md"
            run_chunks.build_synthesis_prompt(template, "live", "manifest", "prior", [group], out)
            prompt = out.read_text()
            self.assertIn("First blocker.", prompt)
            self.assertIn("Second blocker.", prompt)
            self.assertIn('"decisive_path"', prompt)
            self.assertIn('"convergence"', prompt)


if __name__ == "__main__":
    unittest.main()
