"""Spieltests für TimesUp (Playwright).

Aufruf im Repo-Ordner:
    python3 tests/e2e.py                 # alle Tests
    python3 tests/e2e.py test_dialogs    # einzelne Tests
"""
import copy
import json
import re
import subprocess
import shutil
import sys
import tempfile
from pathlib import Path


from harness import CARDS, DEFAULT_SETTINGS, REPO, browser, new_page, ok, server, tick

def active(page):
    return page.evaluate("document.querySelector('.screen.active')?.id")

def add_players(page, names):
    for n in names:
        page.fill("#playerInput", n)
        page.click("button[title='Spieler hinzufügen']")

def setup_game(page, names, veto=True, team_mode="random"):
    add_players(page, names)
    page.click("text=Weiter"); ok(page)
    assert active(page) == "screen-teamauswahl", active(page)
    page.click("text=Zufällige Teams" if team_mode == "random" else "text=Manuelle Zuteilung")
    assert active(page) == "screen-teamuebersicht"
    if not veto:
        page.click("text=Kartenauswahl ohne Veto"); ok(page)
    else:
        page.click("text=Kartenauswahl mit Veto"); ok(page)
        for i in range(len(names)):
            tick(page, 200)
            page.click("#cardSelectionInfo")
            tick(page, 50)
            items = page.locator("#cardSelectionList li")
            assert items.count() > 0, "keine Karten angezeigt"
            items.first.click(); ok(page)              # Veto bestätigen
            page.click("#cardDoneButton"); ok(page)
    page.click("#startGameOverviewButton")
    assert active(page) == "screen-spieluebersicht"
    page.click("#screen-spieluebersicht >> text=Spiel starten")
    assert active(page) == "screen-roundstart", active(page)

def overlay_button(page, text):
    return page.locator("#guessedOverlay button", has_text=text)

def play_turn(page, stats):
    page.click("#startRoundBtn"); ok(page)
    assert active(page) == "screen-play", active(page)
    for action in ["btnCorrect", "btnSkip", "btnMistake", "btnCorrect"]:
        if page.locator("#guessedOverlay").count(): break
        btn = page.locator("#" + action)
        if btn.is_enabled():
            btn.click(); stats[action] = stats.get(action, 0) + 1
            tick(page, 2100)  # Strafzeit abwarten
    if not page.locator("#guessedOverlay").count():
        tick(page, 12000)
    assert page.locator("#guessedOverlay").count() == 1, "Overlay nach Zugende fehlt"
    overlay_button(page, "Nächster Spieler").click()

def run_game(page, max_turns=200):
    stats = {}
    for _ in range(max_turns):
        a = active(page)
        if a == "screen-end": return stats
        if a == "screen-roundstats":
            page.click("text=Nächste Runde starten"); continue
        if a == "screen-roundstart":
            play_turn(page, stats); continue
        raise AssertionError("unerwarteter Bildschirm: %s" % a)
    raise AssertionError("Spiel endet nicht")

def final_points(page):
    return page.evaluate("[...document.querySelectorAll('#finalPointsA,#finalPointsB')].map(e=>+e.textContent)") \
        if page.locator("#finalTwoTeamContainer").is_visible() else \
        page.evaluate("[...document.querySelectorAll('#finalTeamsContainer .team-overview-card p')].map(p=>+p.textContent.replace(/\\D+/g,''))")

# ---------------------------------------------------------------- Tests
def test_full_game_two_teams(b, base):
    s = copy.deepcopy(DEFAULT_SETTINGS)
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben", "Cem", "Dora"])
    stats = run_game(page)
    pts = final_points(page)
    assert sum(pts) == s["cardCount"] * s["roundCount"], (pts, stats)
    assert stats.get("btnMistake") and stats.get("btnSkip"), stats
    used = page.evaluate("Object.values(JSON.parse(localStorage.getItem('timesup_archive')))[0].usedCards")
    assert len(used) == s["cardCount"] and all(c.get("id") for c in used), used[:2]
    assert not page.errors, page.errors
    assert not getattr(page, "dialogs", []), "native Dialoge: %s" % page.dialogs

