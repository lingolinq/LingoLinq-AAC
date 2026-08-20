#!/usr/bin/env bash
#
# ai-endpoint-guard-test.sh - proves scripts/ai-endpoint-guard.sh actually FIRES.
#
# WHY THIS EXISTS
#   The guard it tests is the CI enforcement that ten docs/legal/ records cite when
#   they claim "no runtime seam constructs a direct client". Before finding
#   LL-1189af1b3c that guard was a four-file allowlist with no test of its own: it
#   had only ever been observed passing on a clean tree, which is evidence the tree
#   is clean, not that the guard works. Every rule is asserted here against a
#   fixture that violates it AND against one that does not, so a refactor that
#   quietly neuters a rule goes red instead of green.
#
#   The central assertion is CASE 2: a brand-new runtime file, named nowhere in the
#   guard, is caught anyway. That is the whole point of the discovered-scope design
#   and the thing the old allowlist could not do.
#
#   Fixtures are built in a temp dir and the guard is pointed at them with --root.
#   That is the whole reason that flag exists. Nothing here reaches the network,
#   and no fixture contains a real credential or any user data -- the "keys" below
#   are ENV lookups by NAME, never a value.
#
# Usage: scripts/tests/ai-endpoint-guard-test.sh
# Exit codes: 0 = all guards fired correctly; 1 = a guard failed to fire, or fired
#             when it should not.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD="$REPO_ROOT/scripts/ai-endpoint-guard.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fails=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }

# build_fixture <root> -- a minimal but REPRESENTATIVE clean tree: a sanctioned
# client, two seams that route through it, an ordinary runtime file, a reviewer-only
# script that legitimately reads ANTHROPIC_API_KEY, a spec that stubs the same name,
# a frontend file naming a vendor host, and a clean Cloud Run mount.
build_fixture() {
  local root="$1"
  rm -rf "$root"
  mkdir -p "$root/lib" "$root/lib/tasks" "$root/app/controllers/api" "$root/app/services" \
           "$root/app/frontend/app/utils" "$root/spec/lib" "$root/scripts" \
           "$root/config/initializers" "$root/.github/workflows"

  cat > "$root/lib/ai_client.rb" <<'RUBY'
# frozen_string_literal: true
# The prior direct api.anthropic.com route (ANTHROPIC_API_KEY) is intentionally
# NOT constructed at runtime. Naming it in prose is not doing it.
module AiClient
  module_function

  def build!
    if plane == 'mantle'
      Anthropic::BedrockMantleClient.new(region: bedrock_region)
    else
      Anthropic::BedrockClient.new(region: bedrock_region)
    end
  end

  def plane
    ENV['BEDROCK_PLANE'].to_s
  end

  def runtime_model(default)
    override = ENV['ANTHROPIC_MODEL'].to_s.strip
    override.empty? ? default : override
  end

  def bedrock_region
    ENV['BEDROCK_AWS_REGION'] || 'us-east-1'
  end
end
RUBY

  cat > "$root/lib/ai_word_predictor.rb" <<'RUBY'
# frozen_string_literal: true
# Routes to Claude on AWS Bedrock via AiClient, never the direct
# api.anthropic.com endpoint. ANTHROPIC_API_KEY no longer configures this path.
module AiWordPredictor
  def self.predict(words)
    return [] unless AiClient.available?
    client = AiClient.build!
    client.messages.create(model: AiClient.runtime_model('anthropic.claude-haiku-4-5'), messages: words)
  end
end
RUBY

  cat > "$root/lib/eval_narrator.rb" <<'RUBY'
# frozen_string_literal: true
module EvalNarrator
  def self.narrate(report)
    raise 'unavailable' unless defined?(::Anthropic::Client)
    client = AiClient.build!
    client.messages.create(model: AiClient.runtime_model('anthropic.claude-haiku-4-5'), messages: report)
  end
end
RUBY

  # An ordinary runtime file: legitimate non-model Google services must not trip.
  cat > "$root/app/controllers/api/search_controller.rb" <<'RUBY'
# frozen_string_literal: true
class Api::SearchController < ApplicationController
  def voices
    Typhoeus.get("https://texttospeech.googleapis.com/v1/voices?key=#{ENV['GOOGLE_TTS_TOKEN']}")
  end

  def translate
    key = ENV['GOOGLE_TRANSLATE_TOKEN']
    Typhoeus.get("https://translation.googleapis.com/language/translate/v2?key=#{key}")
  end
end
RUBY

  # Reviewer-only Tier 2 tooling. Reads the direct key ON PURPOSE; must not trip.
  cat > "$root/scripts/codex-review.sh" <<'SH'
#!/usr/bin/env bash
# Tier 2 dev-loop reviewer. Reviews diffs, never user data.
export ANTHROPIC_API_KEY="${CLAUDE_REVIEW_API_KEY:-}"
curl -s https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY"
SH

  # Tests stub and delete these names on purpose; must not trip.
  cat > "$root/spec/lib/ai_word_predictor_spec.rb" <<'RUBY'
describe AiWordPredictor do
  before do
    ENV['ANTHROPIC_API_KEY'] = 'x'
    ENV.delete('GEMINI_API_KEY')
    allow(Anthropic::Client).to receive(:new)
  end
end
RUBY

  cat > "$root/lib/tasks/generate_predictions.rake" <<'RUBY'
namespace :predictions do
  task :generate do
    AiPredictionGenerator.generate
  end
end
RUBY

  cat > "$root/config/initializers/warmup.rb" <<'RUBY'
# Warms the Bedrock account assertion off the request path.
AiClient.available? if defined?(AiClient)
RUBY

  cat > "$root/app/frontend/app/utils/notes.js" <<'JS'
// Historical note: the app never called api.anthropic.com from the browser.
export default {};
JS

  cat > "$root/.github/workflows/deploy-cloudrun.yml" <<'YML'
env:
  # ANTHROPIC_API_KEY was REMOVED from this list on 2026-08-15; do not re-add it.
  # GEMINI_API_KEY was REMOVED from this list on 2026-08-18.
  NON_BOOT_SECRETS: STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,SENTRY_DSN=SENTRY_DSN:latest
YML
}

