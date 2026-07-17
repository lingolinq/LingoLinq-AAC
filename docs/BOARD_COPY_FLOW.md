# Board Copy Flow

This note documents the current board-set copy behavior for the "Copy Board" and "Edit a Copy" flows.

## Goals

- Prefer copying the full linked board set instead of copying only the current board.
- When copying from a sub-board in speak mode, start from the active board-set root when that root is known and trustworthy.
- Keep long-running copy jobs alive even if the progress modal is closed.
- For "Edit a Copy", copy first and transition to the copied board in edit mode after the copy finishes.

## Frontend Flow

The main entry point is `application.copy_board`. If the user has not already chosen a copy action, it opens the `copy-board` modal. That modal defaults linked boards to a full-board-set copy action and keeps "Copy Just This Board" as a secondary option.

For classic speak-mode navigation, `application.copy_source_board` may resolve the copy source to the active root board from `root_board_state` or `temporary_root_board_state`. It does not use `copy_id` or `copy_key` as a root source because those fields point to the board a copy originally came from, not necessarily the root of the current board set.

For `board-detail` routes, "Edit a Copy" uses the visible route model directly and skips root re-resolution. This avoids stale speak-mode state causing the wrong source board to be copied.

The `copying-board` progress modal loads a selectable hierarchy through `BoardHierarchy`. When the user confirms, selected board ids are stored on the source board as `downstream_board_ids_to_copy` and sent through `editManager.copy_board`.

### Copy Modal Hierarchy Loading

The active rendered copy progress modal is the component-based `copying-board` modal from `modal-container`, with a legacy modal controller still present for older modal plumbing. Both paths use `copy_hierarchy_loader.loadHierarchyForCopyModal` so they stay behaviorally aligned.

The hierarchy loader intentionally races two data sources:

- `BoardHierarchy.load_with_button_set` starts immediately. This is the preferred path because a healthy button set can provide the most complete hierarchy from the persisted downstream board graph.
- `BoardHierarchy.load_from_live_links` starts after a short delay if the button-set path has not returned yet. It walks the live `load_board` links on the board records and accepts the first usable hierarchy that resolves.

This avoids making users wait for the full button-set timeout when a newly copied root board does not have a generated button set yet. That situation is common after large board-set copies because deferred `BoardDownstreamButtonSet.update_for` jobs run on the slow queue and may not have drained by the time the user immediately copies or edits another board. If the button-set path is healthy and returns quickly, the live-links path is canceled before it runs, avoiding unnecessary board fetches.

When the live-links path wins, the modal sets `hierarchyRootOnlyWarning` so the UI explains that the list was rebuilt from folder links. If any live linked board cannot be fetched, the hierarchy is marked incomplete and the backend can still expand selected boards defensively. If both hierarchy sources fail, the existing `hierarchyLoadFailed` / timeout error UI is shown.

## Backend Flow

The first board copy is created through `Board#create_copy`, which sends the source board's backend `global_id` as `parent_board_id`.

For linked-board copies, `editManager.copy_board` posts to `copy_board_links`, which schedules `User#copy_board_links`. The backend delegates to `BoardSetCopier`.

`BoardSetCopier` copies the already-selected downstream boards, builds a mapper from old ids to new ids, then relinks copied boards so their `load_board` references point to the new copies. When the UI sends explicit selected ids, the copier trusts those ids rather than intersecting them with cached `downstream_board_ids`, because that cache may lag behind live folder buttons.

## Known Follow-Up

The modal can now build a hierarchy from either a button set or live board links, but both paths still depend on the frontend being able to resolve board records for the linked ids/keys. If a linked board cannot be loaded in the browser, the modal marks the live-link hierarchy incomplete and relies on the backend copy expansion as the final safety net.
