#!/usr/bin/env bash
#
# prod-scheduler-liveness-alert.sh - missed-run (liveness) detection for the
# production scheduler. It is the control that closed finding LL-3e36a18199 (2026-09-18).
#
# WHY THIS EXISTS
#   Production alerting had three policies and none of them could see this failure.
#   "PROD Cloud Run job execution FAILED" counts executions whose result is `failed`.
#   A run that never happens produces no execution at all, so there is nothing to
#   count and nothing fires. That is not hypothetical here: when the Render cron was
#   suspended at the 2026-07-22 GCP cutover and nothing replaced it, dispatch did not
#   run for 43 days (2026-07-21 to 2026-09-02) and no alert fired, while all retention,
#   purge, flush and expiry work silently stopped.
#
#   A trigger now exists (Cloud Scheduler `lingolinq-scheduler-hourly`, ENABLED,
#   `0 * * * *`, hourly since 2026-09-02). This adds the detector for its absence.
#
# WHY 90 MINUTES
#   The job runs hourly, so a healthy series has a data point every ~60 minutes.
#   90 minutes is the smallest window that cannot be produced by normal jitter or a
#   single slow execution, and it still catches a stopped scheduler within two slots.
#   It is deliberately NOT 24h: the 06:00 UTC daily block carries the retention and
#   deletion work, so a gap that spans 06:00 must be visible the same morning.
#
# WHY METRIC ABSENCE AND NOT A LOG-BASED METRIC
#   `run.googleapis.com/job/completed_execution_count` is emitted by Cloud Run itself,
#   so it does not depend on the application booting, on the rake task reaching its
#   final `puts`, or on log ingestion. The failure mode being detected is "the job did
#   not run", and this metric is the closest observable to that statement.
#
# USAGE
#   scripts/gcp/prod-scheduler-liveness-alert.sh --check   # read-only; exit 1 if missing/disabled
#   scripts/gcp/prod-scheduler-liveness-alert.sh --apply   # create or update the policy
#
#   --apply WRITES TO PRODUCTION monitoring config. It is idempotent: it matches the
#   existing policy by displayName and updates it rather than creating a duplicate.
#
# WHAT THIS DOES NOT PROVE
#   --apply and --check prove the policy exists, is enabled and has a channel. They do
#   not prove that a notification is DELIVERED. Delivery through this channel was proven
#   on 2026-09-18: a temporary policy on the same channel was made to fire on the healthy
#   state, the email arrived, and the temporary policy was deleted. The Cloud Monitoring
#   API has no "send test notification" method, so re-prove delivery the same way whenever
#   the channel changes. The absence condition itself has not been fired, because inducing
#   a real 90-minute production outage to test it is not acceptable.
set -euo pipefail

PROJECT="lingolinq-prod"
POLICY_NAME="PROD scheduler dispatch MISSED RUN (no execution in 90m)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="$HERE/prod-scheduler-liveness-alert.json"

usage() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"; }

find_policy() {
  gcloud alpha monitoring policies list \
    --project="$PROJECT" \
    --filter="displayName=\"$POLICY_NAME\"" \
    --format='value(name)' 2>/dev/null | head -1
}

case "${1:-}" in
  --check)
    name="$(find_policy)"
    if [ -z "$name" ]; then
      echo "FAIL: no alert policy named \"$POLICY_NAME\" in $PROJECT."
      echo "      Missed-run detection is NOT in place. It is the control that closed finding LL-3e36a18199."
      echo "      Fix: $0 --apply"
      exit 1
    fi
    enabled="$(gcloud alpha monitoring policies describe "$name" --project="$PROJECT" --format='value(enabled)' 2>/dev/null)"
    channels="$(gcloud alpha monitoring policies describe "$name" --project="$PROJECT" --format='value(notificationChannels)' 2>/dev/null)"
    if [ "$enabled" != "True" ]; then
      echo "FAIL: policy exists but is DISABLED: $name"
      exit 1
    fi
    if [ -z "$channels" ]; then
      echo "FAIL: policy is enabled but has NO notification channel, so nothing is delivered: $name"
      exit 1
    fi
    echo "OK: $name (enabled, $(echo "$channels" | tr ';' '\n' | wc -l | tr -d ' ') notification channel(s))"
    ;;
  --apply)
    [ -f "$POLICY_FILE" ] || { echo "missing policy file: $POLICY_FILE" >&2; exit 1; }
    name="$(find_policy)"
    if [ -z "$name" ]; then
      echo "Creating \"$POLICY_NAME\" in $PROJECT..."
      gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$POLICY_FILE"
    else
      echo "Updating existing policy $name ..."
      gcloud alpha monitoring policies update "$name" --project="$PROJECT" --policy-from-file="$POLICY_FILE"
    fi
    "$0" --check
    ;;
  -h|--help|"")
    usage
    ;;
  *)
    echo "unknown argument: $1" >&2
    usage
    exit 2
    ;;
esac
