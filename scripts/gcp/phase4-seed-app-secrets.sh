#!/usr/bin/env bash
#
# phase4-seed-app-secrets.sh - LingoLinq Render -> GCP Cloud Run migration, env reconciliation (4.E1).
#
# Seeds the NON-BOOT app secrets the web service + worker need at RUNTIME into GCP Secret Manager:
#
#   GOOGLE_TTS_TOKEN GOOGLE_PLACES_TOKEN GOOGLE_TRANSLATE_TOKEN MAPS_KEY GOOGLE_OAUTH_CLIENT_ID
#   GOOGLE_OAUTH_CLIENT_SECRET STRIPE_SECRET_KEY SENTRY_DSN
#   SMS_ENCRYPTION_KEY INTERNAL_API_TOKEN CACHE_TOKEN OPENSYMBOLS_SECRET IPLOCATE_API_KEY
#   YOUTUBE_API_KEY                                            <- 13 Render-prod-sourced
#   AWS_KEY AWS_SECRET                                         <- 2 NEW-IAM-user, 1Password-sourced
#
# SOURCE OF TRUTH (decided 2026-06-29): **live Render prod** for the 13, because 6 of the keys
# (MAPS_KEY, GOOGLE_OAUTH_*, SENTRY_DSN, INTERNAL_API_TOKEN, CACHE_TOKEN) are NOT in the 1Password
# sync manifest (scripts/sync-render-env.js) - only Render prod holds all of them, and seeding the
# exact bytes prod runs today guarantees functional parity for the cutover. This is the INVERSE of
# phase4-seed-boot-secrets.sh (which is 1Password-first); the boot secrets are all in 1Password, the
# app set is not. Where 1Password DOES know a key (the manifest map below), `--xcheck` cross-checks
# Render vs 1Password and WARNS on drift (does not stop - Render is authoritative here).
#
# AWS_KEY / AWS_SECRET are the EXCEPTION: they are a NEW least-privilege IAM user minted for Cloud Run
# (scripts/gcp/iam/), NOT Render's broad key. They are sourced from 1Password "LingoLinq Prod" /
# "AWS_IAM_ACCESSKEY" (fields AWS_KEY/AWS_SECRET) and are asserted to DIFFER from Render's AWS_KEY (so we
# never silently re-seed the old key). Seed them only after the IAM user exists; see scripts/gcp/iam/README.md.
# NOTE: the Prod-vault item "AWS Credentials" holds the OLD broad lingolinq-app key under the same
# AWS_KEY/AWS_SECRET field labels -- do NOT point OP_AWS_ITEM at it (the differs-from-Render guard stops it).
#
# SMS_ENCRYPTION_KEY is preserve-exact: it salts persisted RemoteTarget.source_hash, so a changed
# value orphans existing SMS rows. Reading it from live Render IS the preserve-exact source.
#
# NEVER ECHOED: values are read into shell vars, hashed, piped straight into
# `gcloud secrets versions add --data-file=-`, and unset. Only sha256 prefixes and "value not shown"
# lines are printed. The secret region defensively disables xtrace so `bash -x` cannot leak a value.
#
# MODES:
#   ./phase4-seed-app-secrets.sh                  # PLAN: print the names + dispositions. No reads,
#                                                 #   no creds, writes nothing.
#   ./phase4-seed-app-secrets.sh --verify         # read Render (+1P for AWS); report presence +
#                                                 #   sha256 prefixes; no write. The dry run.
#   ./phase4-seed-app-secrets.sh --xcheck         # like --verify, plus Render-vs-1Password drift
#                                                 #   warnings for manifest-known keys.
#   CONFIRM_SEED_SECRETS=1 ./phase4-seed-app-secrets.sh        # verify THEN seed GCP Secret Manager.
#   ...  --only AWS_KEY,AWS_SECRET                # restrict to a subset (any mode). e.g. seed just
#                                                 #   the AWS pair after creating the IAM user.
#
# Run as Scot or a designated engineer with prod GCP + 1Password Prod + Render access (HIPAA: this is
# an auditable change). On a single-operator host; do not run on a shared box or under -x.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-lingolinq-prod}"
RENDER_PROD_SERVICE_ID="${RENDER_PROD_SERVICE_ID:-srv-d510bsemcj7s73966i60}"   # lingolinq-prod
RUNTIME_SA_ID="${RUNTIME_SA_ID:-lingolinq-run}"
RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
OP_AWS_VAULT="${OP_AWS_VAULT:-LingoLinq Prod}"
OP_AWS_ITEM="${OP_AWS_ITEM:-AWS_IAM_ACCESSKEY}"

