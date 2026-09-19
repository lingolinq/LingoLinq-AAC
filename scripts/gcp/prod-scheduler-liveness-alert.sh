#!/usr/bin/env bash
#
# prod-scheduler-liveness-alert.sh - missed-run (liveness) detection for the
# production scheduler. It is the control that closed finding LL-3e36a18199 (2026-09-18).
#
# WHY THIS EXISTS
#   "PROD Cloud Run job execution FAILED" counts executions whose result is `failed`.
#   A run that never happens produces no execution at all, so there is nothing to count
#   and nothing fires. That is not hypothetical here: from 2026-07-21 (the day before the
#   GCP cutover, when the Render cron was suspended) to 2026-09-02, `scheduler:dispatch`
#   was not run by the scheduler and no alert fired. The retention, purge, flush and
#   expiry tasks it dispatches were not run by it either.
#
#   A trigger now exists (Cloud Scheduler `lingolinq-scheduler-hourly`, ENABLED,
#   `0 * * * *`, hourly since 2026-09-02). This adds the detector for its absence.
#
# WHY 90 MINUTES
#   The job runs hourly. Across 398 completed executions from 2026-09-02 to 2026-09-19 the
#   longest gap between completions was 69.7 minutes, so 90 minutes leaves about 20 minutes
#   of headroom over anything observed. It is not a guarantee against false alarms: the task
#   timeout is 3000s, so one execution finishing more than about 30 minutes later than usual
#   can trip it. It is deliberately NOT 24h: the 06:00 UTC daily block carries the retention
#   and deletion work, so a gap that spans 06:00 must be visible the same morning.
#
# WHY METRIC ABSENCE AND NOT A LOG-BASED METRIC
#   `run.googleapis.com/job/completed_execution_count` is emitted by Cloud Run itself,
#   so it does not depend on the application booting, on the rake task reaching its
#   final `puts`, or on log ingestion.
#
# LIMITS OF METRIC ABSENCE (Google's documented behaviour)
#   - It needs a successful measurement after it is installed or last modified before it
#     can fire. Observed 2026-09-19: a data point inside the condition's lookback window
#     (its duration) counts, including one written shortly BEFORE the change. So re-applying
#     more than 90 minutes into a stoppage leaves it silent. --check reports that state as
#     NOT YET ARMED (exit 3).
#   - Metrics of DELETED or TERMINATED resources are not considered. If the
#     `lingolinq-scheduler` job itself is deleted, this alert stays silent. A second,
#     job-independent control (for example on Cloud Scheduler attempt errors) is a
#     separate follow-up.
#
# USAGE
#   scripts/gcp/prod-scheduler-liveness-alert.sh --check   # read-only
#   scripts/gcp/prod-scheduler-liveness-alert.sh --apply   # create or update the policy
#
#   --check exit codes: 0 OK; 1 FAIL (missing, duplicated, drifted from the committed JSON,
#   disabled, channel disabled or changed since delivery was proven, or a gcloud error); 3 NOT YET ARMED (no completed execution
#   within the condition's duration before the last change, nor since, so it cannot fire).
#
#   --apply WRITES TO PRODUCTION monitoring config. It is idempotent: it updates the one
#   policy whose displayName matches exactly, refuses if more than one does, and otherwise
#   creates it.
#
# WHAT IS PROVEN, AND HOW
#   --check proves the live policy matches the committed definition and is armed. It does
#   not prove delivery or firing. Both were proven separately:
#   - Delivery, 2026-09-18: a temporary policy on the same channel was made to fire on the
#     healthy state, the email arrived, and the temporary policy was deleted. The Cloud
#     Monitoring API has no "send test notification" method. --check fails if the channel
#     has been changed since DELIVERY_PROVEN_AT; re-prove the same way, then update it.
#   - Firing of the absence condition: see docs/INFRASTRUCTURE.md, "Scheduler liveness". No
#     outage is needed to test it. A temporary copy with the same filter and aggregation and
#     a 30-minute window fires between healthy hourly runs.
set -euo pipefail

PROJECT="lingolinq-prod"
REGION="us-central1"
JOB="lingolinq-scheduler"
POLICY_NAME="PROD scheduler dispatch MISSED RUN (no execution in 90m)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="$HERE/prod-scheduler-liveness-alert.json"
# When delivery through the channel was last proven by a received notification (the
# 2026-09-18 test incident). A channel edited in place after this keeps its resource name,
# so the policy diff cannot see it; --check compares the channel's own mutation time.
# After re-proving delivery, update this to the new proof time.
DELIVERY_PROVEN_AT="2026-09-18T23:26:45"

