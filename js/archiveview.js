// Archiv-Bildschirm (Entwurf G1/G2 + G3): Kachelreihe mit Spielgruppen oben,
// darunter Details mit Reitern Spiele / Statistik / Karten; ein Spiel antippen zeigt Runden und Punkte.
import { state } from "./state.js";
import { appConfirm, refreshStartCardStatus, showScreen } from "./ui.js";
import { exportArchive, formatArchiveDate, importArchiveFile, loadArchiveEntry, readArchiveStore, writeArchiveStore } from "./cards.js";
import { archiveStats } from "./gamestats.js";
import { icon, setButtonContent, TEAM_COLORS, teamColor, teamName } from "./teamview.js";
import { openGameStats } from "./statsview.js";

let view = { id: null, tab: "spiele", game: null };

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
}
const fmt = v => Number(v || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function shortDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "–";
    return d.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " +
        d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function avatars(names, max = 4) {
    const wrap = el("span", "avatars");
    wrap.setAttribute("aria-hidden", "true");
    names.slice(0, max).forEach((n, i) => {
        const a = el("span", "avatar", (n || "?").trim().charAt(0).toUpperCase());
        a.style.setProperty("--av", TEAM_COLORS[i % TEAM_COLORS.length]);
        wrap.appendChild(a);
    });
    if (names.length > max) wrap.appendChild(el("span", "avatar-more", `+${names.length - max}`));
    return wrap;
}

function lastActivity(a) {
    return String(a.lastPlayedAt || a.createdAt || "");
}

export function openArchive() {
    document.getElementById("archiveOverlay")?.remove();
    const store = readArchiveStore();
    const archives = Object.values(store).sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
    if (!archives.some(a => a.id === view.id)) view = { id: archives[0]?.id || null, tab: "spiele", game: null };

    const overlay = el("div", "overlay archive-overlay");
    overlay.id = "archiveOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Archiv");
    const box = el("div", "overlay-box archive-screen");
    overlay.appendChild(box);
    const close = () => overlay.remove();

    // Kopf: Zurück, Titel, Export (alle), Import
    const head = el("header", "archive-head");
    const back = el("button", "head-btn archive-close-btn");
    back.type = "button";
    back.setAttribute("aria-label", "Archiv schließen");
    back.appendChild(icon("back"));
    back.onclick = close;
    head.appendChild(back);
    head.appendChild(el("h2", "archive-title", "Archiv"));
    if (archives.length > 0) {
        const exp = setButtonContent(el("button", "icon-btn archive-export-btn"), "upload", "Alle exportieren");
        exp.type = "button";
        exp.title = "Ganzes Archiv als Datei speichern oder teilen";
        exp.onclick = () => exportArchive();
        head.appendChild(exp);
    }
    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.id = "archiveImportInput";
    fileInput.hidden = true;
    fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (file) await importArchiveFile(file);
    };
    head.appendChild(fileInput);
    const imp = setButtonContent(el("button", "icon-btn archive-import-btn"), "download", "Importieren");
    imp.type = "button";
    imp.title = "Exportiertes Archiv laden";
    imp.onclick = () => fileInput.click();
    head.appendChild(imp);
    box.appendChild(head);

    if (archives.length === 0) {
        box.appendChild(el("p", "archive-empty",
            "Noch keine gespeicherten Spiele. Ein exportiertes Archiv von einem anderen Gerät kannst du hier importieren."));
        document.body.appendChild(overlay);
        return;
    }

    // Kachelreihe: Spielgruppen
    const strip = el("ul", "archive-strip");
    strip.setAttribute("aria-label", "Gespeicherte Spielgruppen");
    archives.forEach(a => {
        const li = el("li");
        const btn = el("button", "archive-tile");
        btn.type = "button";
        btn.setAttribute("aria-pressed", String(a.id === view.id));
        btn.appendChild(avatars((a.players || []).map(p => p.name), 3));
        const txt = el("span", "archive-tile-text");
        txt.appendChild(el("span", "archive-tile-date", shortDate(a.lastPlayedAt || a.createdAt)));
        const games = Array.isArray(a.games) ? a.games.length : 0;
        txt.appendChild(el("span", "archive-tile-meta",
            games ? plural(games, "Spiel", "Spiele") : plural((a.usedCards || []).length, "Karte", "Karten")));
        btn.appendChild(txt);
        btn.onclick = () => { view = { id: a.id, tab: view.tab, game: null }; openArchive(); };
        li.appendChild(btn);
        strip.appendChild(li);
    });
    box.appendChild(strip);

    const archive = archives.find(a => a.id === view.id) || archives[0];
    box.appendChild(renderDetail(archive, close));
    document.body.appendChild(overlay);
    strip.querySelector("[aria-pressed='true']")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

