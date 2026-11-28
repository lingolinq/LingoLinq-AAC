#!/usr/bin/env python3
"""Build the periodic table symbols as a standalone, CC0 symbol pack.

    python3 scripts/periodic_table/build_symbol_pack.py --out output/periodic_table_symbols

Standard library only. Letter shapes come from atkinson_glyphs.json, which extract_glyphs.py made
from the Atkinson Hyperlegible font (SIL Open Font License 1.1, Braille Institute of America).
Every letter and number is written into the SVG as an outline, so the symbols look the same on
any device and need no font installed.

Two themes, same shapes and same file names:
    regular/        dark text on the family color
    high-contrast/  white on black, family color kept on the border and the shape marker

Element data and family grouping come from the same PubChem extract as the board set
(scripts/periodic_table/elements_pubchem.csv).
"""
import argparse
import csv
import math
import os
import re
import sys
import xml.dom.minidom
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import generate_periodic_table as g  # noqa: E402  (elements, families, colors, contrast helpers)

AUTHOR = "LingoLinq"
LICENSE_NAME = "CC0 1.0 Universal"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"

# Theme: page fill, ink, and how the family color is used.
THEMES = {
    "regular": {"ink": "#111111", "neutral_fill": "#E5E5E5", "neutral_border": "#59606B", "map_idle": "#CDD1D6",
                "map_stroke": "#222222"},
    "high-contrast": {"ink": "#FFFFFF", "neutral_fill": "#000000", "neutral_border": "#FFFFFF", "map_idle": "#4A4A4A",
                      "map_stroke": "#FFFFFF"},
}


def num(v):
    """Two decimals, trailing zeros dropped. Shared number format for every outline coordinate."""
    return ("%.2f" % v).rstrip("0").rstrip(".")


class Outliner:
    """Turns text into SVG path data from the letter shapes in atkinson_glyphs.json.
    Advance widths only, no kerning. The in-page importer mirrors this arithmetic step for step."""

    def __init__(self, table, weight):
        self.upm = float(table["upm"])
        self.glyphs = table[weight]

    def width(self, s, size):
        return sum(self.glyphs[ch]["adv"] for ch in s) * size / self.upm

    def path(self, s, size, x, y, anchor="start"):
        """Path data for s with its baseline at y. anchor is start or middle."""
        if anchor == "middle":
            x -= self.width(s, size) / 2.0
        scale = size / self.upm
        out = []
        for ch in s:
            glyph = self.glyphs[ch]
            for seg in glyph["d"]:
                if seg[0] == "Z":
                    out.append("Z")
                elif seg[0] == "Q":
                    out.append("Q%s %s %s %s" % (num(x + seg[1] * scale), num(y - seg[2] * scale),
                                                 num(x + seg[3] * scale), num(y - seg[4] * scale)))
                else:
                    out.append("%s%s %s" % (seg[0], num(x + seg[1] * scale), num(y - seg[2] * scale)))
            x += glyph["adv"] * scale
        return "".join(out)


def load_outliners(path=None):
    import json
    with open(path or os.path.join(HERE, "atkinson_glyphs.json"), encoding="utf-8") as fh:
        table = json.load(fh)
    return Outliner(table, "bold"), Outliner(table, "regular")


def ink_path(d, color):
    return '<path d="%s" fill="%s"/>' % (d, color)


def fit(outliner, s, size, max_width):
    w = outliner.width(s, size)
    return size if w <= max_width else size * max_width / w


def svg(title, desc, body):
    def esc(t):
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" role="img">'
            '<title>%s</title><desc>%s %s, %s. %s</desc>%s</svg>') % (esc(title), esc(desc), LICENSE_NAME, AUTHOR, LICENSE_URL, body)


def frame(fill, border, width=3):
    inset = width / 2.0 + 0.5
    return '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="9" fill="%s" stroke="%s" stroke-width="%s"/>' % (
        inset, inset, 100 - 2 * inset, 100 - 2 * inset, fill, border, width)


def family_frame(theme, cat):
    if theme == "regular":
        return frame(cat["bg"], g.darker(cat["bg"])), THEMES[theme]["ink"], THEMES[theme]["ink"]
    # High contrast: black tile, thick border and shape marker in the family color, white ink.
    return frame("#000000", cat["bg"], 6), "#FFFFFF", cat["bg"]


