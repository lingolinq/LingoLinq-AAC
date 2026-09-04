#!/usr/bin/env python3
"""Run chunked codex-review prompts with convergence, retries, synthesis, and heartbeats."""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys


CI_MARKER_RE = re.compile(r"<!--\s*/?\s*CI_INJECT:[A-Z_]+\s*-->")

# Reviewer models. The approved-reviewer registry row for the CI `codex-review`
# gate is mirrored in .github/codex/README.md ("Approved reviewer models") so
# this citation is resolvable from inside the repo. gpt-5.6-sol is approved only
# for the interactive/local Codex row and must NOT be used here.
#
# BOTH legs run terra. An earlier version put the cheap tier on the chunk leg on
# the theory that convergence, not single-pass strength, carried reliability
# there. That was wrong, for two reasons worth recording so it is not retried:
#
#   1. Synthesis never sees the diff. Its prompt takes the manifest, chunk
#      verdicts, and the CI-computed structural index (.github/codex/
#      synthesis-prompt.md), and codex-review-build-envelope.py says it plainly:
#      "Synthesis receives model-authored chunk summaries, not raw PR diff."
#      A defect the chunk pass does not report is therefore not merely
#      unreported, it is unreachable. The chunk leg is the ONLY leg that reads
#      code, so it must carry the strongest approved model, not the weakest.
#   2. Convergence re-samples the SAME model on the SAME prompt (runs 2 and 3
#      below). That corrects sampling variance, not a systematic blind spot.
#      Three runs of a model that cannot see a subtle regression approve three
#      times and converge confidently on the wrong answer.
#
# Cost was the argument for the cheap tier and it does not hold either:
# .github/codex/evidence-policy.json caps a run at 16 chunks of ~40KB, so a
# full-terra run is single-digit dollars against the project spend limit. A
# weaker model also drives invocation count UP, not down, because run 2 fires
# only on APPROVE and run 3 only on self-disagreement.
#
# Deliberately NOT runtime-overridable. An earlier revision of this change read
# both ids from repo variables so a bad pin could be corrected without shipping a
# PR through the gate the pin was breaking. Review rejected that: a repo variable
# is settable with no PR and no review, so the hatch let anyone move the
# code-reading leg onto a weaker model, silently and with no approval, which is
# the exact defect this file exists to prevent. A convenience lever that can
# disable the control it protects is worth less than the control.
#
# If terra itself ever becomes unusable, the levers that remain are
# CODEX_REVIEW_EVIDENCE_MODE=bounded, CODEX_REVIEW_CHUNKED_SCOPE=none, and the
# documented admin exception. Changing a reviewer model stays a reviewed change.
DEFAULT_CHUNK_MODEL = "gpt-5.6-terra"
DEFAULT_SYNTHESIS_MODEL = "gpt-5.6-terra"

CHUNK_MODEL = DEFAULT_CHUNK_MODEL
SYNTHESIS_MODEL = DEFAULT_SYNTHESIS_MODEL


def defang_ci_markers(body):
    return CI_MARKER_RE.sub(
        lambda m: m.group(0).replace("<!--", "[[").replace("-->", "]]"),
        body,
    )


def replace_block(text, marker, body):
    start = f"<!-- CI_INJECT:{marker} -->"
    end = f"<!-- /CI_INJECT:{marker} -->"
    start_idx = text.index(start)
    end_idx = text.index(end) + len(end)
    return text[:start_idx] + start + "\n" + defang_ci_markers(body) + "\n" + end + text[end_idx:]


def load_json(path):
    return json.loads(pathlib.Path(path).read_text())


def valid_json(path):
    try:
        load_json(path)
        return True
    except Exception:
        return False


def review_kind(review):
    verdict = str(review.get("verdict", "")).upper()
    if verdict == "APPROVE":
        return "approved"
    if verdict == "NEEDS_HUMAN":
        return "inconclusive"
    return "blocked"


def needs_tiebreak(paths):
    kinds = {review_kind(load_json(path)) == "approved" for path in paths}
    return len(kinds) > 1


def choose_decisive_path(paths):
    return pathlib.Path(chunk_result_group(paths)["decisive_path"])


def chunk_result_group(paths):
    reviews = [load_json(path) for path in paths]
    kinds = [review_kind(review) for review in reviews]
    approvals = [kind == "approved" for kind in kinds]
    approve_count = sum(approvals)
    if len(paths) >= 3:
        final_approve = approve_count >= 2
        reason = f"{approve_count}/{len(paths)} approve (majority)"
    elif len(paths) == 2:
        final_approve = approve_count == 2
        reason = "2/2 approve" if final_approve else "2/2 block"
    else:
        final_approve = approvals[0]
        reason = "single run"
    decisive_index = len(paths) - 1
    for path, is_approve in zip(paths, approvals):
        if is_approve == final_approve:
            decisive_index = paths.index(path)
            break
    decisive_review = reviews[decisive_index]
    return {
        "chunk_id": decisive_review.get("chunk_id"),
        "chunk_hash": decisive_review.get("chunk_hash"),
        "decisive_path": str(paths[decisive_index]),
        "convergence": {
            "final_kind": kinds[decisive_index],
            "reason": reason,
            "approve_count": approve_count,
            "run_count": len(paths),
        },
        "runs": [
            {
                "path": str(path),
                "kind": kind,
                "review": review,
            }
            for path, kind, review in zip(paths, kinds, reviews)
        ],
    }


