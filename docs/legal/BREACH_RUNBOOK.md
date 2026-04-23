# LingoLinq Data Breach Response Runbook

**Owner:** Privacy Office (privacy@lingolinq.com)
**Last reviewed:** 2026-04-20
**Next review:** 2027-04-20
**Classification:** Internal, share with counsel on demand

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
- Malware or ransomware detection on any Render service, workstation, or tenant tool

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

COPPA does not define "breach" separately but requires operators to maintain reasonable procedures to protect the confidentiality, security, and integrity of personal information collected from children under 13. A breach of that personal information triggers parental notification obligations and FTC enforcement exposure.

## 3. Roles and Responsibilities

| Role | Default Owner | Responsibilities |
|---|---|---|
| Incident Commander | Scot Wahlquist, CEO | Owns the incident end to end, convenes the response team, makes notification decisions, signs external communications |
| Tech Lead | Melissa (contract engineering) | Leads forensics, containment, eradication, and recovery; preserves evidence |
| Operations | Dominic | Coordinates vendor contacts, customer-success messaging, internal logistics |
| Privacy Contact | privacy@lingolinq.com (DPO when appointed) | Owns regulator and data-subject notifications, maintains incident log, interprets framework obligations |
| Legal | External counsel (TBD, engage on activation) | Provides privileged legal advice, approves external statements, coordinates with insurers |
| Security Advisor | External IR partner (TBD) | Deep forensic work if internal capacity is exceeded |

If the Incident Commander is unavailable, Dominic assumes the role. If the Tech Lead is unavailable, the on-call engineer for the affected service takes over until Melissa is reached.

## 4. Response Phases

### 4.1 Detect and Triage (Hour 0 to Hour 2)

1. The person who notices the event opens a Google Chat thread in the "Incident Response" space.
2. They tag the Incident Commander and Tech Lead.
3. The Incident Commander creates an incident entry in `docs/legal/INCIDENT_LOG.md`.
4. The Tech Lead preserves volatile evidence: Render logs, database snapshots, Sentry events, S3 access logs.
5. The Privacy Contact starts the clock. "Awareness" under GDPR begins when LingoLinq has a reasonable degree of certainty that an incident has occurred and personal data has been compromised.

### 4.2 Contain (Hour 2 to Hour 8)

1. Rotate any credentials that may be exposed, using the 1Password vault structure.
2. Disable the affected user sessions using `User.revoke_active_sessions!` where appropriate.
3. If a subprocessor is the source, open a support case with them and request a written incident report.
4. If Render services are implicated, pause deployments and snapshot the affected database.
5. If AWS resources are implicated, use CloudTrail and S3 access logs to scope.

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
3. Restore any lost data from the most recent clean backup (Render PostgreSQL rolling 35 day).
4. Confirm tenant isolation is intact: run the data-policy audit job.

### 4.6 Post-Incident (Week 2 onward)

1. Hold a blameless review within 10 business days of containment.
2. Update this runbook with lessons learned.
3. File the incident report with the Privacy Contact and retain for at least 7 years.
4. Update the SUBPROCESSORS.md file if a vendor change is needed.
5. Report the incident to the cyber insurance carrier if the policy requires.

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

## 6. Notification Timelines

| Framework | Regulator | Individuals | Source |
|---|---|---|---|
| GDPR | Supervisory authority within 72 hours of awareness | Without undue delay when high risk to rights and freedoms | Articles 33 and 34 |
| UK GDPR | ICO within 72 hours | Same as GDPR | Data Protection Act 2018 |
| HIPAA | HHS Secretary within 60 days if 500+ affected, annually if fewer | Individuals within 60 days of discovery | 45 CFR §§ 164.404, 164.408 |
| HIPAA (prominent media) | Media notice in the affected state if 500+ residents of a state | n/a | 45 CFR § 164.406 |
| FERPA | No federal timeline; cooperate with district notice obligations | Per state law | 34 CFR Part 99 |
| COPPA | FTC notification not mandatory but recommended if the breach is material | Parents must be notified | 16 CFR Part 312 |
| Illinois SOPPA | Affected district within 30 days | District notifies parents within 30 days of being notified | 105 ILCS 85 |
| California SB 1177 (SOPIPA) | Customer district per contract | District notifies under Cal. Civ. Code 1798.29 | Cal. Ed. Code 22584 |
| New York Ed Law 2-d | Customer district within seven calendar days of discovery | District notifies parents | 8 NYCRR Part 121 |
| Texas SB 820 / HB 3 | District within 15 days (for schools) | Per state breach statute | Tex. Ed. Code 11.175 |
| US state breach laws (general) | Attorneys General per state statute, typical window 30 to 60 days | Residents per statute | Varies |

Actual timing decisions are made by the Privacy Contact in consultation with Legal. When in doubt, notify earlier rather than later.

## 7. Vendor Notification List

Subprocessors to notify whenever a breach may implicate their service. See SUBPROCESSORS.md for full contact information.

- AWS: security@amazon.com for abuse, AWS Support case for BAA-scoped incidents, BAA contact on file under account 2390-4478-5114
- Render: support@render.com, plus the Render security contact when established
- HubSpot: privacy@hubspot.com, plus the DPA breach-notice email
- Sentry: security@sentry.io
- OpenAI: security@openai.com and the enterprise support portal
- Anthropic: privacy@anthropic.com and the trust portal
- Google (Gemini, Workspace, Maps): the Google Cloud incident form
- Pusher: support@pusher.com
- n8n: operated on LingoLinq Render infrastructure; no external vendor notice beyond Render
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
> DPO contact: privacy@lingolinq.com

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

## 10. Testing and Continuous Improvement

- Tabletop exercise: annually at minimum, within the month of October each year.
- Runbook review: annually or within 30 days of any SEV-0 or SEV-1 incident.
- Notification template review: every 18 months to stay aligned with statutory changes.
- Contact directory (section 7) review: quarterly.

## 11. Appendix: Key References

- FERPA regulations: 34 CFR Part 99
- HIPAA Breach Notification Rule: 45 CFR §§ 164.400 to 164.414
- GDPR Articles 33 and 34
- COPPA Rule: 16 CFR Part 312
- NIST SP 800-61 Rev 2, "Computer Security Incident Handling Guide"
- LingoLinq DATA_RETENTION.md
- LingoLinq SUBPROCESSORS.md
- LingoLinq COMPLIANCE.md
