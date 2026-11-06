# Remove shell strings from image and colour commands

Base: `develop` at `d5966fc2b`. Line numbers are at this branch's tree.

## What changed

- `app/models/concerns/uploadable.rb:291` and `:381`: `identify` and `convert` run through
  `ImageMagickRunner` with an argv. Before this change both were shell strings. Their only interpolated
  value was a `Tempfile` path with literal prefix and suffix (`uploadable.rb:257`), so no user text
  reached those two shells; this removes the dependence on that staying true.
- `app/models/concerns/uploadable.rb:290`: flushes the download before `identify`. A body smaller than
  Ruby's write buffer was still in memory, so `identify` read an empty file and a small downloaded image
  got no width or height. New small downloads are now measured; existing records are not backfilled.
- `app/models/concerns/uploadable.rb:291`: `identify -format '%w %h'` on the first frame replaces parsing
  `identify -verbose`, so the size comes from two numbers and not from text that can include metadata.
- `lib/image_magick_runner.rb`: adds `capture`, which returns stdout, because `run` returns a boolean
  and `identify`'s output is parsed. Both share one argv guard. Its output is scrubbed, so bytes that
  are not valid UTF-8 cannot raise while it is parsed.
- `config/initializers/obf_fix_color_hardening.rb`: prepends an argv form of `OBF::Utils.fix_color`.

Sweep of `.rb` files in `app/`, `lib/` and `config/`: after this change no shell-string spawn remains.
Other spawns use an argv (`ImageMagickRunner`, `obf_save_image_hardening.rb`).

## Behaviour changes

- `convert` that cannot start, or any other pre-exec failure: `run` returns nil and warns, so the upload
  takes the no-raster path (`uploadable.rb:309-315`) instead of failing the job. Accepted: the record
  clears `rasterized` and can retry after the 24-hour gate, and `run` already degrades this way for
  `sentence_pic`. `identify` that cannot start still raises, as it did.
- `fix_color` with no `node`: raises, where the shell returned `''`. Accepted: every deployed image
  installs node, so that state is a broken host.
- `fix_color` values holding shell syntax are no longer shell-evaluated. A simple value in literal double
  quotes, such as `"red"`, which the shell used to strip, now renders black. Malformed values that made
  the shell fail now convert, usually to black: a PDF export that failed on them completes, and an OBF or
  OBZ export carries `rgb(0, 0, 0)` where it carried an empty colour.

- Measuring reads the first frame or page where the old parser kept the last `Geometry` line, so
  multi-frame and multi-page files can record a different size. A GIF whose first frame is smaller than
  its canvas records the frame size. Existing records keep their values.
- `identify -format` reads less of the file than `-verbose`, so some partial files that gave no size are
  now measured, and very large images are measured faster.

## Test change, approved by Traci 2026-11-05 (Rule #0.14)

`spec/models/concerns/uploadable_spec.rb:336` and `:370` stubbed the backtick method and failed under
any argv fix. The stub moved to `ImageMagickRunner.capture`, and its arguments and canned output follow
the `-format` call; the width and height assertions are unchanged.

## Verification

- Red first on `develop`: the new examples in `uploadable_image_magick_argv_spec.rb` and
  `obf_fix_color_hardening_spec.rb`.
- Mutations at `cca1f5fee`, before the `-format` change, all red: for `uploadable.rb`, plain, quoted and `Shellwords` backticks, a missing path, a
  merged `-resize`, a wrong output path, a `system` string; for `capture`, joined args, boolean return,
  no stdin rule; no argv guard. For `fix_color`, plain and `Shellwords` backticks, a `popen` string,
  `sh -c`, a wrong script path, no `strip`, no stdin rule, a cache that ignores type.
- `file.flush`: a fake `identify` reports the bytes it can see; 0 on `develop`, 7 with the flush.
- `identify -format` through `upload_to_remote` with real ImageMagick 7.1.2: a PNG, a JPEG, a GIF and a
  PNG with a `Geometry` line in its comment all stored the size they were made at. ImageMagick 6.9.11,
  which production runs, was not tested; confirm one upload on dev after this deploys.
- `fix_color` output matched the gem in 45 comparisons (15 valid colours, 3 types).
- Real `convert` rasterized an SVG through `convert_image`.
- Full suite: 17 failures, the same 17 on clean `develop` (`AuditEvent` counts, `vendor.js`, throttling).

## Review

Canonical senior-dev and adversary passes ran on 2026-11-05 with no Critical or High findings. Adversary
passes also covered the flush, which exposed a UTF-8 failure now handled by the scrub, and the `-format`
commit. The scrub and the last documentation and spec edits were not separately reviewed.

## Unresolved

- `identify -format` on ImageMagick 6.9.11 (see Verification).
- The rspec CI job has no `setup-node` step, so `fix_color` specs rely on the runner's node.
