// Board downloads through the Ember Data adapter (utils/persistence.js, DSExtend findRecord).
// Android sync fix, 2026-11-14: docs/task-management/2026-11-14_android-sync-slow-problems.md ("Final plan").

// caller_ms: how long any adapter find waits before it answers {error: 'timeout'}. That answer never falls back to
// the copy on the device (utils/persistence.js DSExtend findRecord `error`), so for a board the sync's own rules
// decide (utils/sync_board_fallback.js). One object, so tests can scale the limit instead of waiting for it.
export var find_limits = { caller_ms: 15000 };
