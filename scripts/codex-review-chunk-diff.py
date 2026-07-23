#!/usr/bin/env python3
"""Split a `git diff BASE...HEAD` into file-boundary chunks, each within a byte
cap, so an oversized PR is reviewed across several passes instead of being
truncated to the first N bytes and deferred to a human.

Motivation: `codex-review/deep-pass` is a fail-closed required gate. It used to
inject only the first `MAX_BYTES` of the diff; a large PR (e.g. #665's ~644 KB)
was truncated, so the reviewer correctly refused a verdict over unverified
hunks and the gate went red. Chunking covers the WHOLE change set: each chunk
is a self-contained, valid unified diff of complete per-file diffs, reviewed on
its own pass, and the caller folds the per-chunk verdicts fail-closed (APPROVE
only if every chunk approves).

Chunking rules:
- Never split a single file's diff across chunks. Pack complete per-file diffs
  into a chunk until the next file would exceed the cap, then start a new chunk.
- A single file whose own diff exceeds the cap becomes its own chunk, truncated
  on a LINE boundary (never mid-line: this repo has UTF-8-heavy locale files and
  a byte cut could split a multibyte char and make the prompt undecodable) with
  an unseen-hunks marker. Only that one file stays partial.
- `--max-chunks` bounds runner cost/time. If more chunks are needed than the
  cap allows, the overflow files are NOT silently dropped: `overflow_files` is
  reported so the caller can emit a synthetic fail-closed NEEDS_HUMAN chunk for
  the tail (genuinely enormous PRs still route to a human, as before).

Each chunk file opens with an authoritative `NOTE:` line — CI knows whether the
chunk fit under the cap; the reviewer (which may have no shell) does not, and
without a positive completeness signal it can wrongly assume the diff is partial
and withhold a verdict.

Usage:
  codex-review-chunk-diff.py --diff <raw-diff-file> --out-dir <dir> \
      [--max-bytes N] [--max-chunks N] [--manifest <path>]

Prints the number of chunks written to stdout. Writes chunk-01.txt .. chunk-NN.txt
into <out-dir>, and (if --manifest given) a JSON manifest describing them.
"""
import argparse
import json
import pathlib
import re
import sys

DEFAULT_MAX_BYTES = 150000
DEFAULT_MAX_CHUNKS = 16

# A per-file diff starts at a `diff --git a/... b/...` header and runs until the
# next such header (or EOF). Splitting here keeps every hunk of a file together.
_FILE_HEADER_RE = re.compile(r"^diff --git ", re.MULTILINE)


def split_into_file_diffs(raw):
    """Return a list of complete per-file diff strings.

    Anything before the first `diff --git` header (rare: e.g. a leading blank
    line) is attached to the first file diff so no bytes are lost. A diff with
    no file header at all is returned as a single block.
    """
    if not raw:
        return []
    starts = [m.start() for m in _FILE_HEADER_RE.finditer(raw)]
    if not starts:
        return [raw]
    # Fold any preamble before the first header into the first file diff.
    starts[0] = 0
    files = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(raw)
        files.append(raw[start:end])
    return files


def _line_bounded_prefix(text, max_bytes):
    """Longest prefix of `text` that is <= max_bytes AND ends on a line
    boundary, so a multibyte UTF-8 char is never split. Mirrors the workflow's
    `head -c | sed '$d'` behavior."""
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    cut = encoded[:max_bytes]
    # Back up to the last newline so we never emit a partial (possibly
    # mid-multibyte-char) final line.
    nl = cut.rfind(b"\n")
    if nl == -1:
        # A single line longer than the cap: decode defensively, dropping any
        # trailing bytes that would form an incomplete char.
        return cut.decode("utf-8", "ignore")
    return cut[:nl].decode("utf-8", "ignore")


def _byte_len(text):
    return len(text.encode("utf-8"))


