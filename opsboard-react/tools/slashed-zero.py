#!/usr/bin/env python3
"""Freeze a font's OWN slashed zero (its `zero` OpenType feature) into the default glyphs, so the wall shows it
without per-surface font-feature-settings (bug report 7 item 4c). No glyph is drawn: the designer's alternate
(`zero.slash` in Inter, `zero.alt02` in IBM Plex Sans, `zero.0s` in Source Sans 3) is copied, decomposed, over
`zero` and over its tabular twin, so tabular-nums keeps working.

    python3 tools/slashed-zero.py <upstream font> <OutName> 400 600 700 800
    python3 tools/slashed-zero.py <upstream font> <OutName> --latin-ext --family "Name"

--latin-ext builds the family's latin-ext half instead: still variable, subset to Google's "latin-ext" range (no
zero lives there, nothing is frozen), saved as public/fonts/<OutName>-var-latin-ext.woff2. Subsetting is a
modification too, so a font with a Reserved Font Name gets the same --family rename as its latin files.

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


# Google Fonts' "latin-ext" unicode-range.
LATIN_EXT = [*range(0x0100, 0x02BB), *range(0x02BD, 0x02C6), *range(0x02C7, 0x02CD), *range(0x02CE, 0x02D8),
             *range(0x02DD, 0x0300), 0x0304, 0x0308, 0x0329, *range(0x1D00, 0x1DC0), *range(0x1E00, 0x1EA0),
             *range(0x1EF2, 0x1F00), 0x2020, *range(0x20A0, 0x20AC), *range(0x20AD, 0x20C5), 0x2113,
             *range(0x2C60, 0x2C80), *range(0xA720, 0xA800)]


def rename(font, family, suffix):
    """Every naming record a user or a browser can see carries `family`, never the original (OFL section 3).
    Copyright, trademark, designer and licence records (0, 7-9, 11-14) keep their text: the OFL requires them."""
    keep = {0, 7, 8, 9, 11, 12, 13, 14}
    old = set()
    for rec in font["name"].names:
        if rec.nameID in (1, 16):
            old.add(str(rec.toUnicode()))
        if rec.nameID in (6, 25):
            old.add(str(rec.toUnicode()).split("-")[0])
    tight = family.replace(" ", "")
    for rec in font["name"].names:
        if rec.nameID >= 256:   # named-instance / axis names, e.g. "IBMPlexSansVar-Bold"
            text = str(rec.toUnicode())
            for o in sorted(old, key=len, reverse=True):
                text = text.replace(o.replace(" ", ""), tight).replace(o, family)
            rec.string = text
    for rec in font["name"].names:
        if rec.nameID in keep:
            continue
        if rec.nameID in (3, 6):
            rec.string = family.replace(" ", "") + suffix
        elif rec.nameID in (1, 4, 16, 21, 25):
            rec.string = family
        elif rec.nameID in (17, 22):
            rec.string = "Regular"


def latin_ext(src, name, family):
    font = TTFont(src)
    opts = Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = Subsetter(opts)
    sub.populate(unicodes=LATIN_EXT)
    sub.subset(font)
    if family:
        rename(font, family, "-VarLatinExt")
    font.flavor = "woff2"
    out = Path(__file__).resolve().parent.parent / "public" / "fonts" / f"{name}-var-latin-ext.woff2"
    font.save(out)
    print(f"{out.name}: {out.stat().st_size} bytes · variable · latin-ext" + (f" · named {family}" if family else ""))


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
    if "--latin-ext" in args:
        args.remove("--latin-ext")
        return latin_ext(args[0], args[1], family)
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
        if family:
            rename(font, family, f"-W{w}")
        else:
            for rec in font["name"].names:
                if rec.nameID in (1, 4, 16) and "Slashed" not in str(rec.toUnicode()):
                    rec.string = f"{rec.toUnicode()} Slashed"
        font.flavor = "woff2"
        out = out_dir / f"{name}-slashed-{w}.woff2"
        font.save(out)
        print(f"{out.name}: {out.stat().st_size} bytes · frozen {', '.join(f'{b}←{a}' for b, a in mapping.items() if b in font.getGlyphOrder())}"
              + (f" · wght {loc['wght']}" if axis else ""))


if __name__ == "__main__":
    main()
