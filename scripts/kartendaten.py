"""Gemeinsame Funktionen für die Kartendatenbank (Excel lesen, Kategorien, IDs).
Wird von export_cards.py und check_cards.py benutzt. Nur Python 3, keine Zusatzpakete."""
import json
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCEL = ROOT / "data" / "db_Karten.xlsx"
CARDS_JSON = ROOT / "data" / "cards.json"
KATEGORIEN = ROOT / "data" / "kategorien.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
SPALTEN = {"begriff": "Begriff", "erklaerung": "Erklärung", "stufe": "Schwierigkeit", "themen": "Themen", "id": "ID"}


def card_id(begriff: str, erklaerung: str) -> str:
    """Stabile ID (FNV-1a, 32 Bit) – muss zu hashCardText() in der App passen.
    Wird nur noch für Karten ohne Eintrag in der Spalte ID benutzt."""
    h = 0x811C9DC5
    for byte in f"{begriff}\x1f{erklaerung}".encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"k{h:08x}"


def load_kategorien(path=KATEGORIEN):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    stufen = {s["name"].lower(): s["id"] for s in data["stufen"]}
    stufen.update({s["id"]: s["id"] for s in data["stufen"]})
    themen = {t["name"].lower(): t["id"] for t in data["themen"]}
    themen.update({t["id"]: t["id"] for t in data["themen"]})
    return data, stufen, themen


def _text(el) -> str:
    return "".join(t.text or "" for t in el.iter(f"{{{NS['m']}}}t"))


def _first_sheet_path(z):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    first = wb.find("m:sheets/m:sheet", NS)
    rel_id = first.get(f"{{{NS['r']}}}id")
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in rels.findall("pr:Relationship", NS):
        if rel.get("Id") == rel_id:
            target = rel.get("Target")
            return target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
    raise ValueError("Erstes Tabellenblatt nicht gefunden")


def read_sheet(path=EXCEL):
    """Liefert (Zeilennummer, {Spaltenbuchstabe: Text}) für das erste Tabellenblatt."""
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
            yield int(row.get("r")), values


def read_rows(path=EXCEL):
    """Liefert Zeilen als dict mit begriff, erklaerung, stufe, themen, id, zeile.
    Mit Kopfzeile werden die Spalten über ihre Namen gefunden, ohne Kopfzeile gilt A = Begriff, B = Erklärung."""
    rows = list(read_sheet(path))
    cols = {"begriff": "A", "erklaerung": "B"}
    header = {str(v).strip().lower(): k for k, v in rows[0][1].items()} if rows else {}
    if "begriff" in header and ("erklärung" in header or "erklaerung" in header):
        header.setdefault("erklärung", header.get("erklaerung"))
        cols = {key: header[name.lower()] for key, name in SPALTEN.items() if name.lower() in header}
        rows = rows[1:]
    for nr, values in rows:
        yield {key: str(values.get(col, "") or "").strip() for key, col in cols.items()} | {"zeile": nr}


def split_themen(text):
    return [t.strip() for t in re.split(r"[,;]", text or "") if t.strip()]


def build_cards(rows, kategorien=None):
    """Baut die Kartenliste und sammelt Fehler und Hinweise.
    Rückgabe: cards, fehler (Liste), hinweise (dict mit Zählern/Listen)"""
    _, stufen, themen = kategorien or load_kategorien()
    cards, fehler = [], []
    hinweise = {"leer": 0, "ohne_id": [], "ohne_stufe": 0, "ohne_themen": 0}
    ids = {}
    for row in rows:
        begriff, erklaerung = row.get("begriff", ""), row.get("erklaerung", "")
        if not begriff or not erklaerung:
            hinweise["leer"] += 1
            continue
        card = {"id": row.get("id") or "", "begriff": begriff, "erklaerung": erklaerung}
        if not card["id"]:
            card["id"] = card_id(begriff, erklaerung)
            hinweise["ohne_id"].append((row["zeile"], begriff, card["id"]))
        if card["id"] in ids:
            fehler.append(f"Zeile {row['zeile']}: ID {card['id']} doppelt (auch Zeile {ids[card['id']]})")
        ids[card["id"]] = row["zeile"]
        stufe_text = row.get("stufe", "")
        if stufe_text:
            stufe = stufen.get(stufe_text.lower())
            if not stufe:
                fehler.append(f"Zeile {row['zeile']} ({begriff}): unbekannte Schwierigkeit „{stufe_text}“")
            else:
                card["level"] = stufe
        else:
            hinweise["ohne_stufe"] += 1
        themen_liste = split_themen(row.get("themen", ""))
        if themen_liste:
            ids_themen = []
            for t in themen_liste:
                tid = themen.get(t.lower())
                if not tid:
                    fehler.append(f"Zeile {row['zeile']} ({begriff}): unbekanntes Thema „{t}“")
                elif tid not in ids_themen:
                    ids_themen.append(tid)
            if ids_themen:
                card["themes"] = ids_themen
        else:
            hinweise["ohne_themen"] += 1
        card["zeile"] = row["zeile"]
        cards.append(card)
    return cards, fehler, hinweise


def write_cards_json(cards, target=CARDS_JSON):
    keys = ["id", "begriff", "erklaerung", "level", "themes"]
    lines = ",\n".join("    " + json.dumps({k: c[k] for k in keys if k in c}, ensure_ascii=False) for c in cards)
    Path(target).write_text('{\n  "version": 1,\n  "cards": [\n' + lines + "\n  ]\n}\n", encoding="utf-8")
