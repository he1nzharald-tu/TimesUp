"""Gemeinsame Test-Hilfen für TimesUp (Playwright).

Umgebungsvariablen:
  REPO         Pfad zur App (Standard: Ordner über tests/)
  CHROME_PATH  Pfad zu einem installierten Chrome/Chromium
               (Standard: von Playwright installiertes Chromium)
"""
import contextlib
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(os.environ.get("REPO", Path(__file__).resolve().parent.parent))
CARDS = json.loads((REPO / "data" / "cards.json").read_text(encoding="utf-8"))["cards"]

# Deterministischer Zufall, damit Screenshots vergleichbar sind
SEED_SCRIPT = """
(() => { let s = 123456789; Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; })();
"""

DEFAULT_SETTINGS = {
    "cardCount": 8, "roundCount": 3, "teamCount": 2,
    "roundRules": ["Nur beschreiben", "Nur ein Wort", "Pantomime und Geräusche"],
    "roundTimer": [10, 10, 10], "roundSkip": ["yes", "yes", "no"],
    "skipLimitType": ["unlimited", "unlimited", "limited"], "skipLimitValue": [1000, 1000, 0],
    "vetoCount": 1, "handicapEnabled": False, "handicapTime": 5,
    "punishEnabled": True, "punishTime": 2, "punishPoints": "no",
}


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def server(root=REPO):
    """Statischer Webserver für die App auf einem freien Port."""
    port = free_port()
    p = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "-d", str(root), "--bind", "127.0.0.1"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.1)
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        p.terminate()


@contextlib.contextmanager
def browser():
    with sync_playwright() as p:
        chrome = os.environ.get("CHROME_PATH")
        b = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()
        try:
            yield b
        finally:
            b.close()


def new_page(b, base, settings=None, viewport=(1280, 720), theme=None, seed=True, block_sw=True, clock=True):
    """Neue Seite mit leerem Speicher; optional mit Einstellungen, Design, festem Zufall und steuerbarer Uhr."""
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]},
                        service_workers="block" if block_sw else "allow")
    if seed:
        ctx.add_init_script(SEED_SCRIPT)
    init = ""
    if settings is not None:
        init += "localStorage.setItem('timesup_settings', %s);" % json.dumps(json.dumps(settings))
    if theme:
        init += "localStorage.setItem('timesup_theme', %s);" % json.dumps(theme)
    if init:
        ctx.add_init_script("if(!sessionStorage.getItem('__init')){sessionStorage.setItem('__init','1');" + init + "}")
    page = ctx.new_page()
    page.errors = []
    page.dialogs = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("dialog", lambda d: (page.dialogs.append(d.message), d.accept()))
    if clock:
        page.clock.install()
    page.goto(base + "/index.html")
    page.wait_for_function("document.getElementById('kartenStatusText').textContent.includes('Karten')", timeout=10000)
    tick(page, 50)
    return page


def tick(page, ms):
    """Uhr der Seite vorstellen (Timer, Strafzeit); ohne installierte Uhr echt warten."""
    try:
        page.clock.run_for(ms)
    except Exception:
        page.wait_for_timeout(ms)


def ok(page, timeout=5000):
    """Bestätigt den App-Dialog, der jetzt erscheinen soll (wartet bis zu 5 s, auch unter Last)."""
    loc = page.locator(".app-dialog [data-dialog-ok]")
    try:
        loc.first.wait_for(state="visible", timeout=timeout)
        loc.first.click()
        tick(page, 50)
        return True
    except Exception:
        return False


def maybe_ok(page):
    """Bestätigt einen App-Dialog, falls gerade einer erscheint (nur kurz warten)."""
    return ok(page, timeout=300)
