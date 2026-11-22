// Spielstand sichern und fortsetzen: Ein laufendes Spiel überlebt Neuladen oder das
// Schließen der App im Hintergrund. Gesichert wird bei jedem Zugwechsel und nach jeder Karte.
// Ein unterbrochener Zug gilt beim Fortsetzen als beendet (erratene Karten zählen).
import { state } from "./state.js";
import { appConfirm, showScreen, updatePlayerTable } from "./ui.js";
import { endRound, showRoundStats, showStartRoundScreen } from "./game.js";

const GAME_STORAGE_KEY = "timesup_game";
const GAME_SAVE_VERSION = 1;

// Felder des Zustands, die zu einem laufenden Spiel gehören
const SAVED_FIELDS = [
    "players", "teams", "totalTeams", "playingCards", "currentCards", "correctCards",
    "currentRound", "totalRounds", "totalPoints", "penaltyPoints", "teamMistakes", "roundPointsApplied",
    "teamTurnOrder", "teamTurnOrderPosition", "activePlayerIndicesByTeam", "activeTeamIndex",
    "activePlayerIndexInTeam", "activeArchiveId", "gameLog",
];

let currentPhase = null;

// phase: "roundstart" (nächster Spieler wartet), "turn" (Zug läuft), "roundstats" (Runde vorbei)
export function saveGameState(phase = currentPhase) {
    if (!phase || !state.teams.length || !state.playingCards.length) return;
    currentPhase = phase;
    const banner = document.getElementById("resumeBanner");
    if (banner) banner.hidden = true;       // ein neues Spiel ersetzt den alten Spielstand
    const data = { version: GAME_SAVE_VERSION, savedAt: new Date().toISOString(), phase };
    SAVED_FIELDS.forEach(key => { data[key] = state[key]; });
    try {
        localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("Spielstand konnte nicht gesichert werden:", e);
    }
}

export function clearSavedGame() {
    currentPhase = null;
    try { localStorage.removeItem(GAME_STORAGE_KEY); } catch (e) {}
    const banner = document.getElementById("resumeBanner");
    if (banner) banner.hidden = true;
}

export function readSavedGame() {
    try {
        const data = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY) || "null");
        if (!data || data.version !== GAME_SAVE_VERSION) return null;
        if (!["roundstart", "turn", "roundstats"].includes(data.phase)) return null;
        if (!Array.isArray(data.teams) || !Array.isArray(data.playingCards) || !data.playingCards.length) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function describeSavedGame(data) {
    const playerCount = (data.teams || []).reduce((sum, team) => sum + (team?.length || 0), 0);
    const when = new Date(data.savedAt);
    const time = Number.isNaN(when.getTime()) ? "" : ` · ${when.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
    return `Nicht beendetes Spiel: Runde ${(data.currentRound || 0) + 1} von ${data.totalRounds || "?"}, ${playerCount} Spieler${time}`;
}

export function resumeSavedGame() {
    const data = readSavedGame();
    if (!data) return false;
    SAVED_FIELDS.forEach(key => {
        if (!(key in data)) return;
        if (key === "players") state.players.splice(0, state.players.length, ...data.players);
        else state[key] = data[key];
    });
    const team = state.teams[state.activeTeamIndex] || [];
    state.activePlayer = team[state.activePlayerIndexInTeam] || null;
    state.displayedCards = [];
    state.skippedThisTurn = [];
    state.skipCounter = 0;
    state.currentCard = null;
    updatePlayerTable();
    const banner = document.getElementById("resumeBanner");
    if (banner) banner.hidden = true;

    if (data.phase === "turn") {
        endRound();            // unterbrochener Zug gilt als beendet
    } else if (data.phase === "roundstats") {
        showRoundStats();
    } else {
        showStartRoundScreen();
    }
    return true;
}

async function discardSavedGame() {
    const confirmed = await appConfirm("Das nicht beendete Spiel wird gelöscht und kann nicht mehr fortgesetzt werden.", {
        title: "Spiel verwerfen?", okText: "Verwerfen", danger: true
    });
    if (confirmed) clearSavedGame();
}

// Beim Start: Hinweis "Spiel fortsetzen" auf dem Startbildschirm, falls ein Spielstand vorliegt
export function initSavedGameBanner() {
    const banner = document.getElementById("resumeBanner");
    const text = document.getElementById("resumeBannerText");
    const resumeBtn = document.getElementById("resumeGameButton");
    const discardBtn = document.getElementById("resumeDiscardButton");
    if (resumeBtn) resumeBtn.addEventListener("click", () => resumeSavedGame());
    if (discardBtn) discardBtn.addEventListener("click", discardSavedGame);
    const data = readSavedGame();
    if (!data || !banner) return;
    if (text) text.textContent = describeSavedGame(data);
    banner.hidden = false;
    showScreen("start");
}
