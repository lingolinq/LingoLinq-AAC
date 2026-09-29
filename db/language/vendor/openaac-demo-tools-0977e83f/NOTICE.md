# OpenAAC inflection data (vendored, unmodified)

The two JSON files in this directory are verbatim copies of upstream files. Do not
edit them: the generator (`lib/language/schema2_generator.rb`) refuses to run if
either file's SHA-256 differs from the value recorded below and in the generator.

- Source: OpenAAC
- Upstream repository: https://github.com/open-aac/demo-tools
- Pinned commit: 0977e83f9a773fc215d4edbdec8bdd821a99bc24 (committed 2024-09-24)
- Retrieved: 2026-09-28, from `https://raw.githubusercontent.com/open-aac/demo-tools/<commit>/<path>`
- License: Creative Commons Attribution 4.0 International (CC BY 4.0),
  https://creativecommons.org/licenses/by/4.0/

## Files

- `words-en.json`
  - Upstream path: public/inflections/words-en.json
  - Bytes: 1327380
  - SHA-256 words-en.json: e042e8b2ce9dda264ca567cbdbb914bd5ea243fa13a9a56e82337efaeb7747d0
  - Git blob: 01d2e57b8f6ac84bdd74b7152bc7abb78c36d153
- `rules-en.json`
  - Upstream path: public/inflections/rules-en.json
  - Bytes: 40153
  - SHA-256 rules-en.json: df71e0c893fac417bf7aea12742642d7a1b5cddd924532cdd2bb2c1803bfcf0b
  - Git blob: 68a9d91af949d809e1373a5e62936800c9d0941d

## License and attribution

The inflection data in `words-en.json` and `rules-en.json` is by OpenAAC
(https://github.com/open-aac/demo-tools, commit 0977e83f9a773fc215d4edbdec8bdd821a99bc24)
and is used under the Creative Commons Attribution 4.0 International license (CC BY 4.0):
https://creativecommons.org/licenses/by/4.0/

- The `_license` field inside both upstream files reads "CC By, OpenAAC". That marker
  names no version; the version, 4.0, is per OpenAAC's maintainer.
- The upstream repository README states "License: MIT". That covers the repository's
  code. LingoLinq uses only these two data files, not the code.
- Upstream states no copyright line for the data, so none is given here.

Changes: the two files in this directory are unmodified. LingoLinq transforms them with
`lib/language/schema2_generator.rb` into `db/language/en/words-en.json` and
`db/language/en/rules-en.json`. Each upstream words entry becomes one schema-2 lexeme
(values that mean "no form" are dropped), the rules sections are carried unchanged with a
language profile added, and the metadata is rewritten. Each generated file credits OpenAAC
in its `_source` field, with the upstream license marker, this license link, the pinned
commit and each input's SHA-256.
