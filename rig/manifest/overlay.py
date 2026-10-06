#!/usr/bin/env python3
"""Overlay a generated manifest page on the reference CWY PAX Manifest.pdf and report the largest positional difference.

    python3 rig/manifest/overlay.py <reference.pdf> <ours.pdf> [--out dir] [--dpi 300]

Compares, in points:
  - every text span of the reference (start x, baseline, end x) with the same string in ours,
  - every ruled edge: the reference draws each cell's borders as filled 1-unit rectangles; both PDFs' rectangles are
    reduced to horizontal and vertical rules and matched edge for edge,
  - the logo's ink box (rendered at --dpi; the reference logo is a JPEG, ours is vector),
and writes overlay.png (reference in red, ours in blue, both = black) and diff.png at the same DPI.
Needs PyMuPDF (pip install pymupdf). Prints one summary line: "largest difference: X pt (what)".
"""
import sys, json, argparse
import pymupdf as fitz

ap = argparse.ArgumentParser()
ap.add_argument("ref"); ap.add_argument("ours")
ap.add_argument("--out", default="."); ap.add_argument("--dpi", type=int, default=300)
ap.add_argument("--page", type=int, default=0)
a = ap.parse_args()

ref = fitz.open(a.ref)[0]
ours = fitz.open(a.ours)[a.page]

def spans(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            for s in l["spans"]:
                out.append({"text": s["text"], "font": s["font"], "size": s["size"], "x": s["origin"][0], "y": s["origin"][1], "end": s["bbox"][2]})
    return out

def rules(page):
    """Filled rectangles → set of (orientation, position, start, end) rules, merged when collinear and touching."""
    hs, vs = [], []
    for d in page.get_drawings():
        if d.get("fill") is None: continue
        # A rule is any filled shape at most 1.5 pt thick, whatever operators drew it ("re", or m/l/l/l/h).
        rects = [it[1] for it in d["items"] if it[0] == "re"] or [d["rect"]]
        for r in rects:
            if min(r.width, r.height) > 1.5: continue
            if r.width >= r.height: hs.append((round(r.y0, 2), round(r.y1, 2), r.x0, r.x1))
            else: vs.append((round(r.x0, 2), round(r.x1, 2), r.y0, r.y1))
    def merge(items):
        items.sort()
        out = []
        for a0, a1, b0, b1 in items:
            if out and abs(out[-1][0] - a0) < 0.05 and abs(out[-1][1] - a1) < 0.05 and b0 <= out[-1][3] + 0.05:
                out[-1] = (out[-1][0], out[-1][1], out[-1][2], max(out[-1][3], b1))
            else:
                out.append((a0, a1, b0, b1))
        return out
    return merge(hs), merge(vs)

worst = (0.0, "")
def note(delta, what):
    global worst
    if abs(delta) > abs(worst[0]): worst = (delta, what)

report = {"text": [], "rules": {}, "logo": {}}
ours_spans = spans(ours)
for r in spans(ref):
    m = [o for o in ours_spans if o["text"] == r["text"]]
    if not m:
        report["text"].append({"text": r["text"], "missing": True}); note(999, f"missing text {r['text']!r}"); continue
    o = min(m, key=lambda o: abs(o["y"] - r["y"]) + abs(o["x"] - r["x"]))
    d = {"text": r["text"][:40], "dx": round(o["x"] - r["x"], 3), "dy": round(o["y"] - r["y"], 3), "dend": round(o["end"] - r["end"], 3),
         "font_ref": r["font"], "font_ours": o["font"], "size_ref": round(r["size"], 3), "size_ours": round(o["size"], 3)}
    report["text"].append(d)
    for k in ("dx", "dy", "dend"): note(d[k], f"text {r['text'][:30]!r} {k}")

rh, rv = rules(ref)
oh, ov = rules(ours)
def match(refs, ourss, name):
    rows = []
    for a0, a1, b0, b1 in refs:
        best = min(ourss, key=lambda o: abs(o[0] - a0) + abs(o[2] - b0) + abs(o[3] - b1)) if ourss else None
        if not best: note(999, f"{name} rule missing"); continue
        d = {"at": a0, "from": round(b0, 2), "to": round(b1, 2), "d_pos": round(best[0] - a0, 3), "d_thick": round((best[1] - best[0]) - (a1 - a0), 3), "d_from": round(best[2] - b0, 3), "d_to": round(best[3] - b1, 3)}
        rows.append(d)
        for k in ("d_pos", "d_thick", "d_from", "d_to"): note(d[k], f"{name} rule at {a0} {k}")
    return rows
report["rules"] = {"horizontal_ref": len(rh), "horizontal_ours": len(oh), "vertical_ref": len(rv), "vertical_ours": len(ov),
                   "horizontal": match(rh, oh, "horizontal"), "vertical": match(rv, ov, "vertical")}

# Raster overlay at the same DPI.
mat = fitz.Matrix(a.dpi / 72, a.dpi / 72)
pr = ref.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
po = ours.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
w, h = pr.width, pr.height
R, O = pr.samples, po.samples
ink = lambda v: v < 128
# Logo ink box inside the reference image box (28.8, 28.8, 192.42, 61.83), expanded 2 pt.
s = a.dpi / 72
def inkbox(buf, x0, y0, x1, y1):
    xs, ys = [], []
    for y in range(int(y0 * s), int(y1 * s)):
        row = y * w
        for x in range(int(x0 * s), int(x1 * s)):
            if ink(buf[row + x]): xs.append(x); ys.append(y)
    return (min(xs) / s, min(ys) / s, max(xs) / s, max(ys) / s) if xs else None
lr, lo = inkbox(R, 26.8, 26.8, 194.4, 63.8), inkbox(O, 26.8, 26.8, 194.4, 63.8)
report["logo"] = {"ref_ink": [round(v, 2) for v in lr] if lr else None, "ours_ink": [round(v, 2) for v in lo] if lo else None}
if lr and lo:
    for i, k in enumerate(("left", "top", "right", "bottom")):
        note(lo[i] - lr[i], f"logo ink {k}"); report["logo"][f"d_{k}"] = round(lo[i] - lr[i], 3)

# overlay.png: red = reference only, blue = ours only, black = both. diff.png: white where they agree.
try:
    from PIL import Image
    ov_img = Image.new("RGB", (w, h), "white"); df = Image.new("L", (w, h), 255)
    opx, dpx = ov_img.load(), df.load()
    both = only_r = only_o = 0
    for y in range(h):
        row = y * w
        for x in range(w):
            r_, o_ = ink(R[row + x]), ink(O[row + x])
            if r_ and o_: opx[x, y] = (0, 0, 0); both += 1
            elif r_: opx[x, y] = (220, 0, 0); dpx[x, y] = 0; only_r += 1
            elif o_: opx[x, y] = (0, 70, 220); dpx[x, y] = 0; only_o += 1
    ov_img.save(f"{a.out}/overlay.png"); df.save(f"{a.out}/diff.png")
    report["raster"] = {"dpi": a.dpi, "ink_both": both, "ink_ref_only": only_r, "ink_ours_only": only_o}
except ImportError:
    report["raster"] = "PIL not installed: overlay images skipped"

json.dump(report, open(f"{a.out}/overlay.json", "w"), indent=1)
print(json.dumps({k: report[k] for k in ("logo", "raster")}))
print(f"rules: horizontal {len(rh)} ref / {len(oh)} ours, vertical {len(rv)} ref / {len(ov)} ours")
print(f"largest difference: {abs(worst[0]):.3f} pt ({worst[1]})")