# The 13 secrets sourced from live Render prod (exact running bytes).
# NOTE: MAPS_KEY is intentionally NOT here. It is a CLIENT-PUBLIC key emitted into the browser via
# app/assets/javascripts/globals.js.erb at `rake assets:precompile` (BUILD time), not read by any
# runtime server code -- so a runtime Secret Manager mount would never reach the browser. It must be
# passed as a Docker build ARG for Maps client features to work on GCP. Tracked as a pre-cutover gate
# (Maps is not in the clean-DB rehearsal smoke path). See the PR / iam README. (Adversary 4.E1, M2.)
RENDER_SECRETS=(
  GOOGLE_TTS_TOKEN GOOGLE_PLACES_TOKEN GOOGLE_TRANSLATE_TOKEN
  GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET STRIPE_SECRET_KEY
  SENTRY_DSN SMS_ENCRYPTION_KEY
  INTERNAL_API_TOKEN CACHE_TOKEN OPENSYMBOLS_SECRET IPLOCATE_API_KEY YOUTUBE_API_KEY
)
# The 2 secrets sourced from 1Password (NEW IAM user), never from Render.
AWS_SECRETS=(AWS_KEY AWS_SECRET)

# 1Password cross-check map (only the manifest-known keys; mirrors scripts/sync-render-env.js for the
# prod env). Used by --xcheck for WARN-only drift detection. Keys absent here are Render-only.
declare -A OP_XCHECK=(
  [SMS_ENCRYPTION_KEY]="op://LingoLinq Prod/Rails Secrets/SMS_ENCRYPTION_KEY"
  [STRIPE_SECRET_KEY]="op://LingoLinq Prod/Stripe/STRIPE_SECRET_KEY"
  [GOOGLE_TTS_TOKEN]="op://LingoLinq Shared Dev/Google APIs/GOOGLE_TTS_TOKEN"
  [GOOGLE_TRANSLATE_TOKEN]="op://LingoLinq Shared Dev/Google APIs/GOOGLE_TRANSLATE_TOKEN"
  [GOOGLE_PLACES_TOKEN]="op://LingoLinq Shared Dev/Google APIs/GOOGLE_PLACES_TOKEN"
  [YOUTUBE_API_KEY]="op://LingoLinq Shared Dev/Google APIs/YOUTUBE_API_KEY"
  [OPENSYMBOLS_SECRET]="op://LingoLinq Shared Dev/OpenSymbols/OPENSYMBOLS_SECRET"
  [IPLOCATE_API_KEY]="op://LingoLinq Shared Dev/External Services/IPLOCATE_API_KEY"
)

CONFIRM_SEED_SECRETS="${CONFIRM_SEED_SECRETS:-0}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[1;33m(skip)\033[0m %s\n' "$*"; }
warn() { printf '    \033[1;33m[warn]\033[0m %s\n' "$*"; }
gate() { printf '\n\033[1;31m[GATE]\033[0m %s\n' "$*"; }

# ---- arg parsing -----------------------------------------------------------------------------
MODE="plan"; ONLY=""; ALLOW_RENDER_ABSENT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --verify)              MODE="verify" ;;
    --xcheck)              MODE="xcheck" ;;
    --only)                ONLY="${2:-}"; shift ;;
    --only=*)              ONLY="${1#--only=}" ;;
    --allow-render-absent) ALLOW_RENDER_ABSENT=1 ;;
    *) echo "usage: $0 [--verify | --xcheck] [--only K1,K2] [--allow-render-absent]   (CONFIRM_SEED_SECRETS=1 to seed)" >&2; exit 2 ;;
  esac
  shift
