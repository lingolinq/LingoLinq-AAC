#!/usr/bin/env bash
#
# phase5-frontend-lb.sh - LingoLinq Render -> GCP Cloud Run migration, Phase 5 (5.3 front end).
#
# Builds the DECIDED Option B front end (decision memo
# ~/ai-company-brain/outputs/docs/2026-06-23-cloudrun-frontend-5-3-decision.md; runbook step 8):
# an external global HTTPS Application Load Balancer + Cloud Armor (WAF) in front of the
# lingolinq-web Cloud Run service, instead of mapping the domain straight to the run.app URL.
#
# Builds, in order (each behind a fail-closed gate):
#   [LB]       reserve a global static anycast IP   (DNS A-record target for the cutover)
#              serverless NEG -> lingolinq-web  +  EXTERNAL_MANAGED backend service
#              URL map + Google-managed SSL cert + target HTTPS proxy + :443 forwarding rule
#              HTTP :80 -> HTTPS redirect (url-map + proxy + forwarding rule)
#   [ARMOR]    Cloud Armor policy: preconfigured OWASP WAF rules (SQLi/XSS/LFI/RCE) in
#              PREVIEW (log-only) at LOW sensitivity + an edge rate-limit rule, attached to
#              the backend service. Preview + low sensitivity so real AAC traffic can be proven
#              NOT to false-positive before the WAF is switched to enforce.
#              CREATE-ONLY against a tuned policy: the policy's log level, JSON parsing and other
#              advanced options are set only when the policy is first created, and an existing WAF
#              rule is never rewritten, so hand-tuned expressions, signature opt-outs and
#              preconfigured-WAF exclusions survive a re-run. The only change a re-run makes to an
#              existing WAF rule is the per-rule preview -> enforce flip named in ARMOR_ENFORCE_RULES
#              (`rules update --no-preview`, which leaves expression and exclusions as they are).
#              A new WAF rule, and a new rate-limit rule 2000, always starts in preview: naming a
#              rule that does not exist yet (or a policy that does not exist yet) in
#              ARMOR_ENFORCE_RULES, or RATE_LIMIT_ENFORCE=1 without an existing rule 2000, is refused. A rule
#              1001-1004 or 2000 that is MISSING from an existing policy is recreated on a re-run, in
#              preview, with the script's default expression: its earlier tuning is not restored (do
#              that from the policy export, see the handoff block). The policy is attached to the
#              backend only when NO policy is attached: a different attached policy stops the run
#              before anything in Cloud Armor is created or attached (the Step 1 LB resources come
#              earlier), and an existing policy is re-attached to a bare backend only with
#              CONFIRM_ARMOR_ATTACH=<policy name> (it may have been detached on purpose).
#              Existence reads fail closed: a describe that fails with anything other than a
#              not-found error stops the run before any Cloud Armor change.
#   [LOCKDOWN] flip lingolinq-web ingress to internal-and-cloud-load-balancing so the public
#              run.app URL no longer bypasses Cloud Armor. RUN LAST, after the LB is validated.
#
# It does NOT flip DNS (runbook step 9, a separate gated cutover action) and does NOT enforce
# the WAF rules (they ship in preview). The enforce flip is a POST-REAL-TRAFFIC step (runbook step
# 9c): pre-DNS the LB receives no traffic (run.app bypasses it) and the no-users cutover soak is not
# representative either, so the preview logs prove nothing about false positives until real users
# hit the LB. Keep the WAF in preview through the cut AND the soak; review the preview logs only
# once REAL production traffic exists, then flip the sig rules to enforce ONE RULE AT A TIME
# (rate-limit 2000 separately).
#
# Design rules (same contract as scripts/gcp/phase3-data-layer.sh):
#   - Idempotent: every create is guarded by a describe check, so re-runs are safe. An existing
#     Cloud Armor policy and existing WAF rules 1001-1004 are never re-asserted to the script's
#     defaults (see [ARMOR]); the only deliberate rewrites of an existing rule are the per-rule
#     --no-preview flip and the separately gated rule 2000 enforce run, which is also `--no-preview`
#     only (the live threshold is kept) unless BOTH RATE_LIMIT_COUNT and RATE_LIMIT_INTERVAL_SEC are
#     passed, in which case it re-sends the threshold and the rest of 2000's rate-limit config.
#   - Fail-closed gates: each step runs ONLY when its CONFIRM_* flag is 1. A bare run prints
#     the plan + a rough cost estimate and stops before creating anything billable.
#   - Auditable: every command is commented with what it does and why (HIPAA evidence).
#   - Reversible: the ingress lockdown is undoable with `gcloud run services update
#     lingolinq-web --ingress=all`; teardown notes are in the handoff block at the end.
#
# IMPORTANT - SSL cert provisioning needs DNS: a Google-managed cert does NOT provision until
# the domain's DNS resolves to this LB's IP. So at cutover the cert is PENDING until step 9
# (DNS flip), and HTTPS on the custom domain only goes green after propagation. For the dress
# rehearsal, validate the LB path via the LB IP with a Host header / a hosts-file override (or a
# throwaway test subdomain pointed at the LB IP), not the production domain. Plan ~up to 60 min
# for the cert to provision after DNS.
#
# Usage:
#   DOMAIN=app.example.com ./scripts/gcp/phase5-frontend-lb.sh                 # plan + cost, stop
#   DOMAIN=... CONFIRM_LB=1 ./scripts/gcp/phase5-frontend-lb.sh                # + IP/NEG/BE/cert/proxy/FR
#   DOMAIN=... CONFIRM_LB=1 CONFIRM_ARMOR=1 ./scripts/gcp/phase5-frontend-lb.sh  # + Cloud Armor (preview)
#   DOMAIN=... CONFIRM_LB=1 CONFIRM_ARMOR=1 ARMOR_LOG_LEVEL=VERBOSE ...       # rehearsal only: NEW policy logs VERBOSE
#   DOMAIN=... CONFIRM_LB=1 CONFIRM_ARMOR=1 SET_GH_VARS=1 ...                  # + write repo vars (LB IP/domain)
#   DOMAIN=... CONFIRM_INGRESS_LOCKDOWN=1 ./scripts/gcp/phase5-frontend-lb.sh  # flip web to LB-only (LAST)
#   CONFIRM_LB=1 CONFIRM_ARMOR=1 ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002 DOMAIN=... ...  # ONE WAF sig rule -> enforce (POST-REAL-TRAFFIC)
#   ...CONFIRM_ARMOR=1 RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 ...  # rate-limit 2000 enforce (LATER, separate)
#   ...CONFIRM_ARMOR=1 CONFIRM_ARMOR_ATTACH=lingolinq-armor ...                # re-attach an EXISTING policy to a bare backend
#
# Pass ARMOR_ENFORCE_RULES, CONFIRM_ARMOR_ENFORCE and CONFIRM_ARMOR_ATTACH INLINE on the command line
# (as above), never `export` them: an exported value stays in the shell and rides along on the next
# run, which the script cannot tell apart from one typed for that run. If one was exported, `unset`
# it (e.g. `unset ARMOR_ENFORCE_RULES CONFIRM_ARMOR_ENFORCE CONFIRM_ARMOR_ATTACH`) before running.
#
# Needs bash 4 or newer (associative arrays); macOS /bin/bash is 3.2, so the script refuses to start
# there. Run it with a newer bash (e.g. Homebrew's) or from Cloud Shell.
#
# NOTE: WAF sig enforce (deny-403) is PER RULE and ONE RULE PER RUN: ARMOR_ENFORCE_RULES names the
# single rule priority (one of 1001-1004) to flip this run, and CONFIRM_ARMOR_ENFORCE must repeat
# that same rule number (the old CONFIRM_ARMOR_ENFORCE=1 form is refused). More than one rule, a
# repeated rule, any character other than digits, commas and spaces, or a rule flip together with
# RATE_LIMIT_ENFORCE=1 is refused. Rules not named are left exactly as they are, so a rule enforced
# on an earlier run stays enforced and a rule still in preview stays in preview. The old all-four
# ARMOR_ENFORCE=1 switch is retired and now refuses to run. Enforce ALSO needs CONFIRM_LB=1 and
# CONFIRM_ARMOR=1: step 1 hard-exits when CONFIRM_LB != 1, so without it the run would never reach
# the Cloud Armor block (ARMOR_ENFORCE_RULES or RATE_LIMIT_ENFORCE=1 without CONFIRM_LB=1
# CONFIRM_ARMOR=1 is refused up front rather than silently no-opping). The LB build is idempotent, so
# re-passing CONFIRM_LB=1 against the already-built LB just skips through to the Armor block.
# Rate-limit rule 2000 is gated SEPARATELY: ARMOR_ENFORCE_RULES never touches it (a no-users soak
# can't validate a per-IP limit against building-scale NAT); enforcing 2000 needs
# RATE_LIMIT_ENFORCE=1 + CONFIRM_RATE_LIMIT_ENFORCE=1, in a run of its own. That run sends only
# --no-preview to the existing rule 2000 and keeps its live threshold, unless BOTH RATE_LIMIT_COUNT and
# RATE_LIMIT_INTERVAL_SEC are passed (only one of them is refused). All of these checks run
# before any gcloud call. The ingress lockdown, by contrast, must be a SEPARATE invocation from the
# LB build so the LB path is validated before public run.app access is removed.
#
# Optional overrides: PROJECT_ID, REGION, WEB_SERVICE, WAF_SENSITIVITY, RATE_LIMIT_COUNT,
#   RATE_LIMIT_INTERVAL_SEC, ARMOR_LOG_LEVEL, ARMOR_JSON_PARSING, and the resource names below.
#   WAF_SENSITIVITY, ARMOR_LOG_LEVEL and ARMOR_JSON_PARSING only take effect when the policy or
#   rule is CREATED; they never change an existing one. RATE_LIMIT_COUNT/RATE_LIMIT_INTERVAL_SEC
#   set a new rule 2000's threshold, and change an existing one's only on a RATE_LIMIT_ENFORCE run
#   that passes both.
#