# expect_fail <name> <root> <substring-of-expected-reason>
expect_fail() {
  local name="$1" root="$2" needle="$3" out rc
  out="$(bash "$GUARD" --root "$root" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then
    fail "$name (guard exited 0; it should have refused)"
  elif ! printf '%s' "$out" | grep -qi -- "$needle"; then
    fail "$name (refused, but not for the expected reason; wanted /$needle/)"
    printf '%s\n' "$out" | sed 's/^/         /' | head -6
  else
    pass "$name"
  fi
}

# expect_pass <name> <root>
expect_pass() {
  local name="$1" root="$2" out rc
  out="$(bash "$GUARD" --root "$root" 2>&1)"; rc=$?
  if [ $rc -ne 0 ]; then
    fail "$name (guard refused a clean tree)"
    printf '%s\n' "$out" | sed 's/^/         /' | head -8
  else
    pass "$name"
  fi
}

F="$TMP/fixture"

echo "ai-endpoint-guard-test: CHECK 0, the clean fixture passes"
build_fixture "$F"
expect_pass "clean fixture with seams, reviewer script, specs and frontend passes" "$F"

echo
echo "ai-endpoint-guard-test: CHECK 1, a NEWLY ADDED runtime seam is caught with no allowlist edit"
# This is the finding LL-1189af1b3c regression test. None of the file names below
# appear anywhere in ai-endpoint-guard.sh; the old four-file SEAMS array passed all
# of them green.
build_fixture "$F"
cat > "$F/lib/ai_summary_writer.rb" <<'RUBY'
module AiSummaryWriter
  def self.write(text)
    client = Anthropic::Client.new(api_key: ENV['SOME_KEY'])
    client.messages.create(messages: text)
  end
