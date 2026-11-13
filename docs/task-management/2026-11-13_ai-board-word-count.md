# AI board generation comes back short of the grid, and the board is refused

Requested by Traci 2026-11-13 after "The AI returned an incomplete word list (63 of 64)" on staging.
Her direction: fix why the first try misses, keep a backup that asks only for the missing words,
and never refuse the board for a shortfall.

Learnings consulted: "Bedrock credentials are a dedicated atomic pair" (LEARNINGS.md), the AI
generation entries in `learnings-archive/LEARNINGS-2026-01_to_2026-09.md` (generate_labels gates).

## Evidence (real model, dev Bedrock credential, made-up prompts, 2026-11-13)

Model: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (AiClient.runtime_model).

Probe 1, today's prompt (one comma-separated `WORDS:` line), 8x8, 11 replies: 2 exact, 8 over
(65-69), 1 short (63). Every reply ended with `stop_reason=end_turn` at 160-250 of 2048 output
tokens, so nothing was cut off. The word lines split cleanly, so the parser drops nothing.
Duplicates appear ("uncomfortable" twice; "friend" and "friends").

Probe 2, today's prompt vs a numbered one-per-line prompt, first reply only:

| Size | Today: exact count | Numbered: exact count | Duplicates (max per board) |
|---|---|---|---|
| 64 | 0 of 6 (three at 63, one with a repeat) | 6 of 6 | today 1, numbered 1 |
| 100 | 0 of 6 (102 to 125) | 6 of 6 numbered to 100 (one stray extra line) | today 4, numbered 2 |

Cause: the model miscounts a single comma-separated line. It is not truncation and not parsing.

## Fact sheet

(a) Where the values are read
- `AiBoardGenerator.generate_words` (`lib/ai_board_generator.rb`): builds the prompt, calls
  `call_anthropic` up to twice with the whole request, parses with `structured_parse_payload`,
  succeeds only when `words.length >= cell_count`, else `parse_shortfall_response` returns
  `words: nil, error: ...`. CONFIRMED.
- `Api::BoardsController#generate_labels`: any `result[:error]` becomes a 503; blank words a 400;
  otherwise `words.first(cell_count).join(', ')` is sent as `labels`. A list SHORTER than the grid is
  accepted by the controller as is. CONFIRMED.
- Client: `create-board-new.js` `generate_labels_with_ai` writes `res.labels` into
  `model.grid.labels`; fewer labels than cells leaves the extra cells empty. CONFIRMED.

(b) Shapes of a reply: exact; over (trimmed to the first N, which cuts the topic words that come
after the core words); short; duplicates inside any of those; no structured lines (whole reply
parsed as words).

(c) `generate_focus_words` is not a fit for the backup: its prompt is about highlighting words
already on a board, and it caps at 50 words. CONFIRMED by reading.

## Proposal

A (chosen)
1. Ask for a numbered list, one item per line, `1.` to `N.`, then `NAME:` and `DESCRIPTION:`.
   Parse numbered lines first; when there are none, fall back to today's `WORDS:` / comma parse,
   so an off-format reply still yields words. Drop repeats, ignoring case and surrounding spaces.
2. If the unique list is still short, make ONE top-up call asking for exactly the missing number of
   new items as a numbered list, giving the words already chosen as a do-not-repeat list. Merge,
   dedupe, take the first N.
3. If it is still short after the top-up, return what there is with `error: nil` and a
   `shortfall` count, so the board is made with the remaining cells empty. Only zero words is an
   error.
4. Every AI call keeps going through the scrubbed prompt (PiiScrubber), one `AiApiLog` row per
   `generate_words` call as today (success when words are delivered), and the Article 50 marker is
   attached whenever words are delivered, including a partial list.
5. Over-long replies keep the first N unique items. With the numbered format this was observed to
   be rare (one stray line in 12).

B: keep the comma prompt and add only the top-up. Rejected: the first reply misses about half the
time at 64 buttons, so most boards would need two calls, and over-long replies still cut topic
words.

