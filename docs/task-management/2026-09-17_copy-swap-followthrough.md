# Copy-swap follow-through (2026-09-17)

Working log for Scot's Aug 25 board-copy handoff. Plan: re-read the live
swap path, time a staging copy, record leftovers. No release PR.

## Handoff verification

CONFIRMED: the original three bugs are already on `origin/main`.

- #860 nil `old_bi` guard, #861 typo + `swapped_library`/`swap_incomplete` +
  `save_subtly` `ensure`, #904 skip-before-HTTP + Hydra + 429-not-a-miss +
  Mine-list Try Again are ancestors of `origin/main`.
- `opensybmols` exists only as a spec comment (`spec/models/board_spec.rb:5828`).
- Copy-swap reached prod via #898 (Aug 31) then #923 (Sep 3 for #904).
- Staging is ahead of `main` for unrelated work. Out of scope.

## Re-read (HEAD citations)

### Skip predicates vs word list

CONFIRMED (`app/models/board.rb:2874-2957`): `swap_skips_button?`,
`swap_keeps_existing_image?`, and `swap_image_already_in_library?` are the
same three predicates in the `default_images` word list and the button loop.
Empty `words` skips `Uploader.default_images`.

CONFIRMED (`app/models/button_image.rb:154-169`): `image_library` never
returns `'opensymbols'`. It returns a member name, `'unknown'`, or
`protected_source`. The already-in-library skip for target `opensymbols`
is the member-library clause only.

### Both `swapped_library` writers

CONFIRMED (`app/models/board.rb:3011-3031`):
- `@buttons_changed` writer: full `save`, records marker, sets
  `swap_incomplete` from this board's `unresolved`.
- `already_in_library` writer: `save_subtly` when the marker or incomplete
  flag changed.

CONFIRMED (`app/models/board.rb:3059-3063`): root bubble gated on
`swapped_library == library`. Found-nothing stays a no-op.

CONFIRMED (`app/models/board.rb:3000`): comments still cite `user.rb:3065,
3088, 3095`. The readers have moved (see below).

### Copy consumers

CONFIRMED (`app/models/user.rb:3607-3609, 3631-3632, 3639-3640`):
`(swapped_library || 'original') == (symbol_library || 'original')`.
Nil marker is a library mismatch and `copy_for`s a second set.

CONFIRMED (`app/models/user.rb:3689-3698`): `retry_incomplete_library_swap`
re-enters in place when `swap_incomplete` is set. Sets `@skip_swapped`.

CONFIRMED (`app/models/user.rb:4415-4420`): `copy_board_links` also sets
`@skip_swapped` before `swap_images`.

### BoardCloner allowlist

CONFIRMED (`app/cloners/board_cloner.rb:110-111`): both `swapped_library`
and `swap_incomplete` are copied when present on the source.

### Hydra / cache

CONFIRMED (`lib/open_symbols.rb:94-146, 191-251`): combined `opensymbols`
has no bulk `/defaults`; `search_many` Hydra-parallelizes; 401 requeues;
non-JSON 200 is `:http` not a raise.

CONFIRMED (`lib/uploader.rb:1044-1051`): `find_images` stamps
`add_missing_word` only when `cache_forever && !transport_error`.

CONFIRMED (`app/models/library_cache.rb:208-209`): `find_words` still
returns `missing: true` with no expiry check on read.

### `save_subtly`

CONFIRMED (`app/models/concerns/upstream_downstream.rb:323-329`):
PaperTrail restore is in `ensure`. CONFIRMED
(`app/models/board.rb:1143-1148`): `@skip_post_process` restore is in
`ensure` on `save_without_post_processing`. Spec at
`spec/models/concerns/upstream_downstream_spec.rb:415-424`.

### Outer gate vs the marker writers (live defect)

**(a) Where is `swapped_library` READ?** CONFIRMED
(`app/models/user.rb:3607, 3631, 3639`): copy idempotency. A nil marker
mints a second board set. The writers that should set it on a no-op skip
live inside the swap loop (`board.rb:3011-3031`).

**(b) Shapes.** CONFIRMED writers:
- `swap_images` `@buttons_changed` branch (`board.rb:3013`)
- `swap_images` `already_in_library` branch (`board.rb:3028`)
- `BoardCloner` copies source value (`board_cloner.rb:110`)
- unset / nil on a fresh copy whose source had no marker

**(c) Cross-file claim.** The existing skip spec
(`board_spec.rb:5836-5867`) uses an arasaac-dominant board so
`current_library(true)` returns `'arasaac'` (`board.rb:2827-2848` votes
member libraries into both `opensymbols` and the member; equal counts
leave the member last). That opens the outer gate. The claim "the inner
writers always run on a copy-path skip" is FALSE for a mixed-member
board.

CONFIRMED (`board.rb:2922`):
```
if !@skip_swapped || current_library(true) != library || swap_incomplete
```
Copy/provisioning sets `@skip_swapped` (`user.rb:3697, 4418`).
`current_library(true)` votes; one arasaac + one twemoji yields
`opensymbols` (aggregate count 2, neither member beats 3/4). The outer
gate then skips the loop. `already_in_library` stays false. Neither
writer runs. Next `copy_to_home_board` treats nil as `'original'` and
mints a duplicate set.

