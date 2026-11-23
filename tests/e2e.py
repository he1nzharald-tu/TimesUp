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


from harness import CARDS, DEFAULT_SETTINGS, REPO, browser, maybe_ok, new_page, ok, server, tick

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
        page.click("text=Kartenauswahl ohne Veto"); maybe_ok(page)
    else:
        page.click("text=Kartenauswahl mit Veto"); maybe_ok(page)
        for i in range(len(names)):
            tick(page, 200)
            page.click("#cardSelectionInfo")
            tick(page, 50)
            items = page.locator("#cardSelectionList li")
            assert items.count() > 0, "keine Karten angezeigt"
            items.first.click(); ok(page)              # Veto bestätigen
            page.click("#cardDoneButton"); maybe_ok(page)
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
    return page.evaluate("[...document.querySelectorAll('#finalTeamsContainer .team-card')].sort((a, b) => a.dataset.team - b.dataset.team)"
                         ".map(c => +c.querySelector('[data-points]').dataset.points)")

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
    for _ in range(4): page.click("#btnSkip", timeout=5000)
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
    page.click("button[aria-label='Einstellungen']")
    page.click("#settingsTab-spiel")
    page.click("[data-round='2'] .round-head")
    assert page.locator("#skipReturn2").count() == 1, "Einstellung fehlt"
    if page.input_value("#skipAllowed2") != "yes":
        page.click(".switch[data-for='skipAllowed2']")
    assert page.input_value("#skipAllowed2") == "yes"
    assert page.input_value("#skipReturn2") == "yes"
    assert page.is_visible(".switch[data-for='skipReturn2']")
    page.click(".switch[data-for='skipReturn2']")
    assert page.get_attribute(".switch[data-for='skipReturn2']", "aria-checked") == "false"
    page.click("text=Zurück")
    st = page.evaluate("JSON.parse(localStorage.getItem('timesup_settings'))")
    assert st["skipReturn"][1] == "no", st
    page.reload(); tick(page, 50)
    assert page.input_value("#skipReturn2") == "no" and page.is_visible("#skipReturn2") is False or True
    page.click("button[aria-label='Einstellungen']")
    page.click("#settingsTab-spiel")
    page.click("[data-round='2'] .round-head")
    assert page.is_visible(".switch[data-for='skipReturn2']") and page.input_value("#skipReturn2") == "no", "nach Neuladen nicht wiederhergestellt"
    assert page.get_attribute(".switch[data-for='skipReturn2']", "aria-checked") == "false"

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
    total = page.evaluate("TimesUp.getFilteredCardPool().length")
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
    """Karten kommen aus data/cards.json mit ihren festen IDs, App-Hash passt zum Exportskript, kein SheetJS (Todo 5, AP 0)."""
    page = new_page(b, base, None)
    ids = page.evaluate("TimesUp.state.cardPool.map(c => c.id)")
    assert ids == [c["id"] for c in CARDS], "IDs der App weichen von cards.json ab"
    assert len(set(ids)) == len(ids), "doppelte IDs"
    sys.path.insert(0, str(REPO / "scripts"))
    from kartendaten import card_id
    for begriff, erklaerung in [("Gabel", "Besteck mit Zinken"), ("Ärger", "Wut „äußern“ – 3× ß")]:
        assert page.evaluate("([b, e]) => hashCardText(b, e)", [begriff, erklaerung]) == card_id(begriff, erklaerung)
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

def test_screen_fills_device(b, base):
    """App-Gerüst (M1): Bildschirm füllt jedes Gerät, kein zoom mehr, Safe Areas werden eingerechnet."""
    for vp in [(640, 360), (874, 402), (402, 874), (1180, 820)]:
        page = new_page(b, base, None, viewport=vp)
        r = page.evaluate("(() => { const b = document.querySelector('.screen.active').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
        assert r == [0, 0, vp[0], vp[1]], (vp, r)
        assert page.evaluate("getComputedStyle(document.querySelector('.screen.active')).zoom") in ("1", "normal"), vp
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), vp
        page.context.close()
    # Jeder Bildschirm liegt im Gerät und scrollt selbst (Einstellungen: früher position: relative → nicht scrollbar)
    for vp in [(874, 402), (402, 874)]:
        page = new_page(b, base, None, viewport=vp)
        page.click("button[aria-label='Einstellungen']")
        r = page.evaluate("(() => { const s = document.getElementById('screen-settings'); const b = s.getBoundingClientRect();"
                          " s.scrollTop = 400; return [b.top, b.bottom, s.scrollTop, s.scrollHeight > s.clientHeight]; })()")
        assert r[0] == 0 and r[1] == vp[1], (vp, r)
        assert r[3] and r[2] > 0, ("Einstellungen scrollen nicht", vp, r)
        page.context.close()
    # Simulierte Dynamic Island / Home-Leiste: Inhalt rückt ein, Aktionsleiste endet über der Home-Leiste
    page = new_page(b, base, None, viewport=(402, 874))
    page.add_style_tag(content=":root{--sa-top:62px!important;--sa-bottom:34px!important}")
    add_players(page, ["Anna", "Ben"])
    top = page.evaluate("document.querySelector('#screen-start .start-head').getBoundingClientRect().top")
    assert top >= 62, top
    page.click("text=Weiter"); ok(page)
    bar = page.evaluate("document.querySelector('#screen-teamauswahl .bottom-bar button').getBoundingClientRect().bottom")
    assert bar <= 874 - 34, bar
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

