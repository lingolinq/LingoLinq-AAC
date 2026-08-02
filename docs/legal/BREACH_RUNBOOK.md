# LingoLinq Data Breach Response Runbook

**Version:** v2.2.1 (2026-08-01)
**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-08-01
**Next review:** 2027-08-01
**Classification:** Internal, share with counsel on demand
**Attestation:** Re-attested 2026-08-01 by Scot Wahlquist, CEO, covering the v2.2.1 corrections in §13. The 2026-07-28 attestation covered the v2.2 bytes (`fbdf49a1...`), which were corrected after that attestation was recorded; this attestation covers the corrected bytes. Prior attestations: 2026-07-31, 2026-07-28, 2026-07-23, 2026-06-21.

> If you are reading this during an active incident, jump to §4.0 Detection Sources, then §4.1 Detect and Triage. Page Scot first via the escalation tree in §3.

---

## 1. Purpose and Scope

This runbook describes how LingoLinq responds to any confirmed or suspected compromise of confidentiality, integrity, or availability of data under our stewardship. It covers:

- Student education records covered by FERPA
- Protected Health Information (PHI) covered by HIPAA
- Personal data of EU, EEA, UK, or Swiss residents covered by GDPR and UK GDPR
- Personal information of children under 13 covered by COPPA
- State-level breach notification statutes that apply to LingoLinq customers

The runbook triggers the moment any LingoLinq employee, contractor, or subprocessor becomes aware of a potential breach. A "potential" breach is any event that a reasonable privacy professional would want to investigate, including, but not limited to:

- Unauthorized access to production systems
- Credentials posted publicly or lost to a phishing campaign
- Lost or stolen devices holding customer data
- A subprocessor breach notification
- A user report that another user saw their data
- Anomalous database export activity
- A misconfigured S3 bucket or public link
- Accidental email of PII to the wrong party
- Malware, ransomware, suspicious access, or outage signal affecting Cloud Run, Cloud SQL, Memorystore, AWS/Bedrock/S3, the Render rollback/fallback path, a workstation, or a tenant tool

## 2. Definitions by Framework

### 2.1 FERPA (20 U.S.C. § 1232g; 34 CFR Part 99)

A FERPA breach is any unauthorized disclosure of personally identifiable information from an education record. Directory information is exempt only when the school has given annual notice and the parent has not opted out. LingoLinq processes education records as a "school official" under the FERPA school official exception, which means we must use the data only for the purposes for which it was disclosed.

### 2.2 HIPAA (45 CFR §§ 164.400 to 164.414)

A HIPAA breach is an acquisition, access, use, or disclosure of PHI not permitted under the Privacy Rule that compromises the security or privacy of the PHI. A risk assessment across four factors determines whether notification is required:

1. The nature and extent of the PHI involved
2. The unauthorized person who used or received the PHI
3. Whether the PHI was actually acquired or viewed
4. The extent to which the risk has been mitigated

A "low probability of compromise" finding must be documented and defensible.

### 2.3 GDPR (Regulation (EU) 2016/679, Articles 33 and 34)

A personal data breach is a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, personal data. Any breach is notifiable to the supervisory authority unless it is unlikely to result in a risk to the rights and freedoms of natural persons.

### 2.4 COPPA (15 U.S.C. §§ 6501 to 6506; 16 CFR Part 312)

COPPA does not define a separate breach-notification clock, but requires operators to maintain reasonable procedures to protect the confidentiality, security, and integrity of personal information collected from children under 13. A breach involving child personal information must be assessed under COPPA, state breach-notification laws, contract/DPA obligations, the privacy policy, and any health-app or consumer-health rules that may apply. Parent/guardian notice should be prepared without unreasonable delay where legally required or appropriate, but the runbook must not invent a COPPA-specific statutory deadline.

## 3. Roles and Responsibilities

| Role | Default Owner | Responsibilities |
|---|---|---|
| Incident Commander | Scot Wahlquist, CEO | Owns the incident end to end, convenes the response team, makes notification decisions, signs external communications |
| Tech Lead | Melissa (contract engineering) | Leads forensics, containment, eradication, and recovery; preserves evidence |
| Operations | Dominic | Coordinates vendor contacts, customer-success messaging, internal logistics |
| Privacy Contact | privacy@lingolinq.com (Privacy Office; DPO / EU Representative only if formally appointed) | Owns regulator and data-subject notifications, maintains incident log, interprets framework obligations |
| Legal | External counsel (TBD, engage on activation) | Provides privileged legal advice, approves external statements, coordinates with insurers |
| Security Advisor | External IR partner (TBD) | Deep forensic work if internal capacity is exceeded |

If the Incident Commander is unavailable, Dominic assumes the role. If the Tech Lead is unavailable, the on-call engineer for the affected service takes over until Melissa is reached.

### 3.1 Within-One-Hour Escalation

For any suspected SEV-0 or SEV-1 event, the first responder must page the response team within 60 minutes of discovery. Page in this order, escalate to the next contact if the prior contact has not acknowledged within 10 minutes.

1. Scot Wahlquist, CEO and Incident Commander
   - Primary: cell phone via the contact directory in 1Password (vault: LingoLinq Ops, item: Incident Contacts)
   - Secondary: scotwahlquist@gmail.com
   - Tertiary: Google Chat direct message
2. Dominic, Operations and IC fallback
   - Primary: cell phone via the same 1Password contact directory
   - Secondary: Google Chat
3. Melissa, Tech Lead
   - Primary: cell phone via the same 1Password contact directory
   - Secondary: email and Google Chat
4. On-call engineer for the affected service (if Melissa unreachable beyond 30 minutes)

If none of Scot, Dominic, or Melissa is reachable within 60 minutes, the first responder takes the Incident Commander role on a placeholder basis, opens the incident in `INCIDENT_LOG.md`, and continues escalating every 15 minutes until a primary contact acknowledges.

**Placeholder IC scope is limited.** A placeholder IC has authority to:

- Open the incident entry.
- Initiate the §4.1 step 4 evidence snapshot.
- Apply §4.2 containment steps that do not require external notice (credential rotation, feature flag toggle, deploy pause, router-level guard).
- Continue escalation attempts.

A placeholder IC does NOT have authority to:

- Declare final severity (provisional severity only; primary IC confirms).
- Notify any regulator, the cyber insurance carrier, or any external customer.
- Issue any public statement.
- Authorize forensic engagements that incur cost.

