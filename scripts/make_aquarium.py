"""Erzeugt die Dateien für das 3D-Aquarium (Design „Unterwasser“) aus Googles WebGL Aquarium.

Quelle: https://github.com/WebGLSamples/WebGLSamples.github.io (Ordner aquarium), BSD-3-Clause.

    git clone --depth 1 --filter=blob:none --sparse https://github.com/WebGLSamples/WebGLSamples.github.io.git /tmp/w
    git -C /tmp/w sparse-checkout set aquarium
    python3 scripts/make_aquarium.py /tmp/w

Ergebnis in aquarium/: models.bin + models.json (alle Modelle als Float32/Uint16),
Texturen und LICENSE.txt.
"""
import json
import shutil
import struct
import sys
from pathlib import Path

from PIL import Image

MODELS = ["SmallFishA", "MediumFishA", "MediumFishB", "BigFishB",
          "RockA", "RockB", "RockC", "Coral", "CoralStoneA", "CoralStoneB", "Stone",
          "SeaweedA", "SeaweedB"]
FIELDS = [("position", 3), ("normal", 3), ("texCoord", 2), ("tangent", 3), ("binormal", 3)]


def main(src):
    src = Path(src) / "aquarium"
    assets = src / "assets"
    out = Path(__file__).resolve().parent.parent / "aquarium"
    out.mkdir(exist_ok=True)
    blob = bytearray()
    manifest = {}
    textures = set()
    for name in MODELS:
        model = json.loads((assets / f"{name}.js").read_text())["models"][0]
        f = model["fields"]
        entry = {"textures": model["textures"], "count": len(f["position"]["data"]) // 3}
        for key, n in FIELDS:
            data = f[key]["data"]
            assert len(data) == entry["count"] * n, (name, key)
            entry[key] = len(blob)
            blob += struct.pack(f"<{len(data)}f", *data)
        idx = f["indices"]["data"]
        entry["indices"] = len(blob)
        entry["indexCount"] = len(idx)
        blob += struct.pack(f"<{len(idx)}H", *idx)
        if len(blob) % 4:
            blob += b"\0" * (4 - len(blob) % 4)
        pos = f["position"]["data"]
        entry["min"] = [min(pos[i::3]) for i in range(3)]
        entry["max"] = [max(pos[i::3]) for i in range(3)]
        manifest[name] = entry
        textures.update(v for k, v in model["textures"].items() if k in ("diffuse", "normalMap"))
    (out / "models.bin").write_bytes(bytes(blob))
    (out / "models.json").write_text(json.dumps(manifest, separators=(",", ":")))
    for t in sorted(textures):
        p = src / "source_assets" / "sourceimages" / t
        if not p.exists():
            p = assets / t
        im = Image.open(p)
        if t.endswith(".png"):
            im.save(out / t, optimize=True)
        else:
            im.convert("RGB").save(out / t, quality=88, optimize=True)
    shutil.copy(Path(src).parent / "LICENSE.md", out / "LICENSE.txt")
    total = sum(p.stat().st_size for p in out.iterdir())
    print(f"{len(MODELS)} Modelle, {len(textures)} Texturen, {total // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/aqsrc/w")
