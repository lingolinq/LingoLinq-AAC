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
