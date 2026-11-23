// 3D-Aquarium für das Design „Unterwasser“ (WebGL 1).
// Fische, Felsen, Korallen und Seegras stammen aus Googles WebGL Aquarium (BSD-Lizenz, aquarium/LICENSE.txt),
// umgewandelt mit scripts/make_aquarium.py. Wasser, Sandboden, Lichtstrahlen, Kaustik, Schwebeteilchen
// und Luftblasen werden hier per Shader erzeugt.

const BASE = new URL("../aquarium/", import.meta.url);
const SURFACE = 34;          // Höhe der Wasseroberfläche
const FPS = 30;              // reicht für ruhige Bewegung und schont den Akku

// ---------------------------------------------------------------- Matrizen
const m4 = {
    perspective(fovy, aspect, near, far) {
        const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
        return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    },
    lookAt(eye, target, up) {
        const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
        return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
            -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
    },
    mul(a, b) {
        const r = new Array(16);
        for (let c = 0; c < 4; c++) for (let rI = 0; rI < 4; rI++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[k * 4 + rI] * b[c * 4 + k];
            r[c * 4 + rI] = s;
        }
        return r;
    },
    // Welt-Matrix aus Position, Drehung um y und Größe
    world(pos, rotY = 0, s = 1) {
        const c = Math.cos(rotY) * s, n = Math.sin(rotY) * s;
        return [c, 0, -n, 0, 0, s, 0, 0, n, 0, c, 0, pos[0], pos[1], pos[2], 1];
    }
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// fester Zufall, damit das Aquarium bei jedem Start gleich eingerichtet ist
function rng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

// ---------------------------------------------------------------- Shader
const COMMON = `
precision highp float;
uniform vec3 u_eye;
uniform float u_time;
const float SURFACE = ${SURFACE.toFixed(1)};
const vec3 SUN = vec3(0.28, 0.93, 0.24);

vec3 waterColor(vec3 dir) {
  vec3 deep = vec3(0.010, 0.095, 0.150);
  vec3 mid  = vec3(0.045, 0.330, 0.430);
  vec3 up   = vec3(0.300, 0.700, 0.780);
  vec3 c = mix(deep, mid, smoothstep(-0.55, 0.08, dir.y));
  c = mix(c, up, smoothstep(0.08, 0.85, dir.y));
  // heller Schein in Richtung Sonne
  c += vec3(0.20, 0.32, 0.30) * pow(max(dot(dir, normalize(SUN)), 0.0), 6.0);
  return c;
}

// Licht wird im Wasser rot zuerst geschluckt, dann grün; dazu Dunst mit der Entfernung
vec3 applyWater(vec3 col, vec3 wpos) {
  vec3 d = wpos - u_eye;
  float dist = length(d);
  vec3 dir = d / dist;
  float depth = max(0.0, SURFACE - wpos.y);
  col *= exp(-vec3(0.024, 0.010, 0.008) * (dist * 0.5 + depth * 0.25));
  float f = 1.0 - exp(-dist * 0.0135);
  return mix(col, waterColor(dir), f);
}

// kachelbare Wasser-Kaustik (nach „Tileable Water Caustic“, Shadertoy MdlXz8)
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.6);
}

vec3 shade(vec3 albedo, vec3 n, vec3 wpos, float spec, float gloss) {
  vec3 L = normalize(SUN);
  float ndl = max(dot(n, L), 0.0);
  float top = smoothstep(-0.3, 0.9, n.y);
  float depthLight = exp(-max(0.0, SURFACE - wpos.y) * 0.012);
  float c = caustic(wpos.xz * 0.055 + wpos.y * 0.01, u_time * 0.55);
  vec3 sun = vec3(1.0, 0.96, 0.86) * ndl * depthLight * (0.6 + 1.9 * c * top);
  vec3 amb = mix(vec3(0.16, 0.27, 0.32), vec3(0.40, 0.56, 0.60), n.y * 0.5 + 0.5);
  vec3 V = normalize(u_eye - wpos);
  // Aufhelllicht von vorn (Aquarienlampe)
  amb += vec3(0.42, 0.46, 0.46) * max(dot(n, V), 0.0);
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(n, H), 0.0), gloss) * spec * depthLight;
  // Streulicht von hinten an den Rändern (Fische wirken plastischer)
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.25;
  return albedo * (sun + amb) + sp * vec3(0.9, 0.97, 1.0) + rim * vec3(0.25, 0.55, 0.65);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
`;

// Hintergrund (Wasser, Oberfläche, Lichtstrahlen) als Vollbild-Dreieck; im Overlay-Modus nur die Strahlen
const BG_VS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos; gl_Position = vec4(a_pos, 0.999, 1.0); }`;
const BG_FS = COMMON + `
varying vec2 v_uv;
uniform vec3 u_right, u_up, u_fwd;
uniform vec2 u_scale;
uniform float u_overlay;
float rays(vec3 dir) {
  vec3 s = normalize(SUN);
  vec3 b1 = normalize(cross(s, vec3(0.0, 0.0, 1.0)));
  vec3 b2 = cross(s, b1);
  float a = atan(dot(dir, b1), dot(dir, b2));
  float t = u_time;
  float r = pow(0.5 + 0.5 * sin(a * 19.0 + t * 0.30 + sin(a * 5.0 - t * 0.21) * 2.5), 7.0);
  r += 0.7 * pow(0.5 + 0.5 * sin(a * 31.0 - t * 0.23 + sin(a * 9.0 + t * 0.17) * 1.7), 9.0);
  r *= 0.55 + 0.45 * noise(vec2(a * 6.0, t * 0.15));
  float toward = dot(dir, s);
  return r * smoothstep(-0.35, 0.75, toward) * smoothstep(-0.6, 0.1, dir.y);
}
void main() {
  vec3 dir = normalize(u_fwd + v_uv.x * u_scale.x * u_right + v_uv.y * u_scale.y * u_up);
  float r = rays(dir);
  if (u_overlay > 0.5) { gl_FragColor = vec4(vec3(0.55, 0.80, 0.85) * r * 0.10, 1.0); return; }
  vec3 col = waterColor(dir);
  if (dir.y > 0.0) {
    // Wasseroberfläche von unten: gekräuselte helle Flecken, in der Ferne im Dunst
    float t = (SURFACE - u_eye.y) / dir.y;
    vec3 p = u_eye + dir * t;
    float c = caustic(p.xz * 0.03, u_time * 0.45);
    float w = fbm(p.xz * 0.08 + u_time * 0.05);
    vec3 surf = vec3(0.45, 0.82, 0.88) * (0.55 + 0.6 * w) + vec3(0.9, 1.0, 1.0) * c * 0.6;
    surf += vec3(1.0, 0.98, 0.9) * pow(max(dot(dir, normalize(SUN)), 0.0), 40.0) * 1.5;
    col = mix(surf, col, 1.0 - exp(-t * 0.016));
  }
  col += vec3(0.50, 0.78, 0.85) * r * 0.22;
  gl_FragColor = vec4(col, 1.0);
}`;

// Sandboden: Rippeln, Körnung, kleine Steinchen, Kaustik
const FLOOR_VS = `
attribute vec2 a_pos;
uniform mat4 u_viewProj;
varying vec3 v_wpos;
void main() { v_wpos = vec3(a_pos.x, 0.0, a_pos.y); gl_Position = u_viewProj * vec4(v_wpos, 1.0); }`;
const FLOOR_FS = COMMON + `
varying vec3 v_wpos;
float sandH(vec2 p) {
  float warp = fbm(p * 0.06) * 7.0;
  float rip = sin(p.x * 0.9 + p.y * 0.35 + warp);
  return rip * 0.18 + fbm(p * 1.7) * 0.10;
}
void main() {
  vec2 p = v_wpos.xz;
  float e = 0.08;
  float h = sandH(p);
  vec3 n = normalize(vec3(h - sandH(p + vec2(e, 0.0)), e * 1.2, h - sandH(p + vec2(0.0, e))));
  float tone = fbm(p * 0.12);
  vec3 albedo = mix(vec3(0.62, 0.53, 0.38), vec3(0.86, 0.78, 0.60), tone);
  float grain = hash(floor(p * 40.0));
  albedo *= 0.88 + 0.22 * grain;
  // Kiesel
  float peb = smoothstep(0.80, 0.86, noise(p * 2.6 + 3.0)) * smoothstep(0.5, 0.65, noise(p * 0.3));
  albedo = mix(albedo, vec3(0.50, 0.46, 0.40) * (0.75 + 0.5 * hash(floor(p * 2.6))), peb * 0.7);
  vec3 col = shade(albedo, n, v_wpos, 0.05, 20.0);
  gl_FragColor = vec4(applyWater(col, v_wpos), 1.0);
}`;

// Modelle (Fische mit Schwimmbewegung, Felsen und Korallen fest), mit Normal-Map
const MODEL_VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec2 a_uv;
attribute vec3 a_tan;
attribute vec3 a_bin;
uniform mat4 u_viewProj;
uniform mat4 u_world;
uniform float u_fish;            // 1 = Fisch
uniform vec3 u_fishPos, u_fishNext;
uniform float u_fishScale, u_fishTime, u_fishLength, u_fishWave, u_fishBend;
varying vec3 v_wpos;
varying vec2 v_uv;
varying vec3 v_n, v_t, v_b;
void main() {
  mat4 world = u_world;
  vec3 pos = a_pos;
  if (u_fish > 0.5) {
    vec3 vz = normalize(u_fishPos - u_fishNext);
    vec3 vx = normalize(cross(vec3(0.0, 1.0, 0.0), vz));
    vec3 vy = cross(vz, vx);
    world = mat4(vec4(vx * u_fishScale, 0.0), vec4(vy * u_fishScale, 0.0), vec4(vz * u_fishScale, 0.0), vec4(u_fishPos, 1.0));
    float mult = pos.z > 0.0 ? (pos.z / u_fishLength) : (-pos.z / u_fishLength * 2.0);
    float s = sin(u_fishTime + mult * u_fishWave);
    pos.x += mult * mult * s * u_fishBend;
  }
  vec4 w = world * vec4(pos, 1.0);
  v_wpos = w.xyz;
  v_uv = a_uv;
  v_n = normalize((world * vec4(a_nrm, 0.0)).xyz);
  v_t = normalize((world * vec4(a_tan, 0.0)).xyz);
  v_b = normalize((world * vec4(a_bin, 0.0)).xyz);
  gl_Position = u_viewProj * w;
}`;
const MODEL_FS = COMMON + `
uniform sampler2D u_diffuse;
uniform sampler2D u_normal;
uniform float u_spec, u_gloss, u_tint;
varying vec3 v_wpos;
varying vec2 v_uv;
varying vec3 v_n, v_t, v_b;
void main() {
  vec4 albedo = texture2D(u_diffuse, v_uv);
  vec4 nm = texture2D(u_normal, v_uv);
  vec3 tn = normalize(nm.xyz - 0.5 + vec3(0.0, 0.0, 1.6));
  vec3 n = normalize(mat3(normalize(v_t), normalize(v_b), normalize(v_n)) * tn);
  if (dot(n, u_eye - v_wpos) < 0.0) n = -n;   // dünne Flossen von beiden Seiten beleuchten
  vec3 a = albedo.rgb * mix(vec3(1.0), vec3(0.85, 0.98, 1.0), u_tint);
  vec3 col = shade(a, n, v_wpos, u_spec * (0.4 + nm.a), u_gloss);
  gl_FragColor = vec4(applyWater(col, v_wpos), 1.0);
}`;

