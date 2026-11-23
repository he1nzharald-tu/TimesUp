// Aquarium-Hintergrund für das Design „Unterwasser“.
// Fische, Pflanzen, Sandboden und Luftblasen als SVG; bewegt nur über CSS-Animationen
// (css/themes.css, Abschnitt Aquarium). Wird nur erzeugt, solange das Design aktiv ist.

const NS = "http://www.w3.org/2000/svg";

// Gemeinsame Farbverläufe und Muster (einmal im Dokument, alle Fische verweisen darauf)
export const DEFS = `
<linearGradient id="aq-clown" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ff9a2e"/><stop offset=".45" stop-color="#ff7808"/><stop offset="1" stop-color="#d94f00"/>
</linearGradient>
<linearGradient id="aq-clownfin" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ff9a33" stop-opacity=".95"/><stop offset="1" stop-color="#e65f00" stop-opacity=".88"/>
</linearGradient>
<linearGradient id="aq-band" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe7ee"/>
</linearGradient>
<radialGradient id="aq-shine" cx=".62" cy=".28" r=".55">
  <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<linearGradient id="aq-belly" x1="0" y1="0" x2="0" y2="1">
  <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/>
</linearGradient>
<linearGradient id="aq-tang" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#3d8bff"/><stop offset=".5" stop-color="#1b56d6"/><stop offset="1" stop-color="#0e329a"/>
</linearGradient>
<linearGradient id="aq-yellow" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffe94d"/><stop offset=".55" stop-color="#ffd60a"/><stop offset="1" stop-color="#e9b400"/>
</linearGradient>
<linearGradient id="aq-silver" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#e8edf2"/><stop offset=".5" stop-color="#f7f9fb"/><stop offset="1" stop-color="#b9c2cc"/>
</linearGradient>
<linearGradient id="aq-finclear" x1="1" y1="0" x2="0" y2="0">
  <stop offset="0" stop-color="#dfe8ef" stop-opacity=".75"/><stop offset="1" stop-color="#dfe8ef" stop-opacity=".18"/>
</linearGradient>
<linearGradient id="aq-neon" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#20e3ff"/><stop offset=".6" stop-color="#2aa8ff"/><stop offset="1" stop-color="#6b7bff"/>
</linearGradient>
<pattern id="aq-scales" width="5" height="4" patternUnits="userSpaceOnUse">
  <path d="M0 4 Q2.5 0 5 4" fill="none" stroke="#000" stroke-opacity=".09" stroke-width=".6"/>
  <path d="M-2.5 2 Q0 -2 2.5 2 M2.5 2 Q5 -2 7.5 2" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width=".5"/>
</pattern>
<linearGradient id="aq-sand" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#d8c08a"/><stop offset=".35" stop-color="#c2a56c"/><stop offset="1" stop-color="#7e6a45"/>
</linearGradient>
<linearGradient id="aq-rock" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#7d8790"/><stop offset=".6" stop-color="#4e5860"/><stop offset="1" stop-color="#2c343a"/>
</linearGradient>
<linearGradient id="aq-leaf" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#1f5e2c"/><stop offset=".6" stop-color="#3f9a3f"/><stop offset="1" stop-color="#8fd16a"/>
</linearGradient>
<linearGradient id="aq-leaf2" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#204a1c"/><stop offset="1" stop-color="#5aa83a"/>
</linearGradient>
<clipPath id="aq-c1"><path d="M60 50 C46 38 28 30 13 33 C4 46 4 78 13 91 C28 94 46 86 60 74Z"/></clipPath><clipPath id="aq-c2"><path d="M92 27 C96 14 108 8 118 12 C122 8 126 8 130 12 C140 4 160 6 172 20 C176 26 176 30 172 32Z"/></clipPath><clipPath id="aq-c3"><path d="M168 66 C160 72 152 84 156 92 C166 90 174 80 176 70Z"/></clipPath><clipPath id="aq-c4"><path d="M50 70 C36 54 20 40 6 34 C12 56 12 84 6 106 C20 100 36 86 50 70Z"/></clipPath><clipPath id="aq-c5"><path d="M62 38 C92 10 150 6 186 32 C150 26 100 28 62 46Z"/></clipPath><clipPath id="aq-c6"><path d="M68 104 C100 128 150 132 182 108 C150 114 100 112 68 98Z"/></clipPath><clipPath id="aq-c7"><path d="M168 78 C158 86 150 98 154 106 C164 102 172 92 174 82Z"/></clipPath><clipPath id="aq-c8"><path d="M38 86 C26 72 14 64 4 62 C10 78 10 94 4 110 C14 108 26 100 38 86Z"/></clipPath><clipPath id="aq-c9"><path d="M44 60 C58 18 110 4 142 42 C120 36 80 40 44 68Z"/></clipPath><clipPath id="aq-c10"><path d="M44 112 C58 154 110 166 142 130 C120 136 80 132 44 104Z"/></clipPath><clipPath id="aq-c11"><path d="M130 92 C122 100 118 110 122 116 C130 112 136 104 136 96Z"/></clipPath><clipPath id="aq-c12"><path d="M36 110 C22 92 10 78 2 66 C9 96 9 126 2 156 C10 144 22 128 36 110Z"/></clipPath><clipPath id="aq-c13"><path d="M58 80 C68 42 88 12 98 0 C100 30 110 60 128 86Z"/></clipPath><clipPath id="aq-c14"><path d="M58 140 C68 178 88 208 98 220 C100 190 110 160 128 134Z"/></clipPath><clipPath id="aq-c15"><path d="M19 20 C13 14 7 10 2 8 C5 15 5 25 2 32 C7 30 13 26 19 20Z"/></clipPath><clipPath id="aq-cangel"><path d="M58 80 C68 42 88 12 98 0 C100 30 110 60 128 86Z"/><path d="M58 140 C68 178 88 208 98 220 C100 190 110 160 128 134Z"/><path d="M32 110 C40 72 82 60 120 78 C138 88 150 102 154 108 C155 110 155 112 154 114 C148 122 138 132 120 142 C82 160 40 148 32 110Z"/></clipPath>
<radialGradient id="aq-irisshade" cx=".4" cy=".35" r=".7">
  <stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/>
</radialGradient>
<radialGradient id="aq-rim" cx=".55" cy=".42" r=".62">
  <stop offset=".55" stop-color="#001a33" stop-opacity="0"/><stop offset=".86" stop-color="#001a33" stop-opacity=".22"/><stop offset="1" stop-color="#001a33" stop-opacity=".5"/>
</radialGradient>
<radialGradient id="aq-spec">
  <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<pattern id="aq-caust" width="40" height="26" patternUnits="userSpaceOnUse">
  <path d="M0 8 C8 2 14 14 22 8 S34 2 40 8 M4 20 C12 14 18 26 28 20 S36 16 40 20" fill="none" stroke="#e8fbff" stroke-opacity=".22" stroke-width="2"/>
</pattern>
<linearGradient id="aq-yellowfin" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffe14a" stop-opacity=".92"/><stop offset="1" stop-color="#f5c800"/>
</linearGradient>`;

