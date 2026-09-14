# Command injection in the utterance preview worker — diagnosis and PROPOSALS

Branch `traci/fix/restore-speak-options`. Rule #0.12: proposals adversarially reviewed BEFORE
any fix is written. Nothing below is implemented.

---

## (a) Where is the value READ? CONFIRMED

`lib/sentence_pic.rb:40`:
```ruby
`montage #{image_commands.join(' ')} -tile #{columns}x#{rows} … #{montage}`
```
Backticks = `Kernel#\``, which runs the string **through a shell**. `image_commands` entries are
built at `:37`:
```ruby
image_commands << "-label \"#{label}\" #{filename}"
```
with `label` from `:33`:
```ruby
label = (button['label'] || button['vocalization'] || '').gsub("\"", "\\\"")
```

**The `gsub` escapes double quotes and nothing else.** Inside a double-quoted shell string,
`$(…)` and backticks still execute. Demonstrated by running it, not by reading it:
```
raw label : $(id) and `whoami`
after gsub: $(id) and `whoami`
shell frag: -label "$(id) and `whoami`" /tmp/file.png
```

## (b) What are ALL the interpolated values, and which are attacker-controlled?

Enumerated exhaustively from `:37`, `:40`, `:43`, `:45` (rule #0.14.4 — list every match before
touching a shared line):

| Value | Origin | Attacker-controlled? |
|---|---|---|
| `label` | `button['label'] \|\| button['vocalization']` | **YES — free text, the vector** |
| `filename` | `OBF::Utils.save_image` -> `Tempfile.new(['image_stash', ext])` | **No.** Tempfile path; `ext` comes from `MIME::Types[content_type].preferred_extension`, i.e. a curated database, not free text |
| `montage`, `preview` | `OBF::Utils.temp_path` -> `Tempfile.new` (`obf/utils.rb:371-376`) | No |
| `columns`, `rows`, `width`, `height` | integer arithmetic on `button_list.length` | No |

=> **exactly one vector: `label`.** Both `convert` calls (`:43`, `:45`) interpolate only
server-generated paths, so they are not vectors today — but they are the same unsafe
construct and it would be incoherent to fix one shell call and leave two.

**Adjacent, NOT a vector, worth noting:** `save_image` can return `nil` (too-small data, no
data), so `filename` can be nil and `:37` then emits `-label "x" ` with an empty path,
producing a malformed montage command. Robustness, not security. Do not fix here.

## (c) Reachability — every link CONFIRMED, and it is fully automatic

1. `api/utterances_controller.rb:17-32` — `utt_data.permit!`; no shape/type/size constraint.
2. `app/models/utterance.rb:331` — `self.data['button_list'] = params['button_list']`, raw.
   The model declares **zero** `validates`.
3. `app/models/utterance.rb:14` — `after_save :generate_preview_later`.
4. `:63-68` — schedules `generate_preview` while `large_image_url_attempted` is unset.
5. `:50` — `SentencePic.generate(self)` -> the backticks.

**Any authenticated user who can share a sentence can execute shell commands in the background
worker.** Sharing is a core end-user action; no admin role, no second step.

---

## Existing test that MUST change (enumerated before touching it)

`spec/lib/sentence_pic_spec.rb:23-24` stubs the backtick operator and pins the exact command
string:
```ruby
expect(SentencePic).to receive(:'`').with("montage -label \"hat\" pic1.png … /tmp/montage.png")
```
Any fix changes that string or that call shape. It is the ONLY spec asserting the command; the
other `SentencePic` references (`spec/models/utterance_spec.rb`, `spec/models/log_session_spec.rb`)
all stub `generate` wholesale and are unaffected — checked.

---

## Candidate fixes

**A — `Shellwords.escape` the label, keep the shell.**
`image_commands << "-label #{Shellwords.escape(label)} #{filename}"`.
One line. Fixes the known vector. **Leaves a shell**, so every future interpolation into these
three command strings is a fresh hole, and `filename` stays unescaped (safe today only because
its origin is a Tempfile).

**B — remove the shell: build an argv array and exec without one (PROPOSED).**
`Open3.capture3('montage', '-label', label, filename, '-tile', "#{columns}x#{rows}", …)`.
With array-form exec there is no shell, so `$()`, backticks, `;`, `|`, newlines and quotes are
all inert **as a class**, not case by case. Also removes the need to escape `filename`, and the
same treatment applies to both `convert` calls for consistency.
Costs: larger diff; rewrites the pinned spec expectation; must confirm `montage`/`convert`
accept the same arguments when not shell-split (they are ordinary binaries taking argv, so
yes — but the reviewer should check the `-bordercolor "#888"` value, whose quotes exist only
for the shell and must become a bare `#888` element).

