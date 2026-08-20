#!/usr/bin/env bash
# ai-endpoint-guard.sh
#
# CI guard: every runtime AI (Tier 1) seam must egress to Claude via AWS Bedrock
# (the AiClient path), never a direct Anthropic, Gemini, or other vendor endpoint.
# Bedrock keeps inference inside AWS's HIPAA-eligible service boundary, covered by
# the AWS account BAA (docs/legal/AWS_BAA_ACCEPTED.md); a direct vendor endpoint is
# a separate third-party egress with its own BAA and is intentionally not
# constructed at runtime.
#
# WHY THIS IS A DISCOVERED SCOPE, NOT A FILE LIST
# -----------------------------------------------
# This guard used to iterate a hardcoded four-file SEAMS array. That made it an
# allowlist: a NEWLY ADDED runtime AI file was simply absent from the array, so CI
# went green on it and the "no runtime seam constructs a direct client" claim that
# ten docs/legal/ records repeat could silently stop being true (finding
# LL-1189af1b3c). The scope is now DERIVED from the tree on every run, so a new
# runtime file is covered the moment it exists, with no edit to this script.
#
# RUNTIME SCOPE (what is scanned)
#   Every Ruby file (.rb AND .rake) under app/, lib/ and config/ -- the server-side
#   runtime plane, the only place that can read a server credential or open a
#   server-side egress. .rake is in scope because lib/tasks/generate_predictions.rake
#   already drives AiPredictionGenerator: a rake task is runtime code that runs in
#   the production container, not tooling.
#   Deliberately EXCLUDED, each for a stated reason:
#     - scripts/**            reviewer-only Tier 2 tooling (codex-review and
#                             friends) legitimately reads ANTHROPIC_API_KEY; it
#                             reviews diffs, never user data. Scanning it would
#                             force a bypass that hollows out the guard.
#     - spec/, test/, *_spec.rb, *_test.rb
#                             tests stub and delete these names on purpose.
#     - app/frontend/**       the Ember app; no Ruby, ships no server credential.
#                             See LIMITATIONS at the bottom.
#   Full-line Ruby comments are stripped before matching, because the runtime
#   files carry extensive prose ABOUT the removed direct routes and naming a
#   thing is not doing it. Trailing comments are NOT stripped: this fails closed
#   on the ambiguous case, and the remedy is to move the note to its own line.
#
# FAILS (exit 1) WHEN
#   1. A runtime file constructs a direct Anthropic client (Anthropic::Client.new).
#   2. A runtime file constructs ANY model client outside lib/ai_client.rb, the
#      single sanctioned construction point (this is what catches a new seam that
#      reaches for Bedrock, or a vendor SDK, on its own) -- and lib/ai_client.rb
#      itself may build ONLY the two approved Bedrock clients, so the sanctioned
#      point is not an unguarded escape hatch either.
#   3. A runtime file reads a direct-provider AI credential (ANTHROPIC_API_KEY,
#      GEMINI_API_KEY, or another vendor key -- see VENDOR_KEY_RE).
#   4. A runtime file names an unapproved direct vendor inference endpoint.
#   5. A discovered AI seam does not route through AiClient.
#   6. AiClient stops building either Bedrock client, or starts building a direct one.
#   7. Either deprecated direct-provider key returns to the Cloud Run runtime mount.
#   8. Scope discovery yields nothing (a broken scan must not read as a clean tree).
#
# AiClient supports two Bedrock planes (classic bedrock-runtime and Mantle),
# selected by BEDROCK_PLANE. Both are inside the same AWS BAA boundary, so this
# guard is plane-agnostic about WHICH is active and only asserts that both
# construction paths remain present and that no direct client is built.
#
# Runs read-only greps; no network, no mutation, no credentials.
#
# Usage:
#   scripts/ai-endpoint-guard.sh              # scan the repo this script lives in
#   scripts/ai-endpoint-guard.sh --root DIR   # scan an arbitrary tree (tests)
#   scripts/ai-endpoint-guard.sh --list-scope # print the discovered runtime files
#   scripts/ai-endpoint-guard.sh --list-seams # print the discovered AI seams
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$REPO_ROOT"
MODE='check'

while [ $# -gt 0 ]; do
  case "$1" in
    --root)
      [ $# -ge 2 ] || { echo "ai-endpoint-guard: --root needs a directory" >&2; exit 2; }
      ROOT="$2"; shift 2 ;;
    --list-scope) MODE='list-scope'; shift ;;
    --list-seams) MODE='list-seams'; shift ;;
    -h|--help) sed -n '1,70p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "ai-endpoint-guard: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

[ -d "$ROOT" ] || { echo "ai-endpoint-guard: --root '$ROOT' is not a directory" >&2; exit 2; }
cd "$ROOT" || exit 2

