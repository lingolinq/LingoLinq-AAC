#!/usr/bin/env bash
#
# phase5-ses-config-set-setup.sh - LingoLinq Render -> GCP Cloud Run migration, Phase 5 (cutover).
#
# Remediation for LL-42a24ee911 (SES-to-personal-Gmail non-delivery, root cause unknown). Today
# lingolinq-prod's SES account has ZERO configuration sets and no event destination, so there is
# no per-message delivery/bounce/complaint record anywhere -- only account-wide 15-minute
# aggregates (GetSendStatistics), which cannot say what happened to any one message. This script
# builds an SNS + SQS event pipeline and an SES configuration set wired to it (remediation option
# (a) in the finding), so the NEXT diagnostic send returns a real per-message answer instead of
# another inconclusive "it never arrived, we don't know why."
#
# ADDITIVE AND SAFE: creates new AWS resources only. Does not touch the existing lingolinq.com
# domain identity, DKIM, or any in-flight sending. The app change that actually opts a message
# into this configuration set (X-SES-CONFIGURATION-SET header) is a separate, explicit code
# change (see app/mailers or config/initializers/amazon_ses.rb) -- this script alone changes
# nothing about how mail is sent.
#
# Idempotent: every step checks for the resource first and skips creation if it already exists,
# so it is safe to re-run.
#
# Usage: AWS_REGION=us-west-2 ./scripts/gcp/phase5-ses-config-set-setup.sh
#
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
QUEUE_NAME="lingolinq-ses-events"
TOPIC_NAME="lingolinq-ses-events"
CONFIG_SET="lingolinq-transactional"
EVENT_DEST_NAME="lingolinq-ses-sns"

echo "== Region: $REGION =="

# --- 0. Preflight: confirm creds resolve to an identity before touching any AWS resource. Also
# gives us ACCOUNT_ID up front for the SNS topic policy in step 3. ---
CALLER_IDENTITY_JSON="$(aws sts get-caller-identity --region "$REGION" --output json)"
ACCOUNT_ID="$(echo "$CALLER_IDENTITY_JSON" | jq -r '.Account')"
CALLER_ARN="$(echo "$CALLER_IDENTITY_JSON" | jq -r '.Arn')"
echo "== Caller: $CALLER_ARN (account $ACCOUNT_ID) =="

# --- 1. SQS queue (diagnostic sink; queryable, unlike an email subscription) ---
# No stderr redirect here: a real auth/permission failure on this call must be visible, not
# silently swallowed into the "queue doesn't exist, create it" branch below.
QUEUE_URL="$(aws sqs get-queue-url --queue-name "$QUEUE_NAME" --region "$REGION" \
  --query QueueUrl --output text || true)"
if [ -z "$QUEUE_URL" ] || [ "$QUEUE_URL" = "None" ]; then
  echo "Creating SQS queue $QUEUE_NAME..."
  QUEUE_URL="$(aws sqs create-queue --queue-name "$QUEUE_NAME" --region "$REGION" \
    --attributes MessageRetentionPeriod=1209600 \
    --query QueueUrl --output text)"
else
  echo "SQS queue $QUEUE_NAME already exists: $QUEUE_URL"
fi
QUEUE_ARN="$(aws sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn \
  --region "$REGION" --query 'Attributes.QueueArn' --output text)"
echo "Queue ARN: $QUEUE_ARN"

# --- 2. SNS topic ---
TOPIC_ARN="$(aws sns list-topics --region "$REGION" \
  --query "Topics[?ends_with(TopicArn, ':${TOPIC_NAME}')].TopicArn | [0]" --output text)"
if [ -z "$TOPIC_ARN" ] || [ "$TOPIC_ARN" = "None" ]; then
  echo "Creating SNS topic $TOPIC_NAME..."
  TOPIC_ARN="$(aws sns create-topic --name "$TOPIC_NAME" --region "$REGION" \
    --query TopicArn --output text)"
else
  echo "SNS topic $TOPIC_NAME already exists: $TOPIC_ARN"
fi
echo "Topic ARN: $TOPIC_ARN"

# --- 3. Topic policy: allow the SES service principal to publish into this topic. ---
# This is the actual blocker behind LL-42a24ee911's missing events: SNS denies same-account
# service-to-service Publish calls by default (the AWS "confused deputy" protection -- a service
# principal like ses.amazonaws.com has no implicit access to a resource just because it's in the
# same account; it needs an explicit resource-based policy statement, same as S3->SNS or
# CloudWatch->SNS notification wiring). Without this statement, SES's Publish call to the topic
# is silently denied and no event destination traffic ever arrives, no matter how correctly the
# configuration set (step 6/7) is wired up.
SES_SOURCE_ARN="arn:aws:ses:${REGION}:${ACCOUNT_ID}:configuration-set/${CONFIG_SET}"
EXISTING_TOPIC_POLICY="$(aws sns get-topic-attributes --topic-arn "$TOPIC_ARN" --region "$REGION" \
  --query 'Attributes.Policy' --output text)"
if echo "$EXISTING_TOPIC_POLICY" | jq -e '.Statement[]? | select(.Sid == "AllowSESPublish")' \
    >/dev/null 2>&1; then
  echo "SNS topic policy already grants SES publish access."
