#!/usr/bin/env bash
# phase5-armor-test.sh - dry-run cases for the Cloud Armor step of scripts/gcp/phase5-frontend-lb.sh.
#
# Runs the script against fake-gcloud (this directory) for each case and asserts the exit code and
# the gcloud calls it made. It never calls the real gcloud: the script runs under `env -i` with a
# PATH that holds only a private bin directory (the fake, linked as `gcloud`, plus a few coreutils),
# and the fake refuses to run unless it is the first `gcloud` on that PATH.
#
# Usage: scripts/gcp/test/phase5-armor-test.sh [CASE_REGEX]
#   SCRIPT=<path>     script under test (default: ../phase5-frontend-lb.sh next to this directory)
#   BASH3_BIN=<path>  a bash older than 4 for the version-guard case (default: /bin/bash when it is
#                     older than 4, as on macOS; the case is SKIPPED when none is available)
#   KEEP_OUT=1        keep the per-case output directory and print its path
# Needs bash >= 4. Docker is optional, e.g.:
#   docker run --rm --network none -v "$PWD":/repo:ro -w /repo ruby:3.4.4-slim \
#     bash scripts/gcp/test/phase5-armor-test.sh
if [ "${BASH_VERSINFO:-0}" -lt 4 ] 2>/dev/null; then
  echo "phase5-armor-test.sh needs bash >= 4 (this is ${BASH_VERSION:-not bash})." >&2
  exit 2
