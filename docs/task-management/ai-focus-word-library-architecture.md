# AI Focus Word Library Architecture

## Purpose

The AI focus word library is a shared, privacy-conscious cache and learning dataset for generated Focus Words lists. It lets one user's scrubbed, reviewed generation benefit later users with the same prompt context, locale, and vocabulary settings.

The user-facing contract stays stable: the Focus Words modal asks for a topic and count, then receives editable words. The backend can evolve from exact cache lookup to richer recommendations without changing the modal.

## V1 Data Model

`AiFocusWordSet` is the source of truth for generated and applied focus sets.

Core fields:

- `scrubbed_prompt`: PII-redacted prompt text used for lookup and review.
- `normalized_prompt`: lowercase, whitespace-normalized prompt used to derive hashes and future search tokens.
- `prompt_hash`: SHA-256 hash of normalized prompt + locale + include-core setting.
- `locale`: target vocabulary locale.
- `include_core_words`: whether generation mixed in high-frequency core words.
- `title`: optional short generated title.
- `words`: generated words, deduped and capped.
- `applied_words`: words users actually kept/applied after editing, deduped and capped.
- `word_count`: generated word count currently available.
- `source`: `ai` for generated rows, leaving room for `curated` or imported rows later.
- `status`: lifecycle state such as `generated`, `reviewed`, `curated`, or `hidden`.
- Counters/timestamps: generation, cache hit, applied, and analysis counts.

Lookup is global by default. User and organization identifiers are audit/moderation context only, not part of the reuse key.

## Growth Controls

The library must not grow unbounded through duplicate prompts or repeated events.

- Use one canonical row per `prompt_hash`.
- Deduplicate words within `words` and `applied_words`.
- Cap stored generated/applied words per row. V1 target: 200 words.
- Increment counters rather than append every usage event.
- Keep detailed usage events out of v1 unless a specific analytics need appears.
- Allow pruning or hiding low-value rows, such as old rows with no cache hits and no applied words.
- Use `status` and future moderation tools to hide unsafe, low-quality, or irrelevant rows.

## Privacy Rules

- Store scrubbed prompts only.
- Do not store raw unsanitized prompt text in the reusable library.
- PII scrub before hash generation and before any provider call.
- Keep applied words because they reflect reviewed vocabulary choices, but cap and dedupe them.
- Treat user/org metadata as optional audit context and avoid exposing it through shared lookup.

## Recommendation Evolution

V1 stays exact-match and cache-first.

Future layers can be added behind the same `POST /api/v1/focus/generate_words` endpoint:

1. Exact lookup by `prompt_hash`.
2. Postgres full-text or trigram search for similar prompts, only above a conservative confidence threshold.
3. Vector search using prompt embeddings and/or applied-word embeddings.
4. Graph export or graph database for relationships among topics, books, activities, grade bands, locales, core vocabulary, and commonly accepted words.

Graph-ready entities:

- Nodes: prompt/topic, word, locale, source/category, book/activity when available.
- Edges: prompt generated word, prompt applied word, word co-accepted with word, topic similar to topic, source contains prompt.
- Edge weights: applied counts, co-occurrence counts, recency, and curated quality.

## Operational Signals

Useful metrics:

- Cache hit rate.
- AI generation count and failure rate.
- Average generated/applied word counts.
- Rows by status.
- Rows eligible for pruning.
- PII scrub hit rate.
- Provider token/cost totals by request type.

These metrics can be derived from `AiFocusWordSet` and `AiApiLog` without changing the frontend.
