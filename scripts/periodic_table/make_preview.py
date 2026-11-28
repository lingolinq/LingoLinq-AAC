#!/usr/bin/env python3
"""Build a single self-contained preview.html from the .obz, so the layout can be looked at
without importing. Approximates LingoLinq's grid (picture above label); it is not the app.
    python3 scripts/periodic_table/make_preview.py output/periodic_table/periodic-table.obz
    python3 scripts/periodic_table/make_preview.py <package.obz> <output.html>     # optional output path
"""
import base64, html, json, os, sys, zipfile

obz = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(obz), "preview.html")
zf = zipfile.ZipFile(obz)
manifest = json.loads(zf.read("manifest.json"))
boards = {i: json.loads(zf.read(p)) for i, p in manifest["paths"]["boards"].items()}
imgs = {i: "data:image/svg+xml;base64," + base64.b64encode(zf.read(p)).decode() for i, p in manifest["paths"]["images"].items()}
order = [manifest["root"].split("/")[-1][:-4]] + sorted(i for i in boards if "boards/%s.obf" % i != manifest["root"])

def ink(rgb):
    """Black or white label, whichever reads better on the button color (the app does the same)."""
    r, g, bl = [int(v) for v in rgb[rgb.index("(") + 1:rgb.index(")")].split(",")[:3]]
    lin = [v / 255 / 12.92 if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4 for v in (r, g, bl)]
    lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    return "#fff" if 1.05 / (lum + 0.05) > (lum + 0.05) / 0.05 else "#000"


css = """
body{font-family:Arial,Helvetica,sans-serif;margin:0;padding-bottom:48px;background:#f4f5f7;color:#111}
nav{background:#fff;border-bottom:1px solid #ccd;padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;z-index:5}
nav a{font-size:13px;padding:4px 8px;border:1px solid #99a;border-radius:6px;text-decoration:none;color:#111;background:#fff}
section{padding:16px 12px 28px} h2{margin:0 0 4px;font-size:18px} p.d{margin:0 0 10px;font-size:13px;color:#333}
.grid{display:grid;gap:4px;width:100%;max-width:1240px;aspect-ratio:16/9.2;background:#fff;padding:6px;box-sizing:border-box;border:1px solid #ccd;border-radius:8px}
.b{border:2px solid;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;min-width:0;min-height:0;text-decoration:none;color:#111;cursor:pointer}
.b img{flex:1 1 0;min-height:0;max-width:100%;object-fit:contain}
.b span{font-size:14px;line-height:1.1;text-align:center;padding:1px 2px;overflow:hidden;max-width:100%;overflow-wrap:anywhere}
.b.t span{font-size:clamp(14px,1.6vw,22px);font-weight:700;padding:4px}
.b.h span{display:none} .e{visibility:hidden}
#say{position:fixed;bottom:0;left:0;right:0;background:#111;color:#fff;padding:8px 12px;font-size:15px;min-height:20px}
"""
parts = ["<!doctype html><meta charset='utf-8'><title>%s preview</title><style>%s</style><nav>" % (html.escape(boards[order[0]]["name"]), css)]
for i in order:
    parts.append("<a href='#%s'>%s</a>" % (i, html.escape(boards[i]["name"].replace("Periodic Table: ", "").replace("Periodic Table HC: ", ""))))
parts.append("</nav>")
for i in order:
    b = boards[i]
    btn = {x["id"]: x for x in b["buttons"]}
    parts.append("<section id='%s'><h2>%s</h2><p class='d'>%s &middot; %d x %d grid &middot; %d buttons</p>" % (
        i, html.escape(b["name"]), html.escape(b["description_html"]), b["grid"]["rows"], b["grid"]["columns"], len(b["buttons"])))
    parts.append("<div class='grid' style='grid-template-columns:repeat(%d,minmax(0,1fr));grid-template-rows:repeat(%d,minmax(0,1fr))'>" % (
        b["grid"]["columns"], b["grid"]["rows"]))
    for row in b["grid"]["order"]:
        for bid in row:
            if bid is None:
                parts.append("<div class='e'></div>")
                continue
            x = btn[bid]
            cls = "b" + (" h" if x.get("ext_lingolinq_hide_label") else "") + ("" if x.get("image_id") else " t")
            style = "background:%s;border-color:%s;color:%s" % (x["background_color"], x["border_color"], ink(x["background_color"]))
            img = "<img alt='' src='%s'>" % imgs[x["image_id"]] if x.get("image_id") else ""
            label = "<span>%s</span>" % html.escape(x["label"])
            if x.get("load_board"):
                parts.append("<a class='%s' style='%s' href='#%s' title='opens %s'>%s%s</a>" % (
                    cls, style, x["load_board"]["id"], html.escape(x["load_board"]["name"]), img, label))
            else:
                say = x.get("vocalization") or "(%s)" % ", ".join(x.get("actions", []))
                parts.append("<div class='%s' style='%s' data-say='%s' title='%s'>%s%s</div>" % (
                    cls, style, html.escape(say, quote=True), html.escape(say, quote=True), img, label))
    parts.append("</div></section>")
parts.append("<div id='say'>Click a button to see what it says. Link buttons jump to their board.</div>")
parts.append("<script>document.addEventListener('click',function(e){var b=e.target.closest('[data-say]');if(b){document.getElementById('say').textContent='Says: '+b.dataset.say;}});</script>")
open(out, "w", encoding="utf-8").write("".join(parts))
print(out, os.path.getsize(out))
