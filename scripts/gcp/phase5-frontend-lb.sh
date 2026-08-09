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
#   [LOCKDOWN] flip lingolinq-web ingress to internal-and-cloud-load-balancing so the public
#              run.app URL no longer bypasses Cloud Armor. RUN LAST, after the LB is validated.
#
# It does NOT flip DNS (runbook step 9, a separate gated cutover action) and does NOT enforce
# the WAF rules (they ship in preview). The enforce flip is a POST-REAL-TRAFFIC step (runbook step
# 9c): pre-DNS the LB receives no traffic (run.app bypasses it) and the no-users cutover soak is not
# representative either, so the preview logs prove nothing about false positives until real users
# hit the LB. Keep the WAF in preview through the cut AND the soak; review the preview logs only
# once REAL production traffic exists, then flip the sig rules to enforce (rate-limit 2000 separately).
#
# Design rules (same contract as scripts/gcp/phase3-data-layer.sh):
#   - Idempotent: every create is guarded by a describe check, so re-runs are safe.
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
#   DOMAIN=... CONFIRM_LB=1 CONFIRM_ARMOR=1 SET_GH_VARS=1 ...                  # + write repo vars (LB IP/domain)
#   DOMAIN=... CONFIRM_INGRESS_LOCKDOWN=1 ./scripts/gcp/phase5-frontend-lb.sh  # flip web to LB-only (LAST)
#   CONFIRM_LB=1 CONFIRM_ARMOR=1 ARMOR_ENFORCE=1 CONFIRM_ARMOR_ENFORCE=1 DOMAIN=... ...  # WAF sig enforce (POST-REAL-TRAFFIC)
#   ...ARMOR_ENFORCE=1 CONFIRM_ARMOR_ENFORCE=1 RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1 ...  # + rate-limit 2000 enforce (LATER, separate)
#
# NOTE: WAF sig enforce (deny-403) needs BOTH ARMOR_ENFORCE=1 and its own CONFIRM_ARMOR_ENFORCE=1 gate.
# It ALSO needs CONFIRM_LB=1 (and CONFIRM_ARMOR=1): step 1 hard-exits when CONFIRM_LB != 1, so
# without it the run never reaches the Cloud Armor block and the enforce flip silently no-ops
# (WAF stays in preview). The LB build is idempotent, so re-passing CONFIRM_LB=1 against the
# already-built LB just skips through to the Armor block. Rate-limit rule 2000 is gated SEPARATELY:
# ARMOR_ENFORCE never touches it (a no-users soak can't validate a per-IP limit against building-scale
# NAT), so a WAF-enforce run leaves 2000 in preview; enforcing 2000 needs RATE_LIMIT_ENFORCE=1 +
# CONFIRM_RATE_LIMIT_ENFORCE=1. The ingress lockdown, by contrast, must be a SEPARATE invocation from
# the LB build so the LB path is validated before public run.app access is removed.
#
# Optional overrides: PROJECT_ID, REGION, WEB_SERVICE, WAF_SENSITIVITY, RATE_LIMIT_COUNT,
#   RATE_LIMIT_INTERVAL_SEC, and the resource names below.
#
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
WAF_SENSITIVITY="${WAF_SENSITIVITY:-1}"               # 1 = fewest signatures/false positives; default GCP is 4
RATE_LIMIT_COUNT="${RATE_LIMIT_COUNT:-600}"          # requests per interval per client IP at the edge
RATE_LIMIT_INTERVAL_SEC="${RATE_LIMIT_INTERVAL_SEC:-60}"
ARMOR_ENFORCE="${ARMOR_ENFORCE:-0}"                  # 0 = WAF sig rules 1001-1004 in PREVIEW; 1 = enforce (deny-403). Does NOT touch rule 2000.
RATE_LIMIT_ENFORCE="${RATE_LIMIT_ENFORCE:-0}"        # 0 = rate-limit rule 2000 stays in PREVIEW; 1 = enforce (deny-429). Independent of ARMOR_ENFORCE.

# GitHub repo for repo-variable writes (needs `gh` CLI authed).
GH_REPO="${GH_REPO:-lingolinq/LingoLinq-AAC}"