// Seegras: dreht sich zur Kamera, wiegt sich in der Strömung, Ränder per Alpha
const WEED_VS = `
attribute vec3 a_pos;
attribute vec2 a_uv;
uniform mat4 u_viewProj;
uniform vec3 u_base;
uniform float u_scale, u_phase, u_time;
uniform vec3 u_eye;
varying vec3 v_wpos;
varying vec2 v_uv;
varying float v_h;
void main() {
  vec3 toCam = normalize(vec3(u_eye.x - u_base.x, 0.0, u_eye.z - u_base.z));
  vec3 xAxis = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  float h = a_pos.y * u_scale;
  float sway = sin(u_time * 0.55 + u_phase) * pow(h * 0.06, 2.0) * 2.2 + sin(u_time * 1.3 + u_phase * 2.0) * pow(h * 0.06, 2.0) * 0.5;
  vec3 w = u_base + xAxis * (a_pos.x * u_scale + sway) + vec3(0.0, h, 0.0) + toCam * sway * 0.3;
  v_wpos = w; v_uv = a_uv; v_h = a_pos.y / 20.0;
  gl_Position = u_viewProj * vec4(w, 1.0);
}`;
const WEED_FS = COMMON + `
uniform sampler2D u_diffuse;
varying vec3 v_wpos;
varying vec2 v_uv;
varying float v_h;
void main() {
  vec4 c = texture2D(u_diffuse, v_uv);
  if (c.a < 0.4) discard;
  vec3 alb = mix(vec3(dot(c.rgb, vec3(0.3, 0.59, 0.11))), c.rgb, 0.75) * vec3(0.72, 0.82, 0.62);
  vec3 col = shade(alb, normalize(vec3(0.0, 0.5, 0.85)), v_wpos, 0.1, 12.0);
  col += alb * vec3(0.06, 0.14, 0.05) * smoothstep(0.3, 1.0, v_h); // Licht scheint durch die Blätter
  gl_FragColor = vec4(applyWater(col, v_wpos), 1.0);
}`;