**C — sanitise the label to an allowlist.** REJECTED, and specifically wrong for THIS app:
AAC labels are user vocabulary in 13 locales, including accented and CJK characters. A
character allowlist would silently mangle real communication content. It also fails the
"legitimate `$`" case — "cost $5" is a plausible AAC label.

**D — A + B together.** Redundant if B is done; escaping is meaningless without a shell.

**Leaning B.** A fixes the instance; B removes the class. Both are small; B is the one that
stays fixed.

---

## The RED TEST, written FIRST — and it must have TWO arms

Arm 1 alone is passable by an over-aggressive sanitiser (candidate C), which would "fix" the
vulnerability by breaking user content. Arm 2 is what makes C fail.

1. **Execution proof.** A label of `$(touch <marker-in-tmpdir>)`, with `save_image`,
   `temp_path` and `remote_upload` stubbed but **the shell call NOT stubbed**. Assert the
   marker file does not exist afterwards. Today the shell evaluates the substitution before
   `montage` is even looked up, so the file IS created -> RED. Benign side effect, no
   destructive verification.
2. **Content-preservation proof.** A legitimate label containing shell-significant characters
   — `cost $5 & up` — must still reach the renderer as that exact label, intact.

**Mutations that must make it fail:** (i) revert to the `gsub` version -> arm 1 red;
(ii) strip or replace `$`/`&` in labels -> arm 2 red.

---

# INDEPENDENT SECURITY AUDIT (agent briefed WITHOUT my write-up) — findings I verified myself

## 1. The house argv pattern already exists, ONE STACK FRAME AWAY. CONFIRMED.

`config/initializers/obf_save_image_hardening.rb:91-118`:
```ruby
args = ['convert', '-background', background, '-density', '300',
        '-resize', "#{size}x#{size}", '-gravity', 'center',
        '-extent', "#{size}x#{size}", file.path, '-flatten', "#{file.path}.jpg"]
OBF::Utils.log "    #{args.join(' ')}"
...
system(*args)              # and Process.spawn(*args) for the threadable case
```
This initializer monkey-patches **the very `OBF::Utils.save_image` that `SentencePic` calls**.
So candidate B is not a new mechanism — it is the pattern this repo already uses for exactly
this binary, sitting one frame from the vulnerable code. That settles B vs A on rule #0.6
(reuse existing primitives) rather than on taste, and it gives the fix a shape to copy
including the `log "args.join(' ')"` line.

`Shellwords` appears in `scripts/legal-naming-check.rb:441` and nowhere else in `lib/`, `app/`
or `config/` — so candidate A would be the ODD idiom here, not the safe default.

## 2. THE FIX DOES NOT BELONG ON THIS BRANCH. CONFIRMED, and it needs Traci's call.

```
git log --oneline origin/staging..HEAD -- lib/sentence_pic.rb   ->  (empty)
git log --oneline -1 -- lib/sentence_pic.rb                     ->  3df519fe8 spec cleanup
```
`lib/sentence_pic.rb` is **untouched on `traci/fix/restore-speak-options`**. This is a
pre-existing defect, not one this branch introduced. Per CLAUDE.md's branching rules a fix
belongs on its own branch off `staging` — and this branch is ALREADY overloaded (category
grouping + registration pickers + scanner + two prediction fixes), which the queue artifact
flags as a review problem. Stacking an unrelated security fix on top makes that worse and
couples a security patch to a large feature review.

## 3. Reachability is worse than I stated: registration is open. CONFIRMED.
`app/controllers/api/users_controller.rb:5` exempts `create` from `require_api_token`, so the
sequence is **self-register, then POST one utterance** — two HTTP calls, no existing account
needed. Creating an utterance for YOURSELF skips the `allowed?(user, 'model')` check at
`utterances_controller.rb:24` entirely.
**Second sink, same vulnerability:** `app/models/log_session.rb:1159-1165` funnels a `share`
log event's `button_list` into the same `Utterance.process_new`.

## 4. The length cap is NOT a mitigation.
`text_limit` is 25 when `columns == 1` (`:28-30`), and an attacker picks `columns = 1` simply
by sending a one-button `button_list` (`:18-22`). Independently, every label is concatenated
into ONE shell string, so an unterminated `$(` in one label consumes the separators and the
following labels as command text. CONFIRMED as to construction.