# bash 4+ only (step 2 uses `declare -A`). Checked before anything else, so an old bash stops here
# instead of dying part way through a run. ${BASH_VERSINFO:-0} reads element 0 and is safe in bash 3.
if [ "${BASH_VERSINFO:-0}" -lt 4 ] 2>/dev/null; then
  echo "ERROR: phase5-frontend-lb.sh needs bash 4 or newer (this is ${BASH_VERSION:-not bash})." >&2
  echo "       macOS /bin/bash is 3.2: run it with a newer bash, e.g. /opt/homebrew/bin/bash $0" >&2
  exit 1
fi

set -euo pipefail

# ---------------------------------------------------------------------------------------
# CONFIG (override via env)
# ---------------------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-lingolinq-prod}"
REGION="${REGION:-us-central1}"
WEB_SERVICE="${WEB_SERVICE:-lingolinq-web}"            # the Cloud Run service to front (deploy-cloudrun.yml)

# The production domain the LB serves. REQUIRED for the managed cert; no safe default, so we
# refuse to guess it. Set DOMAIN=... on the command line.
DOMAIN="${DOMAIN:-}"

# Resource names (all global except the regional serverless NEG).
LB_IP_NAME="${LB_IP_NAME:-lingolinq-lb-ip}"
NEG_NAME="${NEG_NAME:-lingolinq-web-neg}"
BACKEND_NAME="${BACKEND_NAME:-lingolinq-web-be}"
URLMAP_NAME="${URLMAP_NAME:-lingolinq-url-map}"
CERT_NAME="${CERT_NAME:-lingolinq-cert}"
HTTPS_PROXY_NAME="${HTTPS_PROXY_NAME:-lingolinq-https-proxy}"
HTTPS_FR_NAME="${HTTPS_FR_NAME:-lingolinq-https-fr}"
REDIRECT_URLMAP_NAME="${REDIRECT_URLMAP_NAME:-lingolinq-http-redirect}"
HTTP_PROXY_NAME="${HTTP_PROXY_NAME:-lingolinq-http-proxy}"
HTTP_FR_NAME="${HTTP_FR_NAME:-lingolinq-http-fr}"
ARMOR_POLICY="${ARMOR_POLICY:-lingolinq-armor}"

# Cloud Armor tuning. Low sensitivity + preview by default so the WAF does NOT block real AAC
# traffic (free-text utterances can resemble SQLi/XSS signatures) until proven clean in the
# post-real-traffic preview-log review (runbook step 9c) - not the no-users soak, never pre-DNS.
WAF_SENSITIVITY="${WAF_SENSITIVITY:-1}"               # 1 = fewest signatures/false positives; default GCP is 4. Used at rule CREATE only.
# Whether the operator passed a threshold (a non-empty value), recorded BEFORE the defaults below are
# applied. Enforcing an EXISTING rule 2000 re-sends the threshold only when both were passed, so a
# hand-tuned live threshold is never reset to these defaults.
RL_THRESHOLD_GIVEN=0
if [ -n "${RATE_LIMIT_COUNT:-}" ] && [ -n "${RATE_LIMIT_INTERVAL_SEC:-}" ]; then RL_THRESHOLD_GIVEN=1; fi
RL_THRESHOLD_HALF_GIVEN=0
if [ -n "${RATE_LIMIT_COUNT:-}${RATE_LIMIT_INTERVAL_SEC:-}" ] && [ "$RL_THRESHOLD_GIVEN" != "1" ]; then RL_THRESHOLD_HALF_GIVEN=1; fi
RATE_LIMIT_COUNT="${RATE_LIMIT_COUNT:-600}"          # requests per interval per client IP at the edge (used at rule 2000 CREATE; on enforce only when passed)
RATE_LIMIT_INTERVAL_SEC="${RATE_LIMIT_INTERVAL_SEC:-60}"
ARMOR_ENFORCE_RULES="${ARMOR_ENFORCE_RULES:-}"       # the ONE WAF sig rule priority (1001-1004) to flip to enforce (deny-403) THIS run, e.g. "1002". Empty = flip nothing. Never 2000.
RATE_LIMIT_ENFORCE="${RATE_LIMIT_ENFORCE:-0}"        # 0 = rate-limit rule 2000 stays in PREVIEW; 1 = enforce (deny-429). Independent of ARMOR_ENFORCE_RULES.
# Policy advanced options, applied ONLY when the policy is created (an existing policy keeps what
# it has). NORMAL logging by default: VERBOSE copies matched request-body content (which can carry
# tokens) into Cloud Logging, so it is an explicit opt-in for a rehearsal policy, never a default.
# STANDARD JSON parsing lets the WAF inspect JSON bodies field by field instead of as one string.
ARMOR_LOG_LEVEL="${ARMOR_LOG_LEVEL:-NORMAL}"          # NORMAL | VERBOSE
ARMOR_JSON_PARSING="${ARMOR_JSON_PARSING:-STANDARD}"  # DISABLED | STANDARD | STANDARD_WITH_GRAPHQL

# GitHub repo for repo-variable writes (needs `gh` CLI authed).
GH_REPO="${GH_REPO:-lingolinq/LingoLinq-AAC}"

# Gate flags (default 0 = do not run that gated step).
CONFIRM_LB="${CONFIRM_LB:-0}"
CONFIRM_ARMOR="${CONFIRM_ARMOR:-0}"
CONFIRM_ARMOR_ENFORCE="${CONFIRM_ARMOR_ENFORCE:-}"   # must repeat the rule number in ARMOR_ENFORCE_RULES, e.g. 1002, to flip it to deny-403
CONFIRM_RATE_LIMIT_ENFORCE="${CONFIRM_RATE_LIMIT_ENFORCE:-0}"  # extra gate required to flip rate-limit rule 2000 to deny-429
CONFIRM_ARMOR_ATTACH="${CONFIRM_ARMOR_ATTACH:-}"     # the policy name ($ARMOR_POLICY) to re-attach an EXISTING policy to a backend that has none attached (see step 2d)
CONFIRM_INGRESS_LOCKDOWN="${CONFIRM_INGRESS_LOCKDOWN:-0}"
SET_GH_VARS="${SET_GH_VARS:-0}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[1;33m(skip)\033[0m %s\n' "$*"; }
gate() { printf '\n\033[1;31m[GATE]\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------------------
# Armor input validation. Runs before preflight so a bad or stale enforce request fails closed
# on every run, including a bare plan run, instead of being silently ignored.
# ---------------------------------------------------------------------------------------
# ARMOR_ENFORCE=1 used to flip all four WAF sig rules at once. Enforcement is now one rule at a
# time, so refuse the old switch rather than guess which rule a stale command line meant.
if [ -n "${ARMOR_ENFORCE:-}" ] && [ "${ARMOR_ENFORCE}" != "0" ]; then
  echo "ERROR: ARMOR_ENFORCE is retired (it flipped rules 1001-1004 all at once)." >&2
  echo "       Name the one rule to enforce instead, e.g. ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002." >&2
  exit 1
fi
# Only digits, commas and spaces, checked on the raw value before it is split, so a newline, tab or
# any other character never reaches the parser.
case "$ARMOR_ENFORCE_RULES" in
  *[!0-9,\ ]*)
    printf 'ERROR: ARMOR_ENFORCE_RULES may contain only digits, commas and spaces (got %q).\n' "$ARMOR_ENFORCE_RULES" >&2
    exit 1 ;;
