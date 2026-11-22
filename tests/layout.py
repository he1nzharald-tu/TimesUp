"""Layoutprüfung für TimesUp auf vielen Geräten (Playwright).

Spielt ein kurzes Spiel auf jedem Geräteprofil durch, fotografiert jeden
Bildschirm und prüft dabei automatisch:

  Fehler     – Bedienelement ragt aus dem Bildschirm
             – Bedienelement liegt unter Statusleiste/Dynamic Island/Home-Leiste
             – Inhalt wird abgeschnitten (overflow: hidden mit Überlauf)
             – Hauptaktion des Bildschirms nicht sichtbar
  Hinweise   – Tippfläche kleiner als 44 × 44 px
             – Text kleiner als 12 px
             – Eingabefeld kleiner als 16 px (Safari zoomt dann hinein)

Aufruf im Repo-Ordner:
    python3 tests/layout.py                       # alle Geräte, hell
    python3 tests/layout.py iphone16pro ipadmini  # nur diese Geräte
    python3 tests/layout.py --dark                # zusätzlich dunkles Design
    python3 tests/layout.py --strict              # Exit-Code 1 bei Fehlern
    python3 tests/layout.py --out /tmp/layout     # Ausgabeordner

Ergebnis im Ausgabeordner (Standard: tests/layout-out/, nicht im Git):
    shots/<gerät>__<zustand>.png   einzelne Aufnahmen (mit eingeblendeten Systembereichen)
    sheet_<gerät>.png              Übersicht je Gerät
    report.json / report.txt       alle Befunde
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import DEFAULT_SETTINGS, browser, maybe_ok, new_page, ok, server, tick  # noqa: E402

# name: (breite, höhe, safe area (oben, rechts, unten, links), beschreibung)
# Safe Areas gelten für die installierte App mit viewport-fit=cover.
DEVICES = {
    "iphone16pro":        (402, 874,  (62, 0, 34, 0),  "iPhone 16 Pro, installierte App"),
    "iphone16pro-quer":   (874, 402,  (0, 62, 21, 62), "iPhone 16 Pro quer, installierte App"),
    "iphone16pro-safari": (402, 750,  (0, 0, 0, 0),    "iPhone 16 Pro in Safari, Leisten sichtbar"),
    "iphoneSE":           (375, 667,  (20, 0, 0, 0),   "iPhone SE (3. Gen.)"),
    "iphoneSE-quer":      (667, 375,  (0, 0, 0, 0),    "iPhone SE quer"),
    "iphone16promax":     (440, 956,  (62, 0, 34, 0),  "iPhone 16 Pro Max"),
    "galaxyS24":          (360, 780,  (0, 0, 0, 0),    "Samsung Galaxy S24"),
    "galaxyS24-quer":     (780, 360,  (0, 0, 0, 0),    "Samsung Galaxy S24 quer"),
    "ipadmini":           (744, 1133, (24, 0, 20, 0),  "iPad mini hochkant"),
    "ipadair-quer":       (1180, 820, (24, 0, 20, 0),  "iPad Air 11 quer"),
    "ipad-split":         (590, 820,  (24, 0, 20, 0),  "iPad Air halber Split View"),
    "ipadpro13":          (1032, 1376, (24, 0, 20, 0), "iPad Pro 13 hochkant"),
    "ipad-slideover":     (320, 1000, (24, 0, 20, 0),  "iPad Slide Over"),
}

# Hauptaktion je Bildschirm (muss ohne Scrollen sichtbar sein)
PRIMARY = {
    "screen-start": ".start-continue-btn, #startContinueBtn",
    "screen-teamauswahl": "#screen-teamauswahl button[onclick^='assignRandomTeams']",
    "screen-teamuebersicht": "#screen-teamuebersicht button[onclick='startCardSelection(true)']",
    "screen-kartenauswahl": "#cardSelectionInfo, #cardDoneButton",
    "screen-spieluebersicht": "#screen-spieluebersicht button[onclick^='startGame']",
    "screen-roundstart": "#startRoundBtn",
    "screen-play": "#btnCorrect",
    "screen-roundstats": "#screen-roundstats .next-round-btn",
    "screen-end": "#screen-end .back-to-start-btn",
}

AUDIT = r"""([sa, primary]) => {
  const vw = innerWidth, vh = innerHeight;
  const sc = document.querySelector('.screen.active');
  const dlg = [...document.querySelectorAll('.app-dialog, #guessedOverlay')].find(d => d.offsetParent !== null);
  const scope = dlg || sc;
  const out = {screen: sc ? sc.id : null, dialog: !!dlg, vw, vh, errors: [], hints: []};
  const vis = e => {
    if (e.closest('[hidden]')) return false;
    const s = getComputedStyle(e); const b = e.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0 && b.width > 0 && b.height > 0;
  };
  const label = e => ((e.getAttribute('aria-label') || e.textContent || e.id || e.className || e.tagName) + '')
      .replace(/\s+/g, ' ').trim().slice(0, 30);
  // Sichtbar = nicht von einem scrollbaren Vorfahren weggeschnitten
  const clippedAway = e => {
    const b = e.getBoundingClientRect();
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') {
        const pb = p.getBoundingClientRect();
        if (b.bottom <= pb.top + 1 || b.top >= pb.bottom - 1) return true;
      }
    }
    return false;
  };
  // Kann ein Vorfahr in Richtung dir (1 = runter, -1 = hoch) weiterscrollen? Dann ist die Überdeckung nur vorübergehend.
  const scrollable = (e, dir) => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      const isRoot = p === document.scrollingElement;
      if (!(o === 'auto' || o === 'scroll' || isRoot)) continue;
      if (dir > 0 && p.scrollTop + p.clientHeight < p.scrollHeight - 2) return true;
      if (dir < 0 && p.scrollTop > 2) return true;
    }
    return false;
  };
  // Ragt sichtbarer Inhalt über den Rand eines Elements mit overflow: hidden?
  const overflowsBox = (e, axis) => {
    const r = e.getBoundingClientRect();
    const beyond = q => axis === 'x' ? (q.right > r.right + 2 || q.left < r.left - 2) : (q.bottom > r.bottom + 2 || q.top < r.top - 2);
    let hit = false;
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (n.nodeType === 1) {
          if (n.matches('.visually-hidden, [hidden]')) return NodeFilter.FILTER_REJECT;
          const st = getComputedStyle(n);
          if (st.display === 'none' || st.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
          if (n !== e && /auto|scroll|hidden|clip/.test(st.overflowX + st.overflowY)) {
            if (n.getBoundingClientRect().width && beyond(n.getBoundingClientRect())) hit = true;
            return NodeFilter.FILTER_REJECT;   // Inhalt prüft dieses Element selbst
          }
          if (st.position === 'fixed') return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }});
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (hit) return true;
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) if (q.width && beyond(q)) return true;
      } else if (n.getBoundingClientRect().width && n.children.length === 0 && beyond(n.getBoundingClientRect())) return true;
    }
    return hit;
  };
  if (!scope) return out;
  const interactive = [...scope.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab], [role=switch], .switch, .chip, li[onclick]')]
      .filter(e => vis(e) && !e.classList.contains('visually-hidden') && !clippedAway(e));
  for (const e of interactive) {
    const b = e.getBoundingClientRect(), l = label(e);
    if (b.right > vw + 1 || b.left < -1 || b.bottom > vh + 1 && !e.closest('[style*=overflow]')) {
      if (b.left < -1 || b.right > vw + 1) out.errors.push(`ragt seitlich heraus: ${l}`);
    }
    if (b.top < sa[0] - 1 && b.bottom > 0 && !scrollable(e, -1)) out.errors.push(`unter Statusleiste/Insel: ${l}`);
    if (b.bottom > vh - sa[2] + 1 && b.top < vh && !scrollable(e, 1)) out.errors.push(`unter Home-Leiste: ${l}`);
    if (b.left < sa[3] - 1 && b.right > 0) out.errors.push(`unter Seitenrand (Insel): ${l}`);
    if (b.right > vw - sa[1] + 1 && b.left < vw) out.errors.push(`unter Seitenrand (Insel): ${l}`);
    if (b.width < 43.5 || b.height < 43.5) out.hints.push(`Tippfläche ${Math.round(b.width)}×${Math.round(b.height)}: ${l}`);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !['checkbox', 'radio', 'range'].includes(e.type)
        && parseFloat(getComputedStyle(e).fontSize) < 16) out.hints.push(`Eingabe < 16 px: ${l}`);
  }
  // Abgeschnittener Inhalt
  for (const e of scope.querySelectorAll('*')) {
    if (!vis(e) || clippedAway(e)) continue;
    const s = getComputedStyle(e);
    const hidX = s.overflowX === 'hidden' || s.overflowX === 'clip';
    const hidY = s.overflowY === 'hidden' || s.overflowY === 'clip';
    if (!hidX && !hidY) continue;
    if (s.textOverflow === 'ellipsis') continue;
    if (e.matches('.visually-hidden, svg, canvas, img')) continue;
    if (s.clip !== 'auto' || (e.clientWidth <= 1 && e.clientHeight <= 1)) continue;  // nur für Screenreader
    if (e === document.body || e === document.documentElement) continue;
    if (hidX && e.scrollWidth > e.clientWidth + 2 && overflowsBox(e, 'x'))
      out.errors.push(`seitlich abgeschnitten (${e.scrollWidth - e.clientWidth} px): ${label(e)}`);
    if (hidY && e.scrollHeight > e.clientHeight + 2 && overflowsBox(e, 'y'))
      out.errors.push(`unten abgeschnitten (${e.scrollHeight - e.clientHeight} px): ${label(e)}`);
  }
  // Freier Platz unter dem Inhalt des Bildschirms (ohne fest positionierte Leisten)
  let free = 0;
  if (sc) {
    let bottom = sc.getBoundingClientRect().top;
    for (const c of sc.querySelectorAll('*')) {
      if (!vis(c) || getComputedStyle(c).position === 'fixed' || c.closest('.bottom-bar, .play-actions')) continue;
      bottom = Math.max(bottom, Math.min(c.getBoundingClientRect().bottom, vh));
    }
    const bar = [...sc.querySelectorAll('.bottom-bar, .play-actions')].find(vis);
    const limit = bar ? bar.getBoundingClientRect().top : Math.min(sc.getBoundingClientRect().bottom, vh);
    free = Math.max(0, limit - bottom);
  }
  // Verschachtelte Scrollbereiche (auf dem Handy schwer zu bedienen)
  if (sc) for (const e of sc.querySelectorAll('*')) {
    if (!vis(e) || clippedAway(e)) continue;
    const s = getComputedStyle(e);
    if (/auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && free > 80)
      out.errors.push(`Liste zeigt ${e.clientHeight} von ${e.scrollHeight} px, obwohl ${Math.round(free)} px frei sind: ${label(e)}`);
    else if (/auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2) out.hints.push(`eigener Scrollbereich (${e.clientHeight} von ${e.scrollHeight} px sichtbar): ${label(e)}`);
    if (/auto|scroll/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 2) out.hints.push(`seitlicher Scrollbereich (${e.clientWidth} von ${e.scrollWidth} px sichtbar): ${label(e)}`);
  }
  // Bildschirm länger als das Gerät = Inhalt unten nicht erreichbar (Seite selbst scrollt nicht)
  if (sc) {
    const r = sc.getBoundingClientRect();
    if (r.bottom > vh + 1 || r.top < -1) out.errors.push(`Bildschirm ${Math.round(r.height)} px hoch bei ${vh} px Gerät – nicht scrollbar`);
  }
  // Overlay: Inhalt muss erreichbar sein (Overlay oder Box scrollt)
  if (dlg) {
    const box = dlg.querySelector('.overlay-box, .app-dialog') || dlg;
    const b = box.getBoundingClientRect();
    const scrolls = el => /auto|scroll/.test(getComputedStyle(el).overflowY);
    if ((b.bottom > vh + 1 || b.top < -1) && !scrolls(dlg) && !scrolls(box)) out.errors.push('Overlay länger als Gerät und nicht scrollbar');
  }
  // Seite selbst breiter als Bildschirm
  if (document.documentElement.scrollWidth > vw + 1) out.errors.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} px)`);
  // Kleiner Text
  let tiny = 0;
  for (const e of scope.querySelectorAll('*')) {
    if (e.children.length === 0 && e.textContent.trim() && vis(e) && !clippedAway(e) && parseFloat(getComputedStyle(e).fontSize) < 12) tiny++;
  }
  if (tiny) out.hints.push(`${tiny} Text(e) kleiner als 12 px`);
  // Hauptaktion sichtbar?
  if (primary && !dlg) {
    const p = [...document.querySelectorAll(primary)].find(vis);
    if (!p) out.errors.push('Hauptaktion fehlt');
    else {
      const b = p.getBoundingClientRect();
      if (b.top < 0 || b.bottom > vh + 1 || clippedAway(p)) out.errors.push(`Hauptaktion außerhalb des Bildschirms: ${label(p)}`);
    }
  }
  // Kontrast (WCAG AA): 4,5:1, große Schrift 3:1; Hintergründe mit Verlauf werden übersprungen
  const parse = c => {
    let m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = c.match(/color\(srgb ([^)]+)\)/);   // Ergebnis von color-mix()
    if (m) { const p = m[1].split(/[ \/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = e => {
    for (let p = e; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.backgroundImage && st.backgroundImage !== 'none' && !p.classList.contains('screen')) return null;
      const c = parse(st.backgroundColor);
      if (c && c[3] > 0.9) return c;
    }
    return [255, 255, 255, 1];
  };
  const seen = new Set();
  for (const e of scope.querySelectorAll('*')) {
    const txt = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!txt || !vis(e) || clippedAway(e)) continue;
    const st = getComputedStyle(e);
    if (+st.opacity < 1 || e.closest('button:disabled')) continue;
    const fg = parse(st.color), bg = bgOf(e);
    if (!fg || !bg) continue;
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(st.fontSize), bold = parseInt(st.fontWeight) >= 600;
    const need = (size >= 24 || (bold && size >= 18.6)) ? 3 : 4.5;
    if (ratio < need - 0.05) {
      const key = label(e);
      if (!seen.has(key)) { seen.add(key); out.hints.push(`Kontrast ${ratio.toFixed(1)}:1 (nötig ${need}): ${key}`); }
    }
  }
  out.errors = [...new Set(out.errors)];
  out.hints = [...new Set(out.hints)];
  return out;
}"""

# Systembereiche einblenden (nur für das Foto, nach der Prüfung)
MASK = r"""([sa, vw, vh, quer]) => {
  document.getElementById('__sa_mask')?.remove();
  const m = document.createElement('div'); m.id = '__sa_mask';
  m.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const add = css => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;' + css; m.appendChild(d); };
  if (sa[0]) add(`left:0;right:0;top:0;height:${sa[0]}px;background:rgba(255,0,80,.12);border-bottom:1px dashed rgba(255,0,80,.6)`);
  if (sa[2]) add(`left:0;right:0;bottom:0;height:${sa[2]}px;background:rgba(255,0,80,.12);border-top:1px dashed rgba(255,0,80,.6)`);
  if (sa[3]) add(`left:0;top:0;bottom:0;width:${sa[3]}px;background:rgba(255,0,80,.12)`);
  if (sa[1]) add(`right:0;top:0;bottom:0;width:${sa[1]}px;background:rgba(255,0,80,.12)`);
  if (sa[0] >= 44) add(`left:50%;top:11px;width:125px;height:37px;margin-left:-62px;border-radius:20px;background:#000`);
  if (quer && sa[3] >= 44) add(`left:11px;top:50%;height:125px;width:37px;margin-top:-62px;border-radius:20px;background:#000`);
  if (sa[2] >= 20) add(`left:50%;bottom:8px;width:${quer ? 200 : 140}px;height:5px;margin-left:-${quer ? 100 : 70}px;border-radius:3px;background:#000`);
  document.body.appendChild(m);
}"""

# Safe Areas simulieren: Chrome kennt env(safe-area-inset-*) ohne Notch nicht,
# deshalb überschreiben die Tests die Variablen aus css/layout.css.
SA_CSS = ":root{--sa-top:%dpx!important;--sa-right:%dpx!important;--sa-bottom:%dpx!important;--sa-left:%dpx!important}"


class Run:
    def __init__(self, out, mask=True):
        self.out = Path(out)
        (self.out / "shots").mkdir(parents=True, exist_ok=True)
        self.results = []
        self.mask = mask

    def shot(self, page, dev, state, sa, quer):
        tick(page, 400)
        active = page.evaluate("document.querySelector('.screen.active')?.id")
        res = page.evaluate(AUDIT, [list(sa), PRIMARY.get(active)])
        res.update(device=dev, state=state)
        self.results.append(res)
        if self.mask:
            page.evaluate(MASK, [list(sa), page.viewport_size["width"], page.viewport_size["height"], quer])
        page.screenshot(path=str(self.out / "shots" / f"{dev}__{state}.png"))
        if self.mask:
            page.evaluate("document.getElementById('__sa_mask')?.remove()")

    def flow(self, b, base, dev, theme):
        w, h, sa, _ = DEVICES[dev]
        quer = w > h
        tag = dev + ("-dunkel" if theme == "dark" else "")
        s = dict(DEFAULT_SETTINGS)
        s["cardCount"] = 16
        page = new_page(b, base, settings=s, viewport=(w, h), theme=theme)
        page.emulate_media(reduced_motion="reduce")   # Animationen sofort im Endzustand
        page.add_style_tag(content=SA_CSS % sa)
        if getattr(self, "font_scale", 1.0) != 1.0:   # größere Systemschrift (Android/iOS-Zoom) nachbilden
            page.add_style_tag(content="html{font-size:%d%% !important}" % round(self.font_scale * 100))
        shot = lambda name: self.shot(page, tag, name, sa, quer)
        shot("01-start")
        for n in ["Anna", "Ben", "Carla", "David", "Emil", "Frieda", "Gustav", "Hanna"]:
            page.fill("#playerInput", n)
            page.click("button[title='Spieler hinzufügen']")
        shot("01b-start-8-spieler")
        page.click("button[aria-label='Einstellungen']")
        shot("02-einstellungen-karten")
        page.click("#settingsTab-spiel")
        shot("02b-einstellungen-spiel")
        page.click("[data-round='1'] .round-head")
        shot("02c-einstellungen-runde")
        page.evaluate("(() => { const s = document.getElementById('screen-settings'); s.scrollTop = s.scrollHeight; })()")
        shot("02d-einstellungen-unten")
        page.evaluate("showScreen('start')")
        page.click(".start-continue-btn")
        ok(page)
        shot("03-teamauswahl")
        page.click("text=Zufällige Teams")
        shot("04-teamuebersicht")
        page.click("text=Kartenauswahl mit Veto")
        maybe_ok(page)
        tick(page, 200)
        shot("05-kartenauswahl")
        for i in range(12):
            tick(page, 200)
            if page.is_visible("#startGameOverviewButton"):
                break
            page.click("#cardSelectionInfo")
            tick(page, 50)
            if i == 0:
                shot("05b-kartenauswahl-liste")
            page.locator("#cardSelectionList li").first.click()
            ok(page)
            page.click("#cardDoneButton")
            maybe_ok(page)
        page.click("#startGameOverviewButton")
        shot("06-spieluebersicht")
        page.click("#screen-spieluebersicht >> text=Spiel starten")
        shot("07-rundenstart")
        page.click("#startRoundBtn")
        ok(page)
        shot("08-spiel")
        page.click("#btnCorrect")
        tick(page, 12000)
        if page.locator("#guessedOverlay").count():
            shot("08b-zugende")
        seen = set()
        for _ in range(120):
            a = page.evaluate("document.querySelector('.screen.active').id")
            if a == "screen-roundstats":
                if "rs" not in seen:
                    seen.add("rs")
                    shot("09-rundenstatistik")
                page.click("text=Nächste Runde starten")
                continue
            if a == "screen-end":
                shot("10-ende")
                page.click("#screen-end .back-to-start-btn")
                page.click("#loadSavesButton")
                shot("11-archiv")
                if page.locator("#archiveOverlay .archive-game").count():
                    page.locator("#archiveOverlay .archive-game").first.click()
                    shot("11b-archiv-spiel")
                    page.click("#archiveOverlay .archive-tab[data-tab='statistik']")
                    shot("11c-archiv-statistik")
                break
            if page.locator("#guessedOverlay").count():
                page.locator("#guessedOverlay button", has_text="Nächster Spieler").click()
                continue
            if a == "screen-roundstart":
                page.click("#startRoundBtn")
                ok(page)
                continue
            if a == "screen-play":
                if page.locator("#btnCorrect").is_enabled():
                    page.click("#btnCorrect")
                tick(page, 600)
                continue
        page.context.close()

    def sheets(self):
        try:
            from PIL import Image, ImageDraw
        except ImportError:
            return
        by_dev = {}
        for f in sorted((self.out / "shots").glob("*.png")):
            by_dev.setdefault(f.name.split("__")[0], []).append(f)
        for dev, files in by_dev.items():
            ims = [Image.open(f) for f in files]
            hoch = ims[0].height > ims[0].width
            h = 520 if hoch else 300
            ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
            cols = 6 if hoch else 3
            cw = max(i.width for i in ims)
            rows = -(-len(ims) // cols)
            sheet = Image.new("RGB", (cols * (cw + 10), rows * (h + 28)), "#777")
            dr = ImageDraw.Draw(sheet)
            for k, (im, f) in enumerate(zip(ims, files)):
                x, y = (k % cols) * (cw + 10), (k // cols) * (h + 28)
                sheet.paste(im, (x, y + 24))
                n_err = next((len(r["errors"]) for r in self.results
                              if r["device"] == dev and r["state"] == f.stem.split("__")[1]), 0)
                dr.text((x + 4, y + 6), f.stem.split("__")[1] + (f"  [{n_err} Fehler]" if n_err else ""),
                        fill="#ffd0d0" if n_err else "white")
            sheet.save(self.out / f"sheet_{dev}.png")

    def report(self):
        (self.out / "report.json").write_text(json.dumps(self.results, indent=1, ensure_ascii=False), encoding="utf-8")
        lines, n_err, n_hint = [], 0, 0
        for r in self.results:
            n_err += len(r["errors"])
            n_hint += len(r["hints"])
            if r["errors"] or r["hints"]:
                lines.append(f"\n{r['device']} / {r['state']}")
                lines += [f"  FEHLER  {e}" for e in r["errors"]]
                lines += [f"  Hinweis {h}" for h in r["hints"]]
        head = f"{len(self.results)} Aufnahmen, {n_err} Fehler, {n_hint} Hinweise"
        (self.out / "report.txt").write_text(head + "\n" + "\n".join(lines) + "\n", encoding="utf-8")
        return head, n_err


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("devices", nargs="*", help="Geräte (Standard: alle): " + ", ".join(DEVICES))
    ap.add_argument("--dark", action="store_true", help="zusätzlich im dunklen Design")
    ap.add_argument("--strict", action="store_true", help="Exit-Code 1, wenn Fehler gefunden werden")
    ap.add_argument("--font-scale", type=float, default=1.0, help="Systemschrift vergrößern, z. B. 1.3")
    ap.add_argument("--no-mask", action="store_true", help="Systembereiche nicht einblenden")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "layout-out"))
    args = ap.parse_args()
    devs = args.devices or list(DEVICES)
    unknown = [d for d in devs if d not in DEVICES]
    if unknown:
        ap.error("unbekannte Geräte: " + ", ".join(unknown))
    run = Run(args.out, mask=not args.no_mask)
    run.font_scale = args.font_scale
    themes = ["light", "dark"] if args.dark else ["light"]
    failed = []
    with server() as base, browser() as b:
        for d in devs:
            for t in themes:
                try:
                    run.flow(b, base, d, t)
                except Exception as e:  # Ablauf auf einem Gerät gescheitert = Fehler
                    failed.append(f"{d} ({t}): {str(e).splitlines()[0][:200]}")
    run.sheets()
    head, n_err = run.report()
    print(head)
    for f in failed:
        print("ABLAUF GESCHEITERT", f)
    print("Bericht:", Path(args.out) / "report.txt")
    if args.strict and (n_err or failed):
        sys.exit(1)


if __name__ == "__main__":
    main()
