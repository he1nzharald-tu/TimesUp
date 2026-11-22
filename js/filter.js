// Kartenfilter: Schwierigkeit, Themen, Decks und NSFW
// Gespeichert in den Einstellungen als cardFilter = { levels, themes, decks, nsfw }
//   levels / themes: null = alle, sonst Liste von IDs aus data/kategorien.json
//   decks: Liste von Deck-IDs (Karte ist dabei, wenn ein gewähltes Thema ODER ihr Deck passt)
//   nsfw: Karten mit dem Thema NSFW nur, wenn ausdrücklich eingeschaltet
import { state } from "./state.js";

export const NSFW_THEME = "nsfw";

export function getDefaultCardFilter() {
    return { levels: null, themes: null, decks: [], nsfw: false };
}

const asIdList = (value) => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === "string" && v))] : null;

// Gespeicherten Filter prüfen und vervollständigen (ältere Einstellungen haben keinen)
export function normalizeCardFilter(raw) {
    const f = getDefaultCardFilter();
    if (!raw || typeof raw !== "object") return f;
    f.levels = asIdList(raw.levels);
    f.themes = asIdList(raw.themes);
    f.decks = asIdList(raw.decks) || [];
    f.nsfw = raw.nsfw === true;
    return f;
}

export function getCardFilter() {
    if (!state.cardFilter) state.cardFilter = getDefaultCardFilter();
    return state.cardFilter;
}
export function setCardFilter(filter) {
    state.cardFilter = normalizeCardFilter(filter);
    return state.cardFilter;
}

export function cardMatchesFilter(card, filter = getCardFilter()) {
    const themes = Array.isArray(card.themes) ? card.themes : [];
    if (themes.includes(NSFW_THEME)) return filter.nsfw;
    if (filter.levels && card.level && !filter.levels.includes(card.level)) return false;
    if (card.deck && filter.decks.includes(card.deck)) return true;
    if (!filter.themes) return true;
    return themes.some(t => filter.themes.includes(t));
}

export function getFilteredCardPool(filter = getCardFilter()) {
    return state.cardPool.filter(card => cardMatchesFilter(card, filter));
}

// Anzahl Karten je Stufe/Thema/Deck (für Anzeigen in den Einstellungen)
export function countCardsByCategory(cards = state.cardPool) {
    const counts = { levels: {}, themes: {}, decks: {} };
    for (const card of cards) {
        if (card.level) counts.levels[card.level] = (counts.levels[card.level] || 0) + 1;
        for (const t of card.themes || []) counts.themes[t] = (counts.themes[t] || 0) + 1;
        if (card.deck) counts.decks[card.deck] = (counts.decks[card.deck] || 0) + 1;
    }
    return counts;
}

// Stufen, Themen und Decks (Namen, Symbole) aus data/kategorien.json
export async function loadKategorien() {
    try {
        const response = await fetch("data/kategorien.json");
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        state.kategorien = {
            stufen: Array.isArray(data.stufen) ? data.stufen : [],
            themen: Array.isArray(data.themen) ? data.themen : [],
            decks: Array.isArray(data.decks) ? data.decks : [],
        };
    } catch (err) {
        console.error("Kategorien konnten nicht geladen werden:", err);
        state.kategorien = { stufen: [], themen: [], decks: [] };
    }
    return state.kategorien;
}
