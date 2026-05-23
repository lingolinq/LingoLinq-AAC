# Styling Rework — Plain‑Language Team Brief

> A non‑technical summary for the team. Detailed engineering docs:
> `CSS_ARCHITECTURE_PROPOSAL.md` and `CSS_REFACTOR_PLAN.md`.

## The situation, in one paragraph

All of the app's visual styling lives in a **single 78,000‑line file**. Over years it has been added to by many people, and large sections are **literally duplicated**, with rules that **fight each other**. To make one change "win," people have had to add **~4,800 "force it" overrides**. Today the file works, but it has become fragile: a small change in one place can silently break the look of an unrelated screen, and getting a fix to "take" often means stacking yet another override on top — which makes the next change even harder. We've hit this repeatedly while polishing the board editor.

## Why this matters (impact, not jargon)

- **Slower delivery & higher cost.** Simple visual tweaks take far longer than they should because every change risks side effects elsewhere and needs extra testing.
- **Regression risk on a sensitive product.** This is an AAC communication tool for vulnerable users. A styling change that accidentally breaks another screen is a real reliability problem, not just cosmetics.
- **It compounds.** Each "force it" override makes the system more brittle, so the problem accelerates if we don't address the structure.
- **Hard to onboard.** New contributors can't safely work in an 78k‑line file with no boundaries.

## What's actually wrong (analogy)

Think of the stylesheet as **one enormous shared document with no chapters, where two people pasted overlapping copies of the same sections.** When two instructions conflict, the app just uses "whichever was typed last," so people keep re‑typing louder versions at the bottom. The fix isn't to keep editing the giant document — it's to give it **chapters with a clear order of authority**, remove the duplicate copies, and write each thing **once**.

## What we need to do (the plan, plainly)

Three changes, in order, each independently testable:

1. **Establish a clear "order of authority" (foundation).** Modern browsers support a feature ("cascade layers") that lets us declare, once, which styles outrank which — so the result no longer depends on accidental ordering or "force it" overrides. We've already **proven this can be done with zero visual change** (verified by an automated before/after comparison). *It has one dependency:* our third‑party UI library (Bootstrap) must be slotted into this order too, which is a **small build‑pipeline change that needs team sign‑off and a quick in‑browser check** — it's outside day‑to‑day UI work, which is why it's flagged here rather than done unilaterally.

2. **Split the giant file into clearly‑owned sections, removing the duplicates.** Each major screen/component gets its own file, each rule defined **once**. Because step 1 fixed the "order of authority," moving rules around can no longer silently change the look — and we verify it didn't with the same automated comparison.

3. **Add an automatic guardrail.** A linter runs on every change and **blocks new duplicates and new "force it" overrides**, so the mess can't quietly grow back. The current counts are recorded as a baseline; the number only goes down from here.

This is incremental and reversible: every step is verified to produce **no visual change** before we move on, and we never do a risky "big bang" rewrite.

## What it costs / what we get

- **Effort:** the foundation + first cleanup is roughly a few focused days; the rest is ongoing and opportunistic (cleaned up as we touch areas), not a project that blocks feature work.
- **Payoff:** styling changes become fast and safe again, cross‑screen regressions largely go away, the codebase becomes onboard‑able, and the override count steadily shrinks instead of growing.

## The one decision we need from the team

Approve the **small build‑pipeline change** that slots the third‑party library into the new order of authority (step 1's dependency), plus a short in‑browser QA pass to confirm no visual change. Everything else is already de‑risked and ready to proceed in safe, verified increments.

## Status today

- The foundation has been **built and proven zero‑change in an isolated branch**, waiting on the build‑pipeline decision above.
- The full plan and the technical proof are written down (`CSS_REFACTOR_PLAN.md`, `CSS_ARCHITECTURE_PROPOSAL.md`).
- In the meantime, urgent visual fixes are still being delivered the old way (in the big file) so users aren't blocked — but each one is more evidence for why the rework is worth doing.
