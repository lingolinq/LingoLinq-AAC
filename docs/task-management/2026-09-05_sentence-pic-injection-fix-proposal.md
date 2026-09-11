# SentencePic command injection — PROPOSAL for adversarial review (NOT implemented)

Branch `fix/traci-sentence-pic-command-injection`, off `develop` @ 61aec8394.
Nothing below is written to code yet.

An earlier diagnosis and first adversarial round for this bug were written on the unrelated
branch `traci/fix/restore-speak-options` and are deliberately NOT part of this history, so this
document is self-contained. The one finding from that round that must not be lost is restated
here because it shaped the test design: the FIRST red test written for this bug was **hollow**.
It used the existing three-button fixture, and at three or more buttons `text_limit` is 10
(`lib/sentence_pic.rb:28-30`), which truncated every payload into harmless text -- so the test
passed against a vulnerability that was still live. Any execution-proof arm must therefore use
ONE button (`text_limit` 25) and a payload inside that budget. That constraint is carried into
the test section below and into a comment in the spec itself.

## Vulnerability — RE-PROVEN BY EXECUTION on this branch, 2026-09-05

Not re-read: re-run. Verbatim reproduction of `lib/sentence_pic.rb:17-40` with the real
`Kernel#\`` intact and only `save_image`/`temp_path` substituted:

```
payload: "$(touch pwned)"  (14 chars)
command: montage -label "$(touch pwned)" in.png -tile 1x1 -shadow -pointsize 16 …
columns=1 text_limit=25 -> payload truncated? false
RESULT:  marker file 'pwned' created by the shell? true
```

The `gsub("\"", "\\\"")` at `:33` escapes double quotes only; `$( )` and backticks are live
inside a double-quoted shell word. Reachable via one authenticated `POST /api/v1/utterances`
(`after_save` -> `generate_preview_later` -> `SentencePic.generate`) and via a `share` log
event (`log_session.rb:1159-1165`).

## Measured ImageMagick facts (IM 6.9.12-98, argv form, NO shell involved)

Removing the shell is necessary but NOT sufficient — `-label` has its own interpreter.
Each row below is a `compare -metric AE` between two rendered PNGs; AE=0 means identical.

| Input to `-label` | Compared with | AE | Meaning |
|---|---|---|---|
| `%[fx:1+1]` | `2` | **0** | `%[fx:…]` is EVALUATED. No `MAGICK_TIME_LIMIT` is set -> unbounded compute |
| `%%[fx:1+1]` | `%[fx:1+1]` | 400 | `%%` NEUTRALISES it |
| `%%` | `%` | **0** | `%%` renders a literal `%` -> content-preserving |
| `100%% sure` | `100% sure` | **0** | ditto, on realistic content |
| `a\b` | `ab` | **0** | a lone backslash is CONSUMED (C-style escaping) |
| `a\\b` | `ab` | 195 | `\\` renders a literal backslash |
| `a\@b` | `a@b` | **0** | `\@` renders a literal `@` -> content-preserving |
| `café` / `cost $5 & up` | themselves | **0** | non-ASCII and shell metacharacters render untouched |

`@/etc/hostname` -> `not allowed by the security policy` — but that is
`/etc/ImageMagick-6/policy.xml:141` (`<policy domain="path" rights="none" pattern="@*"/>`),
**Debian packaging, not this repo**. `\@secret.txt` exits 0 where `@secret.txt` exits 1, i.e.
the backslash prevents path resolution before the policy is consulted.
**UNVERIFIED: whether the Render worker (`runtime: ruby`, native buildpack) ships that policy.**
`MAGICK_CONFIGURE_PATH` does not override policy.xml on IM6, so this is not locally testable.

## Proposed change (Candidate E)

### 1. New `lib/image_magick_runner.rb` — argv execution + label escaping
Follows the in-repo precedent `config/initializers/obf_save_image_hardening.rb:91-118`
(`system(*args)` with a `log "#{args.join(' ')}"` line), which already hardens the very
`OBF::Utils.save_image` that SentencePic calls. `Shellwords` appears nowhere in `lib/`,
`app/` or `config/`, so escaping-for-a-shell would be the odd idiom here.