The following people are NEVER eligible to act as placeholder IC under any circumstance: Scot's immediate family members; any contractor without a current signed authority delegation on file; any third-party security researcher who reported the issue (conflict of interest); any external counsel. If the only available responder falls in one of these categories, they pursue containment per the limited scope above and continue escalation; they do not become IC.

#### Google Chat page template

Use this template verbatim when paging the response team in the Incident Response space. Replace bracketed fields, keep the structure.

> [P0 or P1] Suspected breach: [one-line summary]
>
> Discovered: [YYYY-MM-DD HH:MM UTC] by [name]
> Trigger: [Sentry alert / GCP alert / GuardDuty / Render fallback alert / customer report / code review / third-party]
> Initial scope: [what data, how many records, which tenants]
> Containment status: [none / in progress / contained]
> Evidence: [snapshot started yes/no, where stored]
>
> Paging: @Scot @Dominic @Melissa
> Incident thread: [link]
> Incident log entry: INC-[YYYY]-[NNN]

The first responder must follow up with a verbal call to Scot's cell within 15 minutes of posting the message, regardless of read receipt.

## 4. Response Phases

### 4.0 Detection Sources

A breach can be discovered through any of the channels below. Each row names the channel, what triggers the runbook, and the first action the discoverer takes.

| Source | Trigger that opens the runbook | First action |
|---|---|---|
| Sentry | Any P1 error tagged `security`, `auth-bypass`, `data-leak`, `tenant-isolation`, or any anomaly the on-call engineer cannot explain within 15 minutes | Acknowledge in Sentry, open the incident in Google Chat per §3.1 |
| AWS GuardDuty | Any High or Critical finding, any finding tagged `Exfiltration` or `UnauthorizedAccess`, or repeated Medium findings from the same source within 24 hours | Capture the GuardDuty finding ID, open the incident per §3.1 |
| GCP / Cloud Run / Cloud SQL alerts | Cloud Logging, Cloud Monitoring, Security Command Center, Cloud SQL, or Memorystore signal showing unauthorized access patterns, suspicious administrative activity, service outage, backup/restore anomaly, or Google incident notification involving LingoLinq production services | Capture Cloud Logging / Cloud Audit Logs / Cloud SQL / Memorystore evidence for the window, open the incident per §3.1 |
| Render rollback/fallback alerts | Render security advisory, service log spike, or Render incident notification involving the write-frozen rollback/fallback path or non-production services | Capture Render audit log entries for the window, open the incident per §3.1 |
| Customer report | A user or district contact reports they saw another tenant's data, received someone else's notification, or believes their account was accessed | Acknowledge to the reporter within 1 business hour, do not promise anything beyond "we are investigating", open the incident per §3.1 |
| Internal discovery during code review | A reviewer identifies a deployed change that exposed or could have exposed data across a trust boundary | Page Scot directly; do not file a public GitHub issue describing the vulnerability; open the incident per §3.1 |
| Third-party disclosure | A subprocessor breach notice, a security researcher disclosure, a press inquiry, or a regulator inquiry | Do not reply substantively. Forward to Scot and the Privacy Contact, then open the incident per §3.1 |
| Lost or stolen device | Any LingoLinq-issued or BYOD device with cached customer data is lost, stolen, or unrecoverable | Remote wipe via the device management console if available, rotate any device-bound credentials, open the incident per §3.1 |

Anything that does not fit these rows but a reasonable privacy professional would investigate (see §1) still opens the runbook. Bias toward opening; closing an incident as a near miss costs nothing.

### 4.1 Detect and Triage (Hour 0 to Hour 2)

1. The person who notices the event opens a Google Chat thread in the "Incident Response" space and pages per §3.1.
2. They tag the Incident Commander and Tech Lead.
3. The Incident Commander creates an incident entry in `docs/legal/INCIDENT_LOG.md` using the template at the top of that file.
4. The Tech Lead preserves volatile evidence within the first hour. Snapshot these sources, with timestamps:
   - Cloud Run logs for all affected production services (`gcloud logging read` export for the incident window; include service name, revision, region, request IDs, and principal where available)
   - Google Cloud Audit Logs for IAM, Cloud Run, Cloud SQL, Secret Manager, Memorystore, Artifact Registry, and any affected project-level administrative action
   - Cloud SQL audit/backup/restore metadata for the affected window, including the live production database `lingolinq-prod-pg` in `us-central1`
   - Render service/audit logs only if the write-frozen rollback/fallback path, a PR preview, or a non-production service is implicated
   - AWS CloudTrail event history for affected accounts and regions, including S3 and Bedrock/Mantle activity where AI egress or evidence storage is implicated
   - S3 access logs and S3 server access logging records for affected buckets
   - PostgreSQL forensic snapshot of the live production database, Google Cloud SQL `lingolinq-prod-pg` (us-central1): take an on-demand backup or a point-in-time clone into an isolated instance (`gcloud sql instances clone lingolinq-prod-pg <forensic-copy> --point-in-time <timestamp>`), recovering to any moment inside the 7 day transaction-log window; do not restore over production. The superseded Render database holds write-frozen pre-cutover data only and is not the source for live-incident recovery (see §4.5 step 3)
   - Sentry events tagged with the incident window, exported as JSON
   - Code at HEAD: `git rev-parse HEAD` and a tarball of the working tree
   - Worker queue state if Sidekiq or any background processor is implicated
   Store all evidence in the dedicated `s3://lingolinq-incident-evidence/<INC-ID>/` bucket. This bucket uses Object Lock in compliance mode (7-year retention), versioning on, default encryption AES-256, all public access blocked, and write restricted to the Tech Lead and Incident Commander IAM roles. Compliance-mode Object Lock supersedes MFA-delete (compliance mode blocks deletion before retention expiry under any credentials), so do not bother with MFA-delete on this bucket. Use a separate `<INC-ID>/` prefix per incident. Do not overwrite, rename, or delete any evidence object during the active investigation.

   **Chain of custody.** For every artifact captured, write a sidecar file alongside it in the same prefix:
   - `<artifact>.sha256`: SHA-256 hash of the artifact, computed at capture before upload (`sha256sum <file>`)
   - `<artifact>.custody.json`: capture timestamp in UTC, source system, capturer name and IAM principal, witness name if any, transport path
   At the prefix root, maintain a `CUSTODY.md` log appended only, one row per artifact, mirroring the JSON sidecar fields. For any physical evidence (lost or stolen device, paper records), photograph in place with date-stamped phone camera, capture serial numbers, and store images in the same prefix. The custody log is what a regulator or court will ask for to admit the evidence; treat it as part of the artifact, not an afterthought.

   If the evidence bucket does not yet exist when the incident is declared, create it inline with the settings above. Creating the bucket takes about 5 minutes. Do this in parallel with the local evidence snapshot; do not block the snapshot waiting for the bucket.
