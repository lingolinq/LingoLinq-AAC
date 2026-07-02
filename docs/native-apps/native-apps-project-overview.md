# LingoLinq Native Apps: Project Overview

**Audience:** the whole team (developers and non-developers).
**Purpose:** get everyone caught up on what the Native Apps project is, why it matters, what
has already been decided, what the risks are, and what happens next.
**Status:** Phase 1 (the decision gate) decisions are locked. Ready to start the work.
**Last updated:** 2026-06-30

> New to the jargon? Jump to the [Glossary](#glossary) at the bottom first. Words like
> Capacitor, Cordova, D-U-N-S, MSIX, and IAP are all explained there in plain language.

---

## 1. The one-paragraph summary

LingoLinq already works in a web browser. This project makes it ship as a real, installable
**app** on the three platforms our customers actually use: **iPad/iPhone, Android, and
Windows**. We are reviving and modernizing an old, dormant app-packaging pipeline rather than
rewriting the app from scratch. The single most important outcome is that school districts
and hospitals can install LingoLinq through their normal channels (Apple School Manager,
Google Play, and Windows MDM), the app keeps working offline, and we satisfy the app stores'
privacy and child-safety requirements. We ship in priority order: **iPad/iOS first, then
Android, then Windows.**

---

## 2. Why we are doing this (the ultimate goals)

LingoLinq is an AAC (Augmentative and Alternative Communication) app. Our primary customers
are US school districts and hospitals, plus European clients. Those organizations do not
hand out web links; they deploy **apps** through managed systems. If LingoLinq is not a
proper app on the App Store, Google Play, and Windows MDM, large customers cannot adopt it at
scale.

**The goals, in order of importance:**

1. **Be installable and store-approved** on iPad/iOS, Android, and Windows.
2. **Be centrally deployable** by IT admins through Apple School Manager, Google Play, and
   Intune/MDM (this is how schools and hospitals actually roll out software).
3. **Keep offline AAC working.** Many AAC users rely on the app with no internet. Offline
   must stay intact.
4. **Satisfy compliance and store gates.** Privacy labels, child-safety (COPPA) consent, and
   account deletion are required to get approved and to stay compliant with FERPA, HIPAA,
   GDPR, and COPPA.

**What success looks like:** a parent, a clinician, or a school IT admin can find and install
LingoLinq through their normal app channel, it works offline, and it passes every store
review on the first or second try.

---

## 3. The strategy in plain terms

LingoLinq is a fork of an older open-source app (CoughDrop). It once shipped as apps using a
now-outdated tool called **Cordova** (for mobile) and **Electron** (for desktop). That
pipeline has been sitting unused and is built on technology that is no longer maintained.

Three core strategy decisions (already confirmed):

- **Reuse, do not rewrite.** We keep the existing app and wrap it in a modern native shell.
  We are **not** rebuilding LingoLinq in Swift/Kotlin/WinUI. That would cost many months and
  add no user value.
- **Mobile moves from Cordova to Capacitor 7.** Capacitor is the modern, maintained successor
  to Cordova and reuses our existing web build. (Capacitor 7 specifically, because it is
  compatible with the Node 20 version our app is pinned to.)
- **Desktop stays on Electron.** Capacitor has no desktop path, and Electron is already in our
  codebase. We refresh it for Windows.

**Two things this project is explicitly NOT:**

- It is **not** the Ember 3.28 to 6.x upgrade. That is a separate, parallel track and is
  **not** a prerequisite here. The native apps do not wait on it.
- It is **not** the AI Data-Sharing / COPPA-consent VPC project, which is a different
  initiative running in parallel. We will coordinate with it (for the child-consent gate) but
  it is its own effort.

---

## 4. Where we are today

- The strategy is set and confirmed.
- Four detailed research-and-evidence documents have been written and committed (see
  [Reference documents](#reference-documents)). They cover vendor registration, store
  identity, the full list of native features to migrate, and the privacy data map.
- **Phase 1's irreversible decisions are now locked** (see the next section). This is the
  important milestone: these are the choices that cannot be undone after a store record
  exists, so they had to be made before any app code is touched.
- No app-packaging code has been written yet. That is intentional. Phase 1 is a decision and
  registration gate that comes first.

---

## 5. The big decisions we just locked (Phase 1)

Phase 1 is a "decision gate." Some app-store choices are effectively permanent once a store
listing exists, so we made them deliberately and up front. Here is each decision, in plain
language, with why.

| Decision | What we chose | Why it matters |
|---|---|---|
| **How Apple users get the app** | **Public App Store** (anyone can find and install it) | Schools still buy in bulk through Apple School Manager with education pricing, and individual parents and clinicians can also buy it directly. This keeps both the school channel and the family channel open. The other options (private or unlisted) would have cut off individual buyers. |
| **Old store listings vs new** | **Start fresh** under the LingoLinq LLC company account, on both Apple and Google | The old store listings live in an account we cannot recover, so transferring them is not possible. Starting fresh also gives us a clean privacy and compliance baseline. |
| **App identifiers** | **New identifiers**, but verify first whether any old ones can be reused | The old identifiers are almost certainly locked to that unrecoverable account. We will confirm before committing to new names, so there are no surprises during registration. |
| **Existing installed users** | **Treated as negligible / web-first** | Because we are starting fresh, there is no automatic "update in place" path from the old app anyway, and the active base is web-first. This means preserving old cached boards is a "nice to have," not a launch blocker. (This is a deliberate, considered change from an earlier worst-case assumption.) |
| **How people pay** | **v1: B2B invoicing only, NO in-app purchases.** Individual self-serve subscriptions are deferred to a v1.1 fast-follow. (Updated 2026-06-30.) | Districts and hospitals pay by invoice as today, which is B2B commerce outside the stores' payment rules (zero store cut). Declaring **no in-app purchases** keeps the first store review the simplest possible and lets the 2026 billing rules settle (Apple's external-link case is at the Supreme Court; Google's fee structure changed 2026-06-30) before we commit code and a permanent privacy declaration. Individual subscriptions land in v1.1, the same way eye-gaze does. (Full rationale: internal GSD planning record.) |
| **App structure** | **One app** (not the old free + paid two-app split); subscription added in v1.1 | One listing per store to maintain, one privacy form, one review. This matches how modern AAC apps are sold and how Apple now recommends. The individual subscription plugs into this single app when v1.1 ships. |
| **Eye-gaze / head-tracking in version 1** | **Defer to a fast-follow update (v1.1)**, behind a feature flag | Camera-based eye-gaze is by far the hardest feature to migrate and carries the most technical risk. Shipping version 1 on touch and switch access lets us get to the App Store sooner without that risk on the critical path. Eye-gaze users can use the iPad's built-in accessibility in the meantime, and we add our in-app version shortly after. |

> The full reasoning, alternatives considered, and evidence for each decision live in the
> Phase 1 context record and the four reference documents.

---

## 6. The roadmap (four phases)

The phases are mostly sequential because vendor accounts and the migration work gate
everything, and because proving the pipeline on iOS de-risks Android and Windows.

### Phase 1: Registration and Foundations (the decision gate) <- we are here

Get every vendor account started under LingoLinq LLC, create the app project repositories,
and lock the irreversible store decisions (done; see section 5). Most of this has no code
dependency and can start immediately.

**Key gating item:** the **D-U-N-S Number** (a free business-identity number Apple requires)
can take up to about a week to obtain, and Apple registration cannot start until it clears.
So we begin that on day one.

### Phase 2: Capacitor Migration + iOS

Move the app from Cordova to Capacitor 7, get every needed native feature working again, and
submit to the App Store with all 2026 compliance pieces in place (privacy manifest, nutrition
label, account deletion, age rating). This is the de-risking phase: iOS is the strictest
reviewer, so we absorb that first.

### Phase 3: Android

Ship the same Capacitor app on Google Play: modern Android target, the Play "Data Safety"
form, the child-safety (Families/COPPA) consent gate, and account deletion. This reuses most
of Phase 2's work.

### Phase 4: Windows (Electron)

Refresh the Electron desktop app and ship it for Windows as an MSIX package (for school IT
deployment via Intune/MDM) plus a direct-download installer, code-signed with Azure. This can
run in parallel with Android once Phase 1 is done, since it shares no mobile code.

---

## 7. Key risks and watch items

| Risk / watch item | Plain-language explanation | How we handle it |
|---|---|---|
| **D-U-N-S lead time** | Apple AND Google both require a business-identity number (D-U-N-S) for organization accounts; it can take ~1 week to get and blocks both registrations. | Start it on day one of Phase 1. It gates Apple and Google; Microsoft can start without it (document path) and is faster with it. |
| **Offline data on migration** | Switching the underlying app tech can, in the worst case, wipe a device's locally cached boards. | Downgraded to a "nice to have" because we are starting fresh (no in-place update path). Still tested during Phase 2 for the rare sideloaded user. |
| **Hidden broken features** | Many native features (audio routing, text-to-speech, file storage, etc.) silently stop working if missed during migration. | We have an exhaustive, evidence-based inventory of every one of them (the bridge inventory doc). Each is verified before submission. |
| **Eye-gaze complexity** | Camera-based eye-gaze has no drop-in modern equivalent and is performance-sensitive. | Deferred out of version 1 to a fast-follow update, so it does not delay the first App Store launch. |
| **App store review rejections** | Apple and Google reject apps for inconsistent or incomplete privacy declarations and for unclear use of camera/microphone. | One privacy data map feeds all three store declarations so they agree. AAC use case documented for reviewers. |
| **Child safety / COPPA** | We serve under-13 users, which triggers strict child-data rules. | Store-level Families/COPPA consent gate; coordinate with the parallel consent project rather than duplicating it. |
| **Premium voices** | High-quality (Acapela) voices depend on a native bridge; without it they degrade to lower quality. | Tracked as a HIGH-risk bridge in the inventory; migrated in Phase 2. |

---

## 8. Roles and ownership

> Decision-making and all vendor-account actions sit with Scot (CEO). Development assignments
> below are the working plan; confirm names as the team is finalized.

| Area | Owner | Notes |
|---|---|---|
| All vendor registrations (D-U-N-S, Apple, Google, Microsoft, Azure signing) | **Scot** | The research docs are read-only checklists; the actual account actions are Scot's. Credentials go to 1Password, never the repo. |
| Locking store/business decisions | **Scot** | Done for Phase 1 (section 5). |
| Capacitor migration, native features, CI/CD, app repos | **Development (assignee TBC)** | The heaviest engineering, mostly in Phase 2. |
| Compliance and privacy declarations | **Compliance review + Scot sign-off** | Privacy content is reviewed internally and signed off by Scot; never routed to outside AI tools. |
| Operations and procurement coordination | **Dominic** | Helps coordinate account setup, fees, and vendor admin. |

---

## 9. Next steps

### Immediate (Phase 1, can start now)

1. **D-U-N-S Number (day one):** look it up with Apple's free tool; if none exists, request it
   (free, about 5 business days). This is the long pole for **both Apple and Google**.
2. **Lock the legal entity details:** exact company name (LingoLinq LLC), address, work phone,
   work email, public website. Every vendor account must use these identically.
3. **Start Microsoft Partner Center** via the fee-free flow (storedeveloper.microsoft.com),
   selecting a **Company** account (no D-U-N-S needed via the document path, so it runs in
   parallel while D-U-N-S is pending). Individual->Company conversion is not supported, so pick
   Company from the start.
4. **When D-U-N-S clears:** start **Apple Developer Program** and **Google Play Console** org
   registrations (both require D-U-N-S for organization accounts).
6. **Create the app project repositories** under the LingoLinq org and sort out the missing
   build-config file (`lib/domains.json`). Note: Capacitor generates its own iOS/Android
   projects, so this may be replaced rather than rebuilt as it was in the Cordova era.
7. **Verify whether any old app identifiers can be reused** before committing to new ones.
8. **Confirm the privacy and child-safety items** against the live code (the compliance
   review checklist in the privacy data map doc).

### Then (Phase 2 onward)

- Begin the Capacitor 7 migration and iOS submission once the Apple account and store
  identity are in place.
- Azure code-signing identity verification should start before Phase 4 (it has its own lead
  time).

### Process note (for the devs)

This project is being run through our GSD workflow. The next command turns the locked Phase 1
decisions into an executable, step-by-step plan:

```
/gsd-plan-phase 1
```

---

## 10. Reference documents

These are the detailed source documents. They live in the repository under
`docs/native-apps/`. The first four are committed; the Phase 1 context record is in the
project's local planning folder.

| Document | What it covers | For whom |
|---|---|---|
| `docs/native-apps/vendor-registration-and-duns.md` | Step-by-step, week-one checklist for D-U-N-S and all three vendor accounts, with verified facts and fees | Scot, ops, anyone doing registration |
| `docs/native-apps/store-identity-disposition.md` | The transfer-vs-fresh analysis and store identity decisions | Scot, leads |
| `docs/native-apps/native-bridge-inventory.md` | The exhaustive list of every native feature to migrate, rated by risk | Developers |
| `docs/native-apps/privacy-data-flow-evidence-map.md` | **Single source of truth** (code-cited) for all three app-store privacy declarations and compliance mapping | Compliance, Scot |
| `docs/native-apps/privacy-data-flow-map.md` | Team-facing plain-English narrative companion to the evidence map (context, not the declaration source) | Whole team |
| `.planning/.../01-CONTEXT.md` | The locked Phase 1 decisions with full rationale (GSD planning record) | Leads, planners |

---

## Glossary

Plain-language definitions for the non-developers (and a refresher for everyone).

- **AAC** (Augmentative and Alternative Communication): software that helps people who cannot
  speak communicate, for example by tapping picture buttons that are spoken aloud. This is
  what LingoLinq is.
- **Native app:** a real installable app (the kind you get from an app store), as opposed to a
  website you open in a browser.
- **Cordova:** the old, no-longer-maintained tool that used to package LingoLinq as a mobile
  app. We are moving off it.
- **Capacitor:** the modern, maintained replacement for Cordova. It wraps our existing web app
  into a native mobile app. We are using Capacitor 7.
- **Electron:** the tool that packages our app for desktop (Windows). We are keeping it.
- **D-U-N-S Number:** a free, unique business-identity number from Dun and Bradstreet. Apple
  requires it to register a company developer account. It can take about a week, so we start
  it first.
- **Apple School Manager / Intune / MDM:** systems that let a school or hospital's IT
  department install and manage apps on many devices at once. This is how our customers
  actually deploy software.
- **App Store / Google Play:** Apple's and Google's app stores.
- **MSIX:** the modern Windows app package format that IT departments can deploy centrally.
- **Code signing:** a digital signature that proves an app really comes from us and has not
  been tampered with. Required by the platforms. We use Azure for Windows signing.
- **IAP (In-App Purchase):** buying or subscribing from inside the app, where Apple or Google
  process the payment and take a cut. For **v1 we declare no in-app purchases** (schools pay by
  invoice, which is outside the stores' payment rules); individual in-app subscriptions are
  deferred to a v1.1 fast-follow.
- **AAB:** the app package format Google Play requires for Android.
- **Offline support:** the app keeps working with no internet, using boards cached on the
  device. Critical for many AAC users.
- **COPPA / FERPA / HIPAA / GDPR:** the privacy and child-safety laws we must comply with
  (children's privacy, US student records, US health data, and EU data protection,
  respectively).
- **Privacy nutrition label / Data Safety form / privacy manifest:** the public, app-store
  declarations of what data the app collects and shares. All three must agree with each other.
- **Eye-gaze / head-tracking:** an access method where the user controls the app with their
  eyes or head movement via the camera, instead of touch. A powerful accessibility feature,
  and the hardest one to migrate, so it lands in a fast-follow update.
- **GSD:** our internal "Get Shit Done" planning workflow that turns decisions into
  step-by-step, trackable execution plans.

---

*Prepared for team review. Questions or corrections welcome before this goes to Notion for
the wider team.*