# The fields that define the control. Server-added fields (name, creationRecord,
# condition names) are ignored; everything that decides when and whom it alerts is compared.
SEMANTIC='{displayName, combiner, enabled, notificationChannels,
  documentation: .documentation.content,
  conditions: [.conditions[] | {displayName, conditionAbsent}],
  renotify: (.alertStrategy.notificationChannelStrategy // null)}'

usage() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"; }

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# Prints the resource names of policies whose displayName EQUALS POLICY_NAME (compared
# client-side, so a server-side filter that matches substrings cannot select a decoy).
matching_policies() {
  local all
  all="$(gcloud alpha monitoring policies list --project="$PROJECT" --format=json)" || {
    echo "FAIL: could not list alert policies in $PROJECT (see gcloud error above)." >&2
    return 1
  }
  jq -r --arg n "$POLICY_NAME" '.[] | select(.displayName == $n) | .name' <<<"$all"
}

check() {
  local names count name live diff_out channel chan changed mutated since execs latest
  names="$(matching_policies)" || return 1
  count="$(grep -c . <<<"$names" || true)"
  if [ "$count" -eq 0 ]; then
    echo "FAIL: no alert policy named \"$POLICY_NAME\" in $PROJECT."
    echo "      Missed-run detection is NOT in place. It is the control that closed finding LL-3e36a18199."
    echo "      Fix: $0 --apply"
    return 1
  fi
  if [ "$count" -gt 1 ]; then
    echo "FAIL: $count policies are named \"$POLICY_NAME\"; exactly one is expected:"
    echo "$names" | sed 's/^/      /'
    return 1
  fi
  name="$names"

  live="$(gcloud alpha monitoring policies describe "$name" --project="$PROJECT" --format=json)" || {
    echo "FAIL: could not read $name (see gcloud error above)."; return 1; }
  if ! diff_out="$(diff <(jq -S "$SEMANTIC" <<<"$live") <(jq -S "$SEMANTIC" "$POLICY_FILE"))"; then
    echo "FAIL: the live policy has drifted from $POLICY_FILE (< live, > committed):"
    echo "$diff_out" | sed 's/^/      /'
    echo "      Fix: review the difference, then $0 --apply"
    return 1
  fi

  for channel in $(jq -r '.notificationChannels[]' <<<"$live"); do
    chan="$(gcloud alpha monitoring channels describe "$channel" --project="$PROJECT" --format=json)" || {
      echo "FAIL: could not read channel $channel (see gcloud error above)."; return 1; }
    if [ "$(jq -r '.enabled' <<<"$chan")" != "true" ]; then
      echo "FAIL: notification channel $channel is disabled, so nothing is delivered."
      return 1
    fi
    changed="$(jq -r '[(.mutationRecords // [])[].mutateTime, .creationRecord.mutateTime] | map(select(. != null) | .[0:19]) | max // ""' <<<"$chan")"
    if [ -z "$changed" ] || [[ "$changed" > "$DELIVERY_PROVEN_AT" ]]; then
      echo "FAIL: notification channel $channel was changed at ${changed:-an unknown time}Z, after delivery"
      echo "      was last proven (${DELIVERY_PROVEN_AT}Z). Re-prove delivery (see docs/INFRASTRUCTURE.md,"
      echo "      \"Scheduler liveness\"), then update DELIVERY_PROVEN_AT in this script."
      return 1
    fi
  done

  # An absence condition cannot fire until a measurement after its last change retrieves
  # data. A point inside the lookback window (the condition's duration) counts, so the
  # condition is armed if the latest completion is later than (last change - duration).
  mutated="$(jq -r '(.mutationRecord.mutateTime // .creationRecord.mutateTime)[0:19]' <<<"$live")"
  since="$(jq -r '((.mutationRecord.mutateTime // .creationRecord.mutateTime)[0:19] + "Z" | fromdateiso8601)
      - (.conditions[0].conditionAbsent.duration | rtrimstr("s") | tonumber)
      | todateiso8601 | .[0:19]' <<<"$live")"
  execs="$(gcloud run jobs executions list --job="$JOB" --region="$REGION" --project="$PROJECT" --limit=10 --format=json)" || {
    echo "FAIL: could not list executions of $JOB (see gcloud error above)."; return 1; }
  latest="$(jq -r '[.[] | select((.status.succeededCount // 0) >= 1) | .status.completionTime[0:19]] | max // ""' <<<"$execs")"
  if [ -z "$latest" ] || [[ ! "$latest" > "$since" ]]; then
    echo "NOT YET ARMED: $name matches the committed definition, but no completed execution"
    echo "      of $JOB falls after ${since}Z (last change ${mutated}Z minus the condition's duration;"
    echo "      latest completion ${latest:-none}). It cannot fire until one does. Re-run --check after the next hourly run."
    return 3
  fi

  echo "OK: $name matches $POLICY_FILE, is enabled, its channel is enabled, and it is armed"
  echo "    (last changed ${mutated}Z; latest completion ${latest}Z is after ${since}Z)."
}

case "${1:-}" in
  --check)
    check
    ;;
  --apply)
    [ -f "$POLICY_FILE" ] || { echo "missing policy file: $POLICY_FILE" >&2; exit 1; }
    names="$(matching_policies)"
    count="$(grep -c . <<<"$names" || true)"
    if [ "$count" -gt 1 ]; then
      echo "Refusing: $count policies are named \"$POLICY_NAME\"; resolve the duplicates first:" >&2
      echo "$names" >&2
      exit 1
    elif [ "$count" -eq 1 ]; then
      echo "Updating existing policy $names ..."
      gcloud alpha monitoring policies update "$names" --project="$PROJECT" --policy-from-file="$POLICY_FILE"
    else
      echo "Creating \"$POLICY_NAME\" in $PROJECT..."
      gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$POLICY_FILE"
    fi
    rc=0; check || rc=$?
    if [ "$rc" -eq 3 ]; then
      echo "Applied. Expected right after a change: the policy arms at the next completed hourly execution."
      exit 0
    fi
    exit "$rc"
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