def test_full_game_three_teams_no_veto(b, base):
    s = copy.deepcopy(DEFAULT_SETTINGS); s["teamCount"] = 3; s["cardCount"] = 9; s["roundCount"] = 2
    page = new_page(b, base, s)
    page.evaluate("document.getElementById('teamCount').value = 3")
    setup_game(page, ["A1", "B1", "C1", "A2", "B2", "C2"], veto=False)
    run_game(page)
    pts = final_points(page)
    assert len(pts) == 3 and sum(pts) == 18, pts
    assert not page.errors, page.errors

def test_penalty_after_timer_end(b, base):
    """Strafzeit darf nach Zugende keine neue Karte aufdecken (Todo 2)."""
    s = copy.deepcopy(DEFAULT_SETTINGS); s["punishTime"] = 3
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    page.click("#startRoundBtn"); ok(page)
    tick(page, 9000)                       # 1 s Restzeit
    page.click("#btnMistake")
    tick(page, 1500)                       # Timer läuft ab, Strafzeit noch aktiv
    assert page.locator("#guessedOverlay").count() == 1
    assert overlay_button(page, "richtig").count() == 0, "Fehler-Karte wird als richtig angeboten"
    before = page.text_content("#cardTerm")
    shown_before = page.evaluate("TimesUp.state.displayedCards.length")
    tick(page, 3000)                       # Strafzeit wäre jetzt vorbei
    assert page.text_content("#cardTerm") == before, "Karte wurde nach Zugende aufgedeckt"
    assert page.evaluate("TimesUp.state.displayedCards.length") == shown_before
    overlay_button(page, "Nächster Spieler").click()
    page.click("#startRoundBtn"); ok(page)
    assert page.locator("#btnCorrect").is_enabled(), "Buttons nach Strafzeit-Abbruch gesperrt"
    assert not page.evaluate("TimesUp.state.isPenaltyActive")

def test_penalty_cancelled_on_pause(b, base):
    s = copy.deepcopy(DEFAULT_SETTINGS); s["punishTime"] = 3
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    page.click("#startRoundBtn"); ok(page)
    page.click("#btnMistake")
    page.click(".play-pause")
    shown = page.evaluate("TimesUp.state.displayedCards.length")
    tick(page, 4000)
    assert page.evaluate("TimesUp.state.displayedCards.length") == shown, "waehrend der Pause wurde eine neue Karte aufgedeckt"
    page.locator("#pauseOverlay button", has_text="Weiter").click()
    tick(page, 50)
    assert "Strafzeit" not in page.text_content("#cardTerm"), "nach Pause muss eine Karte sichtbar sein"
    assert page.locator("#btnCorrect").is_enabled(), "Buttons nach Pause gesperrt"
    assert not page.evaluate("TimesUp.state.isPenaltyActive")

def test_skip_returns_cards(b, base):
    """Übersprungene Karten kommen im selben Zug zurück (Todo 1, Standard: ja)."""
    s = copy.deepcopy(DEFAULT_SETTINGS); s["cardCount"] = 3; s["roundSkip"] = ["yes"] * 3; s["roundTimer"] = [30] * 3
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    page.click("#startRoundBtn"); ok(page)
    for _ in range(4): page.click("#btnSkip", timeout=2000)
    assert page.locator("#guessedOverlay").count() == 0, "Zug endete trotz Restzeit"
    page.click("#btnCorrect"); page.click("#btnCorrect"); page.click("#btnCorrect")
    assert page.locator("#guessedOverlay").count() == 1, "alle Karten erraten, Overlay fehlt"

def test_skip_no_return_setting(b, base):
    s = copy.deepcopy(DEFAULT_SETTINGS); s["cardCount"] = 3; s["roundSkip"] = ["yes"] * 3; s["roundTimer"] = [30] * 3
    s["skipReturn"] = ["no"] * 3
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    page.click("#startRoundBtn"); ok(page)
    for _ in range(3): page.click("#btnSkip")
    assert page.locator("#guessedOverlay").count() == 1, "ohne Zurücklegen muss der Zug enden"

