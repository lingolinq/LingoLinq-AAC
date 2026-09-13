#!/usr/bin/env bash
# Read-only Cloud Run Job: rake lingolinq:dedupe_shared_utility_boards
# against the shared nonprod Cloud SQL (staging + dev).
#
# Copies image / Cloud SQL / VPC / secrets / runtime SA from a live web
# service. Never updates lingolinq-migrate-*. Never sets APPLY.
#
#   ./scripts/gcp/dedupe-utility-boards-dryrun.sh --web lingolinq-web-dev
#   ./scripts/gcp/dedupe-utility-boards-dryrun.sh --web lingolinq-web-staging
#
set -euo pipefail

PROJECT="${PROJECT:-lingolinq-nonprod}"
REGION="${REGION:-us-central1}"
JOB="${JOB:-lingolinq-utility-dedupe-dryrun}"
WEB=""
TMPDIR_JOB="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_JOB"' EXIT

usage() {
  echo "Usage: $0 --web lingolinq-web-dev|lingolinq-web-staging" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web) WEB="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

[[ "$WEB" == "lingolinq-web-dev" || "$WEB" == "lingolinq-web-staging" ]] || usage

if [[ "$PROJECT" == "lingolinq-prod" ]]; then
  echo "Refusing: this script is nonprod-only (PROJECT=$PROJECT)." >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not installed. Run this on a machine authenticated to $PROJECT." >&2
  exit 1
fi

active_project="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$active_project" == "lingolinq-prod" ]]; then
  echo "Refusing: gcloud project is lingolinq-prod." >&2
  exit 1
fi

echo "Describing $WEB in $PROJECT/$REGION..."
gcloud run services describe "$WEB" \
  --project "$PROJECT" --region "$REGION" --format=json \
  > "$TMPDIR_JOB/service.json"

python3 - "$TMPDIR_JOB/service.json" "$TMPDIR_JOB/flags.env" <<'PY'
import json, sys
svc = json.load(open(sys.argv[1]))
out_path = sys.argv[2]
tpl = svc["spec"]["template"]["spec"]
container = tpl["containers"][0]
ann = svc["spec"]["template"].get("metadata", {}).get("annotations", {})
cloudsql = ann.get("run.googleapis.com/cloudsql-instances") or ""
sa = tpl.get("serviceAccountName") or ""
image = container["image"]
if not cloudsql:
    raise SystemExit("web service has no Cloud SQL annotation; aborting")
if not sa:
    raise SystemExit("web service has no runtime service account; aborting")
if cloudsql.split(":")[0] == "lingolinq-prod":
    raise SystemExit("refusing Cloud SQL instance in lingolinq-prod")
secrets = []
for env in container.get("env") or []:
    src = (env.get("valueFrom") or {}).get("secretKeyRef")
    if src:
        secrets.append("%s=%s:%s" % (env["name"], src["name"], src.get("key") or "latest"))
vpc = ann.get("run.googleapis.com/network-interfaces") or ""
network = subnet = ""
if vpc:
    data = json.loads(vpc) if isinstance(vpc, str) else vpc
    if data:
        network = data[0].get("network") or ""
        subnet = data[0].get("subnetwork") or ""
lines = [
    "IMAGE=%s" % image,
    "CLOUDSQL=%s" % cloudsql,
    "RUNTIME_SA=%s" % sa,
    "SECRET_FLAGS=%s" % ",".join(secrets),
    "VPC_NETWORK=%s" % network,
    "VPC_SUBNET=%s" % subnet,
]
open(out_path, "w").write("\n".join(lines) + "\n")
print("image=%s" % image)
print("cloudsql=%s" % cloudsql)
print("sa=%s" % sa)
print("secrets=%d" % len(secrets))
if network:
    print("vpc=%s / %s" % (network, subnet))
PY

# shellcheck disable=SC1091
source "$TMPDIR_JOB/flags.env"

deploy_args=(
  --project "$PROJECT"
  --region "$REGION"
  --image "$IMAGE"
  --service-account "$RUNTIME_SA"
  --execution-environment gen2
  --set-cloudsql-instances "$CLOUDSQL"
  --command bundle
  --args "exec,rake,lingolinq:dedupe_shared_utility_boards"
  --max-retries 0
  --task-timeout 1800s
  --memory 2Gi
  --cpu 1
  --set-env-vars "RACK_ENV=production,RAILS_ENV=production,REDIS_TLS_VERIFY_HOSTNAME=false"
)

if [[ -n "${SECRET_FLAGS:-}" ]]; then
  deploy_args+=(--set-secrets "$SECRET_FLAGS")
fi

if [[ -n "${VPC_NETWORK:-}" && -n "${VPC_SUBNET:-}" ]]; then
  deploy_args+=(--network "$VPC_NETWORK" --subnet "$VPC_SUBNET" --vpc-egress private-ranges-only)
fi

echo "Deploying job $JOB (create-or-update). Command is the dry-run rake only."
gcloud run jobs deploy "$JOB" "${deploy_args[@]}"

echo "Executing $JOB (starts immediately). APPLY is not set."
gcloud run jobs execute "$JOB" --project "$PROJECT" --region "$REGION" --wait

echo "Done. Pull logs with:"
echo "  gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=$JOB' --project $PROJECT --limit 200 --format='value(textPayload)'"