else
  echo "Granting ses.amazonaws.com sns:Publish on $TOPIC_NAME (scoped to account $ACCOUNT_ID / $SES_SOURCE_ARN)..."
  SES_STATEMENT="$(jq -n --arg topicArn "$TOPIC_ARN" --arg accountId "$ACCOUNT_ID" \
      --arg sourceArn "$SES_SOURCE_ARN" '{
    Sid: "AllowSESPublish",
    Effect: "Allow",
    Principal: {Service: "ses.amazonaws.com"},
    Action: "SNS:Publish",
    Resource: $topicArn,
    Condition: {
      StringEquals: {
        "AWS:SourceAccount": $accountId,
        "AWS:SourceArn": $sourceArn
      }
    }
  }')"
  UPDATED_TOPIC_POLICY="$(echo "$EXISTING_TOPIC_POLICY" | jq --argjson stmt "$SES_STATEMENT" \
      '.Statement += [$stmt]')"
  aws sns set-topic-attributes --topic-arn "$TOPIC_ARN" --attribute-name Policy \
    --attribute-value "$UPDATED_TOPIC_POLICY" --region "$REGION"
fi

# --- 4. Queue policy: allow this specific SNS topic to publish to this queue ---
POLICY_JSON="$(jq -n --arg queueArn "$QUEUE_ARN" --arg topicArn "$TOPIC_ARN" '{
  Version: "2012-10-17",
  Statement: [{
    Sid: "AllowSESEventsSNSPublish",
    Effect: "Allow",
    Principal: {Service: "sns.amazonaws.com"},
    Action: "sqs:SendMessage",
    Resource: $queueArn,
    Condition: {ArnEquals: {"aws:SourceArn": $topicArn}}
  }]
}')"
ATTRS_JSON="$(jq -n --arg policy "$POLICY_JSON" '{Policy: $policy}')"
echo "Setting queue policy (allow $TOPIC_NAME to publish)..."
aws sqs set-queue-attributes --queue-url "$QUEUE_URL" --region "$REGION" \
  --attributes "$ATTRS_JSON"

# --- 5. Subscribe the queue to the topic (idempotent: AWS de-dupes identical subscriptions) ---
EXISTING_SUB="$(aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" --region "$REGION" \
  --query "Subscriptions[?Endpoint=='${QUEUE_ARN}'].SubscriptionArn | [0]" --output text)"
if [ -z "$EXISTING_SUB" ] || [ "$EXISTING_SUB" = "None" ]; then
  echo "Subscribing queue to topic..."
  aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol sqs --notification-endpoint "$QUEUE_ARN" \
    --region "$REGION" --output text
else
  echo "Subscription already exists: $EXISTING_SUB"
fi

# --- 6. SES configuration set ---
if aws sesv2 get-configuration-set --configuration-set-name "$CONFIG_SET" --region "$REGION" \
    >/dev/null 2>&1; then
  echo "Configuration set $CONFIG_SET already exists."
else
  echo "Creating configuration set $CONFIG_SET..."
  aws sesv2 create-configuration-set --configuration-set-name "$CONFIG_SET" --region "$REGION"
fi

# --- 7. Event destination: SEND/REJECT/BOUNCE/COMPLAINT/DELIVERY/DELIVERY_DELAY to the SNS topic ---
# (OPEN/CLICK/SUBSCRIPTION omitted: irrelevant to the non-delivery diagnostic and OPEN/CLICK need
# tracking-options wiring this script does not set up.)
EVENT_DEST_JSON="$(jq -n --arg topicArn "$TOPIC_ARN" '{
  Enabled: true,
  MatchingEventTypes: ["SEND","REJECT","BOUNCE","COMPLAINT","DELIVERY","DELIVERY_DELAY"],
  SnsDestination: {TopicArn: $topicArn}
}')"
EXISTING_DEST="$(aws sesv2 get-configuration-set-event-destinations --configuration-set-name "$CONFIG_SET" \
    --region "$REGION" --query "EventDestinations[?Name=='${EVENT_DEST_NAME}'] | [0].Name" --output text)"
if [ -n "$EXISTING_DEST" ] && [ "$EXISTING_DEST" != "None" ]; then
  echo "Event destination $EVENT_DEST_NAME already exists; updating it..."
  aws sesv2 update-configuration-set-event-destination \
    --configuration-set-name "$CONFIG_SET" --event-destination-name "$EVENT_DEST_NAME" \
    --event-destination "$EVENT_DEST_JSON" --region "$REGION"
else
  echo "Creating event destination $EVENT_DEST_NAME..."
  aws sesv2 create-configuration-set-event-destination \
    --configuration-set-name "$CONFIG_SET" --event-destination-name "$EVENT_DEST_NAME" \
    --event-destination "$EVENT_DEST_JSON" --region "$REGION"
fi

echo ""
echo "== Done. =="
echo "Configuration set: $CONFIG_SET"
echo "SNS topic:         $TOPIC_ARN"
echo "SQS queue URL:      $QUEUE_URL"
echo ""
echo "Nothing sends through this configuration set yet -- that requires the app-side"
echo "X-SES-CONFIGURATION-SET header change (SES_CONFIGURATION_SET env var) and a redeploy."
echo "To read events after a test send:"
echo "  aws sqs receive-message --queue-url '$QUEUE_URL' --region '$REGION' --max-number-of-messages 10 --wait-time-seconds 5"
