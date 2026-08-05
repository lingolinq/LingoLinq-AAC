#!/usr/bin/env bash
# assert-runtime-secrets.sh — fail closed when a live Cloud Run revision is missing a
# secret the deploy was supposed to mount.
#
# WHY THIS EXISTS
# ---------------
# On 2026-08-04 a manual `gcloud run` deploy of `lingolinq-web` produced revision
# `00014`, which dropped exactly `BEDROCK_AWS_KEY` and `BEDROCK_AWS_SECRET` and nothing
# else. Cloud Run creates a new immutable revision on ANY config change, so a deploy that
# reuses the same image can still silently remove secrets. For ~54 minutes the Tier 1
# runtime AI credential path was absent from production and `AiClient.configured?` would
# have returned false, failing every AI feature closed. Nothing detected it; the gap was
# found only by reading revision history a day later.
#
# The deploy workflow already gates on secrets EXISTING in Secret Manager before it
# deploys (see the "verify secrets are seeded" step). That check cannot catch this class
# of bug: the secret containers were present and healthy the whole time. What was missing
# was the REFERENCE from the running revision to the secret. This script closes that gap
# by reading back what actually landed.
#
# WHAT IT CHECKS
# --------------
# For each named service/worker-pool, resolves the revision that is actually serving
# (not merely the latest created) and asserts every required env var is present AND is
# backed by a `secretKeyRef`. A var that is present but downgraded to a literal value is
# treated as a failure: it means the secret linkage was replaced by something else.
#
# SCOPE AND LIMITS — read before trusting this
# --------------------------------------------
# * Called from the deploy workflow, it makes a CI deploy that drops a secret fail loudly
#   instead of silently.
# * It does NOT prevent drift introduced OUTSIDE CI. The 00014 incident was a human
#   running `gcloud run deploy` directly, which never touches this workflow. Guarding
#   that requires either restricting Cloud Run update permission to the deploy service
#   account, or running this script on a schedule. Both are deliberately out of scope
#   here. Run it standalone any time to reconcile live state:
#
#     bash scripts/gcp/assert-runtime-secrets.sh \
#       --project lingolinq-prod --region us-central1 \
#       --service lingolinq-web --worker-pool lingolinq-worker \
#       --required "BEDROCK_AWS_KEY=x,BEDROCK_AWS_SECRET=x,SECRET_KEY_BASE=x"
#
# * It asserts the LINKAGE, not the value. It never reads secret material, and needs only
#   `run.revisions.get` / `run.workerPools.get`, not `secretmanager.secretAccessor`.
#
# --required accepts the same `NAME=SECRET:version,...` form as `gcloud --set-secrets`,
# so the workflow passes "$BOOT_SECRETS,$NON_BOOT_SECRETS" through unmodified and there is
# no second list to keep in sync. Only the NAME (left of `=`) is used.
set -euo pipefail

PROJECT=''; REGION=''; SERVICE=''; WORKER_POOL=''; REQUIRED=''
while [ $# -gt 0 ]; do
  case "$1" in
    --project)     PROJECT="$2"; shift 2 ;;
    --region)      REGION="$2"; shift 2 ;;
    --service)     SERVICE="$2"; shift 2 ;;
    --worker-pool) WORKER_POOL="$2"; shift 2 ;;
    --required)    REQUIRED="$2"; shift 2 ;;
    *) echo "assert-runtime-secrets: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

[ -n "$PROJECT" ] || { echo "assert-runtime-secrets: --project is required" >&2; exit 2; }
[ -n "$REGION" ]  || { echo "assert-runtime-secrets: --region is required" >&2; exit 2; }
[ -n "$REQUIRED" ] || { echo "assert-runtime-secrets: --required is required" >&2; exit 2; }
[ -n "$SERVICE$WORKER_POOL" ] || {
  echo "assert-runtime-secrets: at least one of --service / --worker-pool is required" >&2; exit 2; }