# The single sanctioned model-client construction point. Every other runtime file
# must reach models through it. This is a ROLE, not an allowlist: exempting it
# from check 2 is paid for by check 6, which asserts what it must and must not build.
SANCTIONED_CLIENT='lib/ai_client.rb'

# Direct-provider AI credentials. Deliberately NOT a broad *_API_KEY / GOOGLE_*
# pattern: GOOGLE_TTS_TOKEN, GOOGLE_TRANSLATE_TOKEN and GOOGLE_PLACES_TOKEN are
# legitimate non-model Google services this app uses at runtime.
VENDOR_KEY_RE="ENV(\[|\.fetch\()[[:space:]]*['\"](ANTHROPIC|GEMINI|OPENAI|DEEPSEEK|MISTRAL|OPENROUTER|GROQ|XAI|PERPLEXITY|COHERE|TOGETHER|REPLICATE)_API_KEY['\"]"

# Unapproved direct model-inference hosts. Host-specific on purpose: the approved
# Bedrock hosts (bedrock-runtime.<region>.amazonaws.com, bedrock-mantle.<region>.api.aws)
# are absent from this list, and so are non-model vendor APIs on shared domains
# (texttospeech.googleapis.com is used for TTS and must not trip this).
VENDOR_HOST_RE='api\.anthropic\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|api\.openai\.com|api\.deepseek\.com|openrouter\.ai|api\.mistral\.ai|api\.cohere\.(ai|com)|api\.groq\.com|api\.x\.ai|api\.perplexity\.ai|api\.together\.xyz|api\.replicate\.com'

# A bare direct Anthropic client. Anchored so Anthropic::BedrockClient and
# Anthropic::BedrockMantleClient do NOT match -- only the api.anthropic.com route.
DIRECT_CLIENT_RE='(^|[^:[:alnum:]_])(::)?Anthropic::Client\.new'

# Constant-name tokens that mark a namespace as a model vendor SDK. Matching on the
# TOKEN rather than on a list of full class names is deliberate: an enumeration of
# exact constructors (Anthropic::Client, OpenAI::Client, ...) silently misses the next
# SDK shape someone reaches for -- Google::GenerativeAI::Client.new was missed exactly
# that way. Tokens generalize across a vendor's whole namespace.
AI_VENDOR_NS='Anthropic|OpenAI|GenerativeAI|GenerativeLanguage|Gemini|VertexAI|AIPlatform|Bedrock|Mistral|Cohere|Groq|DeepSeek|Replicate|Perplexity|Ollama|LangChain|RubyLLM'

# Construction is not only `.new`. A client handed back by a factory method is just
# as much an egress seam, and matching `.new` alone let `OpenAI::Client.from_env`
# through untouched.
CLIENT_FACTORY_RE='new!?|build!?|create!?|from_env|from_config|configure!?|connect|client|instance|default|get_client'

# Any model-client construction at all, for the "only AiClient builds clients" rule:
# a construction call on any constant whose path carries a vendor token.
ANY_CLIENT_RE="(^|[^:[:alnum:]_])(::)?([A-Za-z0-9_]+::)*[A-Za-z0-9_]*($AI_VENDOR_NS)[A-Za-z0-9_]*(::[A-Za-z0-9_]+)*\.($CLIENT_FACTORY_RE)\b"

# The ONLY constructions the sanctioned point is allowed to make. Anchored to the
# FULL extracted match (grep -no emits `<line>:<match>`), because an unanchored
# pattern would also accept a look-alike under another namespace -- Ruby treats
# Foo::Anthropic::BedrockClient as a different class than Anthropic::BedrockClient,
# and the unanchored form filtered it out as approved.
PERMITTED_CLIENT_RE='^[0-9]+:[^:[:alnum:]_]?(::)?Anthropic::Bedrock(Mantle)?Client\.new$'

# Requiring a vendor SDK gem is itself a seam marker, even before any constructor.
AI_REQUIRE_RE="require[[:space:]_a-z]*[[:space:](]+['\"](anthropic|openai|ruby-openai|gemini[-_a-z]*|google-cloud-ai_platform[-_a-z]*|google_generative_ai|generative[-_]ai|mistral[-_a-z]*|cohere[-_a-z]*|groq[-_a-z]*|replicate|ollama[-_a-z]*|langchainrb|ruby_llm|aws-sdk-bedrock[a-z]*)['\"]"

# Markers that make a runtime file an AI seam at all.
SEAM_RE="AiClient|(^|[^:[:alnum:]_])(::)?($AI_VENDOR_NS)[A-Za-z0-9_]*::|(^|[^:[:alnum:]_])(::)?Aws::Bedrock|$AI_REQUIRE_RE|$VENDOR_HOST_RE|$VENDOR_KEY_RE"

