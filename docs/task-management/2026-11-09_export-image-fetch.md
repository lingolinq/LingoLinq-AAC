# Export and lesson fetches go through SafeHttp

Base: `develop` at `084552a6b`. Branch `traci/security/export-image-fetch`.

## What changed

- `config/initializers/obf_get_url_hardening.rb` replaces the obf gem's `OBF::Utils.get_url`, `image_base64`,
  `sound_base64` and `sound_raw`. Every fetch goes through `SafeHttp`, in both the synchronous and the
  `Typhoeus::Hydra` paths; a redirect in the hydra path is re-fetched with `SafeHttp.get`, which checks each
  hop. `data:` uris are decoded in place. `image_base64` and `sound_base64` accept only a `data:` uri or an
  http(s) url, and return nil when no usable data or content type came back.
- `app/models/lesson.rb` (`check_url`) and `lib/converters/lingo_linq.rb` (the raster-variant probe) use
  `SafeHttp.head`.
- The gem's own fetch used a weaker address check than `SafeHttp` and followed redirects unchecked.
  `obf_save_image_hardening.rb` already moved `save_image` to `SafeHttp`; this covers the rest of the gem.

## Tests

- `spec/initializers/obf_get_url_hardening_spec.rb` (24 examples) drives the real `SafeHttp`. Before the
  change, 13 failed and a further 3 added after review failed; with the change all pass. Disabling the
  prepend brings the 13 back.
- `spec/models/lesson_spec.rb` and `spec/lib/converters/lingo_linq_spec.rb`: new examples for private
  addresses, redirects between public hosts, and a public raster variant that still switches.
- Seven existing examples mock `Typhoeus` with the old arguments (`followlocation: true`, or none) and fail
  on that alone (`lesson_spec.rb:210, :220, :230, :240`; `lingo_linq_spec.rb:184, :1247, :1874`). Rewriting
  them to stub the HTTP response with WebMock, keeping every assertion on the result and asserting the request was made, was approved on 2026-11-10 (rule 14).

## Review

Proposal red-teamed before code (local adversary agent), then an independent review of the diff. Taken
from them: sounds needed the same treatment as images; a refused sound must not crash an export; the
raster probe needed `SafeHttp`; the spec needed redirect, DNS and stubbed-internal cases; `data:` uris
keep their `extension`; a response with no content type returns nil instead of raising.

## Not in this change

- Fetched SVG content is rasterised by `convert` without the `SvgSanitizer` pass uploads get; tracked
  separately.
- Uploads-bucket images are fetched unsigned by `get_url`, as before.
- The hydra path follows a redirect synchronously inside the callback; slower for redirecting images only.
