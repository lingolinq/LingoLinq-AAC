#!/usr/bin/env bash
#
# codex-review-one-chunk.sh -- review ONE diff chunk.
#
# Assembles the prompt for a single chunk and runs the reviewer over it: the
# codex convergence loop (2 runs + a conditional tiebreaker) on the `codex`
# route, or a single Claude Sonnet pass on the `claude-deep` route. Writes the
# per-chunk review JSON files that codex-review-assemble-manifest.py later folds.
#
# codex-review.yml invokes this in a BOUNDED-PARALLEL pool (find ... | xargs -P
# N) so a large PR's chunks are reviewed in a few waves instead of one long
# serial run that could hit the 30-min codex-watchdog limit. Each chunk is
# independent -- unique prompt/review filenames keyed by the chunk index, no
# shared mutable state -- so parallel invocations never collide. Parallel
# `codex exec` processes only READ the shared CODEX_HOME auth written once by
# the Authenticate step, which is safe.
#
# USAGE
#   codex-review-one-chunk.sh <chunk-file>
#
# ENV (set by codex-review.yml; inherited by every pooled invocation)
#   REVIEWER_ROUTE   codex | claude-deep
#   REVIEWS_DIR      dir for chunk-<idx>-run-<n>.json  (default /tmp/reviews)
#   PROMPTS_DIR      dir for the assembled per-chunk prompt (default /tmp)
#   LIVE_STATE, LOOP_N          consumed by codex-review-assemble-prompt.py
#   CODEX_HOME                  codex route: codex CLI auth/home
#   ANTHROPIC_API_KEY           claude-deep route: consumed by claude-deep.sh
set -euo pipefail

CHUNK="${1:?usage: $0 <chunk-file>}"
REVIEWS_DIR="${REVIEWS_DIR:-/tmp/reviews}"
PROMPTS_DIR="${PROMPTS_DIR:-/tmp}"

# chunk-07.txt -> 07 (matches the chunk-<idx>-run-<n>.json naming the manifest
# assembler globs with %02d).
idx="$(basename "$CHUNK" .txt | sed 's/^chunk-//')"
PROMPT="${PROMPTS_DIR}/prompt-${idx}.md"

PR_DIFF="$(cat "$CHUNK")" python3 scripts/codex-review-assemble-prompt.py "$PROMPT"

run_codex() {
  # $1 = output path for this run's review JSON
  codex exec \
    --sandbox read-only \
    -m gpt-5.5 \
    --output-schema .github/codex/review-schema.json \
    --output-last-message "$1" \
    < "$PROMPT"
  # Fallback per build spec section 6: one retry with a stricter instruction if
  # the model still emitted invalid JSON despite --output-schema.
  if ! python3 -c "import json, sys; json.load(open(sys.argv[1]))" "$1" 2>/dev/null; then
    echo "chunk ${idx}: run produced invalid JSON; retrying with stricter instruction." >&2
    { cat "$PROMPT"; echo ""; echo "Output ONLY the JSON object. No prose, no markdown fences."; } \
      | codex exec --sandbox read-only -m gpt-5.5 \
          --output-schema .github/codex/review-schema.json \
          --output-last-message "$1"
  fi
}

case "$REVIEWER_ROUTE" in
  codex)
    # Per-chunk convergence ("confirm both directions"): run twice, require
    # agreement; on disagreement run a third tiebreaker (majority decides).
    # --need-third decides against THIS chunk's diff and applies the injection
    # guard, so two APPROVEs over an injection-bearing chunk both become blocks
    # and agree -- converging straight to fail-closed without a wasted 3rd run.
    run_codex "${REVIEWS_DIR}/chunk-${idx}-run-1.json"
    run_codex "${REVIEWS_DIR}/chunk-${idx}-run-2.json"
    NEED_THIRD="$(python3 scripts/codex-review-build-envelope.py --need-third --diff "$CHUNK" \
      "${REVIEWS_DIR}/chunk-${idx}-run-1.json" "${REVIEWS_DIR}/chunk-${idx}-run-2.json")"
    echo "chunk ${idx}: third tiebreaker needed? ${NEED_THIRD}"
    if [ "$NEED_THIRD" = "yes" ]; then
      run_codex "${REVIEWS_DIR}/chunk-${idx}-run-3.json"
    fi
    ;;
  claude-deep)
    # Single pass per chunk: the compliance-path fallback is not
    # convergence-looped. build-envelope treats one review per chunk as a no-op
    # convergence and still folds across chunks fail-closed.
    scripts/codex-review-claude-deep.sh "$PROMPT" .github/codex/review-schema.json \
      "${REVIEWS_DIR}/chunk-${idx}-run-1.json"
    ;;
  *)
    echo "codex-review-one-chunk.sh: unexpected REVIEWER_ROUTE '${REVIEWER_ROUTE}'" >&2
    exit 1
    ;;
esac
