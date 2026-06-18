#!/usr/bin/env bash
#
# phase3-data-layer.sh - LingoLinq Render -> GCP Cloud Run migration, Phase 3 (Data layer).
#
# Provisions the production data layer in project lingolinq-prod so the inert
# deploy workflow (.github/workflows/deploy-cloudrun.yml) can later run against real
# data. Builds, in order:
#   - required APIs   (compute, servicenetworking, redis, sqladmin)
#   - a custom VPC + subnet           (Direct VPC egress source range)
#   - Private Service Access peering  (private reachability for Cloud SQL + Memorystore)
#   - Cloud SQL Postgres 18           (MONEY - private IP only, no public IP)
#   - app database + app DB user      (password -> Secret Manager, never echoed)
#   - roles/cloudsql.client on the runtime SA
#   - Memorystore Redis (Basic)       (MONEY - private service access)
#   - DATABASE_URL + REDIS_URL secret versions seeded into the 9 boot secrets
#   - GitHub repo variables the deploy workflow reads
#
# It does NOT migrate data (Phase 4: dump Render -> restore Cloud SQL, setval() sequences,
# preserve generateValue secrets) and does NOT activate the deploy workflow (still gated on
# GCP_PROJECT_ID being unset). See the handoff block at the end.
#
# NETWORK DESIGN (changed vs the Phase 1 handoff, verified 2026-06-15):
#   Use **Direct VPC egress**, NOT a Serverless VPC Access connector. Direct VPC egress is
#   GA and Google-recommended: ~2x throughput, no idle connector cost, and it is the path
#   that supports L4 ingress for worker pools (our Resque worker). It is configured on the
#   Cloud Run service/worker-pool at deploy time via --network/--subnet/--vpc-egress; this
#   script only provisions the VPC + subnet those flags point at.
#
# DB AUTH: password-over-socket. Cloud Run reaches Cloud SQL via the built-in proxy
#   (--set-cloudsql-instances + roles/cloudsql.client on the runtime SA), authenticated by
#   a DB password stored in Secret Manager. NOT IAM DB auth.
#
# Design rules (same contract as scripts/gcp/phase1-setup.sh):
#   - Idempotent: every create is guarded by a describe check, so re-runs are safe.
#   - Fail-closed gates: each spend step runs ONLY when its CONFIRM_* flag is 1.
#     A bare run prints the plan + a cost estimate and stops before spending a cent.
#   - Auditable: every command is commented with what it does and why (HIPAA evidence).
#   - Secret VALUES are never printed: they are piped straight into
#     `gcloud secrets versions add --data-file=-` and unset after use. CAVEAT: the DB
#     password is passed to `gcloud sql users create/set-password` as a --password= argv,
#     briefly visible via `ps`/`/proc` to a local user. Accepted as low risk on a
#     single-operator host (Scot's laptop); do NOT run this on a shared/multi-user box,
#     and do NOT run under `bash -x` (tracing would print the DB password + DSN; the
#     secret-handling blocks defensively disable xtrace, but the rest of the run would not).
#   - Re-run safety for the DB password: the SQL gate does NOT rotate an existing user's
#     password unless ROTATE_DB_PASSWORD=1. Rotating it would desync already-running Cloud
#     Run instances that hold the old DATABASE_URL until they redeploy.
#
# Usage:
#   ./scripts/gcp/phase3-data-layer.sh                         # plan + cost estimate, stop
#   CONFIRM_NET=1 ./scripts/gcp/phase3-data-layer.sh           # + APIs, VPC, subnet, PSA peering
#   CONFIRM_NET=1 CONFIRM_SQL=1 ./scripts/gcp/phase3-data-layer.sh   # + Cloud SQL (biggest cost)
#   CONFIRM_NET=1 CONFIRM_REDIS=1 ./scripts/gcp/phase3-data-layer.sh # + Memorystore Redis
#   ... CONFIRM_SQL=1 CONFIRM_REDIS=1 SET_GH_VARS=1 ...        # full run + write repo vars
#
# Optional overrides:
#   APP_DB_PASSWORD=...      # if unset, a strong password is generated (never printed)
#   ROTATE_DB_PASSWORD=1     # reset an EXISTING DB user's password (outage risk; redeploy after)
#   SQL_TIER=...             # default db-custom-1-3840 (1 vCPU / 3.75GB) - the main cost lever
#
set -euo pipefail

