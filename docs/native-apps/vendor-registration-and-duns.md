# Vendor Registration + D-U-N-S Request Steps (Phase 1 artifact)

**Status:** Action plan for Scot. Read-only research; no account actions taken by Claude.
**Owner:** Scot (all account actions). Facts verified fresh 2026-06-24 from official sources.
**Purpose:** the D-U-N-S Number and the three vendor accounts are the long-lead-time gate on
the whole native-apps initiative. This is the ordered "do it in week one" checklist with
the real, cited requirements.

---

## 0. Corrections to the strategy doc (verified 2026-06-24)

The seed strategy doc (`2026-06-23-native-apps-strategy.md` section 5) had a few figures
that fresh lookups corrected. Use THIS doc's numbers:

| Claim in strategy doc | Verified fact (2026-06-24) | Source |
|-----------------------|----------------------------|--------|
| D-U-N-S "up to 30 days (Google-side)" | Apple's official page says **up to 5 business days** from D&B, + up to 2 business days for Apple to receive the data. The "30 days" figure is not in current official docs. | developer.apple.com/help/account/membership/D-U-N-S/ |
| Google Play org accounts "exempt from the 12-tester rule" (stated as fact) | Official doc scopes the rule to **personal accounts created after 2023-11-13**. The org exemption is asserted by a Google Product Expert in the support forum, **not** in official policy text. Confirm at registration. | answer/14151465 + support thread 398243168 |
| Google Play needs D-U-N-S | **Google does NOT require D-U-N-S.** It uses its own identity verification (government ID + business docs). | Google Play Console docs (no D-U-N-S mention) |
| Microsoft Partner Center "free (MS dropped the fee)" | Correct, but ONLY via the **new flow at storedeveloper.microsoft.com**. Other entry points still show the legacy paid flow. | learn.microsoft.com .../open-a-developer-account |
| Apple $99/yr, transfer keeps Bundle ID | Confirmed. | developer.apple.com/programs/enroll/ |

**Net effect on sequencing:** D-U-N-S is still the long pole, but it is **Apple and
Microsoft** that benefit from it, not Google. Google can proceed independently of D-U-N-S.

---

## 1. D-U-N-S Number (do this first)

D-U-N-S is **required by Apple** (mandatory for org enrollment) and is the **fast path for
Microsoft** (recommended, not mandatory). Google does not use it.

### Step 1a. Check if LingoLinq Inc already has one (free, instant)
1. Go to Apple's free lookup tool: https://developer.apple.com/enroll/duns-lookup/
2. Enter the **exact legal entity name** and **headquarters address** of LingoLinq Inc.
   (Use the incorporation name. DBAs, trade names, and branch names are NOT accepted.)
3. If a number is returned, record it. Done. (CoughDrop-era incorporation or a prior Apple
   enrollment may already have created one.)

### Step 1b. If none found, request one (free, ~5 business days)
1. The same lookup form gives you the option to submit your info to D&B for a **free**
   D-U-N-S Number. Use that path (do not pay a third party or D&B for expedited service;
   Apple's page states expediting does **not** shorten the wait).
2. Have ready: legal entity name, HQ address, mailing address, work contact name/phone/email.
   D&B may call to verify business type, employee count, and registration documents.
3. Expect **up to 5 business days** from D&B, then up to 2 more for Apple to ingest it.

**Owner:** Scot. **Blocker downstream:** Apple org enrollment cannot start until this clears.

---

## 2. Confirm the canonical legal entity details (do alongside step 1)

Every vendor account and the D-U-N-S record must use the **exact same** legal entity name
and address, or verification stalls. Lock these now and reuse verbatim:

- [ ] Exact legal entity name (as incorporated)
- [ ] Headquarters address
- [ ] Mailing address (if different)
- [ ] Work phone matching public business registries
- [ ] A work email on the company domain (developer email is shown publicly on the stores)
- [ ] Public website on the company domain (all three stores check this)

---

## 3. Apple Developer Program (organization)

- **Requires D-U-N-S:** yes (mandatory). Wait for step 1.
- **Fee:** $99 USD / year (fee waiver possible if LingoLinq qualifies as nonprofit/edu).
- **Also needs:** public website on the org domain, work email on the domain, a person with
  legal authority to bind the organization.
- **Path:** standard Apple Developer Program, NOT the Enterprise program (Enterprise is
  internal-only distribution and is the wrong path for school/App Store distribution).
- **Enroll:** https://developer.apple.com/programs/enroll/
- **Owner:** Scot. **Start:** as soon as D-U-N-S clears.

## 4. Google Play Console (organization)

- **Requires D-U-N-S:** NO. Can start immediately, in parallel with the D-U-N-S wait.
- **Fee:** $25 USD one-time (no annual renewal).
- **Verification:** Google's own identity check (government ID + business documents).
- **12-tester rule:** confirm during registration whether it applies to this org account.
  Official policy scopes it to personal accounts; an org exemption is indicated but not
  guaranteed in policy text. Do not rely on the exemption until the console confirms it.
- **Also needs:** public website, org phone matching public registries, a non-personal
  developer email (shown publicly).
- **Owner:** Scot. **Start:** now (no D-U-N-S dependency).

## 5. Microsoft Partner Center (company)

- **Requires D-U-N-S:** recommended (fast, automated path), not mandatory (document-upload
  path adds 2-5 business days of manual review).
- **Fee:** FREE via the new flow. **You must start at https://storedeveloper.microsoft.com**
  to get the fee-free path; other entry points still show the legacy paid flow.
- **Verification:** work email on the company domain or domain-ownership documents.
- **Owner:** Scot. **Start:** now (D-U-N-S optional but speeds it up).

## 6. Azure Artifact Signing (Windows code signing; needed for Phase 4, start early)

- **Cost:** $9.99/month Basic (up to 5,000 signatures; $0.005 each after). Premium
  $99.99/month if volume ever needs it. Pricing unchanged from the "Trusted Signing" era.
- **Geographic limit:** Public Trust certificates are available only to organizations in the
  **USA, Canada, EU, and UK**. (LingoLinq Inc / US: fine.)
- **Identity verification:** legal entity name, org-domain website + emails, business
  identifier, physical address, plus a **named individual** who completes a personal ID
  check via Microsoft's third-party verifier (AU10TIX) with a government photo ID.
- **Lead time:** 1 to 20 business days.
- **D-U-N-S:** not required for this; verification is independent.
- **Owner:** Scot or dev. **Start:** before Phase 4 (Windows); it has its own lead time.

---

## 7. Recommended week-one order

1. **Day 1:** D-U-N-S lookup (step 1a). If none, request it (step 1b). Lock legal entity
   details (step 2).
2. **Day 1 (parallel):** start Google Play Console org registration (no D-U-N-S needed) and
   Microsoft Partner Center via storedeveloper.microsoft.com (document path or wait for
   D-U-N-S for the fast path).
3. **When D-U-N-S clears (~1 week):** start Apple Developer Program org enrollment.
4. **Before Phase 4:** begin Azure Artifact Signing identity verification.

All signing material, account credentials, and API keys go to **1Password**, never the repo
or `.env`.

---

## Sources

- https://developer.apple.com/help/account/membership/D-U-N-S/
- https://developer.apple.com/enroll/duns-lookup/
- https://developer.apple.com/programs/enroll/
- https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer/
- https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods/
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/thread/398243168
- https://support.google.com/googleplay/android-developer/answer/6230247
- https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account
- https://azure.microsoft.com/en-us/products/artifact-signing
- https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart

*All facts verified 2026-06-24 per the SaaS-freshness rule. Re-verify before relying on any
fee or policy figure older than ~6 months.*