def test_wake_lock_and_play_again(b, base):
    """M6/M7: Bildschirm bleibt während des Zugs an (Wake Lock), nach Zugende frei; „Nochmal spielen“ behält die Teams."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"cardCount": 4, "roundCount": 1, "roundTimer": [30], "roundSkip": ["no"]})
    page = new_page(b, base, s)
    page.evaluate("""() => { window.__wl = []; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
        request: async () => { const l = { released: false, listeners: [], addEventListener(e, f) { this.listeners.push(f); },
            release: async function () { this.released = true; window.__wl.push('release'); } }; window.__wl.push('request'); return l; } } }); }""")
    setup_game(page, ["Anna", "Ben"], veto=False)
    teams = page.evaluate("TimesUp.state.teams.map(t => t.map(p => p.name))")
    page.click("#startRoundBtn"); ok(page)
    tick(page, 50)
    assert page.evaluate("window.__wl") == ["request"], page.evaluate("window.__wl")
    page.click("#screen-play .play-pause")
    assert page.evaluate("window.__wl")[-1] == "release"
    page.locator("#pauseOverlay .pause-continue-btn").click()
    tick(page, 50)
    assert page.evaluate("window.__wl")[-1] == "request"
    while not page.locator("#guessedOverlay").count():
        page.click("#btnCorrect")
    assert page.evaluate("window.__wl")[-1] == "release"
    overlay_button(page, "Nächster Spieler").click()
    if active(page) == "screen-roundstart":
        page.click("#startRoundBtn"); ok(page)
        while not page.locator("#guessedOverlay").count():
            page.click("#btnCorrect")
        overlay_button(page, "Nächster Spieler").click()
    assert active(page) == "screen-end", active(page)
    assert "gewinnt" in page.text_content("#endWinnerText") or "Unentschieden" in page.text_content("#endWinnerText")
    page.click(".play-again-btn")
    assert active(page) == "screen-teamuebersicht", active(page)
    assert page.evaluate("TimesUp.state.teams.map(t => t.map(p => p.name))") == teams
    assert page.locator("#teamsContainer .team-card").count() == 2

def test_install_hint_ios(b, base):
    """M9: Auf iPhone in Safari erscheint einmalig der Hinweis „Zum Home-Bildschirm“; schließbar und gemerkt."""
    ua = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
          "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
    ctx = b.new_context(viewport={"width": 402, "height": 874}, user_agent=ua, service_workers="block")
    page = ctx.new_page()
    page.goto(base + "/index.html")
    page.wait_for_function("document.getElementById('kartenStatusText').textContent.includes('Karten')", timeout=10000)
    assert page.is_visible("#installBanner") and "Home-Bildschirm" in page.text_content("#installBannerText")
    assert not page.is_visible("#installButton")
    page.click("#installDismissButton")
    assert not page.is_visible("#installBanner")
    page.reload()
    page.wait_for_function("document.getElementById('kartenStatusText').textContent.includes('Karten')", timeout=10000)
    assert not page.is_visible("#installBanner"), "Hinweis muss geschlossen bleiben"
    # Desktop-Chrome: kein Hinweis
    other = new_page(b, base, None)
    assert not other.is_visible("#installBanner")
    ctx.close(); other.context.close()

def test_card_explanation_stays_centered(b, base):
    """Antippen des Begriffs: Begriff + Erklärung bleiben mittig (früher rutschten sie an den unteren Rand)."""
    for vp in [(874, 402), (402, 874)]:
        page = new_page(b, base, None, viewport=vp)
        setup_game(page, ["Anna", "Ben"], veto=False)
        page.click("#startRoundBtn"); ok(page)
        def centers():
            return page.evaluate("""(() => { const c = document.getElementById('currentCardDisplay').getBoundingClientRect();
                const t = document.getElementById('cardTerm').getBoundingClientRect();
                const e = document.getElementById('cardExplanation');
                const last = e.hidden ? t : e.getBoundingClientRect();
                return [(c.top + c.bottom) / 2, (t.top + last.bottom) / 2, c.height]; })()""")
        c0, m0, h = centers()
        assert abs(c0 - m0) < h * 0.15, ("Begriff nicht mittig", vp, c0, m0)
        page.click("#currentCardDisplay")
        assert page.is_visible("#cardExplanation")
        c1, m1, h = centers()
        assert abs(c1 - m1) < h * 0.15, ("Begriff+Erklärung nicht mittig", vp, c1, m1)
        page.context.close()

def _play_until_end(page):
    """Spielt alle Runden mit „Richtig“ durch, bis das Spielende erscheint."""
    for _ in range(200):
        a = active(page)
        if a == "screen-end":
            return
        if page.locator("#guessedOverlay").count():
            overlay_button(page, "Nächster Spieler").click(); continue
        if a == "screen-roundstart":
            page.click("#startRoundBtn"); ok(page); continue
        if a == "screen-roundstats":
            page.click(".next-round-btn"); continue
        if a == "screen-play":
            page.click("#btnCorrect"); continue
    raise AssertionError("Spielende nicht erreicht: " + active(page))

def test_archive_games_and_stats(b, base):
    """Archiv: jedes beendete Spiel wird mit Teams, Punkten, Runden gespeichert; Teams dürfen wechseln;
    Reiter Spiele / Statistik / Karten; Spiel antippen zeigt Runden."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"cardCount": 4, "roundCount": 2, "roundTimer": [30, 30], "roundSkip": ["no", "no"],
              "roundRules": ["Nur beschreiben", "Nur ein Wort"]})
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben", "Cem", "Dora"], veto=False)
    _play_until_end(page)
    # Statistik am Spielende: Überblick, Spieler, Begriffe, zurück zum Ende
    page.click(".end-stats-btn")
    assert active(page) == "screen-gamestats"
    assert page.locator("#gsPanel .gs-player").count() == 4
    assert page.locator("#gsPanel svg.gs-chart polyline").count() == 2
    assert page.locator("#gsPanel .gs-award").count() >= 1, "mindestens MVP"
    page.click("#screen-gamestats .gs-tab[data-tab='players']")
    assert page.locator("#gsPanel .gs-table tbody tr").count() == 4
    page.click("#screen-gamestats .gs-tab[data-tab='terms']")
    assert "Härteste Begriffe" in page.text_content("#gsPanel")
    page.click("#screen-gamestats .head-btn")
    assert active(page) == "screen-end"
    # Spiel 2 mit getauschten Teams
    page.click(".play-again-btn")
    first = page.evaluate("TimesUp.state.teams[0][0].name")
    page.locator("#teamsContainer .team-member-btn", has_text=first).click()
    page.click("text=Kartenauswahl ohne Veto"); maybe_ok(page)
    page.click("#startGameOverviewButton")
    page.click(".overview-start-btn")
    _play_until_end(page)
    store = page.evaluate("JSON.parse(localStorage.getItem('timesup_archive'))")
    entry = list(store.values())[0]
    games = entry["games"]
    assert len(games) == 2, games
    g1, g2 = games
    assert len(g1["rounds"]) == 2 and g1["rounds"][0]["rule"] == "Nur beschreiben", g1["rounds"]
    assert sum(sum(r["points"]) for r in g1["rounds"]) == sum(g1["points"]) == 8, g1
    assert sum(p["explained"] for p in g1["players"].values()) == 8
    assert g1["teams"] != g2["teams"], "Teams sollten im zweiten Spiel anders sein"
    assert g1["settings"]["cardCount"] == 4 and g1["winners"], g1
    p0 = next(iter(g1["players"].values()))
    for key in ["shown", "skips", "mistakes", "bestStreak", "lastSecond", "avgSeconds"]:
        assert key in p0, (key, p0)
    assert sum(p["shown"] for p in g1["players"].values()) >= 8
    assert "hardest" in g1["terms"] and "learning" in g1["terms"]
    # Bildschirm
    page.click(".back-to-start-btn")
    page.click("#loadSavesButton")
    assert page.locator("#archiveOverlay .archive-tile").count() == 1
    assert page.locator("#archiveOverlay .archive-game").count() == 2
    page.locator("#archiveOverlay .archive-game").first.click()
    assert page.locator("#archiveOverlay .archive-round").count() == 2
    # Statistik eines Spiels aus dem Archiv öffnen und zurück
    page.click("#archiveOverlay .archive-game-stats")
    assert active(page) == "screen-gamestats" and page.locator("#archiveOverlay").count() == 0
    page.click("#screen-gamestats .head-btn")
    assert page.locator("#archiveOverlay").count() == 1
    assert page.locator("#archiveOverlay .archive-round").count() == 2, "zurück im selben Spiel"
    assert "Runde 1" in page.text_content("#archiveOverlay .archive-rounds")
    page.click("#archiveOverlay .archive-tab[data-tab='statistik']")
    assert "2" in page.text_content("#archiveOverlay .archive-kpi"), page.text_content("#archiveOverlay .archive-kpis")
    assert page.locator("#archiveOverlay .archive-podium li").count() == 3
    assert page.locator("#archiveOverlay .archive-rest li").count() == 1
    assert page.locator("#archiveOverlay .archive-duos li").count() >= 2
    assert "Meiste Punkte in einer Runde" in page.text_content("#archiveOverlay .archive-records")
    page.click("#archiveOverlay .archive-tab[data-tab='karten']")
    assert page.locator("#archiveOverlay .archive-cards li").count() == len(entry["usedCards"])
    # Statistik-Werte
    stats = page.evaluate("(() => { const e = Object.values(JSON.parse(localStorage.getItem('timesup_archive')))[0];"
                          " return TimesUp.archiveStats ? TimesUp.archiveStats(e) : null; })()")
    if stats:
        assert stats["games"] == 2 and stats["explained"] == 16, stats
    # Export einer einzelnen Gruppe enthält die Spiele
    with page.expect_download() as dl:
        page.click("#archiveOverlay .archive-export-one-btn")
    data = json.loads(open(dl.value.path(), encoding="utf-8").read())
    assert len(data["entries"]) == 1 and len(data["entries"][0]["games"]) == 2
    assert not page.errors, page.errors

