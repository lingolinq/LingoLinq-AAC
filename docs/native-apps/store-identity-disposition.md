# Store Identity Disposition (Phase 1 artifact)

**Status:** DRAFT for Scot's decision. Part of the Phase 1 hard decision gate.
**Owner:** Scot (decision) + Claude Code (evidence). Vendor-fact citations from fresh lookups (see end).
**Why this is a gate:** App Store and Play store records carry identifiers (Bundle ID,
numeric App Store id, Android package name) that are effectively permanent once a record
exists. Choosing "transfer the legacy record" vs "create a fresh record" changes the
existing-user upgrade story and is hard or impossible to undo after first approval.

---

## 1. The identities we inherited (evidence from this repo)

These are real references found in the current codebase, not assumptions:

| Identity | Value | Evidence (file:line) | Notes |
|----------|-------|----------------------|-------|
| Apple App Store numeric id | `1021384570` | `lib/tasks/extras.rake:362` (`itunes.apple.com/.../lingolinq/id1021384570`) | CoughDrop-era id; the listing slug is already `lingolinq`, so the record appears to have been renamed, not recreated. |
| iOS Bundle ID (free app) | `com.mylingolinq.lingolinq` | `lib/purchasing.rb:886` (commented), `extras.rake:353` (Play link reuses the string) | Already LingoLinq-branded (not `com.coughdrop.*`). |
| iOS Bundle ID (paid app) | `com.mylingolinq.paidlingolinq` | `lib/purchasing.rb:747`, `888` | Active. A SECOND iOS app identity (paid variant). See IAP note below. |
| Android package | `com.mylingolinq.lingolinq` | `lib/tasks/extras.rake:353` (`play.google.com/store/apps/details?id=...`) | Same string as the iOS free bundle. |
| Marketing/download domain | `mylingolinq.com` | `extras.rake:371`, `footer.hbs:8` | Already LingoLinq-branded. |

**Key observation:** the bundle/package strings are already `com.mylingolinq.*`, so the
rename from CoughDrop to LingoLinq already happened at the identifier level. The open
question is therefore NOT "is this still branded CoughDrop" but **"which Apple/Google
developer account currently owns these live store records, and do we transfer them into
the new LingoLinq Inc org account or start fresh?"**

**Two-app structure to resolve:** there are two iOS identities in the code, a free app
(`com.mylingolinq.lingolinq`) and a paid app (`com.mylingolinq.paidlingolinq`). Before
listing, decide whether the native-apps era keeps the legacy free+paid split or collapses
to a single app with in-app purchase / B2B licensing. This decision is coupled to the IAP
exposure decision (a separate Phase 1 gate item) and to whether we transfer one, both, or
neither legacy record.

---

## 2. The decision: transfer vs fresh, per store

This must be decided for BOTH Apple and Google independently, because each has its own
transfer mechanics.

### 2a. Pre-decision fact-finding (Scot, before deciding)

1. **Who owns the live records?** Log into the Apple Developer account and Google Play
   Console that currently hold app id `1021384570` / package `com.mylingolinq.lingolinq`.
   Determine: is it an account LingoLinq controls, an original CoughDrop/legacy account, or
   a personal account? Transfer is only possible from an account we can sign into.
2. **Are the listings still live / installed?** Check current install base and whether the
   listings are published or removed. This determines whether there is an existing-user
   migration obligation at all (ties to the offline-data-survival gate and PROJECT.md open
   question "is there an installed user base").
3. **Account standing:** confirm no outstanding agreements, unpaid fees, or legal holds
   that would block a transfer.

### 2b. Decision matrix

| Option | When it is right | Pros | Cons / risk |
|--------|------------------|------|-------------|
| **Transfer the existing record** into LingoLinq Inc org | There is a real installed base, and we control (or can recover) the owning account | Existing users update in place; keeps ratings, reviews, and the numeric App Store id; no "two apps in the store" confusion | Both source and destination accounts must meet transfer prerequisites; coupled to the offline-data-survival gate (an in-place update must not wipe cached boards) |
| **Create a fresh listing** under LingoLinq Inc | No meaningful installed base, or the legacy account is unrecoverable, or we want a clean compliance baseline | Clean slate for privacy manifest / data safety / distribution method; no dependency on legacy account standing | Loses ratings/reviews and the legacy numeric id; existing users (if any) must manually migrate (find + reinstall), which for AAC users is disruptive |