// Schwebeteilchen und Luftblasen als Punkte
const PART_VS = `
attribute vec4 a_seed;           // x, y, z, Art (0 = Teilchen, 1 = Blase)
uniform mat4 u_viewProj;
uniform vec3 u_eye;
uniform float u_time, u_px;
varying float v_kind;
varying float v_fade;
void main() {
  vec3 p;
  float kind = a_seed.w;
  if (kind < 0.5) {
    // treibender Schwebstoff in einer Kiste um den Betrachter
    p = a_seed.xyz + vec3(sin(u_time * 0.07 + a_seed.y) * 3.0 + u_time * 0.4, sin(u_time * 0.11 + a_seed.x) * 1.5 - u_time * 0.12, cos(u_time * 0.05 + a_seed.z) * 2.0);
    p.x = mod(p.x + 60.0, 120.0) - 60.0;
    p.y = mod(p.y, SURFACE_F);
    p.z = mod(p.z + 70.0, 80.0) - 70.0;
  } else {
    // Blasen aus dem Sprudelstein
    float speed = 3.5 + fract(a_seed.x * 7.3) * 3.0;
    float y = mod(u_time * speed + a_seed.y * SURFACE_F, SURFACE_F);
    p = vec3(a_seed.z + sin(y * 0.9 + a_seed.x * 6.0) * 0.35 * (y * 0.05 + 0.3), y, -14.0 + fract(a_seed.x * 3.1) * 1.5);
  }
  vec4 clip = u_viewProj * vec4(p, 1.0);
  float dist = length(p - u_eye);
  float size = kind < 0.5 ? (0.10 + fract(a_seed.x * 13.7) * 0.12) : (0.18 + fract(a_seed.y * 5.1) * 0.35);
  gl_PointSize = clamp(size * u_px / max(clip.w, 0.1), 1.0, 40.0);
  v_kind = kind;
  v_fade = exp(-dist * 0.03);
  gl_Position = clip;
}`.replace(/SURFACE_F/g, SURFACE.toFixed(1));
const PART_FS = `
precision mediump float;
varying float v_kind;
varying float v_fade;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0) discard;
  if (v_kind < 0.5) {
    float a = (1.0 - r) * 0.35 * v_fade;
    gl_FragColor = vec4(vec3(0.75, 0.85, 0.80) * a, a);
  } else {
    float ring = smoothstep(0.65, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
    float hi = smoothstep(0.35, 0.0, length(q - vec2(-0.35, -0.35)));
    float a = (ring * 0.8 + hi * 0.9 + 0.06) * (0.4 + 0.6 * v_fade);
    gl_FragColor = vec4(vec3(0.85, 0.97, 1.0) * a, a);
  }
}`;

