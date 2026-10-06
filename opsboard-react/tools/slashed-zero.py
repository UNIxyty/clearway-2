#!/usr/bin/env python3
"""Freeze a font's OWN slashed zero (its `zero` OpenType feature) into the default glyphs, so the wall shows it
without per-surface font-feature-settings (bug report 7 item 4c). No glyph is drawn: the designer's alternate
(`zero.slash` in Inter, `zero.alt02` in IBM Plex Sans, `zero.0s` in Source Sans 3) is copied, decomposed, over
`zero` and over its tabular twin, so tabular-nums keeps working.

    python3 tools/slashed-zero.py <upstream font> <OutName> 400 600 700 800

Per weight: instantiate the variable font (a static glyph has no gvar to keep in step), subset to Google's
"latin" range with every layout feature kept, freeze, save public/fonts/<OutName>-slashed-<weight>.woff2.
Refuses when the font has no `zero` feature, or a mapped glyph is missing: no half-frozen set.
Needs fonttools + brotli. The fonts are OFL; their licences ship next to the files (public/fonts/LICENSES). For a
font with a Reserved Font Name pass --family with a name that does not contain it (OFL §3).
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.subset import Subsetter, Options
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Google Fonts' "latin" unicode-range (the same range the other self-hosted latin files use).
LATIN = [*range(0x0000, 0x0100), 0x0131, 0x0152, 0x0153, 0x02BB, 0x02BC, 0x02C6, 0x02DA, 0x02DC, 0x0304, 0x0308, 0x0329,
         *range(0x2000, 0x2070), 0x20AC, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD]


def zero_mapping(font):
    gsub = font["GSUB"].table
    out = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag != "zero":
            continue
        for li in fr.Feature.LookupListIndex:
            for st in gsub.LookupList.Lookup[li].SubTable:
                st = getattr(st, "ExtSubTable", st)
                if getattr(st, "mapping", None):
                    out.update(st.mapping)
    # Only the forms the wall renders: the default zero and its tabular/old-style twins.
    return {k: v for k, v in out.items() if k in ("zero", "zero.tf", "zero.tnum", "zero.tosf", "zero.0", "zero.p", "zero.0p", "zero.lf")}


def freeze(font, mapping):
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = set(font.getGlyphOrder())
    for base, alt in mapping.items():
        if base not in order:
            continue
        if alt not in order:
            raise SystemExit(f"{alt} (the slashed form of {base}) is missing after subsetting: refusing")
        pen = TTGlyphPen(glyf)
        glyf[alt].draw(pen, glyf)          # decomposed: no composite can point back at the swapped glyph
        glyf[base] = pen.glyph()
        glyf[base].recalcBounds(glyf)
        hmtx[base] = hmtx[alt]


def main():
    args = sys.argv[1:]
    # --family "Name": the family name written into the font's name table. Required for fonts with an OFL
    # Reserved Font Name (IBM Plex: "Plex"; Source Sans: "Source"): a Modified Version may not use it.
    family = None
    if "--family" in args:
        i = args.index("--family"); family = args[i + 1]; del args[i:i + 2]
    src, name, *weights = args
    weights = [int(w) for w in weights] or [400, 600, 700, 800]
    out_dir = Path(__file__).resolve().parent.parent / "public" / "fonts"
    probe = TTFont(src)
    mapping = zero_mapping(probe)
    if "zero" not in mapping:
        raise SystemExit(f"{src}: no `zero` feature with a mapping for `zero`: refusing")
    axis = next((a for a in probe["fvar"].axes if a.axisTag == "wght"), None) if "fvar" in probe else None
    for w in weights:
        font = TTFont(src)
        if axis:
            loc = {"wght": max(axis.minValue, min(axis.maxValue, w))}
            for a in font["fvar"].axes:   # pin every other axis (e.g. Inter's opsz) at its default
                if a.axisTag != "wght":
                    loc[a.axisTag] = a.defaultValue
            font = instancer.instantiateVariableFont(font, loc, inplace=False, updateFontNames=False)
        opts = Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        sub = Subsetter(opts)
        sub.populate(unicodes=LATIN, glyphs=list(mapping.values()))
        sub.subset(font)
        freeze(font, mapping)
        for rec in font["name"].names:
            if family and rec.nameID in (1, 3, 4, 6, 16, 17, 18, 21, 22, 25):
                rec.string = family.replace(" ", "") + f"-W{w}" if rec.nameID in (3, 6) else family if rec.nameID in (1, 4, 16, 21) else "Regular" if rec.nameID in (17, 22) else family
            elif not family and rec.nameID in (1, 4, 16) and "Slashed" not in str(rec.toUnicode()):
                rec.string = f"{rec.toUnicode()} Slashed"
        font.flavor = "woff2"
        out = out_dir / f"{name}-slashed-{w}.woff2"
        font.save(out)
        print(f"{out.name}: {out.stat().st_size} bytes · frozen {', '.join(f'{b}←{a}' for b, a in mapping.items() if b in font.getGlyphOrder())}"
              + (f" · wght {loc['wght']}" if axis else ""))


if __name__ == "__main__":
    main()