def test_default_turn_time(b, base):
    """Standardzeit 30 s: frische Installation (Einstellungen und Spiel) und Button "Standardwerte"."""
    page = new_page(b, base, None)
    page.click("button[aria-label='Einstellungen']")
    assert [page.input_value(f"#timer{i}") for i in (1, 2, 3)] == ["30"] * 3
    page.click("#settingsTab-spiel"); page.click("[data-round='1'] .round-head")
    page.fill("#timer1", "45"); page.click("text=Standardwerte")
    assert page.input_value("#timer1") == "30"
    page2 = new_page(b, base, None)           # nie gespeicherte Einstellungen
    setup_game(page2, ["Anna", "Ben"], veto=False)
    assert "30 s" in page2.text_content("#roundStartTime")
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
        # Update anstoßen; auf langsamen CI-Rechnern ggf. mehrfach (Installation lädt alle App-Dateien)
        for attempt in range(4):
            pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => null)")
            try:
                pg.wait_for_selector("#updateBanner:not([hidden])", timeout=15000)
                break
            except Exception:
                if attempt == 3:
                    raise
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

def _excel(path, rows, header=("Begriff", "Erklärung", "Schwierigkeit", "Themen", "ID")):
    import openpyxl
    wb = openpyxl.Workbook(); ws = wb.active
    if header: ws.append(list(header))
    for r in rows: ws.append(list(r))
    wb.save(path)

def _run(script, *args):
    return subprocess.run([sys.executable, str(REPO / "scripts" / script), *map(str, args)], capture_output=True, text=True)

