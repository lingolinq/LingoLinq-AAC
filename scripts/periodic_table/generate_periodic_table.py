#!/usr/bin/env python3
"""Generate the LingoLinq Periodic Table board sets as Open Board Format packages (.obz).

Usage (from the repo root):
    python3 scripts/periodic_table/generate_periodic_table.py
    python3 scripts/periodic_table/generate_periodic_table.py --out output/periodic_table

Standard library only. Output is deterministic: the same inputs give byte-identical files.

Two board sets come out, with the same layout and the same speech:
    periodic-table.obz                 dark text on family colors
    periodic-table-high-contrast.obz   white on black, family color on the tile border and marker

Inputs
    scripts/periodic_table/elements_pubchem.csv
        Atomic number, symbol, name, standard state and category ("GroupBlock") for all 118
        elements, from the PubChem Periodic Table download (NIH/NLM). Names and symbols were
        cross-checked against the IUPAC atomic-weights table. Group and period follow from the
        atomic number and are computed in position().
    scripts/periodic_table/atkinson_glyphs.json
        Letter shapes from Atkinson Hyperlegible (SIL Open Font License 1.1), read by
        build_symbol_pack.py, which draws every picture. The pictures are CC0.

Outputs (in --out, default output/periodic_table)
    the two .obz files      boards + SVG pictures + manifest
    board_map.json          one row per board: set, id, name, grid, button counts, links
    elements_speech.csv     per element: label, spoken name, spoken fact sentence
    validation_report.txt   result of the built-in checks (the script exits 1 if any fail)

Nothing here talks to a database or a LingoLinq account. Importing an .obz is a separate step.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
FORMAT = "open-board-0.1"
MAX_BUTTONS = 112          # LingoLinq's largest standard grid (Quick Core 112)
TEXT = "#111111"           # ink on the regular tiles
LICENSE = {"type": "private", "author_name": "LingoLinq", "author_url": "https://www.lingolinq.com"}   # the boards
# The pictures are dedicated to the public domain (CC0 1.0). "public domain" is LingoLinq's id for it.
IMAGE_LICENSE = {"type": "public domain", "copyright_notice_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                 "author_name": "LingoLinq", "author_url": "https://www.lingolinq.com"}

# Two board sets from the same layout. Board ids and names are derived from the regular ones.
THEMES = {
    "regular": {"root": "periodic-table", "file": "periodic-table.obz", "title": "Periodic Table", "prefix": "Periodic Table:"},
    "high-contrast": {"root": "periodic-table-hc", "file": "periodic-table-high-contrast.obz",
                      "title": "Periodic Table (High Contrast)", "prefix": "Periodic Table HC:"},
}
# High contrast: every button is black (LingoLinq then draws its label in white). The word and
# phrase boards keep their row grouping with a deep tint instead of a pastel.
HC_ROW_TINTS = {"#DCEBFF": "#00264D", "#FFF1C9": "#3D2E00", "#DDF3D6": "#0B3311", "#F6DCF5": "#3A0A3A",
                "#FFFFFF": "#000000", "#ECECEC": "#222222"}

# ---------------------------------------------------------------------------------------------
# Categories. Keys are PubChem "GroupBlock" values. Each gets a color AND a shape marker so the
# category is never carried by color alone.
# ---------------------------------------------------------------------------------------------
CATEGORIES = [
    # key,                     slug,              plural label,              short,             bg,        shape
    ("Alkali metal",           "alkali-metals",   "Alkali metals",           "Alkali",          "#E5A0A0", "circle"),
    ("Alkaline earth metal",   "alkaline-earth",  "Alkaline earth metals",   "Alkaline earth",  "#E5BE82", "square"),
    ("Transition metal",       "transition",      "Transition metals",       "Transition",      "#E5D878", "diamond"),
    ("Post-transition metal",  "post-transition", "Post-transition metals",  "Post-transition", "#B4D896", "tri_up"),
    ("Metalloid",              "metalloids",      "Metalloids",              "Metalloid",       "#8FD3C2", "pentagon"),
    ("Nonmetal",               "nonmetals",       "Nonmetals",               "Nonmetal",        "#9CC7E5", "hexagon"),
    ("Halogen",                "halogens",        "Halogens",                "Halogen",         "#B4B0E5", "tri_down"),
    ("Noble gas",              "noble-gases",     "Noble gases",             "Noble gas",       "#D7ACE5", "ring"),
    ("Lanthanide",             "lanthanides",     "Lanthanides",             "Lanthanide",      "#E5ACC8", "star"),
    ("Actinide",               "actinides",       "Actinides",               "Actinide",        "#C9BBA6", "plus"),
]
CAT = {c[0]: {"slug": c[1], "plural": c[2], "short": c[3], "bg": c[4], "shape": c[5]} for c in CATEGORIES}
# Tile fills keep every channel at or below 229 (0.9). LingoLinq draws symbols through a
# "white backing" filter that only changes channel values above 0.9, so these pass through as is.
NEUTRAL_BG = "#E5E5E5"
NAV_BG = "#D5DCE5"
NAV_BORDER = "#5B6472"

# TTS check list: names most likely to be mispronounced by a synthetic voice. They are spoken as
# their plain spelling by default. To force a respelling for a voice that gets one wrong, add it
# to SPEECH_OVERRIDES (name -> what the voice should be given) and re-run.
TTS_REVIEW = [
    "Praseodymium", "Neodymium", "Promethium", "Europium", "Gadolinium", "Dysprosium", "Ytterbium",
    "Lutetium", "Yttrium", "Niobium", "Molybdenum", "Technetium", "Ruthenium", "Tellurium", "Xenon",
    "Cesium", "Hafnium", "Thallium", "Polonium", "Astatine", "Protactinium", "Americium", "Berkelium",
    "Einsteinium", "Mendelevium", "Lawrencium", "Rutherfordium", "Seaborgium", "Bohrium", "Hassium",
    "Meitnerium", "Darmstadtium", "Roentgenium", "Copernicium", "Nihonium", "Flerovium", "Moscovium",
    "Livermorium", "Tennessine", "Oganesson", "Lead",
]
SPEECH_OVERRIDES = {}


# ---------------------------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------------------------
def position(z):
    """(period, group, f_index). group is None for the 15-wide f-block rows (IUPAC table layout)."""
    if z == 1: return 1, 1, None
    if z == 2: return 1, 18, None
    if z <= 4: return 2, z - 2, None
    if z <= 10: return 2, z + 8, None
    if z <= 12: return 3, z - 10, None
    if z <= 18: return 3, z, None
    if z <= 36: return 4, z - 18, None
    if z <= 54: return 5, z - 36, None
    if z <= 56: return 6, z - 54, None
    if z <= 71: return 6, None, z - 57
    if z <= 86: return 6, z - 68, None
    if z <= 88: return 7, z - 86, None
    if z <= 103: return 7, None, z - 89
    return 7, z - 100, None


def load_elements(path):
    els = []
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            z = int(row["AtomicNumber"])
            period, group, f_index = position(z)
            els.append({
                "z": z, "symbol": row["Symbol"], "name": row["Name"], "category": row["GroupBlock"],
                "state": row["StandardState"], "period": period, "group": group, "f_index": f_index,
            })
    els.sort(key=lambda e: e["z"])
    return els


def spoken_name(el):
    return SPEECH_OVERRIDES.get(el["name"], el["name"].lower())


def spoken_symbol(symbol):
    # "Na" would be read as a word. Upper-case letters with spaces are read as letter names.
    return " ".join(symbol.upper())


def fact_sentence(el):
    cat = el["category"].lower()
    where = ("Group %d, period %d." % (el["group"], el["period"])) if el["group"] else ("Period %d." % el["period"])
    name = spoken_name(el)
    return "%s. Symbol %s. Atomic number %d. %s. %s" % (
        name[0].upper() + name[1:], spoken_symbol(el["symbol"]), el["z"], cat[0].upper() + cat[1:], where)


# ---------------------------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------------------------
def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_str(h):
    return "rgb(%d, %d, %d)" % hex_rgb(h)


def darker(h, factor=0.55):
    return "#%02X%02X%02X" % tuple(int(c * factor) for c in hex_rgb(h))


def luminance(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex_rgb(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------------------------------------
# SVG tiles. Every tile is opaque (its own background), so it stays readable whatever symbol
# background or high-contrast setting the user has.
# ---------------------------------------------------------------------------------------------
def poly(points, **attrs):
    pts = " ".join("%.2f,%.2f" % p for p in points)
    extra = "".join(' %s="%s"' % (k.replace("_", "-"), v) for k, v in attrs.items())
    return '<polygon points="%s"%s/>' % (pts, extra)


def ngon(cx, cy, r, n, rot=-90):
    return [(cx + r * math.cos(math.radians(rot + i * 360.0 / n)), cy + r * math.sin(math.radians(rot + i * 360.0 / n)))
            for i in range(n)]


def marker(shape, cx, cy, r, color=TEXT):
    if shape == "circle":
        return '<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (cx, cy, r, color)
    if shape == "ring":
        return '<circle cx="%s" cy="%s" r="%.2f" fill="none" stroke="%s" stroke-width="%.2f"/>' % (cx, cy, r * 0.8, color, r * 0.4)
    if shape == "square":
        return '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="%s"/>' % (cx - r * 0.9, cy - r * 0.9, r * 1.8, r * 1.8, color)
    if shape == "diamond":
        return poly(ngon(cx, cy, r * 1.15, 4), fill=color)
    if shape == "tri_up":
        return poly(ngon(cx, cy + r * 0.15, r * 1.2, 3), fill=color)
    if shape == "tri_down":
        return poly(ngon(cx, cy - r * 0.15, r * 1.2, 3, rot=90), fill=color)
    if shape == "pentagon":
        return poly(ngon(cx, cy, r * 1.1, 5), fill=color)
    if shape == "hexagon":
        return poly(ngon(cx, cy, r * 1.1, 6, rot=0), fill=color)
    if shape == "star":
        outer, inner = ngon(cx, cy, r * 1.25, 5), ngon(cx, cy, r * 0.55, 5, rot=-54)
        return poly([p for pair in zip(outer, inner) for p in pair], fill=color)
    if shape == "plus":
        t = r * 0.42
        return ('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="%s"/><rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="%s"/>'
                % (cx - r, cy - t, 2 * r, 2 * t, color, cx - t, cy - r, 2 * t, 2 * r, color))
    raise ValueError(shape)


# ---------------------------------------------------------------------------------------------
# Board model
# ---------------------------------------------------------------------------------------------
class Images:
    def __init__(self, theme):
        import build_symbol_pack as sp   # the tile drawings live there; imported late, it imports this module
        self.files = {}
        self.theme = theme
        self.sp = sp
        self.bold, self.regular = sp.load_outliners()

    def add(self, image_id, svg):
        assert image_id not in self.files or self.files[image_id] == svg
        self.files[image_id] = svg
        return image_id

    def obf_entry(self, board_id, key):
        # One id per board per picture, all pointing at the same file. LingoLinq's importer
        # re-keys a picture after the first board that uses it, so an id shared between boards
        # only attaches on the first one.
        return {"id": "%s.%s" % (board_id, key), "width": 512, "height": 512, "content_type": "image/svg+xml",
                "path": "images/%s.svg" % key, "license": IMAGE_LICENSE}


class Board:
    def __init__(self, board_id, name, rows, cols, description, text_only=False):
        self.id, self.name, self.rows, self.cols = board_id, name, rows, cols
        self.description, self.text_only = description, text_only
        self.cells = [[None] * cols for _ in range(rows)]

    def put(self, row, col, button):
        assert self.cells[row][col] is None, "%s: cell %d,%d used twice" % (self.id, row, col)
        self.cells[row][col] = button

    def buttons(self):
        return [b for row in self.cells for b in row if b]

    def path(self):
        return "boards/%s.obf" % self.id

    def to_obf(self, images):
        order, buttons, used = [], [], []
        next_id = 1
        for row in self.cells:
            out_row = []
            for b in row:
                if b is None:
                    out_row.append(None)
                    continue
                btn = {"id": str(next_id), "label": b["label"],
                       "background_color": rgb_str(b["bg"]), "border_color": rgb_str(b["border"])}
                next_id += 1
                if b.get("image"):
                    btn["image_id"] = "%s.%s" % (self.id, b["image"])
                    if b["image"] not in used:
                        used.append(b["image"])
                if b.get("action"):
                    # "actions" (array) rather than "action" (string): LingoLinq reads either, and
                    # the OBF reference validator rejects any string "action".
                    btn["actions"] = [b["action"]]
                elif b.get("link"):
                    btn["load_board"] = {"id": b["link"], "name": b["link_name"], "path": "boards/%s.obf" % b["link"]}
                    # Stay on the linked board after each selection instead of auto-returning home.
                    btn["ext_lingolinq_home_lock"] = True
                else:
                    btn["vocalization"] = b["say"]
                if b.get("hide_label"):
                    btn["ext_lingolinq_hide_label"] = True
                if b.get("element"):
                    btn["ext_lingolinq_external_id"] = "element-%d" % b["element"]
                buttons.append(btn)
                out_row.append(btn["id"])
            order.append(out_row)
        return {
            "format": FORMAT, "id": self.id, "locale": "en", "name": self.name,
            "description_html": self.description, "default_layout": "landscape", "license": LICENSE,
            "buttons": buttons, "grid": {"rows": self.rows, "columns": self.cols, "order": order},
            "images": [images.obf_entry(self.id, i) for i in used], "sounds": [],
            "ext_lingolinq_settings": {
                "private": True, "key": "lingolinq/%s" % self.id, "word_suggestions": False,
                "protected": False, "home_board": False, "categories": [],
                "text_only": self.text_only, "hide_empty": True,
            },
        }


def element_button(el, images, facts=False, hide_label=False):
    c = CAT[el["category"]]
    return {"label": el["name"], "say": fact_sentence(el) if facts else spoken_name(el),
            "bg": c["bg"], "border": darker(c["bg"]), "element": el["z"], "hide_label": hide_label,
            "image": images.add("el-%03d" % el["z"], images.sp.element_tile(images.theme, el, images.bold, images.regular, False))}


def link_button(label, target, target_name, image=None, bg=NAV_BG, border=NAV_BORDER, hide_label=False):
    return {"label": label, "link": target, "link_name": target_name, "bg": bg, "border": border,
            "image": image, "hide_label": hide_label}


def word_button(label, say=None, bg=NEUTRAL_BG, border="#59606B", image=None):
    return {"label": label, "say": say or label, "bg": bg, "border": border, "image": image}


def build(elements, theme="regular"):
    images = Images(theme)
    sp, bold, regular = images.sp, images.bold, images.regular
    boards = {}
    names = {}

    def new_board(board_id, name, rows, cols, description, text_only=False):
        b = Board(board_id, name, rows, cols, description, text_only)
        boards[board_id] = b
        names[board_id] = name
        return b

    ico = {k: images.add("icon-%s" % k, sp.icon_tile(theme, k, label, bold)) for k, label in sp.ICONS}

    def nav(board, twin=None, twin_is_facts=None):
        """Bottom row, same corners on every board: menu + back on the left, words + talk on the right."""
        r, last = board.rows - 1, board.cols - 1
        if board.id != "periodic-table":
            board.put(r, 0, link_button("Menu", "periodic-table", "Periodic Table", ico["menu"]))
        board.put(r, 1, {"label": "Back", "action": ":back", "bg": NAV_BG, "border": NAV_BORDER, "image": ico["back"]})
        if twin:
            label, icon = ("Facts", ico["facts"]) if twin_is_facts else ("Names", ico["names"])
            board.put(r, last - 2, link_button(label, twin, None, icon))
        if board.id != "periodic-table-words":
            board.put(r, last - 1, link_button("Words", "periodic-table-words", "Periodic Table: Science Words", ico["words"]))
        if board.id != "periodic-table-talk":
            board.put(r, last, link_button("Talk", "periodic-table-talk", "Periodic Table: Class Talk", ico["talk"]))

    lan_tile = images.add("range-lanthanides", sp.range_tile(theme, "Lanthanide", "57\u201371", "La\u2013Lu", bold, regular))
    act_tile = images.add("range-actinides", sp.range_tile(theme, "Actinide", "89\u2013103", "Ac\u2013Lr", bold, regular))
    main_groups = [1, 2, 13, 14, 15, 16, 17, 18]

    def f_links(board, row6, row7, col, f_board, hide_label):
        lc, ac = CAT["Lanthanide"], CAT["Actinide"]
        board.put(row6, col, link_button("Lanthanides", f_board, None, lan_tile, lc["bg"], darker(lc["bg"]), hide_label))
        board.put(row7, col, link_button("Actinides", f_board, None, act_tile, ac["bg"], darker(ac["bg"]), hide_label))

    # Category boards (the three block-shaped categories reuse the block boards below).
    cat_target = {}
    for key, c in CAT.items():
        if key == "Transition metal":
            cat_target[key] = "periodic-table-transition-metals"
        elif key in ("Lanthanide", "Actinide"):
            cat_target[key] = "periodic-table-lanthanides-actinides"
        else:
            cat_target[key] = "periodic-table-%s" % c["slug"]

    # The five layout boards, each in a "names" and a "facts" version with identical positions.
    for facts in (False, True):
        sfx = "-facts" if facts else ""
        tag = " (facts)" if facts else ""
        mode = ("Each element says a fact sentence: name, symbol, atomic number, category, group and period."
                if facts else "Each element says its name.")

        def twin_of(base):
            return base if facts else base + "-facts"

        f_board = "periodic-table-lanthanides-actinides" + sfx

        # Full table: 18 groups x 7 periods in true positions, legend in the gap above the d-block.
        b = new_board("periodic-table-full" + sfx, "Periodic Table: Full Table" + tag, 8, 18,
                      "The main body of the periodic table in its true layout. " + mode)
        for el in elements:
            if el["group"]:
                b.put(el["period"] - 1, el["group"] - 1, element_button(el, images, facts, hide_label=True))
        f_links(b, 5, 6, 2, f_board, True)
        for i, (key, _slug, _plural, short, bg, _shape) in enumerate(CATEGORIES):
            b.put(1, 2 + i, link_button(short, cat_target[key], None, images.add("legend-%s" % CAT[key]["slug"], sp.family_tile(theme, key)),
                                        bg, darker(bg), True))
        nav(b, twin_of("periodic-table-full"), not facts)

        # Elements 1-20: the middle school set, large targets, true positions.
        b = new_board("periodic-table-first-20" + sfx, "Periodic Table: Elements 1–20" + tag, 5, 8,
                      "Hydrogen through calcium in their true positions. " + mode)
        for el in elements[:20]:
            b.put(el["period"] - 1, main_groups.index(el["group"]), element_button(el, images, facts))
        nav(b, twin_of("periodic-table-first-20"), not facts)

        # Main groups: groups 1, 2 and 13-18, all seven periods.
        b = new_board("periodic-table-main-groups" + sfx, "Periodic Table: Main Groups" + tag, 8, 8,
                      "Groups 1, 2 and 13 to 18 in their true positions. " + mode)
        for el in elements:
            if el["group"] in main_groups:
                b.put(el["period"] - 1, main_groups.index(el["group"]), element_button(el, images, facts))
        nav(b, twin_of("periodic-table-main-groups"), not facts)

        # Transition metals: groups 3-12, periods 4-7.
        b = new_board("periodic-table-transition-metals" + sfx, "Periodic Table: Transition Metals" + tag, 5, 10,
                      "Groups 3 to 12 in their true positions. " + mode)
        for el in elements:
            if el["group"] and 3 <= el["group"] <= 12:
                b.put(el["period"] - 4, el["group"] - 3, element_button(el, images, facts))
        f_links(b, 2, 3, 0, f_board, False)
        nav(b, twin_of("periodic-table-transition-metals"), not facts)

        # Lanthanides and actinides: two rows of 15, as drawn under the main table.
        b = new_board(f_board, "Periodic Table: Lanthanides and Actinides" + tag, 3, 15,
                      "Elements 57 to 71 and 89 to 103. " + mode)
        for el in elements:
            if el["f_index"] is not None:
                b.put(el["period"] - 6, el["f_index"], element_button(el, images, facts))
        nav(b, twin_of("periodic-table-lanthanides-actinides"), not facts)

    # Family boards: one category at a time, four across, in atomic-number order.
    for key, c in CAT.items():
        if cat_target[key] != "periodic-table-%s" % c["slug"]:
            continue
        members = [e for e in elements if e["category"] == key]
        rows = int(math.ceil(len(members) / 4.0))
        b = new_board(cat_target[key], "Periodic Table: %s" % c["plural"], rows + 1, 4,
                      "%s in atomic-number order. Each element says its name." % c["plural"])
        for i, el in enumerate(members):
            b.put(i // 4, i % 4, element_button(el, images))
        nav(b)

    # Science words: single words to build answers with.
    rows_words = [
        ("#DCEBFF", ["atom", "proton", "neutron", "electron", "nucleus", "electron shell", "valence electrons", "energy level"]),
        ("#FFF1C9", ["element", "symbol", "atomic number", "atomic mass", "group", "period", "row", "column"]),
        ("#DDF3D6", ["metal", "nonmetal", "metalloid", "solid", "liquid", "gas", "reactive", "stable"]),
        ("#F6DCF5", ["charge", "positive", "negative", "neutral", "ion", "isotope", "bond", "compound"]),
        ("#FFFFFF", ["0", "1", "2", "3", "4", "5", "6", "7"]),
        ("#FFFFFF", ["8", "9", "plus", "minus", "equals", "more", "less", "the same"]),
        ("#ECECEC", ["it is", "it is a", "it has", "it is in", "and", "not", "how many", "because"]),
    ]
    b = new_board("periodic-table-words", "Periodic Table: Science Words", 8, 8,
                  "Atom parts, table words, properties, charge and bonding words, numbers and a few connecting words.", text_only=True)
    for r, (bg, words) in enumerate(rows_words):
        for c, w in enumerate(words):
            b.put(r, c, word_button(w, bg=bg, border=darker(bg)))
    nav(b)

    # Class talk: whole phrases for asking, repairing and joining in.
    rows_talk = [
        ("#DCEBFF", ["Which element is that?", "What is the symbol?", "What is the atomic number?", "Can you show me on the table?"]),
        ("#DDF3D6", ["What group is it in?", "What period is it in?", "Is it a metal?", "Is it reactive?"]),
        ("#DDF3D6", ["How many valence electrons?", "What is it used for?", "Is it a solid, liquid, or gas?", "What does it bond with?"]),
        ("#FFF1C9", ["Can you repeat that?", "Can you repeat the symbol?", "Can you go back?", "Please slow down."]),
        ("#F6DCF5", ["I have a question.", "I know the answer.", "I don't understand.", "I need more time."]),
        ("#F6DCF5", ["I think it is", "I agree.", "I disagree.", "Let me find it."]),
    ]
    b = new_board("periodic-table-talk", "Periodic Table: Class Talk", 7, 4,
                  "Whole phrases for science class: asking about an element, asking for a repeat, and joining the discussion.", text_only=True)
    for r, (bg, phrases) in enumerate(rows_talk):
        for c, p in enumerate(phrases):
            # Labels clip at one line in Speak Mode, so two long phrases get a shorter label.
            short = {"Can you show me on the table?": "Show me on the table?",
                     "How many valence electrons?": "Valence electrons?"}.get(p, p)
            b.put(r, c, word_button(short, p, bg=bg, border=darker(bg)))
    nav(b)

    # Common compounds: formula on the tile, name as the label.
    S, N = True, False
    compounds = [
        ("Water", "water. H 2 O.", [("H", N), ("2", S), ("O", N)]),
        ("Carbon dioxide", "carbon dioxide. C O 2.", [("CO", N), ("2", S)]),
        ("Oxygen gas", "oxygen gas. O 2.", [("O", N), ("2", S)]),
        ("Hydrogen gas", "hydrogen gas. H 2.", [("H", N), ("2", S)]),
        ("Nitrogen gas", "nitrogen gas. N 2.", [("N", N), ("2", S)]),
        ("Table salt", "table salt, sodium chloride. N A, C L.", [("NaCl", N)]),
        ("Methane", "methane. C, H 4.", [("CH", N), ("4", S)]),
        ("Ammonia", "ammonia. N, H 3.", [("NH", N), ("3", S)]),
        ("Glucose", "glucose. C 6, H 12, O 6.", [("C", N), ("6", S), ("H", N), ("12", S), ("O", N), ("6", S)]),
        ("Hydrochloric acid", "hydrochloric acid. H, C L.", [("HCl", N)]),
        ("Sulfuric acid", "sulfuric acid. H 2, S, O 4.", [("H", N), ("2", S), ("SO", N), ("4", S)]),
        ("Sodium hydroxide", "sodium hydroxide. N A, O, H.", [("NaOH", N)]),
        ("Calcium carbonate", "calcium carbonate. C A, C, O 3.", [("CaCO", N), ("3", S)]),
        ("Hydrogen peroxide", "hydrogen peroxide. H 2, O 2.", [("H", N), ("2", S), ("O", N), ("2", S)]),
        ("Carbon monoxide", "carbon monoxide. C O.", [("CO", N)]),
        ("Ozone", "ozone. O 3.", [("O", N), ("3", S)]),
        ("Baking soda", "baking soda, sodium bicarbonate. N A, H, C, O 3.", [("NaHCO", N), ("3", S)]),
        ("Rust", "rust, iron oxide. F E 2, O 3.", [("Fe", N), ("2", S), ("O", N), ("3", S)]),
        ("Sand", "sand, silicon dioxide. S I, O 2.", [("SiO", N), ("2", S)]),
        ("Ethanol", "ethanol. C 2, H 5, O H.", [("C", N), ("2", S), ("H", N), ("5", S), ("OH", N)]),
    ]
    b = new_board("periodic-table-compounds", "Periodic Table: Common Compounds", 5, 5,
                  "Twenty compounds that come up in middle and high school science. Each says its name, then its formula.")
    for i, (label, say, tokens) in enumerate(compounds):
        slug = label.lower().replace(" ", "-")
        b.put(i // 5, i % 5, word_button(label, say, image=images.add("compound-%s" % slug, sp.formula_tile(theme, label, tokens, bold))))
    nav(b)

    # Menu board (the root of the package).
    hub = new_board("periodic-table", "Periodic Table", 3, 7,
                    "Start here. Top row: the table by layout. Second row: element families. Bottom row: navigation, science words and class talk.")
    all_main = {e["z"] for e in elements if e["group"]}
    views = [
        ("Full table", "periodic-table-full", all_main),
        ("Elements 1–20", "periodic-table-first-20", set(range(1, 21))),
        ("Main groups", "periodic-table-main-groups", {e["z"] for e in elements if e["group"] in main_groups}),
        ("Transition metals", "periodic-table-transition-metals", {e["z"] for e in elements if e["group"] and 3 <= e["group"] <= 12}),
        ("Lanthanides and actinides", "periodic-table-lanthanides-actinides", {e["z"] for e in elements if e["f_index"] is not None}),
    ]
    for c, (label, target, zs) in enumerate(views):
        hub.put(0, c, link_button(label, target, None, images.add("map-%s" % target, sp.map_tile(theme, elements, zs, label)), NEUTRAL_BG, "#59606B"))
    hub.put(0, 6, link_button("Compounds", "periodic-table-compounds", None,
                              images.add("compound-water", sp.formula_tile(theme, "Water", [("H", N), ("2", S), ("O", N)], bold)), NEUTRAL_BG, "#59606B"))
    col = 0
    for key, c in CAT.items():
        if cat_target[key] != "periodic-table-%s" % c["slug"]:
            continue
        zs = {e["z"] for e in elements if e["category"] == key}
        hub.put(1, col, link_button(c["plural"], cat_target[key], None,
                                    images.add("map-%s" % cat_target[key], sp.map_tile(theme, elements, zs, c["plural"])), c["bg"], darker(c["bg"])))
        col += 1
    nav(hub)

    # Everything above is written with the regular ids, names and colors. Derive this theme's.
    t = THEMES[theme]
    rid = lambda i: t["root"] + i[len("periodic-table"):]
    rname = lambda n: t["title"] if n == "Periodic Table" else t["prefix"] + n[len("Periodic Table:"):]
    family_fills = {c[4] for c in CATEGORIES}
    renamed = {}
    for b in boards.values():
        b.id, b.name = rid(b.id), rname(b.name)
        renamed[b.id] = b
        for btn in b.buttons():
            if btn.get("link"):
                btn["link"] = rid(btn["link"])
            if theme == "high-contrast":
                old = btn["bg"]
                btn["bg"] = HC_ROW_TINTS.get(old, "#000000") if b.text_only and not btn.get("image") else "#000000"
                btn["border"] = old if old in family_fills else "#FFFFFF"
    for b in renamed.values():
        for btn in b.buttons():
            if btn.get("link"):
                btn["link_name"] = renamed[btn["link"]].name
    return renamed, images


# ---------------------------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------------------------
def validate(elements, boards, images, obfs, theme="regular"):
    problems, lines = [], []
    root = THEMES[theme]["root"]
    R = lambda i: root + i[14:]   # 14 = len of the regular root id

    def check(ok, msg):
        lines.append(("PASS  " if ok else "FAIL  ") + msg)
        if not ok:
            problems.append(msg)

    zs = [e["z"] for e in elements]
    check(zs == list(range(1, 119)), "dataset has exactly 118 elements, atomic numbers 1 to 118, no gaps or duplicates")
    check(len({e["symbol"] for e in elements}) == 118 and len({e["name"] for e in elements}) == 118, "118 unique symbols and 118 unique names")
    check(all(e["category"] in CAT for e in elements), "every element has one of the 10 known categories")

    def coverage(ids):
        seen = []
        for i in ids:
            seen += [b["element"] for b in boards[i].buttons() if b.get("element")]
        return seen

    layout = [R("periodic-table-full"), R("periodic-table-lanthanides-actinides")]
    seen = coverage(layout)
    check(sorted(seen) == list(range(1, 119)), "full table + lanthanides/actinides boards together hold each of the 118 elements exactly once")
    seen = coverage([i + "-facts" for i in layout])
    check(sorted(seen) == list(range(1, 119)), "the facts versions of those boards also hold each of the 118 elements exactly once")
    zoom = [R("periodic-table-main-groups"), R("periodic-table-transition-metals"), R("periodic-table-lanthanides-actinides")]
    check(sorted(coverage(zoom)) == list(range(1, 119)), "the three large-target block boards together hold each of the 118 elements exactly once")
    fam = [b.id for b in boards.values() if b.cols == 4 and b.id != R("periodic-table-talk")] + \
          [R("periodic-table-transition-metals"), R("periodic-table-lanthanides-actinides")]
    check(sorted(coverage(fam)) == list(range(1, 119)), "the family boards together hold each of the 118 elements exactly once")
    check(sorted(coverage([R("periodic-table-first-20")])) == list(range(1, 21)), "Elements 1-20 board holds elements 1 to 20 exactly once")

    # True-position check on the full table.
    ok = True
    full = boards[R("periodic-table-full")]
    for r in range(7):
        for c in range(18):
            b = full.cells[r][c]
            if b and b.get("element"):
                el = elements[b["element"] - 1]
                ok = ok and (el["period"] == r + 1 and el["group"] == c + 1)
    check(ok, "every element on the full table sits at row = period, column = group")

    ids = set(boards)
    for b in boards.values():
        n = len(b.buttons())
        check(n <= MAX_BUTTONS, "%s: %d buttons (limit %d), grid %dx%d" % (b.id, n, MAX_BUTTONS, b.rows, b.cols))
    bad_links = [(b.id, x["label"], x["link"]) for b in boards.values() for x in b.buttons() if x.get("link") and x["link"] not in ids]
    check(not bad_links, "every link button points at a board in the package (%d links)" %
          sum(1 for b in boards.values() for x in b.buttons() if x.get("link")))

    # Reachability from the root, the way the importer walks the package.
    reach, todo = set(), [R("periodic-table")]
    while todo:
        cur = todo.pop()
        if cur in reach:
            continue
        reach.add(cur)
        todo += [x["link"] for x in boards[cur].buttons() if x.get("link")]
    check(reach == ids, "all %d boards are reachable from the menu board" % len(ids))
    back_ok = all(any(x.get("link") == R("periodic-table") for x in b.buttons()) for b in boards.values() if b.id != R("periodic-table"))
    check(back_ok, "every board has a Table menu button back to the menu board")

    # Fixed navigation corners.
    ok = True
    for b in boards.values():
        r = b.rows - 1
        back = b.cells[r][1]
        ok = ok and back is not None and back.get("action") == ":back"
        if b.id != R("periodic-table"):
            ok = ok and b.cells[r][0] is not None and b.cells[r][0].get("link") == R("periodic-table")
        if b.id != R("periodic-table-talk"):
            ok = ok and b.cells[r][b.cols - 1] is not None and b.cells[r][b.cols - 1].get("link") == R("periodic-table-talk")
        if b.id != R("periodic-table-words"):
            ok = ok and b.cells[r][b.cols - 2] is not None and b.cells[r][b.cols - 2].get("link") == R("periodic-table-words")
    check(ok, "navigation is in the same corners on every board (menu and back bottom-left, words and talk bottom-right)")

    ok_color = ok_say = ok_label = ok_img = True
    worst = 99.0
    for o in obfs.values():
        img_ids = {i["id"] for i in o["images"]}
        for btn in o["buttons"]:
            ok_color = ok_color and btn.get("background_color", "").startswith("rgb(") and btn.get("border_color", "").startswith("rgb(")
            ok_label = ok_label and bool(btn.get("label"))
            ok_say = ok_say and bool(btn.get("vocalization") or btn.get("actions") or btn.get("load_board"))
            ok_img = ok_img and (("image_id" not in btn) or btn["image_id"] in img_ids)
    for b in boards.values():
        for x in b.buttons():
            # LingoLinq writes the label in black or white, whichever reads better on the button color.
            worst = min(worst, max(contrast("#000000", x["bg"]), contrast("#FFFFFF", x["bg"])))
    check(ok_color, "every button has a background color and a border color")
    check(ok_label, "every button has a label")
    check(ok_say, "every button has something to do: a vocalization, an action or a link")
    check(all(o["buttons"] and all(b.get("vocalization") for b in o["buttons"] if "ext_lingolinq_external_id" in b) for o in obfs.values() if any("ext_lingolinq_external_id" in b for b in o["buttons"])),
          "every element button has a non-empty vocalization")
    check(ok_img, "every image a button uses is listed on its board")
    check(worst >= 7.0, "label contrast is WCAG AAA on every button color (lowest ratio %.1f:1, need 7:1)" % worst)
    all_ids = [im["id"] for o in obfs.values() for im in o["images"]]
    check(len(all_ids) == len(set(all_ids)), "no picture id is shared between boards (%d ids, %d files)" % (len(all_ids), len(images.files)))
    fills = [c[4] for c in CATEGORIES] + ([NEUTRAL_BG, NAV_BG] if theme == "regular" else ["#000000"])
    check(all(max(hex_rgb(f)) <= 229 for f in fills), "every tile fill stays at or below 229 per channel, under the app's symbol filter threshold")
    check(not any("<text" in f or "font-family" in f for f in images.files.values()), "no live text in any picture: every letter is an outline")
    check(len({c[5] for c in CATEGORIES}) == 10 and len({c[4] for c in CATEGORIES}) == 10, "10 categories, each with its own color and its own shape marker")
    return problems, lines


# ---------------------------------------------------------------------------------------------
# Packaging
# ---------------------------------------------------------------------------------------------
def write_obz(path, boards, images, obfs, root):
    manifest = {"format": FORMAT, "root": boards[root].path(),
                "paths": {"boards": {i: boards[i].path() for i in sorted(boards)},
                          "images": {im["id"]: im["path"] for i in sorted(boards) for im in obfs[i]["images"]},
                          "sounds": {}}}
    entries = [("manifest.json", json.dumps(manifest, sort_keys=True, separators=(",", ":")))]
    entries += [(boards[i].path(), json.dumps(obfs[i], ensure_ascii=False, separators=(",", ":"))) for i in sorted(boards)]
    entries += [("images/%s.svg" % i, images.files[i]) for i in sorted(images.files)]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, content.encode("utf-8"))
    with open(path, "wb") as fh:
        fh.write(buf.getvalue())
    return hashlib.sha256(buf.getvalue()).hexdigest(), len(buf.getvalue())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data", default=os.path.join(HERE, "elements_pubchem.csv"))
    ap.add_argument("--out", default=os.path.join(os.getcwd(), "output", "periodic_table"))
    args = ap.parse_args()

    elements = load_elements(args.data)
    os.makedirs(args.out, exist_ok=True)
    summary, board_map, failed = [], [], 0
    for theme, t in THEMES.items():
        boards, images = build(elements, theme)
        obfs = {i: b.to_obf(images) for i, b in boards.items()}
        problems, lines = validate(elements, boards, images, obfs, theme)
        failed += len(problems)
        digest, size = write_obz(os.path.join(args.out, t["file"]), boards, images, obfs, t["root"])
        for i in sorted(boards, key=lambda k: (k != t["root"], k)):
            b = boards[i]
            btns = b.buttons()
            board_map.append({"set": theme, "id": i, "name": b.name, "rows": b.rows, "columns": b.cols, "buttons": len(btns),
                              "elements": sum(1 for x in btns if x.get("element")),
                              "links": sorted({x["link"] for x in btns if x.get("link")})})
        summary += ["%s: %d boards, %d picture files, %d buttons" % (t["title"], len(boards), len(images.files),
                                                                      sum(len(b.buttons()) for b in boards.values())),
                    "%s: %d bytes, sha256 %s" % (t["file"], size, digest), ""] + lines + [""]
    with open(os.path.join(args.out, "board_map.json"), "w", encoding="utf-8") as fh:
        json.dump(board_map, fh, indent=1)
    with open(os.path.join(args.out, "elements_speech.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["atomic_number", "symbol", "label", "category", "group", "period", "says_names_mode", "says_facts_mode", "tts_review"])
        for e in elements:
            w.writerow([e["z"], e["symbol"], e["name"], e["category"], e["group"] or "", e["period"],
                        spoken_name(e), fact_sentence(e), "yes" if e["name"] in TTS_REVIEW else ""])
    summary += ["RESULT: %s" % ("all checks passed" if not failed else "%d check(s) FAILED" % failed)]
    with open(os.path.join(args.out, "validation_report.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(summary) + "\n")
    print("\n".join(summary))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
