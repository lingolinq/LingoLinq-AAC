# Importing the board sets from inside the browser (optional tooling)

The normal way to import is the app's own Import button: pick `periodic-table.obz` or
`periodic-table-high-contrast.obz` and leave only your own name checked in "Import for".
Use that whenever a person, or an agent that can choose a file, is doing the import.

This folder is for the other case: an agent driving a browser that can run JavaScript in the
page but cannot upload a file. It rebuilds the package inside the page, proves it is the same
package byte for byte, and hands it to the app's own import form. It was used for the
2026-11-27 imports on dev and production.

## Pieces

| File | What it is |
|---|---|
| `ptgen.js` | A JavaScript port of `generate_periodic_table.py` and the tile drawing in `build_symbol_pack.py`. `ptBuild(theme, glyphs)` returns `{path: text}` for every file in one package. `theme` is `regular` or `high-contrast`. |
| `ptzip.js` | `ptZip(files)` packs that map into a stored (uncompressed) zip with `manifest.json` first. |
| `driver.js` | `window.__pt`: build and hash a set, put it on the app's `#board_upload` input, read the "Import for" dialog, start the import only when the single checked recipient is "(me)", and read every board back to compare button, picture and link counts. |
| `glyph_subset.json` | `atkinson_glyphs.json` cut down to the characters the tiles use, to keep the paste small. The full file gives the same output. |
| `expected.json` | SHA-256 of every file inside each `.obz`, and one combined hash per set. |
| `check_port.js` | Proves `ptgen.js` still matches the Python build. |
| `make_bundle.py` | Refreshes `expected.json` and writes the paste-ready chunks. |

## Keeping the port honest

`ptgen.js` has to produce the same bytes as the Python generator. After any change to the
generator, the symbol drawing or the port:

```
python3 scripts/periodic_table/generate_periodic_table.py
python3 scripts/periodic_table/browser_import/make_bundle.py
node scripts/periodic_table/browser_import/check_port.js
```

`check_port.js` must report 0 mismatches for both sets. The per-board counts in `driver.js`
(`E`) come from the packages too. Update them if a board gains or loses a button.

## Using it

1. The person signs in themselves. The agent never types a password.
2. Open `/create-board-new` in the app, which has the `#board_upload` input. Stay on that page:
   a full page load clears everything pasted so far. Move between app pages with
   `history.pushState` plus a `popstate` event instead of a reload.
3. Run `make_bundle.py`, then paste `glyph_chunks.json` and `bundle_chunks.json` into the page
   chunk by chunk. Check each chunk's 10-digit hash before keeping it, gunzip
   (`DecompressionStream('gzip')`), check the full SHA-256 that `make_bundle.py` printed, then
   `JSON.parse` the glyphs into `window.__G` and evaluate the bundle.
4. `await __pt.build('regular')` and `await __pt.build('high-contrast')`. Each returns a
   `combined` hash that must equal `all` in `expected.json` before anything is imported.
5. Check that the target keys are free (`__pt.exists(user, 'periodic-table')`). An import next to
   boards with the same keys gets renamed keys.
6. `__pt.imp(theme)`, wait a few seconds, `__pt.modal()` to read the recipients, then
   `__pt.start()`. It refuses unless exactly one box is checked and it is the "(me)" one. Every
   other checked user would receive a full copy of the set.
7. Wait until the page leaves `/create-board-new` (about two minutes per set, 654 small picture
   uploads), then `await __pt.check(user, theme)`: 21 boards, 734 buttons, 654 pictures,
   111 links, and an empty `bad` list.

All API calls go through the app's own `window.persistence.ajax`, so the agent never reads or
handles the session token.
