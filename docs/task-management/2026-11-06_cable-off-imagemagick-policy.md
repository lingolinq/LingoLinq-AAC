# Turn off the app's Action Cable endpoint and tighten ImageMagick

Base: `develop` at `1e502ccf2`.

## Change

- `config/application.rb`: `mount_path = nil`. `rails/all` mounted `/cable`, and nothing in the app uses it:
  no `app/channels`, and `utils/sync.js:186` connects to `LLWEBSOCKET_URL`, which is unset on every deployed
  service today. The
  browser client stays, because it is how the app reaches that relay.
- `config/imagemagick/policy.xml`, loaded through `MAGICK_CONFIGURE_PATH` in the `Dockerfile`: adds the rules
  from Active Storage's policy in Rails 8.1.4.1 to Debian's. The Rails upgrade remains the full answer to the
  advisories; this PR does not clear `security-scan`, which checks gem versions.

## Verification

- `spec/config/imagemagick_policy_spec.rb` and `spec/requests/action_cable_disabled_spec.rb`. Red by removing
  `mount_path`, the `ENV` line and rules from the policy in turn.
- Homebrew ImageMagick 6.9.13, with and without the policy: `identify` on PNG, JPEG, GIF and SVG, the
  conversions in `uploadable.rb` and `obf_save_image_hardening.rb`, and the `montage` and `convert` calls in
  `sentence_pic.rb` gave the same result. A `text:` read succeeded without the policy and was refused with it,
  which shows the file is applied on top of the existing one.

## Review notes

- PDF: Debian's policy already denies it, so rasterizing a PDF was already refused. The obf gem's `gs` call
  runs directly, not through ImageMagick, so the `gs` delegate rule does not reach it.

Canonical senior-dev and adversary passes at `5f39a9c54` and again at `a88c0e31f`. Final round: senior-dev
approved with comments, adversary said ship with two conditions, both met here. The stronger build check came
from that round and was not separately reviewed.

## Unresolved

- Debian's ImageMagick 6.9.11, the production version, was not run locally: Docker's VM on this machine is
  broken. The final image stage fails its build unless ImageMagick lists this file, reads through its last
  coder rule and refuses a `text:` read, so the first dev build is the first real 6.9.11 run. That check has no
  pre-merge gate, because CI does not build the Dockerfile. If it fails, dev keeps its old revision and every
  later `develop` deploy fails until it is fixed.
- Image work runs on Resque, and dev deploys no worker, so upload, SVG and sentence-preview checks prove nothing
  on dev. Run one of each on staging after the release merge.
- The rules only apply where `MAGICK_CONFIGURE_PATH` is set, so local development is unchanged.