// Auge mit Iris, Pupille und Glanzpunkt
const eye = (x, y, r, iris = "#c8641a") => `
  <circle cx="${x}" cy="${y}" r="${r * 1.45}" fill="#000" opacity=".18"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${iris}"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="url(#aq-irisshade)"/>
  <circle cx="${x + r * 0.08}" cy="${y + r * 0.05}" r="${r * 0.62}" fill="#050505"/>
  <ellipse cx="${x - r * 0.3}" cy="${y - r * 0.38}" rx="${r * 0.32}" ry="${r * 0.22}" fill="#fff" opacity=".92"/>
  <circle cx="${x + r * 0.35}" cy="${y + r * 0.35}" r="${r * 0.12}" fill="#fff" opacity=".5"/>`;

// Flossenstrahlen: feine Linien vom Ansatz (bx, by) zu Punkten am Flossenrand
const rays = (bx, by, pts, color = "#000", op = 0.22, w = 0.9) =>
    `<path d="${pts.map(([x, y]) => `M${bx} ${by} L${x} ${y}`).join(" ")}" stroke="${color}" stroke-opacity="${op}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
const arc = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n }, (_, i) => {
    const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180;
    return [+(cx + rx * Math.cos(a)).toFixed(1), +(cy + ry * Math.sin(a)).toFixed(1)];
});

// Licht und Volumen über jedem Körper: Schuppen, Bauchschatten, dunkler Rand, Glanz
const shade = (d, spec) => `
<path d="${d}" fill="url(#aq-scales)"/>
<path d="${d}" fill="url(#aq-belly)"/>
<path d="${d}" fill="url(#aq-rim)"/>
<path d="${d}" fill="url(#aq-caust)" opacity=".3"/>
<ellipse cx="${spec[0]}" cy="${spec[1]}" rx="${spec[2]}" ry="${spec[3]}" transform="rotate(${spec[4] || -4} ${spec[0]} ${spec[1]})" fill="url(#aq-spec)"/>`;

const CLOWN_BODY = "M52 62 C58 34 96 20 140 21 C172 22 200 36 214 54 C219 60 219 66 214 71 C200 88 172 101 140 102 C96 104 58 90 52 62Z";
const TANG_BODY = "M44 70 C54 30 108 16 158 24 C192 32 212 54 214 68 C214 84 196 104 160 114 C110 124 54 110 44 70Z";
const YELLOW_BODY = "M34 86 C40 48 90 30 130 44 C150 52 164 66 178 78 C181 81 181 85 178 88 C164 100 150 114 130 124 C90 140 40 124 34 86Z";
const ANGEL_BODY = "M32 110 C40 72 82 60 120 78 C138 88 150 102 154 108 C155 110 155 112 154 114 C148 122 138 132 120 142 C82 160 40 148 32 110Z";
const NEON_BODY = "M16 20 C24 11 58 8 82 13 C90 15 96 17.5 98 20 C96 22.5 90 25 82 27 C58 32 24 29 16 20Z";

// Jeder Fisch schaut nach rechts; die Schwanzflosse ist eine eigene Gruppe (.aq-tail),
// damit sie unabhängig vom Körper schlagen kann.
export const FISH = {
    // Falscher Clownfisch (Amphiprion ocellaris)
    clown: { w: 230, h: 124, svg: `
