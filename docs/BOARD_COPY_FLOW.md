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

## Backend Flow

The first board copy is created through `Board#create_copy`, which sends the source board's backend `global_id` as `parent_board_id`.

For linked-board copies, `editManager.copy_board` posts to `copy_board_links`, which schedules `User#copy_board_links`. The backend delegates to `BoardSetCopier`.

`BoardSetCopier` copies the already-selected downstream boards, builds a mapper from old ids to new ids, then relinks copied boards so their `load_board` references point to the new copies. When the UI sends explicit selected ids, the copier trusts those ids rather than intersecting them with cached `downstream_board_ids`, because that cache may lag behind live folder buttons.

## Known Follow-Up

The selectable hierarchy is only as deep as the data available to `BoardHierarchy`. It can recurse through the button set, but if the button set is stale or incomplete it may only show immediate folder buttons from the root board. In that case, the backend will copy the selected boards correctly, but deeper linked pages that were not discovered by the modal will not be included.