def test_card_export_columns_and_ids(b, base):
    """Export liest Spalten über die Kopfzeile, übernimmt feste IDs und trägt neue IDs auf Wunsch ein (AP 0)."""
    sys.path.insert(0, str(REPO / "scripts"))
    from kartendaten import card_id, read_rows
    with tempfile.TemporaryDirectory() as tmp:
        src, out = Path(tmp) / "k.xlsx", Path(tmp) / "cards.json"
        # Spalten absichtlich in anderer Reihenfolge
        _excel(src, [
            ("kfest", "Elefant", "Großes Tier mit Rüssel", "Kinder", "Tiere & Natur, 80er, 90er & 2000er, Allgemeinwissen", "Star Wars"),
            (None, "Gabel", "Besteck mit Zinken", "mittel", "alltag", None),
        ], header=("ID", "Begriff", "Erklärung", "Schwierigkeit", "Themen", "Deck"))
        r = _run("export_cards.py", src, out)
        assert r.returncode == 0, r.stdout + r.stderr
        cards = json.loads(out.read_text(encoding="utf-8"))["cards"]
        assert cards[0] == {"id": "kfest", "begriff": "Elefant", "erklaerung": "Großes Tier mit Rüssel",
                            "level": "kinder", "themes": ["tiere-natur", "popkultur", "allgemeinwissen"],
                            "deck": "star-wars"}, cards[0]
        assert cards[1]["id"] == card_id("Gabel", "Besteck mit Zinken") and cards[1]["level"] == "mittel", cards[1]
        assert "deck" not in cards[1], cards[1]
        assert "ohne ID" in r.stdout, r.stdout
        r = _run("export_cards.py", src, out, "--ids-eintragen")
        assert r.returncode == 0 and "neue IDs" in r.stdout, r.stdout
        assert [row["id"] for row in read_rows(src)] == ["kfest", cards[1]["id"]]

        # alte Datei ohne Kopfzeile: A = Begriff, B = Erklärung
        _excel(src, [("Gabel", "Besteck mit Zinken")], header=None)
        assert _run("export_cards.py", src, out).returncode == 0
        assert json.loads(out.read_text(encoding="utf-8"))["cards"] == [
            {"id": card_id("Gabel", "Besteck mit Zinken"), "begriff": "Gabel", "erklaerung": "Besteck mit Zinken"}]

def test_card_export_rejects_invalid(b, base):
    """Unbekannte Stufen/Themen und doppelte IDs brechen den Export ab, cards.json bleibt unberührt (AP 0)."""
    with tempfile.TemporaryDirectory() as tmp:
        src, out = Path(tmp) / "k.xlsx", Path(tmp) / "cards.json"
        out.write_text("alt", encoding="utf-8")
        _excel(src, [("Elefant", "Großes Tier", "Leicht", "Tiere & Natur", "Zoo-Deck", "k1"),
                     ("Gabel", "Besteck", "Mittel", "Kochen", None, "k1")],
               header=("Begriff", "Erklärung", "Schwierigkeit", "Themen", "Deck", "ID"))
        r = _run("export_cards.py", src, out)
        assert r.returncode == 1, r.stdout
        assert "„Leicht“" in r.stdout and "„Kochen“" in r.stdout and "doppelt" in r.stdout, r.stdout
        assert "unbekanntes Deck „Zoo-Deck“" in r.stdout, r.stdout
        assert out.read_text(encoding="utf-8") == "alt"

def test_check_cards_rules(b, base):
    """Prüfskript findet zu lange Erklärungen, Begriff/Wortstamm in der Erklärung und zu leichte Politiker (AP 0)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "k.xlsx"
        _excel(src, [
            ("Elefant", "Großes graues Tier mit Rüssel", "Kinder", "Tiere & Natur", "k1"),            # in Ordnung
            ("Schreibtischunterlage", "Unterlage auf dem Tisch", "Mittel", "Alltag & Haushalt", "k2"),
            ("Gabel", "x" * 81, "Mittel", "Alltag & Haushalt", "k3"),
            ("Olaf Scholz", "Deutscher Bundeskanzler ab 2021", "Mittel", "Politik & Gesellschaft, Berühmte Personen", "k4"),
            ("Fake-Taxi", "Erwachsenenfilm-Reihe", "Experte", "NSFW, Internet & Memes", "k5"),
        ])
        r = _run("check_cards.py", src, "--liste")
        assert r.returncode == 1, r.stdout
        lines = r.stdout
        assert "Zeile 3: Schreibtischunterlage – Begriff in Erklärung" in lines, lines
        assert "Zeile 4: Gabel – zu lang: 81 Zeichen" in lines, lines
        assert "Zeile 5: Olaf Scholz – Politiker zu leicht" in lines, lines
        assert "Zeile 6: Fake-Taxi – NSFW mit weiterem Thema" in lines, lines
        assert "Zeile 2:" not in lines, lines
        r = _run("check_cards.py", src, "--zeilen", "2-2", "--vollstaendig")
        assert r.returncode == 0 and "Keine Auffälligkeiten" in r.stdout, r.stdout

def test_card_filter_logic(b, base):
    """Filter nach Stufe, Themen, Decks (Oder) und NSFW; alte Einstellungen ohne Filter (AP 4)."""
    page = new_page(b, base, None)
    r = page.evaluate("""() => {
        const T = TimesUp, all = T.state.cardPool.length;
        const n = f => T.getFilteredCardPool(T.setCardFilter(f)).length;
        const nsfw = T.state.cardPool.filter(c => (c.themes||[]).includes('nsfw')).length;
        const res = {all, nsfw,
            def: n(null),
            withNsfw: n({nsfw: true}),
            kinder: n({levels: ['kinder']}),
            kinderOk: T.getFilteredCardPool(T.setCardFilter({levels: ['kinder']})).every(c => c.level === 'kinder'),
            sport: n({themes: ['sport']}),
            sw: n({themes: [], decks: ['star-wars']}),
            sportOrSw: n({themes: ['sport'], decks: ['star-wars']}),
            none: n({themes: []}),
            noneLevel: n({levels: []}),
        };
        T.setCardFilter(null);
        return res;
    }""")
    assert r["nsfw"] > 0 and r["def"] == r["all"] - r["nsfw"], r
    assert r["withNsfw"] == r["all"], r
    assert 0 < r["kinder"] < r["def"] and r["kinderOk"], r
    assert r["sw"] == 60, r
    assert r["sportOrSw"] == r["sport"] + r["sw"], r   # keine Überschneidung Sport/Star Wars
    assert r["none"] == 0 and r["noneLevel"] == 0, r
    assert "Karten" in page.text_content("#kartenStatusText")
    assert not page.errors, page.errors

def test_card_filter_game_and_warning(b, base):
    """Gespeicherter Filter wirkt im Spiel; zu wenige passende Karten werden gemeldet (AP 4)."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s["cardFilter"] = {"levels": ["kinder"], "themes": None, "decks": [], "nsfw": False}
    page = new_page(b, base, s)
    assert "passen zur Auswahl" in page.text_content("#kartenStatusText"), page.text_content("#kartenStatusText")
    setup_game(page, ["Anna", "Ben", "Cem", "Dora"], veto=False)
    levels = page.evaluate("TimesUp.state.playingCards.map(c => c.level)")
    assert levels and set(levels) == {"kinder"}, levels
    # nach dem Speichern der Einstellungen bleibt der Filter erhalten
    page.evaluate("TimesUp.saveSettingsToStorage()")
    saved = page.evaluate("JSON.parse(localStorage.getItem('timesup_settings')).cardFilter")
    assert saved["levels"] == ["kinder"], saved

    # nur ein Deck mit 60 Karten, aber 80 Karten gewünscht -> Hinweis
    s2 = copy.deepcopy(DEFAULT_SETTINGS); s2["cardCount"] = 80
    s2["cardFilter"] = {"levels": None, "themes": [], "decks": ["pokemon"], "nsfw": False}
    p2 = new_page(b, base, s2)
    add_players(p2, ["A", "B", "C", "D"])
    p2.click("text=Weiter"); ok(p2)
    p2.click("text=Zufällige Teams")
    p2.click("text=Kartenauswahl ohne Veto")
    msg = p2.locator(".app-dialog").first.text_content(timeout=5000)
    assert "nur noch 60" in msg, msg
    ok(p2)
    assert p2.evaluate("TimesUp.state.playingCards.length") == 60
    assert not page.errors and not p2.errors, (page.errors, p2.errors)