<g class="aq-tail">
  <path d="M60 50 C46 38 28 30 13 33 C4 46 4 78 13 91 C28 94 46 86 60 74Z" fill="url(#aq-clownfin)"/>
  <g clip-path="url(#aq-c1)">${rays(60, 62, arc(60, 62, 50, 31, 140, 220, 12), "#8a3200", 0.35)}</g>
  <path d="M13 33 C4 46 4 78 13 91" fill="none" stroke="#0b0b0b" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M17 35 C10 47 10 77 17 89" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>
</g>
<path d="M92 27 C96 14 108 8 118 12 C122 8 126 8 130 12 C140 4 160 6 172 20 C176 26 176 30 172 32Z" fill="url(#aq-clownfin)"/>
<g clip-path="url(#aq-c2)">${rays(130, 32, [[96, 18], [104, 12], [112, 11], [120, 12], [128, 11], [138, 7], [148, 6], [158, 8], [166, 14], [171, 22]], "#8a3200", 0.35)}</g>
<path d="M92 27 C96 14 108 8 118 12 C122 8 126 8 130 12 C140 4 160 6 172 20 C176 26 176 30 172 32" fill="none" stroke="#0b0b0b" stroke-width="3" stroke-linejoin="round"/>
<path d="M116 98 C120 112 134 120 146 115 C152 110 152 102 150 96Z" fill="url(#aq-clownfin)" stroke="#0b0b0b" stroke-width="2.6"/>
<path d="M150 96 C148 110 156 118 164 116 C166 108 164 100 160 96Z" fill="url(#aq-clownfin)" stroke="#0b0b0b" stroke-width="2.2"/>
<path d="${CLOWN_BODY}" fill="url(#aq-clown)"/>
<path d="M158 22 C170 40 172 82 160 101 L177 97 C189 78 189 44 175 25Z" fill="url(#aq-band)"/>
<path d="M110 21 C124 38 128 66 114 102 L134 102 C146 74 144 42 128 21Z" fill="url(#aq-band)"/>
<path d="M62 42 C68 52 68 72 62 84 L74 90 C82 76 82 48 74 36Z" fill="url(#aq-band)"/>
<g fill="none" stroke="#111" stroke-width="1.8" stroke-opacity=".85">
  <path d="M158 22 C170 40 172 82 160 101 M177 97 C189 78 189 44 175 25"/>
  <path d="M110 21 C124 38 128 66 114 102 M134 102 C146 74 144 42 128 21"/>
  <path d="M62 42 C68 52 68 72 62 84 M74 90 C82 76 82 48 74 36"/>
