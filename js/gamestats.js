// Spielverlauf für das Archiv: pro Spiel Teams, Punkte je Runde, Regeln, Kartenauswahl
// und wer wie viele Begriffe erklärt hat. Ein Archiv-Eintrag (Spielgruppe) sammelt mehrere Spiele;
// die Teams dürfen sich von Spiel zu Spiel ändern.
import { ARCHIVE_STORAGE_KEY, state } from "./state.js";
import { getSettings, readJsonStore, toPositiveInt, writeJsonStore } from "./settings.js";
import { getCardFilter } from "./filter.js";

const now = () => Date.now();

function settingsSummary(settings = getSettings()) {
    const rounds = toPositiveInt(settings.roundCount, 3);
    const filter = getCardFilter();
    const k = state.kategorien || {};
    const nameOf = (list, id) => (list || []).find(x => x.id === id)?.name || id;
    return {
        cardCount: state.playingCards.length,
        rounds: Array.from({ length: rounds }, (_, i) => ({
            rule: settings.roundRules?.[i] || "–",
            time: Number(settings.roundTimer?.[i]) || 30,
            skip: (settings.roundSkip?.[i] || "no") === "yes"
        })),
        levels: filter.levels ? filter.levels.map(id => nameOf(k.stufen, id)) : null,          // null = alle
        themes: filter.themes ? filter.themes.map(id => nameOf(k.themen, id)) : null,
        decks: (filter.decks || []).map(id => nameOf(k.decks, id)),
        nsfw: !!filter.nsfw,
        punishTime: settings.punishEnabled ? Number(settings.punishTime) || 3 : 0,
        penaltyMode: settings.penaltyPoints || settings.punishPoints || "no",
        handicapTime: settings.handicapEnabled ? Number(settings.handicapTime) || 5 : 0
    };
}

// Neues Spiel beginnt (startGame)
export function startGameLog() {
    const startedAt = new Date();
    state.gameLog = {
        id: `G-${startedAt.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}`,
        startedAt: startedAt.toISOString(),
        teams: state.teams.map(team => team.map(p => p.name)),
        settings: settingsSummary(),
        rounds: [],
        credits: [],   // {card, begriff, player, team, round, ms, last}
        turns: {},     // Spielername -> Anzahl Züge
        shown: {},     // Spielername -> gezeigte Karten
        skips: {},     // Spielername -> übersprungen
        mistakes: {},  // Spielername -> Fehler
        best: {},      // Spielername -> beste Serie in einem Zug
        cardSkips: {}, // Begriff -> wie oft übersprungen
        streak: 0
    };
    state.cardShownAt = null;
}

export function logTurnStart() {
    const log = state.gameLog;
    const name = state.activePlayer?.name;
    if (!log || !name) return;
    log.turns[name] = (log.turns[name] || 0) + 1;
    log.streak = 0;
}
const bump = (obj, key) => { if (obj && key) obj[key] = (obj[key] || 0) + 1; };

export function logSkip(card) {
    const log = state.gameLog;
    if (!log) return;
    bump(log.skips, state.activePlayer?.name);
    if (card) bump(log.cardSkips, card.begriff);
    log.streak = 0;
}

export function logMistake() {
    const log = state.gameLog;
    if (!log) return;
    bump(log.mistakes, state.activePlayer?.name);
    log.streak = 0;
}

export function logCardShown() {
    state.cardShownAt = now();
    const log = state.gameLog;
    if (log && log.shown) bump(log.shown, state.activePlayer?.name);
}

// Begriff wurde erraten: dem erklärenden Spieler gutschreiben
export function logCorrect(card) {
    const log = state.gameLog;
    if (!log || !card) return;
    const ms = state.cardShownAt ? Math.max(0, now() - state.cardShownAt) : null;
    const player = state.activePlayer?.name || "?";
    log.credits.push({
        card: card.id || null, begriff: card.begriff, player,
        team: state.activeTeamIndex, round: state.currentRound, ms,
        last: state.isTimerRunning && (state.remainingTime || 0) <= 1   // Treffer in der letzten Sekunde
    });
    if (log.best) {
        log.streak = (log.streak || 0) + 1;
        log.best[player] = Math.max(log.best[player] || 0, log.streak);
    }
}

// Korrektur nach Zugende: Karte zählt doch nicht
export function logUncorrect(card) {
    const log = state.gameLog;
    if (!log || !card) return;
    for (let i = log.credits.length - 1; i >= 0; i--) {
        const c = log.credits[i];
        if (c.round === state.currentRound && c.team === state.activeTeamIndex &&
            ((card.id && c.card === card.id) || c.begriff === card.begriff)) {
            log.credits.splice(i, 1);
            return;
        }
    }
}