5. Cyber insurance carrier engagement. As of the current runbook version, no cyber policy is bound and this step is **provisional**. When a policy is bound, the carrier's contractual notification clause supersedes this section verbatim and must be pasted in as Annex A; do not paraphrase. Until then:
   - Carrier of record: `[NOT YET BOUND - SCOT FILL when policy is signed: carrier name + 24/7 line + policy number + named-insured authorized representative]`
   - **Operational rule today:** the Incident Commander does NOT make a binding carrier call; they email a holding notice to Scot's policy broker (if any) and document the absence of carrier in the incident entry. The 1-hour duty re-activates only once Annex A is populated.
   - **Once Annex A is populated:** within 1 hour of declaring P0 or P1, the Incident Commander follows the carrier-specific notification clause exactly (channel, content, recipient, timing). Most cyber policies require notification within 24 to 72 hours to preserve coverage; the carrier may dispatch a panel forensics firm, panel counsel, or PR support at no incremental cost. Notice from a non-authorized representative may be rejected; the named-insured representative makes the call.
   - Log the action taken (or the absence of carrier) in the incident entry.
6. The Privacy Contact starts the clock. "Awareness" under GDPR begins when LingoLinq has a reasonable degree of certainty that an incident has occurred and personal data has been compromised.

### 4.2 Contain (Hour 2 to Hour 8)

1. Rotate any credentials that may be exposed, using the 1Password vault structure.
2. Disable the affected user sessions using `User.revoke_active_sessions!` where appropriate. Only after the §4.1 step 4 evidence snapshot of session state is acknowledged complete by the Tech Lead; revoking sessions before snapshot destroys forensic state.
3. If a subprocessor is the source, open a support case with them and request a written incident report.
4. If GCP production services are implicated, pause non-emergency deployments, snapshot relevant Cloud Run / Cloud SQL / Secret Manager / Memorystore evidence, and preserve the affected revision before rollback or redeploy.
5. If Render rollback/fallback or non-production services are implicated, pause deployments and snapshot the affected service/database evidence. Do not treat the Render database as the live production recovery source.
6. If AWS resources are implicated, use CloudTrail, S3 access logs, and Bedrock/Mantle evidence to scope.
7. If the breach is tied to a specific product feature, kill the feature flag immediately. The flag pattern lives in `lib/feature_flags.rb` (`AVAILABLE_FRONTEND_FEATURES` and `ENABLED_FRONTEND_FEATURES` lists; `AI_FEATURES` constant; `FEATURE_DATES` for gradual-rollout cohorts). The most likely candidates and their kill paths:
   - AI features (`ai_board_generation`, `ai_word_prediction`, `ai_board_suggestions`, `ai_symbol_search`, `ai_compliance_logging`, `comprehensive_eval_ai`): set the affected org's `settings['disable_ai_features']` to `true` for an org-scoped kill without a deploy (per `FeatureFlags.ai_enabled_for?`), or remove the feature from `ENABLED_FRONTEND_FEATURES` for a global kill. The COPPA hard gate (`COPPA_AI_HARD_GATE` env var) is a separate global lever that defaults ON. Do NOT disable `article_50_disclosure`: it is the EU AI Act Art. 50(1) first-use disclosure (a legally required notice, hard-gated 2026-08-02), not an AI feature to kill; it is not in `AI_FEATURES`, so `settings['disable_ai_features']` does not reach it. No alternate AI vendor may receive user data during an outage or incident unless that vendor is already approved in the current subprocessor register and the Privacy Office has authorized the failover in writing.
   - Third-party integrations (`lessonpix`, `tarheel_reader`, `translation`): remove from `ENABLED_FRONTEND_FEATURES` and rotate or revoke the corresponding integration env var to fail closed.
   - Supervisor consent flow or auth SPA transition: revert to the prior path by removing `supervisor_consent_flow` or `auth_spa_transition` from `ENABLED_FRONTEND_FEATURES`.
   - Other features in `AVAILABLE_FRONTEND_FEATURES`: same pattern.
   Global flag changes require a deploy. For an org-scoped emergency kill that does not require a deploy, prefer the org-settings route. Document every flag change in the incident entry with the commit SHA or admin action ID.

   **Snapshot before kill.** Do not execute any kill that mutates state or terminates a data stream until §4.1 step 4 evidence snapshot is acknowledged complete by the Tech Lead. This is especially true for logging or telemetry paths (where the kill would terminate the forensic feed) and for active user sessions (where revoke-active-sessions in §4.2 step 2 destroys session state needed for the HIPAA four-factor risk assessment). For those special cases, mirror the stream to the evidence bucket in parallel first; then kill.

   If the affected endpoint, route, or feature is NOT yet behind a feature flag, the Tech Lead deploys a router-level guard or controller-level early-return-403 patch as the emergency kill within 30 minutes of declaring containment, and opens a follow-up issue to add a proper feature flag. This is an acceptable emergency lever; the proper flag must land within the next deploy cycle.

### 4.3 Assess (Hour 8 to Hour 48)

1. Identify the data categories, record counts, and residency of affected individuals.
2. Run a HIPAA four-factor risk assessment if PHI is involved.
3. Determine whether any exempt categories apply (encrypted and key not compromised, safe harbor statutes, directory information exception).
4. Classify severity using the decision tree in section 5.

### 4.4 Notify (Hour 48 and onward)

See section 6.

### 4.5 Remediate and Recover

1. Deploy fixes through the standard staging to production pipeline; emergency hotfixes follow the security-hotfix skill.
2. Validate that the root cause is resolved in a production replica before cutting over.
3. Restore any lost data from the most recent clean backup in Google Cloud SQL (`lingolinq-prod-pg`,
   `us-central1`). The live instance has 7 retained automated daily backups and 7 days of point-in-time
   recovery. Use the Render write-frozen database only as the authorized rollback fallback while it
   remains available; see `DATA_RETENTION.md` and `SUBPROCESSORS.md` section 5.2.
