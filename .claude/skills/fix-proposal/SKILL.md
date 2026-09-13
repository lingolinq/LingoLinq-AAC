---
name: fix-proposal
description: The LingoLinq-AAC discipline for any bug fix or behaviour change, from diagnosis to landed test. Write the three facts (where the value is read, every shape it can hold, whether each cross-file claim is true), label each CONFIRMED or ASSUMED, write the red test first, propose at least two candidate fixes with risks and unresolved questions, put the proposal through adversarial review before editing code, and falsify the test after the fix lands. Use before implementing any fix; invoke as /fix-proposal.
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# Fix proposal

Rule #0 in the root `CLAUDE.md` says diagnose before fixing and never guess. This skill
is the mechanical form of that rule. Every step below exists because skipping it
produced a real defect in this codebase; the case histories live in
`docs/task-management/learnings-archive/`.

## 1. The fact sheet (before any code)

Write these three facts down, each labelled **CONFIRMED (`file:line`)** or **ASSUMED**.
No ASSUMED line may be load-bearing for the fix: check it, or do not proceed on it.

- **(a) Where is this value actually READ?** Trace control flow to the read, not to where
  the concept belongs. A guard placed after the early return it needed to precede, on
  the dwell branch when the scanner branch returns first, or keyed on a value that is
  null for exactly the users it was written for, reads correctly and never executes.
- **(b) What are ALL the shapes this can hold?** Enumerate the reachable states and name
  the writer of each. Count writers, not causes.
- **(c) Is this claim about another file TRUE?** "The sibling test uses the shared helper",
  "`updateSuggestions` observes `model.id`", "that failure was a rebuild": each is a
  claim, each is cheap to check, and each was wrong once.

"This one is obvious" is the signal to write the sheet, not to skip it. The small,
confident, self-evident one-line fix is where this discipline has failed most often.

## 2. The red test first

Derive the test from the traced mechanism, before the fix exists. A test that cannot fail
for the right reason means you do not yet know where the value is read, which states are
reachable, or what the neighbouring code does. Ask what the weakest passing state of the
system would be: if that state still contains the bug, the test is wrong; rewrite it
before running it.

## 3. The proposal

Write it down and put it through `/adversary-review` before editing any code. It must
contain:

- the **diagnosis**, verified in code, with `file:line`;
- **at least two candidate fixes** where two exist, the trade-off between them, and the
  simplest alternative considered and why it was rejected;
- **the risks you can see** and explicitly **the questions you could not resolve**;
- the **test** that accompanies the fix, and **the mutation that must make it fail**.

Apply only what survives the review, with the changes it demands. A review is evidence to
verify, not a verdict: check each finding yourself and say so when you disagree.

## 4. After the fix lands

- **Falsify the test:** revert the fix, confirm the test goes red, restore. Restore from a
  copy you made yourself, never `git checkout` on uncommitted work. Commit before running
  destructive verification.
- **Trace-to-the-read for every guard you placed:** one line stating where the value is
  read and that the guard precedes it on every path.
- **Write comments last.** They describe what the code does; every cross-file claim
  cites `file:line`.
- **Enumerate matches before any text substitution in a shared file**, and print the
  contents of a range before deleting it.
- **Two independent reviewers for anything High or above.** Independent convergence is
  the strongest evidence available; a single reviewer is sometimes wrong.

## 5. Pacing

- **One coherent change per unit.** A batch shares one verification pass, so a mistake in
  item three hides behind green results earned by items one and two, and mutating one
  item to falsify its test says nothing about the others.
- **Stop when the error rate rises.** Two self-inflicted errors close together, a fix that
  needs a second correction, or a verification step re-run because the first attempt was
  botched: commit what is verified, write down what remains, and stop.
