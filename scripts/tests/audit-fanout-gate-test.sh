#!/usr/bin/env bash
#
# audit-fanout-gate-test.sh - proves scripts/audit-fanout-gate.rb refuses each unwired-finder shape.
#
# Each case builds a clean all-six-finders run in a temp tree using the repo's real agent and skill
# files, breaks one thing, and asserts the gate's exit code and reason. The clean case passes first,
# so a refusal below is caused by the one thing that case broke. The logger section feeds events
# through the real .claude/hooks/audit-run-logger.sh, so the log shape the gate reads is the shape the
# hook writes. Run from agent-hook-guards-test.sh, which is how it reaches CI.
#
# Usage: scripts/tests/audit-fanout-gate-test.sh
# Exit codes: 0 = every case behaved; 1 = a case mismatched.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO_ROOT/scripts/audit-fanout-gate.rb"
LOGGER="$REPO_ROOT/.claude/hooks/audit-run-logger.sh"
MERGE="$REPO_ROOT/scripts/audit-merge.rb"
SHA='0123456789abcdef0123456789abcdef01234567'
# Relative to now: the gate compares output-file mtimes against --since.
SINCE="$(ruby -rtime -e 'puts (Time.now.utc - 3600).iso8601')"
AFTER="$(ruby -rtime -e 'puts (Time.now.utc - 1800).iso8601')"
BEFORE="$(ruby -rtime -e 'puts (Time.now.utc - 7200).iso8601')"
# Local time, because that is how `touch -t` reads it.
STALE_STAMP="$(ruby -e 'puts (Time.now - 7200).strftime("%Y%m%d%H%M")')"
FINDERS='privacy-auditor infra-auditor api-auditor dependency-auditor accessibility-auditor code-hygiene-auditor'

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fails=0
total=0

# skill_of <agent> -- the skill the agent's frontmatter preloads.
skill_of() {
  grep -A1 '^skills:' "$REPO_ROOT/.claude/agents/$1.md" | tail -1 | sed -e 's/^ *- *//'
}

# token_of <agent> -- the token its real checklist tells it to return.
token_of() {
  sed -n 's/^- `"checklistToken": "\([a-z0-9-]*\)"`.*/\1/p' "$REPO_ROOT/.claude/skills/$(skill_of "$1")/SKILL.md"
}

# log_line <agent> <ts> [cmd] [agent_id]
log_line() {
  printf '{"ts":"%s","sha":"%s","agent":"%s","agent_id":"%s","tool":"Bash","cmd":"%s"}\n' \
    "$2" "$SHA" "$1" "${4:-id-$1}" "${3:-git log}" >> "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
}

# write_output <agent> [token] [canary] [sha] [domain]
write_output() {
  printf '{"domain":"%s","auditedSha":"%s","checklistToken":"%s","guardCanary":"%s","findings":[]}\n' \
    "${5:-${1%-auditor}}" "${4:-$SHA}" "${2-$(token_of "$1")}" "${3:-denied}" > "$WORK/out/$1.json"
}