// ---------------------------------------------------------------- Aufbau der Szene
const FISH_TYPES = [
    // Modell, Anzahl, Größe, Bahnradius (x, z), Höhe, Höhenschwankung, Tempo, Schwanzschlag, Biegung
    { name: "SmallFishA",  num: 34, scale: [1.5, 2.2], rx: [34, 60], rz: [10, 26], y: 14, yr: 9, speed: [0.10, 0.16], tail: 10, len: 10, wave: 1, bend: 2, school: true },
    { name: "MediumFishB", num: 6,  scale: [1.3, 1.8], rx: [26, 50], rz: [8, 22],  y: 7,  yr: 3, speed: [0.05, 0.09], tail: 3,  len: 10, wave: -2, bend: 2 },
    { name: "MediumFishA", num: 4,  scale: [1.0, 1.3], rx: [36, 60], rz: [12, 26], y: 15, yr: 7, speed: [0.06, 0.10], tail: 2,  len: 10, wave: -2, bend: 2 },
    { name: "BigFishB",    num: 1,  scale: [1.2, 1.2], rx: [80, 80], rz: [30, 30], y: 18, yr: 4, speed: [0.025, 0.025], tail: 1, len: 10, wave: -0.7, bend: 0.3 }
];
const PROPS = [
    ["RockB", [30, -1.0, -34], -0.6, 0.9], ["RockA", [-34, -0.6, -30], 0.5, 0.95], ["RockC", [4, -0.8, -52], 0.2, 1.3],
    ["RockC", [-12, -0.9, -16], 1.4, 0.55], ["Coral", [-16, 0, -14], 0.3, 1.5], ["Coral", [22, 0, -12], 1.9, 1.1],
    ["Coral", [-40, 0, -40], 0.9, 1.8], ["CoralStoneA", [8, 0, -10], 0, 9], ["CoralStoneB", [-6, 0, -6], 1, 8],
    ["CoralStoneB", [16, 0, -24], 2, 11], ["CoralStoneA", [-24, 0, -6], 2.5, 7], ["Stone", [0, 0, -4], 0.5, 1.8],
    ["Stone", [-30, 0, -2], 2, 2.4], ["Stone", [28, 0, 2], 1, 2], ["Stone", [12, 0, -40], 0, 3]
];
const WEEDS = [
    ["SeaweedA", [-38, 0, -22], 0.75], ["SeaweedB", [-35, 0, -20], 0.9], ["SeaweedA", [-31, 0, -26], 0.6],
    ["SeaweedA", [-19, 0, -16], 0.55], ["SeaweedB", [-14, 0, -18], 0.7], ["SeaweedA", [18, 0, -14], 0.6],
    ["SeaweedB", [24, 0, -16], 0.8], ["SeaweedA", [33, 0, -28], 0.8], ["SeaweedB", [36, 0, -24], 0.9],
    ["SeaweedA", [3, 0, -44], 0.9], ["SeaweedB", [-8, 0, -48], 1.0], ["SeaweedA", [44, 0, -46], 1.0],
    ["SeaweedA", [-27, 0, 8], 0.55], ["SeaweedB", [-24, 0, 10], 0.6], ["SeaweedA", [27, 0, 9], 0.5], ["SeaweedB", [30, 0, 7], 0.65]
];

