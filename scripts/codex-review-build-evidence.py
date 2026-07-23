#!/usr/bin/env python3
"""Build CI-owned chunked diff evidence for codex-review.

The manifest is generated from commit objects, not the index. Helper files are
restored from the trusted workflow ref before this script runs, so reading the
index would mix trusted helper blobs with the PR head. Diff and tree evidence
must stay anchored to BASE_SHA...HEAD_SHA and HEAD_SHA.
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys


DIFF_CONFIG = [
    "-c",
    "core.quotepath=false",
    "-c",
    "core.abbrev=40",
    "-c",
    "diff.algorithm=default",
    "-c",
    "diff.noprefix=false",
    "-c",
    "diff.mnemonicPrefix=false",
]
DIFF_ARGS = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--find-renames=50%", "-U3"]
HEADER_RE = re.compile(r"^diff --git a/(.*) b/(.*)$")
HUNK_RE = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@")
STRUCTURAL_RE = re.compile(
    r"^[+-](?:\s*)(class|module|def|function|export|import|const|let|var|route|resources?|resource|namespace|scope|mount|add_column|remove_column|rename_column|create_table|drop_table|ENV\[|config\.)\b"
)
CI_MARKER_RE = re.compile(r"<!--\s*/?\s*CI_INJECT:[A-Z_]+\s*-->")


def run_git(args, *, text=True):
    cmd = ["git", *DIFF_CONFIG, *args]
    result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=text)
    return result.stdout


def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_utf8_bytes(path, text):
    pathlib.Path(path).write_bytes(text.encode("utf-8"))


def defang_ci_markers(body):
    return CI_MARKER_RE.sub(
        lambda m: m.group(0).replace("<!--", "[[").replace("-->", "]]"),
        body,
    )


def load_policy(path):
    return json.loads(pathlib.Path(path).read_text())


def compile_policy(policy):
    compiled = []
    for entry in policy.get("excluded_paths", []):
        compiled.append((re.compile(entry["pattern"]), entry["reason"]))
    return compiled


def exclusion_for(path, compiled_policy):
    for regex, reason in compiled_policy:
        if regex.search(path):
            return reason
    return None


def split_file_sections(raw_diff):
    sections = []
    current = []
    for line in raw_diff.splitlines(keepends=True):
        if line.startswith("diff --git ") and current:
            sections.append("".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("".join(current))
    return sections


def section_paths(section):
    first = section.splitlines()[0] if section else ""
    match = HEADER_RE.match(first)
    if not match:
        return {"old_path": None, "new_path": None, "path": "(unknown)"}
    old_path, new_path = match.groups()
    path = new_path if new_path != "/dev/null" else old_path
    return {"old_path": old_path, "new_path": new_path, "path": path}


def section_header_and_hunks(section):
    lines = section.splitlines(keepends=True)
    first_hunk = next((i for i, line in enumerate(lines) if line.startswith("@@ ")), None)
    if first_hunk is None:
        return lines, []
    header = lines[:first_hunk]
    hunks = []
    current = []
    for line in lines[first_hunk:]:
        if line.startswith("@@ ") and current:
            hunks.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        hunks.append(current)
    return header, hunks


def chunk_id(number):
    return f"chunk-{number:04d}"


def chunk_record(number, body, files, ranges, include_body=False):
    raw_hash = sha256_text(body)
    prompt_hash = sha256_text(defang_ci_markers(body))
    record = {
        "id": chunk_id(number),
        "path": f"{chunk_id(number)}.diff",
        "raw_sha256": raw_hash,
        "prompt_sha256": prompt_hash,
        "byte_count": len(body.encode("utf-8")),
        "files": sorted(files),
        "coverage": ranges,
    }
    if include_body:
        record["_body"] = body
    return record


def parse_hunk_range(hunk_lines):
    if not hunk_lines:
        return {"old_start": None, "new_start": None}
    match = HUNK_RE.match(hunk_lines[0].rstrip("\n"))
    if not match:
        return {"old_start": None, "new_start": None}
    return {"old_start": int(match.group(1)), "new_start": int(match.group(2))}


def structural_entries(path, section):
    entries = []
    old_line = None
    new_line = None
    for diff_line_no, line in enumerate(section.splitlines(), 1):
        if line.startswith("@@ "):
            match = HUNK_RE.match(line)
            if match:
                old_line = int(match.group(1))
                new_line = int(match.group(2))
            continue
        if old_line is None or new_line is None:
            continue
        if line.startswith("+") and not line.startswith("+++"):
            kind = "added"
            source_line = new_line
            if STRUCTURAL_RE.search(line):
                entries.append(
                    {
                        "path": path,
                        "kind": kind,
                        "line": source_line,
                        "diff_line": diff_line_no,
                        "text": line[1:].strip(),
                    }
                )
            new_line += 1
            continue
        if line.startswith("-") and not line.startswith("---"):
            kind = "removed"
            source_line = old_line
            if STRUCTURAL_RE.search(line):
                entries.append(
                    {
                        "path": path,
                        "kind": kind,
                        "line": source_line,
                        "diff_line": diff_line_no,
                        "text": line[1:].strip(),
                    }
                )
            old_line += 1
            continue
        if not line.startswith("\\"):
            old_line += 1
            new_line += 1
    return entries


def build_chunks(sections, compiled_policy, target_bytes, max_chunks, include_bodies=False):
    chunks = []
    excluded = []
    incomplete = []
    structural = []
    current_body = ""
    current_files = set()
    current_ranges = []

    def flush():
        nonlocal current_body, current_files, current_ranges
        if not current_body:
            return
        if len(chunks) >= max_chunks:
            if not any(item.get("reason") == "too_many_chunks" for item in incomplete):
                incomplete.append({"path": "(diff-wide)", "reason": "too_many_chunks", "chunks": len(chunks) + 1, "max_chunks": max_chunks})
            current_body = ""
            current_files = set()
            current_ranges = []
            return
        chunks.append(chunk_record(len(chunks) + 1, current_body, current_files, current_ranges, include_bodies))
        current_body = ""
        current_files = set()
        current_ranges = []

    for section in sections:
        paths = section_paths(section)
        path = paths["path"]
        exclusion = exclusion_for(path, compiled_policy)
        if exclusion:
            excluded.append({"path": path, "reason": exclusion, "raw_sha256": sha256_text(section)})
            continue

        structural.extend(structural_entries(path, section))

        header, hunks = section_header_and_hunks(section)
        section_bytes = len(section.encode("utf-8"))

        if section_bytes <= target_bytes:
            if current_body and len((current_body + section).encode("utf-8")) > target_bytes:
                flush()
            current_body += section
            current_files.add(path)
            if hunks:
                current_ranges.extend(
                    {"path": path, "kind": "hunk", **parse_hunk_range(hunk)} for hunk in hunks
                )
            else:
                current_ranges.append({"path": path, "kind": "header-only"})
            continue

        if not hunks:
            incomplete.append({"path": path, "reason": "oversized_header_only_file", "bytes": section_bytes})
            continue

        flush()
        header_text = "".join(header)
        for hunk in hunks:
            hunk_body = header_text + "".join(hunk)
            hunk_bytes = len(hunk_body.encode("utf-8"))
            if hunk_bytes > target_bytes:
                incomplete.append({"path": path, "reason": "oversized_hunk", "bytes": hunk_bytes})
                continue
            if current_body and len((current_body + hunk_body).encode("utf-8")) > target_bytes:
                flush()
            current_body += hunk_body
            current_files.add(path)
            current_ranges.append({"path": path, "kind": "hunk", **parse_hunk_range(hunk)})

    flush()
    return chunks, excluded, incomplete, structural


def changed_files(base, head):
    output = run_git(["diff", "--name-status", "--find-renames=50%", f"{base}...{head}"])
    files = []
    for line in output.splitlines():
        if not line:
            continue
        parts = line.split("\t")
        status = parts[0]
        path = parts[-1]
        tree = subprocess.run(
            ["git", "ls-tree", head, "--", path],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.strip()
        mode = None
        blob = None
        if tree:
            first, rest = tree.split(" ", 1)
            mode = first
            blob = rest.split("\t", 1)[0].split()[-1]
        files.append({"status": status, "path": path, "mode": mode, "blob": blob, "deleted": not bool(tree)})
    return files


def rev_parse(ref):
    return subprocess.run(
        ["git", "rev-parse", "--verify", ref],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.strip()


def write_manifest_md(manifest):
    lines = [
        f"# Codex review evidence manifest",
        "",
        f"- Evidence mode: {manifest['evidence_mode']}",
        f"- Base SHA: `{manifest['base_sha']}`",
        f"- Head SHA: `{manifest['head_sha']}`",
        f"- Coverage complete: `{manifest['coverage_complete']}` ({manifest['coverage_reason']})",
        f"- Changed files: {len(manifest['changed_files'])}",
        f"- Included chunks: {len(manifest['chunks'])}",
        f"- Excluded paths: {len(manifest['excluded_paths'])}",
        "",
        "## Changed files",
    ]
    for f in manifest["changed_files"]:
        lines.append(f"- `{f['path']}` status={f['status']} mode={f['mode'] or 'deleted'} blob={f['blob'] or 'deleted'}")
    lines.extend(["", "## Chunks"])
    for chunk in manifest["chunks"]:
        ranges = ", ".join(f"{r['path']}:{r['kind']}:{r.get('new_start')}" for r in chunk["coverage"])
        lines.append(f"- `{chunk['id']}` raw={chunk['raw_sha256']} prompt={chunk['prompt_sha256']} bytes={chunk['byte_count']} files={chunk['files']} coverage={ranges}")
    if manifest["excluded_paths"]:
        lines.extend(["", "## Policy-covered exclusions"])
        for entry in manifest["excluded_paths"]:
            lines.append(f"- `{entry['path']}`: {entry['reason']}")
    if manifest["incomplete_coverage"]:
        lines.extend(["", "## Incomplete coverage"])
        for entry in manifest["incomplete_coverage"]:
            lines.append(f"- `{entry.get('path')}`: {entry.get('reason')}")
    if manifest["structural_index"]:
        lines.extend(["", "## CI-computed structural index"])
        for entry in manifest["structural_index"]:
            lines.append(f"- `{entry['path']}` {entry['kind']} line={entry['line']} diff-line={entry['diff_line']}: `{entry['text']}`")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--policy", default=".github/codex/evidence-policy.json")
    parser.add_argument("--evidence-mode", default="chunked")
    args = parser.parse_args()

    policy = load_policy(args.policy)
    target_bytes = int(policy["chunk_target_bytes"])
    max_chunks = int(policy["max_chunks"])
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    base_sha = rev_parse(args.base)
    head_sha = rev_parse(args.head)

    raw_diff = run_git([*DIFF_ARGS, f"{base_sha}...{head_sha}"])
    write_utf8_bytes(out_dir / "full.diff", raw_diff)
    sections = split_file_sections(raw_diff)
    chunks, excluded, incomplete, structural = build_chunks(
        sections,
        compile_policy(policy),
        target_bytes,
        max_chunks,
        include_bodies=True,
    )
    for chunk in chunks:
        body = chunk.pop("_body")
        write_utf8_bytes(out_dir / chunk["path"], body)

    coverage_complete = not incomplete and len(chunks) <= max_chunks
    manifest = {
        "schema_version": 1,
        "evidence_mode": args.evidence_mode,
        "base_sha": base_sha,
        "head_sha": head_sha,
        "diff_command": "git -c core.quotepath=false -c core.abbrev=40 -c diff.algorithm=default -c diff.noprefix=false -c diff.mnemonicPrefix=false diff --no-color --no-ext-diff --no-textconv --find-renames=50% -U3 BASE...HEAD",
        "full_raw_diff_sha256": sha256_text(raw_diff),
        "changed_files": changed_files(base_sha, head_sha),
        "chunks": chunks,
        "excluded_paths": excluded,
        "incomplete_coverage": incomplete,
        "structural_index": structural,
        "coverage_complete": coverage_complete,
        "coverage_reason": "complete" if coverage_complete else "incomplete_or_over_budget",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True))
    (out_dir / "manifest.md").write_text(write_manifest_md(manifest))
    print(json.dumps({"coverage_complete": coverage_complete, "chunks": len(chunks), "manifest": str(out_dir / "manifest.json")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