end
RUBY
expect_fail "new file constructing a direct Anthropic::Client fails" "$F" "direct Anthropic::Client"

build_fixture "$F"
cat > "$F/lib/ai_summary_writer.rb" <<'RUBY'
module AiSummaryWriter
  def self.key
    ENV['ANTHROPIC_API_KEY']
  end
end
RUBY
expect_fail "new file reading ANTHROPIC_API_KEY fails" "$F" "direct-provider AI credential"

build_fixture "$F"
cat > "$F/app/services/caption_writer.rb" <<'RUBY'
class CaptionWriter
  def key
    ENV.fetch('GEMINI_API_KEY')
  end
end
RUBY
expect_fail "new file reading GEMINI_API_KEY fails" "$F" "direct-provider AI credential"

build_fixture "$F"
cat > "$F/app/services/caption_writer.rb" <<'RUBY'
class CaptionWriter
  ENDPOINT = 'https://api.openai.com/v1/chat/completions'
  def call(body)
    Typhoeus.post(ENDPOINT, body: body)
  end
end
RUBY
expect_fail "new file posting to an unapproved vendor endpoint fails" "$F" "unapproved direct vendor inference endpoint"

build_fixture "$F"
cat > "$F/lib/ai_direct_bedrock.rb" <<'RUBY'
module AiDirectBedrock
  def self.build
    Aws::BedrockRuntime::Client.new(region: 'us-east-1')
  end
end
RUBY
expect_fail "new file building its own Bedrock client bypasses AiClient and fails" "$F" "only sanctioned construction point"

build_fixture "$F"
cat > "$F/lib/ai_offline_seam.rb" <<'RUBY'
module AiOfflineSeam
  # Looks like a seam (touches the Anthropic namespace) but never routes via the
  # sanctioned construction point.
  def self.error_class
    Anthropic::Errors::APIError
  end
end
RUBY
expect_fail "a discovered seam that never references AiClient fails" "$F" "never references AiClient"

# A rake task is runtime code that runs in the production container, not tooling.
# .rake was outside the scan until a reviewer caught it; lib/tasks/generate_predictions.rake
# already drives AiPredictionGenerator, so this is a live path, not a hypothetical.
build_fixture "$F"
cat > "$F/lib/tasks/ai_backfill.rake" <<'RUBY'
namespace :ai do
  task :backfill do
    Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY']).messages.create
  end
end
RUBY
expect_fail "a NEW .rake task constructing a direct client fails" "$F" "direct Anthropic::Client"

build_fixture "$F"
cat > "$F/config/initializers/ai_warm.rb" <<'RUBY'
OpenAI::Client.new(access_token: ENV['OPENAI_API_KEY'])
RUBY
expect_fail "a NEW config/ initializer constructing a vendor client fails" "$F" "direct-provider AI credential"

# Enumerating exact constructor names misses the next SDK shape someone reaches for.
# Google::GenerativeAI::Client.new was missed exactly that way before token matching.
for shape in 'Google::GenerativeAI::Client.new' 'OpenAI::Client.new' 'Mistral::Client.new' \
             'Aws::BedrockRuntime::Client.new' 'RubyLLM::Chat.new' 'Cohere::Client.new'; do
  build_fixture "$F"
  printf 'module Rogue\n  def self.go\n    %s\n  end\nend\n' "$shape" > "$F/lib/rogue.rb"
  expect_fail "unlisted SDK shape $shape is caught" "$F" "FAIL"
done

# A seam that DOES reference AiClient but also builds its own vendor client must be
# caught by the constructor rule specifically -- referencing AiClient satisfies
# check 5, so if the constructor regex is weak this passes green. That is exactly
# how a too-narrow ANY_CLIENT_RE hid nine vendor shapes behind an incidental catch.
for shape in 'OpenAI::Client.new' 'Google::GenerativeAI::Client.new' 'Mistral::Client.new' \
             'Cohere::Client.new' 'Ollama::Client.new' 'RubyLLM::Chat.new'; do
  build_fixture "$F"
  printf 'module Rogue\n  def self.go\n    AiClient.available?\n    %s\n  end\nend\n' "$shape" \
    > "$F/lib/rogue.rb"
  expect_fail "$shape is caught by the constructor rule even when AiClient is referenced" \
    "$F" "only sanctioned construction point"