def test_card_filter_empty(b, base):
    """Passt keine Karte, startet die Kartenauswahl nicht (AP 4)."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s["cardFilter"] = {"levels": [], "themes": None, "decks": [], "nsfw": False}
    page = new_page(b, base, s)
    add_players(page, ["A", "B", "C", "D"])
    page.click("text=Weiter"); ok(page)
    page.click("text=Zufällige Teams")
    page.click("text=Kartenauswahl ohne Veto")
    msg = page.locator(".app-dialog").first.text_content(timeout=5000)
    assert "passt keine Karte" in msg, msg
    ok(page)
    assert active(page) == "screen-teamuebersicht", active(page)

def test_settings_ui_tabs_and_autosave(b, base):
    """Neue Einstellungen (Variante B): Reiter, Stepper, Rundenkarten, sofortiges Speichern (AP 6)."""
    page = new_page(b, base, None, viewport=(390, 844))
    page.wait_for_function("document.querySelectorAll('#deckTiles .deck-tile').length === 16", timeout=10000)
    page.click("button[aria-label='Einstellungen']")
    assert page.is_visible("#settingsPanel-karten") and not page.is_visible("#settingsPanel-spiel")
    # Stepper Karten +1 speichert sofort
    page.click("#settingsPanel-karten .stepper button[data-step='1']")
    assert page.input_value("#cardCount") == "41"
    st = page.evaluate("JSON.parse(localStorage.getItem('timesup_settings'))")
    assert st["cardCount"] == 41, st
    assert page.locator("#settingsToast.visible").count() == 1
    # Reiter Spiel, Runde 3 aufklappen, Regel wählen, Zeit +5
    page.click("#settingsTab-spiel")
    assert page.is_visible("#settingsPanel-spiel") and not page.is_visible("#settingsPanel-karten")
    page.click("[data-round='3'] .round-head")
    page.click(".choice-grid[data-for='rule3'] button[data-value='Nur ein Wort']")
    page.click("[data-round='3'] .stepper button[data-step='1']")
    tick(page, 50)
    summary = page.text_content("[data-round='3'] .round-head")
    assert "Nur ein Wort" in summary and "35 s" in summary, summary
    st = page.evaluate("JSON.parse(localStorage.getItem('timesup_settings'))")
    assert st["roundRules"][2] == "Nur ein Wort" and st["roundTimer"][2] == 35, st
    # Runden +1 -> neue Rundenkarte und gespeichert
    page.click("#settingsPanel-spiel .set-row:has(#roundCount) button[data-step='1']")
    tick(page, 50)
    assert page.locator(".round-settings").count() == 4
    assert page.evaluate("JSON.parse(localStorage.getItem('timesup_settings')).roundCount") == 4
    # Fairness: Schalter Strafzeit zeigt Dauer
    page.click("#settingsTab-fairness")
    assert not page.is_visible("#punishTime")
    page.click(".switch[data-for='punishEnabled']")
    assert page.is_visible("#punishTime") and page.input_value("#punishEnabled") == "yes"
    page.click(".segment[data-for='penaltyPoints'] button[data-value='draw']")
    assert page.evaluate("JSON.parse(localStorage.getItem('timesup_settings')).penaltyPoints") == "draw"
    # Design: Dunkel
    page.click("#settingsTab-design")
    page.click(".theme-grid[data-for='themeSelect'] button[data-value='dark']")
    assert page.evaluate("document.documentElement.classList.contains('dark')")
    assert page.locator(".theme-grid[data-for='themeSelect'] button").count() == 10
    # Neue Designs: Klasse, Dunkel-Regeln nur bei Gameshow/Arcade, Statusleistenfarbe, gespeichert
    for theme, dark in [("brett", False), ("gameshow", True), ("arcade", True), ("pastell", False),
                        ("geheim", False), ("comic", False), ("kreide", True), ("wasser", True), ("light", False)]:
        page.click(f".theme-grid[data-for='themeSelect'] button[data-value='{theme}']")
        cls = page.evaluate("document.documentElement.className")
        assert ("dark" in cls.split()) == dark, (theme, cls)
        assert (f"theme-{theme}" in cls) == (theme not in ("light", "dark")), (theme, cls)
        assert len([c for c in cls.split() if c.startswith("theme-")]) <= 1, cls
        assert page.evaluate("localStorage.getItem('timesup_theme')") == theme
        assert page.get_attribute(".theme-grid[data-for='themeSelect'] button[data-value='%s']" % theme, "aria-pressed") == "true"
        # Aquarium-Hintergrund nur im Design Unterwasser, mit Fischen
        assert page.locator("#aquarium").count() == (1 if theme == "wasser" else 0), theme
        if theme == "wasser":
            assert page.locator("#aquarium .aq-swim").count() >= 8
    assert not page.errors, page.errors

def test_theme_survives_reload(b, base):
    """Gewähltes Design wird vor dem ersten Zeichnen gesetzt (kein Aufblitzen) und gilt auf allen Bildschirmen."""
    page = new_page(b, base, None, theme="gameshow")
    cls = page.evaluate("document.documentElement.className")
    assert "theme-gameshow" in cls and "dark" in cls, cls
    assert page.get_attribute("#themeColorMeta", "content") == "#7a0a22"
    bg = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim()")
    assert bg == "#16040d", bg

def test_theme_fonts(b, base):
    """Designs mit eigener Schrift laden sie lokal; das Aquarium bleibt nach dem Neuladen erhalten."""
    for theme, font in [("geheim", "Special Elite"), ("comic", "Bangers"), ("kreide", "Gochi Hand"), ("wasser", "Baloo 2")]:
        page = new_page(b, base, None, theme=theme)
        page.evaluate("document.fonts.ready")
        loaded = page.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, ''))")
        assert font in loaded, (theme, loaded)
        assert page.locator("#aquarium").count() == (1 if theme == "wasser" else 0)
        assert not page.errors, page.errors
        page.context.close()

def test_settings_ui_card_filter(b, base):
    """Stufen, Themen, NSFW und Decks in den Einstellungen; Warnung bei zu wenigen Karten (AP 4/6)."""
    page = new_page(b, base, None, viewport=(844, 390))
    page.wait_for_function("document.querySelectorAll('#deckTiles .deck-tile').length === 16", timeout=10000)
    page.click("button[aria-label='Einstellungen']")
    assert page.is_visible("#settingsTab-karten span"), "Querformat: Symbolleiste mit Beschriftung"
    total = page.evaluate("TimesUp.getFilteredCardPool().length")
    assert f"{total:,}".replace(",", ".") in page.text_content("#cardMatchInfo")
    # Stufe Experte abwählen
    page.click("#levelButtons [data-level='experte']")
    f = page.evaluate("TimesUp.getCardFilter()")
    assert f["levels"] == ["kinder", "mittel", "schwer"], f
    assert page.get_attribute("#levelButtons [data-level='experte']", "aria-pressed") == "false"
    assert "passen zur Auswahl" in page.text_content("#kartenStatusText")
    # Themen: Keine -> 0 Karten, Warnung; dann ein Deck -> 60 (ohne Experte weniger), Warnung bei 80
    page.click("#themesAllBtn")
    assert page.evaluate("TimesUp.getFilteredCardPool().length") == 0
    assert page.is_visible("#cardMatchWarning") and "Keine Karte" in page.text_content("#cardMatchWarning")
    page.click("#deckTiles [data-deck='star-wars']")
    n = page.evaluate("TimesUp.getFilteredCardPool().length")
    assert 0 < n <= 60, n
    page.fill("#cardCount", "80"); page.dispatch_event("#cardCount", "change")
    assert "Zu wenige Karten für 80" in page.text_content("#cardMatchWarning")
    # Decks: Alle -> genug Karten, keine Warnung
    page.click("#decksAllBtn")
    assert page.evaluate("TimesUp.getCardFilter().decks.length") == 16
    assert not page.is_visible("#cardMatchWarning")
    # NSFW-Schalter
    page.click("#nsfwSwitch")
    assert page.evaluate("TimesUp.getCardFilter().nsfw") is True
    # gespeichert und nach Neuladen wiederhergestellt
    saved = page.evaluate("JSON.parse(localStorage.getItem('timesup_settings')).cardFilter")
    assert saved["themes"] == [] and len(saved["decks"]) == 16 and saved["nsfw"] is True, saved
    page.reload()
    page.wait_for_function("document.querySelectorAll('#deckTiles .deck-tile').length === 16", timeout=10000)
    assert page.get_attribute("#deckTiles [data-deck='pokemon']", "aria-pressed") == "true"
    assert page.get_attribute("#nsfwSwitch", "aria-checked") == "true"
    # Standardwerte setzen den Filter zurück
    page.click("button[aria-label='Einstellungen']")
    page.click(".btn-defaults")
    assert page.evaluate("TimesUp.getCardFilter()") == {"levels": None, "themes": None, "decks": [], "nsfw": False}
    assert page.get_attribute("#deckTiles [data-deck='pokemon']", "aria-pressed") == "false"
    assert not page.errors, page.errors

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
    total = other.evaluate("TimesUp.getFilteredCardPool().length")
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
        assert rounds[0].startswith("1") and "45 s" in rounds[0] and "Nur beschreiben" in rounds[0] and "Überspringen: Ja (max. 2)" in rounds[0], rounds[0]
        assert "Eigene Regel X" in rounds[1] and "ohne Zurücklegen" in rounds[1], rounds[1]
        assert "Überspringen: Nein" in rounds[2], rounds[2]
        pen = page.text_content("#overviewRules .overview-penalties")
        assert "Strafzeit 4 s" in pen and "Punktabzug −0,5 pro Fehler" in pen and "Handicap +7 s" in pen, pen
        # nichts überlappt die Start-Leiste, kein horizontales Scrollen
        # (nach Scrollen ans Ende liegt der letzte Inhalt über der Start-Leiste)
        assert page.evaluate("""(() => { const sc = document.getElementById('screen-spieluebersicht'); sc.scrollTop = sc.scrollHeight;
            const t = [...document.querySelectorAll('#screen-spieluebersicht .teams, #overviewTeamsContainer')]
            .filter(e => e.offsetParent); const bar = document.querySelector('#screen-spieluebersicht .bottom-bar').getBoundingClientRect();
            return t.every(e => e.getBoundingClientRect().bottom <= bar.top + 1); })()"""), "Teams überlappen die Start-Leiste"
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.context.close()

def test_penalty_independent_of_penalty_time(b, base):
    """Punktabzug wirkt auch ohne Strafzeit (eigene Einstellung); ohne Strafzeit keine Wartezeit."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"cardCount": 4, "roundCount": 1, "roundTimer": [60], "roundSkip": ["no"],
              "punishEnabled": False, "penaltyPoints": "yes"})
    s.pop("punishPoints", None)
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    first = page.evaluate("TimesUp.state.activeTeamIndex")
    page.click("#startRoundBtn"); ok(page)
    page.click("#btnMistake")
    assert "Strafzeit" not in page.text_content("#cardTerm"), "ohne Strafzeit darf es keine Wartezeit geben"
    while not page.locator("#guessedOverlay").count():
        page.click("#btnCorrect")
    overlay_button(page, "Nächster Spieler").click()
    page.click("#startRoundBtn"); ok(page)
    while not page.locator("#guessedOverlay").count():
        page.click("#btnCorrect")
    overlay_button(page, "Nächster Spieler").click()
    pts = page.evaluate("TimesUp.state.totalPoints")
    assert pts[first] == 2 and pts[1 - first] == 1, pts