esac
# Split "1002" / " 1002, " into fields and accept only WAF sig priorities. `read -a` splits without
# globbing or option parsing.
ENFORCE_ITEMS=()
IFS=', ' read -r -a ENFORCE_ITEMS <<< "$ARMOR_ENFORCE_RULES" || true
ENFORCE_NAMED=()
for PRIO in ${ENFORCE_ITEMS[@]+"${ENFORCE_ITEMS[@]}"}; do
  case "$PRIO" in
    '') continue ;;   # empty field between separators, e.g. "1002,,"
    1001|1002|1003|1004) ;;
    2000)
      echo "ERROR: ARMOR_ENFORCE_RULES cannot include rate-limit rule 2000; it has its own gate" >&2
      echo "       (RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1)." >&2
      exit 1 ;;
    *)
      echo "ERROR: ARMOR_ENFORCE_RULES entry '$PRIO' is not a WAF sig rule (expected 1001-1004)." >&2
      exit 1 ;;
  esac
  ENFORCE_NAMED+=("$PRIO")
done
# One rule per run, structurally: watching one newly enforced rule under real traffic is the point.
# A repeated rule ("1002,1002") is refused too rather than silently collapsed.
if [ "${#ENFORCE_NAMED[@]}" -gt 1 ]; then
  echo "ERROR: ARMOR_ENFORCE_RULES names ${#ENFORCE_NAMED[@]} entries (${ENFORCE_NAMED[*]}); enforce is one rule per run." >&2
  echo "       Flip one rule, watch it under real traffic, then run again for the next." >&2
  exit 1
fi
ENFORCE_RULE="${ENFORCE_NAMED[0]:-}"
# A value that is set but names no rule (",,", " ") would otherwise flip nothing without a word, and
# a confirm with no rule named means the operator expected a flip that won't happen.
if [ -n "$ARMOR_ENFORCE_RULES" ] && [ -z "$ENFORCE_RULE" ]; then
  echo "ERROR: ARMOR_ENFORCE_RULES='$ARMOR_ENFORCE_RULES' names no rule. Name one of 1001-1004, or unset it." >&2
  exit 1
fi
if [ -z "$ENFORCE_RULE" ] && [ -n "$CONFIRM_ARMOR_ENFORCE" ] && [ "$CONFIRM_ARMOR_ENFORCE" != "0" ]; then
  echo "ERROR: CONFIRM_ARMOR_ENFORCE is set but ARMOR_ENFORCE_RULES names no rule, so nothing would be enforced." >&2
  echo "       Name the rule to flip, e.g. ARMOR_ENFORCE_RULES=1002 CONFIRM_ARMOR_ENFORCE=1002, or drop CONFIRM_ARMOR_ENFORCE." >&2
  exit 1
fi
# Enforce (deny-403) is a distinct, outage-capable action, so it needs its OWN gate on top of
# ARMOR_ENFORCE_RULES, and the gate names the rule it confirms, so a confirm typed for one rule can
# never flip another. (dual-review PR #476; per-rule since the rules are switched on one at a time)
if [ -n "$ENFORCE_RULE" ] && { [ -z "$CONFIRM_ARMOR_ENFORCE" ] || [ "$CONFIRM_ARMOR_ENFORCE" = "0" ]; }; then
  echo "ERROR: ARMOR_ENFORCE_RULES=$ENFORCE_RULE also requires CONFIRM_ARMOR_ENFORCE=$ENFORCE_RULE." >&2
  echo "       Enforce flips the named WAF sig rule from log-only to deny-403; confirm it" >&2
  echo "       deliberately AFTER real post-launch traffic shows no legitimate AAC request is flagged." >&2
  exit 1
fi
if [ -n "$ENFORCE_RULE" ] && [ "$CONFIRM_ARMOR_ENFORCE" != "$ENFORCE_RULE" ]; then
  echo "ERROR: CONFIRM_ARMOR_ENFORCE must name the same rule as ARMOR_ENFORCE_RULES (got '$CONFIRM_ARMOR_ENFORCE')." >&2
  echo "       Use CONFIRM_ARMOR_ENFORCE=$ENFORCE_RULE. The old CONFIRM_ARMOR_ENFORCE=1 form is retired." >&2
  exit 1
fi
if [ -n "$ENFORCE_RULE" ] && [ "$RATE_LIMIT_ENFORCE" = "1" ]; then
  echo "ERROR: ARMOR_ENFORCE_RULES=$ENFORCE_RULE is one change per run, not together with RATE_LIMIT_ENFORCE=1." >&2
  echo "       Flip the WAF rule and rate-limit rule 2000 in separate runs." >&2
  exit 1
fi
if [ -n "$ENFORCE_RULE" ] && { [ "$CONFIRM_LB" != "1" ] || [ "$CONFIRM_ARMOR" != "1" ]; }; then
  echo "ERROR: ARMOR_ENFORCE_RULES needs CONFIRM_LB=1 CONFIRM_ARMOR=1 to reach the Cloud Armor step;" >&2
  echo "       without them the flip would silently not happen." >&2
  exit 1
fi
# Rate-limit rule 2000 has its own gate (see step 2c). Checked here, before any gcloud call, like
# the WAF flip.
RL_ENFORCING=0
if [ "$RATE_LIMIT_ENFORCE" = "1" ]; then
  if [ "$CONFIRM_RATE_LIMIT_ENFORCE" != "1" ]; then
    echo "ERROR: RATE_LIMIT_ENFORCE=1 also requires CONFIRM_RATE_LIMIT_ENFORCE=1." >&2
    echo "       Enforce flips rate-limit rule 2000 to deny-429; confirm it deliberately AFTER the" >&2
    echo "       threshold is proven generous for building-scale NAT against real district traffic." >&2
    exit 1
  fi
  if [ "$CONFIRM_LB" != "1" ] || [ "$CONFIRM_ARMOR" != "1" ]; then
    echo "ERROR: RATE_LIMIT_ENFORCE=1 needs CONFIRM_LB=1 CONFIRM_ARMOR=1 to reach the Cloud Armor step;" >&2
    echo "       without them the flip would silently not happen." >&2
    exit 1
  fi
  # Re-tuning the threshold on the enforce run takes both values: sending one would leave the other at
  # this script's default, which is the reset this check exists to prevent.
  if [ "$RL_THRESHOLD_HALF_GIVEN" = "1" ]; then
    echo "ERROR: RATE_LIMIT_ENFORCE=1 with only one of RATE_LIMIT_COUNT / RATE_LIMIT_INTERVAL_SEC." >&2
    echo "       To change rule 2000's threshold while enforcing it," >&2
    echo "       set both RATE_LIMIT_COUNT and RATE_LIMIT_INTERVAL_SEC; to keep the live threshold, set neither." >&2
    exit 1
  fi
  RL_ENFORCING=1
fi
# Re-attaching an existing policy to a bare backend is confirmed by naming the policy.
ATTACH_CONFIRMED=0
case "$CONFIRM_ARMOR_ATTACH" in
  ''|0) ;;
  "$ARMOR_POLICY") ATTACH_CONFIRMED=1 ;;
  *)
    echo "ERROR: CONFIRM_ARMOR_ATTACH must be the policy name: CONFIRM_ARMOR_ATTACH=$ARMOR_POLICY (got '$CONFIRM_ARMOR_ATTACH')." >&2
    echo "       The old CONFIRM_ARMOR_ATTACH=1 form is retired." >&2
    exit 1 ;;
esac
case "$ARMOR_LOG_LEVEL" in NORMAL|VERBOSE) ;; *)
  echo "ERROR: ARMOR_LOG_LEVEL must be NORMAL or VERBOSE (got '$ARMOR_LOG_LEVEL')." >&2; exit 1 ;;
esac
case "$ARMOR_JSON_PARSING" in DISABLED|STANDARD|STANDARD_WITH_GRAPHQL) ;; *)
  echo "ERROR: ARMOR_JSON_PARSING must be DISABLED, STANDARD or STANDARD_WITH_GRAPHQL (got '$ARMOR_JSON_PARSING')." >&2; exit 1 ;;
esac
# True when PRIO is the rule this run was asked to flip to enforce.
rule_enforce_requested() { [ -n "$ENFORCE_RULE" ] && [ "$1" = "$ENFORCE_RULE" ]; }

