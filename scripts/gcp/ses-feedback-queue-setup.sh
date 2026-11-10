#!/usr/bin/env bash
#
# ses-feedback-queue-setup.sh - the queue SesEventsWorker reads: only Bounce and Complaint
# events from SNS topic lingolinq-ses-events, with a dead-letter queue.
#
# WHY THIS EXISTS
#   The topic's original subscriber, SQS queue lingolinq-ses-events (scripts/gcp/
#   phase5-ses-config-set-setup.sh), receives every event the lingolinq-transactional
#   configuration set publishes, Send and Delivery included. It is the per-message delivery
#   record that finding LL-42a24ee911 asked for. A consumer on that queue would delete those
#   records, and Send plus Delivery for every mail would fill its hourly batch limit.
#   This script adds a second, filtered subscriber for the consumer, so the original queue
#   stays unread and keeps its record.
#
# WHAT IT CREATES (us-west-2, idempotent: each step checks first)
#   lingolinq-ses-feedback-dlq  SQS, 14-day retention, SSE-SQS. Nothing reads it.
#   lingolinq-ses-feedback      SQS, 14-day retention, SSE-SQS, RedrivePolicy to the DLQ with
#                               maxReceiveCount 24: SesEventsWorker receives a message it could
#                               not handle once per hourly run, so a message moves to the DLQ
#                               after about a day of failed runs, not after a short outage.
#                               (A DLQ message keeps its ORIGINAL enqueue time, so it has about
#                               13 days left there.)
#   Queue policy statement      AllowSESFeedbackSNSPublish: the topic may sqs:SendMessage.
#   SNS subscription            topic -> lingolinq-ses-feedback, FilterPolicyScope MessageBody,
#                               FilterPolicy {"eventType":["Bounce","Complaint"]} (the
#                               configuration set's event JSON names its type in eventType),
#                               RawMessageDelivery false (SesEvent.unwrap reads the envelope).
#   Topic policy statement      DenyPublishExceptSesConfigSet on lingolinq-ses-events: denies
#                               SNS:Publish to every principal whose request is not from the
#                               lingolinq-transactional configuration set (aws:SourceArn). The
#                               consumer disables email on whatever arrives, so without this any
#                               credential in the account allowed to publish (an IAM user's own
#                               policy is enough) could forge a bounce for a real address. It also
#                               blocks hand-published test events; test with the SES mailbox
#                               simulator instead.
#   A subscription receives only events published after it exists: it does not copy the
#   original queue's backlog. See docs/INFRASTRUCTURE.md, "SES events and alarms", for the
#   rollout order that drains the backlog first and for moving messages out of the DLQ.
#
# USAGE (AWS credentials for account 239044785114 with sqs:CreateQueue, sqs:GetQueueUrl,
# sqs:GetQueueAttributes, sqs:SetQueueAttributes, sns:Subscribe, sns:ListSubscriptionsByTopic,
# sns:GetSubscriptionAttributes, sns:SetSubscriptionAttributes, sns:GetTopicAttributes,
# sns:SetTopicAttributes; NOT the app's
# lingolinq-cloudrun-prod user):
#   scripts/gcp/ses-feedback-queue-setup.sh --dry-run   # prints the writes, reads nothing
#   scripts/gcp/ses-feedback-queue-setup.sh --apply     # WRITES to AWS
#   scripts/gcp/ses-feedback-queue-setup.sh --check     # read-only; exit 1 when a queue, the
#                                                       # redrive, either policy statement or the
#                                                       # subscription filter differs (retention and
#                                                       # encryption are set at creation, not checked)
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
TOPIC_NAME="lingolinq-ses-events"
QUEUE_NAME="lingolinq-ses-feedback"
DLQ_NAME="lingolinq-ses-feedback-dlq"
MAX_RECEIVE_COUNT="24"
RETENTION="1209600"
POLICY_SID="AllowSESFeedbackSNSPublish"
CONFIG_SET="lingolinq-transactional"
DENY_SID="DenyPublishExceptSesConfigSet"
FILTER_POLICY='{"eventType":["Bounce","Complaint"]}'