# ---------------------------------------------------------------------------------------
# CONFIG (override via env)
# ---------------------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-lingolinq-prod}"
REGION="${REGION:-us-central1}"
ORG_ID="${ORG_ID:-307791011610}"                       # lingolinq.com organization

RUNTIME_SA_ID="${RUNTIME_SA_ID:-lingolinq-run}"        # identity Cloud Run runs as (Phase 1)
RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

# Network
VPC_NAME="${VPC_NAME:-lingolinq-vpc}"
SUBNET_NAME="${SUBNET_NAME:-lingolinq-subnet}"
SUBNET_RANGE="${SUBNET_RANGE:-10.8.0.0/24}"            # Direct VPC egress consumes IPs here
PSA_RANGE_NAME="${PSA_RANGE_NAME:-google-managed-services-${VPC_NAME}}"
PSA_PREFIX_LEN="${PSA_PREFIX_LEN:-16}"                 # block reserved for Google-managed services

# Cloud SQL
SQL_INSTANCE="${SQL_INSTANCE:-lingolinq-prod-pg}"
SQL_DB_VERSION="${SQL_DB_VERSION:-POSTGRES_18}"        # matches Render prod (18.3, verified 2026-06-15)
SQL_EDITION="${SQL_EDITION:-enterprise}"
SQL_TIER="${SQL_TIER:-db-custom-1-3840}"              # 1 vCPU / 3.75 GB - the main cost lever
SQL_STORAGE_GB="${SQL_STORAGE_GB:-10}"                # Render prod DB is ~109 MB; auto-increase on
SQL_AVAILABILITY="${SQL_AVAILABILITY:-zonal}"         # zonal at launch; revisit HA before scale
APP_DB_NAME="${APP_DB_NAME:-lingolinq_production}"
APP_DB_USER="${APP_DB_USER:-lingolinq_app}"
SQL_BACKUP_START="${SQL_BACKUP_START:-08:00}"         # UTC; off-peak for US traffic

# Memorystore Redis
REDIS_INSTANCE="${REDIS_INSTANCE:-lingolinq-prod-redis}"
REDIS_SIZE_GB="${REDIS_SIZE_GB:-1}"
REDIS_VERSION="${REDIS_VERSION:-redis_7_2}"
REDIS_TIER="${REDIS_TIER:-basic}"                     # single node pre-MVP; HA = post-launch

# Secret Manager names (created EMPTY in Phase 1; we add VALUE versions here)
SECRET_DATABASE_URL="${SECRET_DATABASE_URL:-DATABASE_URL}"
SECRET_REDIS_URL="${SECRET_REDIS_URL:-REDIS_URL}"
SECRET_REDIS_CA_CERT="${SECRET_REDIS_CA_CERT:-REDIS_CA_CERT}"

# GitHub repo for repo-variable writes (needs `gh` CLI authed)
GH_REPO="${GH_REPO:-lingolinq/LingoLinq-AAC}"