</g>
<path d="M70 60 C110 56 150 54 186 58" fill="none" stroke="#7a2c00" stroke-opacity=".18" stroke-width="1.2"/>
<path d="M182 34 C172 50 172 76 184 92" fill="none" stroke="#7a2c00" stroke-opacity=".3" stroke-width="1.6"/>
${shade(CLOWN_BODY, [150, 34, 46, 8])}
<path d="M212 66 Q217 67 219 62" fill="none" stroke="#5a2000" stroke-width="1.6" stroke-linecap="round"/>
<g class="aq-fin">
  <path d="M168 66 C160 72 152 84 156 92 C166 90 174 80 176 70Z" fill="url(#aq-clownfin)" fill-opacity=".8"/>
  <g clip-path="url(#aq-c3)">${rays(172, 68, [[156, 90], [158, 86], [161, 82], [165, 78], [170, 74]], "#8a3200", 0.4)}</g>
  <path d="M156 92 C166 90 174 80 176 70" fill="none" stroke="#0b0b0b" stroke-width="2"/>
</g>
${eye(193, 51, 7)}` },

    // Paletten-Doktorfisch (Paracanthurus hepatus)
    tang: { w: 220, h: 140, svg: `
<g class="aq-tail">
  <path d="M50 70 C36 54 20 40 6 34 C12 56 12 84 6 106 C20 100 36 86 50 70Z" fill="url(#aq-yellow)"/>
  <g clip-path="url(#aq-c4)">${rays(50, 70, arc(50, 70, 44, 36, 145, 215, 11), "#8a6a00", 0.3)}</g>
  <path d="M6 34 C16 40 30 50 40 60 M6 106 C16 100 30 90 40 80" fill="none" stroke="#0a0d24" stroke-width="4" stroke-linecap="round"/>
</g>
<path d="M62 38 C92 10 150 6 186 32 C150 26 100 28 62 46Z" fill="#0c1a5c"/>
<g clip-path="url(#aq-c5)">${rays(124, 34, arc(124, 34, 62, 26, 200, 330, 14), "#3d8bff", 0.35, 0.8)}</g>
<path d="M62 38 C92 10 150 6 186 32" fill="none" stroke="#5aa0ff" stroke-width="1.6"/>
<path d="M68 104 C100 128 150 132 182 108 C150 114 100 112 68 98Z" fill="#0c1a5c"/>
<g clip-path="url(#aq-c6)">${rays(124, 106, arc(124, 106, 60, 22, 30, 150, 12), "#3d8bff", 0.35, 0.8)}</g>
<path d="${TANG_BODY}" fill="url(#aq-tang)"/>
<path d="M196 50 C166 34 126 36 96 44 C74 50 60 60 50 68 C66 64 84 60 100 62 C124 66 134 80 120 92 C112 98 96 98 88 92 C100 102 128 106 144 94 C160 82 154 62 172 58 C184 56 192 60 200 58Z" fill="#090c22"/>
${shade(TANG_BODY, [150, 34, 50, 9])}
<path d="M56 70 L64 66 L64 74Z" fill="#ffd60a"/>
<path d="M186 44 C178 58 178 82 188 96" fill="none" stroke="#0a1a4a" stroke-opacity=".5" stroke-width="1.6"/>
<g class="aq-fin">
  <path d="M168 78 C158 86 150 98 154 106 C164 102 172 92 174 82Z" fill="#ffd60a" fill-opacity=".7"/>
  <g clip-path="url(#aq-c7)">${rays(172, 80, [[154, 104], [157, 100], [161, 95], [166, 90]], "#8a6a00", 0.4)}</g>
</g>
<path d="M208 76 Q212 77 214 72" fill="none" stroke="#090c22" stroke-width="1.6" stroke-linecap="round"/>
${eye(192, 61, 6.2, "#2a2f5a")}` },

    // Gelber Segelflossendoktor (Zebrasoma flavescens)
    yellow: { w: 180, h: 170, svg: `
