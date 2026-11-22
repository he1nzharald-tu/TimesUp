"""Screenshots aller Bildschirme in sechs Bildschirmgrößen, z. B. um Änderungen am Aussehen zu prüfen.

    python3 tests/shots.py /tmp/vorher [light|dark]
    ... Änderung machen ...
    python3 tests/shots.py /tmp/nachher [light|dark]
    python3 tests/compare.py /tmp/vorher /tmp/nachher

Mit DUMP=1 werden zusätzlich die berechneten Stile aller Elemente gespeichert
(Vergleich mit tests/compare_styles.py).
"""
import sys, copy, os, json
from pathlib import Path
from harness import *
from e2e import add_players, active

VIEWPORTS = {
    "phone_portrait": (390, 844),
    "small_portrait": (360, 640),
    "phone_landscape": (844, 390),
    "small_landscape": (640, 360),
    "tablet": (1024, 768),
    "desktop": (1280, 720),
}

DUMP_JS = """() => { const out = {}; const props = [...getComputedStyle(document.body)].filter(p => !p.startsWith('--'));
  const path = el => { const parts = []; while (el && el !== document.documentElement) { const p = el.parentElement;
      parts.unshift(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ':' + (p ? [...p.children].indexOf(el) : 0)); el = p; } return parts.join('>'); };
  const roots = [...document.querySelectorAll('.screen.active, .app-dialog-backdrop, #pauseOverlay, #guessedOverlay, #archiveOverlay')];
  for (const r of roots) for (const el of [r, ...r.querySelectorAll('*')]) {
      const cs = getComputedStyle(el); const o = {}; for (const p of props) o[p] = cs.getPropertyValue(p);
      for (const pe of ['::before', '::after']) { const ps = getComputedStyle(el, pe); if (ps.content !== 'none') o[pe] = props.map(p => ps.getPropertyValue(p)).join('|'); }
      out[path(el)] = o; }
  return out; }"""

def snap(page, out, name):
    tick(page, 1000)
    page.evaluate("document.fonts.ready.then(() => true)")
    if os.environ.get("DUMP"):
        json.dump(page.evaluate(DUMP_JS), open(out / f"{name}.json", "w"))
    page.screenshot(path=str(out / f"{name}.png"), animations="disabled")

def overflow(page):
    return page.evaluate("""() => { const w = document.documentElement.clientWidth; const bad = [];
        document.querySelectorAll('.screen.active *, .app-dialog *, #guessedOverlay *, #pauseOverlay *').forEach(el => {
            const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
            if (r.width > 0 && st.visibility !== 'hidden' && (r.right > w + 1 || r.left < -1)) {
                let p = el.parentElement, clipped = false;
                while (p) { const ps = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(ps.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= w + 1 && pr.left >= -1) { clipped = true; break; } } p = p.parentElement; }
                if (!clipped) bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].join('.')) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
            } });
        return [document.documentElement.scrollWidth > w, bad.slice(0, 6)]; }""")

def run(out, theme="light", vps=None):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    report = {}
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s["cardCount"] = 4; s["roundCount"] = 2; s["roundTimer"] = [30, 30]
    with server() as base, browser() as b:
        for vp_name, vp in (vps or VIEWPORTS).items():
            page = new_page(b, base, s, viewport=vp, theme=theme)
            def shot(name):
                snap(page, out, f"{vp_name}__{name}")
                report[f"{vp_name}__{name}"] = overflow(page)
            add_players(page, ["Anna", "Benedikt", "Cem", "Dorothea"])
            page.evaluate("TimesUp.state.players[1].handicap = true; updatePlayerTable()")
            shot("01_start")
            page.click("button:has-text('⚙️')"); shot("02_settings")
            page.evaluate("validateSettingsAndGoBack()")
            page.click("text=Weiter"); shot("03_dialog"); ok(page)
            shot("04_teamauswahl")
            page.click("text=Zufällige Teams"); shot("05_teamuebersicht")
            page.click("text=Kartenauswahl mit Veto"); ok(page); tick(page, 200)
            shot("06_kartenauswahl_start")
            page.click("#cardSelectionInfo"); shot("07_kartenauswahl_karten")
            for i in range(4):
                if i: tick(page, 200); page.click("#cardSelectionInfo")
                page.click("#cardDoneButton"); ok(page)
            shot("08_kartenauswahl_fertig")
            page.click("#startGameOverviewButton"); shot("09_spieluebersicht")
            page.click("#screen-spieluebersicht >> text=Spiel starten"); shot("10_rundenstart")
            page.click("#startRoundBtn"); ok(page); shot("11_spiel")
            page.click("#currentCardDisplay"); shot("12_spiel_erklaerung")
            page.click(".play-pause"); shot("13_pause")
            page.locator("#pauseOverlay button", has_text="Weiter").click()
            page.click("#btnCorrect"); tick(page, 31000); shot("14_zeit_vorbei")
            page.locator("#guessedOverlay button", has_text="korrigieren").click(); shot("15_korrektur")
            page.locator("#guessedOverlay button", has_text="Zurück").click()
            page.locator("#guessedOverlay button", has_text="Nächster Spieler").click()
            for _ in range(20):
                if active(page) != "screen-roundstart": break
                page.click("#startRoundBtn"); ok(page)
                for _ in range(4):
                    if page.locator("#guessedOverlay").count(): break
                    page.click("#btnCorrect")
                if not page.locator("#guessedOverlay").count(): tick(page, 31000)
                page.locator("#guessedOverlay button", has_text="Nächster Spieler").click()
            shot("16_rundenstatistik")
            page.click("text=Nächste Runde starten")
            for _ in range(20):
                if active(page) != "screen-roundstart": break
                page.click("#startRoundBtn"); ok(page)
                for _ in range(4):
                    if page.locator("#guessedOverlay").count(): break
                    page.click("#btnCorrect")
                if not page.locator("#guessedOverlay").count(): tick(page, 31000)
                page.locator("#guessedOverlay button", has_text="Nächster Spieler").click()
            shot("17_ende")
            page.click("text=Zurück zum Start")
            page.click("#loadSavesButton"); shot("18_archiv")
            page.context.close()
    return report

if __name__ == "__main__":
    rep = run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "light")
    for k, (scroll, bad) in rep.items():
        if scroll or bad: print(k, "HSCROLL" if scroll else "", bad)