# Existence reads for Cloud Armor fail closed. gcloud's compute client reports a failed read as
#   ERROR: (gcloud.<command>) Could not fetch resource:
#    - <server message>
# (googlecloudsdk/api_lib/compute/client_adapter.py MakeRequests -> utils.RaiseToolException, which
# lists each problem as " - <message>"). For a missing resource the server message is "The resource
# '<path>' was not found". Only that error block is read: lines before the first "ERROR:" line (a
# WARNING, say) are ignored, and "missing" means EVERY problem line in the block is the not-found
# message for the resource actually being read. Anything else (permission, quota, network, auth, a
# not-found for some other resource, an error shape this does not know) is NOT "missing".
# Not-found message for the policy itself (path from the server, so any project prefix is accepted).
armor_policy_nf_re() {
  printf '%s' "^The resource 'projects/$PROJECT_ID/global/securityPolicies/$ARMOR_POLICY' was not found\$"
}
# Not-found message for rule PRIO of the policy. Rule-level wording is ASSUMED, not confirmed against
# the live API: the resource-path form, "The specified security policy rule was not found", and
# "Invalid value for field 'priority': '<prio>'. The security policy does not contain a rule with the
# specified priority." An unknown wording fails closed (the run stops and prints gcloud's error).
armor_rule_nf_re() {
  printf '%s' "^(The resource 'projects/$PROJECT_ID/global/securityPolicies/$ARMOR_POLICY/rules/$1' was not found|The specified security policy rule was not found\.?|(Invalid value for field 'priority': '$1'\. )?The security policy does not contain a rule with the specified priority\.?)\$"
}
# armor_error_is_not_found ERR_TEXT NF_RE - 0 when ERR_TEXT is a gcloud error block whose every
# problem line matches NF_RE.
armor_error_is_not_found() {
  local err="$1" re="$2" line msg in_err=0 nf=0 other=0
  while IFS= read -r line; do
    case "$line" in
      'ERROR: '*)
        in_err=1
        msg="${line#ERROR: }"
        # Strip the "(gcloud.<command>) " prefix; what is left is the message or the list title.
        case "$msg" in '(gcloud.'*') '*) msg="${msg#*) }" ;; esac
        case "$msg" in
          'Could not fetch resource:'|'Some requests did not succeed:') ;;   # list title; problems follow
          *) if [[ "$msg" =~ $re ]]; then nf=1; else other=1; fi ;;
        esac ;;
      ' - '*)
        [ "$in_err" = "1" ] || continue
        msg="${line# - }"
        if [[ "$msg" =~ $re ]]; then nf=1; else other=1; fi ;;
      '') ;;
      *) [ "$in_err" = "1" ] && other=1 ;;   # any other line inside the error block is not understood
    esac
  done <<< "$err"
  [ "$nf" = "1" ] && [ "$other" = "0" ]
}
# armor_exists WHAT NF_RE GCLOUD_ARGS... - 0 = exists, 1 = not found; any other failure prints
# gcloud's error and stops the run.
armor_exists() {
  local what="$1" re="$2" err rc
  shift 2
  set +e
  err="$(gcloud "$@" 2>&1 >/dev/null)"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] && return 0
  if armor_error_is_not_found "$err" "$re"; then
    return 1
  fi
  printf '%s\n' "$err" >&2
  echo "ERROR: could not read $what (gcloud failed with something other than its not-found error)." >&2
  echo "       Stopping before any Cloud Armor change rather than treating it as missing." >&2
  exit 1
}

# ---------------------------------------------------------------------------------------
# 0. PREFLIGHT - right operator, project exists, billing live, web service deployed.
# ---------------------------------------------------------------------------------------
log "Preflight: gcloud auth, project, billing, web service"
command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud CLI not found." >&2; exit 1; }
ACTIVE_ACCT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
[ -n "$ACTIVE_ACCT" ] || { echo "ERROR: no active gcloud account. Run: gcloud auth login" >&2; exit 1; }
echo "    Active account: $ACTIVE_ACCT"

gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 \
  || { echo "ERROR: project $PROJECT_ID not found. Run Phase 1/3 first." >&2; exit 1; }
echo "    Project: $PROJECT_ID, region $REGION"

set +e
BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null)"
BILLING_RC=$?
set -e
[ "$BILLING_RC" -eq 0 ] || { echo "ERROR: cannot read billing for $PROJECT_ID." >&2; exit 1; }
[ "$BILLING_ENABLED" = "True" ] || { echo "ERROR: billing not enabled on $PROJECT_ID." >&2; exit 1; }

# The web service must already be deployed (it is the NEG backend). The deploy workflow creates
# it; if it is missing, run the deploy first (runbook step 7).
gcloud run services describe "$WEB_SERVICE" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1 \
  || { echo "ERROR: Cloud Run service $WEB_SERVICE not found in $REGION. Deploy it first (runbook step 7)." >&2; exit 1; }
echo "    Web service present: $WEB_SERVICE ($REGION)"

# ---------------------------------------------------------------------------------------
# 0b. PLAN + COST ESTIMATE. Printed every run before any gate.
# ---------------------------------------------------------------------------------------
cat <<PLAN

  PHASE 5 (5.3) FRONT-END PLAN for $PROJECT_ID  (Option B: external HTTPS ALB + Cloud Armor)
  -------------------------------------------------------------------
  [LB]    static IP $LB_IP_NAME (global) -> DNS A-record target for cutover
          serverless NEG $NEG_NAME -> Cloud Run $WEB_SERVICE
          backend $BACKEND_NAME (EXTERNAL_MANAGED) + URL map $URLMAP_NAME
          managed SSL cert $CERT_NAME for DOMAIN='${DOMAIN:-<UNSET - required>}'
          HTTPS proxy + :443 forwarding rule; HTTP :80 -> HTTPS redirect
  [ARMOR] policy $ARMOR_POLICY: OWASP WAF (SQLi/XSS/LFI/RCE); create-only, an existing policy or
          rule is left as tuned. New policy: log=$ARMOR_LOG_LEVEL json=$ARMOR_JSON_PARSING;
          new WAF rules: sensitivity=$WAF_SENSITIVITY, always PREVIEW; attach only if none attached;
          flip to ENFORCE this run: ${ENFORCE_RULE:-none};
          rate-limit 2000 mode=$([ "$RL_ENFORCING" = "1" ] && echo ENFORCE || echo PREVIEW)
          (a new rule 2000: ${RATE_LIMIT_COUNT}/${RATE_LIMIT_INTERVAL_SEC}s per IP; an existing one keeps its live
          threshold$([ "$RL_ENFORCING" = "1" ] && [ "$RL_THRESHOLD_GIVEN" = "1" ] && echo " unless enforced now: given ${RATE_LIMIT_COUNT}/${RATE_LIMIT_INTERVAL_SEC}s is re-sent")); attached to $BACKEND_NAME
  [LOCKDOWN] $WEB_SERVICE ingress -> internal-and-cloud-load-balancing (run LAST)

  ROUGH cost estimate (VERIFY against current GCP pricing before approving):
    Global forwarding rule + LB ........... ~\$18-25 / mo + data processing
    Cloud Armor policy + rules ............ ~\$5 / mo + \$1/rule + per-request
    Static anycast IP (in use) ............ included while attached
    -------------------------------------------------------------------
    Estimated steady-state ................ ~\$30-45 / mo
  -------------------------------------------------------------------
  NOTE: the managed SSL cert stays PENDING until DNS points DOMAIN at the LB IP (step 9).
  Validate the LB in the rehearsal via the IP + Host header, not the production domain.
PLAN

# ---------------------------------------------------------------------------------------
# 1. [LB GATE] static IP + serverless NEG + backend + URL map + cert + proxies + forwarding.
# ---------------------------------------------------------------------------------------
if [ "$CONFIRM_LB" != "1" ]; then
  gate "Step 1 (load balancer) SKIPPED. Re-run with CONFIRM_LB=1 (and DOMAIN=...) once approved. Stopping."
  exit 0
fi
[ -n "$DOMAIN" ] || { echo "ERROR: DOMAIN is required for the managed SSL cert. Set DOMAIN=app.example.com." >&2; exit 1; }

log "Step 1a: enable compute API (load balancing lives here)"
gcloud services enable compute.googleapis.com --project="$PROJECT_ID"

log "Step 1b: reserve global static anycast IP ($LB_IP_NAME) - the DNS A-record target"
if gcloud compute addresses describe "$LB_IP_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "address $LB_IP_NAME already exists"
else
  gcloud compute addresses create "$LB_IP_NAME" --global --project="$PROJECT_ID"
