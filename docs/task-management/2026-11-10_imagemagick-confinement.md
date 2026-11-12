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
  on `8ba643fe3` every real-ImageMagick example ran there and passed, `:53` and `:91` included, so 7.1.2
  refuses the walk itself. On 6.9.12-98 (local) the walk is drawn. The earlier "Tests" section above says
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