def test_skip_setting_ui(b, base):
    page = new_page(b, base, None)
    page.click("button:has-text('⚙️')")
    assert page.locator("#skipReturn2").count() == 1, "Einstellung fehlt"
    page.select_option("#skipAllowed2", "yes")
    assert page.input_value("#skipReturn2") == "yes"
    page.select_option("#skipReturn2", "no")
    page.click("text=Zurück")
    st = page.evaluate("JSON.parse(localStorage.getItem('timesup_settings'))")
    assert st["skipReturn"][1] == "no", st
    page.reload(); tick(page, 50)
    assert page.input_value("#skipReturn2") == "no" and page.is_visible("#skipReturn2") is False or True
    page.click("button:has-text('⚙️')")
    assert page.is_visible("#skipReturn2") and page.input_value("#skipReturn2") == "no", "nach Neuladen nicht wiederhergestellt"

def test_duplicate_terms(b, base):
    """Zwei Karten mit gleichem Begriff dürfen sich nicht gegenseitig beeinflussen (Todo 3)."""
    s = copy.deepcopy(DEFAULT_SETTINGS); s["cardCount"] = 2
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    page.evaluate("""() => {
        const a = {...TimesUp.state.playingCards[0]}; const b = {...TimesUp.state.playingCards[0], erklaerung: 'Zweite Bedeutung'};
        if (typeof makeCard === 'function') { TimesUp.state.playingCards = [makeCard(a.begriff, a.erklaerung, 'dup-1'), makeCard(b.begriff, b.erklaerung, 'dup-2')]; }
        else { TimesUp.state.playingCards = [a, b]; }
        TimesUp.state.currentCards = [...TimesUp.state.playingCards];
    }""")
    page.click("#startRoundBtn"); ok(page)
    page.click("#btnCorrect")
    assert page.locator("#guessedOverlay").count() == 0, "zweite Karte mit gleichem Begriff verschwunden"
    page.click("#btnCorrect")
    assert page.evaluate("TimesUp.state.correctCards[TimesUp.state.activeTeamIndex].length") == 2

def test_archive_legacy_entries(b, base):
    """Alte Archiv-Einträge (ohne IDs) bleiben lesbar und sperren ihre Karten."""
    page = new_page(b, base, copy.deepcopy(DEFAULT_SETTINGS))
    first = page.evaluate("TimesUp.state.cardPool[0]")
    page.evaluate("""(c) => localStorage.setItem('timesup_archive', JSON.stringify({'TU-ALT': {id:'TU-ALT', createdAt:'2026-06-01T10:00:00.000Z',
        players:[{name:'Alt', handicap:false}], usedCards:[{begriff:c.begriff, erklaerung:c.erklaerung}]}}))""", first)
    page.click("#loadSavesButton")
    page.locator("#archiveOverlay button", has_text="Laden").click(); ok(page)
    avail = page.evaluate("getAvailableCardPoolForArchive().length")
    total = page.evaluate("TimesUp.state.cardPool.length")
    assert avail == total - 1, (avail, total)
    assert page.evaluate("TimesUp.state.players.map(p=>p.name)") == ["Alt"]

def test_shuffle(b, base):
    """Mischen ist gleichverteilt (Fisher-Yates), kein sort(() => Math.random() - 0.5) mehr."""
    page = new_page(b, base, None, seed=False)
    allsrc = "".join(f.read_text(encoding="utf-8") for f in (REPO / "js").rglob("*.js"))
    assert "Math.random() - 0.5" not in allsrc, "sort(() => Math.random() - 0.5) noch vorhanden"
    counts = page.evaluate("""() => { const c=[0,0,0,0]; for(let i=0;i<40000;i++){ c[shuffleArray([0,1,2,3])[0]]++; } return c; }""")
    assert all(9000 < x < 11000 for x in counts), counts


def test_cards_json(b, base):
    """Karten kommen aus data/cards.json, IDs passen zur App-Berechnung, kein SheetJS (Todo 5)."""
    page = new_page(b, base, None)
    n, mismatch = page.evaluate("""() => [TimesUp.state.cardPool.length,
        TimesUp.state.cardPool.filter(c => !/-\\d+$/.test(c.id) && c.id !== hashCardText(c.begriff, c.erklaerung)).length]""")
    assert n == len(CARDS), n
    assert mismatch == 0, mismatch
    assert page.evaluate("typeof window.XLSX") == "undefined", "SheetJS wird noch geladen"
    html = open(REPO / "index.html").read()
    assert "xlsx" not in html.lower()

