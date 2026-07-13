#!/usr/bin/env bash
#
# phase4-seed-boot-secrets.sh - LingoLinq Render -> GCP Cloud Run migration, Phase 4 (cutover).
#
# Copies the FOUR generateValue secrets into GCP Secret Manager, preserving their exact bytes:
#
#     SECRET_KEY_BASE  COOKIE_KEY  SECURE_ENCRYPTION_KEY  SECURE_NONCE_KEY
#
# These MUST be preserved, never regenerated. SECURE_ENCRYPTION_KEY and SECURE_NONCE_KEY feed
# GoSecure's symmetric encryption (config/environment.rb, app/models/external_nonce.rb,
# app/models/concerns/secure_serialize.rb). Regenerating either makes every secure_serialize'd
# column and ExternalNonce permanently undecryptable; regenerating SECRET_KEY_BASE (COOKIE_KEY is
# its non-prod fallback, config/initializers/secret_token.rb) invalidates all live sessions. A
# wrong value here is SILENT until users cannot log in or encrypted data fails to decrypt -- so
# this script proves correctness before it writes.
#
# SOURCE OF TRUTH (decided 2026-06-18): the 1Password "LingoLinq Prod" vault, item "Rails
# Secrets". This is what scripts/sync-render-env.js already treats as canonical and pushes to
# Render hourly, so 1Password is authoritative and Render is downstream of it. We seed GCP from
# 1Password and INDEPENDENTLY verify each value byte-for-byte (sha256) against the LIVE Render
# env before writing. Any mismatch or empty value is a HARD STOP, never a silent paper-over.
#
# WHITESPACE: `op read` appends a trailing newline (a CLI artifact, not part of the secret).
# bash `$(...)` strips trailing newlines, recovering the true value -- exactly what
# sync-render-env.js does with `.trim()`, so the bytes match what is already live in Render and
# what the app uses. We then seed with `printf '%s'` (no added newline). We do NOT trim anything
# else: the sha256 compare is over the full value, so genuine internal contamination still STOPs.
#
# NEVER ECHOED: secret values are read into shell vars, hashed, piped straight into
# `gcloud secrets versions add --data-file=-`, and unset. Only sha256 prefixes and "value not
# shown" lines are printed. The secret-handling region defensively disables xtrace so `bash -x`
# cannot leak a value.
#
# MODES:
#   ./phase4-seed-boot-secrets.sh                 # PLAN: print the 4 names + what seed would do.
#                                                 #   No reads, no creds needed, writes nothing.
#   ./phase4-seed-boot-secrets.sh --fingerprint   # read 1Password only; print each sha256.
#                                                 #   For compliance review; no Render/GCP, no write.
#   ./phase4-seed-boot-secrets.sh --verify        # read 1Password + Render; compare; report.
#                                                 #   No write. The dry verification.
#   CONFIRM_SEED_SECRETS=1 ./phase4-seed-boot-secrets.sh   # verify THEN seed GCP Secret Manager.
#
# Run as Scot or a designated engineer with prod GCP + 1Password Prod + Render access (HIPAA:
# this is an auditable change). On a single-operator host; do not run on a shared box or under -x.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-lingolinq-prod}"
OP_VAULT="${OP_VAULT:-LingoLinq Prod}"
OP_ITEM="${OP_ITEM:-Rails Secrets}"
RENDER_PROD_SERVICE_ID="${RENDER_PROD_SERVICE_ID:-srv-d510bsemcj7s73966i60}"   # lingolinq-prod
RUNTIME_SA_ID="${RUNTIME_SA_ID:-lingolinq-run}"
RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

# Name is identical across all three systems: GCP secret == 1Password field == Render env key.
SECRETS=(SECRET_KEY_BASE COOKIE_KEY SECURE_ENCRYPTION_KEY SECURE_NONCE_KEY)

CONFIRM_SEED_SECRETS="${CONFIRM_SEED_SECRETS:-0}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[1;33m(skip)\033[0m %s\n' "$*"; }
gate() { printf '\n\033[1;31m[GATE]\033[0m %s\n' "$*"; }

# ---- mode resolution -------------------------------------------------------------------------
MODE="plan"
case "${1:-}" in
  "")             [ "$CONFIRM_SEED_SECRETS" = "1" ] && MODE="seed" || MODE="plan" ;;
  --verify)       MODE="verify" ;;
  --fingerprint)  MODE="fingerprint" ;;
  *) echo "usage: $0 [--verify | --fingerprint]   (set CONFIRM_SEED_SECRETS=1 to seed)" >&2; exit 2 ;;
esac