// Runde abgerechnet: Punkte je Team dieser Runde festhalten
export function logRoundPoints(before, after) {
    const log = state.gameLog;
    if (!log) return;
    const r = state.currentRound;
    const cfg = log.settings.rounds[r] || {};
    log.rounds[r] = {
        rule: cfg.rule || "–", time: cfg.time || 30, skip: !!cfg.skip,
        points: after.map((v, i) => Math.round(((v || 0) - (before[i] || 0)) * 10) / 10)
    };
}

// Spiel beendet: Ergebnis in den aktiven Archiv-Eintrag schreiben
export function finishGameLog() {
    const log = state.gameLog;
    if (!log || !state.activeArchiveId) return null;
    const points = state.totalPoints.map(p => p || 0);
    const max = points.length ? Math.max(...points) : 0;
    const players = {};
    const base = name => ({
        explained: 0, turns: log.turns[name] || 0, shown: log.shown?.[name] || 0, skips: log.skips?.[name] || 0,
        mistakes: log.mistakes?.[name] || 0, bestStreak: log.best?.[name] || 0, lastSecond: 0, msSum: 0, msCount: 0
    });
    log.teams.flat().forEach(name => { players[name] = base(name); });
    log.credits.forEach(c => {
        const p = players[c.player] = players[c.player] || base(c.player);
        p.explained++;
        if (c.last) p.lastSecond++;
        if (typeof c.ms === "number") { p.msSum += c.ms; p.msCount++; }
    });
    Object.values(players).forEach(p => {
        p.avgSeconds = p.msCount ? Math.round(p.msSum / p.msCount / 100) / 10 : null;
        delete p.msSum; delete p.msCount;
    });
    // Begriffe: härteste (oft übersprungen / lange gebraucht), Lerneffekt (Runde 1 → spätere Runde)
    const byTerm = new Map();
    log.credits.forEach(c => {
        if (typeof c.ms !== "number") return;
        const t = byTerm.get(c.begriff) || { begriff: c.begriff, times: [] };
        t.times[c.round] = c.ms;
        byTerm.set(c.begriff, t);
    });
    const sec = ms => Math.max(1, Math.round(ms / 1000));
    const hardest = [...byTerm.values()]
        .map(t => ({ begriff: t.begriff, skips: log.cardSkips?.[t.begriff] || 0, seconds: sec(Math.max(...t.times.filter(x => x != null))) }))
        .concat(Object.keys(log.cardSkips || {}).filter(b => !byTerm.has(b)).map(b => ({ begriff: b, skips: log.cardSkips[b], seconds: null })))
        .sort((a, b) => b.skips - a.skips || (b.seconds || 0) - (a.seconds || 0))
        .slice(0, 5);
    const learning = [...byTerm.values()]
        .map(t => {
            const rounds = t.times.map((ms, r) => (ms != null ? r : -1)).filter(r => r >= 0);
            if (rounds.length < 2) return null;
            const first = t.times[rounds[0]], last = t.times[rounds[rounds.length - 1]];
            return { begriff: t.begriff, from: sec(first), to: sec(last), gain: first - last };
        })
        .filter(x => x && x.gain > 0 && x.from > x.to)
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 5)
        .map(({ gain, ...rest }) => rest);
    const timed = log.credits.filter(c => typeof c.ms === "number");
    const fastest = timed.length ? timed.reduce((a, b) => (b.ms < a.ms ? b : a)) : null;
    const game = {
        id: log.id,
        startedAt: log.startedAt,
        endedAt: new Date().toISOString(),
        teams: log.teams,
        points,
        penalties: state.penaltyPoints.map(p => p || 0),
        winners: points.map((p, i) => (p === max ? i : -1)).filter(i => i >= 0),
        rounds: log.rounds.filter(Boolean),
        settings: log.settings,
        players,
        fastest: fastest ? { begriff: fastest.begriff, player: fastest.player, seconds: Math.max(1, Math.round(fastest.ms / 1000)) } : null,
        terms: { hardest, learning }
    };
    const store = readJsonStore(ARCHIVE_STORAGE_KEY, {});
    const entry = store[state.activeArchiveId];
    if (entry) {
        entry.games = (Array.isArray(entry.games) ? entry.games : []).filter(g => g.id !== game.id);
        entry.games.push(game);
        writeJsonStore(ARCHIVE_STORAGE_KEY, store);
    }
    state.gameLog = null;
    state.lastGame = game;
    return game;
}

