#!/usr/bin/env python3
"""Patch a DOTTED ZERO into an open font, as the wall's Nunito build has (bug 6 item 6): a filled ellipse inside
the counter of U+0030, so `0` cannot be read as `O` on a wall full of registrations, callsigns and ICAO codes.

--style slashed (bug report 7 item 4b) draws a SLASH instead: at the wall's real label size (9 device px) the dot
leaves a 0.25–0.33 px gap to the counter, which anti-aliasing fills — the zero becomes a blob; a diagonal stroke
leaves two open triangles instead. --style plain instantiates the weights untouched (the "plain zero" choice).
    python3 tools/dotted-zero.py --style slashed <var font> Nunito 400 600 700 800 [--out public/fonts]

    python3 tools/dotted-zero.py public/fonts/Roboto-var-latin.woff2 Roboto 400 600 700 800
    python3 tools/dotted-zero.py public/fonts/PublicSans-var-latin.woff2 PublicSans 400 600 700 800

Needs fonttools + brotli (pip install fonttools brotli). The variable font is instantiated at each weight the wall
uses (a static TrueType glyph has no gvar deltas to keep in step with the new contour), the zero's counter is
measured, and an 8-point quadratic ellipse — the same construction as the Nunito build: 72% of the counter's
width, 32% of its height, centred, never touching the counter — is appended with the outer contour's winding so
it fills. Every glyph that is a zero is patched (`zero`, and the tabular `zero.tf` Public Sans swaps in under
tabular-nums). Output: <Name>-dotted-<weight>.woff2 next to the input, same naming as the Nunito files.
The patch refuses, loudly, when a zero does not have exactly two contours (outer + counter): no half-patched set.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.recordingPen import RecordingPen


def signed_area(points):
    a = 0
    for i, (x, y) in enumerate(points):
        nx, ny = points[(i + 1) % len(points)]
        a += x * ny - nx * y
    return a / 2


def contours_of(glyph, glyf):
    coords, ends, flags = glyph.getCoordinates(glyf)
    out, start = [], 0
    for e in ends:
        out.append((list(coords[start:e + 1]), list(flags[start:e + 1])))
        start = e + 1
    return out


def patch_zero(font, glyph_name, style="dotted"):
    glyf = font["glyf"]
    glyph = glyf[glyph_name]
    if glyph.isComposite():
        # Public Sans's tabular zero.tf is a composite of `zero` (shifted): patching `zero` patches it too.
        refs = [c.glyphName for c in glyph.components]
        if all(r == "zero" or r.startswith("zero.") for r in refs):
            return dict(counter=("via", refs[0]), dot=("composite", "of zero"))
        raise SystemExit(f"{glyph_name}: composite of {refs}, not a zero: refusing")
    contours = contours_of(glyph, glyf)
    if len(contours) != 2:
        raise SystemExit(f"{glyph_name}: expected 2 contours (outer + counter), found {len(contours)}: refusing")
    # The counter is the contour with the smaller box.
    boxes = []
    for pts, _ in contours:
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    outer_i = 0 if (boxes[0][2] - boxes[0][0]) >= (boxes[1][2] - boxes[1][0]) else 1
    inner = boxes[1 - outer_i]
    cw, ch = inner[2] - inner[0], inner[3] - inner[1]
    cx, cy = (inner[0] + inner[2]) / 2, (inner[1] + inner[3]) / 2
    cw, ch = round(cw), round(ch)
    if style == "slashed":
        # A stroke from inside the ring at lower left to inside the ring at upper right. Its ends stop 60 % of the
        # way into the ring (never past the outer edge), its thickness is 30 % of the counter's width, capped below
        # the ring's own stroke so the slash never looks heavier than the zero. Horizontal end edges sit inside the
        # filled ring, so only the two long sides show.
        outer = boxes[outer_i]
        ring_x = min(inner[0] - outer[0], outer[2] - inner[2]); ring_y = min(inner[1] - outer[1], outer[3] - inner[3])
        t = min(cw * 0.30, ring_x * 0.85)
        y0, y1 = inner[1] - ring_y * 0.6, inner[3] + ring_y * 0.6
        x0, x1 = inner[0] + cw * 0.12, inner[2] - cw * 0.12
        import math
        theta = math.atan2(y1 - y0, x1 - x0)
        dx = (t / 2) / math.sin(theta)
        pts = [(x0 - dx, y0), (x0 + dx, y0), (x1 + dx, y1), (x1 - dx, y1)]
        pts = [(round(x), round(y)) for x, y in pts]
        flags = [1, 1, 1, 1]
        rx, ry = round(t), round(y1 - y0)
    else:
        rx, ry = round(cw * 0.36), round(ch * 0.16)
        if rx < 1 or ry < 1 or rx * 2 >= cw * 0.9 or ry * 2 >= ch * 0.9:
            raise SystemExit(f"{glyph_name}: counter {cw}x{ch} too small for a dot: refusing")
        # 8-point quadratic ellipse: on-curve at the four extremes, off-curve at the four corners.
        pts = [(cx + rx, cy), (cx + rx, cy + ry), (cx, cy + ry), (cx - rx, cy + ry), (cx - rx, cy), (cx - rx, cy - ry), (cx, cy - ry), (cx + rx, cy - ry)]
        pts = [(round(x), round(y)) for x, y in pts]
        flags = [1, 0, 1, 0, 1, 0, 1, 0]
    # Winding: the dot fills, so it turns the same way as the outer contour (the counter turns the other way).
    if (signed_area(contours[outer_i][0]) > 0) != (signed_area(pts) > 0):
        pts.reverse(); flags.reverse()
    from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates
    all_pts = [p for c in contours for p in c[0]] + pts
    all_flags = [f for c in contours for f in c[1]] + flags
    ends = []
    n = 0
    for c in contours:
        n += len(c[0]); ends.append(n - 1)
    ends.append(n + len(pts) - 1)
    new = Glyph()
    new.numberOfContours = len(ends)
    new.coordinates = GlyphCoordinates(all_pts)
    new.flags = all_flags
    new.endPtsOfContours = ends
    new.program = glyph.program if hasattr(glyph, "program") else None
    if new.program is None:
        from fontTools.ttLib.tables import ttProgram
        new.program = ttProgram.Program()
    glyf[glyph_name] = new
    new.recalcBounds(glyf)
    return dict(counter=(cw, ch), dot=(rx, ry) if style == "slashed" else (rx * 2, ry * 2))


def main():
    args = sys.argv[1:]
    style, out_dir = "dotted", None
    if "--style" in args:
        i = args.index("--style"); style = args[i + 1]; del args[i:i + 2]
    if "--out" in args:
        i = args.index("--out"); out_dir = Path(args[i + 1]); del args[i:i + 2]
    if style not in ("dotted", "slashed", "plain"):
        raise SystemExit("--style must be dotted, slashed or plain")
    src, name, *weights = args
    weights = [int(w) for w in weights] or [400, 600, 700, 800]
    out_dir = out_dir or Path(src).parent
    base = TTFont(src)
    zeros = [g for g in base.getGlyphOrder() if g == "zero" or g.startswith("zero.")]
    zeros = [g for g in zeros if g in ("zero", "zero.tf", "zero.tnum", "zero.tosf", "zero.lf")]
    for w in weights:
        font = TTFont(src)
        static = instancer.instantiateVariableFont(font, {"wght": w}, inplace=False, updateFontNames=False)
        report = {} if style == "plain" else {g: patch_zero(static, g, style) for g in zeros}
        # Family name carries the style so the console's plain Public Sans is untouched.
        tag = style.capitalize()
        for rec in static["name"].names:
            if rec.nameID in (1, 4, 16) and tag not in str(rec.toUnicode()):
                rec.string = f"{rec.toUnicode()} {tag}"
        static.flavor = "woff2"
        out = out_dir / f"{name}-{style}-{w}.woff2"
        static.save(out)
        print(f"{out.name}: {out.stat().st_size} bytes · " + " · ".join(f"{g} counter {r['counter'][0]}x{r['counter'][1]} dot {r['dot'][0]}x{r['dot'][1]}" if isinstance(r['counter'][0], (int, float)) else f"{g} = composite of {r['counter'][1]} (patched through it)" for g, r in report.items()))


if __name__ == "__main__":
    main()