4. Confirm tenant isolation is intact: run the data-policy audit job.

### 4.6 Post-Incident (Week 2 onward)

1. Hold a blameless postmortem within 10 business days of containment. Publish the postmortem within 14 days of incident close. The postmortem must include: timeline, root cause, contributing factors, actions taken during the response, customer impact, regulator engagement, lessons learned, and concrete future-prevention commitments with owners and dates. Link the postmortem from the Compliance & Audits hub Audit History row for this incident. For SEV-0, share a summary with affected customers in the format used by §9.3.
2. Update this runbook with lessons learned. Increment the version line and add a row to the changelog at the bottom of the file.
3. File the final incident report with the Privacy Contact and retain for at least 7 years in `INCIDENT_LOG.md` plus the evidence S3 bucket.
4. Update the SUBPROCESSORS.md file if a vendor change is needed.
5. Confirm the cyber insurance carrier engagement is closed out per policy terms. The initial notification happens in §4.1 step 5 within 1 hour of P0/P1 declaration; this step is the final close-out, not the first contact.

## 5. Severity Decision Tree

```
Did personal data leave a trust boundary, become unavailable, or become altered?
  No  -> not an incident, log as a near miss
  Yes -> continue

Is any of the data PHI, education records, EU personal data, or child data?
  No  -> SEV-3, contain and document, no regulator notice
  Yes -> continue

Is the risk to rights and freedoms low (GDPR Article 33(1) carve-out)?
  Yes -> SEV-2, document the risk assessment, no supervisory authority notice,
         but still notify affected customers by contract if required
  No  -> continue

Are more than 500 individuals affected or is the data highly sensitive?
  Yes -> SEV-0, executive incident, full notification program
  No  -> SEV-1, standard notification program
```

**"Highly sensitive" is defined for this runbook as any of the following:**

- PHI of any quantity (one record is enough to trigger SEV-0).
- Education records of named children with disability or special-education identifiers.
- Any breach involving children under 13 (COPPA).
- Active credentials (passwords, API keys, session tokens, OAuth refresh tokens) for any user.
- Multi-factor authentication seeds or recovery codes.
- Audio or video recordings of children.
- Free-text fields likely to contain diagnoses, IEPs, behavior notes, or medical commentary.

**Auto-escalation rule.** A breach that is initially classified SEV-1 escalates to SEV-0 the moment any of the above is confirmed in the affected data, regardless of record count. The Incident Commander records the escalation timestamp in the incident entry. Escalation cannot be downgraded once declared.

## 6. Notification Timelines

| Framework | Regulator | Individuals | Source |
|---|---|---|---|
| GDPR | Supervisory authority without undue delay and, where feasible, not later than 72 hours after awareness, unless unlikely to result in risk to rights and freedoms | Without undue delay when high risk to rights and freedoms | Articles 33 and 34 |
| UK GDPR | ICO without undue delay and, where feasible, not later than 72 hours after awareness | Same as GDPR | UK GDPR / Data Protection Act 2018 |
| HIPAA | HHS Secretary within 60 days if 500+ affected, annually if fewer; Business Associate notice to Covered Entity without unreasonable delay and no later than 60 days | Individuals within 60 days of discovery when LingoLinq is the notifying Covered Entity; otherwise support the Covered Entity under the BAA | 45 CFR §§ 164.404, 164.408, 164.410 |
| HIPAA (prominent media) | Media notice in the affected state, without unreasonable delay and no later than 60 days from discovery, if 500+ residents of a single state | n/a | 45 CFR § 164.406 |
| California SB 446 | n/a (consumer-direct) | 30 calendar days from discovery; sample of consumer notice to AG within 15 days of consumer notice if 500+ CA residents | Cal. Civ. Code 1798.82 as amended by SB 446 (effective 2026-01-01) |
| FERPA | No federal timeline; cooperate with district notice obligations | Per state law | 34 CFR Part 99 |
| COPPA | No COPPA-specific regulator breach-notification clock; assess FTC exposure, state breach laws, contract/DPA obligations, and any FTC Health Breach Notification Rule issue if applicable | Parent/guardian notice without unreasonable delay when legally required or appropriate | 16 CFR Part 312; FTC COPPA guidance |
| Illinois SOPPA | Affected district within 30 days | District notifies parents within 30 days of being notified | 105 ILCS 85 |
| California SB 1177 (SOPIPA) | Customer district per contract | District notifies under Cal. Civ. Code 1798.29 | Cal. Ed. Code 22584 |
| New York Ed Law 2-d | Customer educational agency in the most expedient way possible and without unreasonable delay, no more than seven calendar days after discovery (the seven-day cap is the regulation, not a contract term; a DPA may shorten it but cannot extend it) | Educational agency then notifies the NYSED Chief Privacy Officer within 10 calendar days of our notice, and parents/eligible students no more than 60 calendar days after discovery or receipt | NY Ed Law § 2-d; 8 NYCRR § 121.10 |
| Texas SB 820 / HB 3 | District within 15 days (for schools) | Per state breach statute | Tex. Ed. Code 11.175 |
| US state breach laws (general) | Attorneys General per state statute, typical window 30 to 60 days | Residents per statute | Varies |

Actual timing decisions are made by the Privacy Contact in consultation with Legal. When in doubt, notify earlier rather than later.

### 6.5 Regulator Submission Procedures

These are the live portals and procedures as of 2026-07-28. Verify each link before submission; regulators move portals without notice.

**HHS (HIPAA).** Office for Civil Rights Breach Notification Portal: <https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf>. Choose "start a new breach report", pick the size category (500 or more, or fewer than 500), and identify LingoLinq as Covered Entity (for direct PHI relationships) or Business Associate (for hospital BAA arrangements). For 500 or more individuals, submit without unreasonable delay and no later than 60 calendar days from discovery. For fewer than 500, maintain a running log and submit annually within 60 days of year-end. Save the portal confirmation page and submission ID into the evidence bucket. If LingoLinq later handles 42 CFR Part 2 substance use disorder data through a hospital BAA, verify Part 2 acceptance on the portal page at filing time.

