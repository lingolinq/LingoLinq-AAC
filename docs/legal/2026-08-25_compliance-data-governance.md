# LingoLinq AAC: Compliance & Data Governance

> # DRAFT - NOT YET ATTESTED
>
> **This successor carries NO attestation of its own.** It supersedes the CEO-attested repo-root
> `COMPLIANCE.md` (`DOC-9b299a785b`, ATTESTED 2026-08-04 by Scot Wahlquist, CEO), which remains
> frozen and byte-identical as the signed record. Every attestation statement reproduced below
> belongs to **predecessor versions**; none of them attests these bytes.

**Supersedes:** `COMPLIANCE.md` (`DOC-9b299a785b`), frozen at the bytes attested 2026-08-04. This dated record is the operative compliance and data-governance record from 2026-08-25 forward. Attestation state lives in `audit-reports/DOCUMENT-REGISTER.json`, which is authoritative.
**Reason for supersession:** Two sites state that the Anthropic/Bedrock runtime AI path is NOT OPERATIONAL and that `AiClient.configured?` is false. Both were overtaken 53 minutes after the moment they describe and have been wrong ever since. This record is in the `soc2-evidence` bundle, so the claim travels to auditors and prospects.

## Corrections in this successor

| # | Claim in `COMPLIANCE.md` (attested 2026-08-04) | Correction |
|---|---|---|
| 1 | Subprocessor table, Anthropic row (:130): "Runtime: **NOT OPERATIONAL as of 2026-08-04** ... **Not operational before or since**; credentials withdrawn on revision `00014-5rw`, so `AiClient.configured?` is false again", plus "Nothing egresses while the path is dormant". | "Not operational *before*" is correct. "**or since**" is false. Credentials were re-mounted on `00015-9l9` at 2026-08-04T07:25:08Z, 53 minutes after the withdrawal, and have been continuously mounted since (`docs/legal/2026-08-16_subprocessor-register.md:99,268`). `AiClient.configured?` is true and the path carries user-attributed traffic (63 of 64 `AiApiLog` rows have a `user_global_id`, :96). The "nothing egresses" sentence is withdrawn. |
| 2 | Architecture diagram status note (:182-190): "Status as of 2026-08-04: the model leg of this diagram is **NOT OPERATIONAL**. No `lingolinq-web` revision currently carries a Bedrock credential, so `AiClient.configured?` is false." | Same defect, same cause. Corrected to OPERATIONAL as of 2026-08-25, with the re-mount recorded and the non-monotonic-mount hazard named so the next reader does not repeat the inference. |
| 3 | Subprocessor table, Anthropic row: runtime learner-content egress attributed to Anthropic under the Anthropic BAA. | Wrong processor and wrong contract. `lib/ai_client.rb` sends prompts to Amazon Bedrock (`bedrock-runtime.<region>.amazonaws.com`); AWS is the receiving processor and the AWS BAA is the operative instrument (`docs/legal/2026-08-16_subprocessor-register.md:5,96,99`). Bedrock is now its own AWS row; Anthropic is retained as the model provider only. |

> **Direction of error.** The operational-status corrections move the record from "no AI egress" to "live, user-attributed AI egress". That is the direction that matters for a document offered as SOC 2 evidence and to school and hospital prospects: the predecessor understated the data flow rather than overstating it. The processor-boundary correction (row 3) does not change volume; it names AWS rather than Anthropic as the party that receives the prompts.

> **Governance note for the attester.** Path A leaves the repo-root `COMPLIANCE.md` frozen with the false claim and no in-file pointer, because its bytes are pinned by `attestedContentHash`. That file sits at the root of a **public AGPLv3 repository**, so a reader who never opens the register still sees the superseded claim. If that is unacceptable, the alternative is Path B (re-pin: correct `COMPLIANCE.md` in place and re-attest it), which only Scot can authorise. This successor is drafted so its corrected text can serve either path.