done

# Construction is not only `.new`. A client handed back by a factory method is the
# same egress seam, and matching `.new` alone let OpenAI::Client.from_env straight
# through -- including in a file that references AiClient and so satisfied check 5.
for call in 'OpenAI::Client.from_env' 'Anthropic::Client.create' 'Mistral::Client.build' \
            'Cohere::Client.instance' 'Gemini::Client.configure' 'Groq::Client.default'; do
  build_fixture "$F"
  printf 'module Rogue\n  def self.go\n    AiClient.available?\n    %s.chat\n  end\nend\n' "$call" \
    > "$F/lib/rogue.rb"
  expect_fail "factory-style construction $call is caught" "$F" "only sanctioned construction point"
done

build_fixture "$F"
printf "require 'openai'\nmodule Rogue\nend\n" > "$F/lib/rogue.rb"
expect_fail "requiring a vendor SDK gem alone marks a seam" "$F" "never references AiClient"

echo
echo "ai-endpoint-guard-test: CHECK 2, reviewer-only tooling, tests and comments do NOT false-positive"
build_fixture "$F"
cat >> "$F/scripts/another-reviewer-tool.sh" <<'SH'
#!/usr/bin/env bash
curl https://api.anthropic.com -H "x-api-key: $ANTHROPIC_API_KEY"
SH
expect_pass "a second reviewer-only script under scripts/ does not trip the guard" "$F"

build_fixture "$F"
cat > "$F/lib/history_notes.rb" <<'RUBY'
# frozen_string_literal: true
# The direct api.anthropic.com route was disabled; ENV['ANTHROPIC_API_KEY'] and
# ENV['GEMINI_API_KEY'] are no longer read at runtime, and Anthropic::Client.new
# is never called. generativelanguage.googleapis.com is likewise unused.
module HistoryNotes
end
RUBY
expect_pass "full-line comments naming every prohibited token do not trip the guard" "$F"

build_fixture "$F"
cat >> "$F/spec/lib/ai_word_predictor_spec.rb" <<'RUBY'
it 'also builds a client' do
  Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY'])
end
RUBY
expect_pass "a spec constructing a client and reading the key does not trip the guard" "$F"

build_fixture "$F"
cat >> "$F/app/frontend/app/utils/notes.js" <<'JS'
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
JS
expect_pass "app/frontend is out of scope and does not trip the guard" "$F"

build_fixture "$F"
expect_pass "ANTHROPIC_MODEL, GOOGLE_TTS_TOKEN and texttospeech.googleapis.com stay legal" "$F"

echo
echo "ai-endpoint-guard-test: CHECK 3, the preserved AiClient construction rules still fire"
build_fixture "$F"
sed -i 's/Anthropic::BedrockClient\.new/Anthropic::SomethingElse.new/' "$F/lib/ai_client.rb"
expect_fail "AiClient dropping the classic Bedrock plane fails" "$F" "classic Bedrock plane"

build_fixture "$F"
sed -i 's/Anthropic::BedrockMantleClient\.new/Anthropic::BedrockClient.new/' "$F/lib/ai_client.rb"
expect_fail "AiClient dropping the Mantle plane fails" "$F" "Mantle plane"

build_fixture "$F"
sed -i 's/Anthropic::BedrockClient\.new/Anthropic::Client.new/' "$F/lib/ai_client.rb"
expect_fail "AiClient constructing a direct Anthropic::Client fails" "$F" "direct Anthropic::Client"

build_fixture "$F"
rm -f "$F/lib/ai_client.rb"
expect_fail "AiClient going missing fails" "$F" "sanctioned Bedrock construction point"