**EU and EEA supervisory authorities (GDPR).** EDPB notification directory: <https://www.edpb.europa.eu/notify-data-breach_en>. Notify the competent supervisory authority without undue delay and, where feasible, not later than 72 hours after awareness, unless the breach is unlikely to result in risk to rights and freedoms. If the controller has no appointed EU/EEA representative or lead supervisory authority is unclear, consult counsel before filing; each member state portal differs, and the EDPB page is the canonical index.

**UK Information Commissioner's Office (UK GDPR).** ICO breach reporting: <https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/>. Notify without undue delay and, where feasible, not later than 72 hours after awareness.

**State attorneys general (US state breach laws).**

| State | Threshold and window | Portal or contact |
|---|---|---|
| California | 30 calendar days from discovery (per SB 446, effective 2026-01-01). Plus AG notice within 15 days of consumer notification if 500+ California residents affected. | AG online breach reporting: <https://oag.ca.gov/privacy/databreach/reporting>. Sample of the consumer notice required. |
| New York | Per the NY SHIELD Act (N.Y. Gen. Bus. Law § 899-aa) and the 2025 amendment: notify affected NY residents without unreasonable delay and no later than 30 days from discovery; notify the AG, the Department of State, and the Division of State Police on the same notice; add the NY Department of Financial Services (DFS) if any regulated financial-services data is involved. | NY AG breach reporting: <https://ag.ny.gov/internet/data-breach>. Confirm current form ID at filing time. |
| Illinois | 30 to 60 days as a practical matter ("without unreasonable delay"). SOPPA student-data window is 30 days to the affected district. | Illinois AG breach reporting: <https://illinoisattorneygeneral.gov/consumers/databreach.html>. |
| Texas | As soon as practicable, no later than 60 calendar days from discovery (Tex. Bus. & Comm. Code § 521.053). Treat 60 days as a ceiling, not a target. If 250 or more Texas residents affected, also notify the AG. If more than 10,000 affected, also notify consumer reporting agencies. | Texas AG breach reporting: <https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/identity-theft-and-data-breaches>. |