# fresh_run -- a temp tree holding a clean run for all six finders.
fresh_run() {
  ROOT="$WORK/root"
  rm -rf "$ROOT" "$WORK/out"
  mkdir -p "$ROOT/.claude/agents" "$ROOT/.claude/skills" "$ROOT/audit-reports/run-log" "$WORK/out"
  cp "$REPO_ROOT"/.claude/agents/*-auditor.md "$ROOT/.claude/agents/"
  cp -r "$REPO_ROOT"/.claude/skills/*-audit "$ROOT/.claude/skills/"
  for f in $FINDERS; do
    log_line "$f" "$AFTER"
    write_output "$f"
  done
}

# ember_run <id>... -- a run holding one ember slice per id; a/b/c name the output files.
ember_run() {
  fresh_run
  rm "$WORK"/out/*.json "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
  local id n=0
  for id in "$@"; do
    log_line ember-upgrade-auditor "$AFTER" 'git log' "$id"
    n=$((n + 1))
    printf '{"domain":"ember-slice-%s","auditedSha":"%s","checklistToken":"%s","guardCanary":"denied","findings":[]}\n' \
      "$n" "$SHA" "$(token_of ember-upgrade-auditor)" > "$WORK/out/slice-$n.json"
  done
}

# gate [extra args] -- run the gate over every output currently on disk.
gate() {
  local args=() f
  for f in "$WORK"/out/*.json; do args+=(--finder "$(basename "$f" .json)=$f"); done
  ruby "$GATE" --root "$ROOT" --sha "$SHA" --since "$SINCE" "${args[@]}" "$@" 2>&1
}

# gate_ember <expect> <output>... -- run the gate as a partial run of ember slices.
gate_ember() {
  local expect="$1" args=() f
  shift
  for f in "$@"; do args+=(--finder "ember-upgrade-auditor=$f"); done
  ruby "$GATE" --root "$ROOT" --sha "$SHA" --since "$SINCE" --mode partial --expect "$expect" "${args[@]}" 2>&1
}

# expect <name> <exit code> <text the output must contain>; reads the gate's result from $out/$rc.
expect() {
  total=$((total + 1))
  if [ "$rc" = "$2" ] && printf '%s' "$out" | grep -qF -- "$3"; then
    printf '  ok   %s\n' "$1"
  else
    printf '  FAIL %s (expected exit %s with "%s", got exit %s)\n%s\n' "$1" "$2" "$3" "$rc" "$out"
    fails=$((fails + 1))
  fi
}

echo "== clean run =="
fresh_run
out=$(gate); rc=$?
expect 'all six wired finders pass the default full mode' 0 'audit-fanout-gate: PASS (6 finder(s)'

echo "== logger evidence =="
fresh_run
sed -i.bak '/"agent":"infra-auditor"/d' "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
out=$(gate); rc=$?
expect 'a finder with no log line is refused' 1 'no examination-log line from this run'

fresh_run
rm "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
out=$(gate); rc=$?
expect 'a missing log file is refused' 1 'no examination-log line from this run'

fresh_run
sed -i.bak '/"agent":"api-auditor"/d' "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
log_line api-auditor "$BEFORE"
out=$(gate); rc=$?
expect 'a log line from an earlier attempt at the same SHA does not count' 1 'no examination-log line from this run'

fresh_run
sed -i.bak "s/\"agent\":\"privacy-auditor\"/\"agent\":\"other-agent\"/" "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
out=$(gate); rc=$?
expect "another agent's log line does not count" 1 'no examination-log line from this run'

fresh_run
sed -i.bak "/\"agent\":\"dependency-auditor\"/s/$SHA/ffffffffffffffffffffffffffffffffffffffff/" "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
out=$(gate); rc=$?
expect 'a log line carrying another SHA does not count' 1 'no examination-log line from this run'

fresh_run
sed -i.bak '/"agent":"api-auditor"/s/"agent_id":"[^"]*",//' "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
out=$(gate); rc=$?
expect 'a log line with no agent id does not count as a spawn' 1 'spawn id(s) in the log for 1 output(s)'

echo "== one log entry per output =="
ember_run id-a id-b
out=$(gate_ember 2 "$WORK/out/slice-1.json" "$WORK/out/slice-2.json"); rc=$?
expect 'two slices with two spawn ids pass' 0 'audit-fanout-gate: PASS (1 finder(s)'

ember_run id-a id-a
out=$(gate_ember 2 "$WORK/out/slice-1.json" "$WORK/out/slice-2.json"); rc=$?
expect 'two slices cannot rest on one spawn id' 1 '1 spawn id(s) in the log for 2 output(s)'

ember_run id-a id-b
out=$(gate_ember 2 "$WORK/out/slice-1.json" "$WORK/out/slice-1.json"); rc=$?
expect 'one output listed twice is refused' 1 'listed more than once'

ln -s "$WORK/out/slice-1.json" "$WORK/out-link.json"
out=$(gate_ember 2 "$WORK/out/slice-1.json" "$WORK/out-link.json"); rc=$?
expect 'a symlink to the same output is refused' 1 'listed more than once'
rm "$WORK/out-link.json"

ember_run id-a id-b
printf '{"auditedSha":"%s"}\n' "$SHA" > "$WORK/out/slice-1.json"
out=$(gate_ember 2 "$WORK/out/slice-1.json" "$WORK/out/slice-2.json"); rc=$?
expect 'one bad slice refuses the agent' 1 'checklist not loaded'

echo "== checklist evidence =="
fresh_run
write_output accessibility-auditor ''
out=$(gate); rc=$?
expect 'a finder that returned no token is refused' 1 'checklist not loaded'

fresh_run
write_output accessibility-auditor "$(token_of privacy-auditor)"
out=$(gate); rc=$?
expect "another finder's token is refused" 1 'checklist not loaded'

fresh_run
sed -i.bak '/"checklistToken"/d' "$ROOT/.claude/skills/$(skill_of code-hygiene-auditor)/SKILL.md"
out=$(gate); rc=$?
expect 'a skill with no token line is refused' 1 'carries no checklistToken line'

echo "== guard evidence =="
fresh_run
write_output infra-auditor "$(token_of infra-auditor)" ran
out=$(gate); rc=$?
expect 'a canary reported as run is refused' 1 'guardCanary is "ran"'

fresh_run
log_line infra-auditor "$AFTER" mktemp
out=$(gate); rc=$?
expect 'a logged canary is refused even when the finder reports denied' 1 'read-only guard did not deny it'

echo "== agent definition wiring =="
fresh_run
sed -i.bak '/audit-readonly-guard.sh/d' "$ROOT/.claude/agents/infra-auditor.md"
out=$(gate); rc=$?
expect 'a definition with no read-only guard is refused' 1 'read-only guard on Bash'

fresh_run
sed -i.bak 's/matcher: "Edit|Write|NotebookEdit|MultiEdit|Bash"/matcher: "Edit|Write|NotebookEdit|MultiEdit"/' "$ROOT/.claude/agents/infra-auditor.md"
out=$(gate); rc=$?
expect 'a guard whose matcher omits Bash is refused' 1 'read-only guard on Bash'

fresh_run
sed -i.bak '/audit-run-logger.sh/d' "$ROOT/.claude/agents/api-auditor.md"
out=$(gate); rc=$?
expect 'a definition with no logger is refused' 1 'logger naming this agent'

fresh_run
sed -i.bak 's/audit-run-logger.sh" api-auditor/audit-run-logger.sh" infra-auditor/' "$ROOT/.claude/agents/api-auditor.md"
out=$(gate); rc=$?
expect 'a logger naming another agent is refused' 1 'logger naming this agent'

echo "== finder output =="
fresh_run
rm "$WORK/out/api-auditor.json"
out=$(ruby "$GATE" --root "$ROOT" --sha "$SHA" --since "$SINCE" --mode partial --expect 1 --finder "api-auditor=$WORK/out/api-auditor.json" 2>&1); rc=$?
expect 'a missing output file is refused' 1 'no output file at'

fresh_run
printf 'not json' > "$WORK/out/api-auditor.json"
out=$(gate); rc=$?
expect 'an unparseable output file is refused' 1 'is not valid JSON'

fresh_run
write_output api-auditor "$(token_of api-auditor)" denied ffffffffffffffffffffffffffffffffffffffff
out=$(gate); rc=$?
expect 'output from another SHA is refused' 1 'output auditedSha is'

fresh_run
printf '{"domain":"api","auditedSha":"%s","checklistToken":"%s","guardCanary":"denied"}\n' "$SHA" "$(token_of api-auditor)" > "$WORK/out/api-auditor.json"
out=$(gate); rc=$?
expect 'output with no findings array is refused' 1 'findings is not an array'

fresh_run
printf '{"domain":"api","auditedSha":"%s","checklistToken":"%s","guardCanary":"denied","findings":"none"}\n' "$SHA" "$(token_of api-auditor)" > "$WORK/out/api-auditor.json"
out=$(gate); rc=$?
expect 'output with a non-array findings value is refused' 1 'findings is not an array'

fresh_run
write_output api-auditor "$(token_of api-auditor)" denied "$SHA" privacy
out=$(gate); rc=$?
expect 'output naming another domain is refused' 1 'domain is "privacy"'

ember_run id-a
sed -i.bak 's/"domain":"ember-slice-1"/"domain":"privacy"/' "$WORK/out/slice-1.json"
out=$(gate_ember 1 "$WORK/out/slice-1.json"); rc=$?
expect 'an ember slice with a non-ember domain is refused' 1 'domain is "privacy"'

fresh_run
touch -t "$STALE_STAMP" "$WORK/out/dependency-auditor.json"
out=$(gate); rc=$?
expect 'an output file older than the run is refused' 1 'older than --since'

fresh_run
printf '{"domain":"api","auditedSha":"%s","checklistToken":"%s","guardCanary":"denied","note":"caf\xc3\xa9","findings":[]}\n' "$SHA" "$(token_of api-auditor)" > "$WORK/out/api-auditor.json"
printf '{"ts":"%s","sha":"%s","agent":"api-auditor","agent_id":"id-api-auditor","tool":"Read","path":"caf\xc3\xa9.md"}\n' "$AFTER" "$SHA" \
  >> "$ROOT/audit-reports/run-log/examined-${SHA:0:8}.jsonl"
out=$(LC_ALL=C LANG=C gate); rc=$?
expect 'non-ASCII output, log and agent files read correctly in a C locale' 0 'audit-fanout-gate: PASS (6 finder(s)'

echo "== run shape =="
fresh_run
rm "$WORK/out/accessibility-auditor.json"
out=$(gate); rc=$?
expect 'full mode refuses a dropped finder' 1 'not listed, but mode full requires it'

fresh_run
rm "$WORK/out/accessibility-auditor.json" "$WORK/out/code-hygiene-auditor.json"
out=$(gate --mode light); rc=$?
expect 'a light run may skip accessibility and code-hygiene' 0 'audit-fanout-gate: PASS (4 finder(s)'

fresh_run
rm "$WORK/out/privacy-auditor.json"
out=$(gate --mode light); rc=$?
expect 'a light run may not skip privacy' 1 'not listed, but mode light requires it'

fresh_run
log_line ember-upgrade-auditor "$AFTER"
printf '{"domain":"ember-x","auditedSha":"%s","checklistToken":"%s","guardCanary":"denied","findings":[]}\n' "$SHA" "$(token_of ember-upgrade-auditor)" > "$WORK/out/ember-upgrade-auditor.json"
out=$(gate); rc=$?
expect 'full mode refuses a finder outside the six' 1 'not one of the six /audit-run finders'

fresh_run
cp "$WORK/out/api-auditor.json" "$WORK/api-second.json"
log_line api-auditor "$AFTER" 'git log' id-second
out=$(gate --finder "api-auditor=$WORK/api-second.json"); rc=$?
expect 'full mode refuses a second output for one finder' 1 'one output per finder'

ember_run id-a id-b
out=$(gate_ember 3 "$WORK/out/slice-1.json" "$WORK/out/slice-2.json"); rc=$?
expect 'partial mode refuses a count other than --expect' 1 '--expect 3 but 2 output(s) listed'

echo "== usage =="
fresh_run
out=$(ruby "$GATE" --root "$ROOT" --sha "$SHA" --since 'not-a-time' --finder "api-auditor=$WORK/out/api-auditor.json" 2>&1); rc=$?
expect 'an unparseable --since is an error' 2 '--since must be an ISO8601 time'

out=$(ruby "$GATE" --root "$ROOT" --sha abc123 --since "$SINCE" --finder "api-auditor=$WORK/out/api-auditor.json" 2>&1); rc=$?
expect 'a short --sha is an error' 2 '--sha must be a full'

out=$(ruby "$GATE" --root "$ROOT" --sha "$SHA" --since "$SINCE" 2>&1); rc=$?
expect 'no --finder is an error' 2 'at least one --finder'

out=$(gate --mode nonsense); rc=$?
expect 'an unknown mode is an error' 2 '--mode must be'

out=$(gate --mode partial); rc=$?
expect 'partial with no --expect is an error' 2 '--mode partial needs --expect'

out=$(gate --expect 6); rc=$?
expect '--expect outside partial is an error' 2 '--expect only applies to --mode partial'

out=$(gate --expect many); rc=$?
expect 'a non-numeric --expect is an error' 2 'invalid argument'

echo "== real logger =="
# A temp git repo, so the logger's own `git rev-parse HEAD` and toplevel apply. Real events in, real
# log out: this is the contract the gate's fixtures above assume.
LOGROOT="$WORK/logroot"
mkdir -p "$LOGROOT/.claude" "$WORK/logout"
cp -r "$REPO_ROOT/.claude/agents" "$REPO_ROOT/.claude/skills" "$LOGROOT/.claude/"
git -C "$LOGROOT" init -q
git -C "$LOGROOT" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false commit -q --allow-empty -m probe
LOGSHA="$(git -C "$LOGROOT" rev-parse HEAD)"
LOGFILE="$LOGROOT/audit-reports/run-log/examined-${LOGSHA:0:8}.jsonl"

# log_event <agent> <json event>
log_event() {
  (cd "$LOGROOT" && printf '%s' "$2" | bash "$LOGGER" "$1")
}

# real_gate <extra args>
real_gate() {
  ruby "$GATE" --root "$LOGROOT" --sha "$LOGSHA" --since "$SINCE" --mode partial --expect 1 \
    --finder "api-auditor=$WORK/logout/api.json" 2>&1
}

printf '{"domain":"api","auditedSha":"%s","checklistToken":"%s","guardCanary":"denied","findings":[]}\n' \
  "$LOGSHA" "$(token_of api-auditor)" > "$WORK/logout/api.json"

log_event api-auditor '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}'
out=$(real_gate); rc=$?
expect 'a real logger line with no agent id in the event is refused' 1 '0 spawn id(s) in the log for 1 output(s)'

log_event api-auditor '{"agent_id":"a-1","tool_name":"Read","tool_input":{"file_path":"README.md"}}'
out=$(real_gate); rc=$?
expect 'a real logger line with an agent id passes' 0 'audit-fanout-gate: PASS (1 finder(s)'

log_event api-auditor '{"agent_id":"bad id; rm -rf /","tool_name":"Read","tool_input":{"file_path":"README.md"}}'
total=$((total + 1))
if ruby -rjson -e 'exit(JSON.parse(File.readlines(ARGV[0]).last).key?("agent_id") ? 1 : 0)' "$LOGFILE"; then
  printf '  ok   the logger drops an agent id that is not an opaque token\n'
else
  printf '  FAIL the logger wrote an agent id that is not an opaque token\n'
  fails=$((fails + 1))
fi

# Real events carry tool results, so one with non-ASCII text must still log in a C locale.
log_count=$(wc -l < "$LOGFILE")
(cd "$LOGROOT" && printf '{"agent_id":"a-2","tool_name":"Read","tool_input":{"file_path":"README.md"},"tool_response":"caf\xc3\xa9"}' | LC_ALL=C LANG=C bash "$LOGGER" api-auditor)
total=$((total + 1))
if [ "$(wc -l < "$LOGFILE")" -eq $((log_count + 1)) ]; then
  printf '  ok   the logger records a non-ASCII event in a C locale\n'
else
  printf '  FAIL the logger dropped a non-ASCII event in a C locale\n'
  fails=$((fails + 1))
fi

log_event api-auditor '{"agent_id":"a-1","tool_name":"Bash","tool_input":{"command":"mktemp --dry-run"}}'
out=$(real_gate); rc=$?
expect 'a canary the real logger recorded is refused' 1 'read-only guard did not deny it'

echo "== audit-merge restamp =="
printf '{"meta":{"auditedSha":"old"},"findings":[]}\n' > "$WORK/reg.json"
printf '{"domain":"api","auditedSha":"%s","findings":[]}\n' "$SHA" > "$WORK/match.json"
printf '{"domain":"api","auditedSha":"ffffffffffffffffffffffffffffffffffffffff","findings":[]}\n' > "$WORK/other.json"
printf '{"domain":"api","findings":[]}\n' > "$WORK/nosha.json"

rm -f "$WORK/reg-out.json"
out=$(ruby "$MERGE" --register "$WORK/reg.json" --sha "$SHA" --in "$WORK/match.json" --out "$WORK/reg-out.json" 2>&1); rc=$?
expect 'a restamping merge of output at --sha passes' 0 'restampedMeta=true'

rm -f "$WORK/reg-out.json"
out=$(ruby "$MERGE" --register "$WORK/reg.json" --sha "$SHA" --in "$WORK/match.json" --in "$WORK/other.json" --out "$WORK/reg-out.json" 2>&1); rc=$?
expect 'a restamping merge refuses output from another SHA' 1 'not the SHA being restamped'
total=$((total + 1))
if [ ! -e "$WORK/reg-out.json" ]; then
  printf '  ok   a refused merge writes no register\n'
else
  printf '  FAIL a refused merge wrote a register\n'
  fails=$((fails + 1))
fi

out=$(ruby "$MERGE" --register "$WORK/reg.json" --sha "$SHA" --in "$WORK/nosha.json" --out "$WORK/reg-out.json" 2>&1); rc=$?
expect 'a restamping merge refuses output naming no SHA' 1 'not the SHA being restamped'

out=$(ruby "$MERGE" --register "$WORK/reg.json" --sha "$SHA" --no-restamp --in "$WORK/nosha.json" --out "$WORK/reg-out.json" 2>&1); rc=$?
expect '--no-restamp does not apply the SHA check' 0 'restampedMeta=false'

echo
if [ "$fails" -eq 0 ]; then
  echo "audit-fanout-gate-test: OK ($total cases)"
  exit 0
else
  echo "audit-fanout-gate-test: FAILED ($fails of $total cases)"
  exit 1
fi