<g class="aq-tail">
  <path d="M38 86 C26 72 14 64 4 62 C10 78 10 94 4 110 C14 108 26 100 38 86Z" fill="url(#aq-yellow)"/>
  <g clip-path="url(#aq-c8)">${rays(38, 86, arc(38, 86, 34, 24, 150, 210, 9), "#9a7500", 0.3)}</g>
</g>
<path d="M44 60 C58 18 110 4 142 42 C120 36 80 40 44 68Z" fill="url(#aq-yellowfin)"/>
<g clip-path="url(#aq-c9)">${rays(96, 60, arc(96, 54, 56, 44, 200, 320, 14), "#9a7500", 0.3)}</g>
<path d="M44 112 C58 154 110 166 142 130 C120 136 80 132 44 104Z" fill="url(#aq-yellowfin)"/>
<g clip-path="url(#aq-c10)">${rays(96, 112, arc(96, 118, 56, 44, 40, 160, 14), "#9a7500", 0.3)}</g>
<path d="${YELLOW_BODY}" fill="url(#aq-yellow)"/>
<g stroke="#c89a00" stroke-opacity=".22" stroke-width="1.2" fill="none">
  <path d="M60 52 C64 80 64 100 60 126"/><path d="M80 44 C84 80 84 104 80 134"/><path d="M100 42 C104 80 104 104 100 136"/><path d="M120 44 C123 80 123 104 120 130"/>
</g>
${shade(YELLOW_BODY, [118, 54, 34, 7, -12])}
<path d="M44 82 L56 85 L44 88Z" fill="#fffef0" stroke="#c89a00" stroke-width=".8"/>
<path d="M140 62 C132 76 132 96 142 108" fill="none" stroke="#b38600" stroke-opacity=".4" stroke-width="1.4"/>
<g class="aq-fin">
  <path d="M130 92 C122 100 118 110 122 116 C130 112 136 104 136 96Z" fill="#fff6a8" fill-opacity=".7"/>
  <g clip-path="url(#aq-c11)">${rays(134, 94, [[122, 114], [125, 110], [129, 104]], "#9a7500", 0.35)}</g>
</g>
${eye(152, 75, 5.6, "#3a2c00")}` },

    // Segelflosser / Skalar (Pterophyllum scalare)
    angel: { w: 160, h: 220, svg: `
<g class="aq-tail">
  <path d="M36 110 C22 92 10 78 2 66 C9 96 9 126 2 156 C10 144 22 128 36 110Z" fill="url(#aq-finclear)"/>
  <g clip-path="url(#aq-c12)">${rays(36, 110, arc(36, 110, 34, 46, 140, 220, 13), "#8090a0", 0.45, 0.7)}</g>
</g>
<path d="M58 80 C68 42 88 12 98 0 C100 30 110 60 128 86Z" fill="url(#aq-finclear)"/>
<g clip-path="url(#aq-c13)">${rays(92, 84, [[62, 70], [68, 52], [76, 34], [84, 18], [92, 6], [98, 2], [102, 30], [110, 56], [120, 76]], "#8090a0", 0.45, 0.7)}</g>
<path d="M58 140 C68 178 88 208 98 220 C100 190 110 160 128 134Z" fill="url(#aq-finclear)"/>
<g clip-path="url(#aq-c14)">${rays(92, 136, [[62, 150], [68, 168], [76, 186], [84, 202], [92, 214], [98, 218], [102, 190], [110, 164], [120, 144]], "#8090a0", 0.45, 0.7)}</g>
<path d="M112 140 C112 170 106 196 98 216" fill="none" stroke="#e8edf2" stroke-opacity=".8" stroke-width="1.6"/>
<path d="M116 140 C118 166 116 190 112 206" fill="none" stroke="#e8edf2" stroke-opacity=".7" stroke-width="1.3"/>
<path d="${ANGEL_BODY}" fill="url(#aq-silver)"/>
<g fill="#1d2228" clip-path="url(#aq-cangel)">
  <path d="M122 80 C128 98 128 122 122 140 L112 144 C118 122 118 98 112 76Z" opacity=".7"/>
  <path d="M88 6 C90 60 94 120 88 214 L78 200 C84 140 82 60 76 24Z" opacity=".62"/>
  <path d="M58 82 C64 98 64 124 58 142 L48 136 C52 120 52 100 48 88Z" opacity=".5"/>
