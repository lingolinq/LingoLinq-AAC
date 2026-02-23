# RSpec Failure Fix Plan (Post Rails 7.2 Upgrade)

**Current state:** ~4,781 examples, ~2,287 failures, 42 pending

This document organizes failure patterns observed after the Rails upgrade and suggests fix strategies.

---

## 1. Rails 7 Security: Unsafe Redirects ✅ DONE

**Status:** Fixed in `app/controllers/session_controller.rb`. OAuth and SAML redirects now pass `allow_other_host: true`. Other controllers (boards icon, users image proxy) use internal paths or route helpers; add `allow_other_host: true` there only if failures appear.

**Error:** `Unsafe redirect to "http://...", pass allow_other_host: true to redirect anyway`

**Cause:** Rails 7.0+ blocks redirects to external hosts by default for security.

**Fix applied:** Added `allow_other_host: true` to:
- OAuth `paramified_redirect` (success and reject callbacks)
- SAML `saml_start` (AuthRequest to IdP)
- SAML `saml_idp_logout_request` (SLO response to IdP)

**Where to search** (if more failures appear):
```bash
rg "redirect_to" app/controllers/
```
Look for redirects to user-controlled or external URLs (OAuth callbacks, SAML auth, etc.).

---

## 2. SecureSerialize / JSON Column Persistence

**Error patterns:**
- `undefined method '[]=' for nil` when assigning `record.settings['key'] = value`
- `undefined method '[]' for nil` when reading `record.settings['key']`
- Changes to `settings` (or other `secure_serialize` columns) not persisting

**Cause:** Same as Device token fix: Rails 7 dirty tracking may not detect in-place mutations or setter assignments on SecureSerialize columns.

**Fix:** Use `update_column(:column_name, GoSecure::SecureJson.dump(modified_hash))` when mutating secure-serialized JSON, or ensure the parent object is initialized (`record.settings ||= {}`) before mutation.

**Affected areas (from failure snippets):**
- `UserIntegration` (`i.settings['url'] = ...`)
- Possibly `Utterance`, `ButtonImage`, other models with `secure_serialize`

**Strategy:** Run failing specs for models that use `secure_serialize`, identify which need the same `update_column` pattern as Device.

---

## 3. URL / Host Expectation Mismatches

**Error patterns:**
- `expected: "http://www.example.com/..." got: "http://test.host/..."`
- `expected: "http://www.example.com/pib.png"` (different host)
- `JsonApi::Json.current_host` or request host differs from `example.com` in fixtures

**Cause:** Tests expect `example.com` but Rails 7 or test setup may use `test.host` or different default host.

**Fix:**
- Set `host! 'www.example.com'` in controller specs (or equivalent) where tests expect `example.com`.
- Or stub `JsonApi::Json.current_host` / `request.host` in specs that assert on URLs.
- Check `config/environments/test.rb` and any host-related config.

---

## 4. Device generate_token! Spec Setup

**Error:** `device must already be saved` / `undefined method '[]=' for nil` (for `d.settings`)

**Cause:** Specs create devices but may not save them before calling `generate_token!`, or `d.settings` is nil because the device wasn't properly initialized.

**Fix:** In `spec/models/device_spec.rb`, ensure:
- `d.save!` (or equivalent) before `d.generate_token!` for examples that need a persisted device.
- `d.settings ||= {}` before assigning to `d.settings['keys']` or other keys if the record is new or settings aren't loaded.

---

## 5. Controller / Request Expectations

**Error patterns:**
- `expected response.successful? to be truthy, got false`
- Proxy or search endpoints returning non-2xx
- `GET "http://test.host/api/v1/search/proxy?url=..."` unsuccessful

**Cause:** Controllers or middleware behavior may have changed (e.g., host validation, parameter handling, encoding).

**Fix:**
- Run a single failing spec with `--format documentation` to see the full request/response.
- Check if URL encoding changed (`%20` vs `%2520` in query params).
- Verify any new Rails 7 middleware or CSRF/forgery protection isn't blocking test requests.

---

## 6. Mock / Expectation Mismatches

**Error patterns:**
- `expected(SentencePic).to receive(:generate)...` – mock not called
- `expected(ButtonImage).to receive(...)` – expectation not met
- `expected X, got Y` for cached URLs, image URLs, etc.

**Cause:** Code paths may have changed; mocks may be too strict or ordered incorrectly.

**Fix:**
- Relax mocks (e.g., `allow` instead of `expect` where appropriate).
- Ensure setup (e.g., `User.create`, `Board.create`) matches what the code path expects.
- Re-run with `--order defined` to rule out order dependencies.

---

## Suggested Execution Order

| Priority | Category                    | Effort | Impact |
|----------|-----------------------------|--------|--------|
| 1        | Unsafe redirects ✅         | Low    | High   |
| 2        | SecureSerialize persistence | Medium | High   |
| 3        | Device spec setup           | Low    | Medium |
| 4        | URL/host expectations       | Medium | Medium |
| 5        | Controller/request failures | High   | High   |
| 6        | Mock/expectation mismatches | High   | Varies |

---

## Quick Commands

```bash
# Run a single failing spec with full output
bundle exec rspec spec/path/to/spec.rb:LINE --format documentation

# Run all specs for one file
bundle exec rspec spec/models/device_spec.rb

# Run with defined order (no randomization)
bundle exec rspec --order defined

# Count failures by file (run script; shows rspec output then failure counts)
./bin/rspec_failures_by_file

# Or: save rspec output first, then parse (avoids re-run when piped)
bundle exec rspec --format progress 2>&1 | tee rspec_output.txt
grep -E "(Failures|Failed examples):" -A 5000 rspec_output.txt | grep "rspec \./" | sed 's/rspec //' | cut -d'#' -f1 | cut -d: -f1 | sort | uniq -c | sort -rn

# Parse an existing rspec output file
./bin/rspec_failures_by_file rspec_output.txt
```

---

## Notes

- **AUTH-DEBUG** and similar logging in `Device.check_token` and controllers can be removed or gated once auth is stable.
- Consider fixing `spec_helper` `fixture_path` deprecation: use plural `fixture_paths` per Rails 7.1.
- Run `ember test` for frontend tests; not covered by this plan.