done
[ "$MODE" = "plan" ] && [ "$CONFIRM_SEED_SECRETS" = "1" ] && MODE="seed"

# Validate every --only token against the known names: a typo (e.g. AWS_SECRETT) must HARD-FAIL, not
# silently filter to an empty set and report "complete" having written nothing. (Adversary 4.E1, L5.)
if [ -n "$ONLY" ]; then
  KNOWN=" ${RENDER_SECRETS[*]} ${AWS_SECRETS[*]} "
  IFS=',' read -ra _only_toks <<< "$ONLY"
  for t in "${_only_toks[@]}"; do
    [ -z "$t" ] && continue
    case "$KNOWN" in *" $t "*) : ;; *) echo "ERROR: --only token '$t' is not a known app secret name." >&2; exit 2 ;; esac
  done
fi

# Build the working set, honoring --only.
selected() {
  local k; for k in "$@"; do
    if [ -n "$ONLY" ]; then case ",$ONLY," in *",$k,"*) echo "$k" ;; esac; else echo "$k"; fi
  done
}
SEL_RENDER=(); while IFS= read -r k; do [ -n "$k" ] && SEL_RENDER+=("$k"); done < <(selected "${RENDER_SECRETS[@]}")
SEL_AWS=();    while IFS= read -r k; do [ -n "$k" ] && SEL_AWS+=("$k");    done < <(selected "${AWS_SECRETS[@]}")

# ---- helpers (no plaintext ever printed) -----------------------------------------------------
sha()          { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
read_1p()      { op read "$1" 2>/dev/null; }   # $()=strips the CLI trailing newline
render_value() { printf '%s' "$RENDER_ENV_JSON" | jq -r --arg k "$1" 'first(.[] | (.envVar // .) | select(.key==$k) | .value) // empty'; }
RENDER_ENV_JSON=""

# Page the full prod env list so a target key cannot fall off page 1 and read as a false "empty".
# -f => curl fails non-zero on any 4xx/5xx (incl 429); a failure here is a HARD STOP, never a retry.
# CALLER MUST have xtrace disabled before calling this: the Bearer token is on the curl arg line.
fetch_render_all() {
  command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not found." >&2; exit 1; }
  command -v jq   >/dev/null 2>&1 || { echo "ERROR: jq not found." >&2; exit 1; }
  [ -n "${RENDER_API_KEY:-}" ] || { echo "ERROR: RENDER_API_KEY not set. e.g. export RENDER_API_KEY=\$(op read 'op://LingoLinq Admin/Render API/credential')" >&2; exit 1; }
  local base="https://api.render.com/v1/services/${RENDER_PROD_SERVICE_ID}/env-vars?limit=100"
  local url cursor="" page n combined='[]'
  while :; do
    if [ -n "$cursor" ]; then url="${base}&cursor=${cursor}"; else url="$base"; fi
    page="$(curl -fsS --max-time 20 -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' "$url")" \
      || { echo "ERROR: Render API request failed (HTTP / 429 / network). STOP - do not retry blindly." >&2; exit 1; }
    printf '%s' "$page" | jq -e 'type=="array"' >/dev/null 2>&1 \
      || { echo "ERROR: unexpected Render API response shape (expected a JSON array)." >&2; exit 1; }
    n="$(printf '%s' "$page" | jq 'length')"
    combined="$(jq -s 'add' <(printf '%s' "$combined") <(printf '%s' "$page"))"
    cursor="$(printf '%s' "$page" | jq -r '.[-1].cursor // empty')"
    [ "$n" -lt 100 ] && break
    [ -z "$cursor" ] && break
  done
  RENDER_ENV_JSON="$combined"
}

# ---- PLAN mode: zero creds, zero reads, zero writes ------------------------------------------
if [ "$MODE" = "plan" ]; then
  cat <<PLAN

  APP-secret seeding (migration 4.E1) -- PLAN (nothing read, nothing written)
  -------------------------------------------------------------------------------
  Target          : GCP Secret Manager in project ${PROJECT_ID}
  Render-sourced  : live Render service ${RENDER_PROD_SERVICE_ID} (exact running bytes)
  1Password-sourced (AWS only): "${OP_AWS_VAULT}" / "${OP_AWS_ITEM}" (the NEW least-priv IAM user)

  Render-prod-sourced (seeded as the exact running value):
$(printf '    - %s\n' "${SEL_RENDER[@]}")

  1Password-sourced - NEW IAM user, asserted != Render's key (seed AFTER iam/ user exists):
$(printf '    - %s\n' "${SEL_AWS[@]}")

  SMS_ENCRYPTION_KEY is preserve-exact (orphans SMS rows if changed). The migration Job does NOT
  load these (boot set only); they go on web + worker via the workflow's NON_BOOT_SECRETS.

  Next:
    $0 --verify                              # presence + sha256 prefixes, no write
    $0 --xcheck                              # + Render-vs-1Password drift warnings
    CONFIRM_SEED_SECRETS=1 $0                # verify THEN seed GCP Secret Manager
    CONFIRM_SEED_SECRETS=1 $0 --only AWS_KEY,AWS_SECRET   # seed just the AWS pair post-IAM-create
PLAN
  gate "PLAN only. Re-run with CONFIRM_SEED_SECRETS=1 to seed (after --verify is green)."
  exit 0
fi

# ---- preflight for read/seed modes -----------------------------------------------------------
command -v op >/dev/null 2>&1 || { echo "ERROR: 1Password CLI 'op' not found." >&2; exit 1; }
op vault list >/dev/null 2>&1 || { echo "ERROR: 'op' is not signed in (run: op signin)." >&2; exit 1; }
if [ "$MODE" = "seed" ]; then
  command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud not found (needed to seed)." >&2; exit 1; }
  gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 || { echo "ERROR: project $PROJECT_ID not accessible." >&2; exit 1; }
fi

# Disable xtrace for the ENTIRE token+secret region. Restored at the very end.
case "$-" in *x*) XWAS=1 ;; *) XWAS=0 ;; esac
set +x

