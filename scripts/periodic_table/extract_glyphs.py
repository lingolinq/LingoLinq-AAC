#!/usr/bin/env python3
"""One-off: read the Atkinson Hyperlegible font files and write the letter shapes the symbols need
to atkinson_glyphs.json, so the builders need no font file and no extra library.

    pip install fonttools
    python3 scripts/periodic_table/extract_glyphs.py path/to/fonts

Font: Atkinson Hyperlegible, copyright 2020 Braille Institute of America, Inc., SIL Open Font
License 1.1. Only outlines for A-Z, a-z, 0-9 and the en dash are kept.
"""
import json, os, sys
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

CHARS = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + [chr(c) for c in range(ord("a"), ord("z") + 1)] + \
        [str(d) for d in range(10)] + ["–"]


class SegPen(BasePen):
    """Records move/line/quadratic/close with explicit points (components and implied points resolved)."""
    def __init__(self, glyphset):
        BasePen.__init__(self, glyphset)
        self.segs = []

    def _n(self, v):
        return int(v) if float(v).is_integer() else float(v)

    def _moveTo(self, p): self.segs.append(["M", self._n(p[0]), self._n(p[1])])
    def _lineTo(self, p): self.segs.append(["L", self._n(p[0]), self._n(p[1])])
    def _qCurveToOne(self, c, p): self.segs.append(["Q", self._n(c[0]), self._n(c[1]), self._n(p[0]), self._n(p[1])])
    def _curveToOne(self, a, b, p): raise ValueError("cubic outline not expected in a TrueType font")
    def _closePath(self): self.segs.append(["Z"])


def extract(path):
    font = TTFont(path)
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    out = {}
    for ch in CHARS:
        name = cmap[ord(ch)]
        pen = SegPen(gs)
        gs[name].draw(pen)
        out[ch] = {"adv": hmtx[name][0], "d": pen.segs}
    return int(font["head"].unitsPerEm), out


folder = sys.argv[1]
upm, bold = extract(os.path.join(folder, "AtkinsonHyperlegible-Bold.ttf"))
upm2, regular = extract(os.path.join(folder, "AtkinsonHyperlegible-Regular.ttf"))
assert upm == upm2
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atkinson_glyphs.json")
json.dump({"font": "Atkinson Hyperlegible", "license": "SIL Open Font License 1.1, copyright 2020 Braille Institute of America, Inc.",
           "upm": upm, "bold": bold, "regular": regular}, open(dst, "w"), separators=(",", ":"), ensure_ascii=True, sort_keys=True)
print(dst, os.path.getsize(dst))