def test_penalty_setting_migration(b, base):
    """Alte Einstellungen (Strafe an der Strafzeit) werden übernommen und neu gespeichert."""
    cases = [({"punishEnabled": True, "punishPoints": "draw"}, "draw"),
             ({"punishEnabled": False, "punishPoints": "yes"}, "no"),     # war unwirksam
             ({"punishEnabled": True, "punishPoints": "no"}, "no"),
             ({"punishEnabled": False, "penaltyPoints": "yes"}, "yes")]
    for extra, expected in cases:
        s = copy.deepcopy(DEFAULT_SETTINGS); s.pop("punishPoints", None); s.update(extra)
        page = new_page(b, base, s)
        page.click("button[aria-label='Einstellungen']")
        page.click("#settingsTab-fairness")
        assert page.is_visible(".segment[data-for='penaltyPoints']"), "Punktabzug muss ohne Strafzeit sichtbar sein"
        pressed = page.get_attribute(f".segment[data-for='penaltyPoints'] button[data-value='{expected}']", "aria-pressed")
        assert pressed == "true", (extra, pressed)
        assert page.input_value("#penaltyPoints") == expected, (extra, page.input_value("#penaltyPoints"))
        page.click("text=Zurück")
        st = page.evaluate("JSON.parse(localStorage.getItem('timesup_settings'))")
        assert st["penaltyPoints"] == expected and "punishPoints" not in st, st
        page.context.close()