def element_tile(theme, el, bold, regular, named):
    cat = g.CAT[el["category"]]
    box, ink, mark = family_frame(theme, cat)
    body = box
    body += ink_path(bold.path(str(el["z"]), 21, 10, 28), ink)
    body += g.marker(cat["shape"], 82, 21, 7, mark)
    if named:
        size = fit(bold, el["symbol"], 46, 78)
        body += ink_path(bold.path(el["symbol"], size, 50, 67, "middle"), ink)
        nsize = fit(regular, el["name"], 13.5, 82)
        body += ink_path(regular.path(el["name"], nsize, 50, 87, "middle"), ink)
    else:
        size = fit(bold, el["symbol"], 54, 80)
        body += ink_path(bold.path(el["symbol"], size, 50, 82, "middle"), ink)
    title = "%s, symbol %s, atomic number %d" % (el["name"], el["symbol"], el["z"])
    return svg(title, "%s." % el["category"], body)


def range_tile(theme, cat_key, numbers, symbols, bold, regular):
    cat = g.CAT[cat_key]
    box, ink, mark = family_frame(theme, cat)
    body = box + g.marker(cat["shape"], 82, 21, 7, mark)
    body += ink_path(bold.path(numbers, fit(bold, numbers, 25, 80), 50, 60, "middle"), ink)
    body += ink_path(regular.path(symbols, 18, 50, 84, "middle"), ink)
    plain = numbers.replace("–", " to ")
    return svg("%s, elements %s" % (cat["plural"], plain), "Link tile for the %s row." % cat["plural"].lower(), body)


def family_tile(theme, cat_key):
    cat = g.CAT[cat_key]
    box, _ink, mark = family_frame(theme, cat)
    return svg("%s family marker" % cat["plural"], "Shape and color used for %s." % cat["plural"].lower(),
               box + g.marker(cat["shape"], 50, 50, 24, mark))


def formula_tile(theme, name, tokens, bold):
    t = THEMES[theme]
    units = sum((0.62 if sub else 1.0) * bold.width(tok, 1.0) for tok, sub in tokens)
    size = min(40.0, 80.0 / units)
    x = 50 - units * size / 2.0
    body = frame(t["neutral_fill"], t["neutral_border"], 3 if theme == "regular" else 6)
    for tok, sub in tokens:
        s = size * (0.62 if sub else 1.0)
        body += ink_path(bold.path(tok, s, x, 50 + size * 0.33 + (size * 0.22 if sub else 0)), t["ink"])
        x += bold.width(tok, s)
    formula = "".join(tok for tok, _sub in tokens)
    return svg("%s, formula %s" % (name, formula), "Chemical formula tile.", body)


def map_tile(theme, elements, highlight, label):
    t = THEMES[theme]
    cw, ch, gap, ox, oy = 4.6, 7.4, 0.3, 6.05, 14.0   # 18 columns fit inside the frame with a margin
    body = frame(t["neutral_fill"], t["neutral_border"], 3 if theme == "regular" else 6)
    for el in elements:
        if el["group"]:
            col, row = el["group"] - 1, el["period"] - 1
            y = oy + row * (ch + gap)
        else:
            col, row = el["f_index"] + 2, el["period"] + 1
            y = oy + row * (ch + gap) + 3.0
        x = ox + col * (cw + gap)
        if el["z"] in highlight:
            body += '<rect x="%.2f" y="%.2f" width="%.1f" height="%.1f" fill="%s" stroke="%s" stroke-width="0.7"/>' % (
                x, y, cw, ch, g.CAT[el["category"]]["bg"], t["map_stroke"])
        else:
            body += '<rect x="%.2f" y="%.2f" width="%.1f" height="%.1f" fill="%s"/>' % (x, y, cw, ch, t["map_idle"])
    return svg("Periodic table map: %s" % label, "Small picture of the periodic table with %s filled in." % label.lower(), body)


