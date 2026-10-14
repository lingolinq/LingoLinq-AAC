#!/usr/bin/env bash
#
# ses-reputation-alarms.sh - CloudWatch alarms for SES sender reputation and for the SES
# events consumer, notifying an SNS topic with an email subscription.
#
# WHY THIS EXISTS
#   SES places an account under review, and can pause ALL sending (password resets, COPPA
#   consent mail included), on reputation alone. AWS SES Developer Guide, "Reputation metrics
#   messages" (https://docs.aws.amazon.com/ses/latest/dg/reputationdashboardmessages.html):
#     bounce rate:    5% or greater -> under review;   10% or greater -> sending may be paused
#     complaint rate: 0.1% or greater -> under review; 0.5% or greater -> sending may be paused
#   The reputation dashboard does not notify anyone by itself; an alarm is required
#   (https://docs.aws.amazon.com/ses/latest/dg/reputationdashboard-cloudwatch-alarm.html).
#   The metrics are fractions: 0.05 means 5%.
#
# THE THREE ALARMS
#   lingolinq-ses-bounce-rate      AWS/SES Reputation.BounceRate    >= 0.02   (2%, under the 5% review level)
#   lingolinq-ses-complaint-rate   AWS/SES Reputation.ComplaintRate >= 0.0005 (0.05%, half the 0.1% review level)
#   lingolinq-ses-events-stale     AWS/SQS ApproximateAgeOfOldestMessage on lingolinq-ses-events
#                                  >= 10800s (3h) for 15 minutes. SesEventsWorker drains the queue
#                                  hourly from scheduler:dispatch, so an oldest message 3 runs old
#                                  means the consumer is not running, lacks IAM, has
#                                  SES_EVENTS_QUEUE_URL unset, or keeps failing on one message.
#   Missing data: ignore for the reputation metrics (AWS's own console guidance; low volume
#   produces gaps), notBreaching for the queue age (an idle queue publishes nothing).
#
# IDEMPOTENT: `put-metric-alarm` creates or replaces by name, `create-topic` returns the
# existing topic, and the email subscription is created only if that endpoint is not already
# subscribed. Re-running converges on the definitions below.
#
# USAGE (AWS credentials for account 239044785114 with cloudwatch:PutMetricAlarm,
# cloudwatch:DescribeAlarms, sns:CreateTopic, sns:Subscribe, sns:ListSubscriptionsByTopic;
# NOT the app's lingolinq-cloudrun-prod user, which has none of these):
#   ALARM_EMAIL=<address> scripts/gcp/ses-reputation-alarms.sh --dry-run   # prints, calls nothing
#   ALARM_EMAIL=<address> scripts/gcp/ses-reputation-alarms.sh --apply     # WRITES to AWS
#   scripts/gcp/ses-reputation-alarms.sh --check                            # read-only
#   The address may also be passed as --email <address>. It is never hard-coded here.
#
#   The email subscription stays "PendingConfirmation" until someone clicks the link AWS sends;
#   no notification is delivered before that. --check reports it.
#
# DEPLOY ORDER: run --apply only after SesEventsWorker is live and has drained the backlog, or
# the stale alarm fires at once on up to 14 days of unread events (see docs/INFRASTRUCTURE.md,
# "SES events and alarms").
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
TOPIC_NAME="lingolinq-ses-alarms"
QUEUE_NAME="lingolinq-ses-events"
BOUNCE_ALARM="lingolinq-ses-bounce-rate"
COMPLAINT_ALARM="lingolinq-ses-complaint-rate"
STALE_ALARM="lingolinq-ses-events-stale"
BOUNCE_THRESHOLD="0.02"
COMPLAINT_THRESHOLD="0.0005"
STALE_SECONDS="10800"

usage() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"; }