# ---- helpers (no plaintext ever printed) -----------------------------------------------------
read_1p()       { op read "op://${OP_VAULT}/${OP_ITEM}/$1" 2>/dev/null; }   # $()=strips CLI newline
sha()           { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
# first(...) so a duplicate key on Render can't newline-join two values; // empty => "" when absent.
render_value()  { printf '%s' "$RENDER_ENV_JSON" | jq -r --arg k "$1" 'first(.[] | (.envVar // .) | select(.key==$k) | .value) // empty'; }
RENDER_ENV_JSON=""

# Fetch the FULL prod env-var list into RENDER_ENV_JSON, paging until exhausted. Render paginates
# (default 20; we ask 100/page) and returns [{envVar:{key,value}, cursor}]. We must page to the end
# so a target key cannot fall off page 1 and read as a false "empty on Render" (which would STOP the
# cutover with a misleading message). -f makes curl fail non-zero on any 4xx/5xx incl 429; a failure
# here is a HARD STOP, never a retry (retrying a 429 mid-cutover risks a partial seed).
# CALLER MUST have xtrace disabled before calling this: the Bearer token is on the curl arg line.
fetch_render_all() {
  command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not found (needed to read Render)." >&2; exit 1; }
  command -v jq   >/dev/null 2>&1 || { echo "ERROR: jq not found (needed to parse Render)." >&2; exit 1; }
  [ -n "${RENDER_API_KEY:-}" ] || { echo "ERROR: RENDER_API_KEY not set. e.g. export RENDER_API_KEY=\$(op read 'op://LingoLinq Admin/Render API/credential')" >&2; exit 1; }
  local base="https://api.render.com/v1/services/${RENDER_PROD_SERVICE_ID}/env-vars?limit=100"
  local url cursor="" page n combined='[]'
  while :; do
    if [ -n "$cursor" ]; then url="${base}&cursor=${cursor}"; else url="$base"; fi
    page="$(curl -fsS --max-time 20 \
      -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' "$url")" \
      || { echo "ERROR: Render API request failed (HTTP error / 429 / network). STOP -- do not retry blindly." >&2; exit 1; }
    printf '%s' "$page" | jq -e 'type=="array"' >/dev/null 2>&1 \
      || { echo "ERROR: unexpected Render API response shape (expected a JSON array)." >&2; exit 1; }
    n="$(printf '%s' "$page" | jq 'length')"
    combined="$(jq -s 'add' <(printf '%s' "$combined") <(printf '%s' "$page"))"
    cursor="$(printf '%s' "$page" | jq -r '.[-1].cursor // empty')"
    [ "$n" -lt 100 ] && break          # short page => last page
    [ -z "$cursor" ] && break          # no cursor => nothing more to fetch
  done
  RENDER_ENV_JSON="$combined"
}

# ---- PLAN mode: zero creds, zero reads, zero writes ------------------------------------------
if [ "$MODE" = "plan" ]; then
  cat <<PLAN

  PHASE 4 generateValue secret preservation -- PLAN (nothing read, nothing written)
  -------------------------------------------------------------------------------
  Source of truth : 1Password  "${OP_VAULT}" / "${OP_ITEM}"
  Verified against: live Render service ${RENDER_PROD_SERVICE_ID} (sha256, never echoed)
  Target          : GCP Secret Manager in project ${PROJECT_ID}

  Secrets that WOULD be seeded (only on byte-for-byte 1Password==Render match):
$(printf '    - %s\n' "${SECRETS[@]}")

  These four are generateValue on Render and MUST be preserved, never regenerated.
  DATABASE_URL / REDIS_URL / REDIS_CA_CERT are already seeded by phase3-data-layer.sh;
  DEFAULT_HOST + the mail secrets are non-encryption config seeded separately -- NOT here.

  Next:
    $0 --fingerprint                         # print 1Password sha256 fingerprints (compliance)
    $0 --verify                              # compare 1Password vs Render, no write
    CONFIRM_SEED_SECRETS=1 $0                # verify THEN seed GCP Secret Manager
PLAN
  gate "PLAN only. Re-run with CONFIRM_SEED_SECRETS=1 to seed (after --verify is green)."
  exit 0
fi

# ---- preflight for read/seed modes -----------------------------------------------------------
command -v op >/dev/null 2>&1 || { echo "ERROR: 1Password CLI 'op' not found." >&2; exit 1; }
op vault list >/dev/null 2>&1 || { echo "ERROR: 'op' is not signed in (run: op signin, or set OP_SERVICE_ACCOUNT_TOKEN)." >&2; exit 1; }

# ---- FINGERPRINT mode: 1Password only --------------------------------------------------------
if [ "$MODE" = "fingerprint" ]; then
  log "1Password fingerprints ($OP_VAULT / $OP_ITEM) -- sha256 only, no plaintext"
  case "$-" in *x*) XWAS=1 ;; *) XWAS=0 ;; esac
  set +x
  for NAME in "${SECRETS[@]}"; do
    V="$(read_1p "$NAME")" || true
    [ -n "$V" ] || { echo "ERROR: $NAME is empty/absent in 1Password ($OP_VAULT/$OP_ITEM)." >&2; exit 1; }
    echo "    $NAME sha256=$(sha "$V")"
    unset V
  done
  [ "${XWAS:-0}" -eq 1 ] && set -x || true
  exit 0
