// Karten: Laden, IDs, Archiv und Kartenauswahl (mit Veto)
import { ARCHIVE_STORAGE_KEY, state } from "./state.js";
import { getSettings, readJsonStore, saveSettingsToStorage, toPositiveInt, writeJsonStore } from "./settings.js";
import { appAlert, appConfirm, appendText, refreshStartCardStatus, setCardLoadStatusText, showScreen, updateKartenStatusText, updatePlayerTable } from "./ui.js";

export function readArchiveStore() {
    return readJsonStore(ARCHIVE_STORAGE_KEY, {});
}
export function writeArchiveStore(store) {
    writeJsonStore(ARCHIVE_STORAGE_KEY, store);
}
// Schlüssel alter Archiv-Einträge (vor Einführung der IDs): der Begriff in Kleinbuchstaben
export function getCardKey(card) {
    return String(card?.begriff || "").trim().toLowerCase();
}
// Stabile Karten-ID aus Begriff und Erklärung (FNV-1a, 32 Bit).
// Muss zu scripts/export_cards.py passen.
export function hashCardText(begriff, erklaerung) {
    const text = `${begriff}\u001f${erklaerung}`;
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(text)) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return "k" + hash.toString(16).padStart(8, "0");
}
export function makeCard(begriff, erklaerung, id) {
    const b = String(begriff ?? "").trim();
    const e = String(erklaerung ?? "").trim();
    return { id: id || hashCardText(b, e), begriff: b, erklaerung: e };
}
// Vergibt bei identischen Karten eindeutige IDs (-2, -3, ...)
export function ensureUniqueCardIds(cards) {
    const seen = new Map();
    return cards.map(card => {
        const count = (seen.get(card.id) || 0) + 1;
        seen.set(card.id, count);
        return count === 1 ? card : { ...card, id: `${card.id}-${count}` };
    });
}
export function isSameCard(a, b) {
    return !!a && !!b && a.id === b.id;
}
export function makeArchiveId(createdAt) {
    const stamp = createdAt.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
    return `TU-${stamp}`;
}
export function ensureActiveArchive() {
    if (state.activeArchiveId) return state.activeArchiveId;

    const store = readArchiveStore();
    const createdAt = new Date();
    const id = makeArchiveId(createdAt);
    store[id] = {
        id,
        createdAt: createdAt.toISOString(),
        players: state.players.map(p => ({ name: p.name, handicap: !!p.handicap })),
        usedCards: []
    };
    state.activeArchiveId = id;
    writeArchiveStore(store);
    return id;
}
// Liefert die im aktiven Archiv gesperrten Karten: neue Einträge per ID,
// alte Einträge (ohne ID) weiterhin über den Begriff
export function getActiveArchiveUsedCards() {
    const ids = new Set();
    const legacyKeys = new Set();
    if (!state.activeArchiveId) return { ids, legacyKeys };
    const archive = readArchiveStore()[state.activeArchiveId];
    (archive?.usedCards || []).forEach(card => {
        if (card?.id) ids.add(card.id);
        else {
            const key = getCardKey(card);
            if (key) legacyKeys.add(key);
        }
    });
    return { ids, legacyKeys };
}
export function getAvailableCardPoolForArchive() {
    const { ids, legacyKeys } = getActiveArchiveUsedCards();
    return state.cardPool.filter(card => !ids.has(card.id) && !legacyKeys.has(getCardKey(card)));
}
export function savePlayedCardsToActiveArchive() {
    const id = ensureActiveArchive();
    const store = readArchiveStore();
    const archive = store[id];
    if (!archive) return;

    const entryKey = card => card?.id ? `id:${card.id}` : `alt:${getCardKey(card)}`;
    const byKey = new Map((archive.usedCards || []).map(card => [entryKey(card), card]));
    state.playingCards.forEach(card => {
        if (!card?.id) return;
        byKey.set(entryKey(card), { id: card.id, begriff: card.begriff, erklaerung: card.erklaerung || "" });
    });
    archive.players = state.players.map(p => ({ name: p.name, handicap: !!p.handicap }));
    archive.usedCards = [...byKey.values()];
    archive.lastPlayedAt = new Date().toISOString();
    writeArchiveStore(store);
}
export function formatArchiveDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unbekanntes Datum";
    return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}
