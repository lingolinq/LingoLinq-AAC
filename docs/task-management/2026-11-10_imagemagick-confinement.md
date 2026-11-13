# ImageMagick runs only on the files it is given

Base: `develop` at `db5cfcef1`. Branch `traci/security/svg-rasterize`.

## What changed

- `lib/image_magick_runner.rb`: `run`, `capture` and a new `spawn` give each ImageMagick command
  (`convert`, `montage`, `identify`, `magick`) a private directory with its own `policy.xml`, through
  `MAGICK_CONFIGURE_PATH` and `MAGICK_TEMPORARY_PATH`. The policy denies every path, then allows reading
  the absolute file paths on the command line, writing the last argument (not for `identify`), reading
  ImageMagick's config and font directories, and the private directory itself. Other commands run as
  before. Argv is unchanged.
- `config/initializers/obf_save_image_hardening.rb`: `save_image` renders through the runner
  (`run`, or `spawn` for the threaded PDF path) instead of `system` and `Process.spawn`.
- `config/initializers/obf_imagemagick_fallback.rb`: the obf gem's `image_attrs` with its
  `identify -verbose` run through the runner; the missing-binary fallback is kept.
- `Uploadable#convert_image`, the upload `identify` and `SentencePic` already use the runner.

## Evidence

- Measured on ImageMagick 6.9.11 (the production image's) and 7.1: the last matching path rule wins and
  a denied open fails; a per-call policy file is needed.
- Renders of shapes and text are identical confined and unconfined; `identify` reads dimensions; no
  private directory is left behind.

## Tests

- `spec/lib/image_magick_runner_confinement_spec.rb` and `spec/initializers/obf_save_image_confinement_spec.rb`.
  Before the change 9 failed; with it all pass. Allowing every path in the policy's first rule turns 10
  red. Real-ImageMagick examples skip when ImageMagick is not installed, as
  `spec/lib/image_magick_runner_spec.rb` does; the policy examples run everywhere, for `run`, `capture`
  and `spawn`.
- Related specs (runner, initializers, uploadable, sentence previews, converters, policy, button image,
  utterance): 563 examples, 0 failures, 6 pending. No existing spec changed. #1298 installs ImageMagick
  in CI so the real-ImageMagick examples run there too.

## Review

The proposal and the code were each reviewed independently before push, and both branches together;
no Critical or High finding. Taken from the reviews: confine the gem's `identify -verbose`; remove
spawned renders' directories by sweeping finished pids and stale directories rather than with a
finalizer (Resque ends a job with `exit!`); give `spawn` a null stdin; only absolute paths count as
inputs; policy examples for `spawn` and `capture`.

## Behaviour notes

- A relative input path is refused; every caller passes an absolute one.
- A path with a space or glob character cannot be allowed and fails to render; Tempfile paths never
  have one.

## 2026-11-12: two real-ImageMagick failures and the Codex P1

#1298 put ImageMagick in CI, so the real-ImageMagick examples now run. On ImageMagick 6.9.12-98 (local),
with the system policy and with `config/imagemagick/policy.xml` loaded, two examples fail:
`spec/lib/image_magick_runner_confinement_spec.rb:53` and `:91`. Codex also left a P1 on
`lib/image_magick_runner.rb:118`.

### Fact sheet

- **`:53` is a test defect, not a bypass. CONFIRMED by measurement.** The example writes an svg named
  `in.png` with no background rect (`spec/lib/image_magick_runner_confinement_spec.rb:54-55`) and runs
  `convert in.png -flatten out.jpg`. Confined, the output's centre pixel is `gray(255)` (the victim was
  not drawn); unconfined it is `srgb(254,0,0)`. The assertion `mean_red(out) < 0.1` (`:57`) reads white
  as red, because white's red channel is 1.0. Every other example draws a blue rect first
  (`write_svg`, `:18-22`), so a refused read leaves blue.