## 5. Blast radius — what the worker process holds
From `render.yaml` worker `envVars` (reported by the auditor; I did not re-read the file):
`DATABASE_URL`, `REDIS_URL`, **`SECURE_ENCRYPTION_KEY` and `SECURE_NONCE_KEY`**,
`SECRET_KEY_BASE`, `COOKIE_KEY`, `RAILS_MASTER_KEY`. The two SECURE_* keys are what make
`secure_serialize` columns readable. Code execution in that process therefore means plaintext
access to the data the encryption exists to protect. **UPGRADED TO CONFIRMED — I have now read `render.yaml` myself.** The `type: worker` service
declares exactly: `RAILS_MASTER_KEY`, `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY_BASE`,
`SECURE_ENCRYPTION_KEY`, `SECURE_NONCE_KEY`, `COOKIE_KEY`. Its `runtime: ruby` (native
buildpack) also means the `Dockerfile`'s `USER app` hardening does NOT apply to it, and its
`startCommand` runs `resque:work` on `priority,default,slow` — the `default` queue this job
lands on. So: shell in that process sits beside the database URL and both keys that
`secure_serialize` depends on.

## 6. One exploitable instance, a stylistic class of THREE
| Site | User-influenced? |
|---|---|
| `lib/sentence_pic.rb:40,43,45` | **YES — `label`.** The only exploitable one |
| `app/models/concerns/uploadable.rb:279` (`identify -verbose #{file.path}`) | No — Tempfile. Latent |
| `app/models/concerns/uploadable.rb:361` (`convert … #{path}`) | No — Tempfile. Latent |
Rake/build-time hits are operator-only. Converting all three closes the class; converting one
leaves two a refactor away from the same defect. **Decide deliberately whether the two latent
ones are in scope — they are a different risk (0 today) and arguably a separate unit.**

---

# SEPARATE NEW FINDING — SSRF in the same function. DO NOT BUNDLE.

`lib/sentence_pic.rb:9` fetches `button['image']` — straight from the request body — via
`OBF::Utils.save_image` -> `OBF::Utils.get_url`, with redirects followed.
`OBF::Utils.sanitize_url` (`obf/utils.rb:60-66`, read by me) blocks only:
`^127`, `localhost`, `^0`, and bare-integer hosts.
**`169.254.169.254` (cloud metadata) and RFC1918 ranges (10.x, 172.16-31.x, 192.168.x) all
pass that filter.** And the repo already has the right tool: `lib/safe_http.rb`, used for the
equivalent fetch at `app/models/concerns/uploadable.rb:266` (`SafeHttp.get(fetch_url)`).

CONFIRMED: the blocklist's contents, the existence and use of `SafeHttp`.
**NOT YET CONFIRMED:** whether `get_url` actually calls `sanitize_url` on this path, and
whether `Uploader.signed_internal_url` alters it first. Until that is traced this is a
credible mechanism, not a demonstrated live SSRF. It needs its own diagnosis and red test.

---

# ADVERSARIAL REVIEW OF THE PROPOSAL — outcome, and MY RED TEST WAS HOLLOW

Everything below I re-verified BY EXECUTION, not by reading.

## F1 (CRITICAL, my error) — the proposed arm 1 would have been GREEN against the live bug

Truncation at `lib/sentence_pic.rb:34-36` runs BEFORE interpolation, and `text_limit` is **10**
whenever there are 3+ buttons (`:28-30`), 20 at two, 25 at one. Measured, reproducing `:27-40`:

```
payload "$(touch <mktmpdir>/m)"  (40 chars)
 3 buttons (limit 10): -label "$(touch .."   -> payload survived intact? false
 1 button  (limit 25): -label "$(touch /tmp/d20260904-.."  -> survived intact? false
```

The existing fixture (`spec/lib/sentence_pic_spec.rb:11-15`) uses THREE buttons, and any
`Dir.mktmpdir` marker path blows the budget even at one. **My test would have passed, and been
counted as coverage, against a vulnerability that was still live.** This is rule #0.13(b) —
I never enumerated the reachable states of `text_limit`.

**The bug IS real; here is the proof, with a payload inside the budget:**
```
payload "$(touch /tmp/ll_poc)"  (20 chars), ONE button
1) shell executed the substitution? true      <- vulnerable
2) same value as a literal argv element?  false  <- candidate B is immune
```

**Required:** arm 1 uses exactly ONE button, a payload <= 25 chars, and a comment naming the
truncation — or the next person "simplifies" the fixture to three buttons and silently
re-hollows it.

## F2 — arms 1+2 are still not sufficient
Weakest implementation passing both: `label.gsub('$(', '')` — arm 1 green, arm 2 green,
backtick injection wide open. Arm 1 must exercise several metacharacter families (`$( )`,
backtick, `;`, `|`, newline). Arms 1+2 also cannot distinguish A from B, so they cannot
justify choosing B: add an assertion that the runner receives an **Array** and that
`` Kernel#` `` is never called.

