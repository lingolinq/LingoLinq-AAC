# Remove shell strings from image and colour commands

Base: `develop` at `d5966fc2b`. Line numbers are at this branch's tree.

## What changed

- `app/models/concerns/uploadable.rb:291` and `:387`: `identify` and `convert` run through
  `ImageMagickRunner` with an argv. Before this change both were shell strings. Their only interpolated
  value was a `Tempfile` path with literal prefix and suffix (`uploadable.rb:257`), so no user text
  reached those two shells; this removes the dependence on that staying true.
- `app/models/concerns/uploadable.rb:290`: flushes the download before `identify`. A body smaller than
  Ruby's write buffer was still in memory, so `identify` read an empty file and a small downloaded image
  got no width or height. New small downloads are now measured; existing records are not backfilled.
- `lib/image_magick_runner.rb`: adds `capture`, which returns stdout, because `run` returns a boolean
  and `identify`'s output is parsed. Both share one argv guard. Its output is scrubbed, so metadata that
  is not valid UTF-8 no longer raises while the output is parsed.
- `config/initializers/obf_fix_color_hardening.rb`: prepends an argv form of `OBF::Utils.fix_color`.

Sweep of `.rb` files in `app/`, `lib/` and `config/`: after this change no shell-string spawn remains.
Other spawns use an argv (`ImageMagickRunner`, `obf_save_image_hardening.rb`).

## Behaviour changes

- `convert` that cannot start, or any other pre-exec failure: `run` returns nil and warns, so the upload
  takes the no-raster path (`uploadable.rb:315-321`) instead of failing the job. Accepted: the record
  clears `rasterized` and can retry after the 24-hour gate, and `run` already degrades this way for
  `sentence_pic`. `identify` that cannot start still raises, as it did.
- `fix_color` with no `node`: raises, where the shell returned `''`. Accepted: every deployed image
  installs node, so that state is a broken host.
- `fix_color` values holding shell syntax are no longer shell-evaluated. A simple value in literal double
  quotes, such as `"red"`, which the shell used to strip, now renders black. Malformed values that made
  the shell fail now convert, usually to black: a PDF export that failed on them completes, and an OBF or
  OBZ export carries `rgb(0, 0, 0)` where it carried an empty colour.

## Test change, approved by Traci 2026-11-05 (Rule #0.14)

`spec/models/concerns/uploadable_spec.rb:336` and `:370` stubbed the backtick method and failed under
any argv fix. Only the stub moved, to `ImageMagickRunner.capture`; the assertions are unchanged.

## Verification

- Red first on `develop`: the new examples in `uploadable_image_magick_argv_spec.rb` and
  `obf_fix_color_hardening_spec.rb`.
- Mutations, all red: for `uploadable.rb`, plain, quoted and `Shellwords` backticks, a missing path, a
  merged `-resize`, a wrong output path, a `system` string; for `capture`, joined args, boolean return,
  no stdin rule; no argv guard. For `fix_color`, plain and `Shellwords` backticks, a `popen` string,
  `sh -c`, a wrong script path, no `strip`, no stdin rule, a cache that ignores type.
- `file.flush`: a fake `identify` reports the bytes it can see; 0 on `develop`, 7 with the flush. Real
  `identify` measured a 312-byte PNG as 5x3 through `upload_to_remote`.
- `fix_color` output matched the gem in 45 comparisons (15 valid colours, 3 types).
- Real `identify` measured a PNG already on disk and real `convert` rasterized an SVG.
- Full suite: 17 failures, the same 17 on clean `develop` (`AuditEvent` counts, `vendor.js`, throttling).

## Review

Canonical senior-dev and adversary passes ran on 2026-11-05 with no Critical or High findings. A further
adversary pass on the flush found that it exposed the UTF-8 failure; the scrub above is the fix, and
that last change was not separately reviewed.

## Unresolved

- The rspec CI job has no `setup-node` step, so `fix_color` specs rely on the runner's node.
