---
name: code-hygiene-audit
description: Dead-code and AI-slop audit checklist for LingoLinq-AAC. Detects unreachable/orphaned Rails and Ember code, stale feature-flag branches, and low-quality AI-generated-code patterns (speculative abstractions, dead defensive scaffolding, redundant comments, near-duplicate blocks). Preloaded by the code-hygiene-auditor agent; emits findings in the canonical register schema. Read-only, static analysis only.
---

# Dead Code & AI-Slop Audit

## Purpose
Find code that should not still exist: unreachable/orphaned implementations, and the specific
low-quality patterns unreviewed AI-assisted edits tend to leave behind. Read-only: produce
findings, never fix. This is a **precision-first** domain — a wrong "dead code" call that gets
acted on can delete something a reflective call path actually needs, so every finding requires
positive verification, not absence-of-evidence.

**Static analysis only.** No execution, no coverage instrumentation, no runtime tracing.
Everything here is checkable by reading source and grepping the tree.

## Scan scope
- Backend: `app/models/**/*.rb`, `app/controllers/**/*.rb`, `app/models/concerns/**/*.rb`,
  `app/services/**/*.rb`, `lib/**/*.rb`, `config/routes.rb`, `config/initializers/**/*.rb`,
  `lib/feature_flags.rb`.
- Frontend: `app/frontend/app/components/**/*.{js,hbs}`, `app/frontend/app/utils/**/*.js`,
  `app/frontend/app/routes/**/*.js`, `app/frontend/app/controllers/**/*.js`,
  `app/frontend/app/services/**/*.js`, `app/frontend/app/templates/**/*.hbs`,
  `app/frontend/app/styles/**/*.scss` (SCSS is in scope ONLY for detection class B.9's
  near-duplicate-rule-set check, not for the other classes).
- Config/CI: `.github/workflows/**/*.yml` (in scope ONLY for detection class A.3's
  never-triggers check, not for the other classes).
- Explicitly OUT of scope: `spec/`, `app/frontend/tests/`, `db/migrate/`, anything under
  `vendor/`, `node_modules/`, `public/`, generated/build output, and any file whose name or path
  marks it as a fixture/factory/seed.
- This scope list must stay a superset of every path any detection class below references. If
  you add a class that reaches a new path, add that path here in the same change.

## Detection classes

### A. Dead code

1. **Orphaned file — nothing requires/imports/routes to it.**
   - Ember: for a component/route/controller/util at `app/frontend/app/<kind>/<path>.js`, grep
     the whole `app/frontend/app` tree for its module path (import specifier), its dasherized
     component invocation name in `.hbs` (`{{component-name`), and its route name in
     `router.js`/`{{link-to}}`/`transitionTo`. Zero hits across ALL three forms = candidate.
   - Rails: for a class/module, grep for `ClassName`, `class_name:` string references (STI,
     polymorphic associations), and any route pointing at a controller#action. Zero hits =
     candidate. Concerns included via `include ConcernName` — check that too.
   - **Verification gate before flagging:** re-grep case-insensitively and with underscores vs
     dashes normalized (Ember dasherizes; Rails underscores) — a miss here is the single most
     common false-positive source. Also check `config/initializers/` and `config/routes.rb` for
     string-based wiring (`to: 'controller#action'`, engine mounts).

2. **Superseded-but-not-deleted implementation.** A file/route/component that a commit message,
   comment, or sibling file's naming (`*_v2`, `*-new`, `*-legacy`, `*-old`) implies was replaced,
   where the replacement is confirmed live (referenced from the current entry point) and the old
   one has zero remaining references. See the agent's "Known dead-code precedent" list for the
   shape of finding this catches — verify each candidate fresh against the current tree; do not
   assume that list is exhaustive or still accurate.

3. **Config/workflow files that can never trigger.** E.g. a GitHub Actions workflow file outside
   `.github/workflows/` (GitHub only triggers workflows directly in that directory — a nested
   `app/frontend/.github/workflows/*.yml` is inert). Verify by checking the file's actual path
   against GitHub's trigger rule, not by assuming.

4. **Stale feature-flag branch.** In `lib/feature_flags.rb`, a flag listed in
   `AVAILABLE_FRONTEND_FEATURES` that is unconditionally in `ENABLED_FRONTEND_FEATURES` (fully
   rolled out) AND whose `if feature_flag?(...)` / `{{if (feature-flag ...)}}` guard still wraps
   code in the tree — the `else`/off-branch (or the guard itself, if fully on) is now dead.
   Conversely, a flag removed from `AVAILABLE_FRONTEND_FEATURES` entirely but still referenced by
   a guard in code = the guarded branch can never execute. Only flag when you can show the flag's
   current state in `feature_flags.rb` AND the guard's specific location.

5. **Unreachable branch.** A conditional whose condition is statically always-true or
   always-false in context (e.g. `if false`, a Ruby `case` with a redundant `else` after an
   exhaustive enum match that itself has a `raise` in every other branch already handling it),
   OR code after an unconditional `return`/`raise`/`next` in the same block. High-confidence only
   — do not flag branches that merely look unlikely; flag ones that are structurally unreachable.

### B. AI-slop patterns

