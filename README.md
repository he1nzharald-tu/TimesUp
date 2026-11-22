# TimesUp

[![Tests](https://github.com/he1nzharald-tu/TimesUp/actions/workflows/tests.yml/badge.svg)](https://github.com/he1nzharald-tu/TimesUp/actions/workflows/tests.yml)

Das Partyspiel **Time's Up!** als Web-App für Handy und Tablet. Die App läuft im Browser, lässt sich wie eine normale App auf den Startbildschirm legen und funktioniert danach auch ohne Internet.

## Spielidee

Zwei oder mehr Teams erraten reihum Begriffe aus einem gemeinsamen Kartenstapel. Wer dran ist, hat pro Zug eine feste Zeit, um seinem Team möglichst viele Karten zu erklären. Jede erratene Karte bringt einen Punkt.

Gespielt wird über mehrere Runden **mit denselben Karten**, und jede Runde ist schwieriger:

1. **Nur beschreiben:** Erklären mit beliebig vielen Worten, aber ohne den Begriff selbst.
2. **Nur ein Wort:** Genau ein Wort als Hinweis.
3. **Pantomime und Geräusche:** Ohne Worte.

Weil alle die Karten aus den vorherigen Runden kennen, entstehen schnell Insider-Hinweise. Das Team mit den meisten Punkten nach der letzten Runde gewinnt.

## Funktionen

- **Spieler und Teams:** Spieler hinzufügen, 2 oder mehr Teams zufällig oder von Hand zusammenstellen
- **Handicap:** Ausgewählte Spieler bekommen mehr Zeit pro Zug
- **Über 3.700 Karten:** kurze Erklärungen (höchstens 80 Zeichen), eingeteilt in 4 Schwierigkeitsstufen (Kinder, Mittel, Schwer, Experte) und 22 Themen plus NSFW
- **Kartenauswahl nach Geschmack:** Stufen, Themen und 16 Decks à 60 Karten frei kombinierbar (8 breite Decks wie „Fantasy-Filme & Serien“ oder „80er/90er/2000er-Kult“, 8 Franchise-Decks wie Harry Potter, Star Wars oder Pokémon). Eine Karte ist dabei, wenn ihre Stufe passt und eines ihrer Themen **oder** ihr Deck gewählt ist. NSFW-Karten nur, wenn ausdrücklich eingeschaltet. Die Einstellungen zeigen, wie viele Karten passen, und warnen, wenn es zu wenige sind
- **Kartenauswahl im Spiel:** Zufällig oder jeder Spieler zieht seine Karten selbst und darf per Veto Karten tauschen
- **Runden frei einstellbar:** Anzahl, Regel (auch eigene Regeln), Zeit pro Zug
- **Überspringen:** Pro Runde erlauben oder verbieten, mit oder ohne Limit; übersprungene Karten kommen im selben Zug wieder (abschaltbar)
- **Regelverstoß:** Karte als Fehler werten; Strafzeit und Punktabzug („Ja“ −1, „Remi“ −0,5 pro Fehler, nie unter 0) sind getrennt einstellbar
- **Pause:** Pausieren, auf Wunsch mit 3 Sekunden extra
- **Nach Zeitablauf:** Erratene Karten korrigieren („Nicht erraten“ oder „Regelverstoß“ mit Punktabzug) oder die letzte Karte noch als richtig werten
- **Auswertung:** Rundenstatistik und Endbildschirm mit Gewinnerteam
- **Spiel fortsetzen:** Der Spielstand wird nach jeder Karte und jedem Zugwechsel gesichert. Schließt das Handy die App oder wird neu geladen, bietet der Startbildschirm „Fortsetzen“ an; ein unterbrochener Zug gilt dabei als beendet
- **Archiv:** Gespeicherte Spiele mit Spielern; bereits gespielte Karten werden beim nächsten Spiel derselben Gruppe nicht noch einmal gezogen. Über „Exportieren“ und „Importieren“ lässt sich das Archiv als Datei auf ein anderes Gerät mitnehmen (gleiche Spiele werden zusammengeführt)
- **Einstellungen:** Bereiche Karten · Spiel · Fairness · Design mit Symbolleiste (Hochformat oben, Querformat links), Stepper, Schaltern und Rundenkarten zum Antippen; jede Änderung wird sofort gespeichert
- **Für Handy gebaut:** Gestaltet für das iPhone 16 Pro, getestet auf 13 Geräteprofilen von 320 bis 1376 px Breite (iPhone SE bis iPad Pro, Galaxy S24, iPad Split View). Notch, Dynamic Island und Home-Leiste werden freigehalten
- **Querformat im Spiel:** Begriff groß links, Richtig/Überspringen/Fehler senkrecht rechts in Daumenreichweite; Hochformat funktioniert genauso
- **Bildschirm bleibt an:** Während eines Zugs geht das Display nicht aus (Screen Wake Lock, iOS ab 16.4)
- **Nochmal spielen:** Am Spielende mit denselben Teams und neuen Karten weitermachen; das Spiel landet in derselben Spielgruppe im Archiv
- **Statistik am Spielende:** Knopf „Statistik“ auf dem Endbildschirm mit Reitern *Überblick* (Punkteverlauf über die Runden, Spieler mit Auszeichnungen wie MVP, Blitzmerker, Last-Second-Held, Serienmeister, Teamplayer, Skip-König, Pechvogel), *Spieler* (erklärt, Ø pro Zug, Trefferquote, Ø Sekunden, beste Serie, Treffer in der letzten Sekunde, Überspringen, Fehler) und *Begriffe* (härteste Begriffe, Lerneffekt von Runde 1 zu späteren Runden, schnellster Begriff); auch für jedes Spiel im Archiv
- **Archiv mit Statistik:** Jede Spielgruppe sammelt ihre Spiele mit Teams (dürfen wechseln), Punkten je Runde, Regeln, Kartenauswahl und Strafen. Reiter *Spiele* (Spiel antippen zeigt die Runden), *Statistik* (Siegertreppchen, Duo-Bilanz – welche Paare zusammen gewinnen –, Rekorde wie meiste Punkte in einer Runde, längste Serie, knappster Sieg) und *Karten*; einzelne Gruppen lassen sich exportieren
- **Darstellung:** Sechs Designs – Hell, Dunkel, Brettspiel, Gameshow, Retro Arcade und Pastell (Einstellungen › Design, mit Vorschau; Kontraste nach WCAG AA), Linien-Symbole, funktioniert auch mit 130 % Systemschrift
- **Offline:** Nach dem ersten Aufruf funktioniert die App ohne Internet; sie lädt nichts von fremden Servern
- **Updates:** Liegt eine neue Version bereit, zeigt der Startbildschirm „Neue Version – neu laden“; mitten im Spiel wird nie aktualisiert

## Lokal starten

Die App braucht einen kleinen Webserver. Direkt per Doppelklick auf `index.html` funktioniert sie nicht, weil der Browser dann keine Module und keine Kartendatei lädt.

```bash
python3 -m http.server 8000
```

Danach im Browser `http://localhost:8000` öffnen.

Zum Testen auf dem Handy im selben WLAN `http://<IP-des-Rechners>:8000` aufrufen. Der Offline-Modus und die Installation als App funktionieren allerdings nur über HTTPS oder `localhost`.

## Als App installieren

Die App muss dafür über HTTPS erreichbar sein, zum Beispiel über GitHub Pages (Repository → Settings → Pages → Branch `main`).

- **iPhone/iPad (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“ (die App zeigt dazu einmalig einen Hinweis). Startbilder für alle aktuellen Geräte sind hinterlegt (`scripts/make_splash.py`)
- **Android (Chrome):** Knopf „Installieren“ im Hinweis auf dem Startbildschirm oder Menü ⋮ → „App installieren“
- **Rechner (Chrome/Edge):** Installations-Symbol rechts in der Adressleiste

Nach dem ersten Start sind alle Dateien gespeichert, und die App läuft auch offline.

## Karten pflegen

Die Karten werden in Excel gepflegt und für die App nach JSON exportiert.

1. `data/db_Karten.xlsx` öffnen, Blatt **Karten** bearbeiten. Die Spalten werden über die Kopfzeile erkannt:

   | Spalte | Inhalt |
   |---|---|
   | Begriff | das zu erratende Wort |
   | Erklärung | wird im Spiel auf Antippen angezeigt, siehe Regeln unten |
   | Schwierigkeit | genau eine Stufe: Kinder, Mittel, Schwer oder Experte (Auswahlliste) |
   | Themen | ein oder mehrere Themen, mit Komma getrennt, z. B. `Tiere & Natur, Allgemeinwissen`; Namen mit Komma wie `80er, 90er & 2000er` werden erkannt |
   | Deck | optional, höchstens ein Deck, z. B. `Star Wars` oder `Anime-Hits` (Auswahlliste) |
   | ID | feste Kennung der Karte – nicht ändern, bei neuen Karten leer lassen |

   Erlaubte Stufen, Themen und Decks stehen in `data/kategorien.json` (zum Nachschlagen auch im Blatt **Kategorien**). Zeilen ohne Begriff oder Erklärung werden ignoriert.
2. Export ausführen (nur Python 3 nötig):
   ```bash
   python3 scripts/export_cards.py --ids-eintragen
   ```
   Das Skript schreibt `data/cards.json`. Unbekannte Stufen oder Themen und doppelte IDs brechen den Export ab. Neue Karten bekommen eine ID; mit `--ids-eintragen` wird sie in die Excel-Datei zurückgeschrieben (dafür `pip install openpyxl`).
3. Karten prüfen:
   ```bash
   python3 scripts/check_cards.py            # Übersicht
   python3 scripts/check_cards.py --liste    # jede Auffälligkeit mit Zeilennummer
   python3 scripts/check_cards.py --csv bericht.csv
   ```
4. `CACHE_VERSION` hochzählen (siehe unten).
5. `data/db_Karten.xlsx` und `data/cards.json` gemeinsam committen.

Die ID steht fest in der Excel-Datei. Eine Erklärung kann darum überarbeitet werden, ohne dass die Karte als neu gilt – das Archiv sperrt sie bei bestehenden Spielgruppen weiter.

### Regeln für Erklärungen

- höchstens **80 Zeichen** (auf dem kleinsten Handy, 360 × 640, sind das höchstens 3 Zeilen; bis etwa 120 Zeichen passt es noch, darüber wird es eng)
- Aufbau: Was ist es + 1–2 Erkennungsmerkmale
- der Begriff und sein Wortstamm kommen nicht vor (also nicht „Schreibtischunterlage: Unterlage auf dem Tisch“)
- Personen: Rolle + bekanntestes Werk oder größter Erfolg
- einfache Sprache, neutral, ohne Wertung; Kinder-Karten kindgerecht
- Politikerinnen und Politiker erst ab Stufe Schwer
- Karten nur für Erwachsene bekommen ausschließlich das Thema **NSFW**; sie kommen nur ins Spiel, wenn NSFW ausdrücklich gewählt ist

`check_cards.py` prüft Länge, Begriff/Wortstamm, doppelte Begriffe, die Politik- und die NSFW-Regel automatisch.

## Wichtig: CACHE_VERSION hochzählen

Installierte Apps laden ihre Dateien aus dem Offline-Speicher, nicht aus dem Netz. Damit Änderungen bei den Spielern ankommen, muss bei **jeder Änderung an App-Dateien** (HTML, CSS, JavaScript, Karten, Töne, Icons) die Version in `service-worker.js` erhöht werden:

```js
const CACHE_VERSION = 'v18';  // vorher 'v17'
```

Beim nächsten Online-Start lädt die App die neue Version im Hintergrund. Auf dem Startbildschirm erscheint dann „Neue Version – neu laden“; nach dem Antippen läuft die neue Version, der alte Speicher wird gelöscht.

Neue Dateien, die die App lädt, müssen außerdem in die Liste `APP_FILES` in `service-worker.js`, sonst fehlen sie offline.

## Tests

Unter `tests/` liegen automatische Tests, die die App in einem echten Browser durchspielen (Playwright):

- komplette Partien mit 2 und 3 Teams, mit und ohne Veto, auch auf einem kleinen Handy im Hochformat
- Strafzeit (auch bei Zugende und Pause) und Punktabzug (Ja/Remi, nie unter 0)
- Überspringen mit und ohne Zurücklegen
- Karten-IDs, doppelte Begriffe, alte Archiv-Einträge, Archiv-Export und -Import, gleichmäßiges Mischen
- `data/cards.json` passt zu `data/db_Karten.xlsx`; Export- und Prüfskript (Spalten, Stufen, Themen, Decks, Regeln für Erklärungen)
- Kartenfilter (Stufen, Themen, Decks, NSFW) in Logik, Spiel und Einstellungen
- Neue Einstellungen: Reiter, Stepper, Schalter, Rundenkarten, sofortiges Speichern
- Offline-Modus, Hinweis auf neue Version, keine Anfragen an fremde Server
- Spiel fortsetzen nach Neuladen (zwischen Zügen, mitten im Zug, in der Rundenstatistik)
- Dialoge, Standardwerte, App-Gerüst füllt jedes Gerät, Safe Areas
- Bildschirm bleibt im Zug an, „Nochmal spielen“, Installationshinweis auf dem iPhone

Einmalig einrichten:

```bash
pip install -r tests/requirements.txt
python3 -m playwright install chromium
```

Alle Tests ausführen (im Repo-Ordner):

```bash
python3 tests/e2e.py
```

Auf GitHub laufen alle Tests automatisch bei jedem Push und Pull Request (`.github/workflows/tests.yml`, Reiter „Actions“); das Abzeichen oben zeigt den letzten Stand.

Einzelne Tests: `python3 tests/e2e.py test_dialogs test_full_game_two_teams`. Ein eigener Chrome lässt sich mit `CHROME_PATH=/pfad/zu/chrome` nutzen.

### Layout auf allen Geräten prüfen

`tests/layout.py` spielt auf 13 Geräteprofilen (iPhone 16 Pro hoch/quer/Safari, SE, Pro Max, Galaxy S24, iPad mini, Air, Pro, Split View, Slide Over) eine Partie durch, fotografiert jeden Bildschirm mit eingeblendeten Systembereichen (Dynamic Island, Home-Leiste) und prüft automatisch:

- **Fehler:** Bedienelement unter Insel/Home-Leiste oder außerhalb des Bildschirms, abgeschnittener Inhalt, zu kleine Liste trotz freiem Platz, Hauptaktion nicht sichtbar
- **Hinweise:** Tippfläche unter 44 × 44 px, Text unter 12 px, Eingabefeld unter 16 px, Kontrast unter WCAG AA

```bash
python3 tests/layout.py                         # alle Geräte, hell
python3 tests/layout.py iphone16pro --dark      # ein Gerät, hell und dunkel
python3 tests/layout.py --font-scale 1.3        # mit größerer Systemschrift
python3 tests/layout.py --themes brett,gameshow,arcade,pastell   # weitere Designs
python3 tests/layout.py --strict                # Exit-Code 1 bei Fehlern
```

Ergebnis in `tests/layout-out/`: `report.txt` und je Gerät ein Übersichtsbild `sheet_<gerät>.png`. Auf GitHub läuft die Prüfung bei jedem Push mit; die Aufnahmen liegen im Lauf unter „Artifacts → layout-aufnahmen“.

**Neues Design anlegen:** in `css/themes.css` einen Block `.theme-<name>` mit den Farbvariablen aus `css/base.css` (und `--set-*` für die Einstellungen) anlegen, den Namen in `THEMES` in `js/settings.js` und im frühen Skript im Kopf von `index.html` eintragen, eine Option in `#themeSelect` und eine Vorschau `.theme-swatch-<name>` ergänzen.

**Layoutregeln** (siehe Kopf von `css/layout.css`): Breitenstufen XS < 360, S 360–429 (Referenz iPhone 16 Pro), M 430–599, L 600–959, XL ≥ 960 px und „Handy quer“ (Höhe < 500 px). Jeder Bildschirm ist eine Spalte aus Kopfzeile, scrollendem Inhalt und Aktionsleiste unten; Abstände zum Rand immer über `--sa-top/right/bottom/left`.

### Aussehen vorher/nachher vergleichen

```bash
python3 tests/shots.py /tmp/vorher light      # vor der Änderung (auch: dark)
python3 tests/shots.py /tmp/nachher light     # nach der Änderung
python3 tests/compare.py /tmp/vorher /tmp/nachher
```

Mit `DUMP=1` vor `shots.py` werden zusätzlich die berechneten Stile aller Elemente gespeichert; `python3 tests/compare_styles.py /tmp/vorher /tmp/nachher` zeigt jede Abweichung.

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `index.html` | Alle Bildschirme der App |
| `css/base.css` | Farben (hell/dunkel), Schrift, Knöpfe, Kopfzeile, Teamkarten, Overlays |
| `css/layout.css` | App-Gerüst, Safe Areas, Breitenstufen, Design-Variablen |
| `css/screens.css` | Die einzelnen Bildschirme inkl. Querformat und Tablet |
| `css/themes.css` | Zusätzliche Designs: Brettspiel, Gameshow, Retro Arcade, Pastell |
| `css/effects.css` | Feuerwerk, eigene Dialoge, Animationen |
| `css/settings.css` | Einstellungsseite (Symbolleiste, Stepper, Schalter, Kacheln) |
| `css/fonts.css`, `fonts/` | Schrift Fredoka (lokal, SIL Open Font License) |
| `js/main.js` | Einstieg: lädt Einstellungen und Karten |
| `js/state.js` | Gemeinsamer Spielzustand |
| `js/settings.js` | Einstellungen speichern/laden, Runden, Design |
| `js/settingsui.js` | Bedienung der Einstellungsseite (Reiter, Stepper, Filter-Kacheln) |
| `js/filter.js` | Kartenfilter nach Stufen, Themen, Decks und NSFW |
| `js/cards.js` | Karten laden, IDs, Archiv, Kartenauswahl |
| `js/game.js` | Spieler, Teams, Runden, Timer, Punkte |
| `js/ui.js` | Bildschirmwechsel, Dialoge, Listen |
| `js/teamview.js` | Teamkarten, Teamnamen/-farben, Linien-Symbole |
| `js/wakelock.js` | Bildschirm bleibt während eines Zugs an |
| `js/gamestats.js` | Spielverlauf und Statistik fürs Archiv |
| `js/statsview.js` | Statistik-Seite eines Spiels |
| `js/archiveview.js` | Archiv-Bildschirm (Spielgruppen, Spiele, Statistik, Karten) |
| `js/audio.js` | Countdown-Ton und Alarm |
| `js/pwa.js` | Offline-Modus, Hinweis auf neue Version, Installationshinweis |
| `js/persist.js` | Spielstand sichern und fortsetzen |
| `data/db_Karten.xlsx` | Kartendatenbank zum Bearbeiten |
| `data/cards.json` | Exportierte Karten, die die App lädt |
| `data/kategorien.json` | Stufen, Themen und Decks (Namen, Symbole) |
| `scripts/export_cards.py` | Export von Excel nach JSON |
| `scripts/check_cards.py` | Prüft Karten auf die Regeln (Länge, Begriff in der Erklärung, Dubletten …) |
| `scripts/kartendaten.py` | Gemeinsame Funktionen der Kartenskripte |
| `scripts/make_splash.py` | Erzeugt die Startbilder in `icons/splash/` |
| `tests/` | Spieltests (`e2e.py`), Layoutprüfung (`layout.py`), Screenshot-Vergleich |
| `.github/workflows/tests.yml` | Führt die Tests auf GitHub aus |
| `assets/` | Töne |
| `icons/` | App-Icons; `icon-1024.png` ist die Vorlage |
| `manifest.json` | Angaben für die Installation als App |
| `service-worker.js` | Offline-Speicher |

Zur Fehlersuche stehen im Browser alle Funktionen und der Spielzustand unter `window.TimesUp` bereit, zum Beispiel `TimesUp.state.players`.
