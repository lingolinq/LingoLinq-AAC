# Periodic Table board sets

Design, data sources, validation and known limits: `docs/periodic_table_design.md`.

| File | What it does |
|---|---|
| `generate_periodic_table.py` | Builds both board sets (regular and high contrast) as `.obz` packages in `output/periodic_table/`, with a validation report. Python 3, standard library only. |
| `build_symbol_pack.py` | Draws every tile. Run on its own it writes the CC0 symbol pack to `output/periodic_table_symbols/` and a zip beside it. |
| `atkinson_glyphs.json` | Atkinson Hyperlegible letter outlines used for all lettering in the tiles. License: `ATKINSON_HYPERLEGIBLE_OFL.txt`. |
| `extract_glyphs.py` | Rebuilds `atkinson_glyphs.json` from the font files. Needs `fonttools` and the two TTF files. Only needed if the font changes. |
| `elements_pubchem.csv` | Element data from the PubChem Periodic Table. |
| `check_with_obf_gem.rb` | Reads a package with the same `obf` gem the app imports with, replays the importer's picture handling, and runs the OBF validator. |
| `make_preview.py` | Writes a self-contained HTML preview of a package. |
| `browser_import/` | Optional tooling for importing from inside a browser that cannot upload files. |

```
python3 scripts/periodic_table/generate_periodic_table.py
ruby scripts/periodic_table/check_with_obf_gem.rb output/periodic_table/periodic-table.obz
ruby scripts/periodic_table/check_with_obf_gem.rb output/periodic_table/periodic-table-high-contrast.obz
python3 scripts/periodic_table/build_symbol_pack.py
python3 scripts/periodic_table/make_preview.py output/periodic_table/periodic-table.obz
```

The pictures are licensed CC0 1.0. The boards are marked private until someone decides how
they should ship (see "How to import" in the design doc).