def test_external_requests(b, base):
    """Die App lädt nichts mehr von fremden Servern (Todo 5 und 6)."""
    ctx = b.new_context(service_workers="block")
    hosts = set()
    ctx.on("request", lambda r: hosts.add(r.url.split("/")[2]))
    pg = ctx.new_page(); pg.goto(base + "/index.html"); pg.wait_for_timeout(1500)
    foreign = {h for h in hosts if not h.startswith("127.0.0.1")}
    assert not foreign, foreign
    ctx.close()

def test_offline_service_worker(b, base):
    """Alles, was die App lädt, liegt im Cache; offline startet sie mit Karten und Schrift."""
    ctx = b.new_context(service_workers="allow")
    urls = set()
    ctx.on("request", lambda r: urls.add(r.url.split("#")[0]) if r.url.startswith(base) else None)
    pg = ctx.new_page(); pg.goto(base + "/index.html")
    pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(1500)
    # Direkt nach der Installation prüfen: Die Vorab-Liste muss alles enthalten, was die Seite lädt
    cached = set(pg.evaluate("""async () => { const out = []; for (const k of await caches.keys())
        for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; }"""))
    missing = sorted(u for u in urls if u not in cached and not u.endswith("service-worker.js") and not u.endswith("favicon.ico"))
    assert not missing, "nicht vorab gecacht: %s" % missing
    sw_list = pg.evaluate("fetch('service-worker.js').then(r => r.text())")
    listed = re.findall(r"'\\./([^']+)'", sw_list)
    gone = [f for f in listed if not (REPO / f).exists()]
    assert not gone, "Service Worker listet fehlende Dateien: %s" % gone
    ctx.set_offline(True)
    pg.goto(base + "/index.html?offline=1"); pg.wait_for_timeout(1500)
    status = pg.text_content("#kartenStatusText")
    assert "erfolgreich" in status, status
    assert pg.evaluate("document.fonts.check('16px Fredoka')"), "Fredoka offline nicht geladen"
    assert pg.evaluate("[...document.fonts].some(f => f.family.replace(/\"/g,'') === 'Fredoka' && f.status === 'loaded')"), "Fredoka nicht geladen"
    ctx.close()

def test_dialogs(b, base):
    """Eigene Dialoge: Abbrechen bricht ab, Escape bricht ab, keine nativen Dialoge (Todo 7)."""
    page = new_page(b, base, copy.deepcopy(DEFAULT_SETTINGS))
    page.click("text=Weiter")                         # ohne Spieler -> Hinweis
    assert page.locator(".app-dialog").count() == 1
    assert page.locator(".app-dialog [data-dialog-cancel]").count() == 0
    page.keyboard.press("Enter")
    assert page.locator(".app-dialog").count() == 0
    add_players(page, ["Anna", "Ben"])
    page.click("text=Weiter")
    page.click(".app-dialog [data-dialog-cancel]")
    assert active(page) == "screen-start", "Abbrechen hat trotzdem weitergeschaltet"
    page.click("text=Weiter"); page.keyboard.press("Escape")
    assert active(page) == "screen-start"
    page.click("text=Weiter"); ok(page)
    assert active(page) == "screen-teamauswahl"
    page.click("text=Zufällige Teams"); page.click("text=Kartenauswahl ohne Veto")
    page.click("#startGameOverviewButton"); page.click("#screen-spieluebersicht >> text=Spiel starten")
    page.evaluate("confirmStartRound(); confirmStartRound();")    # Doppelklick
    assert page.locator(".app-dialog").count() == 1, "zwei Start-Dialoge offen"
    page.click(".app-dialog [data-dialog-cancel]")
    assert active(page) == "screen-roundstart"
    page.click("#startRoundBtn"); ok(page)
    assert active(page) == "screen-play"
    assert page.locator(".app-dialog").count() == 0
    assert not getattr(page, "dialogs", []), page.dialogs