```ruby
module ImageMagickRunner
  def self.run(*args)
    args = args.flatten.map(&:to_s)
    OBF::Utils.log "    #{args.join(' ')}"
    system(*args)
  rescue Errno::ENOENT
    nil          # binary absent: preserve Kernel#`'s silent degrade (precedent: obf_imagemagick_fallback.rb:7)
  end

  def self.escape_label(label)
    escaped = label.to_s.gsub('\\') { '\\\\' }.gsub('%', '%%')
    escaped = "\\#{escaped}" if escaped.start_with?('@')
    escaped
  end
end
```

### 2. `lib/sentence_pic.rb` — three shell calls become argv
- `-label` values become discrete argv elements; `-bordercolor '#888'` loses its shell-only quotes.
- `:33` `gsub("\"", …)` DELETED — measured no-op (IM consumes the backslash).
- `next unless filename` — `save_image` returns nil for an unreachable/too-small image and the
  URL is attacker-supplied; argv raises `TypeError` on nil where the shell swallowed it.
- Escape AFTER truncation (truncating an escaped string can split `%%` back into a live `%`).

### 3. Test (RED FIRST), `spec/lib/sentence_pic_spec.rb`
- **Arm 1 — execution proof:** ONE button (so `text_limit` is 25, not 10), payload well inside
  the budget, `save_image`/`temp_path`/`remote_upload` stubbed but the runner NOT stubbed;
  assert no marker file. Payload must span several families: `$( )`, backtick, `;`, `|`, newline.
- **Arm 2 — content preservation:** a label carrying `" \ $ & %` and non-ASCII must arrive intact.
- **Arm 3 — shape:** the runner receives an Array and `Kernel#\`` is never called (this is what
  separates candidate B/E from candidate A, which arms 1+2 cannot distinguish).
- Falsify all three by reverting the fix from a hand-made copy (never `git checkout`).

## Known traps in my own proposal — reviewers should start here

1. **`:42` counts `image_commands`.** `if image_commands.length > PER_ROW * 2` picks gravity
   north vs center. Today that array holds ONE entry per button; under argv it would hold
   THREE, silently changing the layout threshold from 12 buttons to 4. Needs a separate
   rendered-button counter.
2. **`columns`/`rows` are computed from `button_list.length` before any skipping.** With
   `next unless filename`, tile geometry can exceed the image count. It already mismatches
   today (an empty path shifts labels onto the wrong image); should the fix recompute, or is
   that a second behavioural change that belongs elsewhere?
3. **Leading `@` decision.** Proposal escapes rather than strips. Is `\@` reliable across IM6/IM7?
4. **`system` vs `Open3`.** Backticks captured stdout (discarded at `:40`,`:43`,`:45` — checked);
   `system` lets montage stderr reach the process stderr. Is that acceptable, or a log-noise/PII risk?
5. **Escape order.** `\\` doubling then `%` doubling then `@` prefix — does any order interact?
6. **`rescue Errno::ENOENT` may be too broad or too narrow** — does it mask a real failure that
   today would surface? Note `utterance.rb:50` runs BEFORE `:55` sets
   `large_image_url_attempted`, so any raise re-enqueues the job forever.
7. **Is a new `lib/` constant right**, given Zeitwerk autoloads `lib/` (`config/application.rb:61`)
   but the Resque path skips it per that comment? Would the worker resolve `ImageMagickRunner`?

---

# REVIEW OUTCOME — two independent reviewers. Candidate E is REJECTED as written.

Both reviewed without seeing each other. They CONVERGED on three defects (single-element shell,
the nil-filename guard, stderr being a non-issue). Every finding below I re-verified myself.