// === Auswertung über alle Spiele eines Archiv-Eintrags ===
export function archiveStats(entry) {
    const games = Array.isArray(entry?.games) ? entry.games : [];
    const players = new Map();
    let explained = 0, turns = 0, fastest = null;
    games.forEach(g => {
        Object.entries(g.players || {}).forEach(([name, p]) => {
            const s = players.get(name) || { name, explained: 0, turns: 0, wins: 0, games: 0 };
            s.explained += p.explained || 0;
            s.turns += p.turns || 0;
            s.games += 1;
            players.set(name, s);
            explained += p.explained || 0;
            turns += p.turns || 0;
        });
        (g.winners || []).forEach(t => (g.teams?.[t] || []).forEach(name => {
            const s = players.get(name) || { name, explained: 0, turns: 0, wins: 0, games: 1 };
            s.wins += 1;
            players.set(name, s);
        }));
        if (g.fastest && (!fastest || g.fastest.seconds < fastest.seconds)) fastest = g.fastest;
    });
    // Duo-Bilanz: Spielerpaare im selben Team
    const duos = new Map();
    const records = { roundPoints: null, streak: null, fastest, closest: null };
    games.forEach(g => {
        (g.teams || []).forEach((names, t) => {
            const won = (g.winners || []).includes(t) && (g.winners || []).length === 1;
            for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
                const pair = [names[i], names[j]].sort((a, b) => a.localeCompare(b));
                const key = pair.join(" + ");
                const d = duos.get(key) || { names: pair, games: 0, wins: 0 };
                d.games++;
                if (won) d.wins++;
                duos.set(key, d);
            }
        });
        (g.rounds || []).forEach((r, ri) => (r.points || []).forEach((p, t) => {
            if (!records.roundPoints || p > records.roundPoints.points)
                records.roundPoints = { points: p, team: t, names: g.teams?.[t] || [], round: ri + 1, date: g.startedAt };
        }));
        Object.entries(g.players || {}).forEach(([name, p]) => {
            if (p.bestStreak && (!records.streak || p.bestStreak > records.streak.count))
                records.streak = { count: p.bestStreak, player: name, date: g.startedAt };
        });
        const sorted = [...(g.points || [])].sort((a, b) => b - a);
        if (sorted.length > 1 && sorted[0] > sorted[1] && (!records.closest || sorted[0] - sorted[1] < records.closest.diff))
            records.closest = { diff: sorted[0] - sorted[1], score: `${sorted[0]} : ${sorted[1]}`, date: g.startedAt };
    });
    const duoList = [...duos.values()]
        .map(d => ({ ...d, rate: d.games ? d.wins / d.games : 0 }))
        .sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.games - a.games);
    const ranking = [...players.values()]
        .map(s => ({ ...s, perTurn: s.turns ? s.explained / s.turns : 0 }))
        .sort((a, b) => b.wins - a.wins || b.explained - a.explained || a.name.localeCompare(b.name));
    return { games: games.length, explained, perTurn: turns ? explained / turns : 0, fastest, ranking, duos: duoList, records };
}

// Auszeichnungen eines Spiels: jede an einen anderen Spieler, nur wenn es etwas zu zeigen gibt
export function gameAwards(game) {
    const ps = Object.entries(game?.players || {}).map(([name, p]) => ({ name, ...p }));
    const taken = new Set();
    const out = [];
    const pick = (id, title, icon, list, valueText) => {
        const p = list.find(x => !taken.has(x.name));
        if (!p) return;
        taken.add(p.name);
        out.push({ id, title, icon, player: p.name, text: valueText(p) });
    };
    pick("mvp", "MVP", "trophy", ps.filter(p => p.explained > 0).sort((a, b) => b.explained - a.explained), p => `${p.explained} Begriffe erklärt`);
    if (game?.fastest) {
        const f = ps.find(p => p.name === game.fastest.player);
        if (f) pick("blitz", "Blitzmerker", "bolt", [f], () => `„${game.fastest.begriff}“ in ${game.fastest.seconds} s`);
    }
    pick("last", "Last-Second-Held", "flame", ps.filter(p => p.lastSecond > 0).sort((a, b) => b.lastSecond - a.lastSecond),
        p => `${p.lastSecond}× in der letzten Sekunde`);
    pick("streak", "Serienmeister", "star", ps.filter(p => p.bestStreak >= 3).sort((a, b) => b.bestStreak - a.bestStreak),
        p => `${p.bestStreak} Begriffe am Stück`);
    pick("team", "Teamplayer", "users", ps.filter(p => p.shown >= 3).sort((a, b) => b.explained / b.shown - a.explained / a.shown),
        p => `${Math.round(p.explained / p.shown * 100)} % Trefferquote`);
    pick("skip", "Skip-König", "skip", ps.filter(p => p.skips > 0).sort((a, b) => b.skips - a.skips), p => `${p.skips}× übersprungen`);
    pick("pech", "Pechvogel", "x", ps.filter(p => p.mistakes > 0).sort((a, b) => b.mistakes - a.mistakes), p => `${p.mistakes} Fehler`);
    return out;
}