# Resolve the revision actually receiving traffic. `latestReadyRevisionName` is NOT
# sufficient on its own: traffic can be pinned to an older revision, in which case the
# revision serving users is not the newest one. Prefer an explicit traffic assignment
# with a non-zero percent and fall back to latestReady only when no explicit split exists.
serving_revision() {
  gcloud run services describe "$1" --project="$PROJECT" --region="$REGION" --format=json 2>/dev/null \
  | python3 -c '
import json, sys
d = json.load(sys.stdin)
st = d.get("status", {}) or {}
best, best_pct = None, 0
for t in st.get("traffic", []) or []:
    pct = t.get("percent") or 0
    rev = t.get("revisionName")
    if rev and pct > best_pct:
        best, best_pct = rev, pct
print(best or st.get("latestReadyRevisionName", "") or "")
'
}

# Cloud Run services and worker pools do not share a response shape, and the worker-pool
# API is still beta, so the container block sits at a different depth. Walk the document
# for the first "containers" list rather than hard-coding either path; that keeps this
# working if the beta shape shifts before GA.
env_entries() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
def find(o):
    if isinstance(o, dict):
        if isinstance(o.get("containers"), list) and o["containers"]:
            return o["containers"]
        for v in o.values():
            r = find(v)
            if r: return r
    elif isinstance(o, list):
        for v in o:
            r = find(v)
            if r: return r
    return None
containers = find(d) or []
for c in containers:
    for e in c.get("env", []) or []:
        name = e.get("name")
        if not name:
            continue
        # secretKeyRef => linked to Secret Manager; anything else => a literal value.
        linked = "secret" if "valueFrom" in e else "literal"
        print(name, linked)
'
}

# Only the env-var NAME matters; strip the =SECRET:version half of each --set-secrets pair.
mapfile -t REQUIRED_NAMES < <(printf '%s' "$REQUIRED" | tr ',' '\n' | sed 's/=.*//' | sed '/^$/d' | sort -u)
[ "${#REQUIRED_NAMES[@]}" -gt 0 ] || { echo "assert-runtime-secrets: --required parsed to zero names" >&2; exit 2; }

failed=0

check_target() {
  local kind="$1" name="$2" json rev
  if [ "$kind" = service ]; then
    rev="$(serving_revision "$name")"
    if [ -z "$rev" ]; then
      echo "FAIL [$name] could not resolve a serving revision" >&2
      failed=1; return
    fi
    echo "== $name (serving revision: $rev)"
    json="$(gcloud run revisions describe "$rev" --project="$PROJECT" --region="$REGION" --format=json 2>/dev/null)"
  else
    echo "== $name (worker pool)"
    json="$(gcloud beta run worker-pools describe "$name" --project="$PROJECT" --region="$REGION" --format=json 2>/dev/null)"
  fi

  if [ -z "$json" ]; then
    echo "FAIL [$name] could not read live configuration" >&2
    failed=1; return
  fi

  local entries missing=() literal=()
  entries="$(printf '%s' "$json" | env_entries)"

  local want
  for want in "${REQUIRED_NAMES[@]}"; do
    local line
    line="$(printf '%s\n' "$entries" | awk -v w="$want" '$1 == w {print $2; exit}')"
    if [ -z "$line" ]; then
      missing+=("$want")
    elif [ "$line" != secret ]; then
      literal+=("$want")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "FAIL [$name] missing secret-backed env var(s): ${missing[*]}" >&2
    failed=1
  fi
  if [ "${#literal[@]}" -gt 0 ]; then
    echo "FAIL [$name] env var(s) present but NOT backed by a secretKeyRef: ${literal[*]}" >&2
    failed=1
  fi
  if [ "${#missing[@]}" -eq 0 ] && [ "${#literal[@]}" -eq 0 ]; then
    echo "   OK: all ${#REQUIRED_NAMES[@]} required env vars are secret-backed"
  fi
}

[ -n "$SERVICE" ]     && check_target service "$SERVICE"
[ -n "$WORKER_POOL" ] && check_target worker  "$WORKER_POOL"

if [ "$failed" -ne 0 ]; then
  cat >&2 <<'EOM'

Deployment is NOT safe: the live configuration is missing at least one secret the deploy
was supposed to mount. A revision in this state runs with the secret simply absent from
the environment, so any feature gated on it fails closed with no error at deploy time.
Redeploy with the full --set-secrets list ("$BOOT_SECRETS,$NON_BOOT_SECRETS"); a partial
--set-secrets REPLACES the whole set rather than merging into it.
EOM
  exit 1
fi

echo "assert-runtime-secrets: OK"
