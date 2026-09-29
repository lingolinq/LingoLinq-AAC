# db/language: canonical language data

Schema-2 language files for the Multilingual Language Layer
(`docs/architecture/MULTILINGUAL_LANGUAGE_LAYER_SCHEMA.md`). Only canonical, public
language data belongs here. User vocabulary, button labels, board content and anything
read from a database never does.

## Layout

- `vendor/openaac-demo-tools-0977e83f/`: pinned upstream OpenAAC inputs, byte-identical to
  the upstream commit. `NOTICE.md` records the source, license, paths and SHA-256 of each,
  and the CC BY 4.0 attribution.
- `en/words-en.json`, `en/rules-en.json`: generated English schema-2 files. Never edit
  them by hand.

## License

The OpenAAC inflection data, and the files generated from it, are licensed CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/), not MIT: the upstream repository's MIT
license covers its code, which LingoLinq does not use. Each generated file carries the
attribution, the upstream license marker and the license link in its `_source` field.

## Regenerating

    bundle exec rake language:schema2

The task reads only the vendored files (no database, no network) and writes `en/`. It
refuses to run if an input's SHA-256 differs from the pin in
`lib/language/schema2_generator.rb`. `spec/lib/language/schema2_generator_spec.rb`
rebuilds the output and fails if the committed files differ by a single byte, and fails
if any file here is not on its closed list.

## Status

Nothing at runtime reads these files yet. The `multilingual_grammar` feature flag is
reserved for the first reader, which must leave English unchanged when the flag is off.
These files are not an input to `WordData.ingest`: that reader expects the upstream
schema-1 shape.

## Changing the pin

1. Download the new upstream files from a commit URL, not a mirror.
2. Replace the vendor directory (name it after the new commit), update the pins in the
   generator and in `NOTICE.md`, and update the spec's closed list.
3. Run the rake task. The generator raises on any words entry field, part of speech or
   inflection name it does not recognise, and on any unknown rules section or key, empty
   rules, `inflection_locations` or tests list, unknown rule type, inflection name, grid location or test option, or
   non-string override or test option value. Lookback item values and the `required`
   and `if_empty` values in `inflection_locations` are checked for key names only, so
   review those in the diff. Extend the lists deliberately rather than loosening a check.
4. Review the regenerated diff and commit inputs, pins and output together.
