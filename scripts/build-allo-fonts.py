"""Create the web cuts from the licensed original; no network required.

Optional authoring tool: python3 -m pip install 'fonttools[woff]'
Run: python3 scripts/build-allo-fonts.py
The app/build uses the committed WOFF2s, not Python.
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONTS = Path(__file__).resolve().parents[1] / "public" / "fonts"
SOURCE = FONTS / "AlloVariable.woff2"

# The interface never uses rounded letters. Bake that axis out, keeping the
# complete character set, optical sizes 9–32 and weights 100–900 intact.
source = TTFont(SOURCE, recalcTimestamp=False)
characters = set(source.getBestCmap())
text = instantiateVariableFont(source, {"ROND": 0}, inplace=True)
assert set(text.getBestCmap()) == characters, "Text coverage changed"
assert {axis.axisTag for axis in text["fvar"].axes} == {"opsz", "wght"}
text.flavor = "woff2"
text.save(FONTS / "allo-crisp.woff2")

# Controls all use this one drawing: 500 weight, 20 px optical size, no
# roundness. Static, eight-glyph cut; OFL/copyright metadata is retained.
symbols = instantiateVariableFont(
    TTFont(SOURCE, recalcTimestamp=False), {"ROND": 0, "opsz": 20, "wght": 500}, inplace=True
)
options = subset.Options()
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
cutter = subset.Subsetter(options=options)
cutter.populate(text="✓✕⌕+←→❯⋯")
cutter.subset(symbols)
# The subsetter also retains the chevron's bidi mirror.
assert set(map(ord, "✓✕⌕+←→❯⋯")) <= set(symbols.getBestCmap()), "A symbol is missing"
assert "fvar" not in symbols, "Symbols should be a static cut"
symbols.flavor = "woff2"
symbols.save(FONTS / "allo-symbols.woff2")

for filename in ("AlloVariable.woff2", "allo-crisp.woff2", "allo-symbols.woff2"):
    print(f"{filename}: {(FONTS / filename).stat().st_size:,} bytes")