**Default recommendation (pending 2a):** if LingoLinq controls the owning accounts and any
real installed base exists, **transfer** (preserves AAC users' continuity, which is the
project's core-value constraint). If the legacy accounts are unrecoverable or the base is
negligible, **create fresh** for a clean compliance baseline. Decide per store after 2a.

---

## 3. Coupled irreversible decisions to lock in the same gate

These interact with store identity and must be decided together, before any store record
is created or transferred:

- **Apple distribution method** (public App Store vs unlisted vs private/custom via Apple
  Business/School Manager). This **cannot be changed after approval** except public ->
  unlisted; private <-> public requires a NEW app record. So it must be right the first
  time, and it constrains the transfer-vs-fresh choice. Source:
  https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods/
- **IAP exposure / monetization surface.** The legacy free+paid two-app split
  (`com.mylingolinq.lingolinq` + `com.mylingolinq.paidlingolinq`) predates the current
  B2B model. Decide: B2B district invoicing only (generally outside store payment rules),
  vs individual on-device subscriptions (triggers Apple/Google in-app purchase and their
  cut). This determines whether we keep, retire, or repurpose the paid bundle id.
- **Fresh vs inherited app IDs** must be consistent with the IAP decision: if we retire the
  paid app, we do not transfer `com.mylingolinq.paidlingolinq`.

---

## 4. Apple app transfer mechanics (confirmed 2026-06-24)

- Apple's app-transfer process moves an app between developer accounts **keeping the same
  Bundle ID and App Store numeric id** (so the listing, ratings, reviews, update history,
  and id `1021384570` all carry over). Source:
  https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer/
- The Bundle ID **cannot be changed once a build has been uploaded**, so a transfer is the
  only way to keep `com.mylingolinq.lingolinq` if we want the existing identity under the
  new org account.
- Mechanics: initiated by the current **Account Holder** in App Store Connect, accepted by
  the receiving Account Holder. Both accounts must meet Apple's transfer prerequisites
  (agreements signed, no blocking contracts).
- Transfer does NOT change the distribution method automatically; the Section 3 distribution
  decision still applies to the transferred record.

## 5. Google app transfer mechanics (confirmed 2026-06-24)

Google Play has its OWN transfer process, distinct from Apple's. Source:
https://support.google.com/googleplay/android-developer/answer/6230247

- **Prerequisite:** BOTH the source and target accounts must be registered and active with
  the one-time $25 registration fee paid.
- **Steps:** submit a transfer request at
  `https://play.google.com/console/developers/app-transfer`; the target developer accepts;
  Google support reviews within ~2 business days.
- **What transfers:** all users, install stats, ratings, reviews, content ratings, store
  listing, and subscriptions. The package name `com.mylingolinq.lingolinq` is preserved.
- **What does NOT transfer (must be redone manually):** payout/earnings reports, test
  groups, integrated-service permissions (Firebase, AdMob, etc. need re-linking), and
  promotions. Budget for re-wiring these after a transfer.

---

## 6. Open items for Scot to resolve in this gate

- [ ] Sign into the accounts owning `1021384570` and `com.mylingolinq.lingolinq`; record
      who controls them and their standing (Section 2a).
- [ ] Decide transfer vs fresh for Apple.
- [ ] Decide transfer vs fresh for Google.
- [ ] Decide the free/paid two-app fate (keep split, collapse to one + IAP, or B2B-only).
- [ ] Lock the Apple distribution method (Section 3).
- [ ] Confirm there is or is not an installed Cordova-app user base to migrate (feeds the
      Phase 2 offline-data-survival entry gate).

---

*Sources: codebase references cited inline (file:line); Apple distribution-method doc cited
in Section 3; Apple/Google transfer mechanics to be confirmed against current official
transfer docs (vendor-research lookups). All forward-looking vendor facts re-verified the
week of 2026-06-23 per the SaaS-freshness rule.*
