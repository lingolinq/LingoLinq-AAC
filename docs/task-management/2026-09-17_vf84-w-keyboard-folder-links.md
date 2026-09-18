# Vocal Flair 84 w/ Keyboard folder links

## Diagnosis (CONFIRMED)

The keyboard-variant root `lingolinq/vocal-flair-84-w-keyboard` shows the
same top-row category tiles as `lingolinq/vocal-flair-84` (questions,
people, actions, social, places, time, categories, plus feelings /
describe / color/visual / small words / keyboard). On VF84 those tiles
are folders. On the keyboard variant they speak the label.

- **Source OBZ** `tmp/seed-boards/Vocal-flair-84-w-keyboard.obz` is a
  single-board export. The 12 folder buttons have `load_board` with an
  OBF-internal id (`1_3964`) and a dead Render-staging URL
  (`https://lingolinq-staging.onrender.com/lingolinq_1/vocal-flair-84-questions_1`).
  There is no `key`, and the target boards are not in the zip.
- **Import** (`lib/converters/lingo_linq.rb:496-510`) keeps `load_board`
  only when the target is in the OBZ map or
  `Board.find_by_path(load_board['key'] || load_board['id'])` succeeds.
  `find_by_path('1_3964')` fails, so the link is dropped.
- **Live local board** `GET /api/v1/boards/lingolinq/vocal-flair-84-w-keyboard`
  has `load_board: null` on all 12 tiles. VF84 itself still links to
  `lingolinq/vocal-flair-84-questions`, `-people`, `-actions`, `-social`,
  `-places2`, `-time`, `-categories`, `-feelings`, `-describe`, `-colors`,
  `-small-words`, `-keyboard`.
- **Picker** `button-settings` `collection_my_boards` runs
  `filterRootBoards`, so those VF84 category pages do not appear. The
  existing `linkedBoardName` / `find_board` path already looks up by key
  or URL, but the destination card had no input for it.

## This change

Restore a Board URL or key field on the folder destination card and make
`find_board` extract `owner/key` from any host, not only the current one.

## Library repair

`VocalFlairKeyboardFolderRelinker` writes the VF84 category `load_board`
keys onto those 12 tiles when the target exists and the button has no
working link. It runs after curated import
(`CuratedVocabularySources.post_process_import!`) and via
`rake lingolinq:repair_vf84_w_keyboard_folders` (dry-run default,
`APPLY=1` to write). Same-owner VF84 copies win over `lingolinq/`.

Existing copies that already have a resolvable folder link are left
alone. The URL/key field remains the editor workaround for boards this
pass does not touch.