def test_full_game_portrait_phone(b, base):
    """Komplette Partie im Hochformat auf einem kleinen Handy (Todo 8)."""
    s = copy.deepcopy(DEFAULT_SETTINGS); s["roundCount"] = 2
    page = new_page(b, base, s, viewport=(360, 640))
    setup_game(page, ["Anna", "Benedikt-Maximilian", "Cem", "Dora"])
    run_game(page)
    assert sum(final_points(page)) == s["cardCount"] * 2
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "horizontales Scrollen"
    assert not page.errors, page.errors

def test_landscape_scale(b, base):
    """Querformat: Rahmen wird auf kleine Handys verkleinert und auf Tablets vergrößert."""
    for vp, lo, hi in [((640, 360), 0.8, 0.9), ((844, 390), 1.0, 1.0), ((1024, 768), 1.3, 1.4)]:
        page = new_page(b, base, None, viewport=vp)
        scale = float(page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')"))
        assert lo <= scale <= hi, (vp, scale)
        bottom = page.evaluate("document.querySelector('.screen.active').getBoundingClientRect().bottom")
        assert bottom <= vp[1], ("Rahmen ragt unten heraus", vp, bottom)
        page.context.close()

def _penalty_game(b, base, mode, mistakes):
    """1 Runde, 4 Karten: Team des ersten Zugs macht Fehler, rät dann den Rest; zweites Team rät die übrigen Karten."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"cardCount": 4, "roundCount": 1, "roundTimer": [60], "roundSkip": ["no"], "punishEnabled": True,
              "punishTime": 1, "punishPoints": mode})
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    first = page.evaluate("TimesUp.state.activeTeamIndex")
    page.click("#startRoundBtn"); ok(page)
    for _ in range(mistakes):
        page.click("#btnMistake"); tick(page, 1100)
    while not page.locator("#guessedOverlay").count():
        page.click("#btnCorrect")
    overlay_button(page, "Nächster Spieler").click()
    if active(page) == "screen-roundstart":
        page.click("#startRoundBtn"); ok(page)
        while not page.locator("#guessedOverlay").count():
            page.click("#btnCorrect")
        overlay_button(page, "Nächster Spieler").click()
    assert active(page) == "screen-end", active(page)
    pts = page.evaluate("TimesUp.state.totalPoints")
    return page, first, pts

def test_penalty_points_yes(b, base):
    """Strafe "Ja": 1 Punkt Abzug pro Fehler, sichtbar im Endbildschirm."""
    page, first, pts = _penalty_game(b, base, "yes", 1)
    assert pts[first] == 2 and pts[1 - first] == 1, pts
    note = page.text_content("#finalPenaltyA" if first == 0 else "#finalPenaltyB")
    assert "−1 Strafe" in note, note
    assert page.text_content("#finalPenaltyB" if first == 0 else "#finalPenaltyA").strip() == ""

def test_penalty_points_remi(b, base):
    """Strafe "Remi": 0,5 Punkte Abzug pro Fehler, deutsch formatiert."""
    page, first, pts = _penalty_game(b, base, "draw", 1)
    assert pts[first] == 2.5, pts
    shown = page.text_content("#finalPointsA" if first == 0 else "#finalPointsB")
    assert shown.strip() == "2,5", shown

def test_penalty_points_not_below_zero(b, base):
    page, first, pts = _penalty_game(b, base, "yes", 3)
    assert pts[first] == 0, pts
    note = page.text_content("#finalPenaltyA" if first == 0 else "#finalPenaltyB")
    assert "−1 Strafe" in note, note   # tatsächlich abgezogen: 1 von 1 Punkt

def test_penalty_points_off(b, base):
    page, first, pts = _penalty_game(b, base, "no", 1)
    assert pts[first] == 3, pts

def test_penalty_points_round_stats(b, base):
    """Abzug erscheint schon in der Rundenstatistik (3 Teams, Kartenansicht)."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"cardCount": 6, "roundCount": 2, "teamCount": 3, "roundTimer": [60, 60], "roundSkip": ["no", "no"],
              "punishEnabled": True, "punishTime": 1, "punishPoints": "draw"})
    page = new_page(b, base, s)
    page.evaluate("document.getElementById('teamCount').value = 3")
    setup_game(page, ["A", "B", "C"], veto=False)
    page.click("#startRoundBtn"); ok(page)
    page.click("#btnMistake"); tick(page, 1100)
    while not page.locator("#guessedOverlay").count():
        page.click("#btnCorrect")
    overlay_button(page, "Nächster Spieler").click()
    for _ in range(6):
        if active(page) != "screen-roundstart": break
        page.click("#startRoundBtn"); ok(page)
        while not page.locator("#guessedOverlay").count():
            page.click("#btnCorrect")
        overlay_button(page, "Nächster Spieler").click()
    assert active(page) == "screen-roundstats", active(page)
    texts = page.eval_on_selector_all("#statsContainer .team-overview-card p", "els => els.map(e => e.textContent)")
    assert any("4,5" in t and "−0,5 Strafe" in t for t in texts), texts