# Gate flags (default 0 = do not run that gated step)
CONFIRM_NET="${CONFIRM_NET:-0}"
CONFIRM_SQL="${CONFIRM_SQL:-0}"
CONFIRM_REDIS="${CONFIRM_REDIS:-0}"
SET_GH_VARS="${SET_GH_VARS:-0}"
ROTATE_DB_PASSWORD="${ROTATE_DB_PASSWORD:-0}"         # 1 = reset an existing DB user's password

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[1;33m(skip)\033[0m %s\n' "$*"; }
gate() { printf '\n\033[1;31m[GATE]\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------------------
# 0. PREFLIGHT - confirm we are the right operator and Phase 1 really happened.
# ---------------------------------------------------------------------------------------
log "Preflight: gcloud auth, project, billing, runtime SA"
command -v gcloud  >/dev/null 2>&1 || { echo "ERROR: gcloud CLI not found." >&2; exit 1; }
# openssl is needed to generate the DB password when the SQL gate runs (Step 2b).
command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl not found (needed to generate the DB password)." >&2; exit 1; }
ACTIVE_ACCT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
[ -n "$ACTIVE_ACCT" ] || { echo "ERROR: no active gcloud account. Run: gcloud auth login && gcloud auth application-default login" >&2; exit 1; }
echo "    Active account: $ACTIVE_ACCT"

# Project must already exist (Phase 1). We never create it here.
gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 \
  || { echo "ERROR: project $PROJECT_ID not found. Run Phase 1 (phase1-setup.sh) first." >&2; exit 1; }
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[ -n "$PROJECT_NUMBER" ] || { echo "ERROR: could not resolve project number for $PROJECT_ID" >&2; exit 1; }
echo "    Project: $PROJECT_ID (#$PROJECT_NUMBER), region $REGION"

# Billing must be live (Phase 1 money gate). Everything below costs money.
set +e
BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null)"
BILLING_RC=$?
set -e
[ "$BILLING_RC" -eq 0 ] || { echo "ERROR: cannot read billing for $PROJECT_ID (auth/permission?)." >&2; exit 1; }
[ "$BILLING_ENABLED" = "True" ] || { echo "ERROR: billing not enabled on $PROJECT_ID. Complete Phase 1 first." >&2; exit 1; }

# Runtime SA must exist (Phase 1). We grant it roles/cloudsql.client below.
gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT_ID" >/dev/null 2>&1 \
  || { echo "ERROR: runtime SA $RUNTIME_SA not found. Run Phase 1 first." >&2; exit 1; }
echo "    Runtime SA present: $RUNTIME_SA"

# ---------------------------------------------------------------------------------------
# 0b. PLAN + COST ESTIMATE. Printed every run so the operator sees the spend before gating.
# ---------------------------------------------------------------------------------------
cat <<PLAN

  PHASE 3 PLAN for $PROJECT_ID (region $REGION)
  -------------------------------------------------------------------
  [NET]   VPC $VPC_NAME + subnet $SUBNET_NAME ($SUBNET_RANGE) + PSA peering
  [SQL]   Cloud SQL $SQL_INSTANCE  $SQL_DB_VERSION  $SQL_EDITION  $SQL_TIER
          private IP only, ${SQL_STORAGE_GB}GB SSD (auto-increase), $SQL_AVAILABILITY, PITR on
  [REDIS] Memorystore $REDIS_INSTANCE  $REDIS_TIER  ${REDIS_SIZE_GB}GB  $REDIS_VERSION

  ROUGH cost estimate (VERIFY against current GCP pricing before approving):
    Cloud SQL $SQL_TIER zonal + 10GB ....... ~\$50-75 / mo
    Memorystore $REDIS_TIER ${REDIS_SIZE_GB}GB ............. ~\$35 / mo
    Direct VPC egress (no connector) ....... \$0 idle, network egress only
    -------------------------------------------------------------------
    Estimated steady-state ................. ~\$90-130 / mo
  -------------------------------------------------------------------
PLAN

# ---------------------------------------------------------------------------------------
# 1. [NET GATE] APIs + VPC + subnet + Private Service Access peering.
#    First billable-ish step. Memorystore + Cloud SQL private IP both ride on this.
# ---------------------------------------------------------------------------------------
if [ "$CONFIRM_NET" != "1" ]; then
  gate "Step 1 (network) SKIPPED. Re-run with CONFIRM_NET=1 once Scot approves. Stopping."
  exit 0
fi

log "Step 1a: enable data-layer APIs"
# compute = VPC; servicenetworking = PSA peering; redis = Memorystore; sqladmin = Cloud SQL.
gcloud services enable \
  compute.googleapis.com \
  servicenetworking.googleapis.com \
  redis.googleapis.com \
  sqladmin.googleapis.com \
  --project="$PROJECT_ID"

log "Step 1b: custom-mode VPC + subnet (Direct VPC egress source range)"
if gcloud compute networks describe "$VPC_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "VPC $VPC_NAME already exists"
else
  gcloud compute networks create "$VPC_NAME" \
    --project="$PROJECT_ID" \
    --subnet-mode=custom \
    --bgp-routing-mode=regional
fi
if gcloud compute networks subnets describe "$SUBNET_NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "subnet $SUBNET_NAME already exists"
else
  # Private Google Access lets Cloud Run instances reach Google APIs without public IPs.
  gcloud compute networks subnets create "$SUBNET_NAME" \
    --project="$PROJECT_ID" \
    --network="$VPC_NAME" \
    --region="$REGION" \
    --range="$SUBNET_RANGE" \
    --enable-private-ip-google-access
fi

log "Step 1c: Private Service Access (peering range + connection)"
# Reserve an internal range Google uses for the managed Cloud SQL + Memorystore endpoints.
if gcloud compute addresses describe "$PSA_RANGE_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  skip "PSA range $PSA_RANGE_NAME already reserved"
else
  gcloud compute addresses create "$PSA_RANGE_NAME" \
    --project="$PROJECT_ID" \
    --global \
    --purpose=VPC_PEERING \
    --prefix-length="$PSA_PREFIX_LEN" \
    --network="$VPC_NAME"
fi
# Establish (or update) the peering to servicenetworking. Idempotent: connect is a no-op if present.
if gcloud services vpc-peerings list --network="$VPC_NAME" --project="$PROJECT_ID" \
     --format='value(reservedPeeringRanges)' 2>/dev/null | grep -qw "$PSA_RANGE_NAME"; then
  skip "VPC peering for $PSA_RANGE_NAME already connected"
else
  gcloud services vpc-peerings connect \
    --project="$PROJECT_ID" \
    --service=servicenetworking.googleapis.com \
    --ranges="$PSA_RANGE_NAME" \
    --network="$VPC_NAME"
fi

# ---------------------------------------------------------------------------------------
# 2. [SQL GATE] Cloud SQL Postgres 18, private IP only. The single biggest recurring cost.
# ---------------------------------------------------------------------------------------
if [ "$CONFIRM_SQL" = "1" ]; then
  log "Step 2a: Cloud SQL instance $SQL_INSTANCE ($SQL_DB_VERSION, private IP)"
  if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    skip "Cloud SQL instance $SQL_INSTANCE already exists"
  else
    # --no-assign-ip + --network = private IP only (HIPAA: no public surface).
    # Requires the PSA peering from Step 1c to already exist.
    gcloud sql instances create "$SQL_INSTANCE" \
      --project="$PROJECT_ID" \
      --database-version="$SQL_DB_VERSION" \
      --edition="$SQL_EDITION" \
      --tier="$SQL_TIER" \
      --region="$REGION" \
      --availability-type="$SQL_AVAILABILITY" \
      --storage-type=SSD \
      --storage-size="$SQL_STORAGE_GB" \
      --storage-auto-increase \
      --network="projects/${PROJECT_ID}/global/networks/${VPC_NAME}" \
      --no-assign-ip \
      --backup \
      --backup-start-time="$SQL_BACKUP_START" \
      --enable-point-in-time-recovery
  fi

  CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')"
  [ -n "$CONNECTION_NAME" ] || { echo "ERROR: could not read connectionName for $SQL_INSTANCE" >&2; exit 1; }
  echo "    Connection name: $CONNECTION_NAME"

  log "Step 2b: app database + app DB user"
  if gcloud sql databases describe "$APP_DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    skip "database $APP_DB_NAME already exists"
  else
    gcloud sql databases create "$APP_DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"
  fi

  # Does the app DB user already exist? Capture rc explicitly: a transient gcloud failure
  # (auth blip / throttle) must ABORT, not be misread as "not found" and fall through to a
  # create/rotate. (mirror the billing-probe pattern above)
  set +e
  EXISTING_USERS="$(gcloud sql users list --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(name)' 2>/dev/null)"
  USERS_RC=$?
  set -e
  [ "$USERS_RC" -eq 0 ] || { echo "ERROR: could not list Cloud SQL users (auth/permission?). Not creating/rotating." >&2; exit 1; }
  USER_EXISTS=0
  printf '%s\n' "$EXISTING_USERS" | grep -qx "$APP_DB_USER" && USER_EXISTS=1

  # The block below handles a cleartext password. Disable xtrace defensively (so `bash -x`
  # can't leak it) and restore the prior setting after Step 2d.
  case "$-" in *x*) XTRACE_WAS_ON=1 ;; *) XTRACE_WAS_ON=0 ;; esac
  set +x

  SEED_DB_SECRET=0
  if [ "$USER_EXISTS" -eq 1 ] && [ "$ROTATE_DB_PASSWORD" != "1" ]; then
    # Re-run, user already provisioned: do NOT touch the password or the DATABASE_URL secret.
    # Rotating it would desync already-running Cloud Run instances holding the old value until
    # they redeploy. Pass ROTATE_DB_PASSWORD=1 to force a rotation (then redeploy web+worker).
    skip "DB user $APP_DB_USER exists; leaving password + $SECRET_DATABASE_URL unchanged (ROTATE_DB_PASSWORD=1 to rotate)"
  else
    # First provisioning, or an explicit rotation. Generate a strong password unless supplied.
    APP_DB_PASSWORD="${APP_DB_PASSWORD:-$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)}"
    if [ "$USER_EXISTS" -eq 1 ]; then
      gcloud sql users set-password "$APP_DB_USER" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --password="$APP_DB_PASSWORD" >/dev/null
      log "ROTATED password for existing DB user $APP_DB_USER -- redeploy web + worker so they pick up the new DATABASE_URL"
    else
      gcloud sql users create "$APP_DB_USER" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --password="$APP_DB_PASSWORD" >/dev/null
    fi
    SEED_DB_SECRET=1
  fi

  log "Step 2c: grant roles/cloudsql.client to the runtime SA"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/cloudsql.client --condition=None --quiet >/dev/null

  if [ "$SEED_DB_SECRET" -eq 1 ]; then
    log "Step 2d: seed $SECRET_DATABASE_URL secret (socket DSN for the built-in proxy)"
    # config/database.yml production reads `url: ENV['DATABASE_URL']`. The socket DSN
    #   postgres://USER:PASS@/DB?host=/cloudsql/CONN
    # is Google's documented Rails-on-Cloud-Run form: Rails' UrlConfig passes the `host`
    # query param through to the pg adapter, and libpq ignores sslmode for Unix-socket
    # connections (so the production stanza's `sslmode: require` is a no-op over the socket).
    # Reject an operator-supplied password containing URL-reserved chars so the DSN cannot be
    # silently corrupted (the generated password already excludes / + =).
    case "$APP_DB_PASSWORD" in
      *[/+=@:?\#\&]*) echo "ERROR: APP_DB_PASSWORD contains a URL-reserved char; use one without / + = @ : ? # &" >&2; exit 1 ;;
    esac
    DB_URL="postgres://${APP_DB_USER}:${APP_DB_PASSWORD}@/${APP_DB_NAME}?host=/cloudsql/${CONNECTION_NAME}"
    gcloud secrets describe "$SECRET_DATABASE_URL" --project="$PROJECT_ID" >/dev/null 2>&1 \
      || { echo "ERROR: secret $SECRET_DATABASE_URL not found; it should have been created EMPTY in Phase 1." >&2; exit 1; }
    printf '%s' "$DB_URL" | gcloud secrets versions add "$SECRET_DATABASE_URL" --project="$PROJECT_ID" --data-file=- >/dev/null
    echo "    new version added to secret $SECRET_DATABASE_URL (value not shown)"
    unset DB_URL
  fi
  unset APP_DB_PASSWORD
  # Restore xtrace if the operator had it on.
  [ "${XTRACE_WAS_ON:-0}" -eq 1 ] && set -x || true
else
  gate "Step 2 (Cloud SQL) SKIPPED. Re-run with CONFIRM_SQL=1 to provision the database."
fi

# ---------------------------------------------------------------------------------------
# 3. [REDIS GATE] Memorystore Redis (Basic), reached over Private Service Access.
# ---------------------------------------------------------------------------------------
if [ "$CONFIRM_REDIS" = "1" ]; then
  log "Step 3a: Memorystore Redis $REDIS_INSTANCE ($REDIS_TIER, ${REDIS_SIZE_GB}GB)"
  if gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    skip "Redis instance $REDIS_INSTANCE already exists"
  else
    # connect-mode PRIVATE_SERVICE_ACCESS reuses the Step 1c peering (no separate range).
    # --enable-auth + SERVER_AUTHENTICATION in-transit encryption = HIPAA posture (Scot's
    # call). PREREQUISITE before this secret is consumed: the app's Redis client must speak
    # TLS for the rediss:// URL (see the handoff block + config/initializers/resque.rb).
    # NOTE: the AUTH flag is --enable-auth (gcloud >= 400-ish), NOT --auth-enabled.
    gcloud redis instances create "$REDIS_INSTANCE" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --tier="$REDIS_TIER" \
      --size="$REDIS_SIZE_GB" \
      --redis-version="$REDIS_VERSION" \
      --network="projects/${PROJECT_ID}/global/networks/${VPC_NAME}" \
      --connect-mode=PRIVATE_SERVICE_ACCESS \
      --enable-auth \
      --transit-encryption-mode=SERVER_AUTHENTICATION
  fi

  REDIS_HOST="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT_ID" --format='value(host)')"
  REDIS_PORT="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT_ID" --format='value(port)')"
  [ -n "$REDIS_HOST" ] || { echo "ERROR: could not read Redis host for $REDIS_INSTANCE" >&2; exit 1; }
  echo "    Redis private endpoint: ${REDIS_HOST}:${REDIS_PORT} (AUTH + TLS enabled)"

  log "Step 3b: seed $SECRET_REDIS_URL secret (AUTH + TLS)"
  # rediss:// signals TLS to the app's Redis client; the AUTH string is the password.
  # Disable xtrace defensively so the AUTH string cannot leak under `bash -x`.
  case "$-" in *x*) RXTRACE_WAS_ON=1 ;; *) RXTRACE_WAS_ON=0 ;; esac
  set +x
  REDIS_AUTH="$(gcloud redis instances get-auth-string "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT_ID" --format='value(authString)' 2>/dev/null)"
  [ -n "$REDIS_AUTH" ] || { echo "ERROR: could not read Redis AUTH string for $REDIS_INSTANCE" >&2; exit 1; }
  # Reject an AUTH string containing URL-reserved chars so the rediss:// DSN cannot be
  # silently corrupted (mirrors the DB-password guard in Step 2d). Memorystore AUTH strings
  # are UUID-format today, but that is not a documented guarantee, and a corrupt REDIS_URL
  # would sit in Secret Manager and only fail later at cutover -- abort loudly here instead.
  case "$REDIS_AUTH" in
    *[/+=@:?\#\&]*) echo "ERROR: Redis AUTH string contains a URL-reserved char; cannot build a safe rediss:// DSN." >&2; exit 1 ;;
  esac
  REDIS_URL_VAL="rediss://:${REDIS_AUTH}@${REDIS_HOST}:${REDIS_PORT}/0"
  gcloud secrets describe "$SECRET_REDIS_URL" --project="$PROJECT_ID" >/dev/null 2>&1 \
    || { echo "ERROR: secret $SECRET_REDIS_URL not found; it should have been created EMPTY in Phase 1." >&2; exit 1; }
  printf '%s' "$REDIS_URL_VAL" | gcloud secrets versions add "$SECRET_REDIS_URL" --project="$PROJECT_ID" --data-file=- >/dev/null
  echo "    new version added to secret $SECRET_REDIS_URL (value not shown)"
  unset REDIS_AUTH REDIS_URL_VAL
  [ "${RXTRACE_WAS_ON:-0}" -eq 1 ] && set -x || true

  log "Step 3c: store Memorystore server CA in Secret Manager ($SECRET_REDIS_CA_CERT)"
  # The app's Redis client verifies the rediss:// chain against this per-instance CA
  # (config/initializers/resque.rb reads it from REDIS_CA_CERT, and connects with
  # hostname verification off since Memorystore is reached by private IP). Unlike the
  # Phase 1 secrets this one is NOT pre-created, so create it + grant the runtime SA
  # read access here. A server CA is a public certificate (not a key), so no xtrace
  # discipline is needed. serverCaCerts may carry more than one entry during a CA
  # rotation; ship them all so the client trust store survives the overlap.
  REDIS_CA="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT_ID" --format='value(serverCaCerts[].cert)')"
  case "$REDIS_CA" in
    *"BEGIN CERTIFICATE"*) : ;;
    *) echo "ERROR: could not read a PEM server CA for $REDIS_INSTANCE." >&2; exit 1 ;;
  esac
  if gcloud secrets describe "$SECRET_REDIS_CA_CERT" --project="$PROJECT_ID" >/dev/null 2>&1; then
    skip "secret $SECRET_REDIS_CA_CERT already exists"
  else
    # Match the Phase 1 secrets' replication (user-managed, pinned to $REGION).
    gcloud secrets create "$SECRET_REDIS_CA_CERT" --project="$PROJECT_ID" \
      --replication-policy=user-managed --locations="$REGION" >/dev/null
    echo "    created secret $SECRET_REDIS_CA_CERT (user-managed, $REGION)"
  fi
  # Per-secret accessor grant for the runtime SA (mirrors the Phase 1 secret model).
  gcloud secrets add-iam-policy-binding "$SECRET_REDIS_CA_CERT" --project="$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
  # Only add a version when the CA actually changed, so re-runs do not churn
  # versions (the CA is stable for the life of the instance, modulo rotation).
  CURRENT_CA="$(gcloud secrets versions access latest --secret="$SECRET_REDIS_CA_CERT" --project="$PROJECT_ID" 2>/dev/null || true)"
  if [ "$CURRENT_CA" = "$REDIS_CA" ]; then
    skip "secret $SECRET_REDIS_CA_CERT already holds the current CA"
  else
    printf '%s' "$REDIS_CA" | gcloud secrets versions add "$SECRET_REDIS_CA_CERT" --project="$PROJECT_ID" --data-file=- >/dev/null
    echo "    new version added to secret $SECRET_REDIS_CA_CERT"
  fi
  unset REDIS_CA CURRENT_CA
