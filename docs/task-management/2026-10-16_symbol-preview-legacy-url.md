# Symbol preview response compatibility

Issue: https://github.com/lingolinq/LingoLinq-AAC/issues/1152

## Confirmed facts at base 992351d55

- The create-board component reads `pick.image_url` in `_lookup_label_images_with_english`, then `preview_grid` reads the cached `image_url`.
- `Api::SearchController#symbols` returns `Uploader.find_images` without reshaping it. The component omits a library parameter, so the controller defaults to OpenSymbols.
- The legacy OpenSymbols branch in `Uploader.find_images` maps upstream `image_url` to `url`. The v2 formatter in `lib/open_symbols.rb` returns both names. Empty results and request failures produce a null preview.
- Save has a different path: `Board#process_suggested_symbols` can assign server-selected symbols when no client image is baked. `process_client_supplied_images` accepts a URL without carrying the search attribution metadata.

## Proposal and independent review

Considered accepting `url` as a simple fallback, or adding `image_url` to backend responses. The backend alternative changes a wider contract and does not support older servers. A plain fallback would newly route legacy URLs through client-image saving, expanding an attribution problem.

Claude Fable 5 reviewed both proposals through the local CLI with tools and MCPs disabled. The revised proposal received “Ship with conditions”: confirm the cache is memory-only, preserve the exact server-selected button payload, enumerate cache readers, exclude preview-only metadata from serialization, and record preview/save consistency as follow-up.

The implemented change caches legacy URLs with `preview_only: true`. Preview renders them; save excludes them from both the image-presence gate and per-button URL baking. Existing v2 images and uploaded images keep their behavior. The cache is initialized on the component and reset with authoring locale; no cache persistence writer exists. Its rendering reader is `preview_grid`, and save readers are in `_completeSaveBoard`. Manual drops replace their cache entry. Buttons are built explicitly, with no spreading of cache metadata.

## Validation and limits

An offline Node harness executes the actual lookup and save methods against synthetic responses. Before the change, url-only search returned null. Checks cover current API images, empty results, legacy URLs, and save behavior with and without automatic colors. Removing the fallback must fail the legacy lookup; removing the save guard must fail save preservation. Node syntax checks cover both changed JavaScript files.

The Ember regression tests assert preview visibility before save and the complete server-selected button payload. The Ember suite and deployed browser flow have not been run against this branch. No deployment or live fix is claimed. This diagnoses the supported legacy response path, not every possible source of missing previews.

Follow-up for #1152: consistent symbol selection and complete attribution across preview and save. A legacy preview can differ from the symbol selected by the server on save; this bounded change preserves that save path rather than introducing a metadata regression. Track separately from the screen and save-flow redesign.
