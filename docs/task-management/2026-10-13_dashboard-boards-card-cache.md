# Dashboard Boards card: instant previews on return (stale-while-revalidate)

Report: "toggle back and forth on the modern pages ... takes a long time for all boards to
appear in the boards div (several seconds)." The Boards card previews re-fetch from scratch on
every dashboard arrival.

## Fact sheet

### (a) Where is the value READ / set?
- CONFIRMED the Boards card reads `previewBoards` + `boardsLoading` (authenticated-view.hbs:563,
  via `boardsLoading`/`previewBoards.length`/`boardCount`).
- CONFIRMED `boardsLoading` = `_previewBoardsLoaded && !_fetchedPreviewBoards`
  (authenticated-view.js:947). `previewBoards` derives from `_fetchedPreviewBoards`/the full pool
  (:950). Both are set only in `_loadPreviewBoards` (:1128-1141) and `_fetchRemainingForCount`
  (:1164-1176).
- CONFIRMED `_loadPreviewBoards` runs on mount (didInsertElement :294/:317) and the
  `appState.currentUser.id` observer (:1115). It guards on `_previewBoardsLoaded` (instance
  state), so it fetches once PER INSTANCE.

### (b) ALL shapes of `_fetchedPreviewBoards` / `_fetchedBoards`
- null (fresh instance), `A([...])` (fetch success or cache seed), `A([])` (fetch error).
  CONFIRMED.

### (c) Cross-file claims
- CONFIRMED the component is rebuilt on every home/extras/index arrival (comment :1151; proven by
  the "set on destroyed object" errors fixed in commit c5f8b681f). So `_previewBoardsLoaded` and
  the lists reset to empty → `{loading}` → a full re-fetch (several seconds) each return.
- CONFIRMED the prior authors identified the fix ("a cache outliving the component") and
  deliberately did NOT do it (comment :1150-1156): nothing invalidates a board list on
  create/copy/delete, so a plain cache "would show a stale count and stale preview tiles until
  reload." This is the risk any cache must address.

## The fix: stale-while-revalidate (NOT a plain cache)
A module-scoped cache keyed by user id holds the last fetched preview + full pools. On
`_loadPreviewBoards`, BEFORE the `_previewBoardsLoaded` guard, seed `_fetchedPreviewBoards`
(and `_fetchedBoards`) from the cache if present — so the card paints instantly and
`boardsLoading` stays false. The existing background fetch STILL runs on every new instance
(the guard is instance-scoped, so a fresh instance always fetches) and overwrites the lists +
the cache on success. Staleness is therefore bounded to the fetch window (seconds), not "until
reload", which is what the prior note warned against — a created/copied/deleted board shows up
as soon as the background fetch returns.

Key invariants:
- The fetch is NEVER skipped when the cache seeds (seed precedes the `_previewBoardsLoaded`
  guard; the guard only prevents a double fetch within one instance).
- The cache is keyed by `currentUser.id`, so a different user never sees another's preview.
- The fetch's success/`_fetchRemainingForCount` final set writes the cache, so it tracks the
  freshest result.

## Candidate alternatives considered
- Plain cache that SKIPS the fetch: rejected — the exact staleness the prior authors flagged.
- Caching on a service (persistence/app-state) vs a module var: a module-scoped var already
  outlives the component and is the smallest change; no new service surface. Chosen.

## Risks / open questions
- A board created on another surface shows one fetch-window late on the dashboard (acceptable,
  and strictly better than several seconds of loading). If an explicit invalidation signal is
  wanted later, clear the cache entry on board create/copy/delete.
- The cache holds record references for the session; the records live in the Ember Data store
  anyway, so this is array references only.

## Test + mutation
Unit test: a first component fetches and populates the cache; a SECOND component for the same
user seeds `_fetchedPreviewBoards` from the cache synchronously (boardsLoading false) before its
own fetch resolves. Mutation: remove the seed line → the second instance's boardsLoading is true
until the fetch resolves → test fails.