def heartbeat(args, description):
    if not args.heartbeat:
        return
    subprocess.run(
        [
            "gh",
            "api",
            f"repos/{args.repository}/statuses/{args.head_sha}",
            "-f",
            "state=pending",
            "-f",
            "context=codex-review/deep-pass",
            "-f",
            f"description={description[:140]}",
            "-f",
            f"target_url={args.run_url}",
        ],
        check=False,
    )


def run_model(args, prompt_path, schema_path, output_path, heartbeat_description=None, *, model):
    command = [
        "codex",
        "exec",
        "--sandbox",
        "read-only",
        "-m",
        model,
        "--output-schema",
        str(schema_path),
        "--output-last-message",
        str(output_path),
    ]
    if heartbeat_description:
        heartbeat(args, heartbeat_description)
    with open(prompt_path, "rb") as stdin:
        result = subprocess.run(command, stdin=stdin)
    if result.returncode != 0 or not valid_json(output_path):
        if heartbeat_description:
            heartbeat(args, f"{heartbeat_description} retry")
        strict = pathlib.Path(str(prompt_path) + ".strict.md")
        strict.write_text(pathlib.Path(prompt_path).read_text() + "\n\nOutput ONLY the JSON object. No prose, no markdown fences.\n")
        with open(strict, "rb") as stdin:
            result = subprocess.run(command, stdin=stdin)
    return result.returncode == 0 and valid_json(output_path)


def write_invalid_review(path, head_sha, chunk=None, reason="model call failed or emitted invalid JSON"):
    if chunk:
        body = {
            "verdict": "NEEDS_HUMAN",
            "head_sha": head_sha,
            "chunk_id": chunk["id"],
            "chunk_hash": chunk["raw_sha256"],
            "findings": [
                {
                    "id": f"{chunk['id']}-STRUCTURAL-FAILURE",
                    "severity": "HIGH",
                    "category": "live_state",
                    "file": "(chunk)",
                    "line": None,
                    "description": "The chunk reviewer did not produce a valid schema-conforming result.",
                    "evidence": reason,
                    "suggested_fix": "Rerun the codex-review job or route to human review.",
                    "verifiable_check": "scripts/codex-review-run-chunks.py",
                }
            ],
            "reviewed_structural_index": [],
        }
    else:
        body = {
            "verdict": "NEEDS_HUMAN",
            "head_sha": head_sha,
            "coverage_complete": False,
            "chunk_results_complete": False,
            "findings": [
                {
                    "id": "SYNTHESIS-STRUCTURAL-FAILURE",
                    "severity": "HIGH",
                    "category": "live_state",
                    "file": "(synthesis)",
                    "line": None,
                    "description": "The synthesis reviewer did not produce a valid schema-conforming result.",
                    "evidence": reason,
                    "suggested_fix": "Rerun the codex-review job or route to human review.",
                    "verifiable_check": "scripts/codex-review-run-chunks.py",
                    "related_chunk_ids": [],
                }
            ],
            "checks_run": {"register_drift": "n/a", "modes": "n/a", "ci": "n/a"},
            "resolved_from_prior_loop": [],
            "cross_file_notes": [],
            "dedupe_notes": [],
        }
    pathlib.Path(path).write_text(json.dumps(body, indent=2, sort_keys=True))


def build_chunk_prompt(template, live_state, manifest_md, prior_loop, chunk, evidence_dir, out_path):
    chunk_body = pathlib.Path(evidence_dir, chunk["path"]).read_text()
    chunk_header = (
        f"Chunk ID: {chunk['id']}\n"
        f"Raw SHA-256: {chunk['raw_sha256']}\n"
        f"Prompt SHA-256: {chunk['prompt_sha256']}\n"
        f"Coverage: {json.dumps(chunk['coverage'], sort_keys=True)}\n\n"
    )
    prompt = template
    prompt = replace_block(prompt, "LIVE_STATE", live_state)
    prompt = replace_block(prompt, "MANIFEST", manifest_md)
    prompt = replace_block(prompt, "CHUNK", chunk_header + chunk_body)
    prompt = replace_block(prompt, "PRIOR_LOOP", prior_loop)
    pathlib.Path(out_path).write_text(prompt)


