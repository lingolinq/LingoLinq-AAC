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

Before push, a further local adversarial review of this branch, of the ImageMagick branch and of both
merged found no Critical or High issue; the related specs pass on the merge (642 examples, 0 failures).
Noted: the raster-variant probe now follows checked redirects, so a variant that redirects counts as found.

## Codex P2: non-default https ports (2026-11-12)

- `Uploader.sanitize_url` kept a non-default port only for http (`lib/uploader.rb:198`), and `SafeHttp`
  fetches the url it rebuilds, so `https://host:8443/a.png` was fetched from 443. Now any port other than
  the scheme's default is kept. This is a shared helper: its callers are `SafeHttp.prepare_request`
  (`lib/safe_http.rb:174`), webhook delivery (`app/models/webhook.rb:161`), uploaded-image fetches
  (`app/models/concerns/uploadable.rb:273`), `boards_controller.rb:546` and JSON bundle import
  (`lib/converters/api_json_bundle.rb:38`). Each now goes to the port its url names.
- Red first: `spec/lib/uploader_spec.rb` "should keep a non-default https port" and
  `spec/initializers/obf_get_url_hardening_spec.rb` "...non-default https port from that port" failed on the
  old code (the fetch hit 443 and got the other body). `spec/lib/safe_http_spec.rb` "pins a non-default
  https port on the same port as the fetched url" fails when the pin is built from `uri.default_port`.
- Adversary review of `9d4db7f6f`: push; four Lows. Taken: the pin-port spec, and naming the shared-helper
  change here and in the PR. Not taken here:
  - An https url that names a wrong port (for example `:80`) used to be sent to 443 by accident and now
    fails, like it does in a browser. Not counted: the stored-url count needs a database read that was
    not available.
  - https can now reach TLS services on any port of a public address (http already could; private
    addresses are still refused). Follow-up: allow only 80, 443, 8080 and 8443 in `sanitize_url`.

## Not in this change

- The hydra path follows a redirect synchronously inside the callback; slower for redirecting images only.
- Real media fetches are untested (every spec fakes the network): manual export check in #1308.
