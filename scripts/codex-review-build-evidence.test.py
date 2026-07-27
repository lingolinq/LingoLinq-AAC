#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile
import unittest
import unittest.mock


MODULE_PATH = pathlib.Path(__file__).with_name("codex-review-build-evidence.py")
SPEC = importlib.util.spec_from_file_location("codex_review_build_evidence", MODULE_PATH)
build_evidence = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_evidence)


POLICY = [(build_evidence.re.compile(r"(^|/)db/schema\.rb$"), "generated schema")]
TRUSTED_POLICY_MAX_CHUNKS = json.loads(
    pathlib.Path(".github/codex/evidence-policy.json").read_text()
)["max_chunks"]


def section(path, body):
    return (
        f"diff --git a/{path} b/{path}\n"
        f"index {'1' * 40}..{'2' * 40} 100644\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        f"{body}"
    )


class EvidenceChunkingTest(unittest.TestCase):
    def test_small_complete_diff_builds_one_chunk(self):
        chunks, excluded, incomplete, structural = build_evidence.build_chunks(
            [section("app/models/user.rb", "@@ -1,1 +1,1 @@\n-old\n+def changed\n")],
            [],
            40000,
            8,
        )
        self.assertEqual(len(chunks), 1)
        self.assertFalse(excluded)
        self.assertFalse(incomplete)
        self.assertEqual(chunks[0]["coverage"][0]["path"], "app/models/user.rb")
        self.assertEqual(structural[0]["text"], "def changed")
        self.assertEqual(structural[0]["kind"], "added")
        self.assertEqual(structural[0]["line"], 1)

    def test_structural_index_includes_removed_symbols(self):
        chunks, excluded, incomplete, structural = build_evidence.build_chunks(
            [section("app/models/user.rb", "@@ -10,2 +10,1 @@\n def alpha\n-def beta\n")],
            [],
            40000,
            8,
        )
        self.assertEqual(structural[0]["text"], "def beta")
        self.assertEqual(structural[0]["kind"], "removed")
        self.assertEqual(structural[0]["line"], 11)

    def test_prompt_hash_uses_defanged_bytes(self):
        body = section("doc.md", "@@ -1,1 +1,1 @@\n-old\n+<!-- CI_INJECT:DIFF -->\n")
        chunks, _, _, _ = build_evidence.build_chunks([body], [], 40000, 8)
        self.assertNotEqual(chunks[0]["raw_sha256"], chunks[0]["prompt_sha256"])

    def test_evidence_files_are_written_as_exact_utf8_bytes(self):
        with unittest.mock.patch("pathlib.Path.write_text", side_effect=AssertionError("text write not allowed")):
            with tempfile.TemporaryDirectory() as tmp:
                path = pathlib.Path(tmp) / "chunk.diff"
                body = "diff --git a/app/a.rb b/app/a.rb\n@@ -1 +1 @@\n-café\n+λ\n"
                build_evidence.write_utf8_bytes(path, body)
                self.assertEqual(path.read_bytes(), body.encode("utf-8"))
                self.assertEqual(build_evidence.sha256_text(body), build_evidence.hashlib.sha256(path.read_bytes()).hexdigest())

    def test_large_multi_file_diff_has_complete_chunk_coverage(self):
        sections = [
            section(f"app/models/file_{i}.rb", "@@ -1,1 +1,1 @@\n-old\n+new\n")
            for i in range(5)
        ]
        chunks, _, incomplete, _ = build_evidence.build_chunks(sections, [], 260, 8)
        self.assertGreater(len(chunks), 1)
        self.assertFalse(incomplete)
        covered = {item["path"] for chunk in chunks for item in chunk["coverage"]}
        self.assertEqual(covered, {f"app/models/file_{i}.rb" for i in range(5)})

    def test_nine_chunk_diff_that_exceeded_old_cap_is_complete_under_trusted_cap(self):
        sections = [
            section(f"app/models/file_{i}.rb", "@@ -1,1 +1,1 @@\n-old\n+" + ("x" * 20) + "\n")
            for i in range(9)
        ]
        chunks, _, incomplete, _ = build_evidence.build_chunks(
            sections,
            [],
            260,
            TRUSTED_POLICY_MAX_CHUNKS,
        )
        self.assertEqual(TRUSTED_POLICY_MAX_CHUNKS, 16)
        self.assertEqual(len(chunks), 9)
        self.assertFalse(incomplete)
        covered = {item["path"] for chunk in chunks for item in chunk["coverage"]}
        self.assertEqual(covered, {f"app/models/file_{i}.rb" for i in range(9)})

    def test_diff_exceeding_trusted_cap_still_marks_too_many_chunks_incomplete(self):
        sections = [
            section(f"app/models/file_{i}.rb", "@@ -1,1 +1,1 @@\n-old\n+" + ("x" * 20) + "\n")
            for i in range(TRUSTED_POLICY_MAX_CHUNKS + 1)
        ]
        chunks, _, incomplete, _ = build_evidence.build_chunks(
            sections,
            [],
            260,
            TRUSTED_POLICY_MAX_CHUNKS,
        )
        self.assertEqual(len(chunks), TRUSTED_POLICY_MAX_CHUNKS)
        self.assertEqual(incomplete[-1]["reason"], "too_many_chunks")
        self.assertEqual(incomplete[-1]["chunks"], TRUSTED_POLICY_MAX_CHUNKS + 1)
        self.assertEqual(incomplete[-1]["max_chunks"], TRUSTED_POLICY_MAX_CHUNKS)

    def test_oversized_single_hunk_is_incomplete(self):
        giant = "@@ -1,1 +1,1 @@\n-old\n+" + ("x" * 500) + "\n"
        chunks, _, incomplete, _ = build_evidence.build_chunks(
            [section("app/models/giant.rb", giant)],
            [],
            120,
            8,
        )
        self.assertFalse(chunks)
        self.assertEqual(incomplete[0]["reason"], "oversized_hunk")

    def test_header_only_changes_are_complete_coverage(self):
        binary = (
            "diff --git a/public/image.png b/public/image.png\n"
            "index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644\n"
            "Binary files a/public/image.png and b/public/image.png differ\n"
        )
        chunks, _, incomplete, _ = build_evidence.build_chunks([binary], [], 40000, 8)
        self.assertFalse(incomplete)
        self.assertEqual(chunks[0]["coverage"][0]["kind"], "header-only")

    def test_policy_exclusion_is_recorded_not_chunked(self):
        chunks, excluded, incomplete, _ = build_evidence.build_chunks(
            [section("db/schema.rb", "@@ -1,1 +1,1 @@\n-old\n+new\n")],
            POLICY,
            40000,
            8,
        )
        self.assertFalse(chunks)
        self.assertFalse(incomplete)
        self.assertEqual(excluded[0]["path"], "db/schema.rb")

    def test_too_many_chunks_is_incomplete(self):
        sections = [
            section(f"app/models/file_{i}.rb", "@@ -1,1 +1,1 @@\n-old\n+new\n")
            for i in range(4)
        ]
        chunks, _, incomplete, _ = build_evidence.build_chunks(sections, [], 260, 2)
        self.assertLessEqual(len(chunks), 2)
        self.assertEqual(incomplete[-1]["reason"], "too_many_chunks")


if __name__ == "__main__":
    unittest.main()