For any state not listed above where a customer district has affected residents, consult the Perkins Coie 50-state chart (<https://perkinscoie.com/insights/publication/security-breach-notification-chart>) or the IAPP US state breach notice resource and notify accordingly. The Privacy Contact owns this consult.

### 6.7 Public Statement Decision Tree

Public disclosure is a sequencing problem, not a yes-or-no problem. The wrong public statement at the wrong time creates more harm than the breach itself.

```
Is the breach already public (press, social, regulator filing visible)?
  Exclusion: regulator filings the company made as part of the planned notification
  sequence (HHS portal, state AG filings) do not by themselves trigger the "already
  public" branch even if the regulator publishes them.
  Yes -> issue a statement within 24 hours acknowledging the incident, confirming containment status,
         and pointing affected individuals to privacy@lingolinq.com
  No  -> continue

Is HIPAA media notice required (500+ residents of a single state)?
  Yes -> issue the required media notice on or before the day individuals are notified
  No  -> continue

Have all affected customer districts and individuals been notified per §6 timelines?
  No  -> hold the public statement; coordinated notification protects affected parties
  Yes -> continue

Does the carrier-appointed PR firm or panel counsel recommend a public statement?
  Yes -> publish per their guidance
  No  -> default to no public statement; respond reactively only to inbound press inquiries
         with a prepared one-paragraph holding response
```

Approval chain for any public statement:

1. Privacy Contact drafts.
2. External counsel reviews for legal exposure and regulator alignment.
3. Cyber insurance carrier or panel PR firm reviews for coverage implications.
4. Scot Wahlquist approves the final version and signs.
5. Publish in this order with 30-minute spacing: website notice (status.lingolinq.com or a dedicated incident page), email blast to affected customer districts, social posts (X, LinkedIn). Email to individuals follows §9.2 timing and is not part of the public-statement cadence.

Principle: do not hide, but do not pre-empt the investigation. A holding statement is acceptable. A speculative root-cause claim before forensics is not.

## 7. Vendor Notification List

Subprocessors to notify whenever a breach may implicate their service. See SUBPROCESSORS.md for full contact information.

- AWS: security@amazon.com for abuse, AWS Support case for BAA-scoped incidents, BAA contact on file under account 2390-4478-5114
- Render: support@render.com, plus the Render security contact when established
- HubSpot: privacy@hubspot.com, plus the DPA breach-notice email
- Sentry: security@sentry.io
- Anthropic (active runtime AI via AWS Bedrock/Mantle): privacy@anthropic.com and the Anthropic trust portal. Active runtime model egress is Anthropic Claude on the approved Bedrock/Mantle path (SUBPROCESSORS.md #4, HIPAA-Ready BAA); confirm the live path in the register before assuming any other.
- OpenAI: security@openai.com and the enterprise support portal. Dormant: no active code path sends data to OpenAI (SUBPROCESSORS.md #3, retained pending Privacy Office review); notify only if a path is reactivated and implicated.
- Google Cloud / Workspace / Maps / Speech / Gemini: the Google Cloud incident/support form and Workspace admin/security contacts. The Gemini inference fallback is disabled/dormant (SUBPROCESSORS.md #5); do not assume it is a live AI fallback, but keep the contact reachable for the active Google Cloud/Workspace/Speech services.
- Pusher: support@pusher.com
- n8n: LingoLinq-operated automation service; notify the hosting provider only if the hosting layer is implicated, and notify affected workflow owners/customers if workflow data is implicated
- 1Password: support@1password.com (only for vault integrity events)
- Cloudflare: abuse@cloudflare.com (if DNS or CDN is involved)

## 8. Incident Log

The authoritative log of all incidents and near misses lives at `docs/legal/INCIDENT_LOG.md`. Entries must capture: incident ID, opening and closing timestamps, Incident Commander, severity, affected data categories, affected individuals, frameworks engaged, notifications sent, root cause, and remediation owner.

Retention: 7 years minimum from the closing date of the incident, or longer if required by statute.

## 9. Template Notification Letters

Full templates live in `docs/legal/breach_templates/` (create as needed). The placeholders below are the minimum set each notice must include.

### 9.1 Regulator Notice (GDPR Article 33)

> To: [supervisory authority]
> Subject: Personal data breach notification by LingoLinq, Inc.
>
> Controller / Processor: LingoLinq, Inc., acting as [controller/processor] for [customer]
> Date and time of awareness: [timestamp]
> Nature of the breach: [free text description]
> Categories and approximate number of data subjects concerned: [list]
> Categories and approximate number of records concerned: [list]
> Likely consequences: [risk assessment summary]
> Measures taken or proposed: [containment, mitigation]
> Privacy contact: privacy@lingolinq.com

### 9.2 Affected Individual Notice

> Dear [name],
>
> LingoLinq is writing to inform you of a security incident that may have affected information associated with your account or with a person for whom you are the authorized contact.
>
> What happened: [plain language summary]
> When: [dates]
> Information involved: [list]
> What we are doing: [remediation]
> What you can do: [recommended steps]
> For more information: privacy@lingolinq.com or [phone]

### 9.3 District or Customer Contact Notice

> Dear [customer privacy contact],
>
> Pursuant to our Data Processing Addendum dated [date], LingoLinq is providing you notice of a security incident affecting data you have entrusted to us.
>
> Discovery date: [date]
> Affected records: [scope]
> Affected individuals in your tenant: [count]
> Frameworks implicated: [FERPA / HIPAA / GDPR / COPPA]
> Our response so far: [summary]
> Support available to you: [list]
> Incident Commander: Scot Wahlquist, CEO
> Privacy contact: privacy@lingolinq.com

### 9.4 Hospital / HIPAA Covered Entity Notice

For Business Associate notice to a hospital or other Covered Entity under 45 CFR § 164.410. Send within 60 days of discovery, ideally inside 10 business days to give the Covered Entity room to meet its own 60-day clock.

> Dear [hospital Privacy Officer / HIPAA contact],
>
> Pursuant to the Business Associate Agreement between [Hospital Name] and LingoLinq, Inc. dated [date], LingoLinq is providing notice of a security incident that may involve Protected Health Information you have entrusted to us.
>
> What we know:
> - Discovery date and time: [YYYY-MM-DD HH:MM timezone]
> - Date the incident is believed to have begun: [YYYY-MM-DD or "under investigation"]
> - Nature of the incident: [plain language description]
> - Categories of PHI involved: [name, MRN, DOB, treatment notes, AAC session logs, etc.]
> - Approximate number of individuals affected in your organization: [count or range]
> - Individual identifiers (to the extent reasonably available, per 45 CFR § 164.410(c)): [attached list, or "to be provided within X business days"]
>
> What we do not yet know:
> - [list specific open investigation items]
>
> What we are doing:
> - Containment actions taken: [summary]
> - HIPAA four-factor risk assessment status: [in progress / complete with finding]
> - Forensics engagement: [internal / panel firm name]
>
> Your obligations and our support:
> - You retain the obligation to notify affected individuals under 45 CFR § 164.404 if a notifiable breach is confirmed.
> - LingoLinq will provide an affected-individual list, breach details, and a recommended notification template at no cost to your organization.
> - LingoLinq will not communicate directly with your patients about this incident without your written approval.
>
> Our HHS Breach Notification Portal submission ID, if applicable: [ID or "to be filed"]
>
> Incident Commander: Scot Wahlquist, CEO
> Privacy contact: privacy@lingolinq.com
> Business Associate notification timestamp: [YYYY-MM-DD HH:MM UTC]

## 10. Testing and Continuous Improvement

- Tabletop exercise: annually at minimum, within the month of October each year. The fictional scenario in §10.5 is the default starter; rotate to a new scenario each year so the team does not memorize one storyline.
- Runbook review: annually or within 30 days of any SEV-0 or SEV-1 incident.
- Notification template review: every 18 months to stay aligned with statutory changes.
- Contact directory (section 7) review: quarterly.

### 10.5 Tabletop Exercise Script

Use this script for the annual tabletop, or any unscheduled drill. The goal is not to "solve" the scenario; it is to confirm every responder can find the right page in this runbook and execute the step under time pressure. Run it with at least Scot, Dominic, and Melissa present (or their fallbacks). Schedule 90 minutes and a notetaker.

**Scenario (hypothetical, not a real route).** It is 2:14am local time on a Tuesday in November. Sentry sends a P1 alert to the on-call engineer: a request that should have required authentication succeeded without it, on an endpoint that returns user-scoped data. The Sentry trace shows the request returned 200 with a session payload. The on-call engineer pulls Cloud Run request logs, Cloud Audit Logs, and Cloudflare logs and finds 47 distinct user IDs hit by the same source IP across a 12-minute window before the IP was blocked by a Cloudflare rule. Most of the affected user IDs belong to a single school district customer. Some belong to a hospital BAA customer in Texas, and the residency breakdown of those patients is not yet known (some may live in nearby states).

**Walkthrough.** For each step, the facilitator asks the named role to perform the step out loud while the notetaker records time-to-action and any ambiguities.

1. On-call engineer: open the incident in the Google Chat Incident Response space using the §3.1 template. (Time the post.)
2. On-call engineer: page Scot per §3.1 escalation order. (Confirm fallback to Dominic, then Melissa, is exercised.)
3. Incident Commander (Scot or Dominic if Scot unreachable): classify severity using §5. Expect SEV-1 pending confirmation, escalating to SEV-0 if patient PHI is confirmed exposed.
4. Tech Lead: snapshot evidence per §4.1 step 4 into `s3://lingolinq-incident-evidence/<INC-ID>/`. (Confirm the bucket exists, write-once, Object Lock compliance mode, versioning, encryption, and public-access block. If it does not, the runbook fails and we create it before continuing.)
5. Incident Commander: call cyber insurance carrier per §4.1 step 5. (Confirm the placeholder is filled with a real carrier and 24/7 line. If not, this is the gap to close before the next drill.)
6. Tech Lead: kill the affected endpoint per §4.2 step 6. If the endpoint is behind a flag in `lib/feature_flags.rb`, toggle. If not, deploy the router-level guard. Confirm the §4.2 "snapshot before kill" ordering rule is observed: evidence snapshot of session state must be acknowledged complete before active sessions are revoked.
7. Privacy Contact: open the 4 framework decision tree mentally. FERPA applies (district records). HIPAA applies (hospital BAA). GDPR may apply if any affected individuals reside in the EU; check tenant metadata. COPPA applies for any affected user under 13. Request a residency breakdown of affected individuals from the hospital Covered Entity before mapping state-law clocks; do not assume affected patients live in the same state as the hospital.
8. Privacy Contact: identify the regulator clocks per §6 and §6.5 using the residency breakdown. GDPR 72-hour and HIPAA 60-day windows start now. California SB 446 30-day window starts if any California residents are affected. Texas: as soon as practicable, no later than 60 days; AG notice if 250+ Texas residents. Illinois SOPPA 30-day district notice if any Illinois district is affected. New York Ed Law 2-d seven-calendar-day district notice starts now if any New York educational-agency (district) tenant is affected (8 NYCRR § 121.10; the district then has 10 calendar days to notify the NYSED Chief Privacy Officer, so our delay consumes their clock). New York SHIELD Act 30-day window if any NY residents are affected. Any other state: consult Perkins Coie chart per §6.5.
9. Privacy Contact: pull the §9.3 district template and the §9.4 hospital template. Confirm both are populated with the right facts.
10. Incident Commander: walk the §6.7 public statement decision tree. Expect "hold; no public statement yet" given the breach is not yet public and notification is in progress.
11. Tech Lead: identify the root cause hypothesis. The expected finding: the `log_sessions` endpoint missed an authentication check, or the allowlist guard was misconfigured. Plan the hotfix.
12. Postmortem: draft a postmortem skeleton per §4.6 step 1. Confirm where it will be linked in the Compliance & Audits hub Audit History.

**Pass criteria.**

- Every step is found in the runbook within 60 seconds.
- Every step has an unambiguous owner.
- The notetaker maintains a printed Clocks Sheet listing GDPR, HIPAA HHS, HIPAA individuals, HIPAA media, carrier (or its placeholder status), and one row per US state with affected residents (CA, NY, IL, TX, others). Pass = every applicable row stamped with a timestamp and the name of the person who identified the clock, all before the 30-minute mark.
- No step depends on the Incident Commander being personally present; Dominic can execute the runbook with Scot unreachable.

**Failure responses.**

- If a step cannot be found in 60 seconds, the runbook is wrong; fix it during the exercise.
- If a step has no owner or two owners, fix §3 during the exercise.
- If a step references a system or document that does not exist (evidence bucket, carrier contact, feature flag, postmortem template), capture it as a gap and assign an owner to close before the next drill.

Log the date of every tabletop in the Validation log section at the end of this file, with attendees, time-to-page, time-to-evidence-snapshot, and any runbook edits made during or after the drill.

## 11. Appendix: Key References

- FERPA regulations: 34 CFR Part 99
- HIPAA Breach Notification Rule: 45 CFR §§ 164.400 to 164.414
- GDPR Articles 33 and 34
- COPPA Rule: 16 CFR Part 312
- NIST SP 800-61 Rev 2, "Computer Security Incident Handling Guide"
- HHS OCR Breach Notification Portal: <https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf>
- EDPB EU breach notification directory: <https://www.edpb.europa.eu/notify-data-breach_en>
- Perkins Coie 50-state breach notification chart: <https://perkinscoie.com/insights/publication/security-breach-notification-chart>
- LingoLinq DATA_RETENTION.md
- LingoLinq SUBPROCESSORS.md
- LingoLinq COMPLIANCE.md

## 12. Validation Log

A line per drill or production incident walk-through. Newest at the top. Do not edit historical entries; correct mistakes with a follow-up entry.

| Date | Type | Scenario | Attendees | Time-to-page | Time-to-evidence | Edits made |
|---|---|---|---|---|---|---|
| 2026-05-19 | Solo desk review by Scot Wahlquist, supported by Claude Code as drafting tool. Not a multi-person tabletop; first multi-person drill is scheduled per the Annual Audit Calendar. | §10.5 default scenario | n/a (paper exercise) | n/a (paper exercise) | Mid-walkthrough additions: §4.1 step 4 fallback for creating evidence bucket inline; §4.2 step 6 fallback for router-level guard when affected route is not yet feature-flagged. |
| 2026-05-19 | Adversary review (red-team pass on the v2 diff) | n/a (review of the runbook itself, not an incident scenario) | n/a | n/a | n/a | Post-review additions: NY DFS + SHIELD Act 30-day clock in §6.5; carrier section reworded as provisional with Annex A pattern in §4.1 step 5; "snapshot before kill" ordering rule in §4.2; chain-of-custody (SHA-256 + custody log + compliance-mode clarification) in §4.1 step 4; "highly sensitive" definition + auto-escalation in §5; placeholder IC scope limits + family/contractor/researcher exclusions in §3.1; HHS Part 2 claim removed in §6.5; Texas "as soon as practicable" floor; §6.7 self-filing exclusion; CA SB 446 row added to §6 main table; HIPAA media-notice timing added; §9.4 individual identifier field per 45 CFR § 164.410(c); §10.5 Clocks Sheet pass criterion; §10.5 step 7 residency-breakdown step; tabletop scenario relabeled hypothetical to drop the dependency on a real route name. |

### Open gaps surfaced by the 2026-05-19 walkthrough

These are infrastructure deltas the runbook now drives. They are not runbook defects, but they must be closed before the runbook is fully operational.

1. **1Password "Incident Contacts" item.** §3.1 assumes a 1Password item in the LingoLinq Ops vault with Scot, Dominic, and Melissa cell numbers. Confirm it exists or create it. Owner: Scot. Target: before first district contract redline.
2. **`s3://lingolinq-incident-evidence` bucket.** §4.1 step 4 names this bucket. Create it pre-incident with Object Lock compliance mode (7-year retention), versioning, AES-256 default encryption, all public access blocked, and write access limited to the Tech Lead and Incident Commander roles. Owner: Melissa or Tech Lead. Target: before first district contract redline. Inline-create fallback is documented but pre-creating is safer.
3. **Cyber insurance carrier name and 24/7 line.** §4.1 step 5 holds a `[SCOT FILL]` placeholder. Resolve the carrier engagement and populate. Owner: Scot. Target: when the cyber policy is bound.
4. **Feature flag coverage for `log_sessions` and other high-risk endpoints.** §4.2 step 6 documents the router-guard fallback, but every high-risk endpoint should have a real flag in `lib/feature_flags.rb` to make the emergency kill fast. Owner: Melissa. Target: next compliance sprint.

## 13. Changelog

- **v2.2.1 (2026-08-01).** Correction release. A senior review of v2.2 conducted after its attestation found four defects, corrected here:

  - **Self-contradicting attestation state (§13).** The v2.2 bytes attested on 2026-07-28 carried a changelog entry that labelled itself `v2.2-draft` and read "Awaiting Scot attestation before approval," while the header and register recorded those same bytes as attested and approved. The attested content therefore asserted that it was not attested. That contradiction is removed here, and it is disclosed rather than quietly dropped: an auditor comparing the register to the bytes it pinned would otherwise find the discrepancy unexplained.

  - **New York Ed Law 2-d (§6).** v2.2 removed the seven-calendar-day notification cap and reframed it as a contract term. 8 NYCRR § 121.10(b) imposes it on third-party contractors by regulation ("no more than seven calendar days after the discovery of such breach"), so a DPA may shorten it but cannot extend it. The cap is restored in the §6 table and added to the §10.5 tabletop clock list, together with the § 121.10(b) ten-calendar-day educational-agency-to-Chief-Privacy-Officer clock and the § 121.10(e) sixty-calendar-day parent and eligible-student clock.
  - **§4.2 emergency kill list.** v2.2 listed `article_50_disclosure` among the AI features to kill. That flag carries the EU AI Act Article 50(1) AI-interaction transparency disclosure, which obliges the provider to ensure users are informed they are interacting with an AI system unless that is obvious, hard-gated to 2026-08-02. It is also not a member of `AI_FEATURES`, so the documented org-scoped kill path did not reach it in any case. Removed, with an explicit do-not-disable caveat, and the actual `AI_FEATURES` member `comprehensive_eval_ai` added in its place.
  - **§11 vendor contacts.** v2.2 replaced dialable breach contacts with a pointer to the subprocessor register, leaving no reachable contact for the active model provider. Direct contacts for Anthropic (privacy@anthropic.com), OpenAI, and Google are restored alongside the register pointer, keeping dormant-but-retained subprocessors contactable and consistent with SUBPROCESSORS.md.

  Attestation bookkeeping: the corrections above were made 2026-07-29 and merged in PR #703 (merged 2026-07-29T23:05Z), but the register continued to record the 2026-07-28 attestation date against the corrected bytes, asserting that the attester had reviewed content that did not exist on that date. This release re-attests the corrected content, moves 2026-07-28 into `priorAttestations`, and separates the two revisions by version label so that "v2.2" unambiguously identifies the bytes hashed `fbdf49a1...`. An intermediate v2.2.1 attestation was recorded 2026-07-31 and then superseded before publication when a second review pass found the self-contradiction defect above; that date is retained in `priorAttestations` rather than overwritten. Re-attested 2026-08-01 by Scot Wahlquist, CEO.

- **v2.2 (2026-07-28).** Refresh after the Dominic LL-SOP-SEC-002 review and current code/evidence check. Tightened COPPA language so the runbook no longer invents a COPPA-specific breach-notification clock. Replaced the SEC-002-style overpromises with evidence-bounded language: no unapproved AI fallback provider during incident/outage response; no claim that Google Gemini is a live fallback; no remote-wipe guarantee; no DPO/EU Representative language unless formally appointed. Corrected the GDPR and UK-GDPR notification prose to track Article 33(1), and added the HIPAA § 164.410 Business-Associate-to-Covered-Entity sixty-day clock. Updated detection and evidence steps for the current GCP production path while preserving Render as rollback/fallback and non-production scope. Replaced MFA-delete with Object Lock compliance mode, versioning, encryption, public-access block, and role-limited write on the evidence bucket. Attested 2026-07-28 by Scot Wahlquist, CEO against hash `fbdf49a1...`, although the changelog entry inside those attested bytes still labelled itself a draft awaiting attestation (see the first v2.2.1 item). Four defects in this revision were found in senior review after that attestation and are corrected in v2.2.1 above.

- **v2.1 (2026-07-23).** Updated section 4.5 step 3 to name the live Google Cloud SQL instance as the
  primary recovery source after the Gate 1 cutover. Preserved the Render write-frozen database as the
  rollback fallback. Verified the live backup configuration: 7 retained daily backups, 08:00 UTC start
  time, and 7 days of point-in-time recovery. The RPO target is not yet established; this edit does not
  assert that the current recovery capability meets an RPO target. Also corrected the §4.1 step 4
  evidence-snapshot bullet, which still pointed the PostgreSQL forensic snapshot at Render's PITR, to
  the live Cloud SQL instance. The other Render references in this runbook (application logs, the §4.0
  alert row, and Render-hosted service surfaces) are deliberately left in place: the Render fallback
  remains online, so those surfaces stay valid; only the production database recovery source moved.

- **v2 (2026-05-19).** Added §3.1 within-1-hour escalation tree with pager order, fallbacks, Google Chat page template, and placeholder IC scope limits. Added §4.0 Detection Sources table. Expanded §4.1 step 4 with explicit evidence snapshot list, the `s3://lingolinq-incident-evidence/<INC-ID>/` write-once bucket, and a chain-of-custody requirement (SHA-256 hashes plus custody log). Added §4.1 step 5 for cyber insurance carrier engagement, written as provisional pending an Annex A populated when a policy is bound. Added §4.2 step 6 for emergency feature kill switches referencing `lib/feature_flags.rb`, with a "snapshot before kill" ordering rule. Added §5 explicit definition of "highly sensitive" data with an auto-escalation rule from SEV-1 to SEV-0. Added §6.5 Regulator Submission Procedures with live URLs for HHS, EDPB, ICO, and state AGs (CA, NY with SHIELD Act DFS coverage, IL, TX). Added §6.7 Public Statement Decision Tree with approval chain and a self-filing exclusion. Added §9.4 Hospital / HIPAA Covered Entity Notice template. Expanded §4.6 step 1 to require published postmortem within 14 days, linked from the Compliance & Audits hub Audit History. Added §10.5 Tabletop Exercise Script with default hypothetical scenario and Clocks Sheet pass criterion. Added §12 Validation Log and §13 Changelog sections. Authored against an adversary review of the v2 draft; see §12 row 2 for the full list of post-review hardening.
- **v1 (2026-04-20).** Initial draft. Sections 1 through 11. Authored against FERPA, HIPAA, GDPR, COPPA framework requirements with state-law table for IL, CA, NY, TX student data laws.