## F5 (the finding that changes the fix) — NEITHER A NOR B CLOSES IMAGEMAGICK'S OWN ESCAPES
These are argv-level features, not shell features. Measured with no shell involved:
```
montage -label '%[fx:1+1]'  vs  -label '2'   -> AE=0   ImageMagick EVALUATED the expression
montage -label '%%'         vs  -label '%'   -> AE=0   '%%' renders as a literal '%'
montage -label '@/etc/hostname'              -> "not allowed by the security policy"
```
- `%[fx:…]` is an expression evaluator and `config/initializers/imagemagick_limits.rb` sets no
  `MAGICK_TIME_LIMIT` -> unbounded compute in the worker. `%f`/`%d` leak the temp path.
- `-label @path` is a FILE-READ primitive whose output is rendered into a PNG that
  `:47-50` uploads to S3 as the public preview. `@/app/.env` is 10 characters.
  **It is blocked here only by `/etc/ImageMagick-6/policy.xml` — Debian packaging, not this
  repo.** `render.yaml` uses the native ruby runtime, so the production policy is UNVERIFIED
  and must be checked on the live worker.
- `Shellwords.escape` provably does not help: `@` is in its safe set, and `%[fx:…]` is
  unescaped by the shell before montage sees it.
- Remedy for the `%` class, measured content-preserving: `gsub('%', '%%')`, applied **after**
  truncation (before it, truncation can split a `%%` pair). The leading-`@` case has **no**
  content-preserving escape and needs an explicit written decision.

## F3 / F4 — candidate B AS WRITTEN introduces two regressions. Measured:
```
3a) shell, nil filename : no exception
3b) argv,  nil filename : TypeError: no implicit conversion of nil into String
```
`save_image` returns nil on a 404 / non-http url / sub-100-byte body, and `button['image']` is
attacker-controlled. Same for a missing binary: argv raises `Errno::ENOENT` where the shell
returned `""`. **And the consequence is not a one-off failure:** `app/models/utterance.rb:50`
calls `generate` BEFORE `:55` sets `large_image_url_attempted`, so a raise means the flag never
latches and `generate_preview_later` re-enqueues a job that raises again on every subsequent
save, permanently. My proposal said of the nil case "Robustness, not security. Do not fix
here." **That is wrong under B — B is what makes it load-bearing.**

## F6 — the `gsub` at `:33` is a no-op even today
ImageMagick's own label parser unescapes `\"`, so `-label 'say \"hi\"'` and `-label 'say "hi"'`
render byte-identically. Delete it rather than leave a misleading no-op a future reader trusts.
Arm 2's label must therefore contain `"` and `\` as well as `$` and `&`.

## F7 — severity UNDERSTATED, not overstated
No sharing step and no premium check: `create` needs only `require_api_token`
(`utterances_controller.rb:17-31`), and the job fires from `after_save`. Contrast `share` at
`:43-45`, which DOES gate on `any_premium_or_grace_period?`. One authenticated POST, any plan,
from either of two endpoints (the second being `log_session.rb:1159-1165`).

---

# CANDIDATE E — the proposal that survives. NOT YET IMPLEMENTED.

1. **Argv execution via one small shared helper in `lib/`**, not `Open3` inlined three times —
   the two latent sites (`uploadable.rb:279`, `:361`) will want the same helper (rule #0.6).
   Follow the in-repo precedent `obf_save_image_hardening.rb:91-118`.
2. The helper **rescues `Errno::ENOENT`** (precedent: `obf_imagemagick_fallback.rb:7`),
   preserving today's silent-degrade instead of latching a permanent re-enqueue loop.
3. `label.to_s`; **delete** the dead `gsub` at `:33`; apply `gsub('%', '%%')` **after**
   truncation; make an explicit written decision on a leading `@`.
4. nil `filename`: `next` past the button. **Flag deliberately** — today a nil filename leaves
   `-label "x"` applying to the NEXT image, so skipping changes label alignment. That is an
   improvement AND a second behavioural change; decide whether it ships here or separately.
5. Test: ONE button, short multi-family payload, `Dir.mktmpdir`, plus an argv-shape assertion,
   plus arm 2 carrying `" \ $ &` and non-ASCII.

## Unresolved, and NOT to be hand-waved
- Whether the **production** ImageMagick policy blocks `@*`. Not checkable from the repo.
- Whether the two latent `uploadable.rb` sites are in scope (0 risk today; a separate unit).
