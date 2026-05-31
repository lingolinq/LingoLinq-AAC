# LingoLinq MVP Punchlist - from 2026-05-22 DevOps Meeting

**Compiled:** 2026-05-24
**In-repo mirror committed:** 2026-05-28
**Source meeting:** 2026-05-22 DevOps Sync (Melissa, Traci, Omer, Scot)
**Tracking issue (live status):** https://github.com/lingolinq/LingoLinq-AAC/issues/286

> This file is a point-in-time mirror of the 2026-05-24 punchlist. The live,
> authoritative status is the GitHub tracking issue #286. When this mirror and
> #286 disagree, #286 wins.

## Updates since 2026-05-24 (mirror commit note)

- PR #287 merged: SlowWorker cache-clearing gap + PiiScrubber blocklist leak (items 22 + the PiiScrubber finding).
- PR #294 merged: #tree/#bulk lite serialization (`as_lite`), remediation #1 for the Section 3 tree-timeout RCA. Remediations #2 (batch preload) and #3 (request-scoped image cache) remain open.
- PR #304 open: `/database` admin API secure_serialize bypass fix (the Scot-owned High below). Also closes a PaperTrail `versions` re-leak and an urgent live-credential plaintext denylist.
- Issue #305 filed: comprehensive sensitive-plaintext-column audit (follow-up to #304).
- Issue #293 in progress (separate thread): client-side fast-follow to #294.
- `SEED_ADMIN_PASSWORD` (item 26) resolved 2026-05-26 on lingolinq-staging.

## Status legend

- **LANDED-OK** = merged to staging, no known issues
- **LANDED-WITH-ISSUES** = merged but has an open adversary or Sentry finding
- **IN-FLIGHT** = on a branch, not yet merged
- **NOT-STARTED** = no branch, no PR
- **OUT-OF-BAND** = handled outside the GSD milestone (calendar, Notion, async external)

## Meeting items (1-21)

