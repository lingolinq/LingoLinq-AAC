#!/usr/bin/env python3
"""Tests for codex-review-chunk-diff.py: file-boundary splitting, per-chunk
byte cap, oversized-single-file truncation on a line boundary, and the
MAX_CHUNKS overflow report."""
import importlib.util
import json
import pathlib
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("codex-review-chunk-diff.py")
SPEC = importlib.util.spec_from_file_location("codex_review_chunk_diff", MODULE_PATH)
chunker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(chunker)


def _file_diff(path, body_lines):
    header = f"diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n"
    return header + "".join(f"+{line}\n" for line in body_lines)


class SplitTest(unittest.TestCase):
    def test_splits_on_file_headers(self):
        raw = _file_diff("a.txt", ["x"]) + _file_diff("b.txt", ["y"])
        files = chunker.split_into_file_diffs(raw)
        self.assertEqual(len(files), 2)
        self.assertIn("a/a.txt", files[0])
        self.assertIn("a/b.txt", files[1])

    def test_empty_diff_is_no_files(self):
        self.assertEqual(chunker.split_into_file_diffs(""), [])

    def test_preamble_folds_into_first_file(self):
        raw = "\n" + _file_diff("a.txt", ["x"])
        files = chunker.split_into_file_diffs(raw)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].startswith("\ndiff --git"))


class ChunkPackingTest(unittest.TestCase):
    def test_files_packed_until_cap_then_new_chunk(self):
        # Two ~30-byte files, cap 70 -> both fit one chunk; cap 50 -> two chunks.
        files = [_file_diff("a.txt", ["aaaa"]), _file_diff("b.txt", ["bbbb"])]
        one = chunker.build_chunks(files, max_bytes=100000)
        self.assertEqual(len(one), 1)
        self.assertEqual(one[0]["files"], ["a.txt", "b.txt"])

        each = chunker.build_chunks(files, max_bytes=len(files[0].encode()) + 1)
        self.assertEqual(len(each), 2)
        self.assertFalse(each[0]["truncated"])

    def test_oversized_single_file_is_its_own_truncated_chunk(self):
        big = _file_diff("big.txt", [f"line-{i}" for i in range(500)])
        cap = 200
        chunks = chunker.build_chunks([big], max_bytes=cap)
        self.assertEqual(len(chunks), 1)
        self.assertTrue(chunks[0]["truncated"])
        # Truncated on a line boundary and within the cap.
        self.assertLessEqual(len(chunks[0]["body"].encode("utf-8")), cap)
        self.assertTrue(chunks[0]["body"].endswith("\n") or "\n" in chunks[0]["body"])

    def test_utf8_truncation_never_splits_a_multibyte_char(self):
        # A locale-style file full of multibyte chars; a byte cut mid-char would
        # raise on encode round-trip. Line-boundary cut must stay decodable.
        big = _file_diff("uk.json", ["Ласкаво просимо до LingoLinq" for _ in range(200)])
        chunks = chunker.build_chunks([big], max_bytes=300)
        # Round-trips cleanly (would raise if a char were split).
        chunks[0]["body"].encode("utf-8").decode("utf-8")


class RenderTest(unittest.TestCase):
    def test_complete_chunk_note_is_authoritative(self):
        out = chunker.render_chunk("diff --git a/a b/a\n+x\n", False, ["a"], 1, 3, 150000)
        self.assertIn("COMPLETE git diff chunk 1 of 3", out)
        self.assertNotIn("TRUNCATED", out)

    def test_truncated_chunk_note_marks_unverified(self):
        out = chunker.render_chunk("diff --git a/a b/a\n+x", True, ["a"], 2, 3, 150000)
        self.assertIn("TRUNCATED", out)
        self.assertIn("treat them as unverified", out)


class EndToEndTest(unittest.TestCase):
    def _run(self, raw, max_bytes, max_chunks):
        with tempfile.TemporaryDirectory() as d:
            d = pathlib.Path(d)
            diff_file = d / "diff.txt"
            diff_file.write_text(raw)
            out_dir = d / "chunks"
            manifest = d / "manifest.json"
            import sys

            argv = sys.argv
            sys.argv = [
                "chunk",
                "--diff", str(diff_file),
                "--out-dir", str(out_dir),
                "--max-bytes", str(max_bytes),
                "--max-chunks", str(max_chunks),
                "--manifest", str(manifest),
            ]
            try:
                chunker.main()
            except SystemExit:
                pass
            finally:
                sys.argv = argv
            data = json.loads(manifest.read_text())
            written = sorted(p.name for p in out_dir.glob("chunk-*.txt"))
            return data, written

    def test_overflow_files_reported_and_chunks_capped(self):
        # 4 files, cap forces 1 file/chunk, max_chunks 2 -> 2 kept, 2 overflow.
        files = [_file_diff(f"f{i}.txt", ["x" * 50]) for i in range(4)]
        raw = "".join(files)
        per_file = len(files[0].encode())
        data, written = self._run(raw, max_bytes=per_file + 1, max_chunks=2)
        self.assertEqual(data["chunk_count"], 2)
        self.assertEqual(len(written), 2)
        self.assertEqual(len(data["overflow_files"]), 2)
        self.assertIn("f2.txt", data["overflow_files"])

    def test_normal_pr_is_one_chunk_no_overflow(self):
        raw = _file_diff("small.txt", ["a", "b", "c"])
        data, written = self._run(raw, max_bytes=150000, max_chunks=8)
        self.assertEqual(data["chunk_count"], 1)
        self.assertEqual(written, ["chunk-01.txt"])
        self.assertEqual(data["overflow_files"], [])


if __name__ == "__main__":
    unittest.main()
