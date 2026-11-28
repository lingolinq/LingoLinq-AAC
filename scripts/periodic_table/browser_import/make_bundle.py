#!/usr/bin/env python3
"""Refresh the files the in-browser import needs, from the two built .obz packages.

    python3 scripts/periodic_table/browser_import/make_bundle.py

Writes, next to this script:
  expected.json       per-file SHA-256 of everything inside each .obz, plus one combined hash per set
  bundle.js           ptgen.js + ptzip.js + driver.js, the code that runs in the page
  bundle_chunks.json  bundle.js gzipped, base64 encoded and cut into pieces small enough to paste,
                      each with the first 10 hex digits of its SHA-256 so a bad paste is caught
  glyph_chunks.json   the same for glyph_subset.json

Standard library only. See README.md in this folder for how the pieces are used.
"""
import base64, gzip, hashlib, json, os, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "output", "periodic_table")
SETS = {"regular": "periodic-table.obz", "high-contrast": "periodic-table-high-contrast.obz"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def chunks(raw, pieces):
    b64 = base64.b64encode(gzip.compress(raw, 9, mtime=0)).decode()
    size = -(-len(b64) // pieces)
    parts = [b64[i:i + size] for i in range(0, len(b64), size)]
    return {"sha256": sha(raw), "chunks": [[c, sha(c.encode())[:10]] for c in parts]}


def main():
    expected = {}
    for theme, name in SETS.items():
        with zipfile.ZipFile(os.path.join(OUT, name)) as zf:
            files = {n: sha(zf.read(n)) for n in sorted(zf.namelist())}
        combined = sha("".join("%s:%s\n" % (n, h) for n, h in sorted(files.items())).encode())
        expected[theme] = {"count": len(files), "all": combined, "obz": name, "files": files}
        print(theme, len(files), "files, combined", combined)
    with open(os.path.join(HERE, "expected.json"), "w", encoding="utf-8") as fh:
        json.dump(expected, fh)

    code = "\n".join(open(os.path.join(HERE, n), encoding="utf-8").read() for n in ("ptgen.js", "ptzip.js", "driver.js"))
    with open(os.path.join(HERE, "bundle.js"), "w", encoding="utf-8") as fh:
        fh.write(code)
    with open(os.path.join(HERE, "bundle_chunks.json"), "w", encoding="utf-8") as fh:
        json.dump(chunks(code.encode(), 6), fh)
    glyphs = open(os.path.join(HERE, "glyph_subset.json"), "rb").read()
    with open(os.path.join(HERE, "glyph_chunks.json"), "w", encoding="utf-8") as fh:
        json.dump(chunks(glyphs, 8), fh)
    print("bundle.js", len(code), "bytes, sha256", sha(code.encode()))
    print("glyph_subset.json", len(glyphs), "bytes, sha256", sha(glyphs))


if __name__ == "__main__":
    main()