**Last updated:** 2026-07-23
**Owner:** Scott W.
**Review cycle:** Annual (next review: 2027-02-21)
**Attested:** 2026-07-06; re-attested 2026-07-23 by Scot Wahlquist, CEO. The 2026-07-06 attestation
covered an earlier revision: PRs #622, #631, and #652 recorded the GCP and Anthropic agreements and
the cutover posture after it. The header date above had also drifted behind the revision history in
section 13.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Regulatory Scope](#2-regulatory-scope)
3. [Data Classification Zones](#3-data-classification-zones)
4. [External Service Data Flow Map](#4-external-service-data-flow-map)
5. [MCP Security Matrix](#5-mcp-security-matrix)
6. [De-Identification Strategy](#6-de-identification-strategy)
7. [AI Feature Compliance Rules](#7-ai-feature-compliance-rules)
8. [AI Platform Rules](#8-ai-platform-rules)
9. [MCP Gateway Plan](#9-mcp-gateway-plan)
10. [Incident Response](#10-incident-response)
11. [Audit Schedule](#11-audit-schedule)
12. [Accepted Risks & Vulnerability Management](#12-accepted-risks--vulnerability-management)
13. [Revision History](#13-revision-history)

---

## 1. Overview

LingoLinq is an Augmentative and Alternative Communication (AAC) application. It is sold to **schools** (subject to FERPA) and **hospitals** (HIPAA readiness required). Despite serving these regulated environments, the actual PII exposure within LingoLinq is minimal:

- Family names on communication boards
- Opt-in usage reports (anonymized by default)
- Opt-in content-based word prediction (de-identified before any ML processing)
- SSO identity data (managed by the identity provider; LingoLinq stores only opaque tokens and display names)

**Core principle: AI requests are scrubbed of known direct user identifiers before egress.** Before any AI API call, the Rails backend strips known direct identifiers (names, emails, SSO subject IDs) and replaces user references with opaque tokens, so AI features operate on scrubbed data rather than user identities. The `lib/pii_scrubber.rb` layer is the single enforcement point. De-identified user-authored content (for example board labels and sentences) is still sent to the model; free-text is scrubbed of known direct identifiers and name patterns on a best-effort basis, so this is a strong de-identification safeguard, not a guarantee and not a claim that no user-authored text ever reaches a model.

> **GDPR classification (aligns with `docs/legal/SUBPROCESSORS.md`).** "De-identification" here names the *technique* — stripping known direct identifiers before egress. The *output* is classified as **pseudonymized personal data** under GDPR Art. 4(5), not anonymous or out-of-scope data: because the scrubber removes only *known* direct identifiers (a best-effort safeguard, not a guarantee) and user-authored content still reaches the model, all processor obligations continue to apply. The Subprocessor Register is the authoritative statement of this classification; where this document says "de-identified content," read it as this pseudonymized-personal-data standard.

---

## 2. Regulatory Scope

### FERPA (Family Educational Rights and Privacy Act)

Applies when LingoLinq is deployed by a school or district. LingoLinq acts as a "school official" under a data-sharing agreement with the district. Key obligations:

- Student education records must not be disclosed without consent.
- The district (not LingoLinq) owns the data.
- LingoLinq must use data only for the purpose the district authorized.
- Breach notification within **45 days**.

### HIPAA (Health Insurance Portability and Accountability Act)

Applies when LingoLinq is deployed in a clinical or hospital setting. LingoLinq acts as a Business Associate. Key obligations:

- Protected Health Information (PHI) must be safeguarded at rest and in transit.
- Business Associate Agreements (BAAs) are required with all subprocessors that touch PHI.
- Breach notification within **60 days**.
- Minimum necessary standard: only access the PHI needed for the specific function.

### COPPA (Children's Online Privacy Protection Act)

May apply when users are children under 13. LingoLinq relies on school/parent consent obtained by the deploying institution. LingoLinq does not collect data directly from children outside of the institutional relationship.

### PCI-DSS

Payment card data is handled entirely by Stripe. LingoLinq never sees, stores, or processes raw card numbers. Stripe's PCI-DSS Level 1 certification covers this.

---

## 3. Data Classification Zones

All systems, services, and tools used in LingoLinq development and operations are classified into three zones based on their potential exposure to user data.

### SAFE ZONE: No User Data

These tools and services never contain, process, or have access to user data. They operate exclusively on source code, public information, or developer-only content.

| Service / Tool         | Purpose                        | Why It Is Safe                                      |
|------------------------|--------------------------------|-----------------------------------------------------|
| GitHub                 | Source code repository         | Code only; no user data in repos                    |
| Render (status/deploy) | Hosting management dashboard   | Infrastructure metadata only                        |
| DeepWiki               | Documentation research         | Public/open-source docs only                        |
| Perplexity             | Web research                   | Public web search; no user data submitted            |
| Sequential-thinking    | Structured reasoning (MCP)     | Processes developer reasoning; no data input         |
| Filesystem (local)     | Source code on dev machine      | Developer machine; contains code, not user data      |
| Mermaid Chart           | Diagram rendering              | Diagram syntax only                                 |
| Chrome DevTools        | Browser debugging              | Used against local dev environment only              |
| Jotform                | Form building                  | Marketing/feedback forms; no user data collected     |

### CAUTION ZONE: May Contain PII in Context

These services are used for business operations and may contain business contact information (names, emails of school administrators, sales contacts). They must **never** be used to store student, patient, or end-user data.

| Service / Tool | Purpose               | Risk                                              | Mitigation                                         |
|----------------|------------------------|---------------------------------------------------|---------------------------------------------------|
| Notion         | Project management     | Could accidentally receive user data in notes     | Policy: NEVER paste user data into Notion          |
| HubSpot        | Sales CRM              | Contains business contacts (admins, purchasers)   | Business contacts only; no student/patient data    |
| Stripe         | Payment processing     | Payment data for institutional buyers             | PCI-DSS handled by Stripe; we never see card data  |
| n8n            | Workflow automation    | Workflows could be configured to move user data   | Self-hosted on Render; workflows reviewed in audit  |
| Slack          | Team communication     | Screenshots or pastes could contain user data     | Policy: NEVER paste user data into Slack           |

### RESTRICTED ZONE: Contains FERPA/HIPAA-Protected Data

These systems store or process actual user data. They require the highest level of protection, access control, and (where applicable) BAAs.

| Service / Tool             | Purpose                    | Data Contained                                     | Protection Required                                |
|---------------------------|----------------------------|---------------------------------------------------|---------------------------------------------------|
| Cloud SQL PostgreSQL (GCP) | Primary user data store    | User accounts, board content, usage logs, SSO data | GCP BAA/CDPA/SCCs accepted; private IP; encryption at rest and in transit |
| AWS S3                     | User-uploaded content      | Images, custom symbols, board exports              | BAA with AWS; bucket policies; encryption (AES-256) |
| Memorystore Redis (GCP)    | Cached user session data, Resque queues | Session tokens, cached board data, rate-limit keys, job payloads | GCP BAA/CDPA/SCCs accepted; TLS; no persistent PII; TTL on all keys |
| Render fallback            | Write-frozen rollback copy pending decommission | Frozen production database copy, logs, environment | Render DPA; retained only as rollback fallback until explicit teardown |

---

## 4. External Service Data Flow Map

This table maps every external service to the data it receives, its BAA status, and required actions.

| Service              | What Data Does It Receive?                          | BAA Status                  | Action Required                                |
|----------------------|-----------------------------------------------------|-----------------------------|------------------------------------------------|
| **Render.com**       | Superseded primary host; retained temporarily as write-frozen rollback fallback pending decommission | **DPA signed; BAA pending** | No new production traffic should rely on Render. Keep listed until the fallback database/services are deleted or restricted. Do not onboard hospital tenants that would depend on the Render fallback. |
| **AWS S3**           | User-uploaded images, symbols, board exports        | **BAA SIGNED (2026-02-07)** | Accepted on AWS account 2390-4478-5114 via AWS Artifact. See `docs/legal/AWS_BAA_ACCEPTED.md` and `docs/legal/AWS_BAA_2026-02.pdf`. HIPAA-eligible services only; bucket encryption enforced. |
| **AWS (Amazon Bedrock)** | **Receiving processor for runtime AI.** `lib/ai_client.rb` sends scrubbed prompts to `bedrock-runtime.<region>.amazonaws.com` over SigV4. Last verified operational on serving revision `lingolinq-web-00020-per` (swept 2026-08-16): 63 of 64 `AiApiLog` rows carry a `user_global_id` (57 `word_prediction`, 7 `board_generation`). No later revision has been checked. Eval narration is not operational on the classic plane. See `docs/legal/2026-08-16_subprocessor-register.md:5,96,99`. | **BAA SIGNED (2026-02-07)** | Amazon Bedrock is a HIPAA-eligible service under the AWS account BAA (`docs/legal/AWS_BAA_ACCEPTED.md`). This is the **operative instrument** for runtime AI egress, not the Anthropic BAA. |
| **Google Cloud Platform** (Cloud Run / Cloud SQL / Memorystore) | Live production hosting for `app.lingolinq.com` as of the 2026-07-22 Gate 1 cutover | **BAA ACCEPTED (console, 2026-07-12)** | Google Cloud HIPAA BAA + Cloud Data Processing Addendum accepted 2026-07-12, SCCs certified 2026-07-14, on project `lingolinq-prod` (formalizes the org-wide Google BAA of 2026-06-08). Console acceptance, no countersigned PDF; recorded in `docs/legal/GCP_BAA_ACCEPTED.md`. PHI permitted under BAA terms, which are necessary but not sufficient: HIPAA-eligible services only, encryption in transit and at rest, access controls, minimum necessary; private VPC additionally. Infrastructure BAA only; does NOT cover the AWS Bedrock AI-egress path. No Google inference path is live (the Vertex/Gemini fallback was disabled 2026-07-09 PR #570); any future Vertex AI or Gemini inference path needs per-product HIPAA covered-service verification before child data. |
| **Anthropic, PBC (model provider, not the receiving processor)** | Claude weights served by Amazon Bedrock. Runtime prompts are received by **AWS**, not by Anthropic: `lib/ai_client.rb` calls `bedrock-runtime.<region>.amazonaws.com` over SigV4 (`docs/legal/2026-08-16_subprocessor-register.md:5,96,99`). The direct `api.anthropic.com` route was removed by PR #681 and is CI-enforced. Anthropic is retained as the model provider and as the still-available direct-path basis. Do not read this row as learner-content egress to Anthropic. | **HIPAA-Ready BAA SIGNED + readiness enabled (2026-07-18)** | Direct-path basis if the commercial API were re-enabled. **Not the operative instrument for the current runtime path**; the AWS BAA is. Record runtime egress against the AWS Bedrock row above. See `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`. |
| **Google (Gemini)**  | **Runtime fallback DISABLED 2026-07-09** (PR #570); no active runtime data flow today. Dev-time code assistance only. | N/A (no active runtime flow) | If reactivated (e.g. via a Google Cloud covered-service path such as Vertex AI), verify the specific product's HIPAA covered-service status and re-review data-handling terms before any child data; tracked as `rev-gemini-baa-annual`. See `SUBPROCESSORS.md` row 5. |
| **HubSpot**          | Business contacts: admin names, school/hospital emails, deal info | No BAA needed | Business contacts only; never student/patient data |
| **Stripe**           | Institutional payment data (org name, billing email, card via Stripe.js) | N/A: PCI-DSS handled by Stripe | LingoLinq never handles raw card data; Stripe is PCI Level 1 |
| **Notion**           | Project plans, specs, internal notes                | No BAA needed               | Policy: NEVER put user/student/patient data in Notion |
| **n8n (self-hosted)**| Workflow definitions; data depends on workflow config | N/A: self-hosted on Render | Internal automation; no customer data by policy; audit workflows quarterly |
| **Slack**            | Team chat, notifications                            | No BAA needed               | Policy: NEVER paste user data; use DM links to Rails admin instead |
| **GitHub**           | Source code, issues, PRs                            | No BAA needed               | No user data in repos; .gitignore enforced for data files |
| **Perplexity**       | Web search queries (research only)                  | No BAA needed               | Never submit user data as search queries        |
| **DeepWiki**         | Documentation queries                               | No BAA needed               | Public documentation only                       |
| **Genspark**         | Research queries                                    | No BAA needed               | Never submit student/patient data               |
| **Manus**            | Browser automation tasks                            | No BAA needed               | NEVER automate authenticated LingoLinq sessions  |

---

## 5. MCP Security Matrix

This table covers every MCP (Model Context Protocol) server used in the development environment, mapping each to its data sensitivity, compliance impact, execution environment, and BAA requirements.

| MCP Server             | Data Sensitivity | What It Accesses                  | Compliance Impact | Where It Runs   | BAA Required? | Notes                                      |
|------------------------|-----------------|-----------------------------------|-------------------|-----------------|--------------|---------------------------------------------|
| **GitHub**             | None            | Source code, issues, PRs          | None              | GitHub API      | No           | No user data in repos                       |
| **Render**             | Low             | Deploy status, service metadata   | Indirect (fallback still holds frozen data) | Render API    | DPA / fallback only | MCP sees infra metadata only; do not unfreeze or decommission without explicit go |
| **Notion**             | Low             | Project pages, task databases     | None if policy followed | Notion API | No           | NEVER store user data in Notion             |
| **n8n**                | Medium          | Workflow definitions, execution logs | Medium          | Self-hosted (Render) | Covered by the Render **DPA** (no Render BAA exists; BAA remains pending, see section 4) | Audit workflow configs quarterly; no customer data by policy |
| **Filesystem**         | None            | Local source code files           | None              | Local machine   | No           | Dev machine only; no user data on disk      |
| **Sequential-thinking**| None            | Developer reasoning chains        | None              | Local process   | No           | No external data sent                       |
| **Perplexity**         | None            | Web search results                | None              | Perplexity API  | No           | Never search for user-specific info         |
| **DeepWiki**           | None            | Open-source documentation         | None              | DeepWiki API    | No           | Public docs only                            |
| **Chrome DevTools**    | Low             | Local dev browser state           | None              | Local browser   | No           | Dev environment only; never prod sessions   |
| **Mermaid Chart**      | None            | Diagram markup                    | None              | Mermaid API     | No           | Diagram syntax only                         |
| **Jotform**            | None            | Form definitions                  | None              | Jotform API     | No           | Marketing/feedback forms only               |
| **Slack**              | Low             | Channel messages, notifications   | Low               | Slack API       | No           | Policy: no user data in Slack               |

**Key rule:** No MCP server is ever pointed at the production database. All MCPs that need database access use the development database populated with seed/test data only.

---

## 6. De-Identification Strategy

### Architecture Overview

```
User Device  -->  Rails Backend  -->  [PII Scrubber]  -->  Anthropic Claude (AWS Bedrock)
                      |                                         |
                      |                                    Pseudonymized
                      |                                    data only
                      v
              PostgreSQL (user data)
              S3 (user uploads)
```

**Status as of 2026-08-25: the model leg of this diagram is OPERATIONAL.** **CORRECTED 2026-08-25**; this paragraph previously read "Status as of 2026-08-04 ... is NOT OPERATIONAL", and continued that no `lingolinq-web`
revision carried a Bedrock credential and that `AiClient.configured?` was false. Credentials were re-mounted on revision `00015-9l9` at
operational for one window, 2026-08-03T08:23Z to 2026-08-04T06:31Z (revision `00013-76w`), during
which a single internal verification call was made and logged; credentials were withdrawn on
revision `00014-5rw`, and re-mounted 53 minutes later on `00015-9l9` at 2026-08-04T07:25:08Z, continuously mounted since (`docs/legal/2026-08-16_subprocessor-register.md:99,268`). Revision credential mounts are **not monotonic**: reading one revision does not establish the next. Scoping note: `AiApiLog` records the three logged runtime seams
(`ai_word_predictor`, `ai_board_generator`, `eval_narrator`), so a zero-row or single-row result
establishes that no *logged seam call completed*, which is narrower than "nothing egressed." The
Google Gemini leg was removed entirely on 2026-07-09 (PR #570) and is no longer part of this
architecture. The diagram describes the designated flow, not current traffic. See the 2026-08-04
operational-status correction in `docs/legal/AWS_BAA_ACCEPTED.md`.

### The Single Enforcement Point

All data leaving the Rails application passes through a centralized de-identification layer:

**`lib/pii_scrubber.rb`**: the single enforcement point for PII removal.

This module is responsible for:

1. **Stripping direct identifiers**: Removes names, emails, SSO subject IDs, and any other directly identifying fields before data is sent to any AI API.
2. **Replacing with fixed placeholders**: Where context requires a notion of "this user" vs. "that user" (e.g., for usage-pattern analysis), the scrubber replaces identity references with fixed non-identifying placeholders (e.g., `[REDACTED_ID]`, and `[PERSON_1]`/`[PERSON_2]` where two people must be distinguished) — not reversible tokens or hashes.
3. **Scrubbing board content**: Family names that appear in board labels or custom vocabulary are detected and replaced with generic placeholders (e.g., "[FAMILY_NAME]") before any content-based prediction request.
4. **Audit logging**: Every scrub operation is logged (what was removed, which AI API call it was for, timestamp) without recording the original PII values.

### What Each Layer Sees

| Layer                        | Sees Real User Data? | Sees De-Identified Data? | Notes                                    |
|------------------------------|---------------------|--------------------------|------------------------------------------|
| Rails application            | Yes                 | N/A                      | Primary application; handles all user data |
| PostgreSQL / Redis / S3      | Yes                 | N/A                      | Storage layer; encrypted at rest          |
| AI APIs (AWS Bedrock, serving Claude) | No direct identifiers | Last verified operational on `lingolinq-web-00020-per` (swept 2026-08-16); later revisions unchecked | Receives pseudonymized personal data (still in GDPR scope): direct identifiers stripped before egress. The receiving processor is **AWS**, not Anthropic. The Google Gemini runtime path was removed 2026-07-09 (PR #570). See the Subprocessor Register. |
| MCPs (dev environment)       | **NEVER** (prod)    | Yes (dev/seed data)      | MCPs only connect to dev DB with test data |
| Notion / HubSpot / Slack     | **NEVER**           | No                       | Business operations only                  |

### Dev vs. Production Data Flow

- **Development:** MCPs and AI coding assistants interact with a dev database containing **seed data only** (fictional users, synthetic boards). No real user data ever exists in the dev environment.
- **Production:** All user data flows exclusively through the Rails application. The `pii_scrubber.rb` module intercepts any outbound AI API call and strips PII before the request leaves the server. There is no path for production user data to reach an AI API without passing through the scrubber.

### Opt-In AI Features

All AI-powered features that analyze user behavior or content are:

1. **Off by default**: Every AI feature is behind a feature flag.
2. **Opt-in at the organization level**: A school district or hospital must explicitly enable each AI feature.
3. **Explained in plain language**: The opt-in screen describes what data is used, how it is de-identified, and what the feature does.
4. **Reversible**: Disabling a feature purges any cached de-identified data associated with that organization.

---

## 7. AI Feature Compliance Rules

These rules are **non-negotiable**. Any violation is treated as a security incident.

### NEVER Rules

| #  | Rule                                                              | Rationale                                                        |
|----|-------------------------------------------------------------------|------------------------------------------------------------------|
| N1 | **NEVER** send user-identifiable data to any AI API.              | Core privacy control (best-effort). PII scrubber must intercept all AI calls. |
| N2 | **NEVER** route user data through non-BAA'd services.             | HIPAA/FERPA require subprocessor agreements for PHI/education records. |
| N3 | **NEVER** store user data in Notion, HubSpot, or Slack.           | These are business tools without BAAs; user data must stay in the protected stack. |
| N4 | **NEVER** point any MCP at a production database.                 | MCPs are developer tools; production data access is through Rails only. |
| N5 | **NEVER** use real user data in development or testing.            | Dev/test environments use seed data exclusively.                  |
| N6 | **NEVER** log the original PII values that were scrubbed.          | Audit logs record that scrubbing occurred, not what was removed.  |

### ALWAYS Rules

| #  | Rule                                                              | Rationale                                                        |
|----|-------------------------------------------------------------------|------------------------------------------------------------------|
| A1 | **ALWAYS** put AI features behind feature flags with org-level opt-out. | Schools/hospitals must control what AI features are active for their users. |
| A2 | **ALWAYS** log AI API calls via the `AiApiLog` model.             | Full audit trail: timestamp, feature, de-identified payload hash, response status. |
| A3 | **ALWAYS** execute BAAs with active infrastructure subprocessors before handling HIPAA data. | AWS BAA signed 2026-02-07 (see `docs/legal/`). GCP HIPAA BAA + CDPA accepted in-console 2026-07-12, SCCs 2026-07-14, on project `lingolinq-prod` (live Cloud Run / Cloud SQL / Memorystore hosting as of 2026-07-22; PHI permitted under BAA terms, necessary but not sufficient; see `docs/legal/GCP_BAA_ACCEPTED.md`). Render remains only as a write-frozen fallback pending decommission; do not onboard hospital tenants that would depend on Render until a Render BAA exists or Render is fully removed from the hosting path. |
| A4 | **ALWAYS** encrypt user data at rest (AES-256) and in transit (TLS 1.2+). | Baseline security requirement for both FERPA and HIPAA.          |
| A5 | **ALWAYS** review AI feature data flows before launching a new AI capability. | Every new AI feature must be documented here with its data flow. |
| A6 | **ALWAYS** use the `pii_scrubber.rb` module for any new AI integration. | No ad-hoc scrubbing; everything goes through the single enforcement point. |

---

## 8. AI Platform Rules

Each AI platform used in LingoLinq development or research has specific guardrails.

### Claude Code (Anthropic): Primary Development Tool

- **Role:** Primary AI coding assistant for all development work.
- **MCP access:** All local MCPs (GitHub, Render, Notion, n8n, Filesystem, Sequential-thinking, Perplexity, DeepWiki, Chrome DevTools, Mermaid Chart, Jotform, Slack).
- **Data rule:** Developer queries and source code only. NEVER paste user data into prompts.
- **Plan:** Anthropic Max plan. No BAA needed because no user data is ever sent.
- **Database access:** Dev database only (via MCPs connected to dev environment).

### Gemini CLI (Google): Secondary Development Tool

- **Role:** Secondary AI coding assistant; used for the same development tasks as Claude Code.
- **MCP access:** Same MCP set as Claude Code for development purposes.
- **Data rule:** NEVER send user data. Same restrictions as Claude Code.
- **Database access:** Dev database only.

### Genspark: Research

- **Role:** Research tool for exploring AAC domain, competitor analysis, regulatory guidance.
- **Data rule:** Research queries only. NEVER submit student names, patient information, or any data from the LingoLinq user database.
- **Access:** Web-based; no MCP integration; no access to any LingoLinq system.

### Manus: Browser Automation

- **Role:** Browser automation for testing and research tasks.
- **Data rule:** NEVER automate authenticated LingoLinq sessions (dev or production). NEVER interact with pages that display user data.
- **Permitted use:** Automating public web research, testing public-facing marketing pages, generating screenshots of competitor products.

### Perplexity: Web Research (MCP-Integrated)

- **Role:** Web research via MCP integration.
- **Data rule:** No user data in search queries. Queries must be about technology, AAC practices, compliance requirements, or general research topics.
- **MCP status:** Already integrated as an MCP server.

---

## 9. MCP Gateway Plan

### Current State: No Gateway Needed

As of this writing, no MCP gateway is required because:

- All MCPs run locally in the developer environment.
- MCPs connect only to the development database (seed/test data).
- There is a single developer (the owner) using the MCP setup.
- No MCP has access to production data.

### When to Add a Gateway

A gateway becomes necessary when any of the following conditions are met:

| Trigger                                          | Why a Gateway Is Needed                                        |
|-------------------------------------------------|----------------------------------------------------------------|
| A production database MCP is created             | Must enforce row-level filtering, query auditing, and PII scrubbing at the gateway level |
| A school district auditor requests proof of access controls | Gateway provides auditable access logs and policy enforcement  |
| Additional developers are hired who need staging/dev database access | Gateway enforces per-developer permissions and query logging  |
| A CI/CD pipeline needs MCP access for automated testing | Gateway controls what the pipeline can access and logs all queries |

### Future Gateway Options

When the time comes, evaluate these options:

| Gateway              | Key Feature            | Best For                                   | Status (as of 2026-02) |
|----------------------|-----------------------|--------------------------------------------|------------------------|
| **Lasso Gateway**    | Policy-based filtering | General MCP access control                 | Available now          |
| **MintMCP**          | SOC 2 certified       | When a district requires SOC 2 from all subprocessors | Available now   |
| **Lunar Gateway**    | Zero-trust architecture | High-security deployments (hospitals, large districts) | Evaluate when needed |

### Gateway Implementation Checklist (for when the time comes)

- [ ] Select gateway based on triggering requirement.
- [ ] Configure gateway to sit between MCP clients and any data-containing service.
- [ ] Implement query allow-listing (only permitted query patterns pass through).
- [ ] Enable full query logging with tamper-evident audit trail.
- [ ] Integrate PII detection at the gateway layer as a second line of defense (behind `pii_scrubber.rb`).
- [ ] Load-test to ensure gateway does not introduce unacceptable latency.
- [ ] Document gateway configuration in this file.

---

## 10. Incident Response

### Scope

This section covers incidents where user data (FERPA-protected education records or HIPAA-protected health information) may have been exposed through or to an AI system, MCP, or non-BAA'd service.

### Severity Levels

| Level      | Description                                                      | Example                                              |
|------------|------------------------------------------------------------------|------------------------------------------------------|
| **SEV-1**  | Confirmed exposure of user data to an external AI API or non-BAA'd service | PII scrubber bypassed; real names sent to Anthropic API |
| **SEV-2**  | User data found in a system where it should not exist            | Student name discovered in a Notion page              |
| **SEV-3**  | Potential exposure; no confirmation of actual data leak           | MCP misconfigured to point at staging DB with partial real data |

### Incident Response Steps

#### 1. Contain (0-4 hours)

- [ ] Identify the affected system(s) and data type(s).
- [ ] Revoke access / disable the misconfigured MCP / feature flag.
- [ ] Preserve logs (do NOT delete anything; copy to a secure incident folder).
- [ ] If an AI API received PII: contact the provider's trust/security team to request data deletion.

#### 2. Assess (4-24 hours)

- [ ] Determine the scope: how many users, which organizations, what data fields.
- [ ] Determine the cause: code bug, configuration error, human error, or malicious action.
- [ ] Determine if the data was actually processed/stored by the external service or only transmitted.
- [ ] Review `AiApiLog` records for the affected time period.

#### 3. Notify (per regulatory timelines)

**FERPA (school deployments):**
- Notify the affected school district within **45 days** of discovering the breach.
- Provide: description of the incident, data involved, steps taken, remediation plan.
- The district is responsible for notifying parents/students per their own policies.

**HIPAA (hospital deployments):**
- Notify the affected covered entity (hospital) within **60 days** of discovering the breach.
- If the breach affects 500+ individuals: also notify HHS and prominent media outlets in the affected state.
- Provide: description, data involved, steps individuals should take, what LingoLinq is doing to mitigate.

**State breach notification laws:**
- Review and comply with the breach notification laws of every state where affected users reside.
- Many states have shorter timelines than FERPA/HIPAA (e.g., 30 days). The shortest applicable deadline governs.

#### 4. Remediate (1-2 weeks)

- [ ] Fix the root cause (code patch, configuration change, policy update).
- [ ] Verify the fix with testing.
- [ ] Update this compliance document if the incident revealed a gap.
- [ ] Conduct a post-incident review and document lessons learned.

#### 5. Post-Incident Review (within 30 days)

- [ ] Write an internal post-mortem: timeline, root cause, impact, remediation.
- [ ] Identify systemic improvements (e.g., additional automated PII detection, new tests).
- [ ] Update the audit schedule if warranted.
- [ ] Brief all team members on the incident and changes.

### Incident Response Template

```
INCIDENT REPORT -- LingoLinq AAC
=================================
Date discovered:
Reported by:
Severity: SEV-1 / SEV-2 / SEV-3

DESCRIPTION
What happened:

SCOPE
Users affected:
Organizations affected:
Data fields exposed:
Systems involved:

TIMELINE
[timestamp] -- Event occurred
[timestamp] -- Event discovered
[timestamp] -- Containment actions taken
[timestamp] -- Assessment completed
[timestamp] -- Notifications sent
[timestamp] -- Remediation deployed

ROOT CAUSE
[Describe the technical or procedural root cause]

REMEDIATION
Immediate fix:
Long-term fix:

NOTIFICATIONS
FERPA districts notified (Y/N, date):
HIPAA covered entities notified (Y/N, date):
State notifications required (Y/N, states, dates):

POST-MORTEM
Lessons learned:
Process changes:
Document updates:
```

---

## 11. Audit Schedule

### Annual Compliance Audit

Performed every February (aligned with this document's creation date).

| Audit Item                                      | What to Check                                                   | Owner   |
|------------------------------------------------|----------------------------------------------------------------|---------|
| MCP connections inventory                       | Verify all MCPs are documented here; remove any that are no longer used | Scott W. |
| MCP data access review                          | Confirm no MCP points at production data                        | Scott W. |
| BAA status for Render and AWS                   | Confirm BAAs are current and not expired                        | Scott W. |
| External service data flow review               | Walk through Section 4 table; verify accuracy                   | Scott W. |
| `pii_scrubber.rb` effectiveness test            | Run test suite that attempts to send PII through AI features; verify scrubbing | Scott W. |
| `AiApiLog` review                               | Sample AI API logs to verify no PII leakage                     | Scott W. |
| Feature flag audit                              | Verify all AI features are behind flags; verify org opt-out works | Scott W. |
| Notion / HubSpot / Slack spot check             | Search these platforms for any accidentally stored user data     | Scott W. |
| n8n workflow review                             | Review all active workflows for data handling compliance         | Scott W. |
| Seed data review                                | Verify dev/test databases contain only synthetic data            | Scott W. |
| Encryption verification                         | Confirm encryption at rest (DB, S3) and in transit (TLS)        | Scott W. |
| Incident response drill                         | Tabletop exercise: simulate a SEV-2 and walk through the response plan | Scott W. |

### Quarterly Quick Checks

Lighter-weight checks performed every quarter (May, August, November, February):

- [ ] Verify no new MCPs have been added without documentation.
- [ ] Verify BAA status has not lapsed.
- [ ] Review any new AI features added in the quarter for compliance.
- [ ] Check `AiApiLog` for anomalies (unexpected volume, unexpected endpoints).

### Triggered Reviews

Perform an immediate review when:

- A new MCP server is added to the development environment.
- A new AI feature is developed or shipped.
- A new external service is integrated.
- A new developer joins the team.
- A school district or hospital raises a compliance question during sales.
- Any incident (SEV-1, SEV-2, or SEV-3) occurs.

---

## 12. Accepted Risks & Vulnerability Management

### Ember 3.28 Frontend Framework — Accepted Risk

**Status:** Accepted
**Date accepted:** 2026-02-23
**Owner:** Scott W.
**Review trigger:** If migration timeline slips past Q3 2026 or a runtime CVE is discovered in ember-source 3.28

**Background:** Ember 3.28 is the last 3.x LTS release and is end-of-life for official upstream support. Automated dependency scans report ~180 npm vulnerabilities in the Ember 3.28 dependency tree.

**Why we are accepting this risk:**

1. **Nearly all vulnerabilities are in build-time tooling, not production runtime code.** The vulnerable packages (babel-traverse, broccoli plugins, ansi-html, webpack-dev-server internals, ember-cli internals) run during `ember build` on the developer's machine and CI server. They are not included in the compiled JavaScript bundle that ships to users' browsers.

2. **The production-facing packages are stable.** `ember-source 3.28`, `ember-data 3.28`, and `jQuery 3.7.1` (the code that actually runs in the browser) have no known exploitable CVEs.

3. **Upgrading to Ember 5.x would be significant throwaway work.** The migration path from 3.28 to 5.x requires rewriting components (Glimmer), adopting tracked properties, and updating route patterns. We are migrating to React incrementally, so investing weeks in an Ember major upgrade provides temporary vulnerability-count reduction that would be discarded during the React migration.

4. **The React migration is the real fix.** As each feature area is migrated from Ember to React, the corresponding Ember build dependencies are removed. This is a permanent solution vs. a temporary framework upgrade.

**Mitigations in place:**

| Mitigation | Status |
|-----------|--------|
| Removed `ember-cli-update` from dependencies (eliminated 6 critical transitive CVEs) | Done (2026-02-22) |
| Pinned lodash to `^4.17.21` (patched 5 prototype pollution CVEs) | Done (2026-02-22) |
| Automated security scanning via `security-hotfix` skill (run before deploys) | Done (2026-02-22) |
| React migration plan in progress — incremental, feature-by-feature | In progress |
| Build pipeline runs in isolated CI environment, not on user-facing servers | Already in place |
| Content Security Policy (CSP) report-only headers monitor browser script/content policy violations | Report-only headers configured; violation reports collected at `/api/v1/csp-reports` before enforcement |

**What would change this assessment:**
- A CVE is discovered in `ember-source 3.28` or `ember-data 3.28` (the runtime packages) — would trigger an emergency patch or accelerated migration of affected features.
- A SOC2 auditor specifically requires zero high/critical findings in npm audit — would trigger a conversation about build-time vs. runtime scope with the auditor. If they insist, we would evaluate Embroider (Ember's build system) as a lighter-weight path to resolve build-time dependency issues without a full framework upgrade.
- The React migration timeline slips significantly — would re-evaluate upgrading to Ember 5.x as an interim measure.

### Security Hotfix — Remediated (2026-02-22)

The following critical and high-severity vulnerabilities were remediated on 2026-02-22:

| Finding | What | Status |
|---------|------|--------|
| nokogiri 1.19.0 (CVE-2025-30206) | SAML authentication bypass via XML C14N failure | **Fixed** — updated to 1.19.1 |
| SSL verification disabled (11 locations) | `ssl_verifypeer: false` on all OpenSymbols/Pixabay API calls | **Fixed** — removed from 4 production files + 5 spec files |
| Giphy API over plaintext HTTP | API key and search queries sent unencrypted | **Fixed** — switched to HTTPS |
| lodash `>=4.17.11` (5 CVEs) | Prototype pollution vulnerabilities | **Fixed** — pinned to `^4.17.21` |
| ember-cli-update in dependencies (6 critical transitive CVEs) | OS command injection, prototype pollution in transitive deps | **Fixed** — removed from dependencies |

Full scan report: `audit-reports/security-hotfix-2026-02-22.md`

### Remaining Remediation Backlog

| Priority | Item | Risk if deferred | Target |
|----------|------|-----------------|--------|
| High | Remove coffee-rails (abandoned since 2017) | No security patches for build tool | Q1 2026 |
| High | Replace sassc-rails with dartsass-rails (archived Oct 2025) | No security patches for build tool | Q1 2026 |
| High | Replace legacy `s3` gem with `aws-sdk-s3` | Unmaintained dependency | Q1 2026 |
| Medium | Add `sslmode=require` to PostgreSQL connection | DB traffic could theoretically be unencrypted | Q1 2026 |
| Medium | Validate `LLWEBSOCKET_URL` for `wss://` protocol | Misconfiguration could expose WebSocket traffic | Q1 2026 |
| Medium | Require `https://` for webhook callbacks | Webhook payloads could be sent over HTTP | Q1 2026 |
| Low | Audit CoughDrop-era gems (go_secure, permissable-coughdrop, boy_band) | Limited community security review | Q2 2026 |
| Ongoing | Ember → React incremental migration | Resolves ~180 build-time npm vulnerabilities permanently | 2026 |

---

## 13. Revision History

| Date       | Author   | Change                                              |
|------------|----------|-----------------------------------------------------|
| 2026-07-16 | Scott W. | Record GCP HIPAA BAA + CDPA accepted 2026-07-12 and SCCs certified 2026-07-14 on project `lingolinq-prod` (formalizes the org-wide Google BAA of 2026-06-08); add a Google Cloud Platform row to the §4 external service data-flow map; update action A3; note PHI permitted on GCP under BAA terms and that GCP becomes an active subprocessor at cutover. Infrastructure BAA only; excludes the Anthropic AI-egress path. Also corrected the §4 Anthropic and Gemini rows to reflect real runtime AI egress (scrubbed prompts to Anthropic Haiku 4.5 / Opus 4.7; Gemini runtime fallback disabled 2026-07-09) instead of the stale "dev use only" wording. |
| 2026-07-22 | Scott W. | Record Gate 1 DNS cutover: `app.lingolinq.com` now live on GCP Cloud Run / Cloud SQL / Memorystore. Render is superseded as the primary host and retained only as a write-frozen rollback fallback pending decommission. |
| 2026-07-06 | Scott W. | Add GDPR classification note to §6: AI-egress "de-identification" output is pseudonymized personal data (Art. 4(5)), still in scope — aligns with the corrected Subprocessor Register (PR #532). Technique framing unchanged. |
| 2026-04-18 | Scott W. | Record AWS BAA signed 2026-02-07; correct CSP status to "planned, not deployed"; add Render BAA pre-MVP gate framing; link `docs/legal/` BAA artifacts |
| 2026-02-23 | Scott W. | Add accepted risk for Ember 3.28, security hotfix summary, remediation backlog |
| 2026-02-21 | Scott W. | Initial version: full compliance framework created   |

---

*This document is a living artifact. It must be updated whenever the LingoLinq architecture, service dependencies, AI features, or regulatory obligations change. If in doubt about whether a change requires an update here, the answer is yes.*