# A seed/version helper shared by both sources. $1=name $2=value $3=sha. Idempotent + re-grants SA.
seed_one() {
  local NAME="$1" VAL="$2" H="$3" CUR
  gcloud secrets describe "$NAME" --project="$PROJECT_ID" >/dev/null 2>&1 \
    || { echo "ERROR: secret $NAME not found in $PROJECT_ID; create it (empty) via phase1-setup.sh first." >&2; return 1; }
  CUR="$(gcloud secrets versions access latest --secret="$NAME" --project="$PROJECT_ID" 2>/dev/null || true)"
  if [ -n "$CUR" ] && [ "$(sha "$CUR")" = "$H" ]; then
    skip "$NAME already holds this value in GCP (no new version)"
  else
    printf '%s' "$VAL" | gcloud secrets versions add "$NAME" --project="$PROJECT_ID" --data-file=- >/dev/null
    echo "    $NAME: new version added to GCP Secret Manager (value not shown)"
  fi
  gcloud secrets add-iam-policy-binding "$NAME" --project="$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
  unset CUR
}

log "Reading live Render prod env (service $RENDER_PROD_SERVICE_ID)"
fetch_render_all
echo "    Render env list fetched"

# ---- Render-sourced secrets ------------------------------------------------------------------
if [ "${#SEL_RENDER[@]}" -gt 0 ]; then
  log "Render-sourced app secrets (${#SEL_RENDER[@]})"
  for NAME in "${SEL_RENDER[@]}"; do
    VR="$(render_value "$NAME")" || true
    if [ -z "$VR" ]; then
      echo "STOP: $NAME is empty/absent on live Render prod - cannot seed a parity value. Investigate." >&2
      unset VR; [ "${XWAS:-0}" -eq 1 ] && set -x || true; exit 1
    fi
    HR="$(sha "$VR")"
    echo "    $NAME: present on Render (sha256 ${HR:0:12}...)"

    if [ "$MODE" = "xcheck" ] && [ -n "${OP_XCHECK[$NAME]:-}" ]; then
      V1P="$(read_1p "${OP_XCHECK[$NAME]}")" || true
      if [ -z "$V1P" ]; then
        warn "$NAME: 1Password path ${OP_XCHECK[$NAME]} empty/unreadable (Render value still authoritative)"
      elif [ "$(sha "$V1P")" != "$HR" ]; then
        warn "$NAME: DRIFT - Render sha ${HR:0:12}... != 1Password sha $(sha "$V1P" | cut -c1-12)... (seeding RENDER; reconcile 1P later)"
      else
        echo "      xcheck: 1Password == Render OK"
      fi
      unset V1P
    fi

    [ "$MODE" = "seed" ] && { seed_one "$NAME" "$VR" "$HR" || { unset VR HR; [ "${XWAS:-0}" -eq 1 ] && set -x || true; exit 1; }; }
    unset VR HR
  done