def icon_tile(theme, kind, label, bold):
    t = THEMES[theme]
    ink = t["ink"]
    fill = "#D5DCE5" if theme == "regular" else "#000000"
    border = "#5B6472" if theme == "regular" else "#FFFFFF"
    body = frame(fill, border, 3 if theme == "regular" else 6)
    s = 'stroke="%s" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"' % ink
    if kind == "menu":
        for r in range(3):
            for c in range(3):
                body += '<rect x="%d" y="%d" width="18" height="18" rx="3" fill="%s"/>' % (21 + c * 20, 21 + r * 20, ink)
    elif kind == "back":
        body += '<path d="M78 50 H26 M46 28 L24 50 L46 72" %s/>' % s
    elif kind == "words":
        o = 'stroke="%s" stroke-width="5" fill="none"' % ink
        body += '<ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(35 50 50)" %s/>' % o
        body += '<ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(-35 50 50)" %s/>' % o
        body += '<circle cx="50" cy="50" r="8" fill="%s"/>' % ink
    elif kind == "talk":
        body += '<path d="M22 24 H78 V62 H48 L32 78 V62 H22 Z" %s/>' % s
    elif kind == "facts":
        body += '<circle cx="50" cy="50" r="30" stroke="%s" stroke-width="6" fill="none"/>' % ink
        body += '<circle cx="50" cy="35" r="5" fill="%s"/>' % ink
        body += '<path d="M50 47 V68" %s/>' % s
    elif kind == "names":
        body += '<rect x="18" y="30" width="64" height="40" rx="7" stroke="%s" stroke-width="6" fill="none"/>' % ink
        body += ink_path(bold.path("Na", 26, 50, 59.5, "middle"), ink)
    return svg(label, "Navigation icon.", body)


COMPOUNDS = [
    ("Water", "H_2_O"), ("Carbon dioxide", "CO_2"), ("Oxygen gas", "O_2"), ("Hydrogen gas", "H_2"),
    ("Nitrogen gas", "N_2"), ("Table salt", "NaCl"), ("Methane", "CH_4"), ("Ammonia", "NH_3"),
    ("Glucose", "C_6_H_12_O_6"), ("Hydrochloric acid", "HCl"), ("Sulfuric acid", "H_2_SO_4"),
    ("Sodium hydroxide", "NaOH"), ("Calcium carbonate", "CaCO_3"), ("Hydrogen peroxide", "H_2_O_2"),
    ("Carbon monoxide", "CO"), ("Ozone", "O_3"), ("Baking soda", "NaHCO_3"), ("Rust", "Fe_2_O_3"),
    ("Sand", "SiO_2"), ("Ethanol", "C_2_H_5_OH"),
]
ICONS = [("menu", "Menu"), ("back", "Back"), ("words", "Science words"), ("talk", "Class talk"),
         ("facts", "Say facts"), ("names", "Say names")]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def build(elements, bold, regular):
    """Returns {relative path: svg text} and the metadata rows."""
    files, rows = {}, []
    main_groups = [1, 2, 13, 14, 15, 16, 17, 18]
    views = [
        ("full-table", "the main table", {e["z"] for e in elements if e["group"]}),
        ("elements-1-20", "elements 1 to 20", set(range(1, 21))),
        ("main-groups", "the main groups", {e["z"] for e in elements if e["group"] in main_groups}),
        ("transition-metals", "the transition metals", {e["z"] for e in elements if e["group"] and 3 <= e["group"] <= 12}),
        ("lanthanides-actinides", "the lanthanides and actinides", {e["z"] for e in elements if e["f_index"] is not None}),
    ]
    for key, c in g.CAT.items():
        if key not in ("Transition metal", "Lanthanide", "Actinide"):
            views.append((c["slug"], "the %s" % c["plural"].lower(), {e["z"] for e in elements if e["category"] == key}))

    def add(theme, folder, name, text, label, kind, keywords, el=None, layout=""):
        path = "%s/%s/%s.svg" % (theme, folder, name)
        assert path not in files, path
        files[path] = text
        rows.append({"file": path, "label": label, "kind": kind, "theme": theme, "layout": layout,
                     "symbol": el["symbol"] if el else "", "atomic_number": el["z"] if el else "",
                     "family": el["category"] if el else "", "keywords": "; ".join(keywords),
                     "license": LICENSE_NAME, "license_url": LICENSE_URL, "author": AUTHOR})

    for theme in THEMES:
        for el in elements:
            name = "%03d-%s-%s" % (el["z"], slug(el["name"]), el["symbol"].lower())
            kw = [el["name"].lower(), el["symbol"], "atomic number %d" % el["z"], el["category"].lower(), "element",
                  "periodic table", "chemistry", "science"]
            add(theme, "elements", name, element_tile(theme, el, bold, regular, False), el["name"], "element", kw, el, "symbol")
            add(theme, "elements-named", name, element_tile(theme, el, bold, regular, True), el["name"], "element", kw, el, "symbol and name")
        for key, c in g.CAT.items():
            add(theme, "families", c["slug"], family_tile(theme, key), c["plural"], "family marker",
                [c["plural"].lower(), "family", "group", "periodic table", "chemistry"])
        add(theme, "ranges", "lanthanides-57-71", range_tile(theme, "Lanthanide", "57–71", "La–Lu", bold, regular),
            "Lanthanides 57 to 71", "range", ["lanthanides", "57 to 71", "periodic table"])
        add(theme, "ranges", "actinides-89-103", range_tile(theme, "Actinide", "89–103", "Ac–Lr", bold, regular),
            "Actinides 89 to 103", "range", ["actinides", "89 to 103", "periodic table"])
        for name, formula in COMPOUNDS:
            tokens = [(t, i % 2 == 1) for i, t in enumerate(formula.split("_"))]
            plain = formula.replace("_", "")
            add(theme, "compounds", "%s-%s" % (slug(name), plain.lower()), formula_tile(theme, name, tokens, bold), name,
                "compound", [name.lower(), plain, "formula", "compound", "chemistry", "science"])
        for key, label, zs in views:
            add(theme, "maps", key, map_tile(theme, elements, zs, label), "Map: %s" % label, "map",
                [label, "periodic table", "map", "chemistry"])
        for kind, label in ICONS:
            add(theme, "navigation", kind, icon_tile(theme, kind, label, bold), label, "navigation", [label.lower(), "navigation"])
    return files, rows