def build_synthesis_prompt(template, live_state, manifest_md, prior_loop, chunk_result_groups, out_path):
    payload = []
    for group in chunk_result_groups:
        if isinstance(group, dict):
            payload.append(group)
        else:
            payload.append(chunk_result_group([group]))
    prompt = template
    prompt = replace_block(prompt, "LIVE_STATE", live_state)
    prompt = replace_block(prompt, "MANIFEST", manifest_md)
    prompt = replace_block(prompt, "CHUNK_RESULTS", json.dumps(payload, indent=2, sort_keys=True))
    prompt = replace_block(prompt, "PRIOR_LOOP", prior_loop)
    pathlib.Path(out_path).write_text(prompt)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--live-state-file", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--prior-loop-file")
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--run-url", default="")
    parser.add_argument("--heartbeat", action="store_true")
    args = parser.parse_args()

    evidence_dir = pathlib.Path(args.evidence_dir)
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_json(evidence_dir / "manifest.json")
    manifest_md = (evidence_dir / "manifest.md").read_text()
    live_state = pathlib.Path(args.live_state_file).read_text()
    prior_loop = pathlib.Path(args.prior_loop_file).read_text() if args.prior_loop_file else "N/A (loop 0 - first pass)."
    chunk_template = pathlib.Path(".github/codex/chunk-review-prompt.md").read_text()
    synthesis_template = pathlib.Path(".github/codex/synthesis-prompt.md").read_text()

    chunk_result_paths = []
    canonical_chunk_result_paths = []
    chunk_result_groups = []
    for index, chunk in enumerate(manifest["chunks"], 1):
        prompt_path = out_dir / f"{chunk['id']}-prompt.md"
        build_chunk_prompt(chunk_template, live_state, manifest_md, prior_loop, chunk, evidence_dir, prompt_path)
        run_paths = []
        first_output = out_dir / f"{chunk['id']}-review-1.json"
        if not run_model(
            args,
            prompt_path,
            ".github/codex/chunk-review-schema.json",
            first_output,
            f"Codex review running chunk {index}/{len(manifest['chunks'])} run 1",
            model=CHUNK_MODEL,
        ):
            write_invalid_review(first_output, args.head_sha, chunk)
        run_paths.append(first_output)

        first_kind = review_kind(load_json(first_output))
        if first_kind == "approved":
            second_output = out_dir / f"{chunk['id']}-review-2.json"
            if not run_model(
                args,
                prompt_path,
                ".github/codex/chunk-review-schema.json",
                second_output,
                f"Codex review running chunk {index}/{len(manifest['chunks'])} run 2",
                model=CHUNK_MODEL,
            ):
                write_invalid_review(second_output, args.head_sha, chunk)
            run_paths.append(second_output)
            if needs_tiebreak(run_paths):
                third_output = out_dir / f"{chunk['id']}-review-3.json"
                if not run_model(
                    args,
                    prompt_path,
                    ".github/codex/chunk-review-schema.json",
                    third_output,
                    f"Codex review running chunk {index}/{len(manifest['chunks'])} run 3",
                    model=CHUNK_MODEL,
                ):
                    write_invalid_review(third_output, args.head_sha, chunk)
                run_paths.append(third_output)
        chunk_result_paths.extend(run_paths)
        canonical_chunk_result_paths.append(choose_decisive_path(run_paths))
        chunk_result_groups.append(chunk_result_group(run_paths))

    synthesis_prompt = out_dir / "synthesis-prompt.md"
    build_synthesis_prompt(synthesis_template, live_state, manifest_md, prior_loop, chunk_result_groups, synthesis_prompt)
    synthesis_paths = []
    synthesis_1 = out_dir / "synthesis-1.json"
    if not run_model(args, synthesis_prompt, ".github/codex/synthesis-schema.json", synthesis_1, "Codex review running synthesis run 1", model=SYNTHESIS_MODEL):
        write_invalid_review(synthesis_1, args.head_sha)
    synthesis_paths.append(synthesis_1)
    if review_kind(load_json(synthesis_1)) == "approved":
        synthesis_2 = out_dir / "synthesis-2.json"
        if not run_model(args, synthesis_prompt, ".github/codex/synthesis-schema.json", synthesis_2, "Codex review running synthesis run 2", model=SYNTHESIS_MODEL):
            write_invalid_review(synthesis_2, args.head_sha)
        synthesis_paths.append(synthesis_2)
        if needs_tiebreak(synthesis_paths):
            synthesis_3 = out_dir / "synthesis-3.json"
            if not run_model(args, synthesis_prompt, ".github/codex/synthesis-schema.json", synthesis_3, "Codex review running synthesis run 3", model=SYNTHESIS_MODEL):
                write_invalid_review(synthesis_3, args.head_sha)
            synthesis_paths.append(synthesis_3)

    summary = {
        # Recorded so the envelope (and therefore the audit artifact) can name
        # which approved reviewer model actually produced this verdict.
        "chunk_model": CHUNK_MODEL,
        "synthesis_model": SYNTHESIS_MODEL,
        "chunk_reviews": [str(path) for path in chunk_result_paths],
        "canonical_chunk_reviews": [str(path) for path in canonical_chunk_result_paths],
        "chunk_result_groups": chunk_result_groups,
        "synthesis_reviews": [str(path) for path in synthesis_paths],
    }
    (out_dir / "run-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True))
    print(json.dumps(summary))


if __name__ == "__main__":
    sys.exit(main())
