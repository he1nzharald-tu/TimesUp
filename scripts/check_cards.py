#!/usr/bin/env python3
"""Prüft die Kartendatenbank data/db_Karten.xlsx auf die Regeln für gute Karten.

Aufruf (im Repo-Ordner):
    python3 scripts/check_cards.py                 # Übersicht
    python3 scripts/check_cards.py --liste         # alle Auffälligkeiten auflisten
    python3 scripts/check_cards.py --csv bericht.csv
    python3 scripts/check_cards.py --zeilen 2-101  # nur einen Bereich prüfen
    python3 scripts/check_cards.py --vollstaendig  # fehlende Stufe/Themen zählen als Fehler

Regeln:
  - Erklärung höchstens 80 Zeichen
  - Begriff (auch Wortteile wie „Unterlage“ in „Schreibtischunterlage“) kommt in der Erklärung nicht vor
  - Schwierigkeit und Themen aus data/kategorien.json
  - Politiker (Themen Politik + Berühmte Personen) erst ab Stufe Schwer
  - NSFW-Karten haben kein weiteres Thema (sonst kämen sie über das andere Thema ins Spiel)
Rückgabewert 1, wenn Regeln verletzt sind.
"""
import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kartendaten import EXCEL, build_cards, read_rows  # noqa: E402

MAX_LAENGE = 80
WORT = re.compile(r"[A-Za-zÄÖÜäöüß]+")


def begriff_in_erklaerung(begriff, erklaerung):
    """Liefert das gefundene Wortteil oder None. Prüft Wortstamm, Anfang und Ende langer Wörter."""
    text = erklaerung.lower()
    woerter = set(WORT.findall(text))
    for wort in WORT.findall(begriff.lower()):
        if len(wort) < 4:
            continue
        stamm = wort[:max(4, len(wort) - 2)]
        if any(w.startswith(stamm) for w in woerter):
            return wort
        if len(wort) >= 9:  # zusammengesetzte Wörter: Anfang oder Ende ab 5 Buchstaben
            for n in range(len(wort) - 3, 4, -1):
                for teil in (wort[:n], wort[-n:]):
                    if len(teil) >= 5 and re.search(r"(?<![a-zäöüß])" + re.escape(teil[:max(5, len(teil) - 1)]), text):
                        return teil
    return None


def pruefe(cards, max_laenge=MAX_LAENGE, vollstaendig=False):
    befunde = []  # (zeile, begriff, art, detail)
    begriffe = Counter(c["begriff"].lower() for c in cards)
    for c in cards:
        z, b, e = c["zeile"], c["begriff"], c["erklaerung"]
        if len(e) > max_laenge:
            befunde.append((z, b, "zu lang", f"{len(e)} Zeichen"))
        teil = begriff_in_erklaerung(b, e)
        if teil:
            befunde.append((z, b, "Begriff in Erklärung", teil))
        if begriffe[b.lower()] > 1:
            befunde.append((z, b, "Begriff doppelt", f"{begriffe[b.lower()]}-mal"))
        themes = c.get("themes", [])
        if "politik" in themes and "personen" in themes and c.get("level") in ("kinder", "mittel"):
            befunde.append((z, b, "Politiker zu leicht", c.get("level")))
        if "nsfw" in themes and len(themes) > 1:
            befunde.append((z, b, "NSFW mit weiterem Thema", ", ".join(t for t in themes if t != "nsfw")))
        if vollstaendig and "level" not in c:
            befunde.append((z, b, "ohne Schwierigkeit", ""))
        if vollstaendig and not themes:
            befunde.append((z, b, "ohne Themen", ""))
    return befunde


def main():
    parser = argparse.ArgumentParser(description="Kartendatenbank prüfen")
    parser.add_argument("source", nargs="?", type=Path, default=EXCEL)
    parser.add_argument("--liste", action="store_true", help="alle Auffälligkeiten auflisten")
    parser.add_argument("--csv", type=Path, help="Bericht als CSV-Datei schreiben")
    parser.add_argument("--zeilen", help="nur Excel-Zeilen von-bis prüfen, z. B. 2-101")
    parser.add_argument("--vollstaendig", action="store_true", help="fehlende Stufe/Themen als Fehler werten")
    parser.add_argument("--max-laenge", type=int, default=MAX_LAENGE)
    args = parser.parse_args()

    cards, fehler, hinweise = build_cards(read_rows(args.source))
    if args.zeilen:
        von, bis = (int(x) for x in args.zeilen.split("-"))
        cards = [c for c in cards if von <= c["zeile"] <= bis]
    befunde = pruefe(cards, args.max_laenge, args.vollstaendig)
    befunde += [(0, "", "Datenfehler", f) for f in fehler]

    arten = Counter(b[2] for b in befunde)
    eingeteilt = sum(1 for c in cards if "level" in c and c.get("themes"))
    print(f"{len(cards)} Karten geprüft, {eingeteilt} vollständig eingeteilt.")
    if not befunde:
        print("Keine Auffälligkeiten.")
    for art, n in arten.most_common():
        print(f"  {art}: {n}")
    if args.liste:
        for z, b, art, detail in sorted(befunde):
            print(f"  Zeile {z}: {b} – {art}{': ' + detail if detail else ''}")
    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["Zeile", "Begriff", "Befund", "Detail"])
            w.writerows(sorted(befunde))
        print(f"Bericht: {args.csv}")
    sys.exit(1 if befunde else 0)


if __name__ == "__main__":
    main()