- **`:91` is a real bypass. CONFIRMED by measurement.** An `<image href>` of
  `/etc/ImageMagick-6/../../<dir>/victim.png` is drawn confined (`srgb(254,0,0)`). The policy allows
  reads of `<system dir>/*` (`lib/image_magick_runner.rb:116`); ImageMagick 6.9.12 matches the pattern
  against the path as written, and `*` spans `/`, so the `..` walk matches. The comment at `:110-111`
  ("ImageMagick refuses a '..' walk out of an allowed directory") is false on 6.9.12.
- **Same shape: the private-directory rule. CONFIRMED (red-team, with `Dir.mktmpdir` stubbed to a
  known name).** `:124` allows `read|write` on `<private dir>/*`, so `<private dir>/../<file>` draws the
  file. The directory name is random (`Dir.mktmpdir`), so an svg cannot name it in advance.
- **Codex P1 is real. CONFIRMED by measurement.** `arg.sub(/\[[^\]]*\]\z/, '')` (`:118`) runs on every
  argument, including labels. A label that is not valid UTF-8 raises `ArgumentError: invalid byte
  sequence in UTF-8` from `private_dir` before ImageMagick runs (`ImageMagickRunner.run('montage',
  '-label', "caf\xE9", ...)`). `develop`'s runner has no `private_dir`, so this is new in this PR.
  A request label cannot be invalid UTF-8: Rails rejects invalid-encoded params (actionpack
  `request.rb` `check_param_encoding`), and `button_list` comes only from params
  (`app/models/utterance.rb:348`); the stored data is encrypted, so Postgres never sees the bytes
  (red-team, CONFIRMED). The module's own comment (`:201-204`) still treats it as a case to survive.
- **Version dependence.** The CI runner installs ImageMagick 7.1.2-18 (`.github/workflows/ci.yml`);
  on `8ba643fe3` every real-ImageMagick example ran there and passed, `:53` and `:91` included. That
  is consistent with 7.1.2 refusing the walk, and equally with 7.1.2 never drawing an `href` file at all
  (ASSUMED either way until the unconfined controls below run on CI). On 6.9.12-98 (local) the walk is drawn. The earlier "Tests" section above says
  all examples passed on 6.9.11, but `:91` was not separately measured there, so whether the production
  image (6.9.11) refuses the walk is ASSUMED unknown, and so is whether its SVG coder is ImageMagick's
  own renderer or librsvg (librsvg would fetch `href` files itself, outside the policy).

### Proposal

**`:91`, candidate A (chosen): a trailing deny for any `..` segment.** Append
`<policy domain="path" rights="none" pattern="*/..*"/>` as the last rule. The last matching rule wins
(`:108`, measured), so it overrides every allow, including the private-directory rule. Measured: with it,
the walk is refused (`srgb(0,0,254)`, blue), and a `label:` render is identical (71x43) with and without
it. Cost: a path whose segment starts with `..` (for example `/x/..hidden`) is refused too; callers pass
Tempfile and system paths, which never have one.

**`:91`, candidate B (rejected): allow system files one by one.** Replace `<dir>/*` with one rule per
resolved file under the config and font directories (413 files here). It removes the wildcard for system
reads but not for the private directory, which needs `*` for ImageMagick's own temp files, so the walk
from there stays open. It also writes about 400 rules per call. A is needed anyway; B adds cost without
closing anything A leaves open.

