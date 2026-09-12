# Planning evidence

Versioned copies of planning artifacts that tracked documents cite as evidence.

The GSD planning directory (`.planning/`) is gitignored and exists only on the machine
that ran the plan, so a citation into it cannot be resolved from a fresh clone. Several
documents under `docs/legal/` cite `.planning/phases/02-disclosures-content/PLAN.md`;
three of those documents are attested and therefore byte-frozen, so the citation text
cannot be changed. This directory makes the cited file resolvable instead.

| Cited path | Versioned copy | Copied |
|---|---|---|
| `.planning/phases/02-disclosures-content/PLAN.md` | `disclosures-content-plan-2026-07-09.md` | 2026-09-12, byte-for-byte from the primary checkout (file dated 2026-07-09) |

New documents should cite the versioned copy directly rather than the `.planning/` path.
Copies here are screened for identifiable data before they are added (policy language
only; no emails, names, or record contents).