function renderDetail(archive, close) {
    const detail = el("section", "archive-detail");
    const games = Array.isArray(archive.games) ? archive.games : [];

    const row = el("div", "archive-detail-head");
    const title = el("div", "archive-detail-title");
    title.appendChild(el("h3", null, formatArchiveDate(archive.lastPlayedAt || archive.createdAt)));
    title.appendChild(el("span", "archive-meta",
        `${(archive.players || []).map(p => p.name).join(", ")} · ${games.length ? plural(games.length, "Spiel", "Spiele") : "keine Spieldaten"}`));
    row.appendChild(title);

    const actions = el("div", "archive-actions");
    const load = setButtonContent(el("button", "btn-primary archive-load-btn"), "play", "Laden");
    load.type = "button";
    load.onclick = () => { close(); loadArchiveEntry(archive); };
    actions.appendChild(load);
    const exp = el("button", "icon-btn archive-export-one-btn");
    exp.type = "button";
    exp.setAttribute("aria-label", "Diese Spielgruppe exportieren");
    exp.appendChild(icon("upload"));
    exp.onclick = () => exportArchive([archive.id]);
    actions.appendChild(exp);
    const del = el("button", "icon-btn archive-delete-btn");
    del.type = "button";
    del.setAttribute("aria-label", "Löschen");
    del.appendChild(icon("trash"));
    del.onclick = async () => {
        const ok = await appConfirm(`Soll der Archiv-Eintrag vom ${formatArchiveDate(archive.createdAt)} wirklich gelöscht werden?`, {
            okText: "Löschen", danger: true
        });
        if (!ok) return;
        const store = readArchiveStore();
        delete store[archive.id];
        writeArchiveStore(store);
        if (state.activeArchiveId === archive.id) {
            state.activeArchiveId = null;
            refreshStartCardStatus();
        }
        view = { id: null, tab: view.tab, game: null };
        openArchive();
    };
    actions.appendChild(del);
    row.appendChild(actions);
    detail.appendChild(row);

    // Reiter
    const tabs = el("div", "archive-tabs");
    tabs.setAttribute("role", "tablist");
    [["spiele", "Spiele"], ["statistik", "Statistik"], ["karten", "Karten"]].forEach(([id, label]) => {
        const t = el("button", "archive-tab", label);
        t.type = "button";
        t.setAttribute("role", "tab");
        t.dataset.tab = id;
        t.setAttribute("aria-selected", String(view.tab === id));
        t.onclick = () => { view = { ...view, tab: id, game: null }; openArchive(); };
        tabs.appendChild(t);
    });
    detail.appendChild(tabs);

    const panel = el("div", "archive-panel");
    panel.setAttribute("role", "tabpanel");
    if (view.tab === "statistik") renderStats(panel, archive);
    else if (view.tab === "karten") renderCards(panel, archive);
    else if (view.game && games.some(g => g.id === view.game)) renderGame(panel, archive, games.find(g => g.id === view.game));
    else renderGames(panel, archive);
    detail.appendChild(panel);
    return detail;
}

function noData(panel) {
    panel.appendChild(el("p", "archive-hint",
        "Für diese Spielgruppe gibt es noch keine Spieldaten. Ab jetzt wird jedes beendete Spiel mit Teams, Punkten und Regeln gespeichert."));
}

function teamTag(names, points, idx, winner) {
    const t = el("span", "archive-team-tag" + (winner ? " is-winner" : ""));
    t.style.setProperty("--team", teamColor(idx));
    t.appendChild(el("strong", null, `${String.fromCharCode(65 + idx)} ${fmt(points)}`));
    t.appendChild(el("span", null, names.join(", ")));
    if (winner) t.appendChild(icon("trophy"));
    return t;
}

function renderGames(panel, archive) {
    const games = (archive.games || []).slice().reverse();   // neuestes zuerst
    if (!games.length) return noData(panel);
    const list = el("ul", "archive-games");
    games.forEach(g => {
        const no = archive.games.indexOf(g) + 1;
        const li = el("li");
        const btn = el("button", "archive-game");
        btn.type = "button";
        const left = el("span", "archive-game-no");
        left.appendChild(el("strong", null, `Spiel ${no}`));
        left.appendChild(el("span", null, shortDate(g.startedAt)));
        btn.appendChild(left);
        const mid = el("span", "archive-game-mid");
        const tags = el("span", "archive-game-teams");
        (g.teams || []).forEach((names, i) => tags.appendChild(teamTag(names, g.points?.[i], i, (g.winners || []).includes(i))));
        mid.appendChild(tags);
        mid.appendChild(el("span", "archive-meta", (g.rounds || []).map(r => r.rule).join(" · ") || "–"));
        btn.appendChild(mid);
        btn.appendChild(icon("next", "ico archive-chev"));
        btn.onclick = () => { view = { ...view, game: g.id }; openArchive(); };
        li.appendChild(btn);
        list.appendChild(li);
    });
    panel.appendChild(list);
}