fi
LB_IP="$(gcloud compute addresses describe "$LB_IP_NAME" --global --project="$PROJECT_ID" --format='value(address)')"
echo "    LB IP: $LB_IP   (use this as the DNS A record for $DOMAIN at cutover)"

log "Step 1c: serverless NEG ($NEG_NAME) -> Cloud Run $WEB_SERVICE"
if gcloud compute network-endpoint-groups describe "$NEG_NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "NEG $NEG_NAME already exists"
else
  gcloud compute network-endpoint-groups create "$NEG_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$WEB_SERVICE"
fi

log "Step 1d: backend service ($BACKEND_NAME, EXTERNAL_MANAGED) + attach NEG"
# Serverless NEG backends do NOT take a health check (managed by Cloud Run), so none is added.
if gcloud compute backend-services describe "$BACKEND_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "backend service $BACKEND_NAME already exists"
else
  gcloud compute backend-services create "$BACKEND_NAME" \
    --project="$PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --enable-logging --logging-sample-rate=1.0
fi
# Match the EXACT NEG resource path, not a bare-name substring (a substring match could
# false-positive on a different NEG sharing the prefix, or false-NEGATIVE on a transient empty
# describe and then abort the whole build on add-backend's "already exists"). (dual-review PR #476)
ATTACHED_GROUPS="$(gcloud compute backend-services describe "$BACKEND_NAME" --global --project="$PROJECT_ID" \
  --format='value(backends.group)' 2>/dev/null || true)"
NEG_PATH="projects/$PROJECT_ID/regions/$REGION/networkEndpointGroups/$NEG_NAME"
if printf '%s' "$ATTACHED_GROUPS" | grep -qF "$NEG_PATH"; then
  skip "NEG already attached to $BACKEND_NAME"
else
  set +e
  ADD_OUT="$(gcloud compute backend-services add-backend "$BACKEND_NAME" \
    --project="$PROJECT_ID" \
    --global \
    --network-endpoint-group="$NEG_NAME" \
    --network-endpoint-group-region="$REGION" 2>&1)"
  ADD_RC=$?
  set -e
  if [ "$ADD_RC" -ne 0 ]; then
    # Tolerate an "already a backend"/"already exists" race (describe can transiently miss an
    # existing attachment) so a retried run does not abort mid-build; any other failure stops.
    if printf '%s' "$ADD_OUT" | grep -qiE 'already (a backend|exists)'; then
      skip "add-backend reported NEG already attached; continuing"
    else
      printf '%s\n' "$ADD_OUT" >&2
      echo "ERROR: add-backend failed for $BACKEND_NAME (not an already-attached race)." >&2
      exit 1
    fi
  fi
fi

log "Step 1e: URL map ($URLMAP_NAME) -> $BACKEND_NAME"
if gcloud compute url-maps describe "$URLMAP_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "url map $URLMAP_NAME already exists"
else
  gcloud compute url-maps create "$URLMAP_NAME" \
    --project="$PROJECT_ID" --global --default-service="$BACKEND_NAME"
fi

log "Step 1f: Google-managed SSL cert ($CERT_NAME) for $DOMAIN"
# Provisions only AFTER DNS points $DOMAIN at $LB_IP (so it stays PENDING until step 9).
if gcloud compute ssl-certificates describe "$CERT_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "ssl cert $CERT_NAME already exists"
else
  gcloud compute ssl-certificates create "$CERT_NAME" \
    --project="$PROJECT_ID" --global --domains="$DOMAIN"
fi

log "Step 1g: target HTTPS proxy ($HTTPS_PROXY_NAME) + :443 forwarding rule ($HTTPS_FR_NAME)"
if gcloud compute target-https-proxies describe "$HTTPS_PROXY_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "https proxy $HTTPS_PROXY_NAME already exists"
else
  gcloud compute target-https-proxies create "$HTTPS_PROXY_NAME" \
    --project="$PROJECT_ID" --global \
    --url-map="$URLMAP_NAME" --ssl-certificates="$CERT_NAME"
fi
if gcloud compute forwarding-rules describe "$HTTPS_FR_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "forwarding rule $HTTPS_FR_NAME already exists"
else
  gcloud compute forwarding-rules create "$HTTPS_FR_NAME" \
    --project="$PROJECT_ID" --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$LB_IP_NAME" --target-https-proxy="$HTTPS_PROXY_NAME" --ports=443
fi

log "Step 1h: HTTP :80 -> HTTPS redirect (so plain http doesn't dead-end)"
if gcloud compute url-maps describe "$REDIRECT_URLMAP_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "redirect url map $REDIRECT_URLMAP_NAME already exists"
else
  # url-maps import reads a redirect spec from stdin (no create-time flag for a pure redirect).
  gcloud compute url-maps import "$REDIRECT_URLMAP_NAME" \
    --project="$PROJECT_ID" --global --quiet <<YAML
name: $REDIRECT_URLMAP_NAME
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  stripQuery: false
YAML
fi
if gcloud compute target-http-proxies describe "$HTTP_PROXY_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "http proxy $HTTP_PROXY_NAME already exists"
else
  gcloud compute target-http-proxies create "$HTTP_PROXY_NAME" \
    --project="$PROJECT_ID" --global --url-map="$REDIRECT_URLMAP_NAME"
fi
if gcloud compute forwarding-rules describe "$HTTP_FR_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "forwarding rule $HTTP_FR_NAME already exists"
else
  gcloud compute forwarding-rules create "$HTTP_FR_NAME" \
    --project="$PROJECT_ID" --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$LB_IP_NAME" --target-http-proxy="$HTTP_PROXY_NAME" --ports=80
fi

echo
log "Load balancer built. DNS A record for $DOMAIN -> $LB_IP (do NOT flip yet; runbook step 9)."