C: switch to a JSON array output. Rejected for now: no evidence it counts better than numbering,
and it adds a parse failure mode (invalid JSON) that numbering does not.

Specs that encode the old behaviour and change because Traci asked for it (Rule 14):
- `spec/lib/ai_board_generator_spec.rb` "returns an incomplete-list error after both attempts are
  short" (a short list now returns the words found, no error).
- `spec/lib/ai_board_generator_spec.rb` "does not attach a marker to a shortfall" (a partial list is
  delivered AI content, so it is marked; zero words is still unmarked).

Tests (red first): numbered parse; repeats removed; a short first reply triggers one top-up that
asks only for the missing count and lists the existing words; still short after the top-up returns
the words with `shortfall` and no error; zero words is an error; the marker is attached to a partial
list; an off-format reply still parses; the controller returns labels for a partial list.

Not in this PR: a visible note on the labels page when cells are left empty. That is a front-end
change in `create-board-new`, which PR #1309 also edits; it follows once #1309 merges.

Unresolved: whether `NAME:`/`DESCRIPTION:` stay reliable after a numbered list (probe 2 parsed them
in every reply, by eye; to be asserted in the real-model check after the change).

## After adversarial review (2026-11-13)

Verdict: apply with changes. Two conditions before code, both met:
1. An off-format reply must not become labels. The parser reads numbered lines, else an explicit
   `WORDS:` line, else nothing; `NAME:`/`DESCRIPTION:` lines are never words; `stop_reason ==
   'refusal'` gives no items. No usable words is still an error, logged as a failure, unmarked.
2. A failed or timed-out top-up must not lose the first words. The top-up has its own
   `rescue StandardError` (the first reply's words are delivered and the failure is noted on the audit
   row); it is skipped once 8 s have passed; and a `rescue Exception` on the method writes the audit row
   before a Rack::Timeout carries on up.

Also done: items with a comma are split (one cell can never become two downstream); Unicode digits,
`1)`, `1、`, `１．`, Markdown, bullets and code fences parse; a reply cut off at `max_tokens` loses its
last item; the top-up replaces the old full retry (two calls at most); token usage is summed across
both calls on the one audit row, which also notes the top-up and any shortfall (counts only); the
top-up reuses `scrubbed_prompt` and scrubs its do-not-repeat list; the controller passes `shortfall`
on. `board_retry_nudge` and `parse_shortfall_response` are removed (no other caller).

Fact-sheet corrections: the old `/create-board` flow (`generate-board.js`) is a second client of
`generate_labels`; when the grid size was not chosen, `autoFitGrid` reshapes the grid to the labels,
so a partial list gives a smaller full grid rather than empty cells.

Verification: 17 new or rewritten specs went red first. Generator, boards controller, AiClient and
AiApiLog spec files: 400 examples, 0 failures, 1 pending (pre-existing). Mutants each turn a spec red:
whole-reply fallback, top-up errors not caught, cut-off item kept, NAME kept as a word, top-up tokens
not counted, do-not-repeat list unscrubbed (the last one needed the email spec extended to a word the
model echoes).

Specs changed because the behaviour was changed at Traci's request (Rule 14): "returns an
incomplete-list error after both attempts are short" and "does not attach a marker to a shortfall"
(both rewritten); the `anthropic_response` fixture gained an optional `stop_reason`.

Real-model check of the new code (dev Bedrock credential, made-up prompts, 2026-11-13):

| Cells | Boards | Words delivered | Calls | Time |
|---|---|---|---|---|
| 64 | 6 | 64 in all 6 | 1 each | 1.6-2.3 s |
| 112 (client AI maximum) | 4 | 112 in all 4 | 1, one board 2 (top-up) | 2.3-3.7 s |
| 225 | 2 | 225 and 221 (shortfall 4, delivered) | 2 each | 4.9-5.4 s |

NAME and DESCRIPTION were present in all 12, no item contained a comma, and no item repeated. The
slowest run was 5.4 s against the 15-16 s request limit.

Still to do: a front-end note when cells are left empty (after PR #1309).