# ---------------------------------------------------------------------------
# Scope discovery
# ---------------------------------------------------------------------------
# Prefer git so gitignored trees (node_modules, tmp) are never walked. --others
# is included so a seam a developer has written but not yet staged is still
# covered locally; CI checkouts are fully tracked either way. Falls back to find
# for a non-git tree (the test fixtures).
discover_runtime_files() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files --cached --others --exclude-standard -- app lib config 2>/dev/null
  else
    find app lib config -type f 2>/dev/null | sed 's|^\./||'
  fi | grep -E '\.(rb|rake)$' \
     | grep -vE '^app/frontend/' \
     | grep -vE '(^|/)(spec|specs|test|tests)/' \
     | grep -vE '_(spec|test)\.rb$' \
     | LC_ALL=C sort -u
}

# Full-line Ruby comments removed; everything else preserved verbatim.
strip_comments() { sed -E 's/^[[:space:]]*#.*$//' "$1"; }

RUNTIME_FILES="$(discover_runtime_files)"

if [ "$MODE" = 'list-scope' ]; then
  printf '%s\n' "$RUNTIME_FILES"
  exit 0
fi

SEAMS=''
if [ -n "$RUNTIME_FILES" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    stripped="$(strip_comments "$f")"
    if [ -n "$(grep -E "$SEAM_RE" <<< "$stripped" || true)" ]; then
      SEAMS="${SEAMS}${f}"$'\n'
    fi
  done <<< "$RUNTIME_FILES"
fi
SEAMS="$(printf '%s' "$SEAMS" | grep -v '^$' || true)"

if [ "$MODE" = 'list-seams' ]; then
  printf '%s\n' "$SEAMS"
  exit 0
fi

status=0
fail() { echo "FAIL: $*"; status=1; }

# ---------------------------------------------------------------------------
# 8. Discovery sanity. A scan that found nothing is a broken scan, not a clean
#    tree, and must never be reported as a pass.
# ---------------------------------------------------------------------------
if [ -z "$RUNTIME_FILES" ]; then
  fail "runtime scope discovery found no app/, lib/ or config/ Ruby files under '$ROOT' -- the scan is broken, refusing to report a pass"
fi

# ---------------------------------------------------------------------------
# 1-4. Prohibitions across the whole discovered runtime scope. These need no
#      per-file registration, which is the entire point: a file added tomorrow
#      is scanned tomorrow.
# ---------------------------------------------------------------------------
if [ -n "$RUNTIME_FILES" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    stripped="$(strip_comments "$f")"

    hits="$(grep -nE "$DIRECT_CLIENT_RE" <<< "$stripped" || true)"
    if [ -n "$hits" ]; then
      fail "$f constructs a direct Anthropic::Client -- runtime AI must route via AiClient.build (Bedrock)"
      printf '%s\n' "$hits" | sed "s|^|  $f:|"
    fi

    if [ "$f" != "$SANCTIONED_CLIENT" ]; then
      hits="$(grep -nE "$ANY_CLIENT_RE" <<< "$stripped" || true)"
      if [ -n "$hits" ]; then
        fail "$f constructs a model client directly -- $SANCTIONED_CLIENT is the only sanctioned construction point"
        printf '%s\n' "$hits" | sed "s|^|  $f:|"
      fi
    else
      # The sanctioned point is exempt from "no client construction" for exactly
      # TWO constructors, not for client construction in general. A blanket
      # exemption would make this file the one place a direct vendor client could
      # be added with CI still green -- an escape hatch inside the control itself.
      # -o extracts each CONSTRUCTOR, not each line. Filtering whole lines let an
      # unapproved constructor ride along on the same physical line as an approved
      # one: `Anthropic::BedrockClient.new; OpenAI::Client.new` passed.
      hits="$(grep -noE "$ANY_CLIENT_RE" <<< "$stripped" | grep -vE "$PERMITTED_CLIENT_RE" || true)"
      if [ -n "$hits" ]; then
        fail "$f constructs a model client that is not one of the two approved Bedrock clients -- the sanctioned construction point may build ONLY Anthropic::BedrockClient or Anthropic::BedrockMantleClient"
        printf '%s\n' "$hits" | sed "s|^|  $f:|"
      fi
    fi

    hits="$(grep -nE "$VENDOR_KEY_RE" <<< "$stripped" || true)"
    if [ -n "$hits" ]; then
      fail "$f reads a direct-provider AI credential -- runtime AI must route via Bedrock (AiClient)"
      printf '%s\n' "$hits" | sed "s|^|  $f:|"
    fi

    hits="$(grep -nE "$VENDOR_HOST_RE" <<< "$stripped" || true)"
    if [ -n "$hits" ]; then
      fail "$f names an unapproved direct vendor inference endpoint -- only AWS Bedrock is an approved runtime egress"
      printf '%s\n' "$hits" | sed "s|^|  $f:|"
    fi
  done <<< "$RUNTIME_FILES"
fi

# ---------------------------------------------------------------------------
# 5. Every discovered AI seam must route through AiClient. This is the positive
#    half of the containment rule: prohibitions above stop a seam from doing the
#    wrong thing, this stops one from doing an unrecognized thing.
# ---------------------------------------------------------------------------
if [ -n "$SEAMS" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ "$f" = "$SANCTIONED_CLIENT" ] && continue
    stripped="$(strip_comments "$f")"
    if [ -z "$(grep -F 'AiClient' <<< "$stripped" || true)" ]; then
      fail "$f looks like a runtime AI seam but never references AiClient -- every seam must route through $SANCTIONED_CLIENT"
    fi
  done <<< "$SEAMS"
fi

# ---------------------------------------------------------------------------
# 6. AiClient must build a Bedrock client -- and never a direct client.
#    Both Bedrock planes are in scope and both stay inside the AWS account BAA
#    boundary; which one is active is an operational choice (BEDROCK_PLANE), so
#    this asserts BOTH construction paths are still present rather than pinning
#    one. Requiring both is deliberate: dropping the Mantle branch would silently
#    strand the models only Mantle carries, and dropping the classic branch would
#    strand the only plane this account can currently invoke.
# ---------------------------------------------------------------------------
if [ ! -f "$SANCTIONED_CLIENT" ]; then
  fail "$SANCTIONED_CLIENT is missing (the sanctioned Bedrock construction point)"
else
  ai_client="$(strip_comments "$SANCTIONED_CLIENT")"
  [ -n "$(grep -E 'Anthropic::BedrockClient\.new' <<< "$ai_client" || true)" ] \
    || fail "$SANCTIONED_CLIENT does not construct Anthropic::BedrockClient (classic Bedrock plane)"
  [ -n "$(grep -E 'Anthropic::BedrockMantleClient\.new' <<< "$ai_client" || true)" ] \
    || fail "$SANCTIONED_CLIENT does not construct Anthropic::BedrockMantleClient (Mantle plane)"
fi

# ---------------------------------------------------------------------------
# 7. Deprecated direct-provider credentials must not return to the Cloud Run mount.
#    The exact NON_BOOT_SECRETS assignment is checked rather than comments, which
#    may continue to name the removed keys for historical context.
# ---------------------------------------------------------------------------
CLOUDRUN='.github/workflows/deploy-cloudrun.yml'
if [ -f "$CLOUDRUN" ]; then
  hits="$(grep -nE 'NON_BOOT_SECRETS:.*(ANTHROPIC|GEMINI|OPENAI)_API_KEY' "$CLOUDRUN" || true)"
  if [ -n "$hits" ]; then
    fail "$CLOUDRUN mounts a deprecated direct-provider API key"
    printf '%s\n' "$hits" | sed 's|^|  |'
  fi
fi

if [ $status -eq 0 ]; then
  scope_count="$(printf '%s\n' "$RUNTIME_FILES" | grep -c . || true)"
  seam_count="$(printf '%s\n' "$SEAMS" | grep -c . || true)"
  echo "OK: runtime AI routes via AWS Bedrock (AiClient); no direct client, vendor credential, or unapproved endpoint in the runtime scope."
  echo "    runtime scope: $scope_count discovered app/ + lib/ + config/ Ruby files (no allowlist)"
  echo "    AI seams discovered ($seam_count):"
  printf '%s\n' "$SEAMS" | sed 's|^|      |'
fi
exit $status

# LIMITATIONS (stated, not silently omitted)
#   - app/frontend/** is out of scope. It holds no Ruby and ships no server
#     credential; a client-side direct call would be a different (and louder)
#     defect. Bringing 1,400+ JS/HBS files in would add false-positive surface
#     from vendored code for a threat this control does not model.
#   - The scan is lexical, not semantic. A seam that builds a vendor URL by
#     string concatenation, or reads a credential through an indirection
#     (ENV[key_name]), is not detected. This guard raises the floor on the
#     accidental case; it is not an exfiltration control.
#   - Vendor detection is token-based (AI_VENDOR_NS), which generalizes across a
#     vendor's whole namespace but still cannot name a vendor nobody has heard of
#     yet. A wholly unrecognized SDK reached through a hand-rolled HTTP client and
#     a concatenated URL remains undetectable lexically. Check 5 is the backstop
#     that narrows this: anything the scan DOES recognize as a seam must route
#     through AiClient.
#   - Trailing comments are not stripped, so a trailing note naming a prohibited
#     token trips the guard. That is fail-closed by choice; move the note to its
#     own line.
#   - Check 7 covers the Cloud Run mount only. Other credential residences
#     (.env.op.template, the Render sync manifest) are tracked separately under
#     findings LL-bdc3344942 and LL-94e57af291.
