#!/usr/bin/env python3
"""Exportiert die Kartendatenbank aus Excel nach JSON.

Aufruf (im Repo-Ordner):
    python3 scripts/export_cards.py

Liest  data/db_Karten.xlsx  (erstes Tabellenblatt mit Kopfzeile
Begriff | Erklärung | Schwierigkeit | Themen | ID) und schreibt  data/cards.json ,
das die App lädt. Erlaubte Stufen und Themen stehen in data/kategorien.json.

Neue Karten brauchen keine ID: das Skript vergibt eine und meldet sie.
Mit  --ids-eintragen  werden fehlende IDs direkt in die Excel-Datei geschrieben
(dafür wird das Paket openpyxl benötigt: pip install openpyxl).

Danach in service-worker.js CACHE_VERSION hochzählen, damit installierte Apps die neuen Karten bekommen.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kartendaten import CARDS_JSON, EXCEL, ROOT, build_cards, read_rows, write_cards_json  # noqa: E402


def ids_eintragen(path, neue_ids):
    try:
        import openpyxl
    except ImportError:
        sys.exit("Für --ids-eintragen wird openpyxl gebraucht: pip install openpyxl")
    wb = openpyxl.load_workbook(path)
    ws = wb.worksheets[0]
    header = {str(c.value).strip().lower(): c.column for c in ws[1] if c.value}
    if "id" not in header:
        sys.exit("Die Excel-Datei hat keine Spalte „ID“.")
    for zeile, _, cid in neue_ids:
        ws.cell(row=zeile, column=header["id"], value=cid)
    wb.save(path)


def main():
    parser = argparse.ArgumentParser(description="Karten von Excel nach JSON exportieren")
    parser.add_argument("source", nargs="?", type=Path, default=EXCEL)
    parser.add_argument("target", nargs="?", type=Path, default=CARDS_JSON)
    parser.add_argument("--ids-eintragen", action="store_true", help="fehlende IDs in die Excel-Datei schreiben")
    args = parser.parse_args()

    cards, fehler, hinweise = build_cards(read_rows(args.source))
    if fehler:
        print(f"{len(fehler)} Fehler – nichts exportiert:")
        for f in fehler[:50]:
            print("  " + f)
        sys.exit(1)
    if not cards:
        sys.exit(f"Keine Karten in {args.source} gefunden.")

    write_cards_json(cards, args.target)
    ziel = args.target.relative_to(ROOT) if args.target.is_relative_to(ROOT) else args.target
    print(f"{len(cards)} Karten nach {ziel} geschrieben.")
    if hinweise["leer"]:
        print(f"{hinweise['leer']} Zeilen ohne Begriff oder Erklärung übersprungen.")
    if hinweise["ohne_stufe"] or hinweise["ohne_themen"]:
        print(f"Noch nicht eingeteilt: {hinweise['ohne_stufe']} ohne Schwierigkeit, {hinweise['ohne_themen']} ohne Themen.")
    if hinweise["ohne_id"]:
        if args.ids_eintragen:
            ids_eintragen(args.source, hinweise["ohne_id"])
            print(f"{len(hinweise['ohne_id'])} neue IDs in die Excel-Datei eingetragen.")
        else:
            print(f"{len(hinweise['ohne_id'])} Karten ohne ID – vergeben, aber noch nicht in der Excel-Datei:")
            for zeile, begriff, cid in hinweise["ohne_id"][:10]:
                print(f"  Zeile {zeile}: {begriff} -> {cid}")
            print("  Bitte mit  python3 scripts/export_cards.py --ids-eintragen  in die Excel-Datei übernehmen,")
            print("  sonst ändert sich die ID, sobald die Erklärung bearbeitet wird.")
    print("Prüfen:  python3 scripts/check_cards.py")
    print("Nicht vergessen: CACHE_VERSION in service-worker.js hochzählen.")


if __name__ == "__main__":
    main()