usage() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"; }

MODE=""
case "${1:-}" in
  --dry-run|--apply|--check) MODE="${1#--}" ;;
  -h|--help) usage; exit 0 ;;
  *) usage; exit 2 ;;
esac

if [ "$MODE" = "dry-run" ]; then
  ACCOUNT_ID="<account>"
  q() { printf 'https://sqs.%s.amazonaws.com/%s/%s' "$REGION" "$ACCOUNT_ID" "$1"; }
  DLQ_URL="$(q "$DLQ_NAME")"; QUEUE_URL="$(q "$QUEUE_NAME")"
  DLQ_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${DLQ_NAME}"
  QUEUE_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${QUEUE_NAME}"
  TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:${TOPIC_NAME}"
  echo "DRY-RUN: aws sqs create-queue --queue-name $DLQ_NAME --attributes MessageRetentionPeriod=$RETENTION,SqsManagedSseEnabled=true"
  echo "DRY-RUN: aws sqs create-queue --queue-name $QUEUE_NAME --attributes MessageRetentionPeriod=$RETENTION,SqsManagedSseEnabled=true,RedrivePolicy={\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"$MAX_RECEIVE_COUNT\"}"
  echo "DRY-RUN: merge topic policy statement $DENY_SID (Deny SNS:Publish on $TOPIC_ARN unless aws:SourceArn is arn:aws:ses:${REGION}:${ACCOUNT_ID}:configuration-set/${CONFIG_SET})"
  echo "DRY-RUN: merge queue policy statement $POLICY_SID (sns.amazonaws.com sqs:SendMessage on $QUEUE_ARN, aws:SourceArn $TOPIC_ARN)"
  echo "DRY-RUN: aws sns subscribe --topic-arn $TOPIC_ARN --protocol sqs --notification-endpoint $QUEUE_ARN --attributes FilterPolicyScope=MessageBody,FilterPolicy=$FILTER_POLICY,RawMessageDelivery=false"
  exit 0
fi

command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:${TOPIC_NAME}"
DLQ_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${DLQ_NAME}"
QUEUE_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${QUEUE_NAME}"
SES_SOURCE_ARN="arn:aws:ses:${REGION}:${ACCOUNT_ID}:configuration-set/${CONFIG_SET}"
DENY_STATEMENT="$(jq -cn --arg t "$TOPIC_ARN" --arg src "$SES_SOURCE_ARN" --arg sid "$DENY_SID" '{
  Sid: $sid, Effect: "Deny", Principal: "*", Action: "SNS:Publish", Resource: $t,
  Condition: {StringNotEquals: {"aws:SourceArn": $src}}}')"
REDRIVE="$(jq -cn --arg arn "$DLQ_ARN" --arg n "$MAX_RECEIVE_COUNT" '{deadLetterTargetArn: $arn, maxReceiveCount: $n}')"
STATEMENT="$(jq -cn --arg q "$QUEUE_ARN" --arg t "$TOPIC_ARN" --arg sid "$POLICY_SID" '{
  Sid: $sid, Effect: "Allow", Principal: {Service: "sns.amazonaws.com"},
  Action: "sqs:SendMessage", Resource: $q, Condition: {ArnEquals: {"aws:SourceArn": $t}}}')"

# Prints the queue URL, or nothing when the queue does not exist. Any other error stops the run.
queue_url() {
  local out
  if out="$(aws sqs get-queue-url --queue-name "$1" --region "$REGION" --query QueueUrl --output text 2>&1)"; then
    echo "$out"
  elif grep -q 'NonExistentQueue' <<<"$out"; then
    :
  else
    echo "$out" >&2; return 1
  fi
}

queue_attr() {
  aws sqs get-queue-attributes --queue-url "$1" --attribute-names "$2" --region "$REGION" \
    --query "Attributes.$2" --output text
}

