#!/usr/bin/env python3
"""Exportiert die Kartendatenbank aus Excel nach JSON.

Aufruf (im Repo-Ordner):
    python3 scripts/export_cards.py

Liest  data/db_Karten.xlsx  (erstes Tabellenblatt, Spalte A = Begriff, Spalte B = Erklärung)
und schreibt  data/cards.json , das die App lädt.

Benötigt nur Python 3, keine Zusatzpakete.
Danach in service-worker.js CACHE_VERSION hochzählen, damit installierte Apps die neuen Karten bekommen.
"""
import argparse
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT / "data" / "db_Karten.xlsx"
DEFAULT_TARGET = ROOT / "data" / "cards.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def card_id(begriff: str, erklaerung: str) -> str:
    """Stabile ID (FNV-1a, 32 Bit) – muss zu hashCardText() in der App passen."""
    h = 0x811C9DC5
    for byte in f"{begriff}\x1f{erklaerung}".encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"k{h:08x}"


def _text(el) -> str:
    """Text einer Zelle oder eines Shared Strings, auch mit Formatierungen (Rich Text)."""
    return "".join(t.text or "" for t in el.iter(f"{{{NS['m']}}}t"))


def _first_sheet_path(z: zipfile.ZipFile) -> str:
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    first = wb.find("m:sheets/m:sheet", NS)
    rel_id = first.get(f"{{{NS['r']}}}id")
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in rels.findall("pr:Relationship", NS):
        if rel.get("Id") == rel_id:
            target = rel.get("Target")
            return target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
    raise ValueError("Erstes Tabellenblatt nicht gefunden")


def read_rows(path: Path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            sst = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = [_text(si) for si in sst.findall("m:si", NS)]
        sheet = ET.fromstring(z.read(_first_sheet_path(z)))
        for row in sheet.iter(f"{{{NS['m']}}}row"):
            values = {}
            for c in row.findall("m:c", NS):
                col = re.match(r"[A-Z]+", c.get("r", "")).group(0)
                kind = c.get("t")
                if kind == "s":
                    v = c.find("m:v", NS)
                    value = shared[int(v.text)] if v is not None else ""
                elif kind == "inlineStr":
                    value = _text(c)
                else:
                    v = c.find("m:v", NS)
                    value = v.text if v is not None else ""
                values[col] = value
            yield values.get("A", ""), values.get("B", "")


def build_cards(rows):
    cards, seen, skipped = [], {}, 0
    for begriff, erklaerung in rows:
        begriff, erklaerung = str(begriff or "").strip(), str(erklaerung or "").strip()
        if not begriff or not erklaerung:
            skipped += 1
            continue
        cid = card_id(begriff, erklaerung)
        seen[cid] = seen.get(cid, 0) + 1
        if seen[cid] > 1:
            cid = f"{cid}-{seen[cid]}"
        cards.append({"id": cid, "begriff": begriff, "erklaerung": erklaerung})
    return cards, skipped


def main():
    parser = argparse.ArgumentParser(description="Karten von Excel nach JSON exportieren")
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("target", nargs="?", type=Path, default=DEFAULT_TARGET)
    args = parser.parse_args()

    cards, skipped = build_cards(read_rows(args.source))
    if not cards:
        sys.exit(f"Keine Karten in {args.source} gefunden.")

    # Eine Karte pro Zeile: kompakt und mit gut lesbaren Diffs in git
    lines = ",\n".join("    " + json.dumps(c, ensure_ascii=False) for c in cards)
    args.target.write_text('{\n  "version": 1,\n  "cards": [\n' + lines + "\n  ]\n}\n", encoding="utf-8")

    terms = {}
    for c in cards:
        terms.setdefault(c["begriff"].lower(), 0)
        terms[c["begriff"].lower()] += 1
    doubles = [t for t, n in terms.items() if n > 1]
    print(f"{len(cards)} Karten nach {args.target.relative_to(ROOT) if args.target.is_relative_to(ROOT) else args.target} geschrieben.")
    if skipped:
        print(f"{skipped} Zeilen ohne Begriff oder Erklärung übersprungen.")
    if doubles:
        print(f"Hinweis: {len(doubles)} Begriffe kommen mehrfach vor: {', '.join(sorted(doubles)[:10])}")
    print("Nicht vergessen: CACHE_VERSION in service-worker.js hochzählen.")


if __name__ == "__main__":
    main()