These are patterns characteristic of unreviewed AI-assisted edits, independent of whether the
code is dead. Each needs a concrete `file:line` anchor, not a vibe — cite the specific lines.

6. **Comment restates the code with no added information.** A comment whose content is fully
   derivable from the identifier names on the next line (e.g. `# increment the counter` above
   `counter += 1`, or a multi-paragraph docstring on a one-line trivial method). Per this repo's
   own convention (CLAUDE.md: comments only for non-obvious WHY, never WHAT), this is a defect,
   not style. Do NOT flag a comment that documents a non-obvious constraint, workaround, or
   invariant — only ones that are pure restatement.

7. **Defensive scaffolding around something that cannot fail.** A `begin/rescue` or `try/catch`
   wrapping a call that cannot raise in context (e.g. rescuing `NoMethodError` around a call on a
   value whose class is statically known a few lines above), or a nil-guard
   (`return unless x`/`x && x.y`) on a value the surrounding code just assigned non-nil. Flag only
   when the impossibility is demonstrable from the surrounding lines, not inferred from domain
   knowledge the audit can't verify statically.

8. **Speculative abstraction with a single call site.** A class, module, service object, or
   Ember service/util introduced with a generic/pluggable-looking interface (strategy pattern,
   config-driven dispatch, an options hash with keys that are never varied) that has exactly one
   caller anywhere in the tree, where the direct/inline version would be equivalent code. Grep
   all call sites of the abstraction before flagging — this is a real finding only when the
   count is exactly one and there is no in-flight second caller (check open branches is out of
   scope; judge from this tree only).

9. **Near-duplicate blocks.** Two or more blocks (function bodies, template partials, SCSS rule
   sets) that are structurally identical apart from renamed identifiers/literals, appearing close
   together (same file or sibling files) in a way that suggests copy-paste-modify rather than a
   shared helper. Cite both/all locations. Do not flag boilerplate that's idiomatic for the
   framework (e.g. parallel Ember route `model()` hooks are expected to look similar).

10. **Dead debug/placeholder artifacts.** Commented-out `console.log`/`binding.pry`/`debugger`/
    `puts` left in committed code; `TODO`/`FIXME`/`XXX` comments with no ticket reference sitting
    in a file that otherwise looks feature-complete; a stub method body (`# TODO: implement`,
    `throw new Error('not implemented')`) reachable from a live call path in production code
    (not a spec/test double).

## Verification protocol (apply before every finding)
1. Re-grep with normalized casing/separators (dasherized vs underscored) — the top false-positive
   source for "orphaned" claims.
2. Check `config/routes.rb`, `router.js`, and `feature_flags.rb` for string-based/dynamic wiring
   that a plain identifier grep would miss.
3. Confirm the file is not under an out-of-scope path (spec/test/fixture/migration/vendor).
4. Cross-check `audit-reports/FINDINGS.json` for an existing `(ruleKey, file)` before creating a
   new finding.
5. If any step leaves genuine doubt, either omit the finding or emit it with `confidence: "low"`
   and say what would resolve the doubt in `notes`. Do not guess.

## Severity mapping
- **critical**: none in this domain by default — dead code and slop are hygiene/maintainability
  issues, not live defects. Reserve `critical` only if the dead branch is currently *reachable*
  and produces a real user-facing failure (in which case it is arguably not "dead" — re-classify
  and consider whether this belongs in a different domain's finding instead).
- **high**: dead code that actively misleads (e.g. a fully-rolled-out feature flag whose
  off-branch is still 200+ lines of maintained-looking code, inviting a future edit to the wrong
  path) or a speculative abstraction that has already caused a real bug traceable to its
  indirection.
- **medium**: confirmed orphaned file/method/component with no plausible reflective call path;
  confirmed unreachable branch; near-duplicate blocks that should be extracted.
- **low**: restated comments, dead debug artifacts, minor defensive-scaffolding-around-nothing.
  Prefer `confidence:"low"` or no finding over a heuristic guess anywhere in this domain.

## Finding schema (canonical: mirrors audit-reports/FINDINGS.json)
```json
{
  "ruleKey": "dead-code-orphaned-file | dead-code-stale-flag-branch | slop-restated-comment | ...",
  "title": "one line",
  "severity": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "frameworks": [],
  "status": "open",
  "evidence": { "type": "code", "file": "app/...", "line": 123,
                "snippet": "verbatim source line at the audited SHA", "sha": "<auditedSha>" },
  "remediation": { "options": "delete / extract-helper / remove-guard, etc.", "timeframe": "advisory" },
  "notes": "why this is dead or slop; what verification was done (class A items MUST state the grep forms checked)"
}
```
Rules:
- `frameworks` is `[]` for this domain (not a compliance-framework finding).
- Finders emit `status: "open"` ONLY. Never `verified-closed`: only Scot closes a finding, and
  the adversary verifier confirms it first.
- The `snippet` MUST appear verbatim in the cited file at `<auditedSha>`
  (`scripts/citation-check.rb` enforces this).
- No student/patient data in any field. Snippets are code only.
- The orchestrator computes the stable `id` (`LL-` + first 10 hex of `sha256(ruleKey + "|"
  + file)`) and reconciles against the existing register.
