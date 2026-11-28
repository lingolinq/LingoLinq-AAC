# Periodic Table board set: design

Status: built, validated, and imported into a LingoLinq team account on dev.lingolinq.com and on
production (app.lingolinq.com), in a regular and a high-contrast version.
Date: 2026-11-25, updated 2026-11-27

## What this is

A 21-board AAC set for middle and high school science. A student can name any of the 118
elements, say a fact sentence about it, ask and answer the questions that come up in a
periodic table lesson, and get back to the same navigation buttons in the same place on every
board.

- Packages (Open Board Format, about 220 KB each):
  - `output/periodic_table/periodic-table.obz`, the regular set
  - `output/periodic_table/periodic-table-high-contrast.obz`, the same 21 boards in high contrast
- Generator: `scripts/periodic_table/generate_periodic_table.py` (Python 3, standard library only).
  One run writes both packages.
- Pictures: drawn by `scripts/periodic_table/build_symbol_pack.py`, which also writes the
  standalone CC0 symbol pack to `output/periodic_table_symbols/` (572 SVG files, regular and
  high contrast, with a zip beside it)
- Look at it without importing: `python3 scripts/periodic_table/make_preview.py <package.obz>`
  writes a self-contained `preview.html` next to the package

## What the repo told us (Step 1)

- **Boards are OBF in, OBF out.** `lib/converters/lingo_linq.rb` maps a board to and from Open
  Board Format through the `obf` gem (0.9.9.3). A board is a grid (`rows`, `columns`, `order`)
  plus a button list. Buttons keep `label`, `vocalization`, `background_color`, `border_color`,
  `image_id`, `load_board` (a folder link) and a short list of extras: `hide_label`,
  `home_lock`, `add_vocalization`, `external_id`, `part_of_speech`.
- **Import formats are `.obf` and `.obz`.** `POST /api/v1/boards/imports` (the Import button in
  the board creator) takes either. Committed system sets such as
  `public/system-boards/crisis-vocabulary.obz` load through `SystemBoardSources` and a rake
  task. An `.obz` must be walkable from its root board by links, which this one is.
- **There is no hard 112 cap in code.** The board builder clamps a grid to 20 x 20, the backend
  does not limit it, and 112 is the size of the largest standard set (Quick Core 112, 8 x 14).
  This set still treats 112 buttons as the ceiling. The largest board has 105.
- **A button has one label and one picture. There is no secondary text field.** So the atomic
  number and symbol are drawn into the picture, and the element name is the label.
- **Text-only buttons are safe.** `text_symbol_fallback` is on by default, so a button with a
  label and no picture shows its label large. Speak Mode also supports `:back`, and a link with
  `home_lock` keeps the student on the linked board instead of auto-returning home after each
  word.

## The board set (Step 2)

| Board | Grid | Buttons | Elements | What it is for |
|---|---|---|---|---|
| Periodic Table (menu) | 3 x 7 | 16 | 0 | Start here. Top row is the table by layout, second row is families |
| Full Table | 8 x 18 | 105 | 88 | The wall chart: 18 groups by 7 periods in true positions, with a color key |
| Elements 1 to 20 | 5 x 8 | 25 | 20 | The middle school set, large targets, true positions |
| Main Groups | 8 x 8 | 55 | 50 | Groups 1, 2 and 13 to 18, all seven periods |
| Transition Metals | 5 x 10 | 45 | 38 | Groups 3 to 12 |
| Lanthanides and Actinides | 3 x 15 | 35 | 30 | Elements 57 to 71 and 89 to 103, as drawn under the table |
| The same five, "(facts)" | same | same | same | Identical layout. Each element says a fact sentence instead of its name |
| Alkali metals | 3 x 4 | 10 | 6 | One family at a time, large targets |
| Alkaline earth metals | 3 x 4 | 10 | 6 | |
| Post-transition metals | 4 x 4 | 15 | 11 | |
| Metalloids | 3 x 4 | 11 | 7 | |
| Nonmetals | 3 x 4 | 11 | 7 | |
| Halogens | 3 x 4 | 10 | 6 | |
| Noble gases | 3 x 4 | 11 | 7 | |
| Science Words | 8 x 8 | 59 | 0 | Single words: atom parts, table words, properties, charge, numbers, connectors |
| Class Talk | 7 x 4 | 27 | 0 | Whole phrases: asking, repair, joining in |
| Common Compounds | 5 x 5 | 24 | 0 | 20 compounds. Formula on the tile, says name then formula |