# ---------------------------------------------------------------------------------------
# 2. [ARMOR GATE] Cloud Armor policy: OWASP WAF (preview, low sensitivity) + rate limit.
# ---------------------------------------------------------------------------------------
if [ "$CONFIRM_ARMOR" = "1" ]; then
  # The per-rule enforce request, its CONFIRM_ARMOR_ENFORCE gate, the rate-limit gate and the attach
  # confirm were validated up front (see "Armor input validation"), before any gcloud call.
  # Rate-limit rule 2000 is gated SEPARATELY from the WAF sig rules. It cannot be validated by a
  # no-users soak (a whole school/clinic NATs to one IP and shares one per-IP token bucket, so a
  # generous-looking threshold can still 429 an entire building on launch day). ARMOR_ENFORCE_RULES must
  # therefore NEVER flip rule 2000; that needs its own RATE_LIMIT_ENFORCE gate + confirm (RL_ENFORCING,
  # set up front). (dual-review PR #508 follow-up; Codex + adversary)
  if [ "$RL_ENFORCING" = "1" ]; then RL_MODE="ENFORCE (deny-429)"; else RL_MODE="PREVIEW (log-only)"; fi

  # Step 2-pre: read-only checks, BEFORE anything in the policy or on the backend is created or
  # changed, so a stale or mistyped ARMOR_POLICY stops the run instead of building a fresh default
  # policy and swapping it onto the live backend.
  log "Step 2-pre: check which policy $BACKEND_NAME has attached, and that every rule to enforce exists"
  # value(securityPolicy) is the attached policy's URL (.../securityPolicies/<name>) or empty. A read
  # failure is treated as unknown and stops the run: fail closed rather than attach blind.
  if ! ATTACHED_POLICY_URL="$(gcloud compute backend-services describe "$BACKEND_NAME" --global \
      --project="$PROJECT_ID" --format='value(securityPolicy)' 2>/dev/null)"; then
    echo "ERROR: could not read the security policy attached to $BACKEND_NAME; not touching Cloud Armor." >&2
    exit 1
  fi
  ATTACHED_POLICY="${ATTACHED_POLICY_URL##*/}"
  if [ -n "$ATTACHED_POLICY" ] && [ "$ATTACHED_POLICY" != "$ARMOR_POLICY" ]; then
    echo "ERROR: $BACKEND_NAME already has security policy '$ATTACHED_POLICY' attached, not '$ARMOR_POLICY'." >&2
    echo "       Refusing to create or attach '$ARMOR_POLICY' over it. If ARMOR_POLICY is a leftover or typo," >&2
    echo "       unset it. If the swap is really intended, do it by hand after review:" >&2
    echo "         gcloud compute backend-services update $BACKEND_NAME --global --project=$PROJECT_ID --security-policy=$ARMOR_POLICY" >&2
    exit 1
  fi
  # Existence of the policy and of every rule is read HERE, once, before any change, and only a
  # not-found error counts as missing (armor_exists). A permission or network error used to read as
  # "missing" and send the run on to create a fresh default policy or rule.
  POLICY_EXISTS=0
  if armor_exists "Cloud Armor policy $ARMOR_POLICY" "$(armor_policy_nf_re)" \
      compute security-policies describe "$ARMOR_POLICY" --project="$PROJECT_ID"; then
    POLICY_EXISTS=1
  fi
  if [ "$POLICY_EXISTS" != "1" ] && [ "$ATTACHED_POLICY" = "$ARMOR_POLICY" ]; then
    echo "ERROR: $ARMOR_POLICY is attached to $BACKEND_NAME but describe reports the policy as not found." >&2
    echo "       The two reads disagree, so this run will not create a policy under that name. Check the" >&2
    echo "       project and the policy by hand before re-running." >&2
    exit 1
  fi
  # Preconfigured OWASP WAF rule sets (current rule IDs verified 2026-06-23: sqli/xss are the
  # *-v422-stable sets). Low sensitivity + preview so free-text AAC utterances are not blocked
  # until the POST-REAL-TRAFFIC preview-log review proves the rules clean (the no-users soak cannot);
  # flip ONE rule at a time to enforce with ARMOR_ENFORCE_RULES afterward (runbook step 9c), never
  # pre-DNS.
  WAF_PRIOS=(1001 1002 1003 1004)
  declare -A WAF_RULES=(
    [1001]="sqli-v422-stable"
    [1002]="xss-v422-stable"
    [1003]="lfi-v422-stable"
    [1004]="rce-v422-stable"
  )
  declare -A RULE_EXISTS=()
  for PRIO in "${WAF_PRIOS[@]}" 2000; do
    RULE_EXISTS[$PRIO]=0
    # A policy that does not exist has no rules; nothing to read.
    if [ "$POLICY_EXISTS" = "1" ] && armor_exists "rule $PRIO in $ARMOR_POLICY" "$(armor_rule_nf_re "$PRIO")" \
        compute security-policies rules describe "$PRIO" --security-policy="$ARMOR_POLICY" --project="$PROJECT_ID"; then
      RULE_EXISTS[$PRIO]=1
    fi
  done
  # A rule must never START in enforce: enforcement is only ever a flip of an existing rule that has
  # been watched in preview. So the policy and the named rule must already exist.
  if [ -n "$ENFORCE_RULE" ]; then
    if [ "$POLICY_EXISTS" != "1" ]; then
      echo "ERROR: ARMOR_ENFORCE_RULES=$ENFORCE_RULE but policy $ARMOR_POLICY does not exist yet." >&2
      echo "       Build it in preview first (CONFIRM_ARMOR=1 without ARMOR_ENFORCE_RULES), review real" >&2
      echo "       traffic, then flip one existing rule. A new rule never starts in enforce." >&2
      exit 1
    fi
    if [ "${RULE_EXISTS[$ENFORCE_RULE]}" != "1" ]; then
      echo "ERROR: rule $ENFORCE_RULE is named in ARMOR_ENFORCE_RULES but does not exist in $ARMOR_POLICY." >&2
      echo "       A new rule never starts in enforce: create it in preview first (run without ARMOR_ENFORCE_RULES)." >&2
      exit 1
    fi
  fi
  # Same for rate-limit rule 2000: RATE_LIMIT_ENFORCE only ever flips an existing rule 2000 that has
  # been watched in preview; it never creates one in enforce.
  if [ "$RL_ENFORCING" = "1" ]; then
    if [ "$POLICY_EXISTS" != "1" ]; then
      echo "ERROR: RATE_LIMIT_ENFORCE=1 but policy $ARMOR_POLICY does not exist yet." >&2
      echo "       Build it in preview first (CONFIRM_ARMOR=1 without RATE_LIMIT_ENFORCE), review real" >&2
      echo "       traffic, then enforce the existing rule 2000. A new rule never starts in enforce." >&2
      exit 1
    fi
    if [ "${RULE_EXISTS[2000]}" != "1" ]; then
      echo "ERROR: RATE_LIMIT_ENFORCE=1 but rate-limit rule 2000 does not exist in $ARMOR_POLICY." >&2
      echo "       A new rule never starts in enforce: create it in preview first (run without RATE_LIMIT_ENFORCE)." >&2
      exit 1
    fi
  fi
  # An enforce flip filters traffic only while the policy is attached to the backend. On a detached
  # policy (an incident detach, or a first run interrupted before Step 2d) the flip would succeed and
  # the Step 2e readback would show preview=false while nothing is filtered. Refuse it here, before
  # any change, unless this run also attaches the policy (CONFIRM_ARMOR_ATTACH).
  if { [ -n "$ENFORCE_RULE" ] || [ "$RL_ENFORCING" = "1" ]; } && [ -z "$ATTACHED_POLICY" ] \
      && [ "$ATTACH_CONFIRMED" != "1" ]; then
    echo "ERROR: $ARMOR_POLICY is not attached to $BACKEND_NAME, so enforcing a rule now would filter nothing." >&2
    echo "       Attach it in the same run with CONFIRM_ARMOR_ATTACH=$ARMOR_POLICY (inline), or attach it first." >&2
    exit 1
  fi

  log "Step 2a: Cloud Armor policy $ARMOR_POLICY (create-only; an existing policy keeps its settings)"
  if [ "$POLICY_EXISTS" = "1" ]; then
    # Never re-assert log level, JSON parsing or any other advanced option on an existing policy:
    # those are tuned by hand after creation, and a re-run must not silently undo the tuning. (A
    # `security-policies update --log-level=X` only rewrites logLevel, but it does rewrite it, which
    # is how an earlier version of this step kept turning VERBOSE back on.) Report what is live.
    skip "security policy $ARMOR_POLICY already exists; log level, JSON parsing and other advanced options left as-is"
    LIVE_LOG_LEVEL="$(gcloud compute security-policies describe "$ARMOR_POLICY" --project="$PROJECT_ID" \
      --format='value(advancedOptionsConfig.logLevel)' 2>/dev/null || echo '?')"
    LIVE_JSON_PARSING="$(gcloud compute security-policies describe "$ARMOR_POLICY" --project="$PROJECT_ID" \
      --format='value(advancedOptionsConfig.jsonParsing)' 2>/dev/null || echo '?')"
    echo "    live logLevel=${LIVE_LOG_LEVEL:-<unset: NORMAL>} jsonParsing=${LIVE_JSON_PARSING:-<unset: DISABLED>}"
    case "$LIVE_LOG_LEVEL" in
      VERBOSE) gate "$ARMOR_POLICY logs at VERBOSE, which copies matched request-body content into Cloud Logging. Left as-is; return it to NORMAL deliberately with: gcloud compute security-policies update $ARMOR_POLICY --project=$PROJECT_ID --log-level=NORMAL" ;;
      '?') gate "$ARMOR_POLICY log level could not be read, so it may be VERBOSE (which copies matched request-body content into Cloud Logging). Left as-is; check it with: gcloud compute security-policies describe $ARMOR_POLICY --project=$PROJECT_ID --format='value(advancedOptionsConfig.logLevel)'" ;;
    esac
    # Unset/DISABLED is what a policy looks like if a first run created it but failed before the
    # advanced-options update (a re-run then treats it as existing). Warn loudly; do not change it,
    # because an operator may have turned JSON parsing off on purpose.
    case "$LIVE_JSON_PARSING" in
      ''|DISABLED|'?') gate "$ARMOR_POLICY has JSON parsing ${LIVE_JSON_PARSING:-unset} (the WAF reads JSON bodies as one string). Left as-is. If a first run was interrupted after creating the policy, set it deliberately with: gcloud compute security-policies update $ARMOR_POLICY --project=$PROJECT_ID --json-parsing=$ARMOR_JSON_PARSING" ;;
    esac
  else
    gcloud compute security-policies create "$ARMOR_POLICY" \
      --project="$PROJECT_ID" --description="LingoLinq edge WAF + rate limiting (front of $WEB_SERVICE)"
    # Advanced options are set here, at creation ONLY (`create` takes no --log-level/--json-parsing
    # flags, hence the follow-up update). NORMAL logging unless ARMOR_LOG_LEVEL=VERBOSE was passed
    # for a rehearsal; STANDARD JSON parsing so the WAF inspects JSON bodies field by field.
    if ! gcloud compute security-policies update "$ARMOR_POLICY" \
        --project="$PROJECT_ID" --log-level="$ARMOR_LOG_LEVEL" --json-parsing="$ARMOR_JSON_PARSING"; then
      # A re-run would see the policy as existing and never set these, so stop loudly instead.
      echo "ERROR: created $ARMOR_POLICY but could not set log level / JSON parsing on it." >&2
      echo "       Set them by hand before continuing: gcloud compute security-policies update $ARMOR_POLICY \\" >&2
      echo "         --project=$PROJECT_ID --log-level=$ARMOR_LOG_LEVEL --json-parsing=$ARMOR_JSON_PARSING" >&2
      exit 1
    fi
  fi

  # Rule sets and existence were read in Step 2-pre (WAF_RULES, RULE_EXISTS).
  for PRIO in "${WAF_PRIOS[@]}"; do
    RULESET="${WAF_RULES[$PRIO]}"
    if [ "${RULE_EXISTS[$PRIO]}" = "1" ]; then
      # An EXISTING rule is never rewritten: its expression (including any signature opt-outs), its
      # preconfigured-WAF exclusions, action and sensitivity are hand-tuned and must survive a re-run.
      if rule_enforce_requested "$PRIO"; then
        # The one change allowed: flip preview -> enforce for a rule the operator named. Only
        # --no-preview is sent (no --action/--expression), so gcloud patches just the preview field
        # and the server keeps match + preconfiguredWafConfig; dropping --action also stops gcloud
        # adding rate_limit_options to the update mask. (dual-review PR #476; per-rule since 2026-11)
        log "Step 2b: flip existing WAF rule $PRIO ($RULESET) -> ENFORCE (rules update --no-preview only)"
        gcloud compute security-policies rules update "$PRIO" \
          --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" --no-preview
      else
        skip "WAF rule $PRIO ($RULESET) already exists; left as-is (expression, opt-outs, exclusions, preview state untouched)"
      fi
    else
      # A new rule ALWAYS starts in preview (Step 2-pre refuses ARMOR_ENFORCE_RULES for a missing rule).
      log "Step 2b: WAF rule $PRIO -> $RULESET (deny-403, PREVIEW (log-only), sensitivity=$WAF_SENSITIVITY)"
      gcloud compute security-policies rules create "$PRIO" \
        --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" \
        --expression="evaluatePreconfiguredWaf('$RULESET', {'sensitivity': $WAF_SENSITIVITY})" \
        --action=deny-403 --preview
    fi
  done

  log "Step 2c: edge rate-limit rule 2000 ($RL_MODE)"
  # Defense-in-depth on top of the app's Rack::Attack; conservative so normal AAC use is unaffected.
  # Rule 2000 tracks RL_ENFORCING only: an ARMOR_ENFORCE_RULES (WAF sig) run never touches it.
  if [ "${RULE_EXISTS[2000]}" = "1" ]; then
    skip "rate-limit rule 2000 already exists"
    if [ "$RL_ENFORCING" = "1" ]; then
      # Rule 2000 is created with --exceed-action=deny-429 --preview (below), so preview is the only
      # thing between it and enforcing: the flip is `--no-preview` alone, as for the WAF rules. With
      # only --no-preview, gcloud sends a rule body with priority and preview and no rateLimitOptions
      # (rules/update.py; CreateRateLimitOptions returns None when no rate-limit flag is given), so a
      # hand-tuned live threshold, key or action is kept. The threshold (with the rest of the
      # rate-limit config) is re-sent ONLY when the operator passed BOTH RATE_LIMIT_COUNT and
      # RATE_LIMIT_INTERVAL_SEC, i.e. asked for a new threshold on this run; the step-2e readback then
      # shows what is live. (An earlier version always re-sent the script defaults here, which reset a
      # hand-tuned threshold to 600/60.)
      if [ "$RL_THRESHOLD_GIVEN" = "1" ]; then
        log "Step 2c: flip existing rate-limit rule 2000 -> ENFORCE at the given ${RATE_LIMIT_COUNT}/${RATE_LIMIT_INTERVAL_SEC}s (threshold re-sent, --no-preview)"
        gcloud compute security-policies rules update 2000 \
          --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" \
          --rate-limit-threshold-count="$RATE_LIMIT_COUNT" \
          --rate-limit-threshold-interval-sec="$RATE_LIMIT_INTERVAL_SEC" \
          --conform-action=allow --exceed-action=deny-429 \
          --enforce-on-key=IP --no-preview
      else
        log "Step 2c: flip existing rate-limit rule 2000 -> ENFORCE, live threshold kept (rules update --no-preview only)"
        gcloud compute security-policies rules update 2000 \
          --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" --no-preview
      fi
    else
      # Do NOT mutate rule 2000 on a non-rate-limit run. With the separate gate, 2000 can only become
      # enforced via RATE_LIMIT_ENFORCE=1, so if it is already enforcing that was DELIBERATE - never
      # silently downgrade a live security control from a routine Armor run. Only report/warn; the
      # explicit --preview revert (runbook step 9c) is the sole way to return it to log-only.
      CUR_2000_PREVIEW="$(gcloud compute security-policies rules describe 2000 \
        --security-policy="$ARMOR_POLICY" --project="$PROJECT_ID" --format='value(preview)' 2>/dev/null || echo unknown)"
      # Fail safe: only an explicit True counts as "in preview". Anything else (False, or an empty
      # value from a gcloud variant) is treated as possibly-enforcing so the warning never hides a
      # live control - this branch never mutates 2000 either way.
      if [ "$CUR_2000_PREVIEW" = "True" ] || [ "$CUR_2000_PREVIEW" = "true" ]; then
        skip "rate-limit rule 2000 is in preview (not enforcing this run; pass RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 to enforce it)"
      else
        gate "rate-limit rule 2000 is NOT in preview (preview=$CUR_2000_PREVIEW) and is LEFT AS-IS (this run carries no RATE_LIMIT_ENFORCE). Not downgrading a live security control. To return it to preview, run the explicit revert in runbook step 9c."
      fi
    fi
  else
    # A new rule 2000 ALWAYS starts in preview (Step 2-pre refuses RATE_LIMIT_ENFORCE for a missing rule).
    log "Step 2c: create rate-limit rule 2000 (throttle ${RATE_LIMIT_COUNT}/${RATE_LIMIT_INTERVAL_SEC}s per IP, PREVIEW (log-only))"
    gcloud compute security-policies rules create 2000 \
      --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" \
      --src-ip-ranges="*" \
      --action=throttle \
      --rate-limit-threshold-count="$RATE_LIMIT_COUNT" \
      --rate-limit-threshold-interval-sec="$RATE_LIMIT_INTERVAL_SEC" \
      --conform-action=allow --exceed-action=deny-429 \
      --enforce-on-key=IP --preview
  fi

  log "Step 2d: attach $ARMOR_POLICY to backend $BACKEND_NAME (only if no policy is attached)"
  # Step 2-pre already refused a DIFFERENT attached policy. Attach only when nothing is attached, and
  # only on the run that created the policy: an existing policy with nothing attached may have been
  # detached on purpose (incident response), so re-attaching it needs CONFIRM_ARMOR_ATTACH=<policy name>.
  if [ "$ATTACHED_POLICY" = "$ARMOR_POLICY" ]; then
    skip "$ARMOR_POLICY already attached to $BACKEND_NAME"
  elif [ "$POLICY_EXISTS" != "1" ] || [ "$ATTACH_CONFIRMED" = "1" ]; then
    gcloud compute backend-services update "$BACKEND_NAME" \
      --project="$PROJECT_ID" --global --security-policy="$ARMOR_POLICY"
  else
    gate "$BACKEND_NAME has NO security policy attached and $ARMOR_POLICY already existed: it may have been detached on purpose, or an earlier run stopped before attaching it. NOT re-attaching. To attach it, re-run with CONFIRM_ARMOR_ATTACH=$ARMOR_POLICY."
  fi

  # Read back and print the ACTUAL preview state of every rule (preview=true => log-only,
  # preview=false => enforcing), so the operator never trusts the intended MODE banner over the
  # real policy state before proceeding to lockdown / DNS. (dual-review PR #476)
  log "Step 2e: actual WAF rule modes (preview=true is log-only, false is enforcing)"
  # Rules filter nothing unless the policy is attached, so print what is attached now.
  ATTACHED_NOW_URL="$(gcloud compute backend-services describe "$BACKEND_NAME" --global \
    --project="$PROJECT_ID" --format='value(securityPolicy)' 2>/dev/null || echo '?')"
  ATTACHED_NOW="${ATTACHED_NOW_URL##*/}"
  echo "    attached policy: ${ATTACHED_NOW:-NONE (rules filter nothing)}"
  for PRIO in "${WAF_PRIOS[@]}" 2000; do
    ACTUAL_PREVIEW="$(gcloud compute security-policies rules describe "$PRIO" \
      --security-policy="$ARMOR_POLICY" --project="$PROJECT_ID" --format='value(preview)' 2>/dev/null || echo '?')"
    if [ "$PRIO" = "2000" ]; then
      # Print the ACTUAL enforced threshold alongside preview state, not just preview: a correct
      # preview=false tells you 2000 is enforcing, not what it is enforcing. (Codex review of PR #513)
      ACTUAL_RL="$(gcloud compute security-policies rules describe 2000 \
        --security-policy="$ARMOR_POLICY" --project="$PROJECT_ID" \
        --format='value(rateLimitOptions.rateLimitThreshold.count, rateLimitOptions.rateLimitThreshold.intervalSec)' 2>/dev/null || echo '?')"
      echo "    rule $PRIO: preview=$ACTUAL_PREVIEW threshold(count,intervalSec)=$ACTUAL_RL"
    else
      # Print the action too: the per-rule flip sends only --no-preview, so a rule whose action was
      # hand-changed enforces THAT action. preview=false with an action other than deny(403) is a
      # finding to look at, not a success.
      ACTUAL_ACTION="$(gcloud compute security-policies rules describe "$PRIO" \
        --security-policy="$ARMOR_POLICY" --project="$PROJECT_ID" --format='value(action)' 2>/dev/null || echo '?')"
      echo "    rule $PRIO: preview=$ACTUAL_PREVIEW action=$ACTUAL_ACTION"
    fi
  done
