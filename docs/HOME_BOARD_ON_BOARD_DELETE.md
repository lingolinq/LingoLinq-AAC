# Home Board Handling When Deleting a Board

## Current State

### What Exists

1. **Flusher.flush_board_by_db_id** (`lib/flusher.rb` lines 109-116)
   - Clears `user.settings['preferences']['home_board']` for users who had the board as home
   - Only runs when flushing **old** deleted boards (300+ days) or during aggressive flush (e.g. user content flush)
   - **Does NOT run** when a board is normally deleted via the API

2. **Board#flush_related_records** (`app/models/board.rb` after_destroy)
   - Cleans `UserExtra.replaced_boards` for shallow clones
   - Creates `DeletedBoard` record for restore capability
   - **Does NOT** clear home_board or sidebar_boards from affected users

3. **process_home_board** (our recent fix)
   - When a user tries to SET a home board that doesn't exist → clears the invalid ref
   - Reactive: only runs on next user preferences update
   - Does not proactively fix users when a board is deleted

### What's Missing

When a board is destroyed via the normal flow (`DELETE /api/v1/boards/:id`):

- Users with that board as `preferences.home_board` keep a dangling reference
- Users with that board in `preferences.sidebar_boards` keep a dangling reference
- `UserBoardConnection` records become orphaned (board_id points to deleted row)
- Result: "Setting home board failed" when they try to change it, blank home on load, etc.

## Implementation Plan

### Option A: Add to Board#flush_related_records (Recommended)

**Location:** `app/models/board.rb` – inside `flush_related_records`, **before** `DeletedBoard.process(self)`.

**Logic:**
1. Collect user IDs from `UserBoardConnection.where(board_id: self.id)` (both home and sidebar)
2. For each affected user:
   - If `preferences.home_board.id` matches this board (by global_id) → clear `preferences.home_board`, set `home_board_changed`
   - Remove this board from `preferences.sidebar_boards` if present, set `sidebar_changed`
   - Save with `save_with_sync('home_board_deleted')` so clients get the update
3. Delete `UserBoardConnection.where(board_id: self.id)`
4. Call `DeletedBoard.process(self)` as today

**Notes:**
- `self.id` is still valid in `after_destroy` (object exists in memory)
- Match by `global_id` because `preferences.home_board['id']` stores global_id
- If many users are affected (see `Board::HOME_SIDEBAR_CLEANUP_ASYNC_THRESHOLD`), a background job is scheduled instead of doing it inline to avoid slow destroys

### Option B: Extract Shared Logic

1. Add `User.clear_home_and_sidebar_references_for_deleted_board(board_global_id, board_key)`
2. Call it from `Board#flush_related_records` and from `Flusher.flush_board_by_db_id` (replace existing inline logic there)
3. Keeps behavior consistent and logic in one place

### Sidebar Handling

- Sidebar entries use `board['key']` (e.g. `"username/board-name"`).
- When removing: `sidebar.reject! { |b| b['key'] == board_key }`
- Set `sidebar_changed` when the sidebar is modified.

### Testing

1. Unit: user has board as home → destroy board → user’s `preferences.home_board` cleared
2. Unit: user has board in sidebar → destroy board → board removed from sidebar
3. Integration: destroy board via API → verify user preferences and sync behavior

---

## Plan Review

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `app/models/board.rb` | Modify | Add home/sidebar cleanup logic inside `flush_related_records`, before `DeletedBoard.process(self)` |
| `app/models/user.rb` | Optional | Consider extracting `clear_home_and_sidebar_for_deleted_board` (Option B) for reuse with Flusher |
| `lib/flusher.rb` | Optional | Replace inline home_board clear (lines 109-116) with shared User method if Option B chosen |
| `spec/models/board_spec.rb` | Add | Specs for flush_related_records clearing home_board and sidebar when board destroyed |
| `spec/models/user_spec.rb` | Add | Specs for User method if Option B implemented |

### Edge Cases

1. **Users without UserBoardConnection** (Medium)
   - Users may have `preferences.home_board` set but no `UserBoardConnection` (bulk import, migration, or if `track_boards` never ran)
   - **Mitigation**: Rely on existing `process_home_board` reactive cleanup when they next update; document as known gap

2. **Shallow clones** (Medium)
   - Board key format differs: root = `"u/board"`, shallow = `"u/my:board"`
   - **Mitigation**: Match home by `preferences.home_board['id'] == board_global_id`; for sidebar use `b['key'] == self.key`

3. **UserBoardConnection `belongs_to :board`** (Low)
   - After board destroy, `ubc.board` loads nil
   - **Mitigation**: Use `ubc.user` only; avoid `ubc.board`

4. **Supervisor notification** (Medium)
   - When a communicator's home board is cleared, supervisors should be notified
   - **Mitigation**: Call `user.notify('home_board_changed')` after clearing (Flusher currently does NOT do this)

5. **`schedule_audit_protected_sources` and `update_home_board_inflections`** (Low)
   - `process_home_board` calls these when clearing; our flush should too for consistency

6. **Many affected users** (Medium)
   - A popular public board could have hundreds of users
   - **Mitigation**: Consider threshold; if exceeded, schedule async job to avoid blocking destroy

7. **`settings['preferences']` nil** (Low)
   - **Mitigation**: Guard with `user.settings && user.settings['preferences']` before accessing

### Implementation Issues

1. **Use `delete` not `nil`** for preferences cleanup. Flusher uses `= nil`; prefer `user.settings['preferences'].delete('home_board')` for consistency with `process_home_board`.

2. **Flusher does not clear sidebar** — if Option B (shared method) is used, Flusher should call the same method and get sidebar cleanup.

3. **Set `home_board_changed` and `sidebar_changed`** before `save_with_sync` so `track_boards` and notify semantics work correctly.

4. **Capture `board_key` and `board_global_id`** at start of `flush_related_records` from `self` before any processing.

5. **Order**: Process users and clear refs before deleting `UserBoardConnection` rows (need `ubc.user` to load users).

### Recommendations

1. Implement Option A first—add logic to `Board#flush_related_records`; keep it simple.
2. Add full notification flow: `notify('home_board_changed')`, `schedule_audit_protected_sources`, `schedule(:update_home_board_inflections)` when clearing home.
3. Guard all `user.settings` access for nil/incomplete settings.