def check(files, rows, elements):
    lines, problems = [], []

    def ok(cond, msg):
        lines.append(("PASS  " if cond else "FAIL  ") + msg)
        if not cond:
            problems.append(msg)

    for theme in THEMES:
        for folder in ("elements", "elements-named"):
            got = sorted(int(r["atomic_number"]) for r in rows if r["theme"] == theme and r["file"].split("/")[1] == folder)
            ok(got == list(range(1, 119)), "%s/%s: all 118 elements, each once" % (theme, folder))
    per_theme = {t: sum(1 for r in rows if r["theme"] == t) for t in THEMES}
    ok(len(set(per_theme.values())) == 1, "both themes hold the same number of symbols (%s each)" % list(per_theme.values())[0])
    reg = {r["file"].split("/", 1)[1] for r in rows if r["theme"] == "regular"}
    hc = {r["file"].split("/", 1)[1] for r in rows if r["theme"] == "high-contrast"}
    ok(reg == hc, "every regular symbol has a high-contrast twin with the same file name")
    bad_xml = 0
    for text in files.values():
        try:
            xml.dom.minidom.parseString(text)
        except Exception:
            bad_xml += 1
    ok(bad_xml == 0, "all %d files are well-formed SVG" % len(files))
    ok(not any("<text" in t or "font-family" in t for t in files.values()), "no live text or font references: every letter is an outline")
    ok(all("<title>" in t and LICENSE_NAME in t for t in files.values()), "every file carries a title and the CC0 notice")

    reg_worst = min(g.contrast(THEMES["regular"]["ink"], c[4]) for c in g.CATEGORIES)
    reg_neutral = g.contrast(THEMES["regular"]["ink"], THEMES["regular"]["neutral_fill"])
    hc_text = g.contrast("#FFFFFF", "#000000")
    hc_worst_family = min(g.contrast(c[4], "#000000") for c in g.CATEGORIES)
    ok(min(reg_worst, reg_neutral) >= 7.0, "regular: text contrast is %.1f:1 at worst (WCAG AAA needs 7:1)" % min(reg_worst, reg_neutral))
    ok(hc_text >= 7.0, "high contrast: text is white on black, %.0f:1" % hc_text)
    ok(hc_worst_family >= 3.0, "high contrast: family borders and markers are %.1f:1 on black at worst (graphics need 3:1)" % hc_worst_family)
    lines.append("")
    lines.append("Contrast of dark text on each regular family color:")
    for c in g.CATEGORIES:
        lines.append("  %-24s %s  %.1f:1   (same color on black: %.1f:1)" % (c[2], c[4], g.contrast("#111111", c[4]), g.contrast(c[4], "#000000")))
    return problems, lines


