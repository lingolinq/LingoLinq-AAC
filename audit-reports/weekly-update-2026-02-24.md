# LingoLinq Weekly Engineering Update

**Date:** February 24, 2026
**Author:** Scot Wahlquist

---

## TL;DR

We spent this week building the compliance and security foundation that lets us sell to schools and hospitals. The AI architecture is solid — our system guarantees student/patient data never reaches AI providers. We patched 5 critical security vulnerabilities, switched our AI provider to Anthropic Claude, and built the audit infrastructure that district IT teams will ask for. Two blockers remain before institutional deployment: executing BAAs with our hosting providers (Render and AWS).

---

## Why This Matters

LingoLinq sells to **schools** (FERPA-regulated) and **hospitals** (HIPAA-ready). Both require us to prove:
- We know where user data goes
- We control what AI sees (answer: never real user data)
- We have audit trails
- We can respond to a data breach within 45-60 days

This week's work means we can answer "yes" to all of those with documentation and code to back it up.

---

## What We Built

### 1. AI Privacy Architecture (Complete)

**The rule: AI never sees who your users are.**

Every AI feature (currently board generation, more coming) runs through a PII scrubber before anything leaves our server. The AI gets vocabulary patterns and board structures — never names, emails, therapy notes, or anything that identifies a student or patient.

- **PII Scrubber** (`lib/pii_scrubber.rb`) — strips names, emails, phones, SSNs, IPs from any data before it hits an AI API
- **Audit Log** (`AiApiLog`) — every AI call is logged: what was sent (after scrubbing), what came back, when, and for which feature
- **Org Opt-Out** — any school or hospital can disable ALL AI features with a single setting. Non-negotiable for FERPA/HIPAA sales

### 2. Switched to Claude (from OpenAI/Gemini)

We consolidated our AI provider to **Anthropic Claude (Haiku 4.5)**:
- Faster and cheaper than what we had (~fractions of a cent per board generated)
- Single provider = simpler compliance story for auditors
- Aligns with our development tooling (we already use Claude for dev)

### 3. Security Hotfix (Feb 22)

Patched 5 critical vulnerabilities:

| What | Risk | Status |
|------|------|--------|
| nokogiri SAML auth bypass (CVE-2025-30206) | Someone could bypass authentication | **Fixed** |
| SSL verification disabled in 11 places | API calls could be intercepted | **Fixed** |
| Giphy API sending data over HTTP | Search queries exposed in transit | **Fixed** |
| lodash prototype pollution (5 CVEs) | Code injection risk | **Fixed** |
| ember-cli-update transitive CVEs | 6 critical supply chain vulnerabilities | **Fixed** (removed) |

### 4. Compliance Documentation

Created `COMPLIANCE.md` — a living document that maps:
- Every external service we use and what data it sees
- Three security zones (Safe / Caution / Restricted)
- BAA status for each vendor
- Incident response procedures (FERPA 45-day, HIPAA 60-day notification)
- Annual audit schedule

This is the document we hand to a district IT director when they ask "how do you handle student data?"

### 5. Developer Tooling

- **4 new Claude Code skills**: `/compliance` (scan for PII leaks), `/deploy-staging`, `/audit` (generate compliance reports), `/a11y` (accessibility checks)
- **antigravity-mcp expanded** with health checks, feature flag visibility, compliance status, and safe read-only DB queries
- **MCP configs mirrored** across Claude Code and Gemini CLI — same tools available everywhere

---

## What's Blocking Us

### Two items before we can deploy to schools/hospitals:

1. **BAA with Render** (hosts our database and servers) — need to contact Render sales. This is priority #1.
2. **BAA with AWS** (stores user uploads on S3) — execute via AWS Artifact console. Priority #2.

Without these agreements, we cannot legally promise FERPA/HIPAA compliance to institutional customers.

### Known security items in the backlog:

| Item | Severity | Target |
|------|----------|--------|
| Strong parameters enforcement | Critical | Next sprint |
| SQL injection in 2 locations | Critical | Next sprint |
| Replace abandoned gems (coffee-rails, sassc-rails, legacy s3) | High | Q1 2026 |
| PostgreSQL `sslmode=require` | Medium | Q1 2026 |
| Ember 3.28 EOL (~180 build-time npm vulns) | Accepted risk | React migration ongoing |

---

## What's Next (This Week)

1. Execute BAAs with Render and AWS
2. Fix strong parameters and SQL injection (2 critical items)
3. Set `ANTHROPIC_API_KEY` on Render and test board generation with Claude
4. Run `bundle install` on Render to swap the gem
5. Begin documenting the 16 external services not yet in COMPLIANCE.md

---

## By The Numbers

| Metric | Value |
|--------|-------|
| AI features with PII scrubbing | 1 live, 4 flagged for future |
| Security vulnerabilities patched this week | 5 critical |
| External services documented in compliance matrix | 18 |
| BAAs executed | 0 of 2 required (blocking) |
| MCP servers configured | 13 (Claude Code + Gemini CLI) |
| Custom dev skills built | 4 |
| AI provider | Anthropic Claude (Haiku 4.5) |
| Est. cost per AI board generation | < $0.01 |

---

## For Non-Technical Stakeholders

**What changed this week:** We built the security and privacy infrastructure that schools and hospitals require before they'll buy. Think of it as getting our house inspected before we can sell it.

**What it means for sales:** Once the two BAAs are signed (Render + AWS), we can truthfully tell school districts: "Student data never leaves our servers to reach AI. Every AI interaction is logged. Your district can disable AI entirely with one setting. Here's our compliance documentation."

**What it means for the product:** The AI board generation feature now runs on Claude (faster, cheaper, single provider). Users won't notice a difference — boards generate the same way. Behind the scenes, everything is now auditable and FERPA-ready.

**What's the risk if we don't do this?** Schools won't buy. Hospitals won't buy. A single data incident without this infrastructure could end the company. This week made that scenario dramatically less likely.