This is the #861 contract hole: the inner skip records the marker only
when the loop runs. The loop does not run when votes already match the
target.

## Fix proposal

**Diagnosis:** The outer gate keys off `current_library(true)` (a vote)
instead of `settings['swapped_library']` (the idempotency key the copy
consumers actually read).

**Candidate A (chosen):** Change the outer gate at `board.rb:2922` to
`swap_board.settings['swapped_library'] != library` instead of
`current_library(true) != library`. First copy (nil marker) always
enters; the inner skip still avoids HTTP; the existing `already_in_library`
writer records the marker. Repeat copy with a matching marker still
skips the loop.

**Candidate B:** When the outer gate skips, if `swapped_library` is
blank, `save_subtly` the marker anyway. Rejected: two writers for the
same job, and the skip path would not share the inner incomplete-flag
logic.

**Simplest alternative rejected:** Also call the inner writer from the
outer-skip branch without changing the gate. That still leaves
`current_library(true)` as an expensive vote+`save_subtly` side effect
on every copy-path swap.

**Risks:**
- `current_library(true)` will no longer populate `common_library` as a
  side effect of the gate. Next `current_library` read still votes
  (`board.rb:2826-2848`) or is scheduled from `post_process` (`board.rb:1267`).
- First copy of a mixed-member board now iterates buttons. Inner skip
  still skips HTTP. Cheap.

**Unresolved:** Whether any caller depended on the gate's
`current_library(true)` write of `common_library`. No copy-path reader
of `common_library` found; copy consumers read `swapped_library`.

**Test:** mixed arasaac+twemoji board, `@skip_swapped`, target
`opensymbols`, assert `current_library(true) == 'opensymbols'` (proves
the old gate would skip), assert no `default_images`, assert
`swapped_library == 'opensymbols'`. Mutation: restore the
`current_library(true)` gate; the assertion on `swapped_library` fails.

**Adversary pass (this session):** The old gate used votes as "already
on this library." Entering the loop does not re-lookup member images
(`swap_image_already_in_library?`). Sticky `swapped_library` after later
edits is pre-existing (`current_library` returns the marker first at
`board.rb:2822`). PaperTrail `whodunnit` around the save is still not in
`ensure`; leftover, not this change.

## Fix landed

CONFIRMED (`app/models/board.rb:2926`): outer gate is now
`settings['swapped_library'] != library`.

Red test: `spec/models/board_spec.rb` "should record swapped_library when
current_library already votes the target aggregate". Failed on HEAD with
`got: nil` before the gate change. After the change, the skip describe
(13 examples) plus copy_to_home_board / copy_board_to_library /
save_subtly (25 examples total) passed. Falsify: restored the
`current_library(true)` gate from a local copy of the fixed line; the new
example failed with `got: nil` again; restored the fixed line from
`/tmp/swap-gate-fixed-line.txt` (not `git checkout`).

## Staging timing

Attempted 2026-09-17. https://staging.lingolinq.com returned HTTP 200 in 0.40s.
The landing page loaded (Sign In / Register / Try a Demo). This session has no
throwaway staging account, no worker-log access, and no approved browser
session to copy a public board set. Stopped rather than invent a wall time
or mint a staging user.

What a later timed run should record:
- First copy of an already-OpenSymbols (or mixed-member) board set: skip/filter
  path, wall time, whether `swapped_library` is set on the new root.
- Immediate second copy of the same source for the same user: must reuse the
  existing set (no duplicate), cache-warm if any remaining lookups.
- OpenSymbols request volume in worker logs.

The unfixed outer-gate hole (now patched on this branch, not on staging until
a later PR) means a mixed-member first copy on current staging/prod can still
leave `swapped_library` nil and mint a duplicate on retry. Time after this
fix ships, or the duplicate-set check will fail for the wrong reason.

## Leftovers (not shipped)

Do not ship silently. None of these are in the outer-gate PR.

- **ARASAAC as default:** product call for Scot. Asking ARASAAC directly
  would replace per-word Hydra with one bulk `/defaults` and change which
  symbols users receive.
- **Historical `LibraryCache` misses:** write path is fixed; `find_words`
  has no expiry check on read (`library_cache.rb:208-209`). Pre-#904 429
  stamps on important boards can linger until the 6-month `added` stamp
  ages out.
- **Avatar CORS:** cosmetic (`glow-avatar` `crossOrigin = 'anonymous'`).
- **Mine-list overlay:** already has Try Again
  (`available-boards-section.hbs` / `retry_board_list`).
- **v1 `default_images` fallback:** `JSON.parse` without rescue when
  `OPENSYMBOLS_SECRET` is unset (`uploader.rb:769`). Prod uses the v2
  path.
- **`fetch_defaults_bulk` 429:** returns `{}` with no per-word errors
  (`open_symbols.rb:407-410`). Named-repo copies fall through to
  `find_images`.
- **`PaperTrail.request.whodunnit` in `swap_images`:** set/restore is
  not in `ensure` (`board.rb:3009-3033`). A raise inside the save window
  leaks the swap whodunnit. Separate from `save_subtly`.