function settingsLine(s) {
    if (!s) return "–";
    const parts = [];
    parts.push(s.levels ? s.levels.join(", ") : "Alle Schwierigkeiten");
    const pick = [];
    pick.push(s.themes ? (s.themes.length > 3 ? `${s.themes.length} Themen` : s.themes.join(", ")) : "Alle Themen");
    if (s.decks && s.decks.length) pick.push(s.decks.length > 2 ? `${s.decks.length} Decks` : s.decks.join(", "));
    parts.push(pick.join(" + "));
    if (s.nsfw) parts.push("NSFW");
    parts.push(`${s.cardCount} Karten`);
    const times = [...new Set((s.rounds || []).map(r => r.time))];
    if (times.length) parts.push(`${times.join("/")} s`);
    const pen = [];
    if (s.punishTime) pen.push(`Strafzeit ${s.punishTime} s`);
    if (s.penaltyMode === "yes") pen.push("−1 pro Fehler");
    if (s.penaltyMode === "draw") pen.push("−0,5 pro Fehler");
    parts.push(pen.length ? pen.join(", ") : "keine Strafen");
    if (s.handicapTime) parts.push(`Handicap +${s.handicapTime} s`);
    return parts.join(" · ");
}

function renderGame(panel, archive, g) {
    const no = archive.games.indexOf(g) + 1;
    const top = el("div", "archive-game-top");
    const back = setButtonContent(el("button", "icon-btn archive-games-back"), "back", "Alle Spiele");
    back.type = "button";
    back.onclick = () => { view = { ...view, game: null }; openArchive(); };
    top.appendChild(back);
    top.appendChild(el("strong", "archive-game-title", `Spiel ${no} · ${shortDate(g.startedAt)}`));
    const statsBtn = setButtonContent(el("button", "icon-btn archive-game-stats"), "chart", "Statistik");
    statsBtn.type = "button";
    statsBtn.onclick = () => {
        document.getElementById("archiveOverlay")?.remove();
        openGameStats(g, () => { showScreen("start"); openArchive(); });
    };
    top.appendChild(statsBtn);
    panel.appendChild(top);

    const teams = el("div", "archive-game-result");
    (g.teams || []).forEach((names, i) => {
        const win = (g.winners || []).includes(i);
        const card = el("div", "archive-team" + (win ? " is-winner" : ""));
        card.style.setProperty("--team", teamColor(i));
        const h = el("div", "archive-team-head");
        h.appendChild(el("strong", null, teamName(i) + (win ? " · Sieger" : "")));
        h.appendChild(el("span", "archive-team-points", fmt(g.points?.[i])));
        card.appendChild(h);
        card.appendChild(el("span", "archive-team-players",
            names.map(n => `${n} ${g.players?.[n]?.explained ?? 0}`).join(" · ")));
        teams.appendChild(card);
    });
    panel.appendChild(teams);

    if ((g.rounds || []).length) {
        const rounds = el("div", "archive-rounds");
        g.rounds.forEach((r, i) => {
            const t = el("div", "archive-round");
            t.appendChild(el("strong", null, `Runde ${i + 1}`));
            t.appendChild(el("span", null, r.rule));
            t.appendChild(el("span", "archive-meta", (r.points || []).map((p, j) => `${String.fromCharCode(65 + j)} ${fmt(p)}`).join(" : ")));
            rounds.appendChild(t);
        });
        panel.appendChild(rounds);
    }
    panel.appendChild(el("p", "archive-meta archive-settings", settingsLine(g.settings)));
}