# Gate flags (default 0 = do not run that gated step).
CONFIRM_LB="${CONFIRM_LB:-0}"
CONFIRM_ARMOR="${CONFIRM_ARMOR:-0}"
CONFIRM_ARMOR_ENFORCE="${CONFIRM_ARMOR_ENFORCE:-0}"  # extra gate required to flip the WAF sig rules to deny-403
CONFIRM_RATE_LIMIT_ENFORCE="${CONFIRM_RATE_LIMIT_ENFORCE:-0}"  # extra gate required to flip rate-limit rule 2000 to deny-429
CONFIRM_INGRESS_LOCKDOWN="${CONFIRM_INGRESS_LOCKDOWN:-0}"
SET_GH_VARS="${SET_GH_VARS:-0}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[1;33m(skip)\033[0m %s\n' "$*"; }
gate() { printf '\n\033[1;31m[GATE]\033[0m %s\n' "$*"; }

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
  [ARMOR] policy $ARMOR_POLICY: OWASP WAF (SQLi/XSS/LFI/RCE) sensitivity=$WAF_SENSITIVITY,
          WAF sig mode=$([ "$ARMOR_ENFORCE" = "1" ] && [ "$CONFIRM_ARMOR_ENFORCE" = "1" ] && echo ENFORCE || echo PREVIEW);
          rate-limit 2000 mode=$([ "$RATE_LIMIT_ENFORCE" = "1" ] && [ "$CONFIRM_RATE_LIMIT_ENFORCE" = "1" ] && echo ENFORCE || echo PREVIEW)
          (${RATE_LIMIT_COUNT}/${RATE_LIMIT_INTERVAL_SEC}s per IP); attached to $BACKEND_NAME
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
  # Enforce (deny-403) is a distinct, outage-capable action, so it needs its OWN gate on top of
  # ARMOR_ENFORCE: a bare ARMOR_ENFORCE=1 must not silently build or flip rules into enforce.
  # (dual-review PR #476)
  ENFORCING=0
  if [ "$ARMOR_ENFORCE" = "1" ]; then
    [ "$CONFIRM_ARMOR_ENFORCE" = "1" ] || {
      echo "ERROR: ARMOR_ENFORCE=1 also requires CONFIRM_ARMOR_ENFORCE=1." >&2
      echo "       Enforce flips the WAF sig rules (1001-1004) from log-only to deny-403; confirm it" >&2
      echo "       deliberately AFTER real post-launch traffic shows no legitimate AAC request is flagged." >&2
      exit 1
    }
    ENFORCING=1
  fi
  # Rate-limit rule 2000 is gated SEPARATELY from the WAF sig rules. It cannot be validated by a
  # no-users soak (a whole school/clinic NATs to one IP and shares one per-IP token bucket, so a
  # generous-looking threshold can still 429 an entire building on launch day). ARMOR_ENFORCE must
  # therefore NEVER flip rule 2000; that needs its own RATE_LIMIT_ENFORCE gate + confirm. (dual-review
  # PR #508 follow-up; Codex + adversary)
  RL_ENFORCING=0
  if [ "$RATE_LIMIT_ENFORCE" = "1" ]; then
    [ "$CONFIRM_RATE_LIMIT_ENFORCE" = "1" ] || {
      echo "ERROR: RATE_LIMIT_ENFORCE=1 also requires CONFIRM_RATE_LIMIT_ENFORCE=1." >&2
      echo "       Enforce flips rate-limit rule 2000 to deny-429; confirm it deliberately AFTER the" >&2
      echo "       threshold is proven generous for building-scale NAT against real district traffic." >&2
      exit 1
    }
    RL_ENFORCING=1
  fi
  if [ "$ENFORCING" = "1" ]; then PREVIEW_FLAG=""; MODE="ENFORCE (deny-403)"; else PREVIEW_FLAG="--preview"; MODE="PREVIEW (log-only)"; fi
  if [ "$RL_ENFORCING" = "1" ]; then RL_PREVIEW_FLAG=""; RL_MODE="ENFORCE (deny-429)"; else RL_PREVIEW_FLAG="--preview"; RL_MODE="PREVIEW (log-only)"; fi

  log "Step 2a: Cloud Armor policy $ARMOR_POLICY (WAF mode: $MODE, sensitivity=$WAF_SENSITIVITY)"
  if gcloud compute security-policies describe "$ARMOR_POLICY" --project="$PROJECT_ID" >/dev/null 2>&1; then
    skip "security policy $ARMOR_POLICY already exists"
  else
    gcloud compute security-policies create "$ARMOR_POLICY" \
      --project="$PROJECT_ID" --description="LingoLinq edge WAF + rate limiting (front of $WEB_SERVICE)"
  fi
  # Verbose logging so the rehearsal can see what preview-mode WAF rules WOULD have blocked.
  # Re-asserted on EVERY armor run (idempotent) so a policy created out-of-band still gets it.
  gcloud compute security-policies update "$ARMOR_POLICY" \
    --project="$PROJECT_ID" --log-level=VERBOSE

  # Preconfigured OWASP WAF rule sets (current rule IDs verified 2026-06-23: sqli/xss are the
  # *-v422-stable sets). Low sensitivity + preview so free-text AAC utterances are not blocked
  # until the POST-REAL-TRAFFIC preview-log review proves the rules clean (the no-users soak cannot);
  # flip to enforce with ARMOR_ENFORCE=1 afterward (runbook step 9c), never pre-DNS.
  declare -A WAF_RULES=(
    [1001]="sqli-v422-stable"
    [1002]="xss-v422-stable"
    [1003]="lfi-v422-stable"
    [1004]="rce-v422-stable"
  )
  for PRIO in "${!WAF_RULES[@]}"; do
    RULESET="${WAF_RULES[$PRIO]}"
    if gcloud compute security-policies rules describe "$PRIO" --security-policy="$ARMOR_POLICY" --project="$PROJECT_ID" >/dev/null 2>&1; then
      skip "WAF rule $PRIO ($RULESET) already exists"
      # Idempotently converge an EXISTING rule to enforce, so the documented preview->enforce flip
      # actually takes effect on a re-run instead of being silently skipped by the describe check
      # above and left in preview. (dual-review PR #476)
      if [ "$ENFORCING" = "1" ]; then
        log "Step 2b: flip existing WAF rule $PRIO -> ENFORCE (--no-preview)"
        gcloud compute security-policies rules update "$PRIO" \
          --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" --action=deny-403 --no-preview
      fi
    else
      log "Step 2b: WAF rule $PRIO -> $RULESET (deny-403, $MODE)"
      # shellcheck disable=SC2086
      gcloud compute security-policies rules create "$PRIO" \
        --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" \
        --expression="evaluatePreconfiguredWaf('$RULESET', {'sensitivity': $WAF_SENSITIVITY})" \
        --action=deny-403 $PREVIEW_FLAG
    fi
  done

  log "Step 2c: edge rate-limit rule 2000 (throttle ${RATE_LIMIT_COUNT}/${RATE_LIMIT_INTERVAL_SEC}s per IP, $RL_MODE)"
  # Defense-in-depth on top of the app's Rack::Attack; conservative so normal AAC use is unaffected.
  # Rule 2000 tracks RL_ENFORCING, NOT ENFORCING: an ARMOR_ENFORCE (WAF sig) run never touches it.
  if gcloud compute security-policies rules describe 2000 --security-policy="$ARMOR_POLICY" --project="$PROJECT_ID" >/dev/null 2>&1; then
    skip "rate-limit rule 2000 already exists"
    if [ "$RL_ENFORCING" = "1" ]; then
      # Re-apply the full rate-limit config, not just --no-preview: an update call that omits
      # --rate-limit-threshold-count/--interval-sec/--conform-action/--exceed-action/--enforce-on-key
      # leaves an EXISTING rule at whatever values it was created/last-updated with, so an operator who
      # tunes RATE_LIMIT_COUNT/RATE_LIMIT_INTERVAL_SEC and re-runs would see this banner claim the new
      # number while GCP silently keeps enforcing the stale one. (Codex senior-dev review of PR #513)
      log "Step 2c: flip existing rate-limit rule 2000 -> ENFORCE at ${RATE_LIMIT_COUNT}/${RATE_LIMIT_INTERVAL_SEC}s (--no-preview)"
      gcloud compute security-policies rules update 2000 \
        --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" \
        --rate-limit-threshold-count="$RATE_LIMIT_COUNT" \
        --rate-limit-threshold-interval-sec="$RATE_LIMIT_INTERVAL_SEC" \
        --conform-action=allow --exceed-action=deny-429 \
        --enforce-on-key=IP --no-preview
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
    # shellcheck disable=SC2086
    gcloud compute security-policies rules create 2000 \
      --project="$PROJECT_ID" --security-policy="$ARMOR_POLICY" \
      --src-ip-ranges="*" \
      --action=throttle \
      --rate-limit-threshold-count="$RATE_LIMIT_COUNT" \
      --rate-limit-threshold-interval-sec="$RATE_LIMIT_INTERVAL_SEC" \
      --conform-action=allow --exceed-action=deny-429 \
      --enforce-on-key=IP $RL_PREVIEW_FLAG
  fi

  log "Step 2d: attach $ARMOR_POLICY to backend $BACKEND_NAME"
  gcloud compute backend-services update "$BACKEND_NAME" \
    --project="$PROJECT_ID" --global --security-policy="$ARMOR_POLICY"

  # Read back and print the ACTUAL preview state of every rule (preview=true => log-only,
  # preview=false => enforcing), so the operator never trusts the intended MODE banner over the
  # real policy state before proceeding to lockdown / DNS. (dual-review PR #476)
  log "Step 2e: actual WAF rule modes (preview=true is log-only, false is enforcing)"
  for PRIO in "${!WAF_RULES[@]}" 2000; do
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
      echo "    rule $PRIO: preview=$ACTUAL_PREVIEW"
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
  and (if CONFIRM_ARMOR) Cloud Armor $ARMOR_POLICY in $([ "$ARMOR_ENFORCE" = "1" ] && [ "$CONFIRM_ARMOR_ENFORCE" = "1" ] && echo ENFORCE || echo PREVIEW).

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
      and the preview logs show no legitimate AAC request flagged, flip the WAF SIG rules to enforce:
      CONFIRM_LB=1 CONFIRM_ARMOR=1 ARMOR_ENFORCE=1 CONFIRM_ARMOR_ENFORCE=1 (CONFIRM_LB=1 is
      required or step 1 exits before the Armor block and the flip no-ops). This leaves rate-limit
      rule 2000 in PREVIEW. Enforce 2000 SEPARATELY and LATER, only once its threshold is proven
      generous for building-scale NAT, by ALSO adding RATE_LIMIT_ENFORCE=1 CONFIRM_RATE_LIMIT_ENFORCE=1.

  Teardown (reverse order): forwarding-rules -> proxies -> url-maps -> ssl-certificates ->
  backend-services -> network-endpoint-groups -> addresses; detach + delete the Cloud Armor
  policy; restore ingress with --ingress=all.
HANDOFF
