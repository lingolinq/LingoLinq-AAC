#!/usr/bin/env bash
#
# prod-mail-failure-alert.sh - log-match alert on the production app's handled email sending
# failures. Closes the #1117 follow-up (an alert on the inactivity sweep's "mail stopped" line)
# and the send-error half of the #1145 "SES alarm" item.
#
# WHAT IT MATCHES (prod-mail-failure-alert.json)
#   textPayload containing "[inactivity sweep] mail stopped" (app/models/concerns/subscription.rb),
#   "SES delivery failed" (app/mailers/concerns/general.rb, the one SES error
#   General.deliver_message swallows), or "[job failed] ...Mailer . deliver_message" (a queued
#   mail job that raised; lib/job_failure_log.rb), from cloud_run_job, cloud_run_revision or
#   cloud_run_worker_pool resources in lingolinq-prod.
#
# WHAT IT DOES NOT COVER
#   - Mail sent inline inside a non-mailer job: BoyBand queues most jobs as
#     "<Class> . perform_action", so an SES error raised there logs
#     "[job failed] User . perform_action Aws::SES::Errors::..." and does not match (for example
#     the expiration and usage mails in Subscription.check_for_subscription_updates).
#   - Mail that SES accepts and later bounces (the SES reputation alarms cover that).
#   It DOES also fire on mailer code errors (a NoMethodError in a mailer job), not only SES
#   problems. Before --apply, measure the failed mail jobs in the Resque failed list by mailer
#   and error class to know the base rate.
#
# ASSUMPTION TO CONFIRM ONCE
#   The app logs plain text to STDOUT (config/environments/production.rb), which Cloud Logging
#   stores as textPayload. Confirm with one read before relying on the alert:
#     gcloud logging read 'resource.type="cloud_run_job" AND textPayload:"Scheduler Dispatch Complete"' \
#       --project lingolinq-prod --limit 1 --format='value(textPayload)'
#   An empty result while the scheduler is healthy means the lines are jsonPayload, and the
#   filter must change.
#
# USAGE
#   scripts/gcp/prod-mail-failure-alert.sh --check   # read-only
#   scripts/gcp/prod-mail-failure-alert.sh --apply   # WRITES production monitoring config
#   --check exit codes: 0 OK; 1 FAIL (missing, duplicated, drifted, disabled, or its channel is
#   disabled or changed since delivery was proven). It proves the live policy matches the file;
#   it does not prove the filter matches real log lines (see the assumption above).
set -euo pipefail

PROJECT="lingolinq-prod"
POLICY_NAME="PROD email sending failed"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="$HERE/prod-mail-failure-alert.json"
# The channel the scheduler liveness alert proved delivery through (prod-scheduler-liveness-alert.sh).
DELIVERY_PROVEN_AT="2026-09-18T23:26:45"

SEMANTIC='{displayName, combiner, enabled, notificationChannels,
  documentation: .documentation.content,
  conditions: [.conditions[] | {displayName, conditionMatchedLog}],
  alertStrategy: {notificationRateLimit: .alertStrategy.notificationRateLimit, autoClose: .alertStrategy.autoClose}}'

# shellcheck source=lib/alert-policy.sh
. "$HERE/lib/alert-policy.sh"

usage() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"; }

check() {
  local names count live
  names="$(ap_matching_policies "$PROJECT" "$POLICY_NAME")" || return 1
  count="$(grep -c . <<<"$names" || true)"
  if [ "$count" -eq 0 ]; then
    echo "FAIL: no alert policy named \"$POLICY_NAME\" in $PROJECT. Fix: $0 --apply"
    return 1
  elif [ "$count" -gt 1 ]; then
    echo "FAIL: $count policies are named \"$POLICY_NAME\"; exactly one is expected:"
    echo "$names" | sed 's/^/      /'
    return 1
  fi
  live="$(gcloud alpha monitoring policies describe "$names" --project="$PROJECT" --format=json)" || {
    echo "FAIL: could not read $names (see gcloud error above)."; return 1; }
  ap_semantic_diff "$POLICY_FILE" "$SEMANTIC" <<<"$live" || { echo "      Fix: review the difference, then $0 --apply"; return 1; }
  ap_check_channels "$PROJECT" "$DELIVERY_PROVEN_AT" <<<"$live" || return 1
  echo "OK: $names matches $POLICY_FILE, is enabled, and its channel is enabled and unchanged since delivery was proven."
}

case "${1:-}" in
  --check)
    command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
    check
    ;;
  --apply)
    command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
    ap_apply "$PROJECT" "$POLICY_NAME" "$POLICY_FILE"
    check
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