21 boards, 734 buttons, 168 picture files (654 picture ids, one per board that uses a picture).

### Why this structure

- **Two ways in, because students differ.** The Full Table is one tap per element and matches
  the chart on the classroom wall, but its targets are small (18 across). The block boards and
  family boards hold the same elements with much larger targets. Every element is on the Full
  Table or the f-block board, on exactly one block board, and on exactly one family board.
- **True positions wherever a board shows part of the table.** Row is period and column is
  group, so what the student learns on one board carries to the next and to the wall chart.
  The generator checks this for every element on the Full Table.
- **Lanthanides and actinides sit on their own board, the way IUPAC draws them.** The group 3
  cells in periods 6 and 7 are "57 to 71" and "89 to 103" link tiles. Putting all 118 on one
  board would pass the 112 ceiling and shrink every target.
- **Navigation never moves.** The bottom row of every board has Menu and Back in the left
  corner, and Words and Talk in the right corner. Corners stay in the same place
  on screen even though the grids differ. The Facts / Names switch is third from the
  right on the five layout boards. Labels are one short word each so they fit an 18-across grid.
- **Facts are a mode, not a second button.** A button can only do one thing, so a facts version
  of each layout board sits behind a switch in a fixed spot. The layout is identical, so there
  is nothing new to learn.
- **Transition metals, lanthanides and actinides are not duplicated.** Those three families are
  the same shape as their block, so the family link goes to the block board.
- **The color key on the Full Table is live.** The ten legend tiles sit in the gap above the
  transition metals, where a wall chart puts its key, and each one opens that family.

### Alternatives considered

- **All 118 on one board.** Rejected: over the 112 ceiling, and 10 rows by 18 columns is too
  small to hit reliably.
- **A detail board per element.** Rejected: 118 more boards to say one sentence each. The facts
  mode does the same job with 5.
- **Text-only tiles ("Na" as a big label).** Simplest and has no pictures to import, but loses
  the atomic number and the name, which is half of what a teacher asks about.
- **Alphabetical or by-number lists.** Rejected as a main view: they throw away the positions
  that the lesson is about.

## Button content (Step 3)

**Element buttons**

- Picture: atomic number top left, symbol large, family shape marker top right, on the family
  color. Drawn as SVG, so it stays sharp at any size.
- Label: the element name. Shown under the picture on every board except the Full Table, where
  it is hidden so the tile can fill the small cell. The name still appears in the speak bar.
- Says, names mode: the name. Example: "sodium".
- Says, facts mode: "Sodium. Symbol N A. Atomic number 11. Alkali metal. Group 1, period 3."
  The symbol is spelled as letters so a voice does not read "Na" as a word. Lanthanides and
  actinides give the period only, since they sit outside the numbered groups.
- Each carries `external_id` "element-N" so logs and reports can tell elements apart.

**Lettering.** Every number, symbol and word inside a picture is Atkinson Hyperlegible
(Braille Institute, SIL Open Font License 1.1), a typeface designed for low-vision readers. The
letters are stored in the SVG as outlines, so a tile looks the same on every device and no
font has to be installed. The outlines come from `atkinson_glyphs.json`, which
`extract_glyphs.py` rebuilds from the font files.

**Colors.** One color and one shape per family, the same on every board. Text is #111111.
The lowest contrast ratio on any button is 8.9 to 1 (WCAG AA needs 4.5 to 1).

| Family | Color | Shape |
|---|---|---|
| Alkali metals | #E5A0A0 | circle |
| Alkaline earth metals | #E5BE82 | square |
| Transition metals | #E5D878 | diamond |
| Post-transition metals | #B4D896 | triangle up |
| Metalloids | #8FD3C2 | pentagon |
| Nonmetals | #9CC7E5 | hexagon |
| Halogens | #B4B0E5 | triangle down |
| Noble gases | #D7ACE5 | ring |
| Lanthanides | #E5ACC8 | star |
| Actinides | #C9BBA6 | plus |

Every fill keeps each channel at or below 229. LingoLinq draws symbols through a "white backing"
filter that only changes channel values above 0.9, so a brighter pastel comes out a different
color inside the tile than on the button around it. The first build did exactly that.