fi
set -uo pipefail
# Cases pipe the expected calls into expect_calls. Without lastpipe that function runs in a subshell
# and the failure fail() records is lost, so every piped check would pass. The self-check at the end
# proves a wrong piped expectation fails.
shopt -s lastpipe

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT:-$HERE/../phase5-frontend-lb.sh}"
FILTER="${1:-}"
[ -f "$SCRIPT" ] || { echo "script under test not found: $SCRIPT" >&2; exit 2; }
[ -f "$HERE/fake-gcloud" ] || { echo "fake-gcloud not found next to the driver" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/phase5-armor-test.XXXXXX")"
if [ "${KEEP_OUT:-0}" = "1" ]; then echo "output: $WORK"; else trap 'rm -rf "$WORK"' EXIT; fi

# Private bin: the fake as `gcloud` plus the tools the script and the fake use. Nothing else.
BIN="$WORK/bin"; mkdir -p "$BIN"
ln -s "$HERE/fake-gcloud" "$BIN/gcloud"
ln -s "$BASH" "$BIN/bash"
for t in env grep cat mkdir touch dirname basename; do
  p="$(command -v "$t")" || { echo "missing tool: $t" >&2; exit 2; }
  ln -s "$p" "$BIN/$t"
done
resolved="$(env -i PATH="$BIN" "$BASH" -c 'command -v gcloud')"
if [ "$resolved" != "$BIN/gcloud" ]; then
  echo "isolation check failed: gcloud resolves to '$resolved', not the fake. Aborting." >&2
  exit 2
fi

P=lingolinq-armor
PROJ=fake-project
ATTACHED_URL="https://www.googleapis.com/compute/v1/projects/$PROJ/global/securityPolicies/$P"

PASS=0; FAIL=0; SKIP=0; RESULTS=()
CASE=""; CASE_ERR=""; OUT=""; RC=0

# run NAME [VAR=VAL ...] - run the script under the fake with the base environment plus the given vars.
run() {
  CASE="$1"; shift; CASE_ERR=""
  OUT="$WORK/out/$CASE"; mkdir -p "$OUT"
  : > "$OUT/argv"
  env -i PATH="$BIN" HOME="$OUT" STUB_LOG="$OUT/argv" STUB_STATE="$OUT/state" \
    PROJECT_ID="$PROJ" DOMAIN=app.example.com "$@" \
    "${RUN_BASH:-$BASH}" "$SCRIPT" > "$OUT/output" 2>&1
  RC=$?
  # Mutating calls: everything except reads and the routine `services enable` in step 1.
  grep -vE '(^| )describe( |$)|^auth list|^services enable' "$OUT/argv" > "$OUT/calls" || true
}
selected() { [ -z "$FILTER" ] || [[ "$1" =~ $FILTER ]]; }
fail() { CASE_ERR="${CASE_ERR}      - $*"$'\n'; }
expect_exit() { [ "$RC" = "$1" ] || fail "exit $RC, expected $1"; }
expect_no_gcloud() { [ ! -s "$OUT/argv" ] || fail "expected no gcloud call, got $(wc -l < "$OUT/argv" | tr -d ' ')"; }
# expect_calls: the exact list of mutating calls, in order, one per line on stdin (may be empty).
expect_calls() {
  local want; want="$(cat)"
  if [ "$want" != "$(cat "$OUT/calls")" ]; then
    fail "mutating calls differ"$'\n'"        want: ${want//$'\n'/$'\n'        want: }"$'\n'"        got:  $(sed 's/^/        got:  /;1s/^        got:  //' "$OUT/calls")"
  fi
}
expect_out() { grep -qE -- "$1" "$OUT/output" || fail "output lacks /$1/"; }
expect_not_out() { ! grep -qE -- "$1" "$OUT/output" || fail "output has /$1/"; }
done_case() {
  if [ -z "$CASE_ERR" ]; then PASS=$((PASS + 1)); RESULTS+=("PASS  $CASE")
  else FAIL=$((FAIL + 1)); RESULTS+=("FAIL  $CASE"$'\n'"${CASE_ERR%$'\n'}")
  fi
}
skip_case() { SKIP=$((SKIP + 1)); RESULTS+=("SKIP  $1 ($2)"); }

waf_create() { # priority ruleset
  echo "compute security-policies rules create $1 --project=$PROJ --security-policy=$P --expression=evaluatePreconfiguredWaf('$2', {'sensitivity': 1}) --action=deny-403 --preview"
}
rl_create() { # [count interval], default 600 60
  echo "compute security-policies rules create 2000 --project=$PROJ --security-policy=$P --src-ip-ranges=* --action=throttle --rate-limit-threshold-count=${1:-600} --rate-limit-threshold-interval-sec=${2:-60} --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP --preview"
}
flip() { echo "compute security-policies rules update $1 --project=$PROJ --security-policy=$P --no-preview"; }
attach() { echo "compute backend-services update lingolinq-web-be --project=$PROJ --global --security-policy=$P"; }
new_policy_calls() { # log level
  echo "compute security-policies create $P --project=$PROJ --description=LingoLinq edge WAF + rate limiting (front of lingolinq-web)"
  echo "compute security-policies update $P --project=$PROJ --log-level=$1 --json-parsing=STANDARD"
  waf_create 1001 sqli-v422-stable; waf_create 1002 xss-v422-stable
  waf_create 1003 lfi-v422-stable; waf_create 1004 rce-v422-stable
  rl_create; attach
}
ARMOR=(CONFIRM_LB=1 CONFIRM_ARMOR=1)
# refused_up_front NAME REASON_REGEX [VAR=VAL ...]: a refusal, for that reason, before any gcloud call.
refused_up_front() { local name="$1" why="$2"; shift 2; selected "$name" || return 0
  run "$name" "$@"; expect_exit 1; expect_no_gcloud; expect_out "$why"; done_case; }

# ---------------------------------------------------------------- existing behaviour (rounds 1-2)
if selected A_existing_noflags; then run A_existing_noflags "${ARMOR[@]}"
  expect_exit 0; expect_calls < /dev/null; done_case; fi
if selected B_existing_enforce1002; then run B_existing_enforce1002 "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002
  expect_exit 0; flip 1002 | expect_calls; done_case; fi
if selected C_missing_policy; then run C_missing_policy "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED=
  expect_exit 0; new_policy_calls NORMAL | expect_calls; done_case; fi
if selected D_missing_policy_verbose; then run D_missing_policy_verbose "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED= ARMOR_LOG_LEVEL=VERBOSE
  expect_exit 0; new_policy_calls VERBOSE | expect_calls; done_case; fi
refused_up_front E_legacy_armor_enforce 'ARMOR_ENFORCE is retired' "${ARMOR[@]}" ARMOR_ENFORCE=1 CONFIRM_ARMOR_ENFORCE=1
refused_up_front F_enforce_without_confirm 'also requires CONFIRM_ARMOR_ENFORCE=1002' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002
refused_up_front G_enforce_2000 'cannot include rate-limit rule 2000' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=2000 CONFIRM_ARMOR_ENFORCE=2000
refused_up_front H_enforce_without_confirm_armor 'ARMOR_ENFORCE_RULES needs CONFIRM_LB=1 CONFIRM_ARMOR=1' CONFIRM_LB=1 ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002
if selected I_existing_verbose_live; then run I_existing_verbose_live "${ARMOR[@]}" STUB_LOG_LEVEL=VERBOSE
  expect_exit 0; expect_calls < /dev/null; expect_out 'GATE.*logs at VERBOSE'; done_case; fi
if selected J_bare_plan; then run J_bare_plan
  expect_exit 0; expect_calls < /dev/null; expect_out 'Step 1 \(load balancer\) SKIPPED'; done_case; fi
if selected K_rate_limit_enforce; then run K_rate_limit_enforce "${ARMOR[@]}" RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
  # Review round 3 results, item 1: with no RATE_LIMIT_COUNT/RATE_LIMIT_INTERVAL_SEC given, the flip
  # sends only --no-preview, so a hand-tuned threshold survives (was: full config at 600/60).
  expect_exit 0; flip 2000 | expect_calls
  done_case; fi
if selected M_other_policy_attached; then run M_other_policy_attached "${ARMOR[@]}" STUB_POLICY=missing \
    STUB_ATTACHED=https://x/projects/$PROJ/global/securityPolicies/some-other-policy ARMOR_POLICY=lingolinq-armr
  expect_exit 1; expect_calls < /dev/null; expect_out "already has security policy 'some-other-policy'"; done_case; fi
if selected N_existing_detached; then run N_existing_detached "${ARMOR[@]}" STUB_ATTACHED=
  expect_exit 0; expect_calls < /dev/null; expect_out 'GATE.*NOT re-attaching.*CONFIRM_ARMOR_ATTACH=lingolinq-armor'; done_case; fi
if selected O_existing_detached_confirm; then run O_existing_detached_confirm "${ARMOR[@]}" STUB_ATTACHED= CONFIRM_ARMOR_ATTACH=$P
  expect_exit 0; attach | expect_calls; done_case; fi
if selected P_enforce_missing_policy; then run P_enforce_missing_policy "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED= ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002
  expect_exit 1; expect_calls < /dev/null; expect_out 'does not exist yet'; done_case; fi
if selected Q_enforce_missing_rule; then run Q_enforce_missing_rule "${ARMOR[@]}" STUB_MISSING_RULES=1003 ARMOR_ENFORCE_RULES=1003 CONFIRM_ARMOR_ENFORCE=1003
  expect_exit 1; expect_calls < /dev/null; expect_out 'rule 1003 is named in ARMOR_ENFORCE_RULES but does not exist'; done_case; fi
if selected R_backend_read_fail; then run R_backend_read_fail "${ARMOR[@]}" STUB_BACKEND_READ_FAIL=1
  expect_exit 1; expect_calls < /dev/null; done_case; fi
refused_up_front S_only_commas 'names no rule' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=,, CONFIRM_ARMOR_ENFORCE=1002
refused_up_front T_dash_n 'only digits, commas and spaces' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=-n CONFIRM_ARMOR_ENFORCE=1002
refused_up_front U_confirm_without_rule 'names no rule' "${ARMOR[@]}" CONFIRM_ARMOR_ENFORCE=1002
refused_up_front V_star 'only digits, commas and spaces' "${ARMOR[@]}" 'ARMOR_ENFORCE_RULES=*' CONFIRM_ARMOR_ENFORCE=1002
if selected W_json_unset; then run W_json_unset "${ARMOR[@]}" STUB_JSON=
  expect_exit 0; expect_calls < /dev/null; expect_out 'GATE.*JSON parsing unset'; done_case; fi
if selected X_json_disabled; then run X_json_disabled "${ARMOR[@]}" STUB_JSON=DISABLED
  expect_exit 0; expect_calls < /dev/null; expect_out 'GATE.*JSON parsing DISABLED'; done_case; fi
if selected Y_missing_rule_recreated_in_preview; then run Y_missing_rule_recreated_in_preview "${ARMOR[@]}" STUB_MISSING_RULES=1003
  expect_exit 0; waf_create 1003 lfi-v422-stable | expect_calls; done_case; fi
if selected Z_legacy_armor_enforce_empty; then run Z_legacy_armor_enforce_empty "${ARMOR[@]}" ARMOR_ENFORCE=
  expect_exit 0; expect_calls < /dev/null; done_case; fi
refused_up_front Z_legacy_armor_enforce_true 'ARMOR_ENFORCE is retired' "${ARMOR[@]}" ARMOR_ENFORCE=true
refused_up_front Z_log_level_lowercase 'ARMOR_LOG_LEVEL must be' ARMOR_LOG_LEVEL=normal

# ---------------------------------------------------------------- review round 3
# 1. One rule per run, structurally.
refused_up_front R3_1a_two_rules_comma 'one rule per run' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1001,1003 CONFIRM_ARMOR_ENFORCE=1001
refused_up_front R3_1b_four_rules_space 'one rule per run' "${ARMOR[@]}" 'ARMOR_ENFORCE_RULES=1001 1002 1003 1004' CONFIRM_ARMOR_ENFORCE=1001
refused_up_front R3_1c_duplicate_rule 'one rule per run' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002,1002 CONFIRM_ARMOR_ENFORCE=1002
refused_up_front R3_1d_rule_and_rate_limit 'not together with RATE_LIMIT_ENFORCE' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002 RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
# 2. The confirm names its target.
if selected R3_2a_old_confirm_form; then run R3_2a_old_confirm_form "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1
  expect_exit 1; expect_no_gcloud; expect_out 'CONFIRM_ARMOR_ENFORCE=1002'; done_case; fi
refused_up_front R3_2b_confirm_other_rule 'must name the same rule' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1003
refused_up_front R3_2c_confirm_yes 'must name the same rule' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=yes
if selected R3_2d_attach_old_form; then run R3_2d_attach_old_form "${ARMOR[@]}" STUB_ATTACHED= CONFIRM_ARMOR_ATTACH=1
  expect_exit 1; expect_no_gcloud; expect_out "CONFIRM_ARMOR_ATTACH=$P"; done_case; fi
refused_up_front R3_2e_attach_other_name 'CONFIRM_ARMOR_ATTACH must be' "${ARMOR[@]}" STUB_ATTACHED= CONFIRM_ARMOR_ATTACH=lingolinq-armr
if selected R3_2f_plan_names_rule; then run R3_2f_plan_names_rule "${ARMOR[@]}" ARMOR_ENFORCE_RULES=' 1002 ' CONFIRM_ARMOR_ENFORCE=1002
  expect_exit 0; flip 1002 | expect_calls; expect_out 'flip to ENFORCE this run: 1002;'; done_case; fi
# 3. Odd input is refused before parsing.
refused_up_front R3_3a_newline 'only digits, commas and spaces' "${ARMOR[@]}" $'ARMOR_ENFORCE_RULES=1002\n1003' CONFIRM_ARMOR_ENFORCE=1002
refused_up_front R3_3b_tab 'only digits, commas and spaces' "${ARMOR[@]}" $'ARMOR_ENFORCE_RULES=1002\t' CONFIRM_ARMOR_ENFORCE=1002
refused_up_front R3_3c_letter 'only digits, commas and spaces' "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002a CONFIRM_ARMOR_ENFORCE=1002
refused_up_front R3_3d_semicolon 'only digits, commas and spaces' "${ARMOR[@]}" 'ARMOR_ENFORCE_RULES=1002;' CONFIRM_ARMOR_ENFORCE=1002
# 4. Fail closed on read errors; only a not-found error means missing.
if selected R3_4a_policy_read_error; then run R3_4a_policy_read_error "${ARMOR[@]}" STUB_POLICY=error
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
if selected R3_4b_rule_read_error; then run R3_4b_rule_read_error "${ARMOR[@]}" STUB_RULE_READ_ERROR=1003
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
if selected R3_4c_rule2000_read_error; then run R3_4c_rule2000_read_error "${ARMOR[@]}" STUB_RULE_READ_ERROR=2000
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
if selected R3_4d_read_error_after_missing_rule; then run R3_4d_read_error_after_missing_rule "${ARMOR[@]}" STUB_MISSING_RULES=1001 STUB_RULE_READ_ERROR=1004
  expect_exit 1; expect_calls < /dev/null; done_case; fi
if selected R3_4e_attached_but_policy_missing; then run R3_4e_attached_but_policy_missing "${ARMOR[@]}" STUB_POLICY=missing
  expect_exit 1; expect_calls < /dev/null; expect_out 'attached to lingolinq-web-be but'; done_case; fi
if selected R3_4f_missing_rule_nocontain_wording; then run R3_4f_missing_rule_nocontain_wording "${ARMOR[@]}" STUB_MISSING_RULES=1003 STUB_RULE_MISSING_MSG=nocontain
  expect_exit 0; waf_create 1003 lfi-v422-stable | expect_calls; done_case; fi
if selected R3_4g_enforce_rule_read_error; then run R3_4g_enforce_rule_read_error "${ARMOR[@]}" STUB_RULE_READ_ERROR=1002 ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
# 5. bash < 4 is refused before any gcloud call.
if selected R3_5_bash3_refused; then
  b3="${BASH3_BIN:-}"
  if [ -z "$b3" ] && [ -x /bin/bash ] && [ "$(/bin/bash -c 'echo ${BASH_VERSINFO[0]}')" -lt 4 ]; then b3=/bin/bash; fi
  if [ -n "$b3" ]; then
    RUN_BASH="$b3" run R3_5_bash3_refused "${ARMOR[@]}"
    expect_exit 1; expect_no_gcloud; expect_out 'needs bash 4'; done_case
  else skip_case R3_5_bash3_refused "no bash older than 4 available; set BASH3_BIN"; fi
fi
# 6. Rate-limit checks happen up front.
refused_up_front R3_6a_rl_without_confirm_bare 'also requires CONFIRM_RATE_LIMIT_ENFORCE=1' RATE_LIMIT_ENFORCE=1
refused_up_front R3_6b_rl_without_confirm 'also requires CONFIRM_RATE_LIMIT_ENFORCE=1' "${ARMOR[@]}" RATE_LIMIT_ENFORCE=1
refused_up_front R3_6c_rl_without_lb_armor 'RATE_LIMIT_ENFORCE=1 needs CONFIRM_LB=1 CONFIRM_ARMOR=1' RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
refused_up_front R3_6d_rl_without_armor 'RATE_LIMIT_ENFORCE=1 needs CONFIRM_LB=1 CONFIRM_ARMOR=1' CONFIRM_LB=1 RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
# 7/8. The handoff text exports the policy before any teardown.
if selected R3_7_handoff_export_before_delete; then run R3_7_handoff_export_before_delete "${ARMOR[@]}"
  expect_exit 0; expect_calls < /dev/null; expect_out 'security-policies export lingolinq-armor --file-name=.* --file-format=yaml'
  expect_out 'never commit'; done_case; fi

# ---------------------------------------------------------------- review round 3 results
# 1. Enforcing an existing rule 2000 keeps its live threshold unless the operator passed one.
if selected R3b_1a_rl_enforce_explicit_threshold; then run R3b_1a_rl_enforce_explicit_threshold "${ARMOR[@]}" RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 RATE_LIMIT_COUNT=900 RATE_LIMIT_INTERVAL_SEC=120
  expect_exit 0
  echo "compute security-policies rules update 2000 --project=$PROJ --security-policy=$P --rate-limit-threshold-count=900 --rate-limit-threshold-interval-sec=120 --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP --no-preview" | expect_calls
  done_case; fi
refused_up_front R3b_1b_rl_enforce_count_only 'set both RATE_LIMIT_COUNT and RATE_LIMIT_INTERVAL_SEC' "${ARMOR[@]}" RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 RATE_LIMIT_COUNT=900
refused_up_front R3b_1c_rl_enforce_interval_only 'set both RATE_LIMIT_COUNT and RATE_LIMIT_INTERVAL_SEC' "${ARMOR[@]}" RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 RATE_LIMIT_INTERVAL_SEC=120
if selected R3b_1d_rl_enforce_empty_values_mean_unset; then run R3b_1d_rl_enforce_empty_values_mean_unset "${ARMOR[@]}" RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 RATE_LIMIT_COUNT= RATE_LIMIT_INTERVAL_SEC=
  expect_exit 0; flip 2000 | expect_calls; done_case; fi
if selected R3b_1e_rl_enforce_banner_says_live_threshold_kept; then run R3b_1e_rl_enforce_banner_says_live_threshold_kept "${ARMOR[@]}" RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
  expect_exit 0; expect_out 'live threshold kept'; expect_not_out 'ENFORCE at 600/60s'; done_case; fi
if selected R3b_1f_new_rule2000_uses_given_threshold; then run R3b_1f_new_rule2000_uses_given_threshold "${ARMOR[@]}" STUB_MISSING_RULES=2000 RATE_LIMIT_COUNT=900 RATE_LIMIT_INTERVAL_SEC=120
  expect_exit 0; rl_create 900 120 | expect_calls; done_case; fi
# 2. Rule 2000 never starts in enforce.
if selected R3b_2a_rl_enforce_missing_policy; then run R3b_2a_rl_enforce_missing_policy "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED= RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
  expect_exit 1; expect_calls < /dev/null; expect_out 'does not exist yet'; done_case; fi
if selected R3b_2b_rl_enforce_missing_rule2000; then run R3b_2b_rl_enforce_missing_rule2000 "${ARMOR[@]}" STUB_MISSING_RULES=2000 RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
  expect_exit 1; expect_calls < /dev/null; expect_out 'rule 2000 does not exist'; done_case; fi
# 3. Only a not-found error for the resource being read counts as missing.
if selected R3b_3a_policy_warning_plus_error; then run R3b_3a_policy_warning_plus_error "${ARMOR[@]}" STUB_POLICY=noisy STUB_ATTACHED=
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
if selected R3b_3b_rule_warning_plus_error; then run R3b_3b_rule_warning_plus_error "${ARMOR[@]}" STUB_RULE_NOISY_ERROR=1003
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
if selected R3b_3c_notfound_names_other_policy; then run R3b_3c_notfound_names_other_policy "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED= STUB_NOTFOUND_OTHER=1
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
if selected R3b_3d_rule_notfound_names_other_policy; then run R3b_3d_rule_notfound_names_other_policy "${ARMOR[@]}" STUB_MISSING_RULES=1003 STUB_NOTFOUND_OTHER=1
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
if selected R3b_3e_missing_rule_specified_wording; then run R3b_3e_missing_rule_specified_wording "${ARMOR[@]}" STUB_MISSING_RULES=1003 STUB_RULE_MISSING_MSG=specified
  expect_exit 0; waf_create 1003 lfi-v422-stable | expect_calls; done_case; fi
# ---------------------------------------------------------------- review round 4 (senior-dev pass on #1319)
# 1. Enforcing needs the policy attached: a flip on a detached policy filters nothing, yet the
#    readback would show preview=false. Refused before any change unless the attach is confirmed.
if selected R4_1a_enforce_detached; then run R4_1a_enforce_detached "${ARMOR[@]}" STUB_ATTACHED= ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002
  expect_exit 1; expect_calls < /dev/null; expect_out 'not attached'; done_case; fi
if selected R4_1b_rl_enforce_detached; then run R4_1b_rl_enforce_detached "${ARMOR[@]}" STUB_ATTACHED= RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1
  expect_exit 1; expect_calls < /dev/null; expect_out 'not attached'; done_case; fi
if selected R4_1c_enforce_detached_confirmed; then run R4_1c_enforce_detached_confirmed "${ARMOR[@]}" STUB_ATTACHED= CONFIRM_ARMOR_ATTACH=$P ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002
  expect_exit 0; { flip 1002; attach; } | expect_calls; done_case; fi
if selected R4_1d_readback_names_attached; then run R4_1d_readback_names_attached "${ARMOR[@]}"
  expect_exit 0; expect_calls < /dev/null; expect_out "^    attached policy: $P\$"; done_case; fi
if selected R4_1e_readback_names_none; then run R4_1e_readback_names_none "${ARMOR[@]}" STUB_ATTACHED=
  expect_exit 0; expect_calls < /dev/null; expect_out '^    attached policy: NONE \(rules filter nothing\)$'; done_case; fi
# 2. A failed log-level / JSON-parsing update right after create stops the run (fail closed).
if selected R4_2_update_fail_after_create; then run R4_2_update_fail_after_create "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED= STUB_UPDATE_FAIL=1
  expect_exit 1; new_policy_calls NORMAL | head -2 | expect_calls; expect_out 'could not set log level'; done_case; fi
# 3. The batch error title ("Some requests did not succeed:") still reads as not-found.
if selected R4_3_batch_title_notfound; then run R4_3_batch_title_notfound "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED= STUB_ERROR_STYLE=batch
  expect_exit 0; new_policy_calls NORMAL | expect_calls; done_case; fi
# 4. A not-found that names another project is not "missing" here.
if selected R4_4_notfound_other_project; then run R4_4_notfound_other_project "${ARMOR[@]}" STUB_POLICY=missing STUB_ATTACHED= STUB_NOTFOUND_PROJECT=some-other-project
  expect_exit 1; expect_calls < /dev/null; expect_out 'could not read'; done_case; fi
# 6. An unreadable live log level is flagged, like unreadable JSON parsing.
if selected R3b_6_log_level_unreadable; then run R3b_6_log_level_unreadable "${ARMOR[@]}" STUB_LOG_LEVEL_READ_FAIL=1
  expect_exit 0; expect_calls < /dev/null; expect_out 'GATE.*log level could not be read'; done_case; fi

# ---------------------------------------------------------------- driver self-check
# A deliberately wrong piped expectation must be recorded as a failure, or the piped checks above
# prove nothing.
if selected Z_selfcheck_piped_mismatch_fails; then run Z_selfcheck_piped_mismatch_fails "${ARMOR[@]}" ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002
  flip 1003 | expect_calls
  if [ -n "$CASE_ERR" ]; then CASE_ERR=""; else fail "a wrong piped expectation was not caught"; fi
  done_case; fi

# ---------------------------------------------------------------- summary
echo
for r in "${RESULTS[@]}"; do echo "$r"; done
echo
echo "phase5-armor-test: $PASS passed, $FAIL failed, $SKIP skipped (script: $SCRIPT)"
[ "$FAIL" -eq 0 ]