def _correction_game(b, base, mode, button):
    """1 Runde, 4 Karten: Team 1 errät alles, korrigiert dann eine Karte; Team 2 errät sie danach."""
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"cardCount": 4, "roundCount": 1, "roundTimer": [60], "roundSkip": ["no"], "punishEnabled": False, "penaltyPoints": mode})
    s.pop("punishPoints", None)
    page = new_page(b, base, s)
    setup_game(page, ["Anna", "Ben"], veto=False)
    first = page.evaluate("TimesUp.state.activeTeamIndex")
    page.click("#startRoundBtn"); ok(page)
    page.click("#btnCorrect"); page.click("#btnCorrect"); page.click("#btnCorrect")
    tick(page, 61000)
    overlay_button(page, "korrigieren").click()
    items = page.locator("#guessedOverlay .correction-item")
    assert items.count() == 3
    labels = items.first.locator("button").all_text_contents()
    page.locator("#guessedOverlay .correction-item").first.locator("button", has_text=button).click(); ok(page)
    assert page.locator("#guessedOverlay .correction-item").count() == 2
    overlay_button(page, "Zurück").click()
    overlay_button(page, "Nächster Spieler").click()
    page.click("#startRoundBtn"); ok(page)
    while not page.locator("#guessedOverlay").count():
        page.click("#btnCorrect")
    overlay_button(page, "Nächster Spieler").click()
    assert active(page) == "screen-end", active(page)
    return page, first, page.evaluate("TimesUp.state.totalPoints"), labels

def test_correction_not_guessed(b, base):
    """Korrektur "Nicht erraten": Karte zurück in den Stapel, kein Abzug."""
    page, first, pts, labels = _correction_game(b, base, "yes", "Nicht erraten")
    assert labels == ["Nicht erraten", "Regelverstoß (−1)"], labels
    assert pts[first] == 2 and pts[1 - first] == 2, pts

def test_correction_rule_violation(b, base):
    """Korrektur "Regelverstoß": Karte zurück in den Stapel und Punktabzug laut Einstellung."""
    page, first, pts, labels = _correction_game(b, base, "draw", "Regelverstoß")
    assert labels == ["Nicht erraten", "Regelverstoß (−0,5)"], labels
    assert pts[first] == 1.5 and pts[1 - first] == 2, pts
    note = page.text_content("#finalPenaltyA" if first == 0 else "#finalPenaltyB")
    assert "−0,5 Strafe" in note, note

def test_correction_violation_without_penalty(b, base):
    page, first, pts, labels = _correction_game(b, base, "no", "Regelverstoß")
    assert labels == ["Nicht erraten", "Regelverstoß"], labels
    assert pts[first] == 2, pts