function compile(gl, vs, fs) {
    const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, a = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        const name = gl.getActiveUniform(p, i).name;
        u[name] = gl.getUniformLocation(p, name);
    }
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) {
        const name = gl.getActiveAttrib(p, i).name;
        a[name] = gl.getAttribLocation(p, name);
    }
    return { p, u, a };
}

function loadImage(name) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Bild fehlt: " + name));
        img.src = new URL(name, BASE).href;
    });
}

// Startet das Aquarium im Element `host`; gibt eine Stopp-Funktion zurück (wirft, wenn WebGL fehlt)
export async function startAquarium(host, { still = false } = {}) {
    const canvas = document.createElement("canvas");
    canvas.className = "aq-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) throw new Error("kein WebGL");

    const [manifest, bin] = await Promise.all([
        fetch(new URL("models.json", BASE)).then(r => { if (!r.ok) throw new Error("models.json"); return r.json(); }),
        fetch(new URL("models.bin", BASE)).then(r => { if (!r.ok) throw new Error("models.bin"); return r.arrayBuffer(); })
    ]);
    const texNames = new Set();
    Object.values(manifest).forEach(m => { texNames.add(m.textures.diffuse); texNames.add(m.textures.normalMap); });
    const images = {};
    await Promise.all([...texNames].map(async n => { images[n] = await loadImage(n); }));

    // --- GPU-Daten
    const textures = {};
    for (const [n, img] of Object.entries(images)) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        textures[n] = t;
    }
    const models = {};
    const buf = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    for (const [name, m] of Object.entries(manifest)) {
        const f = (off, n) => new Float32Array(bin, off, m.count * n);
        const ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bin, m.indices, m.indexCount), gl.STATIC_DRAW);
        models[name] = {
            pos: buf(f(m.position, 3)), nrm: buf(f(m.normal, 3)), uv: buf(f(m.texCoord, 2)),
            tan: buf(f(m.tangent, 3)), bin: buf(f(m.binormal, 3)), ib, n: m.indexCount,
            diffuse: textures[m.textures.diffuse], normal: textures[m.textures.normalMap]
        };
    }
    const quad = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
    const floorQuad = buf(new Float32Array([-260, -240, 260, -240, -260, 60, 260, 60]));

    const bgP = compile(gl, BG_VS, BG_FS);
    const floorP = compile(gl, FLOOR_VS, FLOOR_FS);
    const modelP = compile(gl, MODEL_VS, MODEL_FS);
    const weedP = compile(gl, WEED_VS, WEED_FS);
    const partP = compile(gl, PART_VS, PART_FS);

    // Teilchen: 260 Schwebeteilchen, 2 Blasensäulen à 24
    const rand = rng(7);
    const seeds = [];
    for (let i = 0; i < 260; i++) seeds.push(rand() * 120 - 60, rand() * SURFACE, rand() * 80 - 70, 0);
    for (let i = 0; i < 48; i++) seeds.push(rand(), rand(), i < 24 ? -30.5 : 35, 1);
    const partBuf = buf(new Float32Array(seeds));
    const partCount = seeds.length / 4;

    // Fische vorbereiten
    const fish = [];
    FISH_TYPES.forEach((t, ti) => {
        const r = rng(100 + ti);
        const schoolPhase = r() * 10;
        for (let i = 0; i < t.num; i++) {
            const lerp = ([a, b]) => a + (b - a) * r();
            fish.push({
                t,
                scale: lerp(t.scale),
                rx: t.school ? t.rx[0] + (t.rx[1] - t.rx[0]) * 0.6 + r() * 6 : lerp(t.rx),
                rz: t.school ? t.rz[0] + (t.rz[1] - t.rz[0]) * 0.6 + r() * 4 : lerp(t.rz),
                ry: 1.5 + r() * t.yr,
                y: t.y + (r() - 0.5) * 4,
                speed: t.school ? t.speed[0] + (t.speed[1] - t.speed[0]) * 0.5 + r() * 0.008 : lerp(t.speed),
                phase: t.school ? schoolPhase + i * 0.045 + r() * 0.03 : r() * 100,
                yk: 0.6 + r() * 0.8,
                dir: t.school ? 1 : (r() < 0.5 ? -1 : 1),
                tailPhase: r() * 6.28
            });
        }
    });

    // --- Größe und Kamera
    let width = 0, height = 0, px = 1;
    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(dpr, 1.5);
        width = Math.max(1, Math.round(host.clientWidth * scale));
        height = Math.max(1, Math.round(host.clientHeight * scale));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        px = height;
    };

    const bindModel = (m) => {
        const A = modelP.a;
        const attr = (loc, b, n) => { if (loc === undefined || loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); };
        attr(A.a_pos, m.pos, 3); attr(A.a_nrm, m.nrm, 3); attr(A.a_uv, m.uv, 2); attr(A.a_tan, m.tan, 3); attr(A.a_bin, m.bin, 3);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.diffuse);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.normal);
    };
    const disableAttribs = () => { for (let i = 0; i < 6; i++) gl.disableVertexAttribArray(i); };

    function draw(time) {
        resize();
        gl.viewport(0, 0, width, height);
        const aspect = width / height;
        // Kamera schwebt langsam hin und her
        const eye = [Math.sin(time * 0.045) * 4, 9 + Math.sin(time * 0.07) * 0.8, 40];
        const target = [Math.sin(time * 0.03) * 2, 9.5, -10];
        // Hochformat: weiter zurück, damit das Becken in die Breite passt
        if (aspect < 1) { eye[2] = 40 + (1 - aspect) * 14; eye[1] = 7; target[1] = 12; }
        const fovy = (aspect < 1 ? 62 : 44) * Math.PI / 180;
        const view = m4.lookAt(eye, target, [0, 1, 0]);
        const proj = m4.perspective(fovy, aspect, 0.5, 400);
        const vp = m4.mul(proj, view);
        const fwd = norm(sub(target, eye)), right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
        const sy = Math.tan(fovy / 2), sx = sy * aspect;

        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.CULL_FACE);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

        // Hintergrund
        const bg = (overlay) => {
            gl.useProgram(bgP.p);
            disableAttribs();
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(bgP.a.a_pos);
            gl.vertexAttribPointer(bgP.a.a_pos, 2, gl.FLOAT, false, 0, 0);
            gl.uniform3fv(bgP.u.u_eye, eye); gl.uniform1f(bgP.u.u_time, time);
            gl.uniform3fv(bgP.u.u_right, right); gl.uniform3fv(bgP.u.u_up, up); gl.uniform3fv(bgP.u.u_fwd, fwd);
            gl.uniform2f(bgP.u.u_scale, sx, sy); gl.uniform1f(bgP.u.u_overlay, overlay ? 1 : 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        gl.depthMask(false);
        bg(false);
        gl.depthMask(true);

        // Boden
        gl.useProgram(floorP.p);
        disableAttribs();
        gl.bindBuffer(gl.ARRAY_BUFFER, floorQuad);
        gl.enableVertexAttribArray(floorP.a.a_pos);
        gl.vertexAttribPointer(floorP.a.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(floorP.u.u_viewProj, false, vp);
        gl.uniform3fv(floorP.u.u_eye, eye); gl.uniform1f(floorP.u.u_time, time);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Felsen, Korallen und Fische
        gl.useProgram(modelP.p);
        disableAttribs();
        const U = modelP.u;
        gl.uniformMatrix4fv(U.u_viewProj, false, vp);
        gl.uniform3fv(U.u_eye, eye); gl.uniform1f(U.u_time, time);
        gl.uniform1i(U.u_diffuse, 0); gl.uniform1i(U.u_normal, 1);
        gl.uniform1f(U.u_fish, 0);
        gl.uniform1f(U.u_spec, 0.15); gl.uniform1f(U.u_gloss, 18); gl.uniform1f(U.u_tint, 0.3);
        for (const [name, pos, rot, s] of PROPS) {
            const m = models[name];
            bindModel(m);
            gl.uniformMatrix4fv(U.u_world, false, m4.world(pos, rot, s));
            gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
        }
        gl.uniform1f(U.u_fish, 1);
        gl.uniform1f(U.u_spec, 0.9); gl.uniform1f(U.u_gloss, 48); gl.uniform1f(U.u_tint, 0);
        let bound = null;
        for (const f of fish) {
            const m = models[f.t.name];
            if (bound !== m) { bindModel(m); bound = m; }
            const c = (time * f.speed + f.phase) * f.dir;
            const at = (cc) => [Math.sin(cc) * f.rx, f.y + Math.sin(cc * f.yk) * f.ry, -14 + Math.cos(cc) * f.rz];
            const p = at(c), n = at(c - 0.02 * f.dir);
            gl.uniform3fv(U.u_fishPos, p); gl.uniform3fv(U.u_fishNext, n);
            gl.uniform1f(U.u_fishScale, f.scale);
            gl.uniform1f(U.u_fishTime, (time * f.t.tail * (0.8 + f.speed * 3) + f.tailPhase) % (Math.PI * 2));
            gl.uniform1f(U.u_fishLength, f.t.len); gl.uniform1f(U.u_fishWave, f.t.wave); gl.uniform1f(U.u_fishBend, f.t.bend);
            gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
        }

        // Seegras
        gl.useProgram(weedP.p);
        disableAttribs();
        const W = weedP.u;
        gl.uniformMatrix4fv(W.u_viewProj, false, vp);
        gl.uniform3fv(W.u_eye, eye); gl.uniform1f(W.u_time, time); gl.uniform1i(W.u_diffuse, 0);
        WEEDS.forEach(([name, pos, s], i) => {
            const m = models[name];
            gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(weedP.a.a_pos); gl.vertexAttribPointer(weedP.a.a_pos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, m.uv); gl.enableVertexAttribArray(weedP.a.a_uv); gl.vertexAttribPointer(weedP.a.a_uv, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.diffuse);
            gl.uniform3fv(W.u_base, pos); gl.uniform1f(W.u_scale, s); gl.uniform1f(W.u_phase, i * 1.7);
            gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
        });

        // Lichtstrahlen vor allem, dann Teilchen und Blasen (aufhellend gemischt)
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(false);
        gl.disable(gl.DEPTH_TEST);
        bg(true);
        gl.enable(gl.DEPTH_TEST);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(partP.p);
        disableAttribs();
        gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
        gl.enableVertexAttribArray(partP.a.a_seed);
        gl.vertexAttribPointer(partP.a.a_seed, 4, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(partP.u.u_viewProj, false, vp);
        gl.uniform3fv(partP.u.u_eye, eye); gl.uniform1f(partP.u.u_time, time);
        gl.uniform1f(partP.u.u_px, px / (2 * sy));
        gl.drawArrays(gl.POINTS, 0, partCount);
        gl.depthMask(true);
    }

    host.prepend(canvas);
    let raf = 0, last = 0, stopped = false;
    const t0 = performance.now() - 40000;   // nicht bei 0 starten, dann sind die Fische schon verteilt
    const loop = (now) => {
        if (stopped) return;
        raf = requestAnimationFrame(loop);
        if (document.hidden || now - last < 1000 / FPS - 2) return;
        last = now;
        draw((now - t0) / 1000);
    };
    if (still) {
        draw(40);
        const onResize = () => draw(40);
        window.addEventListener("resize", onResize);
        return () => { stopped = true; window.removeEventListener("resize", onResize); canvas.remove(); };
    }
    raf = requestAnimationFrame(loop);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stopped = true; cancelAnimationFrame(raf); });
    return () => { stopped = true; cancelAnimationFrame(raf); canvas.remove(); };
}