topic_policy() {
  aws sns get-topic-attributes --topic-arn "$TOPIC_ARN" --region "$REGION" --query Attributes.Policy --output text
}

subscription_arn() {
  aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" --region "$REGION" \
    --query "Subscriptions[?Endpoint=='${QUEUE_ARN}'].SubscriptionArn | [0]" --output text
}

check() {
  local rc=0 dlq_url url redrive policy sub attrs
  dlq_url="$(queue_url "$DLQ_NAME")"; url="$(queue_url "$QUEUE_NAME")"
  [ -n "$dlq_url" ] && echo "OK: $DLQ_NAME exists." || { echo "FAIL: $DLQ_NAME does not exist."; rc=1; }
  if [ -z "$url" ]; then
    echo "FAIL: $QUEUE_NAME does not exist."; return 1
  fi
  redrive="$(queue_attr "$url" RedrivePolicy)"
  if jq -e --arg arn "$DLQ_ARN" --arg n "$MAX_RECEIVE_COUNT" \
      '.deadLetterTargetArn == $arn and (.maxReceiveCount | tostring) == $n' <<<"$redrive" >/dev/null 2>&1; then
    echo "OK: $QUEUE_NAME redrives to $DLQ_NAME after $MAX_RECEIVE_COUNT receives."
  else
    echo "FAIL: $QUEUE_NAME RedrivePolicy is ${redrive:-unset}; expected $REDRIVE."; rc=1
  fi
  policy="$(queue_attr "$url" Policy)"
  if jq -e --argjson stmt "$STATEMENT" '.Statement[]? | select(. == $stmt)' <<<"$policy" >/dev/null 2>&1; then
    echo "OK: the queue policy lets $TOPIC_NAME publish."
  else
    echo "FAIL: the queue policy lacks $POLICY_SID as defined here; SNS deliveries would be refused."; rc=1
  fi
  if jq -e --argjson stmt "$DENY_STATEMENT" '.Statement[]? | select(. == $stmt)' <<<"$(topic_policy)" >/dev/null 2>&1; then
    echo "OK: only the $CONFIG_SET configuration set may publish to $TOPIC_NAME."
  else
    echo "FAIL: the topic policy lacks $DENY_SID as defined here; other principals in the account may publish forged events."; rc=1
  fi
  sub="$(subscription_arn)"
  if [ -z "$sub" ] || [ "$sub" = "None" ]; then
    echo "FAIL: $QUEUE_NAME is not subscribed to $TOPIC_NAME."; return 1
  elif [ "$sub" = "PendingConfirmation" ]; then
    echo "FAIL: the subscription is pending confirmation."; return 1
  fi
  attrs="$(aws sns get-subscription-attributes --subscription-arn "$sub" --region "$REGION" --query Attributes --output json)"
  if jq -e --argjson fp "$FILTER_POLICY" '.FilterPolicyScope == "MessageBody" and (.FilterPolicy | fromjson) == $fp
      and (.RawMessageDelivery // "false") == "false"' <<<"$attrs" >/dev/null; then
    echo "OK: the subscription filters on eventType Bounce/Complaint in the message body, raw delivery off."
  else
    echo "FAIL: subscription attributes differ: $(jq -c '{FilterPolicyScope, FilterPolicy, RawMessageDelivery}' <<<"$attrs")"; rc=1
  fi
  return "$rc"
}

apply() {
  local dlq_url url existing base updated sub
  echo "== Region: $REGION; caller: $(aws sts get-caller-identity --query Arn --output text) =="
  dlq_url="$(queue_url "$DLQ_NAME")"
  if [ -z "$dlq_url" ]; then
    echo "Creating $DLQ_NAME..."
    dlq_url="$(aws sqs create-queue --queue-name "$DLQ_NAME" --region "$REGION" \
      --attributes "MessageRetentionPeriod=$RETENTION,SqsManagedSseEnabled=true" --query QueueUrl --output text)"
  else
    echo "$DLQ_NAME exists."
  fi

  url="$(queue_url "$QUEUE_NAME")"
  if [ -z "$url" ]; then
    echo "Creating $QUEUE_NAME..."
    url="$(aws sqs create-queue --queue-name "$QUEUE_NAME" --region "$REGION" \
      --attributes "$(jq -cn --arg r "$RETENTION" --arg rp "$REDRIVE" \
        '{MessageRetentionPeriod: $r, SqsManagedSseEnabled: "true", RedrivePolicy: $rp}')" \
      --query QueueUrl --output text)"
  else
    echo "$QUEUE_NAME exists; setting its RedrivePolicy."
    aws sqs set-queue-attributes --queue-url "$url" --region "$REGION" \
      --attributes "$(jq -cn --arg rp "$REDRIVE" '{RedrivePolicy: $rp}')"
  fi

  # Merged, not replaced, so any other statement on the queue survives a re-run.
  existing="$(queue_attr "$url" Policy)"
  if [ -n "$existing" ] && [ "$existing" != "None" ]; then base="$existing"; else base='{"Version":"2012-10-17","Statement":[]}'; fi
  if jq -e --argjson stmt "$STATEMENT" '.Statement[]? | select(. == $stmt)' <<<"$base" >/dev/null 2>&1; then
    echo "Queue policy is up to date."
  else
    echo "Setting queue policy statement $POLICY_SID..."
    updated="$(jq -c --argjson stmt "$STATEMENT" --arg sid "$POLICY_SID" \
      '.Statement = ([.Statement[]? | select(.Sid != $sid)] + [$stmt])' <<<"$base")"
    aws sqs set-queue-attributes --queue-url "$url" --region "$REGION" \
      --attributes "$(jq -cn --arg p "$updated" '{Policy: $p}')"
  fi

  # Merged into the topic's policy, so phase5's AllowSESPublish and any other statement survive.
  base="$(topic_policy)"
  if jq -e --argjson stmt "$DENY_STATEMENT" '.Statement[]? | select(. == $stmt)' <<<"$base" >/dev/null 2>&1; then
    echo "Topic policy already limits publishing to $CONFIG_SET."
  else
    echo "Setting topic policy statement $DENY_SID..."
    updated="$(jq -c --argjson stmt "$DENY_STATEMENT" --arg sid "$DENY_SID" \
      '.Statement = ([.Statement[]? | select(.Sid != $sid)] + [$stmt])' <<<"$base")"
    aws sns set-topic-attributes --topic-arn "$TOPIC_ARN" --region "$REGION" \
      --attribute-name Policy --attribute-value "$updated"
  fi

  sub="$(subscription_arn)"
  if [ -z "$sub" ] || [ "$sub" = "None" ]; then
    echo "Subscribing $QUEUE_NAME to $TOPIC_NAME with the Bounce/Complaint filter..."
    aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol sqs --notification-endpoint "$QUEUE_ARN" \
      --region "$REGION" --return-subscription-arn \
      --attributes "$(jq -cn --arg fp "$FILTER_POLICY" '{FilterPolicyScope: "MessageBody", FilterPolicy: $fp, RawMessageDelivery: "false"}')" \
      --query SubscriptionArn --output text >/dev/null
  else
    echo "Subscription exists; setting its filter."
    # Scope first: a body-shaped policy is rejected while the scope is still MessageAttributes.
    aws sns set-subscription-attributes --subscription-arn "$sub" --region "$REGION" \
      --attribute-name FilterPolicyScope --attribute-value MessageBody
    aws sns set-subscription-attributes --subscription-arn "$sub" --region "$REGION" \
      --attribute-name FilterPolicy --attribute-value "$FILTER_POLICY"
    aws sns set-subscription-attributes --subscription-arn "$sub" --region "$REGION" \
      --attribute-name RawMessageDelivery --attribute-value false
  fi
  echo ""
  check
}

case "$MODE" in
  check) check ;;
  apply) apply ;;
esac