fi

# ---- AWS-from-1Password (NEW IAM user) -------------------------------------------------------
if [ "${#SEL_AWS[@]}" -gt 0 ]; then
  log "1Password-sourced AWS secrets (NEW least-priv IAM user) - asserted != Render's key"
  for NAME in "${SEL_AWS[@]}"; do
    V1P="$(read_1p "op://${OP_AWS_VAULT}/${OP_AWS_ITEM}/${NAME}")" || true
    if [ -z "$V1P" ]; then
      echo "STOP: $NAME empty/absent in 1Password (${OP_AWS_VAULT}/${OP_AWS_ITEM}). Create the IAM user" >&2
      echo "      and store the new key there first - see scripts/gcp/iam/README.md." >&2
      unset V1P; [ "${XWAS:-0}" -eq 1 ] && set -x || true; exit 1
    fi
    H1P="$(sha "$V1P")"
    VR="$(render_value "$NAME")" || true
    if [ -z "$VR" ]; then
      # Absent on Render is INCONCLUSIVE, not a pass: we cannot prove the 1Password value isn't the
      # old broad key. Require an explicit override before seeding. (Adversary 4.E1, L4.)
      if [ "$ALLOW_RENDER_ABSENT" != "1" ]; then
        echo "STOP: $NAME has no same-named value on Render to compare against, so the 'differs from the" >&2
        echo "      old broad key' guarantee cannot be checked. If you are certain 1Password holds the NEW" >&2
        echo "      least-priv key, re-run with --allow-render-absent. See scripts/gcp/iam/README.md." >&2
        unset V1P H1P VR; [ "${XWAS:-0}" -eq 1 ] && set -x || true; exit 1
      fi
      warn "$NAME: absent on Render; --allow-render-absent set, trusting 1Password value (sha256 ${H1P:0:12}...)"
    elif [ "$(sha "$VR")" = "$H1P" ]; then
      echo "STOP: $NAME in 1Password EQUALS Render's value - that is the OLD broad key, not the new" >&2
      echo "      least-priv IAM user. Refusing to seed the broad key. See scripts/gcp/iam/README.md." >&2
      unset V1P H1P VR; [ "${XWAS:-0}" -eq 1 ] && set -x || true; exit 1
    else
      echo "    $NAME: from 1Password, differs from Render's key OK (sha256 ${H1P:0:12}...)"
    fi
    [ "$MODE" = "seed" ] && { seed_one "$NAME" "$V1P" "$H1P" || { unset V1P H1P VR; [ "${XWAS:-0}" -eq 1 ] && set -x || true; exit 1; }; }
    unset V1P H1P VR
  done
fi

[ "${XWAS:-0}" -eq 1 ] && set -x || true

if [ "$MODE" = "seed" ]; then
  log "SEED complete. Selected app secrets are seeded in GCP Secret Manager ($PROJECT_ID)."
  gate "Verify the deploy references them (deploy-cloudrun.yml NON_BOOT_SECRETS) before enabling."
else
  log "VERIFY/${MODE^^} complete. Nothing written."
  gate "Re-run with CONFIRM_SEED_SECRETS=1 to seed GCP Secret Manager."
fi
