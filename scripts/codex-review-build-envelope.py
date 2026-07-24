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

A large PR is reviewed in several passes: the diff is split into file-boundary
chunks (see codex-review-chunk-diff.py), each chunk is convergence-reviewed on
its own, and the per-chunk verdicts are folded ACROSS chunks fail-closed --
APPROVE only when every chunk approves; otherwise the highest-priority blocker
wins. This is a conjunction, not a vote: one blocked chunk blocks the PR.

Usage:
  # Single-diff (one chunk): build the envelope from 1..3 review files:
  codex-review-build-envelope.py --diff <diff-file> --out <envelope-file> <review.json>...
  # Chunked: fold convergence within each chunk, then across chunks:
  codex-review-build-envelope.py --manifest <manifest.json> --out <envelope-file>
  # Decide whether a 3rd (tiebreak) run is needed for exactly 2 review files:
  codex-review-build-envelope.py --need-third --diff <diff-file> <review1.json> <review2.json>

The chunked manifest is JSON: {"chunks": [{"diff": <chunk-file>,
"reviews": [<review.json>, ...]}, ...]} -- one entry per chunk/pass, each with
that chunk's own diff (for the per-chunk injection guard) and its convergence
runs.

Envelope path reads PR_NUMBER, HEAD_SHA, BASE_SHA, LOOP_N, REVIEWER_ROUTE,
RUN_ID from env.
"""
import argparse
import json
import os
import pathlib
import re


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


def guarded_outcome(review, diff):
    """Per-run outcome with the prompt-injection guard applied: an APPROVE whose
    diff carries verdict-steering text is withheld and fails closed."""
    outcome = review_outcome(review)
    if outcome["kind"] == "approved" and diff_has_injection(diff):
        return {
            "kind": "suspected_prompt_injection",
            "status_state": "failure",
            "status_description": "Codex review APPROVE withheld: possible prompt-injection in the diff (needs human)",
            "human_label": "Suspected prompt-injection",
        }
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


def fold_across_chunks(chunk_finals):
    """Fold per-chunk converged outcomes into one PR-wide outcome.

    Cross-chunk semantics are a CONJUNCTION, not a vote: the reviewer saw the
    whole change set only by seeing every chunk, so the PR is APPROVE only when
    every chunk approves. Any single blocked chunk blocks the PR (fail-closed),
    and the highest-priority blocker is surfaced. Returns
    (final_outcome, reason, approve_chunk_count).
    """
    n = len(chunk_finals)
    approve_count = sum(1 for o in chunk_finals if _is_approve(o))
    if n == 0:
        # No chunks at all (empty diff). Nothing to review is not an approval:
        # fail closed rather than green-light on absent evidence.
        return (
            {
                "kind": "unconverged_split",
                "status_state": "failure",
                "status_description": "Codex review produced no diff chunks; needs human",
                "human_label": "No chunks - needs human",
            },
            "no chunks",
            0,
        )
    if approve_count == n:
        final = next(o for o in chunk_finals if _is_approve(o))
        return final, f"{n}/{n} chunks approve", approve_count
    blockers = [o for o in chunk_finals if not _is_approve(o)]
    final = min(blockers, key=lambda o: _BLOCK_PRIORITY.get(o["kind"], 99))
    return final, f"{approve_count}/{n} chunks approve ({len(blockers)} blocked)", approve_count


def _load(path):
    return json.loads(pathlib.Path(path).read_text())


def _read_diff(diff_path):
    if not diff_path:
        return ""
    try:
        return pathlib.Path(diff_path).read_text()
    except OSError:
        return ""


def _decisive_index(outcomes, final_outcome):
    """Index of the run/chunk whose outcome the final decision reflects, so the
    envelope's kept review body is representative of the verdict."""
    return next(
        (i for i, o in enumerate(outcomes) if o["kind"] == final_outcome["kind"]),
        len(outcomes) - 1,
    )