fi

# ---- VERIFY / SEED modes ---------------------------------------------------------------------
if [ "$MODE" = "seed" ]; then
  command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud not found (needed to seed)." >&2; exit 1; }
  gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 || { echo "ERROR: project $PROJECT_ID not accessible." >&2; exit 1; }
fi

# Disable xtrace for the ENTIRE token+secret region: the Render Bearer token (on fetch_render_all's
# curl arg line) and every secret value below must never be traced under an inherited `set -x` /
# SHELLOPTS=xtrace. Restored at the end of the loop.
case "$-" in *x*) XWAS=1 ;; *) XWAS=0 ;; esac
set +x

log "Reading live Render env (service $RENDER_PROD_SERVICE_ID) for the cross-check"
fetch_render_all
echo "    Render env list fetched (${#SECRETS[@]} keys to verify)"

log "Verify 1Password == live Render for each secret (sha256, never echoed)"
for NAME in "${SECRETS[@]}"; do
  V1P="$(read_1p "$NAME")" || true
  VR="$(render_value "$NAME")" || true

  # Empty/null guard: never seed against an empty value; an empty side means a missing 1Password
  # field or a transient Render gap. Treat as a mismatch and STOP.
  if [ -z "$V1P" ] || [ -z "$VR" ]; then
    MISS=""
    [ -z "$V1P" ] && MISS="1Password"
    [ -z "$VR" ] && MISS="${MISS:+$MISS and }Render"
    echo "STOP: $NAME is empty on $MISS -- not seeding. Investigate before retrying." >&2
    unset V1P VR
    [ "${XWAS:-0}" -eq 1 ] && set -x || true
    exit 1
  fi

  H1P="$(sha "$V1P")"
  HR="$(sha "$VR")"
  if [ "$H1P" != "$HR" ]; then
    echo "MISMATCH $NAME: 1Password sha256 ${H1P:0:12}... != Render sha256 ${HR:0:12}..." >&2
    echo "  HARD STOP -- do NOT seed. Likely a stray trailing newline or edit drift in the" >&2
    echo "  1Password field vs what is live on Render. Reconcile, then re-run --verify." >&2
    unset V1P VR H1P HR
    [ "${XWAS:-0}" -eq 1 ] && set -x || true
    exit 1
  fi
  echo "    $NAME: 1Password == Render OK (sha256 ${H1P:0:12}...)"

  if [ "$MODE" = "seed" ]; then
    gcloud secrets describe "$NAME" --project="$PROJECT_ID" >/dev/null 2>&1 \
      || { echo "ERROR: secret $NAME not found in $PROJECT_ID; it should exist (empty) from Phase 1." >&2; unset V1P VR H1P HR; [ "${XWAS:-0}" -eq 1 ] && set -x || true; exit 1; }
    # Idempotent: only add a version if the value actually changed, so re-runs do not churn.
    CUR="$(gcloud secrets versions access latest --secret="$NAME" --project="$PROJECT_ID" 2>/dev/null || true)"
    if [ -n "$CUR" ] && [ "$(sha "$CUR")" = "$H1P" ]; then
      skip "$NAME already holds the verified value in GCP (no new version)"
    else
      printf '%s' "$V1P" | gcloud secrets versions add "$NAME" --project="$PROJECT_ID" --data-file=- >/dev/null
      echo "    $NAME: new version added to GCP Secret Manager (value not shown)"
    fi
    # Re-assert the runtime SA accessor (idempotent; Phase 1 already granted it).
    gcloud secrets add-iam-policy-binding "$NAME" --project="$PROJECT_ID" \
      --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
    unset CUR
  fi
  unset V1P VR H1P HR
done
[ "${XWAS:-0}" -eq 1 ] && set -x || true

if [ "$MODE" = "verify" ]; then
  log "VERIFY complete: all ${#SECRETS[@]} secrets match between 1Password and Render. Nothing written."
  gate "Re-run with CONFIRM_SEED_SECRETS=1 to seed GCP Secret Manager."
else
  log "SEED complete: all ${#SECRETS[@]} generateValue secrets verified and present in GCP Secret Manager ($PROJECT_ID)."
fi
