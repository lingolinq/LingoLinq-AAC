# New least-privilege AWS IAM user for Cloud Run (migration 4.E1)

The hybrid cutover keeps **S3 (uploads/static) and SES (email) on AWS**, reached from GCP Cloud Run.
Render currently authenticates to AWS as the broad `lingolinq-app` IAM user. For the GCP cutover we
mint a **new, least-privilege user** scoped to exactly the prod S3 buckets + SES send, so Render's key
can be **deactivated** after cutover and the GCP runtime never carries the broad key. Decision: Scot,
2026-06-29 (env-reconciliation plan, Group A `AWS_KEY` / `AWS_SECRET`).

- **User:** `lingolinq-cloudrun-prod`
- **Policy:** `lingolinq-cloudrun-s3-ses-policy.json` (in this dir)
- **Account:** `239044785114`
- **Region:** `us-west-2` (S3 buckets + SES are both us-west-2)
- **Buckets:** `lingolinq-prod-uploads`, `lingolinq-prod-static`

## Two-tier AWS credentials (S3/SES vs Bedrock AI)

`AWS_KEY` / `AWS_SECRET` (this Cloud Run user) are **not** Bedrock credentials. Runtime AI
(`lib/ai_client.rb`) requires a **separate** dedicated pair:

- `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET` (required for `AiClient.configured?`)
- Optional region override: `BEDROCK_AWS_REGION` (else `AWS_REGION` / `AWS_DEFAULT_REGION`)

Do **not** attach Bedrock Mantle actions to `lingolinq-cloudrun-s3-ses-policy.json`. Keep the
S3/SES principal least-privilege and mint a separate Bedrock principal (below). Mixing them
would make `configured?` true on the S3/SES key alone while AI calls still fail — or would
over-privilege the uploads principal.

## ⚠️ Scope caveat - read before cutover with real users

This policy is **S3 + SES only**, per the plan. The existing `lingolinq-app` user may also hold
**Elastic Transcoder** and **SNS** permissions (LingoLinq transcodes uploaded audio/video and receives
transcode/SES notifications via SNS - see `lib/transcoder.rb`, `app/controllers/api/callbacks`). A
strict S3+SES user will make **media transcoding and SNS callbacks fail**.

This is acceptable for the **clean-DB rehearsal** (its smoke path is login / board / S3 / SES / Resque -
no transcoding) and while prod has no real users. **Before real-user cutover**, confirm whether
transcoding is in scope and, if so, add an Elastic Transcoder + SNS statement to the policy (a
commented template is in the plan). Do not silently assume S3+SES is the full app surface.

## Create commands (run with an AWS ADMIN principal - NOT the app user)

> The `lingolinq-app` credentials used by the app have **no IAM permissions**, so these must be run
> by an admin (AWS console, or an admin CLI profile). Verified 2026-06-29: `lingolinq-app` is denied
> `iam:*`. Run from this directory so the `--policy-document file://` path resolves.

```bash
ACCOUNT=239044785114
USER=lingolinq-cloudrun-prod

# 1. Create the user (no console password, programmatic access only).
aws iam create-user --user-name "$USER" \
  --tags Key=app,Value=lingolinq Key=purpose,Value=cloudrun-s3-ses Key=env,Value=prod

# 2. Create the customer-managed policy from the JSON in this dir.
aws iam create-policy --policy-name lingolinq-cloudrun-s3-ses \
  --policy-document file://lingolinq-cloudrun-s3-ses-policy.json \
  --description "LingoLinq Cloud Run: S3 (prod uploads/static) + SES send (us-west-2) only"

# 3. Attach the policy to the user.
aws iam attach-user-policy --user-name "$USER" \
  --policy-arn "arn:aws:iam::${ACCOUNT}:policy/lingolinq-cloudrun-s3-ses"

# 4. Mint ONE access key. Capture both values from the JSON output - the secret is shown ONCE.
aws iam create-access-key --user-name "$USER"
#    -> .AccessKey.AccessKeyId      == new AWS_KEY
#    -> .AccessKey.SecretAccessKey  == new AWS_SECRET
```

## After creation - store + seed (do NOT paste secrets into the shell history)

1. Store the new key in **1Password "LingoLinq Prod"**, item **`AWS Cloud Run`**, fields `AWS_KEY`
   and `AWS_SECRET`. (Keep it OUT of the shared "LingoLinq Admin / AWS Credentials" item, which is the
   old broad key.)
2. Seed GCP Secret Manager via the app-secret seeder, which sources `AWS_KEY` / `AWS_SECRET` from that
   1Password item (Render-prod-first does NOT apply to these two - Render holds the OLD key):

   ```bash
   OP_AWS_ITEM='AWS Cloud Run' CONFIRM_SEED_SECRETS=1 ./scripts/gcp/phase4-seed-app-secrets.sh --only AWS_KEY,AWS_SECRET
   ```
3. **Smoke S3+SES** on the run.app URL before deactivating Render's key.
4. Only after a green cutover: `aws iam update-access-key --user-name lingolinq-app --access-key-id <render-key-id> --status Inactive`.

## Dedicated Bedrock Mantle IAM user (runtime AI)

Runtime AAC AI (`lib/ai_client.rb` → `Anthropic::BedrockMantleClient`) signs against the
**bedrock-mantle** service. Provision a separate IAM user in the BAA'd account
(`239044785114`) before enabling AI in Cloud Run / Render.

- **Suggested user:** `lingolinq-bedrock-runtime`
- **Policy document:** `lingolinq-bedrock-mantle-policy.json` (mirrors AWS managed
  `AmazonBedrockMantleInferenceAccess`; customer-managed copy kept in-repo for review)
- **Env vars to mount:** `BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET`, and optionally
  `BEDROCK_AWS_REGION` (otherwise `AWS_REGION`)

```bash
ACCOUNT=239044785114
USER=lingolinq-bedrock-runtime

aws iam create-user --user-name "$USER" \
  --tags Key=app,Value=lingolinq Key=purpose,Value=bedrock-runtime-ai Key=env,Value=prod

aws iam create-policy --policy-name lingolinq-bedrock-mantle \
  --policy-document file://lingolinq-bedrock-mantle-policy.json \
  --description "LingoLinq runtime AI: Bedrock Mantle inference only"

aws iam attach-user-policy --user-name "$USER" \
  --policy-arn "arn:aws:iam::${ACCOUNT}:policy/lingolinq-bedrock-mantle"

aws iam create-access-key --user-name "$USER"
#    -> .AccessKey.AccessKeyId      == BEDROCK_AWS_KEY
#    -> .AccessKey.SecretAccessKey  == BEDROCK_AWS_SECRET
```

Store both values in 1Password (prod vault, dedicated Bedrock item — not the Cloud Run S3/SES
item). Seed / mount `BEDROCK_AWS_KEY` and `BEDROCK_AWS_SECRET` on every service that runs AI
(Cloud Run `NON_BOOT_SECRETS`, Render, workers). Until both are present as a pair,
`AiClient.configured?` stays false and callers keep the existing "AI is not configured" degrade
path — by design.