**High-contrast set.** `periodic-table-high-contrast.obz` is the same 21 boards with the
colors turned around: every button is black, the picture is light ink on black, and the family
color moves to the picture frame. (The package also sets it as the button border, but the app
draws its own border from the button color.) Text-only word and phrase buttons use a dark tint
per row instead of pure black so the rows can still be told apart. The labels are meant to be
white, and in the Modern view they are. In the Basic view the app showed them navy, which is
unreadable on black, until the KAN-179 fix. See "What the live import showed" below. The family shape marker is unchanged, so family is never
carried by color alone. Its boards are named "Periodic Table (High Contrast)" and
"Periodic Table HC: ...", with keys starting `periodic-table-hc`, so both sets can sit in one
account without colliding.

OBF has no alt text or hint field on a button, so the "not color alone" requirement is met with
the shape marker, the family named in the facts sentence, and the family boards.

**Pronunciation.** Names are sent to the voice as plain spelling. No phonetic respellings are
applied, on purpose: LingoLinq uses on-device voices, they differ by device, and a respelling
that fixes one voice can break another. None of this was tested against a real voice. The 41
names most likely to need a listen are marked `tts_review` in
`output/periodic_table/elements_speech.csv`. The usual suspects: praseodymium, ytterbium,
dysprosium, molybdenum, protactinium, rutherfordium, darmstadtium, roentgenium, tennessine,
oganesson, and "lead" (a voice may say it like "leed"). To fix one, add it to
`SPEECH_OVERRIDES` in the generator and re-run.

## Data sources

- **Element data:** PubChem Periodic Table (National Library of Medicine),
  https://pubchem.ncbi.nlm.nih.gov/periodic-table/ , download
  https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/CSV , read 2026-11-25. Fields used:
  atomic number, symbol, name, standard state, and "GroupBlock" for the family.
