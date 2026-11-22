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
        credits: [],   // {card, begriff, player, team, round, ms}
        turns: {}      // Spielername -> Anzahl Züge
    };
    state.cardShownAt = null;
}

export function logTurnStart() {
    const log = state.gameLog;
    const name = state.activePlayer?.name;
    if (!log || !name) return;
    log.turns[name] = (log.turns[name] || 0) + 1;
}

export function logCardShown() {
    state.cardShownAt = now();
}

// Begriff wurde erraten: dem erklärenden Spieler gutschreiben
export function logCorrect(card) {
    const log = state.gameLog;
    if (!log || !card) return;
    const ms = state.cardShownAt ? Math.max(0, now() - state.cardShownAt) : null;
    log.credits.push({
        card: card.id || null, begriff: card.begriff, player: state.activePlayer?.name || "?",
        team: state.activeTeamIndex, round: state.currentRound, ms
    });
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
    log.teams.flat().forEach(name => { players[name] = { explained: 0, turns: log.turns[name] || 0 }; });
    log.credits.forEach(c => {
        players[c.player] = players[c.player] || { explained: 0, turns: log.turns[c.player] || 0 };
        players[c.player].explained++;
    });
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
        fastest: fastest ? { begriff: fastest.begriff, player: fastest.player, seconds: Math.max(1, Math.round(fastest.ms / 1000)) } : null
    };
    const store = readJsonStore(ARCHIVE_STORAGE_KEY, {});
    const entry = store[state.activeArchiveId];
    if (entry) {
        entry.games = (Array.isArray(entry.games) ? entry.games : []).filter(g => g.id !== game.id);
        entry.games.push(game);
        writeJsonStore(ARCHIVE_STORAGE_KEY, store);
    }
    state.gameLog = null;
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
    const ranking = [...players.values()]
        .map(s => ({ ...s, perTurn: s.turns ? s.explained / s.turns : 0 }))
        .sort((a, b) => b.wins - a.wins || b.explained - a.explained || a.name.localeCompare(b.name));
    return { games: games.length, explained, perTurn: turns ? explained / turns : 0, fastest, ranking };
}