# The sanctioned construction point must not be an escape hatch. Exempting it from
# the constructor rule wholesale made lib/ai_client.rb the single place a direct
# vendor client could be added with CI green, since the plane checks only assert the
# two Bedrock constructors are PRESENT, not that nothing else is.
for shape in 'OpenAI::Client.new' 'Google::GenerativeAI::Client.new' 'Mistral::Client.new'; do
  build_fixture "$F"
  printf '\nmodule Sneak\n  def self.go\n    %s\n  end\nend\n' "$shape" >> "$F/lib/ai_client.rb"
  expect_fail "AiClient may not also build $shape" "$F" "not one of the two approved Bedrock clients"
done

# Same-line smuggling. Filtering whole LINES rather than individual constructors let
# an unapproved client ride along beside an approved one on one physical line.
for line in 'Anthropic::BedrockClient.new; OpenAI::Client.new' \
            'OpenAI::Client.new; Anthropic::BedrockClient.new' \
            'x = Anthropic::BedrockMantleClient.new || Google::GenerativeAI::Client.new'; do
  build_fixture "$F"
  printf '\nmodule Sneak\n  def self.go\n    %s\n  end\nend\n' "$line" >> "$F/lib/ai_client.rb"
  expect_fail "AiClient may not smuggle a vendor client onto an approved line: $line" \
    "$F" "not one of the two approved Bedrock clients"
done

# A look-alike under another namespace is a DIFFERENT Ruby class. An unanchored
# permitted-constructor filter accepted it as approved.
for mimic in 'Foo::Anthropic::BedrockClient.new' 'Vendor::Anthropic::BedrockMantleClient.new'; do
  build_fixture "$F"
  printf '\nmodule Sneak\n  def self.go\n    %s\n  end\nend\n' "$mimic" >> "$F/lib/ai_client.rb"
  expect_fail "AiClient may not build the look-alike $mimic" "$F" "not one of the two approved Bedrock clients"
done

# ...but the genuine constructors, including the fully-qualified ::-prefixed form,
# must still be accepted, or the guard blocks correct code.
build_fixture "$F"
sed -i 's/Anthropic::BedrockClient\.new/::Anthropic::BedrockClient.new/' "$F/lib/ai_client.rb"
expect_pass "AiClient may build the fully-qualified ::Anthropic::BedrockClient.new" "$F"

build_fixture "$F"
expect_pass "an unmodified AiClient building both Bedrock clients still passes" "$F"

echo
echo "ai-endpoint-guard-test: CHECK 4, the Cloud Run mount rule still fires"
build_fixture "$F"
sed -i 's|NON_BOOT_SECRETS: |NON_BOOT_SECRETS: ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,|' \
  "$F/.github/workflows/deploy-cloudrun.yml"
expect_fail "re-mounting ANTHROPIC_API_KEY on Cloud Run fails" "$F" "deprecated direct-provider API key"

build_fixture "$F"
sed -i 's|NON_BOOT_SECRETS: |NON_BOOT_SECRETS: GEMINI_API_KEY=GEMINI_API_KEY:latest,|' \
  "$F/.github/workflows/deploy-cloudrun.yml"
expect_fail "re-mounting GEMINI_API_KEY on Cloud Run fails" "$F" "deprecated direct-provider API key"

echo
echo "ai-endpoint-guard-test: CHECK 5, a scan that finds nothing fails closed"
rm -rf "$TMP/empty" && mkdir -p "$TMP/empty"
expect_fail "an empty tree is refused, not reported clean" "$TMP/empty" "the scan is broken"

echo
echo "ai-endpoint-guard-test: CHECK 6, the git-backed discovery path CI actually uses"
# Everything above runs in a plain temp dir, which exercises only the find(1)
# fallback. CI runs inside a git work tree and takes the `git ls-files` branch, so
# a regression there would leave every negative test above passing. These cases
# run the same rules through the branch that actually ships.
G="$TMP/gitfixture"
build_fixture "$G"
( cd "$G" && git init -q . && git add -A >/dev/null 2>&1 ) || fail "could not init the git fixture"
if [ -d "$G/.git" ]; then
  expect_pass "git-backed discovery: clean tracked tree passes" "$G"

  cat > "$G/lib/ai_tracked_rogue.rb" <<'RUBY'
