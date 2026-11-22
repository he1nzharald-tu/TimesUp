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
// Muss zu card_id() in scripts/kartendaten.py passen. Karten aus cards.json bringen ihre feste ID mit;
// der Hash gilt nur für Karten ohne ID (z. B. alte Archiv-Einträge).
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

    if (archives.length === 0) {
        appendText(box, "p", "Noch keine gespeicherten Spiele. Ein exportiertes Archiv von einem anderen Gerät kannst du hier importieren.")
            .className = "archive-empty";
    }

    const actions = document.createElement("div");
    actions.className = "archive-actions";

    if (archives.length > 0) {
        const exportBtn = appendText(actions, "button", "⬆️ Exportieren");
        exportBtn.className = "archive-export-btn";
        exportBtn.title = "Archiv als Datei speichern oder teilen";
        exportBtn.onclick = () => exportArchive();
    }

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.id = "archiveImportInput";
    fileInput.hidden = true;
    fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (file) await importArchiveFile(file);
    };
    actions.appendChild(fileInput);

    const importBtn = appendText(actions, "button", "⬇️ Importieren");
    importBtn.className = "archive-import-btn";
    importBtn.title = "Exportiertes Archiv laden";
    importBtn.onclick = () => fileInput.click();

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Schließen";
    closeBtn.className = "secondary archive-close-btn";
    closeBtn.onclick = () => overlay.remove();
    actions.appendChild(closeBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// === Archiv exportieren und importieren (Spielgruppen auf ein anderes Gerät mitnehmen) ===
const ARCHIVE_FILE_TYPE = "timesup-archiv";
const ARCHIVE_FILE_VERSION = 1;
const ARCHIVE_FILE_MAX_BYTES = 5 * 1024 * 1024;

export function buildArchiveExport(store = readArchiveStore(), now = new Date()) {
    const entries = Object.values(store).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return { type: ARCHIVE_FILE_TYPE, version: ARCHIVE_FILE_VERSION, exportedAt: now.toISOString(), entries };
}

export async function exportArchive() {
    const data = buildArchiveExport();
    const date = data.exportedAt.slice(0, 10);
    const fileName = `timesup-archiv-${date}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });

    // Auf Handys/Tablets das Teilen-Menü (AirDrop, Dateien, Messenger), sonst Download
    try {
        const file = new File([blob], fileName, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
            await navigator.share({ files: [file], title: "TimesUp-Archiv" });
            return;
        }
    } catch (err) {
        if (err && err.name === "AbortError") return; // Teilen abgebrochen
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cleanArchiveEntry(entry) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id.trim()) return null;
    const createdAt = Number.isNaN(new Date(entry.createdAt).getTime()) ? new Date(0).toISOString() : String(entry.createdAt);
    const players = (Array.isArray(entry.players) ? entry.players : [])
        .filter(p => p && typeof p.name === "string" && p.name.trim())
        .map(p => ({ name: p.name.trim(), handicap: !!p.handicap }));
    const usedCards = (Array.isArray(entry.usedCards) ? entry.usedCards : [])
        .filter(c => c && (typeof c.id === "string" || typeof c.begriff === "string"))
        .map(c => {
            const card = { begriff: String(c.begriff || ""), erklaerung: String(c.erklaerung || "") };
            if (typeof c.id === "string" && c.id) card.id = c.id;
            return card;
        });
    const cleaned = { id: entry.id.trim(), createdAt, players, usedCards };
    if (entry.lastPlayedAt && !Number.isNaN(new Date(entry.lastPlayedAt).getTime())) cleaned.lastPlayedAt = String(entry.lastPlayedAt);
    return cleaned;
}

// Liest den Inhalt einer Archiv-Datei; wirft einen Fehler mit verständlicher Meldung
export function parseArchiveFile(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error("Die Datei ist kein gültiges TimesUp-Archiv.");
    }
    if (!data || data.type !== ARCHIVE_FILE_TYPE || !Array.isArray(data.entries)) {
        throw new Error("Die Datei ist kein gültiges TimesUp-Archiv.");
    }
    if (data.version > ARCHIVE_FILE_VERSION) {
        throw new Error("Das Archiv stammt aus einer neueren App-Version. Bitte aktualisiere die App.");
    }
    return data.entries.map(cleanArchiveEntry).filter(Boolean);
}

// Führt importierte Einträge mit dem vorhandenen Archiv zusammen.
// Gleiche ID: gespielte Karten werden vereinigt, die Spieler des zuletzt gespielten Stands gelten.
export function mergeArchiveEntries(store, entries) {
    const result = { ...store };
    let added = 0, merged = 0;
    const cardKey = card => card.id ? `id:${card.id}` : `alt:${getCardKey(card)}`;
    const lastActivity = e => String(e.lastPlayedAt || e.createdAt || "");
    for (const entry of entries) {
        const existing = result[entry.id];
        if (!existing) {
            result[entry.id] = entry;
            added++;
            continue;
        }
        const cards = new Map((existing.usedCards || []).map(c => [cardKey(c), c]));
        entry.usedCards.forEach(c => { if (!cards.has(cardKey(c))) cards.set(cardKey(c), c); });
        const newer = lastActivity(entry) > lastActivity(existing) ? entry : existing;
        result[entry.id] = {
            ...existing,
            players: newer.players,
            usedCards: [...cards.values()],
            createdAt: String(existing.createdAt) < String(entry.createdAt) ? existing.createdAt : entry.createdAt,
            ...(newer.lastPlayedAt ? { lastPlayedAt: newer.lastPlayedAt } : {})
        };
        merged++;
    }
    return { store: result, added, merged };
}

export async function importArchiveFile(file) {
    if (file.size > ARCHIVE_FILE_MAX_BYTES) {
        await appAlert("Die Datei ist zu groß für ein TimesUp-Archiv.", { title: "Import fehlgeschlagen" });
        return;
    }
    let entries;
    try {
        entries = parseArchiveFile(await file.text());
    } catch (err) {
        await appAlert(err.message, { title: "Import fehlgeschlagen" });
        return;
    }
    if (entries.length === 0) {
        await appAlert("Die Datei enthält keine gespeicherten Spiele.", { title: "Nichts zu importieren" });
        return;
    }
    const { store, added, merged } = mergeArchiveEntries(readArchiveStore(), entries);
    writeArchiveStore(store);
    openArchive();
    const parts = [];
    if (added) parts.push(`${added} ${added === 1 ? "Spiel" : "Spiele"} neu`);
    if (merged) parts.push(`${merged} ${merged === 1 ? "Spiel" : "Spiele"} zusammengeführt`);
    await appAlert(`${parts.join(", ")}. Lade ein Spiel, um mit dieser Gruppe weiterzuspielen.`, { title: "Archiv importiert" });
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
        li.className = "card-choice";
        li._timesupCard = card;
        appendText(li, "span", card.begriff).className = "card-choice-term";
        li.appendChild(document.createTextNode(` - ${card.erklaerung}`));
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