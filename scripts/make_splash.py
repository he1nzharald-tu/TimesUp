"""Startbilder (apple-touch-startup-image) für iPhone und iPad erzeugen.

Aufruf im Repo-Ordner:  python3 scripts/make_splash.py
Schreibt icons/splash/*.png und gibt die <link>-Zeilen für index.html aus.
Farben wie die App: hell #ffffff, dunkel #0b1220; in der Mitte das App-Symbol.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "icons" / "splash"
ICON = Image.open(REPO / "icons" / "icon-1024.png").convert("RGBA")

# Gerät: (CSS-Breite, CSS-Höhe, Pixelverhältnis) im Hochformat
DEVICES = {
    "iphone-se": (375, 667, 2),
    "iphone-15-16": (393, 852, 3),
    "iphone-16-pro": (402, 874, 3),
    "iphone-plus-max": (430, 932, 3),
    "iphone-16-pro-max": (440, 956, 3),
    "iphone-x-11pro": (375, 812, 3),
    "iphone-xr-11": (414, 896, 2),
    "ipad-mini": (744, 1133, 2),
    "ipad-air-11": (820, 1180, 2),
    "ipad-10": (810, 1080, 2),
    "ipad-pro-13": (1032, 1376, 2),
    "ipad-pro-12": (1024, 1366, 2),
}
THEMES = {"hell": ("#ffffff", "#1f2328", "light"), "dunkel": ("#0b1220", "#e6eef6", "dark")}


def make(w, h, dpr, bg, fg):
    W, H = w * dpr, h * dpr
    img = Image.new("RGB", (W, H), bg)
    size = int(min(W, H) * 0.28)
    icon = ICON.resize((size, size), Image.LANCZOS)
    img.paste(icon, ((W - size) // 2, (H - size) // 2 - int(size * 0.15)), icon)
    font_path = REPO / "fonts" / "fredoka"
    try:
        font = ImageFont.truetype(str(next(font_path.glob("*.ttf"))), int(size * 0.22))
    except Exception:
        font = None
    if font:
        d = ImageDraw.Draw(img)
        text = "TimesUp"
        tw = d.textlength(text, font=font)
        d.text(((W - tw) / 2, (H + size) / 2), text, fill=fg, font=font)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lines = []
    for name, (w, h, dpr) in DEVICES.items():
        for theme, (bg, fg, scheme) in THEMES.items():
            for orient, (cw, ch) in {"hoch": (w, h), "quer": (h, w)}.items():
                fname = f"{name}-{orient}-{theme}.png"
                make(cw, ch, dpr, bg, fg).quantize(colors=96, method=Image.Quantize.FASTOCTREE).save(OUT / fname, optimize=True)
                media = (f"(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {dpr}) "
                         f"and (orientation: {'portrait' if orient == 'hoch' else 'landscape'}) and (prefers-color-scheme: {scheme})")
                lines.append(f'    <link rel="apple-touch-startup-image" media="{media}" href="icons/splash/{fname}" />')
    print("\n".join(lines))


if __name__ == "__main__":
    main()