## What survived
`escape_label` is sound. Reviewer 1 swept every byte 0x20-0x7E in three positions plus 3000
randomised strings and found exactly the three sigils I had (`%`, `\`, leading `@`) and no
residual construct. Escape ORDER is safe. Argv-option injection (a label like `-write`) is NOT
exploitable — montage consumes `-label`'s next argv element unconditionally. Deleting the `:33`
`gsub` is a genuine no-op (AE=0).

## Defects I have to fix — all reproduced by me

| id | Defect | My verification |
|---|---|---|
| **D2/R2** | **An empty-string argv element makes montage read STDIN and HANG.** `system` inherits the worker's stdin. Today's shell form eats the empty word and exits 1. My fix would have let one failed image download **wedge the Resque worker forever** | `sleep 20 \| montage -label x "" … -> rc=124 (timeout)`; shell form `rc=1`; with `</dev/null` it exits cleanly |
| **D2a/R2a** | My `next unless filename` was self-defeating: my own `map(&:to_s)` turns `nil` into `""`, and `""` is **truthy** | reproduced |
| **R1** | `:42` counts `image_commands` (1/button now, 3/button under argv) -> `-gravity north` moves from 13+ buttons to **5+**. My doc's "12 -> 4" was wrong twice | `:42` reads `image_commands.length > PER_ROW * 2` |
| **D1/R9** | `system(*args)` with ONE element is Ruby's **shell** form. A "no shell ever" primitive must not have a shell mode | printed `SHELL_RAN_VIA_ONE_ELEMENT_ARRAY` |
| **R4** | The `OBF::Utils.log` argv line writes **every button label** — the sentence the AAC user spoke — to `Rails.logger.info` at production `:info`. `pii_scrubbing_formatter.rb:18-20` states utterances are NOT regex-scrubbable | `obf/utils.rb:465-471`; `production.rb:65` |
| **R5/D8** | `rescue Errno::ENOENT` is dead code: multi-word backticks spawn a shell (no raise) and `system(argv)` returns nil | reproduced all three forms |
| **D8** | `:34` `label.length` raises `NoMethodError` on a non-String label, and `button['label']` comes straight from JSON | code read |
| **R3** | Backslash doubling **changes rendering** (`a\b`: `ab` -> `a\b`). More correct, but a behaviour change — must be stated, not sold as a no-op | AE=195 |
| **D6** | IM decodes SGML entities (`&lt;` -> `<`), so "content preserved intact" is false for entity-like text. NOT a bypass — `&percnt;`/`&#37;`/`&#64;`/`&#92;` all stay literal | reviewer-confirmed; I accept it |

## Where I disagree with a reviewer — D3/R7 (worker autoload)
Both flagged that `RESQUE_WORKER=true` prevents `lib/` autoload and asked me to treat
exploitability as unverified. **I checked the live Render service and they are wrong about
production:** `render.yaml` describes no deployed service; the live worker's start command does
NOT set `RESQUE_WORKER`, it boots, and it processes `default`-queue jobs. So the injection IS
live. Their *remedy* still stands on its own merits: this repo has an explicit `require_relative`
convention for `lib/` deps (`board.rb:1-5`, `article50_call_context.rb:22-25`), so I follow it.

## Out of scope — must be stated as NOT COVERED in the PR body (P1/P5)
`button_list` has no length cap (`utterance.rb:331`); no `MAGICK_TIME_LIMIT` or spawn timeout
(`imagemagick_limits.rb:15-18` sets memory/map/disk/thread only) => compute DoS is **Partial**.
`data:` URLs bypass `sanitize_url`, and `sanitize_url` is a weak SSRF filter. All pre-existing.

# CANDIDATE F — what I am implementing

1. `lib/image_magick_runner.rb`: `run` raises `ArgumentError` on <2 args (kills the shell mode),
   passes `in: File::NULL` (kills the stdin hang), no logging, no rescue. `escape_label` as
   reviewed.
2. `lib/sentence_pic.rb`: `require_relative`; `next if filename.blank?`; `.to_s` before `.length`;
   escape AFTER truncation; gravity branches on **`button_list.length`**; `#888` unquoted.
3. Red test first, four arms, then falsified.
