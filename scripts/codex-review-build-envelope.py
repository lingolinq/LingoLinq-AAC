#!/usr/bin/env python3
"""Wrap the reviewer's model-output JSON with CI-trusted routing fields before
POSTing to n8n W2, applying a prompt-injection guard and a deterministic
convergence policy across repeated reviewer runs.

Without the envelope, W2 would have to key its routing (which PR to comment on,
which commit status to resolve) off values the model itself asserted inside
review.json. Wrap them in an envelope of Actions-validated values so W2 trusts
CI ground truth, not model output.

Two additional guards make `codex-review/deep-pass` fit to become a REQUIRED
merge gate:

1. Prompt-injection guard. The reviewer decides from the untrusted PR diff
   spliced into its prompt. A malicious diff could carry text steering the
   model to emit APPROVE. Any APPROVE whose diff matches an injection pattern is
   downgraded to a fail-closed "suspected_prompt_injection" outcome (NEEDS_HUMAN
   territory). This is intentionally conservative: a PR that merely contains
   such phrases (e.g. this file, which defines the patterns) also trips it and
   gets a human review, which is the safe direction.

2. Convergence policy ("confirm both directions"). The model is
   non-deterministic, so a lone run is not a repeatable gate. Run the reviewer
   twice and require agreement; on disagreement the workflow runs a third
   tiebreaker and the majority decides. A 2-run split with no tiebreaker
   fails closed.

Usage:
  # Build the envelope from 1..3 review files (convergence + guard applied):
  codex-review-build-envelope.py --diff <diff-file> --out <envelope-file> <review.json>...
  # Decide whether a 3rd (tiebreak) run is needed for exactly 2 review files:
  codex-review-build-envelope.py --need-third --diff <diff-file> <review1.json> <review2.json>

Envelope path reads PR_NUMBER, HEAD_SHA, BASE_SHA, LOOP_N, REVIEWER_ROUTE,
RUN_ID from env.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess


INFRASTRUCTURE_CATEGORY = "live_state"
INFRASTRUCTURE_MARKERS = (
    "bwrap:",
    "bubblewrap",
    "failed rtm_newaddr",
    "operation not permitted",
    "every shell invocation failed",
    "unable to complete the mandated read-only repository inspection",
    "tool calls are failing",
    "before any shell command can run",
    "command channel rejected",
    "output-schema validation error",
    "sandbox",
)

# Diff text that tries to STEER the verdict toward APPROVE, or to override the
# reviewer's instructions. Kept tight and imperative so ordinary diffs do not
# trip it; false positives are fail-closed (they get a human review) but too
# many would make the gate useless, so the bar is "text telling the reviewer
# what verdict to emit", not any mention of the word approve.
INJECTION_PATTERNS = (
    r"ignore\s+(?:all\s+|any\s+)?(?:previous|prior|earlier|above|preceding)\s+"
    r"(?:instructions|directions|prompt|guidance)",
    r"disregard\s+(?:the\s+|all\s+|any\s+)?(?:previous|prior|above)\s+"
    r"(?:instructions|directions|prompt|guidance|findings)",
    r"(?:respond|reply|answer|output|return|emit)\s+(?:with\s+|only\s+with\s+)?"
    r"[`'\"]?approve\b",
    r"verdict\s*[:=]\s*[`'\"]?approve",
    r"you\s+(?:must|should|are\s+required\s+to)\s+"
    r"(?:approve|return\s+approve|respond\s+approve)",
    r"mark\s+(?:(?:this|the|it)\s+)?(?:pr\s+)?(?:as\s+)?approved",
    r"set\s+(?:the\s+)?verdict\s+(?:to\s+)?approve",
    r"override\s+(?:the\s+)?(?:review|verdict|findings)",
)
_INJECTION_RE = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)

# Which blocking outcome to surface when several runs block for different
# reasons: injection is the most important to name, then a real
# requires-changes, then a runner/sandbox inconclusive.
_BLOCK_PRIORITY = {
    "suspected_prompt_injection": 0,
    "incomplete_evidence": 0,
    "requires_attention": 1,
    "inconclusive_infrastructure": 2,
    "unconverged_split": 3,
}


def is_infrastructure_inconclusive(review):
    """Return true for runner/tooling failures, not real review findings."""
    if str(review.get("verdict", "")).upper() != "NEEDS_HUMAN":
        return False

    findings = review.get("findings")
    if not isinstance(findings, list) or not findings:
        return False

    has_infrastructure_marker = False
    for finding in findings:
        if not isinstance(finding, dict):
            return False
        if finding.get("category") != INFRASTRUCTURE_CATEGORY:
            return False
        text = " ".join(
            str(finding.get(key, ""))
            for key in ("description", "evidence", "suggested_fix", "verifiable_check")
        ).lower()
        if any(marker in text for marker in INFRASTRUCTURE_MARKERS):
            has_infrastructure_marker = True
    return has_infrastructure_marker


def review_outcome(review):
    """Base outcome for a single review, before the injection guard."""
    verdict = str(review.get("verdict", "")).upper()
    if verdict == "APPROVE":
        return {
            "kind": "approved",
            "status_state": "success",
            "status_description": "Codex review approved",
            "human_label": "Approved",
        }
    if is_infrastructure_inconclusive(review):
        # Fail-closed: an inconclusive runner/sandbox result must BLOCK, not read
        # green. `codex-review/deep-pass` cannot ever gate merges while its
        # inconclusive outcome maps to `success`. `kind` stays distinguishable so
        # W2 can label it as an infra inconclusive rather than a real
        # requires-changes finding.
        return {
            "kind": "inconclusive_infrastructure",
            "status_state": "failure",
            "status_description": "Codex review inconclusive (runner/sandbox)",
            "human_label": "Inconclusive - runner/sandbox",
        }
    return {
        "kind": "requires_attention",
        "status_state": "failure",
        "status_description": "Codex review requires changes",
        "human_label": "Requires attention",
    }


def diff_has_injection(diff):
    return bool(diff) and bool(_INJECTION_RE.search(diff))


# A file git treats as binary is not shown in the diff: the reviewer sees only "Binary files ...
# differ". Git decides that from content (a NUL byte), so a PR can make a source file "binary" and
# hide it. Media and fonts are expected to be binary and pass; any other path that diffs as binary
# withholds an APPROVE. Archives (.zip, .gz, .tgz, .obz board packages) are deliberately not on the
# list: one can carry source or data the reviewer never sees, so a human looks at it. (PR-added
# .gitattributes cannot force this: the workflow diffs from a trusted worktree.)
REVIEWABLE_BINARY_EXTENSIONS = frozenset((
    "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tif", "tiff", "avif", "heic",
    "pdf", "woff", "woff2", "ttf", "otf", "eot",
    "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "mp4", "m4v", "webm", "mov",
))
_BINARY_DIFF_RE = re.compile(r"^Binary files (.+) and (.+) differ$", re.MULTILINE)


def _binary_side_path(side):
    if side == "/dev/null":
        return None
    return side[2:] if side[:2] in ("a/", "b/") else side


def _extension(path):
    name = path.rsplit("/", 1)[-1]
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def unreviewable_binary_paths(diff, read_head=None):
    """Paths that diff as binary and are not an expected binary type. With read_head, also an
    expected-type file at the head whose content does not start like that type."""
    paths = set()
    for match in _BINARY_DIFF_RE.finditer(diff or ""):
        for side in match.groups():
            path = _binary_side_path(side)
            if path is None:
                continue
            if _extension(path) not in REVIEWABLE_BINARY_EXTENSIONS:
                paths.add(path)
    if read_head is not None:
        paths.update(binary_content_mismatches(diff, read_head))
    return sorted(paths)


def _starts(*prefixes):
    return lambda head: head.startswith(prefixes)


def _riff(form):
    return lambda head: head[:4] == b"RIFF" and head[8:12] == form


def _iso_media(head):
    # ISO base media (the MP4 family, AVIF, HEIC): a box size, then "ftyp".
    return head[4:8] == b"ftyp"


# How each expected binary type starts. A file named for one of these types that does not start that
# way is not that type: a .png can hold code (Ruby stops parsing at a NUL) or a scanned roster. A real
# file that starts unusually only costs a human look (the APPROVE is withheld), never a missed one.
BINARY_SIGNATURES = {
    "png": _starts(b"\x89PNG\r\n\x1a\n"),
    "jpg": _starts(b"\xff\xd8\xff"),
    "jpeg": _starts(b"\xff\xd8\xff"),
    "gif": _starts(b"GIF87a", b"GIF89a"),
    "webp": _riff(b"WEBP"),
    "ico": _starts(b"\x00\x00\x01\x00"),
    "bmp": _starts(b"BM"),
    "tif": _starts(b"II*\x00", b"MM\x00*"),
    "tiff": _starts(b"II*\x00", b"MM\x00*"),
    "avif": _iso_media,
    "heic": _iso_media,
    "pdf": _starts(b"%PDF-"),
    "woff": _starts(b"wOFF"),
    "woff2": _starts(b"wOF2"),
    "ttf": _starts(b"\x00\x01\x00\x00", b"true", b"OTTO"),
    "otf": _starts(b"OTTO", b"\x00\x01\x00\x00"),
    "eot": lambda head: head[34:36] == b"LP",
    "mp3": lambda head: head.startswith(b"ID3") or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0),
    "wav": _riff(b"WAVE"),
    "ogg": _starts(b"OggS"),
    "oga": _starts(b"OggS"),
    "m4a": _iso_media,
    "aac": lambda head: head.startswith((b"ADIF", b"ID3")) or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xF6 == 0xF0),
    "flac": _starts(b"fLaC"),
    "mp4": _iso_media,
    "m4v": _iso_media,
    "webm": _starts(b"\x1a\x45\xdf\xa3"),
    "mov": lambda head: head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip", b"pnot"),
}


def binary_content_mismatches(diff, read_head):
    """Head-side paths of an expected binary type whose content does not start like that type, or
    cannot be read (fail closed). read_head(path) returns the file's first bytes at the PR head. A
    deleted file (head side /dev/null) is not read."""
    paths = set()
    for match in _BINARY_DIFF_RE.finditer(diff or ""):
        path = _binary_side_path(match.group(2))
        if path is None or _extension(path) not in BINARY_SIGNATURES:
            continue
        try:
            head = read_head(path)
        except Exception:
            head = None
        if not head or not BINARY_SIGNATURES[_extension(path)](head):
            paths.add(path)
    return sorted(paths)


def git_head_reader(sha, length=64):
    """read_head for binary_content_mismatches: the first bytes of <sha>:<path> from the local git
    objects (the workflow fetches the PR commits and never checks them out). Reads only `length`
    bytes; a missing object yields b"", which the caller treats as a mismatch."""
    def read_head(path):
        process = subprocess.Popen(["git", "cat-file", "blob", f"{sha}:{path}"],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            return process.stdout.read(length)
        finally:
            process.stdout.close()
            process.kill()
            process.wait()
    return read_head


UNREVIEWED_BINARY_OUTCOME = {
    "kind": "incomplete_evidence",
    "status_state": "failure",
    "status_description": "Codex review APPROVE withheld: a non-media file diffs as binary (needs human)",
    "human_label": "Unreviewed binary content",
}


def guarded_outcome(review, diff, binary_diff=None, read_head=None):
    """Per-run outcome with the prompt-injection guard applied: an APPROVE whose
    diff carries verdict-steering text is withheld and fails closed.

    binary_diff is the UNTRUNCATED diff for the binary guard: the bounded diff the reviewer sees is
    cut at a size cap, and a hidden file past the cut must still withhold an APPROVE. read_head (see
    binary_content_mismatches) also checks that each expected-type binary file is that type."""
    outcome = review_outcome(review)
    if outcome["kind"] == "approved" and diff_has_injection(diff):
        return {
            "kind": "suspected_prompt_injection",
            "status_state": "failure",
            "status_description": "Codex review APPROVE withheld: possible prompt-injection in the diff (needs human)",
            "human_label": "Suspected prompt-injection",
        }
    if outcome["kind"] == "approved" and unreviewable_binary_paths(diff if binary_diff is None else binary_diff, read_head):
        return dict(UNREVIEWED_BINARY_OUTCOME)
    return outcome


def _is_approve(outcome):
    return outcome["kind"] == "approved"


def converge(outcomes):
    """Fold 1..3 per-run guarded outcomes into one final outcome.

    Policy ("confirm both directions"): with two runs, both must agree; a split
    with no third run fails closed. With three runs, the majority wins (three
    binary votes always yield a 2-1 majority).
    """
    votes = [_is_approve(o) for o in outcomes]
    approve_count = sum(votes)
    n = len(outcomes)

    if n >= 3:
        final_is_approve = approve_count >= 2
        reason = f"{approve_count}/{n} approve (majority)"
    elif n == 2:
        if approve_count == 2:
            final_is_approve, reason = True, "2/2 approve"
        elif approve_count == 0:
            final_is_approve, reason = False, "2/2 block"
        else:
            # Should not happen: the workflow runs a tiebreaker on a split. If it
            # ever reaches here (e.g. the third run failed to materialize), fail
            # closed rather than trust a coin-flip verdict.
            return (
                {
                    "kind": "unconverged_split",
                    "status_state": "failure",
                    "status_description": "Codex review did not converge (1-1 split, no tiebreaker); needs human",
                    "human_label": "Unconverged - needs human",
                },
                "1-1 split, no tiebreaker: fail-closed",
                approve_count,
            )
    else:  # n == 1 (claude-deep / blocked routes, or a single-run fallback)
        final_is_approve, reason = votes[0], "single run"

    if final_is_approve:
        final = next(o for o in outcomes if _is_approve(o))
    else:
        blockers = [o for o in outcomes if not _is_approve(o)]
        final = min(blockers, key=lambda o: _BLOCK_PRIORITY.get(o["kind"], 99))
    return final, reason, approve_count


def _load(path):
    return json.loads(pathlib.Path(path).read_text())


def _read_diff(diff_path):
    if not diff_path:
        return ""
    try:
        return pathlib.Path(diff_path).read_text()
    except OSError:
        return ""


def _sha256_file(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def _sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _synthetic_review(verdict, head_sha, finding):
    return {
        "verdict": verdict,
        "head_sha": head_sha,
        "findings": [finding],
        "checks_run": {"register_drift": "n/a", "modes": "n/a", "ci": "n/a"},
        "resolved_from_prior_loop": [],
    }


def _verdict_for_outcome(outcome):
    if outcome["kind"] == "approved":
        return "APPROVE"
    if outcome["kind"] == "requires_attention":
        return "REQUEST_CHANGES"
    return "NEEDS_HUMAN"


def _review_with_appended_finding(review, outcome, finding):
    body = json.loads(json.dumps(review))
    body["verdict"] = _verdict_for_outcome(outcome)
    body.setdefault("checks_run", {"register_drift": "n/a", "modes": "n/a", "ci": "n/a"})
    body.setdefault("resolved_from_prior_loop", [])
    findings = body.get("findings")
    if not isinstance(findings, list):
        findings = []
    findings.append(finding)
    body["findings"] = findings
    return body


def _path_coverage_finding(head_sha, description, evidence):
    return {
        "id": "EVIDENCE-1",
        "severity": "HIGH",
        "category": "path_coverage",
        "file": "(diff-wide)",
        "line": None,
        "description": description,
        "evidence": evidence,
        "suggested_fix": "Route this PR to human review or reduce/split the diff so CI can provide complete review evidence.",
        "verifiable_check": "python3 scripts/codex-review-build-envelope.py --manifest ...",
    }


def _load_policy():
    try:
        return json.loads(pathlib.Path(".github/codex/evidence-policy.json").read_text())
    except OSError:
        return {"max_chunks": 0, "excluded_paths": [], "approval_safe_classes": []}


def _approval_safe_exclusion(path, policy):
    for entry in policy.get("approval_safe_classes", []):
        if re.search(entry["pattern"], path):
            return True
    return False


def _strip_synthesis_review(review):
    findings = []
    for finding in review.get("findings", []):
        clean = {key: value for key, value in finding.items() if key != "related_chunk_ids"}
        findings.append(clean)
    return {
        "verdict": review.get("verdict"),
        "head_sha": review.get("head_sha"),
        "findings": findings,
        "checks_run": review.get("checks_run", {"register_drift": "n/a", "modes": "n/a", "ci": "n/a"}),
        "resolved_from_prior_loop": review.get("resolved_from_prior_loop", []),
    }


def _git_changed_paths(base_sha, head_sha):
    try:
        output = subprocess.run(
            [
                "git",
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
                "diff",
                "--no-color",
                "--no-ext-diff",
                "--no-textconv",
                "--find-renames=50%",
                "--name-only",
                f"{base_sha}...{head_sha}",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return {line for line in output.splitlines() if line}


def validate_chunked_evidence(manifest_path, evidence_dir, chunk_review_paths, synthesis_paths, full_diff,
                              read_head=None):
    manifest = _load(manifest_path)
    policy = _load_policy()
    errors = []
    head_sha = os.environ["HEAD_SHA"]

    if manifest.get("head_sha") != head_sha:
        errors.append(f"manifest head_sha {manifest.get('head_sha')} != CI HEAD_SHA {head_sha}")
    if manifest.get("base_sha") != os.environ["BASE_SHA"]:
        errors.append("manifest base_sha does not match CI BASE_SHA")
    if manifest.get("full_raw_diff_sha256") != _sha256_text(full_diff):
        errors.append("full raw diff hash does not match manifest")
    if len(manifest.get("chunks", [])) > int(policy.get("max_chunks", 0)):
        errors.append("manifest has more chunks than trusted policy allows")
    if manifest.get("incomplete_coverage"):
        errors.append(f"manifest reports incomplete coverage: {manifest.get('incomplete_coverage')}")

    expected_chunks = {chunk["id"]: chunk for chunk in manifest.get("chunks", [])}
    covered = set()
    excluded = {entry["path"] for entry in manifest.get("excluded_paths", [])}
    for path in excluded:
        if not _approval_safe_exclusion(path, policy):
            errors.append(f"excluded path is not approval-safe under trusted policy: {path}")
    for chunk in manifest.get("chunks", []):
        chunk_path = pathlib.Path(evidence_dir) / chunk["path"]
        if not chunk_path.exists():
            errors.append(f"missing chunk file {chunk['path']}")
            continue
        actual = _sha256_file(chunk_path)
        if actual != chunk.get("raw_sha256"):
            errors.append(f"chunk {chunk['id']} hash mismatch")
        for item in chunk.get("coverage", []):
            covered.add(item.get("path"))
    changed = {entry["path"] for entry in manifest.get("changed_files", [])}
    git_changed = _git_changed_paths(os.environ["BASE_SHA"], os.environ["HEAD_SHA"])
    if git_changed is not None and changed != git_changed:
        errors.append(f"manifest changed_files mismatch git diff: missing={sorted(git_changed - changed)} extra={sorted(changed - git_changed)}")
    if not changed.issubset(covered | excluded):
        errors.append(f"changed-file coverage mismatch: {sorted(changed - covered - excluded)}")

    by_chunk = {}
    extra = []
    for path in chunk_review_paths:
        review = _load(path)
        cid = review.get("chunk_id")
        if cid not in expected_chunks:
            extra.append(cid)
            continue
        if review.get("head_sha") != head_sha:
            errors.append(f"review {path} head_sha mismatch")
        if review.get("chunk_hash") != expected_chunks[cid].get("raw_sha256"):
            errors.append(f"review {path} chunk_hash mismatch")
        by_chunk.setdefault(cid, []).append(review)
    if extra:
        errors.append(f"extra chunk reviews not in manifest: {extra}")
    missing = set(expected_chunks) - set(by_chunk)
    if missing:
        errors.append(f"missing chunk reviews: {sorted(missing)}")

    if not manifest.get("coverage_complete"):
        errors.append("manifest coverage_complete is false")

    chunk_blockers = []
    for cid, reviews in by_chunk.items():
        chunk_diff = ""
        chunk_path = pathlib.Path(evidence_dir) / expected_chunks[cid]["path"]
        if chunk_path.exists():
            chunk_diff = chunk_path.read_text()
        outcomes = [guarded_outcome(review, chunk_diff) for review in reviews]
        if all(_is_approve(outcome) for outcome in outcomes) and len(outcomes) < 2:
            errors.append(f"chunk {cid} approved without convergence")
        final, reason, _ = converge(outcomes)
        if final["kind"] != "approved":
            decisive_index = next(
                (i for i, outcome in enumerate(outcomes) if outcome["kind"] == final["kind"]),
                len(outcomes) - 1,
            )
            chunk_blockers.append(
                {
                    "chunk_id": cid,
                    "outcome": final,
                    "reason": reason,
                    "review": reviews[decisive_index],
                }
            )

    synthesis_outcomes = []
    synthesis_reviews = []
    for path in synthesis_paths:
        review = _load(path)
        if review.get("head_sha") != head_sha:
            errors.append(f"synthesis {path} head_sha mismatch")
        if review.get("coverage_complete") is False:
            errors.append(f"synthesis {path} coverage_complete is false")
        if review.get("chunk_results_complete") is False:
            errors.append(f"synthesis {path} chunk_results_complete is false")
        synthesis_reviews.append(review)
        # Synthesis receives model-authored chunk summaries, not raw PR diff.
        # The complete raw-diff injection guard runs below after trusted
        # evidence validation, so pass no diff here to avoid double-counting.
        synthesis_outcomes.append(guarded_outcome(_strip_synthesis_review(review), ""))
    if not synthesis_outcomes:
        errors.append("missing synthesis review")
    elif all(_is_approve(outcome) for outcome in synthesis_outcomes) and len(synthesis_outcomes) < 2:
        errors.append("synthesis approved without convergence")

    if errors:
        finding = _path_coverage_finding(head_sha, "Chunked review evidence is incomplete or mismatched.", "; ".join(errors))
        outcome = {
            "kind": "incomplete_evidence",
            "status_state": "failure",
            "status_description": "Codex review evidence incomplete (needs human)",
            "human_label": "Incomplete evidence - needs human",
        }
        return outcome, "trusted evidence validation failed", 0, _synthetic_review("NEEDS_HUMAN", head_sha, finding), None

    if chunk_blockers:
        selected = min(
            chunk_blockers,
            key=lambda item: _BLOCK_PRIORITY.get(item["outcome"]["kind"], 99),
        )
        evidence = "; ".join(f"{item['chunk_id']}: {item['outcome']['kind']} ({item['reason']})" for item in chunk_blockers)
        finding = _path_coverage_finding(head_sha, "One or more chunk reviews blocked or were inconclusive.", evidence)
        review_body = _review_with_appended_finding(selected["review"], selected["outcome"], finding)
        synthesis_body = synthesis_reviews[0] if synthesis_reviews else None
        return selected["outcome"], "chunk review blocked", 0, review_body, synthesis_body

    final, reason, approve_count = converge(synthesis_outcomes)
    decisive_index = next(
        (i for i, o in enumerate(synthesis_outcomes) if o["kind"] == final["kind"]),
        len(synthesis_outcomes) - 1,
    )
    review_body = _strip_synthesis_review(synthesis_reviews[decisive_index])
    if final["kind"] == "approved" and diff_has_injection(full_diff):
        finding = _path_coverage_finding(
            head_sha,
            "The complete raw diff contains possible prompt-injection text.",
            "Full BASE...HEAD diff matched the CI prompt-injection guard.",
        )
        outcome = {
            "kind": "suspected_prompt_injection",
            "status_state": "failure",
            "status_description": "Codex review APPROVE withheld: possible prompt-injection in the diff (needs human)",
            "human_label": "Suspected prompt-injection",
        }
        if review_body.get("findings"):
            review_body["findings"].append(finding)
        else:
            review_body = _synthetic_review("NEEDS_HUMAN", head_sha, finding)
        return outcome, "full raw diff injection guard", 0, review_body, synthesis_reviews[decisive_index]
    hidden = unreviewable_binary_paths(full_diff, read_head) if final["kind"] == "approved" else []
    if hidden:
        finding = _path_coverage_finding(
            head_sha,
            "A file that is not an expected binary type diffs as binary, so its content was not reviewed.",
            "Binary in the full BASE...HEAD diff: " + ", ".join(hidden[:20]),
        )
        if review_body.get("findings"):
            review_body["findings"].append(finding)
        else:
            review_body = _synthetic_review("NEEDS_HUMAN", head_sha, finding)
        return dict(UNREVIEWED_BINARY_OUTCOME), "full raw diff binary guard", 0, review_body, synthesis_reviews[decisive_index]
    return final, f"synthesis: {reason}", approve_count, review_body, synthesis_reviews[decisive_index]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--diff", default=None, help="bounded diff file for the injection guard")
    parser.add_argument("--full-diff", default=None, help="complete raw diff file for chunked injection guard")
    parser.add_argument(
        "--binary-scan-diff",
        default=None,
        help="untruncated diff for the binary guard on the bounded path (must be readable)",
    )
    parser.add_argument(
        "--binary-content-at",
        default=None,
        metavar="SHA",
        help="check that each expected-type binary file starts like its type, read from this commit",
    )
    parser.add_argument("--manifest", default=None, help="chunked evidence manifest")
    parser.add_argument("--evidence-dir", default=None, help="chunked evidence directory")
    parser.add_argument("--chunk-reviews", nargs="*", default=[], help="chunk review JSON files")
    parser.add_argument("--synthesis-reviews", nargs="*", default=[], help="synthesis review JSON files")
    parser.add_argument("--out", default=None, help="envelope output path")
    parser.add_argument(
        "--need-third",
        action="store_true",
        help="print 'yes'/'no' whether a 3rd tiebreak run is needed for exactly 2 reviews",
    )
    parser.add_argument("reviews", nargs="*", help="review JSON file(s), in run order")
    args = parser.parse_args()

    if not args.manifest and not args.reviews:
        parser.error("review JSON files are required unless --manifest is provided")

    diff = _read_diff(args.full_diff) if args.full_diff else _read_diff(args.diff)
    binary_diff = None
    if args.binary_scan_diff:
        # Fail closed: an unreadable file must not read as "no binary files".
        try:
            binary_diff = pathlib.Path(args.binary_scan_diff).read_text()
        except OSError as error:
            parser.error(f"--binary-scan-diff unreadable: {error.__class__.__name__}")
    read_head = git_head_reader(args.binary_content_at) if args.binary_content_at else None
    outcomes = [guarded_outcome(_load(path), diff, binary_diff, read_head) for path in args.reviews]

    if args.need_third:
        # A 3rd run is needed only when the two runs disagree.
        votes = {_is_approve(o) for o in outcomes}
        print("yes" if len(votes) > 1 else "no")
        return

    if args.manifest:
        final_outcome, reason, approve_count, review_body, synthesis_body = validate_chunked_evidence(
            args.manifest,
            args.evidence_dir,
            args.chunk_reviews,
            args.synthesis_reviews,
            diff,
            read_head,
        )
        per_run_kind = [final_outcome["kind"]]
        run_count = len(args.chunk_reviews) + len(args.synthesis_reviews)
    else:
        final_outcome, reason, approve_count = converge(outcomes)
        # The review body kept in the envelope is the run whose outcome the final
        # decision reflects, so W2's sticky comment shows a representative review.
        decisive_index = next(
            (i for i, o in enumerate(outcomes) if o["kind"] == final_outcome["kind"]),
            len(outcomes) - 1,
        )
        review_body = _load(args.reviews[decisive_index])
        per_run_kind = [o["kind"] for o in outcomes]
        run_count = len(outcomes)
        synthesis_body = None

    envelope = {
        "pr_number": int(os.environ["PR_NUMBER"]),
        "head_sha": os.environ["HEAD_SHA"],
        "base_sha": os.environ["BASE_SHA"],
        "loop_n": int(os.environ["LOOP_N"]),
        "reviewer_route": os.environ["REVIEWER_ROUTE"],
        # reviewer_route alone stopped identifying the reviewer once `codex`
        # could mean more than one model id. For a gate whose premise is a
        # registry of APPROVED reviewers, "which approved reviewer produced this
        # verdict" has to stay answerable from the artifact alone, so record the
        # per-leg model ids. Empty on the claude-deep route and on the bounded
        # (non-chunked) path, which has a single model recorded by the workflow.
        "chunk_model": os.environ.get("CODEX_CHUNK_MODEL_EFFECTIVE", ""),
        "synthesis_model": os.environ.get("CODEX_SYNTHESIS_MODEL_EFFECTIVE", ""),
        "run_id": os.environ["RUN_ID"],
        "evidence_mode": os.environ.get("CODEX_REVIEW_EVIDENCE_MODE", "bounded"),
        "review_outcome": final_outcome,
        "convergence": {
            "runs": run_count,
            "approve_votes": approve_count,
            "reason": reason,
            "per_run_kind": per_run_kind,
        },
        "status": {
            "state": final_outcome["status_state"],
            "description": final_outcome["status_description"],
            "context": "codex-review/deep-pass",
        },
        "review": review_body,
    }
    if synthesis_body is not None:
        envelope["synthesis"] = synthesis_body
    pathlib.Path(args.out).write_text(json.dumps(envelope))


if __name__ == "__main__":
    main()