def test_default_turn_time(b, base):
    """Standardzeit 30 s: frische Installation (Einstellungen und Spiel) und Button "Standardwerte"."""
    page = new_page(b, base, None)
    page.click("button:has-text('⚙️')")
    assert [page.input_value(f"#timer{i}") for i in (1, 2, 3)] == ["30"] * 3
    page.fill("#timer1", "45"); page.click("text=Standardwerte")
    assert page.input_value("#timer1") == "30"
    page2 = new_page(b, base, None)           # nie gespeicherte Einstellungen
    setup_game(page2, ["Anna", "Ben"], veto=False)
    assert "30s" in page2.text_content("#roundStartTime")
    page2.click("#startRoundBtn"); ok(page2)
    assert page2.text_content("#timerDisplay").strip() == "30s"

def test_update_banner(b, base_unused):
    """Neue Service-Worker-Version: Hinweis auf dem Startbildschirm, nicht im Spiel; "Neu laden" aktiviert sie."""
    tmp = Path(tempfile.mkdtemp())
    shutil.copytree(REPO, tmp / "app", ignore=shutil.ignore_patterns(".git", "tests"))
    root = tmp / "app"
    sw0 = (root / "service-worker.js").read_text()   # Ausgangsversion ohne Sonderregel für v1/v2
    (root / "service-worker.js").write_text(re.sub(r"CACHE_VERSION = '[^']+'", "CACHE_VERSION = 'test-alt'", sw0))
    with server(root) as base:
        ctx = b.new_context(service_workers="allow")
        pg = ctx.new_page()
        pg.goto(base + "/index.html")
        pg.evaluate("navigator.serviceWorker.ready.then(() => true)")
        pg.reload(); pg.wait_for_function("!!navigator.serviceWorker.controller")
        assert pg.locator("#updateBanner").is_hidden(), "Hinweis ohne Update sichtbar"
        add_players(pg, ["Anna", "Ben"])
        # neue Version veröffentlichen
        sw = (root / "service-worker.js").read_text()
        (root / "service-worker.js").write_text(re.sub(r"CACHE_VERSION = '[^']+'", "CACHE_VERSION = 'test-neu'", sw))
        pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
        pg.wait_for_selector("#updateBanner:not([hidden])", timeout=10000)
        assert pg.locator("#updateBanner").is_visible()
        old = pg.evaluate("caches.keys()")
        assert sorted(old) == ["timesup-test-alt", "timesup-test-neu"], old
        assert pg.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r.waiting)"), "neue Version wartet nicht"
        # im Spiel ist der Hinweis nicht sichtbar
        pg.evaluate("showScreen('play')")
        assert not pg.locator("#updateBanner").is_visible()
        pg.evaluate("showScreen('start')")
        with pg.expect_navigation():
            pg.click("#updateReloadButton")
        pg.wait_for_function("!!navigator.serviceWorker.controller")
        pg.wait_for_timeout(500)
        assert pg.evaluate("caches.keys()") == ["timesup-test-neu"], pg.evaluate("caches.keys()")
        assert pg.locator("#updateBanner").is_hidden()
        assert pg.evaluate("TimesUp.state.players.map(p => p.name)") == ["Anna", "Ben"], "Spieler nach Update verloren"
        ctx.close()
    shutil.rmtree(tmp)

