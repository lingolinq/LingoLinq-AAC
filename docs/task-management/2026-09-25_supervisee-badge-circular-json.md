# Circular structure to JSON on the local-storage write path (2026-09-25)

Reported from the console: `Converting circular structure to JSON --> starting at object with
constructor 'Store' | property 'notifications' -> NotificationManager --- property 'store' closes
the circle`, at `Object.encrypt` under `storage_store`.

## Fact sheet

**(a) Where is the value READ?** CONFIRMED.
`app/frontend/app/utils/dbman.js:158` — `record.raw = capabilities.encrypt(record.raw)`, and
`encrypt` is `JSON.stringify` (`app/frontend/app/utils/capabilities.js:694-696`). The chain into
it: `services/persistence.js:706` `store()` builds `record = {raw: (obj[store] || obj)}` — **by
reference, no copy** — then `utils/extras.js:108` -> `capabilities.storage_store`
(`capabilities.js:2335`) -> `dbman.store`. So whatever the in-memory payload holds at write time
is what gets stringified.

**(b) What shapes can `supervisees[].current_badge` hold?** CONFIRMED.
`supervisees` is `attr('raw')` (`app/frontend/app/models/user.js:183`) — a plain JSON array.
Writers of the badge fields onto its entries:
- `app/frontend/app/components/dashboard/authenticated-view.js:683,685` —
  `emberSet(sup, 'current_badge', b)` / `earned_badge`, where `b` comes from
  `Badge.best_next_badge` / `best_earned_badge` (`app/frontend/app/models/badge.js:319`), which
  filter and sort with `b.get(...)` and **return one of the live Badge records**.
- `app/frontend/app/controllers/index.js:122` and `app/frontend/app/controllers/bento.js:46` are
  no-op stubs; they write nothing.
So the reachable shapes are: absent, `null`, or a live Ember Data record carrying `.store`.
Measured in the browser (`scratchpad/circ9.mjs`, JSON.stringify wrapped before boot, BFS for the
path): on `/` , twice per load, `$.supervisees.0.current_badge.store => Store`. Not reproducible
on `/account`, `/stats`, `/organizations`, `/goals` — the writer is the dashboard.

**(c) Cross-file claims.** All CONFIRMED by reading:
- `known_supervisees` (`models/user.js:871`) returns `all_supervisees || supervisees` — **the same
  objects**, and already mutates them (`emberSet(sup, 'online', true)`, :877). So decorating these
  objects for display is established practice here; the difference is that `online` is JSON-safe
  and a Badge record is not.
- `decorateSuperviseeForCaseload` (`controllers/caseload.js:32`) does `Object.assign({}, s)` — the
  caseload reads a **copy** taken after the dashboard has written the badge.
- Consumers of the supervisee badge fields, exhaustively: `templates/caseload.hbs:596`
  (`<BadgeProgress @badge=...>`) and `components/dashboard/classic-view.hbs:619,621`
  (`BadgeProgress`, `BadgeEarned`). `BadgeProgress` reads `id`, `name`, `image_url`, `progress`;
  `BadgeEarned` reads `id`, `image_url`. **No consumer needs record behaviour.**
- The 2026-09-24 `supervisees: { serialize: false }` fix (`serializers/user.js:64`) does NOT cover
  this path: it acts in `serialize()`, and this path stringifies the raw payload directly.
- Existing learning, `docs/task-management/LEARNINGS.md:90`: in-place mutation of an `attr('raw')`
  array is already a known hazard in this codebase.

## Candidate fixes

**A. Snapshot at the writer (proposed).** A pure `badge_snapshot(badge)` helper
(`utils/badge_display.js`) returning `{id, name, image_url, progress}` or null; the dashboard
writes that instead of the record. Fixes the cause: no live record ever enters a raw payload.
Cost: two call sites; consumers verified to need only those four fields.

**B. Sanitize at the persistence boundary** (`services/persistence.js:706`). Protects every present
and future writer, and mirrors the shape of the 2026-09-24 serializer fix. Rejected as the primary
fix: it walks or clones every stored payload (boards are large), and it leaves the in-memory
payload polluted, so the next boundary that stringifies it is a third bug of the same family.

**C. Non-enumerable properties at the writer**, so `JSON.stringify` skips them. Smallest diff and
no consumer changes, but it depends on `emberSet` preserving the descriptor and is invisible to
the next reader; a future `Object.assign` copy (which `decorateSuperviseeForCaseload` already
does) drops the badge silently.

**Simplest alternative considered and rejected:** drop `supervisees` from the stored user payload
the way the serializer drops it. Rejected because the offline caseload reads that cached array.

## Risks and unresolved questions

- `authenticated-view.js:667-668` writes the same two fields onto the user RECORD, not onto raw, so
  it is not part of this defect. Leaving it a record while supervisees carry snapshots gives one
  field name two shapes — a trap. Changing it risks an unexamined consumer of `model.current_badge`.
  **Open: snapshot both, or only the raw ones?**
- Badge identity: no consumer compares `===` or calls a method (searched templates/components), but
  a future one might.
- Whether the badge should be persisted at all: it is derived display state, recomputed on every
  dashboard render.

## Test

`tests/unit/utils/badge-display-test.js` (written first, currently red: module absent). The
mechanism test builds the measured circular chain (`store.notifications.store`), snapshots it,
and asserts the payload stringifies and contains the badge but not `notifications`.
**Mutation that must make it fail:** `badge_snapshot` returning its argument unchanged — which is
what the code does today — must turn that test red.