else
  gate "Step 2 (Cloud Armor) SKIPPED. Re-run with CONFIRM_ARMOR=1 once approved."
fi

# ---------------------------------------------------------------------------------------
# 3. [LOCKDOWN GATE] flip the web service to LB-only ingress. RUN LAST, after LB validated.
# ---------------------------------------------------------------------------------------
#
# COUPLING WITH THE DEPLOY PIPELINE -- READ BEFORE RUNNING THIS STEP.
# `.github/workflows/deploy-cloudrun.yml` health-gates every production deploy by probing the
# new revision through its `candidate---*` TAG URL, from a GitHub-hosted runner on the public
# internet. Cloud Run ingress restrictions apply to tag URLs, not just the main service URL.
# So the moment this lockdown lands, that probe fails on every attempt, and the gate is
# fail-closed: each deploy will apply its migration, leave traffic PINNED to the old revision,
# never update the worker pool, and go red. Every deploy, until someone connects the two.
# Before running this step, either move the probe behind the LB (a tag-targeted serverless NEG)
# or run it from inside the VPC, and update the comment above the probe step in that workflow.
# Do not treat a red deploy after lockdown as a deploy-pipeline bug; it is this line.
if [ "$CONFIRM_INGRESS_LOCKDOWN" = "1" ]; then
  # Refuse to lock down ingress in the SAME run that builds the LB: lockdown must come only AFTER
  # the LB path is validated in the rehearsal, otherwise the service goes LB-only while the managed
  # cert is still PENDING (no validated ingress) and the 0a run.app smoke test breaks. (dual-review PR #476)
  if [ "$CONFIRM_LB" = "1" ] || [ "$CONFIRM_ARMOR" = "1" ]; then
    echo "ERROR: refusing ingress lockdown in the same invocation as the LB/Armor build." >&2
    echo "       Validate the LB + WAF path in the rehearsal first, THEN run" >&2
    echo "       CONFIRM_INGRESS_LOCKDOWN=1 on its own." >&2
    exit 1
  fi
  log "Step 3: $WEB_SERVICE ingress -> internal-and-cloud-load-balancing"
  echo "    WARNING: this removes public run.app access; only LB (Cloud Armor) traffic reaches the app."
  echo "    Reverse with: gcloud run services update $WEB_SERVICE --region=$REGION --ingress=all"
  gcloud run services update "$WEB_SERVICE" \
    --project="$PROJECT_ID" --region="$REGION" \
    --ingress=internal-and-cloud-load-balancing