| # | Item | Owner | Status | PR / Branch | Severity | Note |
|---|---|---|---|---|---|---|
| 1 | Sidebar setup test + yes/no board for lingo-linked user | Melissa | NOT-STARTED | - | High | Melissa was actively testing post-meeting; verify status |
| 2 | PIN number + word prediction branches | Melissa + Omer | IN-FLIGHT | PR #283 (open) | Blocker | OPEN PR has Critical (PIN reveal leaks plaintext) and High (scope sprawl: 21 of 23 files are AI word prediction, not PIN). Split required before merge |
| 3 | Board-detail page navigation under preview | Melissa | LANDED-WITH-ISSUES | partial via #281 | Medium | Same-board navigation with route refreshes landed; verify against original meeting concern |
| 4 | Board file structure for multi-language support | Melissa | NOT-STARTED | - | Medium | Investigation item; relates to items 17 + 20 |
| 5 | Caching / sync investigation | Melissa | LANDED-WITH-ISSUES | #281 + #282 | High | board_detail_cache and preview-canvas image fix shipped; adversary High flagged offline blank-cells regression in `board-preview-canvas.js:188-218, 359-364` |
| 6 | Full board preview on Create Board page | Traci | LANDED-OK | #281 | - | Create-board-new rework with live rows x columns preview |
| 7 | Fix paint-mode remove button bug | Traci | LANDED-OK | #281 + #284 | - | Verify in browser smoke test |
| 8 | Drag-and-drop for blank tiles in grid | Traci | IN-FLIGHT | #284 (deferred) | Medium | Foundation improvements deferred to another team member for final polish |
| 9 | Fix font-type menu cut-off on Create Board | Traci | LANDED-OK | #281 | - | Text settings moved into dedicated rail sections |
| 10 | User-selectable grid size before AI generation | Traci | LANDED-OK | #281 | - | Live rows x columns preview, chip-based label inputs |
| 11 | Replace hover-delete with visible delete icon (iPad) | Traci | LANDED-WITH-ISSUES | #281 + #284 | Medium | Hover-actions replaced in modal redesign; verify across all surfaces |
| 12 | Group nouns / verbs on generated boards | Traci | NOT-STARTED | - | Polish | Explicitly future work in meeting |
| 13 | Delete option for non-public boards | Traci | UNCLEAR | possible #281 | Medium | Modal redesign may cover; verify in UI |
| 14 | Translation UI: hide re-translation + loading indicator | Traci | LANDED-WITH-ISSUES | #281 partial | High | Translation refinements landed but loading indicator NOT explicitly delivered; re-translation hiding unclear |
| 15 | Age-restricted swear-word filters for AI generation | Scot | NOT-STARTED | - | High | Phase A of new GSD milestone |
| 16 | Open-symbols updates via Brian | Scot | OUT-OF-BAND | - | Polish | Calendar + Notion page in Master Inbox before call |
| 17 | English-first backend AI generation | Melissa or Omer | NOT-STARTED | - | High | Phase B of new GSD milestone. Preserves Fitzgerald key mapping |
| 18 | License-option removal from Create Board page | Traci | NOT SHIPPED | - | High | Meeting decision; PRs #281-#284 did not deliver. Field remains at `create-board-new.hbs:1105-1140`. Re-open as Phase D |
| 19 | "Creating for someone else" prompt removal | Traci | NOT SHIPPED | - | High | Meeting decision; PRs #281-#284 did not deliver. Field remains at `create-board-new.hbs:137`. Re-open as Phase D |
| 20 | Language indicators on copied boards | Traci | LANDED-WITH-ISSUES | #281 + #284 (UI) | Medium | Badge UI shipped; verify `board.language` attribute actually populates on copy. Phase E of new milestone |
| 21 | Default Quick Core 60 + Vocal Flare 60; remove "robust board" tutorial | Melissa | NOT-STARTED | - | High | Image assets present (`/public/images/quick-core-60.png`, `vocal-flair-60.png`, landed in #281). Default-provisioning code missing. Phase C of new milestone |

## V3 additions (Sentry alerts + PR #174 review + meeting-noted English-TTS)

| # | Item | Owner | Status | PR / Branch | Severity | Note |
|---|---|---|---|---|---|---|
| 22 | SlowWorker cache-clearing gap (PR #174) | Scot | LANDED-OK | PR #287 (merged 2026-05-25) | High | Centralized `Worker.clear_request_thread_caches`. Per-job cache bounding verified; Oj.mimic_JSON and export dedup verified low-risk (no code needed) |
| 23 | Sentry Rack::Timeout in `Api::BoardsController#tree` | Traci + Scot (joint RCA) | LANDED-WITH-ISSUES | PR #294 (remediation #1) | High | Remediation #1 (`as_lite`) shipped. #2 (batch preload) + #3 (request-scoped image cache) OPEN. Watching Sentry vs 2026-05-17 baseline |
| 24 | N+1 in `BoardsController#index` | Traci | NOT-STARTED | - | Med-High | Confirmed still real: `#index` (boards_controller.rb:13) renders via `paginate` (:307) with NO `as_lite`, so it did NOT inherit #294. Add eager loading; verify with query-count spec |
| 25 | English-TTS mismatch (meeting-noted) | Traci or Omer | NOT-STARTED | - | Medium | Visual content updates to target language; speak button still reads original English. Pipeline UI (Traci) or TTS tooling (Omer) |
| 26 | `SEED_ADMIN_PASSWORD` missing on staging | Scot | LANDED-OK | config-only | Info | Resolved 2026-05-26; also set SEED_EXAMPLE_PASSWORD + SEED_DEMO_PASSWORD. Stored in 1Password (LingoLinq Staging vault) |

## Adversary remediations from post-meeting PRs

Soft-freeze scope per the v3 plan: PRs touching the same files cannot merge until the finding clears; other work continues. Live status in issue #286.

| Severity | Adversary finding | Owner | Status | Freeze scope |
|---|---|---|---|---|
| Critical | PIN modal reveal leaks `actual_pin` plaintext | Melissa or Omer | OPEN | PR #283 PIN half only |
| Critical | Customize Menu shipped enabled-for-all with no feature flag | Traci | OPEN | Future PRs to Customize Menu surface |
| Critical | Orphaned `boardPicker` test refs + incomplete deletion | Traci | OPEN | Future PRs to `application.js` or `application-test.js` |
| High | `/database` admin API bypasses `secure_serialize` | Scot | FIX OPEN (PR #304) | Future PRs to `/api/v1/database_contents` |
| High | i18n generator misses dynamic-key Customize strings | Traci | OPEN | Future merges to Customize strings or generator |
| High | PR #283 scope sprawl (21 of 23 files are AI, not PIN) | Melissa + Omer | OPEN | PR #283 split required + PiiScrubber audit on AI half |
| High | PIN modal: 7 of 10 keys absent in en.json | Melissa or Omer | OPEN | On the split PR |
| High | Preview-canvas offline path silently renders blank cells | Traci | OPEN | Future PRs to `board-preview-canvas.js` |
| High | PR #281 has 60+ frontend files with near-zero integration test coverage | Traci | OPEN | Future merges from `traci/styling/styling-updates` for uncovered paths |

Plus 6 adversary Medium findings tracked in #286.

## What the team needs to know right now

1. **Items 18 + 19 are NOT shipped** despite being aligned-on meeting decisions. Re-opened as Phase D of the MVP polish milestone.
2. **Item 21 is partially shipped**: image assets are in the repo but the default-provisioning code does not exist. Phase C.
3. **PR #283 must be split** before merge: PIN half has a Critical security issue, AI half needs a PiiScrubber audit.
4. **PR #284 needs a feature flag** for the Customize Menu before any further work on that surface.
5. **Sentry timeouts in `Api::BoardsController#tree`**: remediation #1 shipped (#294); #index N+1 (item 24) is a separate, still-open path.
6. **Dual-reviewer is mandatory** for PRs touching security, AI, user data, feature flags, mailers, OR the #tree/bulk/global_id/board/board_content/SlowWorker paths. See CONTRIBUTING.md "Dual-Reviewer Policy (Phase 1)". Phase 2 expansion to all PRs after the team runs Phase 1 on ~5 PRs without friction.
