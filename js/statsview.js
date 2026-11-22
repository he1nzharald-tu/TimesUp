// Statistik eines Spiels (Entwurf M2): Reiter Überblick (Punkteverlauf + Spieler mit Auszeichnungen),
// Spieler (Tabelle) und Begriffe (härteste, Lerneffekt). Aufruf vom Spielende oder aus dem Archiv.
import { state } from "./state.js";
import { showScreen } from "./ui.js";
import { gameAwards } from "./gamestats.js";
import { icon, teamColor, teamLetter, teamName } from "./teamview.js";

let current = { game: null, tab: "overview", back: null };

const fmt = v => Number(v || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
}

// game: gespeichertes Spiel (Standard: das gerade beendete); back: Funktion für „Zurück“
export function openGameStats(game = state.lastGame, back = null) {
    current = { game, tab: "overview", back };
    render();
    showScreen("gamestats");
}

export function closeGameStats() {
    const back = current.back;
    if (back) back();
    else showScreen("end");
}

export function selectGameStatsTab(tab) {
    current.tab = tab;
    render();
}

function teamOf(game, name) {
    return (game.teams || []).findIndex(t => t.includes(name));
}

function render() {
    const g = current.game;
    const panel = document.getElementById("gsPanel");
    if (!panel) return;
    panel.textContent = "";
    document.querySelectorAll("#screen-gamestats .gs-tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === current.tab)));
    if (!g) {
        panel.appendChild(el("p", "archive-hint", "Für dieses Spiel gibt es keine Statistik."));
        return;
    }
    const sub = document.getElementById("gsSub");
    if (sub) sub.textContent = `· ${(g.rounds || []).length} Runden · ${g.settings?.cardCount ?? "?"} Karten`;
    const score = document.getElementById("gsScore");
    if (score) {
        score.textContent = "";
        (g.points || []).forEach((p, i) => {
            if (i) score.appendChild(el("span", "gs-score-sep", ":"));
            const s = el("span", "gs-score-team", `${teamLetter(i)} ${fmt(p)}`);
            s.style.setProperty("--team", teamColor(i));
            score.appendChild(s);
        });
    }
    if (current.tab === "players") renderPlayers(panel, g);
    else if (current.tab === "terms") renderTerms(panel, g);
    else renderOverview(panel, g);
}

// --- Überblick: Punkteverlauf und Spielerliste mit Auszeichnungen --------------

function chart(g) {
    const ns = "http://www.w3.org/2000/svg";
    const rounds = g.rounds || [];
    const teams = (g.teams || []).length;
    const cum = Array.from({ length: teams }, () => [0]);
    rounds.forEach(r => (r.points || []).forEach((p, t) => { if (cum[t]) cum[t].push(cum[t][cum[t].length - 1] + (p || 0)); }));
    const max = Math.max(1, ...cum.flat());
    const W = 340, H = 150, L = 26, R = 46, T = 10, B = 22;
    const x = i => L + (rounds.length ? i * (W - L - R) / rounds.length : 0);
    const y = v => T + (H - T - B) * (1 - v / max);
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "gs-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Punkteverlauf: " + cum.map((c, t) => `${teamName(t)} ${c.slice(1).join(", ")}`).join("; "));
    const add = (tag, attrs, text) => {
        const n = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        if (text) n.textContent = text;
        svg.appendChild(n);
        return n;
    };
    [0, 0.5, 1].forEach(f => {
        add("line", { x1: L, x2: W - R, y1: y(max * f), y2: y(max * f), class: "gs-grid" });
        add("text", { x: L - 6, y: y(max * f) + 4, class: "gs-axis", "text-anchor": "end" }, String(Math.round(max * f)));
    });
    rounds.forEach((_, i) => add("text", { x: x(i + 1), y: H - 6, class: "gs-axis", "text-anchor": "middle" }, `R${i + 1}`));
    cum.forEach((c, t) => {
        const color = teamColor(t);
        add("polyline", { points: c.map((v, i) => `${x(i)},${y(v)}`).join(" "), fill: "none", stroke: color, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" });
        c.forEach((v, i) => { if (i) add("circle", { cx: x(i), cy: y(v), r: 3.5, fill: color }); });
        add("text", { x: W - R + 6, y: y(c[c.length - 1]) + 4 + (t % 2 ? 6 : -2), class: "gs-end", fill: color }, `${teamLetter(t)} ${fmt(c[c.length - 1])}`);
    });
    return svg;
}

function roundChips(g) {
    const wrap = el("div", "gs-rounds");
    (g.rounds || []).forEach((r, i) => {
        const pts = r.points || [];
        const best = Math.max(...pts);
        const winners = pts.map((p, t) => (p === best ? t : -1)).filter(t => t >= 0);
        const chip = el("span", "gs-round");
        chip.appendChild(el("span", null, `R${i + 1} ${r.rule}`));
        const res = el("strong", "gs-ink", winners.length === 1 ? teamLetter(winners[0]) : "=");
        if (winners.length === 1) res.style.setProperty("--team", teamColor(winners[0]));
        chip.appendChild(res);
        chip.appendChild(el("span", "gs-round-pts", pts.map(fmt).join(":")));
        wrap.appendChild(chip);
    });
    return wrap;
}

function renderOverview(panel, g) {
    const grid = el("div", "gs-overview");
    const left = el("section", "gs-card");
    left.appendChild(el("h3", "gs-label", "Punkteverlauf"));
    left.appendChild(chart(g));
    left.appendChild(roundChips(g));
    const winners = (g.winners || []).map(teamName);
    left.appendChild(el("p", "archive-meta", winners.length > 1 ? `Unentschieden: ${winners.join(" und ")}` : `${winners[0] || ""} gewinnt`));
    grid.appendChild(left);

    const awards = new Map(gameAwards(g).map(a => [a.player, a]));
    const list = el("ul", "gs-players");
    Object.entries(g.players || {})
        .sort((a, b) => b[1].explained - a[1].explained)
        .forEach(([name, p]) => {
            const li = el("li", "gs-player");
            const t = teamOf(g, name);
            li.style.setProperty("--team", teamColor(Math.max(0, t)));
            const av = el("span", "gs-avatar", name.charAt(0).toUpperCase());
            av.setAttribute("aria-hidden", "true");
            li.appendChild(av);
            const mid = el("span", "gs-player-mid");
            mid.appendChild(el("strong", null, name));
            const per = p.turns ? fmt(p.explained / p.turns) : "–";
            const quote = p.shown ? `${Math.round(p.explained / p.shown * 100)} %` : "–";
            mid.appendChild(el("span", "archive-meta", `Ø ${per}/Zug · ${quote} · Serie ${p.bestStreak || 0}`));
            li.appendChild(mid);
            const right = el("span", "gs-player-right");
            right.appendChild(el("span", "gs-big", p.explained));
            const a = awards.get(name);
            if (a) {
                const badge = el("span", `gs-badge gs-badge-${a.id}`);
                badge.appendChild(icon(a.icon));
                badge.appendChild(el("span", null, a.title));
                badge.title = a.text;
                right.appendChild(badge);
            }
            li.appendChild(right);
            list.appendChild(li);
        });
    grid.appendChild(list);
    panel.appendChild(grid);

    const aw = gameAwards(g);
    if (aw.length) {
        const awList = el("ul", "gs-awards");
        aw.forEach(a => {
            const li = el("li", `gs-award gs-badge-${a.id}`);
            li.appendChild(icon(a.icon));
            const txt = el("span");
            txt.appendChild(el("strong", null, `${a.title}: ${a.player}`));
            txt.appendChild(el("span", "archive-meta", a.text));
            li.appendChild(txt);
            awList.appendChild(li);
        });
        panel.appendChild(awList);
    }
}

// --- Spieler: alle Werte als Tabelle ---------------------------------------------

function renderPlayers(panel, g) {
    const wrap = el("div", "gs-table-wrap");
    const table = el("table", "gs-table");
    const head = el("tr");
    ["", "Spieler", "Erklärt", "Ø / Zug", "Quote", "Ø Sek.", "Serie", "Letzte Sek.", "Skip", "Fehler"].forEach((h, i) => {
        const th = el("th", i > 1 ? "num" : null, h);
        th.scope = "col";
        head.appendChild(th);
    });
    const thead = el("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    const body = el("tbody");
    Object.entries(g.players || {})
        .sort((a, b) => b[1].explained - a[1].explained)
        .forEach(([name, p], i) => {
            const tr = el("tr");
            tr.appendChild(el("td", "gs-rank", i + 1));
            const td = el("td", "gs-name");
            const dot = el("span", "team-dot");
            dot.style.setProperty("--team", teamColor(Math.max(0, teamOf(g, name))));
            td.appendChild(dot);
            td.appendChild(document.createTextNode(" " + name));
            tr.appendChild(td);
            [p.explained, p.turns ? fmt(p.explained / p.turns) : "–", p.shown ? `${Math.round(p.explained / p.shown * 100)} %` : "–",
             p.avgSeconds != null ? fmt(p.avgSeconds) : "–", p.bestStreak || 0, p.lastSecond || 0, p.skips || 0, p.mistakes || 0]
                .forEach((v, j) => tr.appendChild(el("td", j === 0 ? "num gs-strong" : "num", v)));
            body.appendChild(tr);
        });
    table.appendChild(body);
    wrap.appendChild(table);
    panel.appendChild(wrap);
}

// --- Begriffe: härteste, Lerneffekt, schnellster ------------------------------------

function termList(title, items, valueOf) {
    const sec = el("section", "gs-card");
    sec.appendChild(el("h3", "gs-label", title));
    if (!items.length) {
        sec.appendChild(el("p", "archive-meta", "Noch keine Daten"));
        return sec;
    }
    const ul = el("ul", "gs-terms");
    items.forEach(it => {
        const li = el("li");
        li.appendChild(el("span", null, it.begriff));
        li.appendChild(el("span", "archive-meta", valueOf(it)));
        ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
}

function renderTerms(panel, g) {
    const grid = el("div", "gs-terms-grid");
    grid.appendChild(termList("Härteste Begriffe", g.terms?.hardest || [],
        t => [t.skips ? `${t.skips}× übersprungen` : null, t.seconds ? `${t.seconds} s` : null].filter(Boolean).join(" · ")));
    grid.appendChild(termList("Lerneffekt (Runde 1 → später)", g.terms?.learning || [], t => `${t.from} s → ${t.to} s`));
    grid.appendChild(termList("Schnellster Begriff", g.fastest ? [g.fastest] : [], f => `${f.player} · ${f.seconds} s`));
    panel.appendChild(grid);
}