else
  gate "Step 3 (ingress lockdown) SKIPPED. Run with CONFIRM_INGRESS_LOCKDOWN=1 ONLY after the LB path is validated in the rehearsal (otherwise the 0a run.app smoke test breaks)."
fi

# ---------------------------------------------------------------------------------------
# 4. [GH VARS] write the LB IP + domain as repo variables for the runbook / DNS step.
# ---------------------------------------------------------------------------------------
if [ "$SET_GH_VARS" = "1" ] && [ "$CONFIRM_LB" = "1" ]; then
  command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI not found (needed for SET_GH_VARS)." >&2; exit 1; }
  log "Step 4: write repo variables to $GH_REPO (LB_IP, FRONTEND_DOMAIN)"
  gh variable set FRONTEND_LB_IP --repo "$GH_REPO" --body "$LB_IP"
  gh variable set FRONTEND_DOMAIN --repo "$GH_REPO" --body "$DOMAIN"
fi

cat <<HANDOFF

  PHASE 5 (5.3) FRONT END - handoff
  -------------------------------------------------------------------
  Built (when gated): static IP${LB_IP:+ = $LB_IP}, serverless NEG -> $WEB_SERVICE, backend
  $BACKEND_NAME, URL map, managed cert for ${DOMAIN:-<DOMAIN unset>}, HTTPS+HTTP forwarding,
  and (if CONFIRM_ARMOR) Cloud Armor $ARMOR_POLICY (new rules in PREVIEW; existing rules left as tuned;
  flipped to ENFORCE this run: ${ENFORCE_RULE:-none}).

  Next, in order:
   1. Dress rehearsal: validate the LB path via the IP + Host header (cert is PENDING until DNS).
      The WAF stays in PREVIEW; do NOT flip enforce here - pre-DNS the LB gets no traffic (run.app
      bypasses it), so the preview logs are empty and prove nothing.
   2. After the LB is validated, run CONFIRM_INGRESS_LOCKDOWN=1 ON ITS OWN (no CONFIRM_LB/ARMOR)
      to take the web service off the public run.app URL (LB-only).
   3. At cutover (runbook step 9): point $DOMAIN DNS A record at the LB IP. The managed cert then
      provisions (up to ~60 min AFTER DNS propagation completes; propagation itself can take hours).
      Also clear any stale AAAA record for $DOMAIN - a mismatched AAAA yields FAILED_NOT_VISIBLE.
      Do NOT flip DNS before then.
   4. POST-REAL-TRAFFIC ONLY (runbook step 9c): a no-users cutover soak produces NO LB traffic, so it
      cannot validate the WAF. Only after REAL post-launch traffic has run through the LB in preview
      and the preview logs show no legitimate AAC request flagged for a rule, flip THAT rule to
      enforce, one rule per run: CONFIRM_LB=1 CONFIRM_ARMOR=1 ARMOR_ENFORCE_RULES=<rule>
      CONFIRM_ARMOR_ENFORCE=<the same rule> (the script refuses ARMOR_ENFORCE_RULES without
      CONFIRM_LB=1 and CONFIRM_ARMOR=1). Only that rule's preview flag changes; every other rule,
      and the policy's log level and JSON parsing, are left as tuned. Rate-limit rule 2000 is not
      touched. Enforce 2000 SEPARATELY and LATER, in a run of its own, only once its threshold is
      proven generous for building-scale NAT, with CONFIRM_LB=1 CONFIRM_ARMOR=1
      RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 (it sends only --no-preview, keeping the
      live threshold, unless both RATE_LIMIT_COUNT and RATE_LIMIT_INTERVAL_SEC are passed). Pass
      the ARMOR_ENFORCE_RULES / CONFIRM_* values inline, never exported. Export the policy first
      (command below).

  Teardown (reverse order): forwarding-rules -> proxies -> url-maps -> ssl-certificates ->
  backend-services -> network-endpoint-groups -> addresses; detach + delete the Cloud Armor
  policy; restore ingress with --ingress=all.
  BEFORE deleting the Cloud Armor policy (or deleting or recreating any of its rules), export it
  in full to a path OUTSIDE the repo; it holds the hand-tuned rules and exclusions, which the
  script cannot recreate:
      mkdir -p "\$HOME/armor-backups"
      gcloud compute security-policies export $ARMOR_POLICY --file-name="\$HOME/armor-backups/$ARMOR_POLICY-\$(date -u +%Y%m%dT%H%M%SZ).yaml" --file-format=yaml --project=$PROJECT_ID
  never commit that file: it holds the tuned exceptions and this repo is public.
HANDOFF