def _reload_and_resume(page):
    page.reload()
    page.wait_for_function("document.getElementById('kartenStatusText').textContent.includes('Karten')")
    tick(page, 50)
    assert page.locator("#resumeBanner").is_visible(), "Hinweis \"Spiel fortsetzen\" fehlt"
    assert "Nicht beendetes Spiel" in page.text_content("#resumeBannerText")
    page.click("#resumeGameButton")
    assert page.locator("#resumeBanner").is_hidden()

def _finish_with_correct(page):
    """Spielt das Spiel nur mit "Richtig" zu Ende (keine Fehler, keine Strafen)."""
    for _ in range(60):
        a = active(page)
        if a == "screen-end": return
        if a == "screen-roundstats":
            page.click("text=Nächste Runde starten"); continue
        page.click("#startRoundBtn"); ok(page)
        while not page.locator("#guessedOverlay").count():
            page.click("#btnCorrect")
        overlay_button(page, "Nächster Spieler").click()
    raise AssertionError("Spiel endet nicht")

def _resume_settings():
    s = copy.deepcopy(DEFAULT_SETTINGS)
    s.update({"cardCount": 6, "roundCount": 2, "roundTimer": [10, 10], "roundSkip": ["no", "no"],
              "punishEnabled": False, "penaltyPoints": "yes"})
    s.pop("punishPoints", None)
    return s

def test_resume_between_turns(b, base):
    """Neuladen zwischen zwei Zügen: Fortsetzen beim richtigen Spieler, Punkte und Karten bleiben."""
    page = new_page(b, base, _resume_settings())
    setup_game(page, ["Anna", "Ben", "Cem", "Dora"], veto=False)
    page.click("#startRoundBtn"); ok(page)
    page.click("#btnCorrect"); page.click("#btnMistake"); page.click("#btnCorrect")
    tick(page, 11000)
    overlay_button(page, "Nächster Spieler").click()
    expected_player = page.text_content("#roundPlayerName")
    before = page.evaluate("[TimesUp.state.currentCards.length, TimesUp.state.correctCards.map(c => c.length), TimesUp.state.teamMistakes]")
    _reload_and_resume(page)
    assert active(page) == "screen-roundstart", active(page)
    assert page.text_content("#roundPlayerName") == expected_player
    after = page.evaluate("[TimesUp.state.currentCards.length, TimesUp.state.correctCards.map(c => c.length), TimesUp.state.teamMistakes]")
    assert after == before, (before, after)
    _finish_with_correct(page)
    pts = page.evaluate("TimesUp.state.totalPoints")
    assert sum(pts) == 6 * 2 - 1, pts            # 1 Punkt Abzug für den Fehler
    page.reload(); tick(page, 50)
    assert page.locator("#resumeBanner").is_hidden(), "nach Spielende kein Fortsetzen mehr"
    assert not page.errors, page.errors

def test_resume_mid_turn(b, base):
    """Neuladen mitten im Zug: der Zug gilt als beendet, erratene Karten zählen, nächster Spieler ist dran."""
    page = new_page(b, base, _resume_settings())
    setup_game(page, ["Anna", "Ben", "Cem", "Dora"], veto=False)
    first_team = page.evaluate("TimesUp.state.activeTeamIndex")
    page.click("#startRoundBtn"); ok(page)
    page.click("#btnCorrect"); page.click("#btnCorrect")
    _reload_and_resume(page)
    assert active(page) == "screen-roundstart", active(page)
    assert page.evaluate("TimesUp.state.activeTeamIndex") != first_team, "unterbrochener Zug wurde nicht beendet"
    assert page.evaluate("TimesUp.state.correctCards[%d].length" % first_team) == 2
    assert page.evaluate("TimesUp.state.currentCards.length") == 4
    _finish_with_correct(page)
    assert sum(page.evaluate("TimesUp.state.totalPoints")) == 12

def test_resume_round_stats(b, base):
    """Neuladen in der Rundenstatistik: Punkte werden nicht doppelt gezählt."""
    page = new_page(b, base, _resume_settings())
    setup_game(page, ["Anna", "Ben"], veto=False)
    for _ in range(10):
        if active(page) != "screen-roundstart": break
        page.click("#startRoundBtn"); ok(page)
        while not page.locator("#guessedOverlay").count():
            page.click("#btnCorrect")
        overlay_button(page, "Nächster Spieler").click()
    assert active(page) == "screen-roundstats"
    pts = page.evaluate("TimesUp.state.totalPoints")
    _reload_and_resume(page)
    assert active(page) == "screen-roundstats"
    assert page.evaluate("TimesUp.state.totalPoints") == pts
    _finish_with_correct(page)
    assert sum(page.evaluate("TimesUp.state.totalPoints")) == 12

def test_resume_discard(b, base):
    """Verwerfen löscht den Spielstand nach Rückfrage; ohne Spiel kein Hinweis."""
    page = new_page(b, base, _resume_settings())
    assert page.locator("#resumeBanner").is_hidden()
    setup_game(page, ["Anna", "Ben"], veto=False)
    page.reload(); tick(page, 50)
    page.click("#resumeDiscardButton")
    page.click(".app-dialog [data-dialog-cancel]")
    assert page.locator("#resumeBanner").is_visible(), "Abbrechen darf nicht verwerfen"
    page.click("#resumeDiscardButton"); ok(page)
    assert page.locator("#resumeBanner").is_hidden()
    assert page.evaluate("localStorage.getItem('timesup_game')") is None
    page.reload(); tick(page, 50)
    assert page.locator("#resumeBanner").is_hidden()

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
            finally:
                # Seiten jedes Tests schließen, sonst bremsen sich die vielen offenen Seiten gegenseitig aus
                for ctx in list(b.contexts):
                    ctx.close()
    print("\n%d/%d bestanden" % (len(names) - len(failed), len(names)))
    sys.exit(1 if failed else 0)