function renderStats(panel, archive) {
    const s = archiveStats(archive);
    if (!s.games) return noData(panel);
    const kpis = el("div", "archive-kpis");
    [["Spiele", String(s.games)], ["Begriffe erraten", String(s.explained)], ["Ø pro Zug", fmt(s.perTurn)],
     [s.fastest ? `Schnellster: ${s.fastest.begriff}` : "Schnellster Begriff", s.fastest ? `${s.fastest.seconds} s` : "–"]].forEach(([k, v]) => {
        const d = el("div", "archive-kpi");
        d.appendChild(el("strong", null, v));
        d.appendChild(el("span", null, k));
        kpis.appendChild(d);
    });
    panel.appendChild(kpis);

    const cols = el("div", "archive-stat-cols");

    // Rangliste als Siegertreppchen (Platz 2 – 1 – 3), weitere darunter
    const rank = el("section", "archive-stat-box");
    rank.appendChild(el("h4", "gs-label", `Rangliste · ${plural(s.games, "Spiel", "Spiele")}`));
    const podium = el("ol", "archive-podium");
    const top3 = s.ranking.slice(0, 3);
    const maxWins = Math.max(1, ...top3.map(r => r.wins));
    [1, 0, 2].forEach(i => {
        const r = top3[i];
        if (!r) return;
        const li = el("li", `podium-${i + 1}`);
        const av = el("span", "avatar podium-avatar", r.name.charAt(0).toUpperCase());
        av.style.setProperty("--av", TEAM_COLORS[s.ranking.indexOf(r) % TEAM_COLORS.length]);
        av.setAttribute("aria-hidden", "true");
        li.appendChild(av);
        li.appendChild(el("strong", "podium-name", r.name));
        li.appendChild(el("span", "archive-meta", `${plural(r.wins, "Sieg", "Siege")} · ${r.explained} erklärt`));
        const step = el("span", "podium-step", i + 1);
        step.style.height = `${Math.round(36 + 44 * (r.wins / maxWins))}px`;
        li.appendChild(step);
        podium.appendChild(li);
    });
    rank.appendChild(podium);
    if (s.ranking.length > 3) {
        const rest = el("ol", "archive-rest");
        rest.start = 4;
        s.ranking.slice(3).forEach(r => rest.appendChild(el("li", null, `${r.name} · ${plural(r.wins, "Sieg", "Siege")} · ${r.explained} erklärt`)));
        rank.appendChild(rest);
    }
    cols.appendChild(rank);

    // Duo-Bilanz
    const duo = el("section", "archive-stat-box");
    duo.appendChild(el("h4", "gs-label", "Duo-Bilanz"));
    if (!s.duos.length) duo.appendChild(el("p", "archive-meta", "Noch keine Teams mit zwei oder mehr Spielern."));
    const dl = el("ul", "archive-duos");
    s.duos.slice(0, 8).forEach(d => {
        const li = el("li");
        li.appendChild(el("strong", null, d.names.join(" + ")));
        li.appendChild(el("span", "archive-meta", plural(d.games, "Spiel", "Spiele")));
        li.appendChild(el("span", "duo-val", `${plural(d.wins, "Sieg", "Siege")} · ${Math.round(d.rate * 100)} %`));
        dl.appendChild(li);
    });
    duo.appendChild(dl);
    cols.appendChild(duo);

    // Rekorde
    const rec = el("section", "archive-stat-box");
    rec.appendChild(el("h4", "gs-label", "Rekorde"));
    const rl = el("ul", "archive-records");
    const R = s.records;
    const items = [
        ["trophy", "Meiste Punkte in einer Runde", R.roundPoints ? `${fmt(R.roundPoints.points)} · ${R.roundPoints.names.join(", ")} · Runde ${R.roundPoints.round}` : null],
        ["flame", "Längste Serie", R.streak ? `${R.streak.player} · ${R.streak.count} Begriffe in einem Zug` : null],
        ["bolt", "Schnellster Begriff", R.fastest ? `${R.fastest.player} · „${R.fastest.begriff}“ ${R.fastest.seconds} s` : null],
        ["star", "Knappster Sieg", R.closest ? `${R.closest.score} · ${shortDate(R.closest.date)}` : null]
    ].filter(([, , v]) => v);
    if (!items.length) rec.appendChild(el("p", "archive-meta", "Noch keine Rekorde."));
    items.forEach(([ic, t, v]) => {
        const li = el("li");
        li.appendChild(icon(ic));
        const txt = el("span");
        txt.appendChild(el("span", "archive-meta", t));
        txt.appendChild(el("strong", null, v));
        li.appendChild(txt);
        rl.appendChild(li);
    });
    rec.appendChild(rl);
    cols.appendChild(rec);
    panel.appendChild(cols);
}

function renderCards(panel, archive) {
    const cards = archive.usedCards || [];
    panel.appendChild(el("p", "archive-hint",
        `${plural(cards.length, "Karte", "Karten")} gespielt. Beim Laden dieser Spielgruppe kommen sie nicht noch einmal.`));
    const list = el("ul", "archive-cards");
    cards.slice(0, 300).forEach(c => list.appendChild(el("li", null, c.begriff)));
    if (cards.length > 300) list.appendChild(el("li", "archive-meta", `+${cards.length - 300} weitere`));
    panel.appendChild(list);
}