MODE=""
EMAIL="${ALARM_EMAIL:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|--apply|--check) MODE="${1#--}"; shift ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { usage; exit 2; }

# run: print the command in dry-run mode, execute it otherwise.
run() {
  if [ "$MODE" = "dry-run" ]; then
    printf 'DRY-RUN:'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

# Alarm definitions, shared by apply and check so the two cannot drift.
# Fields: name|namespace|metric|dimension|statistic|period|evaluation-periods|threshold|missing|description
alarm_specs() {
  cat <<EOF
$BOUNCE_ALARM|AWS/SES|Reputation.BounceRate||Maximum|900|1|$BOUNCE_THRESHOLD|ignore|SES bounce rate >= 2%. AWS reviews the account at 5% and may pause sending at 10%. Runbook: docs/INFRASTRUCTURE.md, SES events and alarms.
$COMPLAINT_ALARM|AWS/SES|Reputation.ComplaintRate||Maximum|900|1|$COMPLAINT_THRESHOLD|ignore|SES complaint rate >= 0.05%. AWS reviews the account at 0.1% and may pause sending at 0.5%. Runbook: docs/INFRASTRUCTURE.md, SES events and alarms.
$STALE_ALARM|AWS/SQS|ApproximateAgeOfOldestMessage|Name=QueueName,Value=$QUEUE_NAME|Maximum|300|3|$STALE_SECONDS|notBreaching|Oldest SES event on $QUEUE_NAME is over 3h old: SesEventsWorker (hourly, scheduler:dispatch) is not draining it. Runbook: docs/INFRASTRUCTURE.md, SES events and alarms.
EOF
}

if [ "$MODE" != "dry-run" ]; then
  command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
fi

check() {
  local rc=0 topic_arn name ns metric dim stat period evals threshold missing desc live
  topic_arn="$(aws sns list-topics --region "$REGION" \
    --query "Topics[?ends_with(TopicArn, ':${TOPIC_NAME}')].TopicArn | [0]" --output text)"
  if [ -z "$topic_arn" ] || [ "$topic_arn" = "None" ]; then
    echo "FAIL: SNS topic $TOPIC_NAME does not exist in $REGION."; return 1
  fi
  echo "Topic: $topic_arn"
  # Count confirmed vs pending email subscriptions without printing the endpoints.
  local confirmed pending
  confirmed="$(aws sns list-subscriptions-by-topic --topic-arn "$topic_arn" --region "$REGION" \
    --query "length(Subscriptions[?Protocol=='email' && SubscriptionArn!='PendingConfirmation'])" --output text)"
  pending="$(aws sns list-subscriptions-by-topic --topic-arn "$topic_arn" --region "$REGION" \
    --query "length(Subscriptions[?Protocol=='email' && SubscriptionArn=='PendingConfirmation'])" --output text)"
  if [ "$confirmed" -eq 0 ]; then
    echo "FAIL: no CONFIRMED email subscription on $TOPIC_NAME ($pending pending). Nothing is delivered."
    rc=1
  else
    echo "OK: $confirmed confirmed email subscription(s), $pending pending."
  fi
  while IFS='|' read -r name ns metric dim stat period evals threshold missing desc; do
    live="$(aws cloudwatch describe-alarms --alarm-names "$name" --region "$REGION" \
      --query "MetricAlarms[0].[Namespace,MetricName,Threshold,Statistic,join(',',AlarmActions)]" --output text)"
    if [ -z "$live" ] || [ "$live" = "None" ]; then
      echo "FAIL: alarm $name is missing."; rc=1; continue
    fi
    # shellcheck disable=SC2086
    set -- $live
    if [ "$1" != "$ns" ] || [ "$2" != "$metric" ] || ! awk -v a="$3" -v b="$threshold" 'BEGIN{exit !(a+0==b+0)}' \
        || [ "$4" != "$stat" ] || [[ ",${5}," != *",${topic_arn},"* ]]; then
      echo "FAIL: alarm $name has drifted (live: $live). Fix: $0 --apply"; rc=1; continue
    fi
    echo "OK: $name ($metric $stat >= $threshold) notifies $TOPIC_NAME."
  done < <(alarm_specs)
  return "$rc"
}

apply() {
  local topic_arn existing name ns metric dim stat period evals threshold missing desc
  if [ -z "$EMAIL" ]; then
    echo "An alarm recipient is required: set ALARM_EMAIL or pass --email <address>." >&2
    exit 2
  fi
  if [ "$MODE" = "dry-run" ]; then
    topic_arn="arn:aws:sns:${REGION}:<account>:${TOPIC_NAME}"
    run aws sns create-topic --name "$TOPIC_NAME" --region "$REGION"
    run aws sns subscribe --topic-arn "$topic_arn" --protocol email --notification-endpoint "$EMAIL" --region "$REGION"
  else
    echo "== Region: $REGION; caller: $(aws sts get-caller-identity --query Arn --output text) =="
    topic_arn="$(aws sns create-topic --name "$TOPIC_NAME" --region "$REGION" --query TopicArn --output text)"
    echo "Topic: $topic_arn"
    existing="$(aws sns list-subscriptions-by-topic --topic-arn "$topic_arn" --region "$REGION" \
      --query "length(Subscriptions[?Protocol=='email' && Endpoint=='${EMAIL}'])" --output text)"
    if [ "$existing" -gt 0 ]; then
      echo "The recipient is already subscribed (confirmed or pending)."
    else
      echo "Subscribing the recipient; AWS emails a confirmation link that must be clicked."
      aws sns subscribe --topic-arn "$topic_arn" --protocol email --notification-endpoint "$EMAIL" \
        --region "$REGION" --query SubscriptionArn --output text >/dev/null
    fi
  fi

  while IFS='|' read -r name ns metric dim stat period evals threshold missing desc; do
    local dim_args=()
    [ -n "$dim" ] && dim_args=(--dimensions "$dim")
    echo "Alarm $name: $ns $metric $stat >= $threshold"
    run aws cloudwatch put-metric-alarm --region "$REGION" \
      --alarm-name "$name" --alarm-description "$desc" \
      --namespace "$ns" --metric-name "$metric" "${dim_args[@]}" \
      --statistic "$stat" --period "$period" --evaluation-periods "$evals" \
      --threshold "$threshold" --comparison-operator GreaterThanOrEqualToThreshold \
      --treat-missing-data "$missing" \
      --alarm-actions "$topic_arn" --ok-actions "$topic_arn"
  done < <(alarm_specs)

  if [ "$MODE" = "apply" ]; then
    echo ""
    check || echo "Applied. A FAIL above for the subscription is expected until the confirmation link is clicked."
  fi
}

case "$MODE" in
  check) check ;;
  dry-run|apply) apply ;;
esac