def build_chunks(files, max_bytes):
    """Pack complete per-file diffs into chunks of <= max_bytes. A file larger
    than the cap becomes its own (truncated) chunk. Returns a list of dicts:
    {files: [paths...], body: str, truncated: bool}."""
    chunks = []
    current_bodies = []
    current_files = []
    current_bytes = 0

    def flush():
        nonlocal current_bodies, current_files, current_bytes
        if current_bodies:
            chunks.append(
                {
                    "files": current_files,
                    "body": "".join(current_bodies),
                    "truncated": False,
                }
            )
            current_bodies, current_files, current_bytes = [], [], 0

    for fdiff in files:
        path = _file_path(fdiff)
        size = _byte_len(fdiff)
        if size > max_bytes:
            # Oversized single file: flush whatever is accumulated, then emit
            # this file alone as its own truncated chunk.
            flush()
            body = _line_bounded_prefix(fdiff, max_bytes)
            chunks.append({"files": [path], "body": body, "truncated": True})
            continue
        if current_bytes + size > max_bytes and current_bodies:
            flush()
        current_bodies.append(fdiff)
        current_files.append(path)
        current_bytes += size
    flush()
    return chunks


def _file_path(fdiff):
    """Best-effort path label for a per-file diff (the `b/` side of the header)."""
    m = re.search(r"^diff --git a/(.+?) b/(.+)$", fdiff, re.MULTILINE)
    if m:
        return m.group(2).strip()
    return "(unknown)"


def render_chunk(body, truncated, files, chunk_index, chunk_total, max_bytes):
    """Prepend the authoritative NOTE line the reviewer keys off of."""
    file_count = len(files)
    header = []
    if truncated:
        header.append(
            f"NOTE: git diff chunk {chunk_index} of {chunk_total}, covering "
            f"{file_count} changed file(s). This single file's diff exceeds the "
            f"{max_bytes}-byte per-chunk cap and is TRUNCATED on a line boundary; "
            f"hunks past the cut are not shown -- treat them as unverified."
        )
        header.append("")
        header.append(body)
        header.append("")
        header.append(f"[... file diff truncated near {max_bytes} bytes (cut on a line boundary) ...]")
    else:
        header.append(
            f"NOTE: COMPLETE git diff chunk {chunk_index} of {chunk_total}, "
            f"covering {file_count} changed file(s) in full (not truncated). Every "
            f"hunk of every file listed for this chunk is included below. Other "
            f"files in this PR are reviewed in the other chunks/passes."
        )
        header.append("")
        header.append(body.rstrip("\n"))
    return "\n".join(header) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--diff", required=True, help="raw git diff BASE...HEAD file")
    parser.add_argument("--out-dir", required=True, help="directory to write chunk-NN.txt")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-chunks", type=int, default=DEFAULT_MAX_CHUNKS)
    parser.add_argument("--manifest", default=None, help="optional manifest JSON output path")
    args = parser.parse_args()

    raw = pathlib.Path(args.diff).read_text()
    files = split_into_file_diffs(raw)
    all_chunks = build_chunks(files, args.max_bytes)

    # Bound fan-out. Files beyond the chunk cap are reported so the caller can
    # fail closed for the tail instead of silently dropping them.
    kept = all_chunks[: args.max_chunks]
    overflow = all_chunks[args.max_chunks :]
    overflow_files = [p for chunk in overflow for p in chunk["files"]]

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    total = len(kept)
    manifest_chunks = []
    for i, chunk in enumerate(kept, start=1):
        rendered = render_chunk(
            chunk["body"], chunk["truncated"], chunk["files"], i, total, args.max_bytes
        )
        chunk_path = out_dir / f"chunk-{i:02d}.txt"
        chunk_path.write_text(rendered)
        manifest_chunks.append(
            {
                "index": i,
                "path": str(chunk_path),
                "files": chunk["files"],
                "truncated": chunk["truncated"],
            }
        )

    if args.manifest:
        manifest = {
            "chunk_count": total,
            "max_bytes": args.max_bytes,
            "max_chunks": args.max_chunks,
            "chunks": manifest_chunks,
            "overflow_files": overflow_files,
        }
        pathlib.Path(args.manifest).write_text(json.dumps(manifest, indent=2))

    if overflow_files:
        print(
            f"WARNING: {len(overflow_files)} file(s) beyond the {args.max_chunks}-chunk "
            f"cap were not chunked and must fail closed: {', '.join(overflow_files[:10])}"
            + (" ..." if len(overflow_files) > 10 else ""),
            file=sys.stderr,
        )

    print(total)


if __name__ == "__main__":
    main()