**`:53` (needs Traci's approval, Rule #0.14):** give the example the blue rect the others use, by
writing it with `write_svg(@dir, "<image href=...>", 'in.png')`. The assertion is unchanged. Mutation
that must turn it red: run the same command unconfined (red drawn over blue).

**Codex P1, candidate A (chosen): fail closed on invalid encoding.** Skip any argument that is not
`valid_encoding?` before the regex at `:118`, and drop such variants in `pattern_variants` (`:139`). An
input path that is not valid UTF-8 is then not allowed, so ImageMagick refuses that open. Candidate B
(handle as binary, `arg.b`) would then mix encodings when the path is written into the policy XML
(`:125`). A is simpler and fails closed.

### Tests

- `:91` is already red and must turn green; mutation: drop the deny rule, red again.
- New example: `run` with a label that is not valid UTF-8 returns without raising (red before the fix).
- New example: a walk out of the private directory is refused (policy-level, no ImageMagick needed:
  the generated policy's last rule is the `..` deny).
- `:53` changed as above, only with approval.

### Open questions

- Does ImageMagick 6.9.11 or 7.x normalize `..` before matching? The deny makes the answer irrelevant
  for safety; it matters only for whether the old comment was ever true.
- Are there other encodings of `..` that reach the open (`file://` URLs, `%2e%2e`)? `*/..*` matches the
  literal text wherever it sits in the path; a percent-encoded form would need ImageMagick to decode it
  before the policy check. Not measured.

### Review of the proposal (2026-11-12)

`/adversary-review` of the proposal: apply with changes; no Critical or High. Measured on 6.9.12-98:
the `*/..*` deny closes every walk that works unconfined (plain, `//..//`, `/./..`, `png:` prefix, `[0]`
suffix, `file://`, a nested `data:` svg, the private-directory walk), and the sentence_pic montage,
`save_image` and `convert_image` renders are pixel-identical with and without it. Taken:

- The version-independent policy example (the last rule is the deny) is the guard CI can enforce,
  since the runner's ImageMagick 7.1.2 refuses the walk without it. Added a real-ImageMagick
  private-directory walk example.
- Added an invalid-UTF-8 output-path example, which is what exercises the `pattern_variants` guard.
- Fact sheet corrected above (Rails, not Postgres; private-directory walk CONFIRMED).

Not done here, as follow-ups:
- Check the production image before merge: `convert -list format | grep -w SVG` (own renderer or
  librsvg) and `:38`/`:91` run inside it.
- A rule in `config/imagemagick/policy.xml` granting a path would override both denies, since that file
  loads after the private one (no such rule today).
- A `-label` value that starts with `/` and names a file adds a read rule; montage inputs are
  server-rasterized JPEGs, so nothing can use it today.

`:53` changed with Traci's approval (Rule #0.14, 2026-11-12): the example now draws the blue rect the
others use, and its assertion is unchanged.

## 2026-11-12: fixes for the senior-dev review

`/review-pr` at `1891694af` (`REVIEWED=PR lingolinq/LingoLinq-AAC#1300 at 1891694affb16b2dd04b4ac2c6d4aa0794e884ac`):
Request changes. Its High is the unverified production image (open, needs someone with the image).
Three of its findings are taken here; two Lows are not (below).

### Fix 1: a positive control for the leak examples

**Problem (CONFIRMED by reading the spec).** Every leak example asserts
`!File.exist?(out) || mean_red(out) < 0.1` (`spec/lib/image_magick_runner_confinement_spec.rb:38-109`,
`spec/initializers/obf_save_image_confinement_spec.rb`). That passes if this ImageMagick never draws an
`<image href>` file even unconfined. On 6.9.12 the examples do bite (removing confinement turns 12 red).
On CI's 7.1.2 whether the unconfined render draws the file is not measured, and CI is where these run.

**Candidate A (chosen): one positive-control example that must pass.** In "with ImageMagick installed",
an example renders the same svg-with-`href` through plain `system('convert', ...)`, unconfined, and
asserts the result is red (`mean_red > 0.9`), with a message saying the leak examples prove nothing
on this ImageMagick if it fails. If CI's 7.1.2 does not draw the file, CI goes red and we learn it,
instead of staying green on examples that cannot fail.

**Candidate B (rejected): a per-example baseline that skips.** Each leak example first renders
unconfined and `skip`s when that is not red. Honest per example, but a skip in CI is easy to miss, and
it adds a `skip` to existing examples (Rule #0.14).

### Fix 2: a guard on the repo policy

**Problem (CONFIRMED with `convert -list policy`, red-team).** `confined_env`
(`lib/image_magick_runner.rb:102-105`) puts the private directory first on `MAGICK_CONFIGURE_PATH`, so
`config/imagemagick/policy.xml` loads after the private policy, and the last matching rule wins. A
`domain="path"` rule granting rights there would override the leading deny and the `..` deny. None
exists today: the spec pins the path denies to `['@*']` (`spec/config/imagemagick_policy_spec.rb:18-21`)
but nothing checks for path allows.

**Change:** an example in `spec/config/imagemagick_policy_spec.rb`: no `domain="path"` rule has rights
other than `none`. Mutation: add `<policy domain="path" rights="read" pattern="/tmp/*"/>` to the
policy, red.

### Fix 5: setup failure must not raise from `run` or leave a directory

**Problem (CONFIRMED by reading).** `confined` calls `private_dir` before its `begin`
(`lib/image_magick_runner.rb:88`), and `private_dir` creates the directory (`:113`) before writing the
policy (`:130`). A `SystemCallError` there (ENOSPC on `/tmp`, EACCES, `File.realpath(Dir.tmpdir)` in
`system_read_dirs`) escapes `run` and leaves the directory until the stale sweep. `run`'s contract is
to return nil or false, never raise: an exception escaping the sentence-preview job leaves
`large_image_url_attempted` unset and re-enqueues it on every later save (`:43-52`).

**Change:**
- `private_dir`: on any exception after `mktmpdir`, `rm_rf` the directory and re-raise.
- `run`: rescue `SystemCallError` from the confined setup, log only the binary name (as `:53` does),
  return nil. `capture` and `spawn` keep raising, as today (`capture`'s contract raises for a missing
  binary, `:58-61`; `spawn` already re-raises after cleanup, `:77-80`).
- Test: stub the policy `File.write` to raise `Errno::ENOSPC`; `run` returns nil, and no new
  `magick-confine*` directory remains. Mutation: remove the `rescue` in `run` (raises), and remove the
  cleanup in `private_dir` (directory left).

### Not taken

- `magick identify` gets a write rule on its last argument: no caller uses `magick` (every call site
  uses `convert`, `montage` or `identify`; `git grep` over `app/`, `lib/`, `config/`).
- Control characters in `UNSAFE_PATTERN_CHARS`: only server-chosen temp paths and existing absolute
  file paths reach a pattern.

### Review of this proposal, and what was applied

`/adversary-review` of the proposal: apply with changes, no Critical or High. Applied:

- **Fix 5, widened.** A label holding a NUL byte is valid UTF-8 and passes Rails, and raises
  `ArgumentError` (from `File.file?` in `private_dir`, and from `system` itself, which develop does too),
  not `SystemCallError`. `run` now rescues `SystemCallError` and `ArgumentError` around the confined call
  only (`argv`'s arity error still raises) and returns nil; `private_dir` removes its directory on any
  exception. Measured before: `"/a\0"` raised and left a directory with no `policy.xml`.
- **Fix 2, replaced.** Checking one file's XML missed both the other policy files ImageMagick loads after
  the private one (`$HOME/.config/ImageMagick`, `$HOME/.magick`, `$XDG_CONFIG_HOME/ImageMagick`; prod's
  HOME is `/app`) and spellings ImageMagick honours (`domain="Path"`). Now `confined_env` sets `HOME` and
  `XDG_CONFIG_HOME` to the private directory, an example plants allow-everything policy files there and
  shows the leak still refused, and an example lists the policies ImageMagick actually loads
  (`convert -list policy`, which normalizes spelling) and asserts none but the private one grants a path.
- **Fix 1, widened.** One unconfined twin per distinct render shape (runner, `xlink:href`, svg under a
  raster name, the system-directory walk, `save_image`'s svg and non-svg arguments, `convert_image`),
  each asserting the file is drawn (`mean_red > 0.1`, the complement of the leak checks). No `skip`
  beyond the existing "ImageMagick not installed". If a twin fails on CI, that ImageMagick cannot show
  the leak examples failing; the answer is to run them against the production image's ImageMagick, not to
  remove the twin.

Regression check: the ImageMagick-related specs (runner, confinement, initializers, sentence_pic,
uploadable, utterance, button_image, converters, imagemagick_policy) went from 577 examples, 0 failures,
6 pending at `1891694af` to 588, 0 failures, 6 pending. A labelled montage renders pixel-identical
(`compare -metric AE` = 0) with the committed runner and this one, at the same speed (about 0.05 s).

Not taken, as follow-ups: the same loaded-policy check in the Dockerfile build and the CI verify step; a
private `delegate` deny (inkscape is not installed today, but ImageMagick would hand an svg to it, and it
reads `href` files itself).