- **Cross-check:** all 118 atomic numbers, symbols and names match the IUPAC atomic weights
  table (https://iupac.qmul.ac.uk/AtWt/). Two spellings differ by design: PubChem uses the US
  "Aluminum" and "Cesium" where IUPAC has "Aluminium" and "Caesium".
- **Group and period** are not stored. They follow from the atomic number and the IUPAC table
  layout, are computed in `position()`, and match a second public dataset for all 118.
- **Families are a convention.** PubChem's grouping is used as is. It puts polonium with the
  metalloids, astatine and tennessine with the halogens, and elements 113 to 116 with the
  post-transition metals. A class textbook may draw those lines differently.
- **Atomic mass is not on any button and not spoken.** No values to go stale.
- **Compound formulas** are the standard textbook ones and were not pulled from a database.
  A science teacher should glance over that board. Rust is given as iron oxide, Fe2O3, which is
  the usual school simplification.

## Validation (Step 4)

Run by the generator on every build (`output/periodic_table/validation_report.txt`), all pass:

- 118 elements, atomic numbers 1 to 118, no gaps, no duplicate symbols or names
- Each of the 118 appears exactly once across: Full Table + f-block board; their facts
  versions; the three block boards; the family boards
- Every element on the Full Table sits at row = period, column = group
- Both sets are checked, 88 checks in all
- No board over 112 buttons (largest 105)
- All 111 link buttons resolve, all 21 boards are reachable from the menu, every board links
  back to the menu
- Navigation is in the same corners on every board
- Every button has a label, both colors, and something to do. Every element button has a
  non-empty vocalization
- Contrast is AA on every button color
- Two runs give a byte-identical file

Run separately (`scripts/periodic_table/check_with_obf_gem.rb`), using the same `obf` gem
version the app imports with:

- `OBF::External.from_obz`, the first step of LingoLinq's own import, reads each package: 21
  boards, 654 picture ids, 734 buttons, 118 distinct elements, 0 unresolved links, every picture
  embedded
- Importer replay (see below): 0 buttons would lose their picture
- OBF reference validator: valid, 0 errors, 80 warnings, all the same one ("image_id is
  recommended") for the text-only word and phrase buttons
- The repo's `scripts/inspect_obz.rb`: no issues found

Not run: the repo's RSpec suite (nothing in the app changed).

## How to import

- **In the app:** create a board, choose Import, pick `periodic-table.obz` or
  `periodic-table-high-contrast.obz`. The menu board opens when it finishes. Boards arrive
  private to the importing account. In the "Import for" step, leave only your own name checked
  unless you mean to give a full copy to each checked user.
- **As a system set:** copy it to `public/system-boards/` and follow the
  `SystemBoardSources.ensure_crisis_vocabulary!` pattern. That is a code change and should go
  through a PR.

## What the live import showed

- **Shared pictures only attach to the first board (app bug).** `Converters::LingoLinq.from_external`
  gives every board the package-wide picture list, then overwrites the id of each picture it uses
  with the new record's id. The next board that references the same picture id finds nothing and
  imports that button with no picture. The first build shared 168 ids across boards and 486
  buttons came in blank. The package now uses one picture id per board. `check_with_obf_gem.rb`
  replays the importer's logic and reports how many buttons would lose a picture (486 before,
  0 now). Any third-party `.obz` that reuses a picture across boards will hit the same bug.
- **`hide_empty` and board-level `text_only` do not survive import.** The importer stores them,
  but the board API does not return them, so the app never sees them. Empty cells follow the
  user's "hidden buttons" preference instead (on the account used here they show as white placeholders).
- **Labels on dark buttons cannot be read in the Basic view (app bug, KAN-179, found
  2026-11-27).** `bound_classes.js` works out a readable label color for each button color
  (white on black), but `app/frontend/app/styles/app.scss` forced `color: $indigo !important` on
  `.board .button` and `.board .button .button-label` inside `#within_ember.board-alt-view`, so
  in the Basic view (`/<user>/board/<name>`, normal and Speak Mode) every label was navy whatever
  the button color. On the regular set that is fine: the lowest label contrast measured in the
  app is 6.7 to 1. On the high-contrast set it is 1.0 to 1.5 to 1, so the names under the
  pictures cannot be read and the text-only Words and Class Talk boards are unreadable. The
  pictures themselves are unaffected. The Modern view (`/<user>/board-detail/<name>`, the default
  for new accounts) is not affected: it writes the readable color inline and the labels come out
  white. The fix is in the app (KAN-179): the Basic view keeps navy by default and uses white
  when the fill is dark. Until that ships, use the high-contrast set in the Modern view.
- **The button border is always the app's.** The app darkens the button color by 20 percent
  for the border and ignores the package's border color, so black buttons get a black border.
- **Labels clip at one line in Speak Mode.** Two long Class Talk phrases now have a shorter label
  and still speak the full phrase.

## Where it is installed (2026-11-27)

| Environment | Set | Menu board key |
|---|---|---|
| dev.lingolinq.com | Regular | `<user>/periodic-table` |
| dev.lingolinq.com | High contrast | `<user>/periodic-table-hc` |
| app.lingolinq.com | Regular | `<user>/periodic-table` |
| app.lingolinq.com | High contrast | `<user>/periodic-table-hc` |

Each import was read back through the board API and matched the package: 21 boards, 734
buttons, 654 pictures, 111 links, every link pointing inside its own set. On dev the first
build's 21 boards were deleted before the regular set went in, so the keys stayed the same. Nothing else in either account was changed.

## Known limits

- **Speech was not listened to.** Speak Mode was checked for layout, pictures, links and the
  speak bar text, not for how a voice pronounces anything.
- **Pictures are copied per board on import.** 654 small uploads, so the import takes a few
  minutes.
- **`home_lock` on links is a choice.** It stops Speak Mode from jumping home after every
  element. The cost: Home returns to the current table board until the lock is released.
- **Empty cells may show as placeholders**, depending on the user's hidden-buttons preference
  (see above). The table has gaps by nature.
- **Long names on the 15-across f-block board** will wrap or clip under the tile at small sizes.
  The spoken name is unaffected.
- **Row-column scanning** reaches the navigation row last, since it is at the bottom.
- **The pictures are CC0, the boards are private.** Every picture carries the public-domain
  license (CC0 1.0) and credits LingoLinq, so the symbols can be shared or donated freely. The
  boards themselves are still marked private. Change `LICENSE` in the generator before
  publishing them as shared library boards.
- **The app tints near-white inside pictures.** LingoLinq's symbol filter shifts channel values
  above 0.9, so the light ink in the high-contrast pictures can read slightly off-white.
- **English only.** Labels and speech are in one table in the generator, so a Spanish set is a
  translation of that table, not a redesign.

## Re-running

```
python3 scripts/periodic_table/generate_periodic_table.py            # writes both .obz files to output/periodic_table/
ruby scripts/periodic_table/check_with_obf_gem.rb output/periodic_table/periodic-table.obz
ruby scripts/periodic_table/check_with_obf_gem.rb output/periodic_table/periodic-table-high-contrast.obz
python3 scripts/periodic_table/make_preview.py output/periodic_table/periodic-table.obz
python3 scripts/periodic_table/build_symbol_pack.py                  # writes the CC0 symbol pack
python3 scripts/periodic_table/extract_glyphs.py                     # only if the font files change (needs fonttools)
```