def _write_envelope(out_path, final_outcome, convergence, decisive_review):
    envelope = {
        "pr_number": int(os.environ["PR_NUMBER"]),
        "head_sha": os.environ["HEAD_SHA"],
        "base_sha": os.environ["BASE_SHA"],
        "loop_n": int(os.environ["LOOP_N"]),
        "reviewer_route": os.environ["REVIEWER_ROUTE"],
        "run_id": os.environ["RUN_ID"],
        "review_outcome": final_outcome,
        "convergence": convergence,
        "status": {
            "state": final_outcome["status_state"],
            "description": final_outcome["status_description"],
            "context": "codex-review/deep-pass",
        },
        "review": decisive_review,
    }
    pathlib.Path(out_path).write_text(json.dumps(envelope))


def _build_from_single(args):
    diff = _read_diff(args.diff)
    outcomes = [guarded_outcome(_load(path), diff) for path in args.reviews]
    final_outcome, reason, approve_count = converge(outcomes)
    decisive_review = _load(args.reviews[_decisive_index(outcomes, final_outcome)])
    convergence = {
        "runs": len(outcomes),
        "approve_votes": approve_count,
        "reason": reason,
        "per_run_kind": [o["kind"] for o in outcomes],
    }
    _write_envelope(args.out, final_outcome, convergence, decisive_review)


def _build_from_manifest(args):
    """Chunked path: converge within each chunk, then fold across chunks."""
    manifest = _load(args.manifest)
    chunk_specs = manifest.get("chunks", [])

    chunk_finals = []
    chunk_decisive_reviews = []
    per_chunk = []
    for spec in chunk_specs:
        chunk_diff = _read_diff(spec.get("diff"))
        review_paths = spec["reviews"]
        outcomes = [guarded_outcome(_load(p), chunk_diff) for p in review_paths]
        chunk_final, chunk_reason, chunk_votes = converge(outcomes)
        chunk_finals.append(chunk_final)
        chunk_decisive_reviews.append(
            _load(review_paths[_decisive_index(outcomes, chunk_final)])
        )
        per_chunk.append(
            {
                "runs": len(outcomes),
                "approve_votes": chunk_votes,
                "reason": chunk_reason,
                "kind": chunk_final["kind"],
            }
        )

    final_outcome, reason, approve_chunks = fold_across_chunks(chunk_finals)
    decisive_chunk = _decisive_index(chunk_finals, final_outcome)
    decisive_review = (
        chunk_decisive_reviews[decisive_chunk] if chunk_decisive_reviews else {}
    )
    convergence = {
        "chunks": len(chunk_finals),
        "approve_chunks": approve_chunks,
        "reason": reason,
        "per_chunk_kind": [o["kind"] for o in chunk_finals],
        "per_chunk": per_chunk,
    }
    _write_envelope(args.out, final_outcome, convergence, decisive_review)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--diff", default=None, help="bounded diff file for the injection guard")
    parser.add_argument("--manifest", default=None, help="chunk manifest JSON (chunked path)")
    parser.add_argument("--out", default=None, help="envelope output path")
    parser.add_argument(
        "--need-third",
        action="store_true",
        help="print 'yes'/'no' whether a 3rd tiebreak run is needed for exactly 2 reviews",
    )
    parser.add_argument("reviews", nargs="*", help="review JSON file(s), in run order")
    args = parser.parse_args()

    if args.need_third:
        # A 3rd run is needed only when the two runs disagree. Operates on one
        # chunk's two runs against that chunk's diff.
        diff = _read_diff(args.diff)
        outcomes = [guarded_outcome(_load(path), diff) for path in args.reviews]
        votes = {_is_approve(o) for o in outcomes}
        print("yes" if len(votes) > 1 else "no")
        return

    if args.manifest:
        _build_from_manifest(args)
    else:
        _build_from_single(args)


if __name__ == "__main__":
    main()