else
  gate "Step 3 (Memorystore) SKIPPED. Re-run with CONFIRM_REDIS=1 to provision Redis."
fi

# ---------------------------------------------------------------------------------------
# 4. [REPO VARS] Write the GitHub repo variables the deploy workflow reads. Needs `gh`.
#    GCP_PROJECT_ID is STILL deliberately left unset - that is what keeps the deploy
#    workflow inert until cutover (Phase 4).
# ---------------------------------------------------------------------------------------
if [ "$SET_GH_VARS" = "1" ]; then
  log "Step 4: GitHub repo variables (deploy-cloudrun.yml inputs)"
  command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI not found; cannot set repo vars." >&2; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "ERROR: gh CLI is not authenticated (run: gh auth login)." >&2; exit 1; }
  # Only write a repo var once its resource actually exists -- otherwise the (later
  # un-inerted) deploy workflow would point at a VPC/instance that was never created.
  if gcloud compute networks subnets describe "$SUBNET_NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gh variable set GCP_VPC_NETWORK --repo "$GH_REPO" --body "$VPC_NAME"
    gh variable set GCP_VPC_SUBNET  --repo "$GH_REPO" --body "$SUBNET_NAME"
    echo "    set GCP_VPC_NETWORK=$VPC_NAME, GCP_VPC_SUBNET=$SUBNET_NAME"
  else
    skip "VPC/subnet not provisioned yet; GCP_VPC_NETWORK/SUBNET not set (run CONFIRM_NET=1 first)"
  fi
  if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    CONN="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')"
    gh variable set GCP_CLOUDSQL_INSTANCE --repo "$GH_REPO" --body "$CONN"
    echo "    set GCP_CLOUDSQL_INSTANCE=$CONN"
  else
    skip "Cloud SQL not provisioned yet; GCP_CLOUDSQL_INSTANCE not set"
  fi
