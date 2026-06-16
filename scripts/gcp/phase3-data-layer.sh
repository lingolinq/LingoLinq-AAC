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
#   - Secrets are never echoed: passwords are generated/read and piped straight into
#     `gcloud secrets versions add --data-file=-`.
#
# Usage:
#   ./scripts/gcp/phase3-data-layer.sh                         # plan + cost estimate, stop
#   CONFIRM_NET=1 ./scripts/gcp/phase3-data-layer.sh           # + APIs, VPC, subnet, PSA peering
#   CONFIRM_NET=1 CONFIRM_SQL=1 ./scripts/gcp/phase3-data-layer.sh   # + Cloud SQL (biggest cost)
#   CONFIRM_NET=1 CONFIRM_REDIS=1 ./scripts/gcp/phase3-data-layer.sh # + Memorystore Redis
#   ... CONFIRM_SQL=1 CONFIRM_REDIS=1 SET_GH_VARS=1 ...        # full run + write repo vars
#
# Optional overrides:
#   APP_DB_PASSWORD=...   # if unset, a strong password is generated (never printed)
#   SQL_TIER=...          # default db-custom-1-3840 (1 vCPU / 3.75GB) - the main cost lever
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

# GitHub repo for repo-variable writes (needs `gh` CLI authed)
GH_REPO="${GH_REPO:-lingolinq/LingoLinq-AAC}"

# Gate flags (default 0 = do not run that gated step)
CONFIRM_NET="${CONFIRM_NET:-0}"
CONFIRM_SQL="${CONFIRM_SQL:-0}"
CONFIRM_REDIS="${CONFIRM_REDIS:-0}"
SET_GH_VARS="${SET_GH_VARS:-0}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[1;33m(skip)\033[0m %s\n' "$*"; }
gate() { printf '\n\033[1;31m[GATE]\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------------------
# 0. PREFLIGHT - confirm we are the right operator and Phase 1 really happened.
# ---------------------------------------------------------------------------------------
log "Preflight: gcloud auth, project, billing, runtime SA"
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

  log "Step 2b: app database + app DB user (password -> Secret Manager, never echoed)"
  if gcloud sql databases describe "$APP_DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    skip "database $APP_DB_NAME already exists"
  else
    gcloud sql databases create "$APP_DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"
  fi
  # Generate a strong password unless one was supplied. NEVER printed to stdout/logs.
  APP_DB_PASSWORD="${APP_DB_PASSWORD:-$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)}"
  if gcloud sql users list --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(name)' | grep -qw "$APP_DB_USER"; then
    # Reset the password so the secret we store below is authoritative (idempotent re-run).
    gcloud sql users set-password "$APP_DB_USER" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --password="$APP_DB_PASSWORD" >/dev/null
    skip "DB user $APP_DB_USER existed; password reset to the value stored in Secret Manager"
  else
    gcloud sql users create "$APP_DB_USER" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --password="$APP_DB_PASSWORD" >/dev/null
  fi

  log "Step 2c: grant roles/cloudsql.client to the runtime SA"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/cloudsql.client --condition=None --quiet >/dev/null

  log "Step 2d: seed $SECRET_DATABASE_URL secret (socket form for the built-in proxy)"
  # Rails/pg socket DSN: the built-in Cloud Run proxy exposes the instance at /cloudsql/<conn>.
  # url-encode is unnecessary because the generated password excludes / + = reserved chars.
  DB_URL="postgres://${APP_DB_USER}:${APP_DB_PASSWORD}@/${APP_DB_NAME}?host=/cloudsql/${CONNECTION_NAME}"
  if gcloud secrets describe "$SECRET_DATABASE_URL" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$DB_URL" | gcloud secrets versions add "$SECRET_DATABASE_URL" --project="$PROJECT_ID" --data-file=- >/dev/null
    echo "    new version added to secret $SECRET_DATABASE_URL (value not shown)"
  else
    echo "ERROR: secret $SECRET_DATABASE_URL not found. It should have been created EMPTY in Phase 1." >&2
    exit 1
  fi
  unset APP_DB_PASSWORD DB_URL
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
    gcloud redis instances create "$REDIS_INSTANCE" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --tier="$REDIS_TIER" \
      --size="$REDIS_SIZE_GB" \
      --redis-version="$REDIS_VERSION" \
      --network="projects/${PROJECT_ID}/global/networks/${VPC_NAME}" \
      --connect-mode=PRIVATE_SERVICE_ACCESS
  fi

  REDIS_HOST="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT_ID" --format='value(host)')"
  REDIS_PORT="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --project="$PROJECT_ID" --format='value(port)')"
  [ -n "$REDIS_HOST" ] || { echo "ERROR: could not read Redis host for $REDIS_INSTANCE" >&2; exit 1; }
  echo "    Redis private endpoint: ${REDIS_HOST}:${REDIS_PORT}"

  log "Step 3b: seed $SECRET_REDIS_URL secret"
  # Basic tier on a private network, no AUTH string. (Harden with --enable-auth later if needed.)
  REDIS_URL_VAL="redis://${REDIS_HOST}:${REDIS_PORT}/0"
  if gcloud secrets describe "$SECRET_REDIS_URL" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$REDIS_URL_VAL" | gcloud secrets versions add "$SECRET_REDIS_URL" --project="$PROJECT_ID" --data-file=- >/dev/null
    echo "    new version added to secret $SECRET_REDIS_URL (value not shown)"
  else
    echo "ERROR: secret $SECRET_REDIS_URL not found. It should have been created EMPTY in Phase 1." >&2
    exit 1
  fi
  unset REDIS_URL_VAL
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
  gh variable set GCP_VPC_NETWORK --repo "$GH_REPO" --body "$VPC_NAME"
  gh variable set GCP_VPC_SUBNET  --repo "$GH_REPO" --body "$SUBNET_NAME"
  if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    CONN="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')"
    gh variable set GCP_CLOUDSQL_INSTANCE --repo "$GH_REPO" --body "$CONN"
    echo "    set GCP_CLOUDSQL_INSTANCE=$CONN"
  else
    skip "Cloud SQL not provisioned yet; GCP_CLOUDSQL_INSTANCE not set"
  fi
  echo "    set GCP_VPC_NETWORK=$VPC_NAME, GCP_VPC_SUBNET=$SUBNET_NAME"
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

PHASE 3 -> deploy-workflow edits (do these on this branch, still INERT):
  - deploy-cloudrun.yml: add Direct VPC egress + Cloud SQL to ALL THREE deploy commands:
      run deploy lingolinq-web / beta run worker-pools deploy / run jobs deploy
        --network=${VPC_NAME} --subnet=${SUBNET_NAME} --vpc-egress=private-ranges-only \\
        --set-cloudsql-instances=<GCP_CLOUDSQL_INSTANCE>
  - Confirm the runtime SA (--service-account, review #353 H1) is still passed on all three.

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
