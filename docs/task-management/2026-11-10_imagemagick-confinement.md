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

- Measured in a container built from the production base image (Debian bookworm ImageMagick 6.9.11
  with `config/imagemagick/policy.xml`) and on ImageMagick 7.1 locally: the last matching path rule
  wins, a denied open fails at `OpenBlob`, a `..` walk out of an allowed directory is refused, and
  `MAGICK_SECURITY_POLICY` is not read by 6.9.11 (so a policy file per call).
- In that container, through the runner: renders of shapes and text are pixel-mean identical confined
  and unconfined; `identify` reads dimensions; no private directory is left behind.

## Tests

- `spec/lib/image_magick_runner_confinement_spec.rb` and `spec/initializers/obf_save_image_confinement_spec.rb`
  (20 examples). Before the change 9 failed; with it all pass. Allowing every path in the policy's first
  rule turns 10 red. Real-ImageMagick examples skip when ImageMagick is not installed, as
  `spec/lib/image_magick_runner_spec.rb` does; the policy examples run everywhere.
- Related specs (runner, initializers, uploadable, sentence previews, converters, policy, button image,
  utterance): 563 examples, 0 failures, 6 pending. No existing spec changed.

## Review

Proposal red-teamed before code (local adversary agent). Taken from it: confine the gem's
`identify -verbose`; clean up spawned renders' directories by sweeping finished pids rather than with a
finalizer (Resque ends a job with `exit!`); give `spawn` a null stdin; only absolute paths count as
inputs. Its traversal concern was probed and refused by ImageMagick; a spec now covers it.

An independent review of the code found no Critical or High issue; it re-ran the bypass probes in the
production-like container. Taken from it: any call also removes `magick-confine*` directories older
than an hour, since a Resque job child exits right after its last spawned render and never sweeps them.
Left as noted: an option value that names an existing absolute file (a sentence label) gets a read rule
too, harmless while montage inputs are JPEGs the app made; a path with a space or glob character fails
to render (Tempfile paths never have one).

CI runs rspec without ImageMagick (the existing sweep in `spec/lib/image_magick_runner_spec.rb` skips there
too), so in CI only the policy examples run; the real-ImageMagick examples run locally.

## Not in this change

- An image that names another file now fails to render, the same as one naming a missing file today.
- The obf gem's `PNG.from_pdf` `convert` (PDF input, denied by the policy) and its `gs` merge of
  app-made PDFs.