module AiTrackedRogue
  def self.go
    Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY'])
  end
end
RUBY
  ( cd "$G" && git add -A >/dev/null 2>&1 )
  expect_fail "git-backed discovery: a TRACKED rogue seam is caught" "$G" "direct Anthropic::Client"

  ( cd "$G" && git rm -q --cached lib/ai_tracked_rogue.rb >/dev/null 2>&1 )
  expect_fail "git-backed discovery: an UNTRACKED rogue seam is still caught (--others)" "$G" "direct Anthropic::Client"

  # A gitignored path is build output, not source; it must not be scanned, and it
  # must not become a way to smuggle a seam past the guard either -- an ignored
  # file is not deployed runtime source.
  rm -f "$G/lib/ai_tracked_rogue.rb"
  mkdir -p "$G/lib/generated"
  echo 'lib/generated/' > "$G/.gitignore"
  cat > "$G/lib/generated/ai_built.rb" <<'RUBY'
Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY'])
RUBY
  expect_pass "git-backed discovery: gitignored build output is not scanned" "$G"

  scope="$(bash "$GUARD" --root "$G" --list-scope 2>/dev/null)"
  if printf '%s\n' "$scope" | grep -qxF 'lib/tasks/generate_predictions.rake'; then
    pass "git-backed discovery: .rake files are in the runtime scope"
  else
    fail "git-backed discovery: .rake files are missing from the runtime scope"
  fi
  if printf '%s\n' "$scope" | grep -qxF 'config/initializers/warmup.rb'; then
    pass "git-backed discovery: config/ files are in the runtime scope"
  else
    fail "git-backed discovery: config/ files are missing from the runtime scope"
  fi
fi

echo
echo "ai-endpoint-guard-test: CHECK 7, the REAL repository"
out="$(bash "$GUARD" --root "$REPO_ROOT" 2>&1)"; rc=$?
if [ $rc -eq 0 ]; then pass "the guard passes on the real tree"; else
  fail "the guard fails on the real tree"; printf '%s\n' "$out" | sed 's/^/         /' | head -10
fi

# Coverage proof. Naming today's seams HERE is an assertion about the tree, not an
# enforcement allowlist: the guard itself contains none of these paths, and if a
# seam is added or renamed this line goes red and a human looks at it.
scope="$(bash "$GUARD" --root "$REPO_ROOT" --list-scope 2>/dev/null)"
seams="$(bash "$GUARD" --root "$REPO_ROOT" --list-seams 2>/dev/null)"
for known in lib/ai_word_predictor.rb lib/ai_prediction_generator.rb \
             lib/ai_board_generator.rb lib/eval_narrator.rb lib/ai_client.rb \
             config/puma.rb; do
  if printf '%s\n' "$seams" | grep -qxF "$known"; then
    pass "current runtime seam $known is discovered by the guard"
  else
    fail "current runtime seam $known is NOT discovered by the guard"
  fi
done

if [ "$(printf '%s\n' "$scope" | grep -c .)" -ge 50 ]; then
  pass "runtime scope resolves to a populated app/ + lib/ + config/ file set"
else
  fail "runtime scope is implausibly small ($(printf '%s\n' "$scope" | grep -c .) files)"
fi
for excluded in '^app/frontend/' '^spec/' '^scripts/' '_spec\.rb$'; do
  if printf '%s\n' "$scope" | grep -qE "$excluded"; then
    fail "runtime scope wrongly includes $excluded"
  else
    pass "runtime scope excludes $excluded"
  fi
done

echo
if [ "$fails" -eq 0 ]; then
  echo "ai-endpoint-guard-test: PASS (every rule fired, and only when it should)"
  exit 0
fi
echo "ai-endpoint-guard-test: FAIL ($fails assertion(s) failed)"
exit 1