export function loadArchiveEntry(archive) {
    state.players.splice(0, state.players.length, ...(archive.players || []).map(p => ({ name: p.name, handicap: !!p.handicap })));
    state.activeArchiveId = archive.id;
    updatePlayerTable();
    saveSettingsToStorage();
    updateKartenStatusText(`Archiv ${archive.id} geladen - ${(archive.usedCards || []).length} Karten gesperrt`);
    appAlert("Die Spieler wurden übernommen. Die Teams können jetzt neu gemischt werden.", { title: "Archiv geladen" });
}
export function openArchive() {
    const store = readArchiveStore();
    const archives = Object.values(store).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (archives.length === 0) {
        appAlert("Es gibt noch keine gespeicherten Spiele im Archiv.");
        return;
    }

    const existingOverlay = document.getElementById("archiveOverlay");
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "archiveOverlay";

    const box = document.createElement("div");
    box.className = "overlay-box";

    const title = document.createElement("h2");
    title.className = "overlay-title";
    title.textContent = "Archiv";
    box.appendChild(title);

    archives.forEach(archive => {
        const row = document.createElement("div");
        row.className = "archive-row";

        const info = document.createElement("div");
        const names = (archive.players || []).map(p => p.name).join(", ");
        const cardCount = (archive.usedCards || []).length;
        appendText(info, "strong", archive.id || "Unbekanntes Archiv");
        info.appendChild(document.createElement("br"));
        appendText(info, "span", `${formatArchiveDate(archive.createdAt)} | ${cardCount} Karten`).className = "archive-meta";
        info.appendChild(document.createElement("br"));
        appendText(info, "span", names);

        const loadBtn = document.createElement("button");
        loadBtn.className = "archive-load-btn";
        loadBtn.textContent = "Laden";
        loadBtn.onclick = () => {
            overlay.remove();
            loadArchiveEntry(archive);
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "archive-delete-btn";
        deleteBtn.textContent = "Löschen";
        deleteBtn.onclick = async () => {
            const confirmed = await appConfirm(`Soll der Archiv-Eintrag ${archive.id} wirklich gelöscht werden?`, {
                okText: "Löschen", danger: true
            });
            if (!confirmed) return;
            const updatedStore = readArchiveStore();
            delete updatedStore[archive.id];
            writeArchiveStore(updatedStore);
            if (state.activeArchiveId === archive.id) {
                state.activeArchiveId = null;
                refreshStartCardStatus();
            }
            overlay.remove();
            openArchive();
        };

        row.appendChild(info);
        row.appendChild(loadBtn);
        row.appendChild(deleteBtn);
        box.appendChild(row);
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Schließen";
    closeBtn.className = "secondary archive-close-btn";
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}
// === Karten laden (data/cards.json, erzeugt mit scripts/export_cards.py) ===
export async function loadCards() {
    const filePath = 'data/cards.json';
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Karten-Datei konnte nicht geladen werden (${response.status}).`);
        }
        const data = await response.json();
        const rows = Array.isArray(data) ? data : data?.cards;
        if (!Array.isArray(rows)) {
            throw new Error("Karten-Datei hat ein unbekanntes Format.");
        }

        state.cardPool = ensureUniqueCardIds(rows
            .map(row => makeCard(row.begriff, row.erklaerung, row.id))
            .filter(card => card.begriff && card.erklaerung));

        setCardLoadStatusText(`${state.cardPool.length} Karten erfolgreich geladen`);
    } catch (err) {
        console.error("Fehler beim Laden:", err);
        state.cardPool = [];
        setCardLoadStatusText("Fehler beim Laden der Karten.");
    }
}
export function canStartCardSelection() {
    if (state.players.length === 0) {
        appAlert("Bitte füge zuerst mindestens einen Spieler hinzu.");
        return false;
    }
    if (state.cardPool.length === 0) {
        appAlert("Es wurden noch keine Karten geladen.");
        return false;
    }
    return true;
}
export function resetCardSelectionUi() {
    const playerLabel = document.getElementById("cardSelectionPlayerName");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const ul = document.getElementById("cardSelectionList");
    const doneBtn = document.getElementById("cardDoneButton");
    const startBtn = document.getElementById("startGameOverviewButton");

    if (playerLabel) playerLabel.textContent = state.players[0]?.name || "";
    if (info) {
        info.textContent = "Bitte klicken, um die Kartenauswahl zu starten!";
        info.style.display = "block";
        info.style.cursor = "pointer";
        info.style.pointerEvents = "";
    }
    if (vetoInfo) {
        vetoInfo.textContent = "";
        vetoInfo.style.display = "none";
    }
    if (ul) ul.innerHTML = "";
    if (doneBtn) doneBtn.style.display = "none";
    if (startBtn) startBtn.style.display = "none";
}
export async function startCardSelection(withVeto) {
    if (!canStartCardSelection()) return;
    const totalCards = toPositiveInt(document.getElementById("cardCount")?.value, 40);
    const availableCardPool = getAvailableCardPoolForArchive();
    if (availableCardPool.length === 0) {
        appAlert("Für diese Archiv-ID sind keine neuen Karten mehr verfügbar.");
        return;
    }
    state.cardSelectionTargetCount = Math.min(totalCards, availableCardPool.length);
    const cardsPerPlayer = Math.floor(state.cardSelectionTargetCount / state.players.length);
    if (state.cardSelectionTargetCount < totalCards) {
        await appAlert(`Für diese Archiv-ID sind nur noch ${state.cardSelectionTargetCount} neue Karten verfügbar.`);
    }
    state.shuffledCardPool = shuffleArray(availableCardPool);
    state.playingCards = [];
    state.playerCardCount = cardsPerPlayer;
    state.currentCardPlayerIndex = 0;
    const settings = getSettings();
    state.vetoCountPerPlayer = settings.vetoCount || 1;
    resetCardSelectionUi();
    state.cardsWereShown = false;
    state.allowCardClick = true;
    showScreen("kartenauswahl");
}
export async function startCardSelectionWithoutVeto() {
    if (!canStartCardSelection()) return;
    const totalCards = toPositiveInt(document.getElementById("cardCount")?.value, 40);
    const availableCardPool = getAvailableCardPoolForArchive();
    if (availableCardPool.length === 0) {
        appAlert("Für diese Archiv-ID sind keine neuen Karten mehr verfügbar.");
        return;
    }
    state.cardSelectionTargetCount = Math.min(totalCards, availableCardPool.length);
    if (state.cardSelectionTargetCount < totalCards) {
        await appAlert(`Für diese Archiv-ID sind nur noch ${state.cardSelectionTargetCount} neue Karten verfügbar.`);
    }
    state.shuffledCardPool = shuffleArray(availableCardPool);
    state.playingCards = state.shuffledCardPool.slice(0, state.cardSelectionTargetCount);
    resetCardSelectionUi();
    state.cardsWereShown = true;
    state.allowCardClick = false;

    // Layout-Elemente holen
    const playerLabel = document.getElementById("cardSelectionPlayerName");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const ul = document.getElementById("cardSelectionList");
    const doneBtn = document.getElementById("cardDoneButton");
    const startBtn = document.getElementById("startGameOverviewButton");

    // Layout wie bei showScreen("kartenauswahl")
    playerLabel.textContent = "✓ Fertig!";
    info.textContent = `${state.playingCards.length} Karten wurden zufällig ausgewählt.`;
    info.style.display = "block";
    info.style.cursor = "not-allowed";
    info.style.pointerEvents = "none";
    vetoInfo.textContent = "";
    vetoInfo.style.display = "none";
    ul.innerHTML = "";
    doneBtn.style.display = "none";
    if (startBtn) startBtn.style.display = "inline-block";
    showScreen("kartenauswahl");
}
export function handleCardSelectionClick() {
    if (state.cardsWereShown || !state.allowCardClick) return;
    const ul = document.getElementById("cardSelectionList");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const cardsForPlayer = state.shuffledCardPool.splice(0, state.playerCardCount);
    state.remainingVetos = state.vetoCountPerPlayer;
    state.cardsWereShown = true;
    cardsForPlayer.forEach((card, index) => {
        const li = document.createElement("li");
        li._timesupCard = card;
        appendText(li, "span", card.begriff, {
            background: "var(--panel)",
            padding: "2px 6px",
            borderRadius: "6px"
        });
        li.appendChild(document.createTextNode(` - ${card.erklaerung}`));
        li.style.padding = "8px";
        li.style.borderBottom = "1px solid #ccc";
        li.style.cursor = "pointer";
        li.onclick = () => handleCardVeto(li, index);
        ul.appendChild(li);
    });
    //  info.textContent = `Deine ${playerCardCount} Karten:`;
    info.textContent = ``;
    updateVetoDisplay();
    const doneBtn = document.getElementById("cardDoneButton");
    if (doneBtn) doneBtn.style.display = "inline-block";
}
export function updateVetoDisplay() {
    const el = document.getElementById("vetoInfoText");
    if (el) {
        el.textContent = `Du hast ${state.remainingVetos} Veto${state.remainingVetos !== 1 ? 's' : ''}`;
    }
}
export async function handleCardVeto(listItem, index) {
    if (state.remainingVetos <= 0) {
        appAlert("Du hast keine Vetos mehr.");
        return;
    }
    const confirmVeto = await appConfirm("Willst du wirklich ein Veto verwenden, um diese Karte auszutauschen?", {
        okText: "Veto einsetzen"
    });
    if (!confirmVeto) return;
    if (state.remainingVetos <= 0 || listItem.style.pointerEvents === "none") return;
    if (state.shuffledCardPool.length === 0) {
        appAlert("Es sind keine Karten mehr verfügbar.");
        return;
    }
    const newCard = state.shuffledCardPool.shift();
    listItem._timesupCard = newCard;
    listItem.textContent = `${newCard.begriff} - ${newCard.erklaerung}`;
    listItem.onclick = null;
    listItem.style.opacity = "0.6";
    listItem.style.pointerEvents = "none";
    state.remainingVetos--;
    updateVetoDisplay();
    document.getElementById("vetoInfoText").textContent =
        `Du hast ${state.remainingVetos} Veto${state.remainingVetos !== 1 ? 's' : ''}`;
}
export async function handleCardSelectionDone() {
    const startOverviewButton = document.getElementById("startGameOverviewButton");
    if (startOverviewButton) startOverviewButton.style.display = "none";
    if (state.remainingVetos > 0) {
        const confirmFinish = await appConfirm(`Du hast noch ${state.remainingVetos} Veto${state.remainingVetos !== 1 ? 's' : ''} übrig. Möchtest du wirklich fortfahren?`, {
            okText: "Fortfahren", cancelText: "Zurück"
        });
        if (!confirmFinish) return;
    }
    const ul = document.getElementById("cardSelectionList");
    const playerLabel = document.getElementById("cardSelectionPlayerName");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const doneBtn = document.getElementById("cardDoneButton");
    if (!ul || !playerLabel || !info || !vetoInfo || !doneBtn) return;

    for (let i = 0; i < ul.children.length; i++) {
        const selectedCard = ul.children[i]._timesupCard;
        if (selectedCard) {
            state.playingCards.push(selectedCard);
        }
    }
    state.currentCardPlayerIndex++;
    if (state.currentCardPlayerIndex >= state.players.length) {
        const targetCount = state.cardSelectionTargetCount || toPositiveInt(document.getElementById("cardCount")?.value, 40);
        const fehlendeKarten = Math.max(0, targetCount - state.playingCards.length);
        for (let i = 0; i < fehlendeKarten && state.shuffledCardPool.length > 0; i++) {
            state.playingCards.push(state.shuffledCardPool.shift());
        }
        playerLabel.textContent = "✓ Fertig!";
        info.textContent = `Alle Spieler haben ihre Karten. Gesamt: ${state.playingCards.length} Karten. Davon ${fehlendeKarten} automatisch ergänzt.`;
        info.style.display = "block";
        info.style.cursor = "not-allowed";
        info.style.pointerEvents = "none";
        vetoInfo.textContent = "";
        vetoInfo.style.display = "none";
        ul.innerHTML = "";
        doneBtn.style.display = "none";
        state.allowCardClick = false;
        if (startOverviewButton) startOverviewButton.style.display = "inline-block";
        return;
    }
    playerLabel.textContent = state.players[state.currentCardPlayerIndex].name;
    info.textContent = "Bitte klicken, um die Kartenauswahl zu starten!";
    info.style.display = "block";
    vetoInfo.textContent = "";
    ul.innerHTML = "";
    doneBtn.style.display = "none";
    state.cardsWereShown = false;
    state.allowCardClick = false;
    setTimeout(() => { state.allowCardClick = true; }, 100);
}
// Fisher-Yates: jede Reihenfolge gleich wahrscheinlich, Original bleibt unverändert
export function shuffleArray(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}