README = """# Periodic Table symbols

{count} symbols for science class: every element, 20 common compounds, family markers, small
periodic-table maps and a few navigation icons. Made for AAC boards, usable anywhere.

## License

CC0 1.0 Universal (public domain dedication). Use them, change them, sell things made with them,
no permission or credit needed. Full text: {url}
Dedicated by {author}, 2026.

## What is here

| Folder | Count per theme | What |
|---|---|---|
| elements | 118 | Atomic number, symbol, family marker |
| elements-named | 118 | The same, with the element name under the symbol |
| compounds | 20 | Formula tiles: water, carbon dioxide, table salt and so on |
| families | 10 | The shape and color used for each family |
| ranges | 2 | "57 to 71" and "89 to 103" link tiles |
| maps | 12 | Small pictures of the table with one part filled in |
| navigation | 6 | Menu, back, science words, class talk, say facts, say names |

Two themes with identical file names, so one can be swapped for the other:

- `regular/`: dark text on the family color. Text contrast is {reg:.1f}:1 or better.
- `high-contrast/`: white on black ({hc:.0f}:1). The family color stays on the border and the
  shape marker only.

`symbols.csv` lists every file with its label, element symbol, atomic number, family and search
keywords.

## Design notes

- **Lettering is Atkinson Hyperlegible**, the typeface the Braille Institute designed for low
  vision. It keeps look-alike characters apart (capital I, lowercase l and the number 1; O and 0),
  which matters for symbols like I, Cl, Al, Tl and Li.
- **Every letter is an outline, not live text.** The files look the same everywhere and need no
  font installed. The font is licensed under the SIL Open Font License 1.1 (copyright 2020 Braille
  Institute of America, Inc.); these symbols are artwork made with it.
- **Family is never shown by color alone.** Each family also has its own shape in the top right
  corner: circle, square, diamond, triangle, pentagon, hexagon, inverted triangle, ring, star, plus.
- **All tiles are opaque** and drawn on a 100 x 100 grid, exported at 512 x 512.

## Data

Element names, symbols, atomic numbers and family grouping are from the PubChem Periodic Table
(National Library of Medicine), cross-checked against the IUPAC atomic weights table. Spellings
are US ("Aluminum", "Cesium"). Family boundaries are PubChem's and vary between textbooks.

## Rebuilding

`python3 scripts/periodic_table/build_symbol_pack.py`
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data", default=os.path.join(HERE, "elements_pubchem.csv"))
    ap.add_argument("--out", default=os.path.join(os.getcwd(), "output", "periodic_table_symbols"))
    args = ap.parse_args()

    elements = g.load_elements(args.data)
    bold, regular = load_outliners()
    files, rows = build(elements, bold, regular)
    problems, lines = check(files, rows, elements)

    reg = min(min(g.contrast("#111111", c[4]) for c in g.CATEGORIES), g.contrast("#111111", THEMES["regular"]["neutral_fill"]))
    extra = {
        "README.md": README.format(count=len(files), url=LICENSE_URL, author=AUTHOR, reg=reg, hc=g.contrast("#FFFFFF", "#000000")),
        "LICENSE.txt": ("Periodic Table symbols\n\nTo the extent possible under law, %s has waived all copyright and related or\n"
                        "neighboring rights to this work under the %s public domain dedication.\n\n%s\n\n"
                        "Lettering is drawn as outlines from Atkinson Hyperlegible, copyright 2020 Braille Institute of\n"
                        "America, Inc., licensed under the SIL Open Font License, Version 1.1. No font file is included.\n"
                        % (AUTHOR, LICENSE_NAME, LICENSE_URL + "legalcode")),
        "CHECKS.txt": "\n".join(["%d symbols in %d themes" % (len(files), len(THEMES)), ""] + lines +
                                ["", "RESULT: %s" % ("all checks passed" if not problems else "%d check(s) FAILED" % len(problems))]) + "\n",
    }
    buf = []
    fields = ["file", "label", "kind", "theme", "layout", "symbol", "atomic_number", "family", "keywords", "license", "license_url", "author"]
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "symbols.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    for rel, text in list(files.items()) + list(extra.items()):
        full = os.path.join(args.out, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as fh:
            fh.write(text)
        buf.append(rel)
    zpath = os.path.join(os.path.dirname(args.out.rstrip("/")), "periodic-table-symbols-cc0.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel in sorted(buf + ["symbols.csv"]):
            info = zipfile.ZipInfo("periodic-table-symbols/" + rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(os.path.join(args.out, rel), "rb") as fh:
                zf.writestr(info, fh.read())
    print(extra["CHECKS.txt"])
    print("wrote %s (%d bytes)" % (zpath, os.path.getsize(zpath)))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
