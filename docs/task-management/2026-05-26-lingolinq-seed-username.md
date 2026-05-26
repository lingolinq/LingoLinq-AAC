# lingolinq seed username idempotency

**Goal:** Allow `user_name: 'lingolinq'` for the official public vocabulary user; seeds must be idempotent.

## Evidence

- `db/seeds.rb:1157-1169` creates user via `User.process_new` with `user_name: 'lingolinq'`
- `config/routes.rb:14` lists `'lingolinq'` in `LingoLinq::RESERVED_ROUTES`
- `app/models/concerns/processable.rb:145` suffixes reserved names (`lingolinq` → `lingolinq_1`)
- `example` works because it is **not** in `RESERVED_ROUTES`
- No dedicated `get 'lingolinq'` route; `/:id` user route handles `/lingolinq` and `/lingolinq/yesno`

## Fix

1. Remove `'lingolinq'` from `RESERVED_ROUTES` — done
2. Harden seeds: find by email fallback; rename `lingolinq_*` → `lingolinq` via `rename_to` — done
3. Spec: `generate_user_name("lingolinq")` returns `"lingolinq"` — added