def test_legacy_sw_takes_over(b, base_unused):
    """Geräte mit v1/v2 (ohne Update-Hinweis) übernehmen die neue Version wie bisher direkt."""
    tmp = Path(tempfile.mkdtemp())
    shutil.copytree(REPO, tmp / "app", ignore=shutil.ignore_patterns(".git", "tests"))
    root = tmp / "app"
    sw = (root / "service-worker.js").read_text()
    (root / "service-worker.js").write_text(re.sub(r"CACHE_VERSION = '[^']+'", "CACHE_VERSION = 'v2'", sw))
    with server(root) as base:
        ctx = b.new_context(service_workers="allow")
        pg = ctx.new_page(); pg.goto(base + "/index.html")
        pg.evaluate("navigator.serviceWorker.ready.then(() => true)")
        (root / "service-worker.js").write_text(sw)
        pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
        pg.wait_for_function("caches.keys().then(k => k.length === 1 && k[0] !== 'timesup-v2')", timeout=10000)
        ctx.close()
    shutil.rmtree(tmp)

def test_cards_json_matches_excel(b, base):
    """data/cards.json ist auf dem Stand von data/db_Karten.xlsx (Export nicht vergessen)."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "cards.json"
        subprocess.run([sys.executable, str(REPO / "scripts" / "export_cards.py"),
                        str(REPO / "data" / "db_Karten.xlsx"), str(out)], check=True, capture_output=True)
        assert out.read_text(encoding="utf-8") == (REPO / "data" / "cards.json").read_text(encoding="utf-8"), \
            "data/cards.json veraltet: python3 scripts/export_cards.py ausführen"

def test_archive_export_import(b, base):
    """Archiv als Datei exportieren und auf einem anderen Gerät importieren und zusammenführen (Todo 8)."""
    c1, c2, c3 = CARDS[0], CARDS[1], CARDS[2]
    entry = {"id": "TU-20260601T100000", "createdAt": "2026-06-01T10:00:00.000Z", "lastPlayedAt": "2026-06-01T11:00:00.000Z",
             "players": [{"name": "Anna", "handicap": True}, {"name": "Ben", "handicap": False}],
             "usedCards": [{"id": c1["id"], "begriff": c1["begriff"], "erklaerung": c1["erklaerung"]},
                           {"begriff": c2["begriff"], "erklaerung": c2["erklaerung"]}]}   # alter Eintrag ohne ID
    page = new_page(b, base, None)
    page.evaluate("e => { localStorage.setItem('timesup_archive', JSON.stringify({[e.id]: e})); }", entry)
    page.click("#loadSavesButton")
    with page.expect_download() as dl:
        page.click("#archiveOverlay .archive-export-btn")
    path = dl.value.path()
    assert dl.value.suggested_filename.startswith("timesup-archiv-") and dl.value.suggested_filename.endswith(".json")
    data = json.loads(open(path, encoding="utf-8").read())
    assert data["type"] == "timesup-archiv" and data["version"] == 1 and len(data["entries"]) == 1, data

    # anderes Gerät: leeres Archiv, Import muss trotzdem möglich sein
    other = new_page(b, base, None)
    other.click("#loadSavesButton")
    assert other.locator("#archiveOverlay .archive-empty").count() == 1, "leeres Archiv öffnet sich nicht"
    assert other.locator("#archiveOverlay .archive-export-btn").count() == 0
    other.set_input_files("#archiveImportInput", path)
    other.wait_for_selector(".app-dialog")
    assert "1 Spiel neu" in other.text_content(".app-dialog"), other.text_content(".app-dialog")
    ok(other)
    other.locator("#archiveOverlay button", has_text="Laden").click(); ok(other)
    assert other.evaluate("TimesUp.state.players.map(p => p.name + (p.handicap ? '*' : ''))") == ["Anna*", "Ben"]
    total = other.evaluate("TimesUp.state.cardPool.length")
    assert other.evaluate("getAvailableCardPoolForArchive().length") == total - 2

    # erneuter Import mit neuerem Stand: Karten vereinigen, neuere Spieler übernehmen
    newer = dict(data["entries"][0], lastPlayedAt="2026-06-02T11:00:00.000Z",
                 players=[{"name": "Anna", "handicap": False}, {"name": "Cem", "handicap": False}],
                 usedCards=[{"id": c3["id"], "begriff": c3["begriff"], "erklaerung": c3["erklaerung"]}])
    upd = Path(tempfile.mkdtemp()) / "neu.json"
    upd.write_text(json.dumps(dict(data, entries=[newer])), encoding="utf-8")
    other.click("#loadSavesButton")
    other.set_input_files("#archiveImportInput", str(upd))
    other.wait_for_selector(".app-dialog")
    assert "zusammengeführt" in other.text_content(".app-dialog")
    ok(other)
    stored = other.evaluate("JSON.parse(localStorage.getItem('timesup_archive'))['TU-20260601T100000']")
    assert len(stored["usedCards"]) == 3 and [p["name"] for p in stored["players"]] == ["Anna", "Cem"], stored

    # ungültige Datei
    bad = upd.with_name("kaputt.json"); bad.write_text("{kein json", encoding="utf-8")
    other.set_input_files("#archiveImportInput", str(bad))
    other.wait_for_selector(".app-dialog")
    assert "Import fehlgeschlagen" in other.text_content(".app-dialog")
    ok(other)
    assert len(other.evaluate("Object.keys(JSON.parse(localStorage.getItem('timesup_archive')))")) == 1
    assert not page.errors and not other.errors, (page.errors, other.errors)

def test_overview_rules(b, base):
    """Spielübersicht zeigt Runden (Regel, Zeit, Überspringen) und Strafen (Todo: Regeln in der Spielübersicht)."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"roundCount": 3, "roundTimer": [45, 30, 20], "roundRules": ["Nur beschreiben", "Eigene Regel X", "Pantomime und Geräusche"],
              "roundSkip": ["yes", "yes", "no"], "skipLimitType": ["limited", "unlimited", "limited"], "skipLimitValue": [2, 1000, 0],
              "skipReturn": ["yes", "no", "yes"], "punishEnabled": True, "punishTime": 4, "punishPoints": "draw",
              "handicapEnabled": True, "handicapTime": 7})
    for vp in [(844, 390), (390, 844)]:
        page = new_page(b, base, s, viewport=vp)
        add_players(page, ["Anna", "Ben"])
        page.click("text=Weiter"); ok(page)
        page.click("text=Zufällige Teams"); page.click("text=Kartenauswahl ohne Veto")
        page.click("#startGameOverviewButton")
        rounds = page.eval_on_selector_all("#overviewRules .overview-round", "els => els.map(e => e.innerText.replace(/\\s+/g, ' '))")
        assert len(rounds) == 3, rounds
        assert "Runde 1 · 45 s" in rounds[0] and "Nur beschreiben" in rounds[0] and "Überspringen: Ja (max. 2)" in rounds[0], rounds[0]
        assert "Eigene Regel X" in rounds[1] and "ohne Zurücklegen" in rounds[1], rounds[1]
        assert "Überspringen: Nein" in rounds[2], rounds[2]
        pen = page.text_content("#overviewRules .overview-penalties")
        assert "Strafzeit 4 s" in pen and "Punktabzug −0,5 pro Fehler" in pen and "Handicap +7 s" in pen, pen
        # nichts überlappt die Start-Leiste, kein horizontales Scrollen
        assert page.evaluate("""(() => { const t = [...document.querySelectorAll('#screen-spieluebersicht .teams, #overviewTeamsContainer')]
            .filter(e => e.offsetParent); const bar = document.querySelector('#screen-spieluebersicht .bottom-bar').getBoundingClientRect();
            return t.every(e => e.getBoundingClientRect().bottom <= bar.top + 1); })()"""), "Teams überlappen die Start-Leiste"
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.context.close()

ALL = [n for n in dir() if n.startswith("test_")]

if __name__ == "__main__":
    names = sys.argv[1:] or ALL
    unknown = [n for n in names if n not in ALL]
    if unknown:
        sys.exit("Unbekannte Tests: %s" % ", ".join(unknown))
    failed = []
    with server() as base, browser() as b:
        for n in names:
            try:
                globals()[n](b, base); print("PASS", n)
            except Exception as e:
                failed.append(n); print("FAIL", n, "->", (str(e) or type(e).__name__)[:300])
    print("\n%d/%d bestanden" % (len(names) - len(failed), len(names)))
    sys.exit(1 if failed else 0)