</g>
<path d="M122 82 C134 88 146 100 150 108" fill="none" stroke="#c9a03a" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
${shade(ANGEL_BODY, [104, 80, 30, 6, -14])}
<g class="aq-fin">
  <path d="M120 116 C114 124 112 134 116 138 C122 134 126 126 126 118Z" fill="url(#aq-finclear)"/>
</g>
<path d="M150 114 Q154 115 155 111" fill="none" stroke="#5a6470" stroke-width="1.2"/>
${eye(136, 102, 5.8, "#b3262b")}` },

    // Neonsalmler (Paracheirodon innesi)
    neon: { w: 100, h: 40, svg: `
<g class="aq-tail">
  <path d="M19 20 C13 14 7 10 2 8 C5 15 5 25 2 32 C7 30 13 26 19 20Z" fill="url(#aq-finclear)"/>
  <g clip-path="url(#aq-c15)">${rays(19, 20, arc(19, 20, 17, 12, 145, 215, 7), "#8090a0", 0.4, 0.5)}</g>
</g>
<path d="${NEON_BODY}" fill="#cfd8e0" fill-opacity=".88"/>
<path d="M18 21 C30 27.5 48 28.5 64 26.5 L64 21.5 C46 22.5 30 22 18 21Z" fill="#e3283d"/>
<path d="M22 17.5 C44 13 70 13 92 17 L92 20 C70 17.5 46 18 22 21Z" fill="url(#aq-neon)"/>
<path d="M22 17.5 C44 13 70 13 92 17" fill="none" stroke="#bff6ff" stroke-opacity=".6" stroke-width=".6"/>
${shade(NEON_BODY, [64, 14, 18, 2.4])}
${eye(89, 18.5, 2.6, "#3a4a5a")}` }
};

// Wasserpflanzen und Steine
const plant = (x, h, w, hue = "aq-leaf") => {
    const blades = [];
    for (let i = 0; i < 5; i++) {
        const bx = 20 + i * 8 - 16, lean = (i - 2) * 9, top = h * (0.7 + ((i * 37) % 30) / 100);
        blades.push(`<path d="M${50 + bx} ${h} C${50 + bx + lean * 0.3} ${h - top * 0.4} ${50 + bx + lean} ${h - top * 0.7} ${50 + bx + lean * 1.3} ${h - top} C${50 + bx + lean * 1.1 + 6} ${h - top * 0.7} ${50 + bx + lean * 0.4 + 6} ${h - top * 0.4} ${50 + bx + 5} ${h}Z" fill="url(#${hue})" opacity="${0.85 + i * 0.03}"/>`);
    }
    return { x, w, h, svg: blades.join("") };
};
const FLOOR = `
<path d="M0 60 C120 40 260 70 420 52 C560 38 700 62 860 46 C940 40 1000 50 1000 50 L1000 200 L0 200Z" fill="url(#aq-sand)"/>
<path d="M0 60 C120 40 260 70 420 52 C560 38 700 62 860 46 C940 40 1000 50 1000 50" fill="none" stroke="#f0dcae" stroke-opacity=".5" stroke-width="2"/>
<g fill="#8f7a52" opacity=".55"><ellipse cx="90" cy="96" rx="7" ry="3"/><ellipse cx="300" cy="120" rx="9" ry="4"/><ellipse cx="520" cy="88" rx="6" ry="3"/><ellipse cx="640" cy="140" rx="10" ry="4"/><ellipse cx="820" cy="104" rx="8" ry="3"/><ellipse cx="940" cy="130" rx="6" ry="3"/></g>
<g fill="#e9e1d0" opacity=".7"><ellipse cx="180" cy="110" rx="5" ry="2.5"/><ellipse cx="410" cy="132" rx="4" ry="2"/><ellipse cx="720" cy="118" rx="5" ry="2.5"/></g>
<path d="M600 70 C610 20 680 0 740 22 C790 40 800 70 790 90 L600 90Z" fill="url(#aq-rock)"/>
<path d="M640 30 C670 14 710 14 730 26" fill="none" stroke="#a8b2bb" stroke-opacity=".5" stroke-width="3"/>
<path d="M40 80 C50 50 100 44 130 60 C150 70 152 84 146 96 L40 96Z" fill="url(#aq-rock)"/>`;

// Wer wo schwimmt: Art, Ebene (far/mid/near), Höhe in % des Bildschirms, Breite in px, Dauer s, Richtung
const SCHOOL = [
    ["angel",  "far",  18, 70,  70, "r"],
    ["tang",   "far",  52, 80,  64, "l"],
    ["neon",   "far",  34, 40,  52, "r", 7],
    ["yellow", "mid",  14, 96,  44, "l"],
    ["clown",  "mid",  60, 104, 38, "r"],
    ["neon",   "mid",  42, 54,  34, "l", 9],
    ["angel",  "mid",  30, 110, 56, "r"],
    ["tang",   "near", 22, 170, 30, "r"],
    ["clown",  "near", 66, 150, 26, "l"],
    ["yellow", "near", 46, 140, 36, "r"]
];

let root = null;

function fishSvg(kind, width) {
    const f = FISH[kind];
    return `<svg viewBox="0 0 ${f.w} ${f.h}" width="${width}" height="${Math.round(width * f.h / f.w)}" aria-hidden="true">${f.svg}</svg>`;
}

function build() {
    const aq = document.createElement("div");
    aq.id = "aquarium";
    aq.setAttribute("aria-hidden", "true");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) aq.classList.add("aq-still");
    let html = `<svg width="0" height="0" style="position:absolute"><defs>${DEFS}</defs></svg>`;
    html += `<div class="aq-rays"></div><div class="aq-caustics"></div>`;
    // Pflanzen hinten
    [plant(4, 300, 100, "aq-leaf2"), plant(30, 240, 100), plant(78, 340, 110, "aq-leaf2"), plant(92, 220, 90)].forEach((p, i) => {
        html += `<svg class="aq-plant aq-far" viewBox="0 0 100 ${p.h}" style="left:${p.x}%;height:${Math.round(p.h / 4.2)}vh;animation-delay:-${i * 1.7}s" aria-hidden="true">${p.svg}</svg>`;
    });
    html += `<svg class="aq-floor" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">${FLOOR}</svg>`;
    SCHOOL.forEach(([kind, layer, top, width, dur, dir, count], i) => {
        const delay = -((i * 7.3) % dur);
        const bob = 3 + (i % 4);
        const pos = still ? `left:${(i * 37) % 85}%;` : "";
        let inner = "";
        if (count) {
            // Schwarm: mehrere Neonsalmler leicht versetzt
            for (let k = 0; k < count; k++) {
                const dx = (k * 29) % 90, dy = ((k * 47) % 70) - 30;
                inner += `<div style="position:absolute;left:${dx}px;top:${dy}px">${fishSvg(kind, width * (0.85 + (k % 3) * 0.1))}</div>`;
            }
            inner = `<div style="position:relative;width:${width + 90}px;height:${width}px">${inner}</div>`;
        } else {
            inner = fishSvg(kind, width);
        }
        html += `<div class="aq-swim aq-${layer}${dir === "l" ? " l" : ""}" style="top:${top}%;${pos}animation-duration:${dur}s;animation-delay:${delay}s"><div class="aq-bob" style="animation-duration:${bob}s;animation-delay:-${i}s">${inner}</div></div>`;
    });
    // Pflanzen vorne
    [plant(-3, 380, 120), plant(86, 300, 120, "aq-leaf2")].forEach((p, i) => {
        html += `<svg class="aq-plant" viewBox="0 0 100 ${p.h}" style="left:${p.x}%;height:${Math.round(p.h / 3.6)}vh;animation-delay:-${i * 2.3 + 1}s" aria-hidden="true">${p.svg}</svg>`;
    });
    // Luftblasen aus dem Sprudelstein
    for (let i = 0; i < 14; i++) {
        const size = 5 + (i * 7) % 12;
        html += `<span class="aq-bubble" style="left:${(i < 9 ? 8 : 70) + (i * 13) % 6}%;width:${size}px;height:${size}px;animation-duration:${6 + (i * 5) % 7}s;animation-delay:-${(i * 1.9) % 9}s"></span>`;
    }
    html += `<div class="aq-veil"></div>`;
    aq.innerHTML = html;
    return aq;
}

export function setAquarium(on) {
    if (on && !root) {
        root = build();
        document.body.prepend(root);
    } else if (!on && root) {
        root.remove();
        root = null;
    }
}
