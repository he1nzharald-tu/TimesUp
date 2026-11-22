"""Vergleicht zwei Screenshot-Ordner Pixel für Pixel: python3 tests/compare.py <vorher> <nachher>"""
import sys, glob, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
diffs = []
for f in sorted(glob.glob(a + "/*.png")):
    g = os.path.join(b, os.path.basename(f))
    if not os.path.exists(g): diffs.append((os.path.basename(f), "fehlt")); continue
    x, y = Image.open(f).convert("RGB"), Image.open(g).convert("RGB")
    if x.size != y.size: diffs.append((os.path.basename(f), "Größe")); continue
    bbox = ImageChops.difference(x, y).getbbox()
    if bbox:
        n = sum(1 for p in ImageChops.difference(x, y).getdata() if max(p) > 24)
        diffs.append((os.path.basename(f), bbox, n))
print(len(glob.glob(a + "/*.png")), "Bilder,", len(diffs), "mit Unterschieden")
for d in diffs[:40]: print(" ", d)