else
  gate "Step 4 (repo vars) SKIPPED. Re-run with SET_GH_VARS=1 to write GCP_VPC_*/CLOUDSQL vars."
fi

# ---------------------------------------------------------------------------------------
# DONE - summary + handoff
# ---------------------------------------------------------------------------------------
cat <<EOF

============================================================================
PHASE 3 DATA LAYER step complete for ${PROJECT_ID} (project #${PROJECT_NUMBER})
============================================================================
VPC / subnet:      ${VPC_NAME} / ${SUBNET_NAME} (${SUBNET_RANGE})
Cloud SQL:         ${SQL_INSTANCE} (${SQL_DB_VERSION}, private IP) [CONFIRM_SQL=${CONFIRM_SQL}]
Memorystore:       ${REDIS_INSTANCE} (${REDIS_TIER}, ${REDIS_SIZE_GB}GB)      [CONFIRM_REDIS=${CONFIRM_REDIS}]
Runtime SA grant:  roles/cloudsql.client on ${RUNTIME_SA}
Secrets seeded:    ${SECRET_DATABASE_URL}, ${SECRET_REDIS_URL} (only when their gate ran)

PHASE 3 -> deploy-workflow edits (DONE on this branch, still INERT):
  - deploy-cloudrun.yml already passes Direct VPC egress + Cloud SQL on all three deploy
    commands (web, worker pool, migration Job) and the runtime SA (--service-account).

App-code Redis-over-TLS support is DONE (config/initializers/resque.rb routes all five
Redis.new sites through RedisInit.redis_options: redis:// stays byte-identical for Render,
rediss:// enables :ssl + verifies the Memorystore CA). This script now also seeds that CA
(Step 3c -> REDIS_CA_CERT secret) and the deploy workflow mounts it + sets
REDIS_TLS_VERIFY_HOSTNAME=false (Memorystore is reached by private IP, so hostname matching
is off while CA-chain verification stays on). STILL live-only: the actual TLS handshake is
not exercisable until a Cloud Run service inside the VPC connects to the private endpoint;
confirm it during the Phase 4 dress rehearsal before cutover.

PHASE 4 (separate branch, the cutover - NOT this script):
  - pg_dump Render prod -> restore into ${APP_DB_NAME} on ${SQL_INSTANCE}.
  - Run setval() on every sequence after restore (global_id uses raw PKs).
  - Seed the remaining 7 boot secrets from the 1Password Prod vault, and PRESERVE the
    generateValue secrets (SECRET_KEY_BASE, COOKIE_KEY, SECURE_*) from the LIVE Render env
    so existing sessions/cookies/encrypted columns keep working.
  - Only then set GCP_PROJECT_ID (repo var) to un-inert the deploy workflow.

HIPAA hardening to apply around cutover:
  - Enable Data Access audit logs on Cloud SQL + Secret Manager (evidence).
  - Consider Cloud SQL HA (--availability-type=regional) and Redis Standard tier post-launch.

VERIFY BEFORE APPROVING THE SQL GATE: that ${SQL_DB_VERSION} is offered in ${REGION} and
that ${SQL_TIER} pricing is still current (gcloud sql tiers list / GCP pricing page).
EOF
