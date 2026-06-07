// === Game State ===
let cardPool = []; // Array of {begriff, erklaerung}
let vetoCountPerPlayer = 0;
let remainingVetos = 0;
let cardsWereShown = false;
let allowCardClick = false;
let playingCards = [];
let showingExplanation = false;
let currentRound = 0;
let totalRounds = 1;
const players = [];
let teams = []; // Array of team arrays instead of teamA/teamB
let currentCardPlayerIndex = 0;
let shuffledCardPool = [];
let playerCardCount = 0;
let cardSelectionTargetCount = 0;
let totalTeams = 2; // Default to 2 teams, can be changed in settings
let activeTeamIndex = 0; // Index of current team (0, 1, 2, etc.)
let activePlayerIndexInTeam = -1; // Player index within current team
let teamTurnOrder = [];
let teamTurnOrderPosition = -1;
let activePlayerIndicesByTeam = [];
let activeArchiveId = null;
let cardLoadStatusText = "Karten werden geladen...";

const ARCHIVE_STORAGE_KEY = "timesup_archive";
const SETTINGS_STORAGE_KEY = "timesup_settings";

function readJsonStore(key, fallback = {}) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (e) {
        return fallback;
    }
}

function writeJsonStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
}

function getSettings() {
    return readJsonStore(SETTINGS_STORAGE_KEY, {});
}

function toPositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function appendText(parent, tagName, text, styles = {}) {
    const el = document.createElement(tagName);
    el.textContent = text;
    Object.assign(el.style, styles);
    parent.appendChild(el);
    return el;
}

function readArchiveStore() {
    return readJsonStore(ARCHIVE_STORAGE_KEY, {});
}

function writeArchiveStore(store) {
    writeJsonStore(ARCHIVE_STORAGE_KEY, store);
}

function getCardKey(card) {
    return String(card?.begriff || "").trim().toLowerCase();
}

function makeArchiveId(createdAt) {
    const stamp = createdAt.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
    return `TU-${stamp}`;
}

function ensureActiveArchive() {
    if (activeArchiveId) return activeArchiveId;

    const store = readArchiveStore();
    const createdAt = new Date();
    const id = makeArchiveId(createdAt);
    store[id] = {
        id,
        createdAt: createdAt.toISOString(),
        players: players.map(p => ({ name: p.name, handicap: !!p.handicap })),
        usedCards: []
    };
    activeArchiveId = id;
    writeArchiveStore(store);
    return id;
}

function getActiveArchiveUsedCardKeys() {
    if (!activeArchiveId) return new Set();
    const archive = readArchiveStore()[activeArchiveId];
    return new Set((archive?.usedCards || []).map(getCardKey).filter(Boolean));
}

function getAvailableCardPoolForArchive() {
    const usedKeys = getActiveArchiveUsedCardKeys();
    return cardPool.filter(card => !usedKeys.has(getCardKey(card)));
}

function savePlayedCardsToActiveArchive() {
    const id = ensureActiveArchive();
    const store = readArchiveStore();
    const archive = store[id];
    if (!archive) return;

    const byKey = new Map((archive.usedCards || []).map(card => [getCardKey(card), card]));
    playingCards.forEach(card => {
        const key = getCardKey(card);
        if (key) byKey.set(key, { begriff: card.begriff, erklaerung: card.erklaerung || "" });
    });
    archive.players = players.map(p => ({ name: p.name, handicap: !!p.handicap }));
    archive.usedCards = [...byKey.values()];
    archive.lastPlayedAt = new Date().toISOString();
    writeArchiveStore(store);
}

function formatArchiveDate(value) {
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

function loadArchiveEntry(archive) {
    players.splice(0, players.length, ...(archive.players || []).map(p => ({ name: p.name, handicap: !!p.handicap })));
    activeArchiveId = archive.id;
    updatePlayerTable();
    saveSettingsToStorage();
    updateKartenStatusText(`Archiv ${archive.id} geladen - ${(archive.usedCards || []).length} Karten gesperrt`);
    alert("Archiv geladen. Die Spieler wurden übernommen. Die Teams können jetzt neu gemischt werden.");
}

function openArchive() {
    const store = readArchiveStore();
    const archives = Object.values(store).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (archives.length === 0) {
        alert("Es gibt noch keine gespeicherten Spiele im Archiv.");
        return;
    }

    const existingOverlay = document.getElementById("archiveOverlay");
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement("div");
    overlay.id = "archiveOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.35)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";

    const box = document.createElement("div");
    box.style.background = "var(--card-bg)";
    box.style.color = "var(--text)";
    box.style.border = "1px solid var(--divider)";
    box.style.borderRadius = "16px";
    box.style.boxShadow = "0 8px 32px rgba(0,0,0,0.18)";
    box.style.padding = "24px";
    box.style.width = "min(92vw, 680px)";
    box.style.maxHeight = "82vh";
    box.style.overflowY = "auto";

    const title = document.createElement("h2");
    title.textContent = "Archiv";
    title.style.margin = "0 0 16px 0";
    title.style.color = "var(--text)";
    box.appendChild(title);

    archives.forEach(archive => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1fr auto auto";
        row.style.gap = "8px";
        row.style.alignItems = "center";
        row.style.padding = "10px 0";
        row.style.borderTop = "1px solid var(--divider)";

        const info = document.createElement("div");
        const names = (archive.players || []).map(p => p.name).join(", ");
        const cardCount = (archive.usedCards || []).length;
        appendText(info, "strong", archive.id || "Unbekanntes Archiv");
        info.appendChild(document.createElement("br"));
        appendText(info, "span", `${formatArchiveDate(archive.createdAt)} | ${cardCount} Karten`, {
            color: "var(--muted)"
        });
        info.appendChild(document.createElement("br"));
        appendText(info, "span", names);

        const loadBtn = document.createElement("button");
        loadBtn.textContent = "Laden";
        loadBtn.style.width = "auto";
        loadBtn.onclick = () => {
            overlay.remove();
            loadArchiveEntry(archive);
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Löschen";
        deleteBtn.style.width = "auto";
        deleteBtn.style.background = "var(--danger)";
        deleteBtn.style.color = "var(--on-accent)";
        deleteBtn.onclick = () => {
            if (!confirm(`Soll der Archiv-Eintrag ${archive.id} wirklich gelöscht werden?`)) return;
            const updatedStore = readArchiveStore();
            delete updatedStore[archive.id];
            writeArchiveStore(updatedStore);
            if (activeArchiveId === archive.id) {
                activeArchiveId = null;
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
    closeBtn.style.marginTop = "18px";
    closeBtn.style.width = "auto";
    closeBtn.className = "secondary";
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// === Load Cards from Excel ===
async function loadKartenFromExcel() {
    const filePath = 'js/db_Karten.xlsx';
    try {
        if (!window.XLSX) {
            throw new Error("XLSX-Bibliothek wurde nicht geladen.");
        }
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Karten-Datei konnte nicht geladen werden (${response.status}).`);
        }
        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        if (!workbook.SheetNames.length) {
            throw new Error("Karten-Datei enthält kein Tabellenblatt.");
        }
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        cardPool = rows
            .filter(row => row[0] && row[1])
            .map(row => ({
                begriff: String(row[0]).trim(),
                erklaerung: String(row[1]).trim()
            }))
            .filter(card => card.begriff && card.erklaerung);

        setCardLoadStatusText(`${cardPool.length} Karten erfolgreich geladen`);
    } catch (err) {
        console.error("Fehler beim Laden:", err);
        cardPool = [];
        setCardLoadStatusText("Fehler beim Laden der Karten.");
    }
}

// === Player Management ===
function addPlayer() {
    const input = document.getElementById("playerInput");
    if (!input) return;
    const name = input.value.trim();
    if (name && !players.some(p => p.name === name)) {
        players.push({ name, handicap: false });
        updatePlayerTable();
    }
    input.value = '';
}

function removePlayer(name) {
    const index = players.findIndex(p => p.name === name);
    if (index !== -1) {
        players.splice(index, 1);
        updatePlayerTable();
    }
}

function toggleHandicap(name, checked) {
    const player = players.find(p => p.name === name);
    if (player) player.handicap = checked;
}

function updatePlayerTable() {
    const tbody = document.getElementById("playerTableBody");
    if (!tbody) return;
    tbody.innerHTML = '';
    players.forEach(p => {
        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.setAttribute("data-label", "Spielername");
        // Make player name bold in a box (theme-aware)
        appendText(tdName, "span", p.name, {
            display: "inline-block",
            fontWeight: "bold",
            background: "var(--card-bg)",
            borderRadius: "8px",
            padding: "4px 12px"
        });
        tr.appendChild(tdName);

        const tdHandicap = document.createElement("td");
        tdHandicap.setAttribute("data-label", "Handicap");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = p.handicap;
        checkbox.onchange = () => toggleHandicap(p.name, checkbox.checked);
        tdHandicap.appendChild(checkbox);
        tr.appendChild(tdHandicap);

        const tdRemove = document.createElement("td");
        tdRemove.setAttribute("data-label", "Entfernen");
        tdRemove.style.textAlign = "center"; // Center the button
        const btn = document.createElement("button");
        btn.textContent = "❌ Entfernen";
        btn.onclick = () => removePlayer(p.name);
        tdRemove.appendChild(btn);
        tr.appendChild(tdRemove);

        tbody.appendChild(tr);
    });
}

// === UI Helpers ===
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(div => div.classList.remove('active'));
    const screen = document.getElementById('screen-' + id);
    if (!screen) return;
    screen.classList.add('active');
    if (id === "start") {
        refreshStartCardStatus();
    }
}

function showTab(tabId) {
    if (tabId === "rules") {
        document.getElementById("tab-rules").classList.remove("hidden");
    }
}

function continueToNext() {
    alert("Hier folgt der nächste Bildschirm…");
}

function getDefaultRuleOptions() {
    return [
        "Nur beschreiben",
        "Nur ein Wort",
        "Pantomime und Geräusche",
        "Nur einsilbig beschreiben"
    ];
}

// === Round Settings ===
function renderRoundSettings() {
    const roundCount = parseInt(document.getElementById("roundCount").value);
    const container = document.getElementById("roundSettingsContainer");
    container.innerHTML = '';

    const defaultRules = [
        "Nur beschreiben",
        "Nur ein Wort",
        "Pantomime und Geräusche"
    ];

    for (let i = 1; i <= roundCount; i++) {
        // Use CSS variables for round backgrounds so they adapt to light/dark themes
        const roundCssVars = ['--round-1','--round-2','--round-3','--round-4','--round-5','--round-6','--round-7','--round-8','--round-9','--round-10'];
        const div = document.createElement("div");
        div.classList.add("round-settings");
        const varName = roundCssVars[i - 1];
        div.style.backgroundColor = varName ? `var(${varName})` : "#f5f5f5";

        const selectedRule = i <= 3 ? defaultRules[i - 1] : "";
        const defaultSkip = (i === 2) ? "yes" : "no";
        const ruleOptions = getDefaultRuleOptions();

        div.innerHTML = `
        <h4>Runde ${i}</h4>
        <label for="rule${i}">Regel</label>
        <select id="rule${i}" onchange="toggleCustomRuleInput(${i}, true)">
          <option value="">-- bitte auswählen --</option>
          ${ruleOptions.map(rule =>
            `<option value="${rule}" ${selectedRule === rule ? "selected" : ""}>${rule}</option>`
        ).join("")}
          <option value="custom">Eigene Regel</option>
        </select>
        <input type="text" id="customRule${i}" class="hidden" placeholder="Eigene Regel eingeben" />
        <label for="timer${i}">Timer (Sekunden)</label>
        <input type="number" id="timer${i}" min="10" value="30" />
        <label for="skipAllowed${i}">Überspringen erlaubt?</label>
        <select id="skipAllowed${i}" onchange="toggleSkipOptions(${i})">
          <option value="no" ${defaultSkip === "no" ? "selected" : ""}>Nein</option>
          <option value="yes" ${defaultSkip === "yes" ? "selected" : ""}>Ja</option>
        </select>
        <div id="skipOptions${i}" class="${defaultSkip === 'yes' ? '' : 'hidden'}">
          <label for="skipLimitType${i}">Limit:</label>
          <select id="skipLimitType${i}" onchange="toggleSkipLimitValue(${i})">
            <option value="unlimited" selected>Unbegrenzt</option>
            <option value="limited">Maximal erlaubt:</option>
          </select>
          <input type="number" id="skipLimitValue${i}" class="hidden" min="1" value="3" />
        </div>
      `;
        container.appendChild(div);
        setTimeout(() => {
            const select = document.getElementById(`skipAllowed${i}`);
            if (select) select.value = defaultSkip;
        }, 0);
    }
}

function toggleSkipOptions(round) {
    const skipAllowed = document.getElementById(`skipAllowed${round}`).value;
    const skipOptions = document.getElementById(`skipOptions${round}`);
    skipOptions.classList.toggle("hidden", skipAllowed !== "yes");
    if (skipAllowed === "yes") {
        document.getElementById(`skipLimitType${round}`).value = "unlimited";
        document.getElementById(`skipLimitValue${round}`).classList.add("hidden");
    } else {
        document.getElementById(`skipLimitType${round}`).value = "unlimited";
        document.getElementById(`skipLimitValue${round}`).value = 3;
        document.getElementById(`skipLimitValue${round}`).classList.add("hidden");
    }
}

function toggleCustomRuleInput(round, focusInput = false) {
    const ruleSelect = document.getElementById(`rule${round}`);
    const customRuleInput = document.getElementById(`customRule${round}`);
    if (!ruleSelect || !customRuleInput) return;

    const isCustomRule = ruleSelect.value === "custom";
    customRuleInput.classList.toggle("hidden", !isCustomRule);
    if (isCustomRule && focusInput) {
        customRuleInput.focus();
    }
}

function toggleSkipLimitValue(round) {
    const type = document.getElementById(`skipLimitType${round}`).value;
    const valueField = document.getElementById(`skipLimitValue${round}`);
    if (type === "limited") {
        valueField.classList.remove("hidden");
        valueField.value = 3;
    } else {
        valueField.classList.add("hidden");
    }
}

// === Settings Management ===
function validateSettingsAndGoBack() {
    const roundCount = parseInt(document.getElementById("roundCount").value);
    for (let i = 1; i <= roundCount; i++) {
        const rule = document.getElementById(`rule${i}`);
        if (!rule || !rule.value || rule.value === "") {
            alert(`⚠️ Bitte wähle eine Regel für Runde ${i}.`);
            return;
        }
        if (rule.value === "custom") {
            const customRule = document.getElementById(`customRule${i}`)?.value.trim();
            if (!customRule) {
                alert(`⚠️ Bitte gib eine eigene Regel für Runde ${i} ein.`);
                return;
            }
        }
    }
    saveSettingsToStorage();
    showScreen("start");
}

function saveSettingsToStorage() {
    const settings = {
        players,
        cardCount: parseInt(document.getElementById("cardCount").value),
        roundCount: parseInt(document.getElementById("roundCount").value),
        teamCount: parseInt(document.getElementById("teamCount").value || 2),
        roundRules: [],
        roundTimer: [],
        roundSkip: [],
        skipLimitType: [],
        skipLimitValue: [],
        vetoCount: parseInt(document.getElementById("vetoCount").value),
        handicapEnabled: document.getElementById("handicapEnabled").value === "yes",
        handicapTime: parseInt(document.getElementById("handicapTime").value || 5),
        punishEnabled: document.getElementById("punishEnabled").value === "yes",
        punishTime: parseInt(document.getElementById("punishTime").value || 3),
        punishPoints: document.getElementById("punishPoints").value
    };
    for (let i = 1; i <= settings.roundCount; i++) {
        const ruleSelect = document.getElementById(`rule${i}`);
        const customRuleInput = document.getElementById(`customRule${i}`);
        const rule = ruleSelect.value === "custom"
            ? (customRuleInput?.value.trim() || "")
            : ruleSelect.value;
        const timer = parseInt(document.getElementById(`timer${i}`).value);
        const skipAllowed = document.getElementById(`skipAllowed${i}`).value.toLowerCase();
        const skipType = document.getElementById(`skipLimitType${i}`).value.toLowerCase();
        const skipValueEl = document.getElementById(`skipLimitValue${i}`);
        let skipLimitValue = 0;
        let skipLimitType = "";
        if (skipAllowed === "yes") {
            if (skipType == "unlimited") {
                skipLimitType = "unlimited";
                skipLimitValue = 1000;
            } else if (skipType === "limited") {
                skipLimitType = "limited";
                skipLimitValue = parseInt(skipValueEl.value || 0);
            }
        } else if (skipAllowed === "no") {
            skipLimitType = "limited";
            skipLimitValue = 0;
        }
        settings.roundRules.push(rule);
        settings.roundTimer.push(timer);
        settings.roundSkip.push(skipAllowed);
        settings.skipLimitType.push(skipLimitType);
        settings.skipLimitValue.push(skipLimitValue);
    }
    writeJsonStore(SETTINGS_STORAGE_KEY, settings);
    // also persist theme separately for quicker access
    const themeSel = document.getElementById('themeSelect');
    if (themeSel) localStorage.setItem('timesup_theme', themeSel.value || 'light');
}

function exitSettings() {
    saveSettingsToStorage();
    showScreen("start");
}

function loadSettingsFromStorage() {
    const settings = getSettings();
    document.getElementById("cardCount").value = settings.cardCount || 40;
    document.getElementById("roundCount").value = settings.roundCount || 3;
    document.getElementById("teamCount").value = settings.teamCount || 2;
    totalTeams = settings.teamCount || 2;
    document.getElementById("vetoCount").value = settings.vetoCount || 1;
    document.getElementById("handicapEnabled").value = settings.handicapEnabled ? "yes" : "no";
    toggleHandicapInput();
    document.getElementById("handicapTime").value = settings.handicapTime || 5;
    document.getElementById("punishEnabled").value = settings.punishEnabled ? "yes" : "no";
    togglePunishOptions();
    document.getElementById("punishTime").value = settings.punishTime || 3;
    document.getElementById("punishPoints").value = settings.punishPoints || "no";
    renderRoundSettings();
    for (let i = 1; i <= (settings.roundCount || 3); i++) {
        const savedRule = settings.roundRules?.[i - 1] || "";
        const ruleSelect = document.getElementById(`rule${i}`);
        const customRuleInput = document.getElementById(`customRule${i}`);
        if (ruleSelect) {
            if (savedRule && !getDefaultRuleOptions().includes(savedRule)) {
                ruleSelect.value = "custom";
                if (customRuleInput) customRuleInput.value = savedRule;
            } else {
                ruleSelect.value = savedRule;
                if (customRuleInput) customRuleInput.value = "";
            }
            toggleCustomRuleInput(i);
        }
        document.getElementById(`timer${i}`).value = settings.roundTimer?.[i - 1] || 60;
        document.getElementById(`skipAllowed${i}`).value = settings.roundSkip?.[i - 1] || "no";
    }
    // load theme into selector and apply
    const storedTheme = localStorage.getItem('timesup_theme') || 'light';
    const themeSel = document.getElementById('themeSelect');
    if (themeSel) themeSel.value = storedTheme;
    applyTheme(storedTheme);
}

function resetAllSettings() {
    document.getElementById("cardCount").value = 40;
    document.getElementById("roundCount").value = 3;
    document.getElementById("teamCount").value = 2;
    document.getElementById("vetoCount").value = 1;
    document.getElementById("handicapEnabled").value = "no";
    toggleHandicapInput();
    document.getElementById("handicapTime").value = 5;
    document.getElementById("punishEnabled").value = "no";
    togglePunishOptions();
    document.getElementById("punishTime").value = 3;
    document.getElementById("punishPoints").value = "no";
    renderRoundSettings();
    const defaultRules = ["Nur beschreiben", "Nur ein Wort", "Pantomime und Geräusche"];
    const defaultTimers = [30, 30, 30];
    const defaultSkips = ["no", "yes", "no"];
    for (let i = 1; i <= 3; i++) {
        document.getElementById(`rule${i}`).value = defaultRules[i - 1] || "";
        const customRuleInput = document.getElementById(`customRule${i}`);
        if (customRuleInput) customRuleInput.value = "";
        toggleCustomRuleInput(i);
        document.getElementById(`timer${i}`).value = defaultTimers[i - 1] || 30;
        document.getElementById(`skipAllowed${i}`).value = defaultSkips[i - 1] || "no";
    }
    try { localStorage.removeItem(SETTINGS_STORAGE_KEY); } catch (e) {}
}

function toggleHandicapInput() {
    const enabled = document.getElementById("handicapEnabled").value;
    const container = document.getElementById("handicapTimeContainer");
    container.classList.toggle("hidden", enabled !== "yes");
}

function togglePunishOptions() {
    const enabled = document.getElementById("punishEnabled").value;
    const container = document.getElementById("punishOptionsContainer");
    container.classList.toggle("hidden", enabled !== "yes");
}

// === Team Management ===
function confirmBeforeContinue() {
    if (players.length === 0) {
        alert("Bitte füge zuerst mindestens einen Spieler hinzu.");
        return;
    }
    const confirmed = confirm("Sind alle Spieler hinzugefügt und alle Einstellungen getroffen?");
    if (confirmed) {
        renderTeamPlayerList();
        showScreen("teamauswahl");
    }
}

function renderTeamPlayerList() {
    const tbody = document.getElementById("teamPlayerTableBody");
    tbody.innerHTML = '';
    players.forEach(p => {
        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.textContent = p.name;
        tr.appendChild(tdName);
        const tdHandicap = document.createElement("td");
        tdHandicap.textContent = p.handicap ? "✔️" : "–";
        tr.appendChild(tdHandicap);
        tbody.appendChild(tr);
    });
}

function assignRandomTeams() {
    const teamCount = parseInt(document.getElementById("teamCount").value || 2);
    totalTeams = teamCount;
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    
    // Initialize teams array
    teams = [];
    for (let i = 0; i < teamCount; i++) {
        teams.push([]);
    }
    
    // Distribute players round-robin to teams
    shuffled.forEach((p, i) => {
        teams[i % teamCount].push(p);
    });
    
    displayTeams();
    showScreen("teamuebersicht");
}

function displayTeams() {
    const container = document.getElementById("teamsContainer");
    if (!container) return;
    const legacyContainer = document.getElementById("teamOverviewLegacy");
    const legacyTeamA = document.getElementById("teamOverviewTeamA");
    const legacyTeamB = document.getElementById("teamOverviewTeamB");
    
    container.innerHTML = '';
    if (legacyTeamA) legacyTeamA.innerHTML = '';
    if (legacyTeamB) legacyTeamB.innerHTML = '';

    if (totalTeams === 2 && legacyContainer && legacyTeamA && legacyTeamB) {
        legacyContainer.style.display = 'flex';
        container.style.display = 'none';

        [legacyTeamA, legacyTeamB].forEach((list, teamIdx) => {
            (teams[teamIdx] || []).forEach(p => {
                const li = document.createElement("li");
                li.textContent = p.name + (p.handicap ? " 🧩" : "");
                li.style.cursor = "pointer";
                li.onclick = () => togglePlayerTeam(p.name, teamIdx);
                list.appendChild(li);
            });
        });
        return;
    }

    if (legacyContainer) legacyContainer.style.display = 'none';
    container.style.display = 'grid';

    const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
    
    teams.forEach((team, teamIdx) => {
        const box = document.createElement("div");
        box.className = "team-overview-card";
        
        const title = document.createElement("h3");
        title.textContent = `${teamEmojis[teamIdx % teamEmojis.length]} Team ${teamIdx + 1}`;
        box.appendChild(title);
        
        const list = document.createElement("ul");
        list.id = `teamList${teamIdx}`;
        
        team.forEach(p => {
            const li = document.createElement("li");
            li.textContent = p.name + (p.handicap ? " 🧩" : "");
            li.onclick = () => togglePlayerTeam(p.name, teamIdx);
            list.appendChild(li);
        });
        
        box.appendChild(list);
        container.appendChild(box);
    });
}

function assignTeamsManually() {
    const teamCount = parseInt(document.getElementById("teamCount").value || 2);
    totalTeams = teamCount;
    
    teams = [];
    for (let i = 0; i < teamCount; i++) {
        teams.push([]);
    }
    teams[0] = [...players];
    
    displayTeams();
    showScreen("teamuebersicht");
}

function togglePlayerTeam(name, fromTeamIdx) {
    // Find player and remove from current team
    const player = teams[fromTeamIdx].find(p => p.name === name);
    if (!player) return;
    
    teams[fromTeamIdx] = teams[fromTeamIdx].filter(p => p.name !== name);
    
    // Find next empty team or next team in rotation
    let targetTeamIdx = -1;
    for (let i = (fromTeamIdx + 1) % totalTeams; i !== fromTeamIdx; i = (i + 1) % totalTeams) {
        targetTeamIdx = i;
        break;
    }
    
    if (targetTeamIdx === -1) targetTeamIdx = (fromTeamIdx + 1) % totalTeams;
    
    teams[targetTeamIdx].push(player);
    displayTeams();
}

// === Card Selection ===
function updateKartenStatusText(text) {
    const el = document.getElementById("kartenStatusText");
    if (el) el.textContent = text;
}

function setCardLoadStatusText(text) {
    cardLoadStatusText = text;
    if (!activeArchiveId) {
        updateKartenStatusText(cardLoadStatusText);
    }
}

function refreshStartCardStatus() {
    if (!activeArchiveId) {
        updateKartenStatusText(cardLoadStatusText);
    }
}

function canStartCardSelection() {
    if (players.length === 0) {
        alert("Bitte füge zuerst mindestens einen Spieler hinzu.");
        return false;
    }
    if (cardPool.length === 0) {
        alert("Es wurden noch keine Karten geladen.");
        return false;
    }
    return true;
}

function startCardSelection(withVeto) {
    if (!canStartCardSelection()) return;
    const totalCards = toPositiveInt(document.getElementById("cardCount")?.value, 40);
    const availableCardPool = getAvailableCardPoolForArchive();
    if (availableCardPool.length === 0) {
        alert("Für diese Archiv-ID sind keine neuen Karten mehr verfügbar.");
        return;
    }
    cardSelectionTargetCount = Math.min(totalCards, availableCardPool.length);
    const cardsPerPlayer = Math.floor(cardSelectionTargetCount / players.length);
    if (cardSelectionTargetCount < totalCards) {
        alert(`Für diese Archiv-ID sind nur noch ${cardSelectionTargetCount} neue Karten verfügbar.`);
    }
    shuffledCardPool = [...availableCardPool].sort(() => Math.random() - 0.5);
    playingCards = [];
    playerCardCount = cardsPerPlayer;
    currentCardPlayerIndex = 0;
    const settings = getSettings();
    vetoCountPerPlayer = settings.vetoCount || 1;
    document.getElementById("cardSelectionPlayerName").textContent = players[0].name;
    document.getElementById("cardSelectionInfo").textContent = "Bitte klicken, um die Kartenauswahl zu starten!";
    document.getElementById("cardSelectionList").innerHTML = "";
    document.getElementById("vetoInfoText").textContent = "";
    document.getElementById("cardDoneButton").style.display = "none";
    cardsWereShown = false;
    allowCardClick = true;
    showScreen("kartenauswahl");
}

function startCardSelectionWithoutVeto() {
    if (!canStartCardSelection()) return;
    const totalCards = toPositiveInt(document.getElementById("cardCount")?.value, 40);
    const availableCardPool = getAvailableCardPoolForArchive();
    if (availableCardPool.length === 0) {
        alert("Für diese Archiv-ID sind keine neuen Karten mehr verfügbar.");
        return;
    }
    cardSelectionTargetCount = Math.min(totalCards, availableCardPool.length);
    if (cardSelectionTargetCount < totalCards) {
        alert(`Für diese Archiv-ID sind nur noch ${cardSelectionTargetCount} neue Karten verfügbar.`);
    }
    shuffledCardPool = [...availableCardPool].sort(() => Math.random() - 0.5);
    playingCards = shuffledCardPool.slice(0, cardSelectionTargetCount);

    // Layout-Elemente holen
    const playerLabel = document.getElementById("cardSelectionPlayerName");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const ul = document.getElementById("cardSelectionList");
    const doneBtn = document.getElementById("cardDoneButton");
    const startBtn = document.getElementById("startGameOverviewButton");

    // Layout wie bei showScreen("kartenauswahl")
    playerLabel.textContent = "✓ Fertig!";
    info.textContent = `${playingCards.length} Karten wurden zufällig ausgewählt.`;
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

function handleCardSelectionClick() {
    if (cardsWereShown || !allowCardClick) return;
    const ul = document.getElementById("cardSelectionList");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const cardsForPlayer = shuffledCardPool.splice(0, playerCardCount);
    remainingVetos = vetoCountPerPlayer;
    cardsWereShown = true;
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

function updateVetoDisplay() {
    const el = document.getElementById("vetoInfoText");
    if (el) {
        el.textContent = `Du hast ${remainingVetos} Veto${remainingVetos !== 1 ? 's' : ''}`;
    }
}

function handleCardVeto(listItem, index) {
    if (remainingVetos <= 0) {
        alert("Du hast keine Vetos mehr.");
        return;
    }
    const confirmVeto = confirm("Willst du wirklich ein Veto verwenden, um diese Karte auszutauschen?");
    if (!confirmVeto) return;
    if (shuffledCardPool.length === 0) {
        alert("Es sind keine Karten mehr verfügbar.");
        return;
    }
    const newCard = shuffledCardPool.shift();
    listItem._timesupCard = newCard;
    listItem.textContent = `${newCard.begriff} - ${newCard.erklaerung}`;
    listItem.onclick = null;
    listItem.style.opacity = "0.6";
    listItem.style.pointerEvents = "none";
    remainingVetos--;
    updateVetoDisplay();
    document.getElementById("vetoInfoText").textContent =
        `Du hast ${remainingVetos} Veto${remainingVetos !== 1 ? 's' : ''}`;
}

function handleCardSelectionDone() {
    const startOverviewButton = document.getElementById("startGameOverviewButton");
    if (startOverviewButton) startOverviewButton.style.display = "none";
    if (remainingVetos > 0) {
        const confirmFinish = confirm(`Du hast noch ${remainingVetos} Veto${remainingVetos !== 1 ? 's' : ''} übrig. Möchtest du wirklich fortfahren?`);
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
            playingCards.push({
                begriff: selectedCard.begriff,
                erklaerung: selectedCard.erklaerung || ""
            });
        }
    }
    currentCardPlayerIndex++;
    if (currentCardPlayerIndex >= players.length) {
        const targetCount = cardSelectionTargetCount || toPositiveInt(document.getElementById("cardCount")?.value, 40);
        const fehlendeKarten = Math.max(0, targetCount - playingCards.length);
        for (let i = 0; i < fehlendeKarten && shuffledCardPool.length > 0; i++) {
            const card = shuffledCardPool.shift();
            playingCards.push({
                begriff: card.begriff,
                erklaerung: card.erklaerung
            });
        }
        playerLabel.textContent = "✓ Fertig!";
        info.textContent = `Alle Spieler haben ihre Karten. Gesamt: ${playingCards.length} Karten. Davon ${fehlendeKarten} automatisch ergänzt.`;
        info.style.display = "block";
        info.style.cursor = "not-allowed";
        info.style.pointerEvents = "none";
        vetoInfo.textContent = "";
        vetoInfo.style.display = "none";
        ul.innerHTML = "";
        doneBtn.style.display = "none";
        allowCardClick = false;
        if (startOverviewButton) startOverviewButton.style.display = "inline-block";
        return;
    }
    playerLabel.textContent = players[currentCardPlayerIndex].name;
    info.textContent = "Bitte klicken, um die Kartenauswahl zu starten!";
    info.style.display = "block";
    vetoInfo.textContent = "";
    ul.innerHTML = "";
    doneBtn.style.display = "none";
    cardsWereShown = false;
    allowCardClick = false;
    setTimeout(() => { allowCardClick = true; }, 100);
}


// === Game Overview ===
function prepareGameOverview() {
    const settings = getSettings();
    const rounds = parseInt(settings.roundCount || 3);
    const teamCount = parseInt(settings.teamCount || 2);
    totalTeams = teamCount;
    
    const roundEl = document.getElementById("roundSummary");
    if (roundEl) {
        roundEl.textContent = `Es werden ${rounds} Runden mit ${teamCount} Teams gespielt. Bisher 0 abgeschlossen.`;
    }
    const general = document.getElementById("generalRulesList");
    if (general) {
        general.innerHTML = "";
        appendText(general, "li", `Anzahl Karten: ${settings.cardCount || 40}`);
        appendText(general, "li", `Spielrunden: ${rounds}`);
        appendText(general, "li", `Teams: ${teamCount}`);
        appendText(general, "li", `Handicap: ${settings.handicapEnabled ? 'Ja, +' + (settings.handicapTime || 5) + 's' : 'Nein'}`);
        if (settings.punishEnabled) {
            appendText(general, "li", `Regelmissachtung: Ja | Strafzeit: ${settings.punishTime || 3}s | Punktabzug: ${settings.punishPoints || 'Nein'}`);
        } else {
            appendText(general, "li", "Regelmissachtung: Nein");
        }
    }
    const roundWrap = document.getElementById("overviewRoundSettings");
    if (roundWrap) {
        roundWrap.innerHTML = "";
        for (let i = 0; i < rounds; i++) {
            const rule = settings.roundRules?.[i] || "-";
            const timer = settings.roundTimer?.[i] || "?";
            const skip = settings.roundSkip?.[i] || "Nein";
            const box = document.createElement("div");
            // Use theme-aware panel/card backgrounds; keep round accents optional
            box.style.border = `2px solid var(--divider)`;
            box.style.background = `var(--panel)`;
            box.style.borderRadius = "12px";
            box.style.padding = "10px";
            box.style.marginBottom = "10px";
            box.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
            box.style.color = "var(--text)";
            appendText(box, "strong", `Runde ${i + 1}`);
            box.appendChild(document.createElement("br"));
            box.appendChild(document.createTextNode(`Regel: ${rule}`));
            box.appendChild(document.createElement("br"));
            box.appendChild(document.createTextNode(`Zeit: ${timer} Sekunden`));
            box.appendChild(document.createElement("br"));
            box.appendChild(document.createTextNode(`Überspringen: ${skip}`));
            roundWrap.appendChild(box);
        }
    }
    
    // Display all teams - new layout for 3+ teams
    const overviewTeamsContainer = document.getElementById("overviewTeamsContainer");
    const teamsDiv = document.querySelector('#screen-spieluebersicht .teams');
    
    if (totalTeams > 2) {
        // Show new multi-team display and hide old 2-team display
        if (overviewTeamsContainer) {
            overviewTeamsContainer.style.display = 'grid';
            overviewTeamsContainer.innerHTML = '';
            const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
            
            teams.forEach((team, idx) => {
                const box = document.createElement("div");
                box.className = "team-overview-card";
                
                const title = document.createElement("h3");
                title.textContent = `${teamEmojis[idx % teamEmojis.length]} Team ${idx + 1} – 0 Punkte`;
                box.appendChild(title);
                
                const list = document.createElement("ul");
                
                team.forEach(player => {
                    const li = document.createElement("li");
                    li.textContent = player.name + (player.handicap ? " 🧩" : "");
                    list.appendChild(li);
                });
                
                box.appendChild(list);
                overviewTeamsContainer.appendChild(box);
            });
        }
        if (teamsDiv) teamsDiv.style.display = 'none';
    } else {
        // Show old 2-team display and hide new multi-team display
        if (overviewTeamsContainer) overviewTeamsContainer.style.display = 'none';
        if (teamsDiv) teamsDiv.style.display = 'flex';
        
        // Fill legacy 2-team display
        const listA = document.getElementById("overviewTeamA");
        const listB = document.getElementById("overviewTeamB");
        if (listA && teams[0]) {
            listA.innerHTML = "";
            teams[0].forEach(p => {
                const li = document.createElement("li");
                li.textContent = p.name + (p.handicap ? " 🧩" : "");
                listA.appendChild(li);
            });
        }
        if (listB && teams[1]) {
            listB.innerHTML = "";
            teams[1].forEach(p => {
                const li = document.createElement("li");
                li.textContent = p.name + (p.handicap ? " 🧩" : "");
                listB.appendChild(li);
            });
        }
        const teamATitle = document.getElementById("teamATitle");
        const teamBTitle = document.getElementById("teamBTitle");
        if (teamATitle) teamATitle.textContent = "🔴 Team 1 – 0 Punkte";
        if (teamBTitle) teamBTitle.textContent = "🟢 Team 2 – 0 Punkte";
    }
    showScreen("spieluebersicht");
}

// === Game Logic ===
let timer;
let remainingTime = 0;
let isTimerRunning = false; // guard to prevent duplicate intervals
// short tick/beep for last countdown seconds
let tickAudio = null;
let endAudio = null;
let audiotime = false;
let audioUnlocked = false;

function prepareAudioElement(audio) {
    if (!audio) return null;
    audio.preload = 'auto';
    audio.setAttribute('preload', 'auto');
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    try { audio.load(); } catch (e) {}
    return audio;
}

try {
    // prefer a short ticking/pip audio for the last seconds
    tickAudio = prepareAudioElement(new Audio('assets/timer5.m4a'));
    tickAudio.volume = 0.7;
    tickAudio.addEventListener('ended', () => { audiotime = false; });
} catch (e) { tickAudio = null; }
try {
    const el = document.getElementById('alarm-sound');
    if (el && el.tagName === 'AUDIO') {
        endAudio = prepareAudioElement(el);
    } else {
        endAudio = prepareAudioElement(new Audio('assets/Alarm.m4a'));
    }
    try { endAudio.volume = 0.85; } catch (e) {}
} catch (e) { endAudio = null; }

function unlockSingleAudio(audio) {
    if (!audio) return Promise.resolve(true);

    const previousVolume = audio.volume;
    audio.muted = false;
    try { audio.volume = Math.min(previousVolume || 1, 0.05); } catch (e) {}
    try { audio.currentTime = 0; } catch (e) {}

    let playPromise;
    try {
        playPromise = audio.play();
    } catch (e) {
        try { audio.volume = previousVolume; } catch (err) {}
        return Promise.resolve(false);
    }

    return Promise.resolve(playPromise)
        .then(() => true)
        .catch(() => false)
        .then(success => {
            try { audio.pause(); } catch (e) {}
            try { audio.currentTime = 0; } catch (e) {}
            try { audio.volume = previousVolume; } catch (e) {}
            return success;
        });
}

function unlockGameAudio() {
    if (audioUnlocked) return Promise.resolve();

    return Promise.all([
        unlockSingleAudio(tickAudio),
        unlockSingleAudio(endAudio)
    ]).then(results => {
        audioUnlocked = results.every(Boolean);
    });
}

function playTick() {
    if (!tickAudio) return;
    if (audiotime) return; // prevent overlapping ticks if one is still playing
    try {
        tickAudio.currentTime = 0;
        const p = tickAudio.play();
        if (p && p.catch) p.catch(() => { audiotime = false; });
        audiotime = true;
    } catch (e) { }
}

function stopTick() {
    if (!tickAudio) return;

    try {
        tickAudio.pause();
        tickAudio.currentTime = 0;
    } catch (e) { }
    audiotime = false;
}

function playEndAlarm() {
    if (!endAudio) return;
    try {
        endAudio.currentTime = 0;
        const p = endAudio.play();
        if (p && p.catch) p.catch(() => {});
    } catch (e) { }
}
let displayedCards = [];
let skipCounter = 0;
let isPenaltyActive = false;
let totalPoints = []; // Array of points per team [team0_points, team1_points, ...]
let currentCards = [];
let currentCard = null;
let correctCards = []; // Array of arrays: [team0_cards, team1_cards, ...]
let usedCardsThisTurn = [];
let teamMistakes = []; // Array of mistakes per team
let activePlayer = null;

function shuffleArray(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function buildTeamTurnOrder() {
    const groupedBySize = new Map();

    teams.forEach((team, index) => {
        if (!Array.isArray(team) || team.length === 0) return;
        if (!groupedBySize.has(team.length)) {
            groupedBySize.set(team.length, []);
        }
        groupedBySize.get(team.length).push(index);
    });

    return [...groupedBySize.keys()]
        .sort((a, b) => a - b)
        .flatMap(size => shuffleArray(groupedBySize.get(size)));
}

function startGame() {
    if (playingCards.length === 0) {
        alert("Bitte wähle zuerst Karten aus.");
        return;
    }
    if (!teams.some(team => Array.isArray(team) && team.length > 0)) {
        alert("Bitte teile zuerst Teams ein.");
        return;
    }
    ensureActiveArchive();
    const settings = getSettings();
    totalRounds = parseInt(settings.roundCount || 3);
    totalTeams = parseInt(settings.teamCount || 2);
    currentRound = 0;
    currentCards = [...playingCards];
    
    // Initialize points and correctCards arrays for all teams
    totalPoints = Array(totalTeams).fill(0);
    correctCards = Array(totalTeams).fill(null).map(() => []);
    teamMistakes = Array(totalTeams).fill(0);
    
    teamTurnOrder = buildTeamTurnOrder();
    teamTurnOrderPosition = -1;
    activePlayerIndicesByTeam = Array(totalTeams).fill(-1);
    activePlayerIndexInTeam = -1;
    setNextPlayer();
    
    showStartRoundScreen();
}

function showStartRoundScreen() {
    if (!activePlayer) {
        setNextPlayer();
    }
    if (!activePlayer) {
        alert("Es ist kein aktiver Spieler verfügbar. Bitte prüfe die Teams.");
        showScreen("teamuebersicht");
        return;
    }
    
    document.getElementById("roundPlayerName").textContent = activePlayer.name;
    const teamEl = document.getElementById("roundPlayerTeam");
    teamEl.textContent = `Team ${activeTeamIndex + 1}`;
    const startBtn = document.getElementById("startRoundBtn");
    const settings = getSettings();
    const roundRule = settings.roundRules?.[currentRound] || "-";
    const roundTime = settings.roundTimer?.[currentRound] || 60;
    const roundSkip = (settings.roundSkip?.[currentRound] || "no").toLowerCase() === "yes" ? "Ja" : "Nein";
    const timeEl = document.getElementById("roundStartTime");
    const ruleEl = document.getElementById("roundStartRule");
    const skipEl = document.getElementById("roundStartSkip");
    if (timeEl) timeEl.textContent = `Zeit: ${roundTime}s`;
    if (ruleEl) ruleEl.textContent = `Regel: ${roundRule}`;
    if (skipEl) skipEl.textContent = `Überspringen: ${roundSkip}`;
    
    // Generate team colors dynamically
    const teamColors = ['#ff7675', '#00b894', '#3498db', '#f39c12', '#9b59b6', '#e74c3c', '#1abc9c', '#34495e'];
    const color = teamColors[activeTeamIndex % teamColors.length];
    
    teamEl.style.background = `linear-gradient(90deg, rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},0.12) 60%, var(--panel) 100%)`;
    teamEl.style.color = color;
    document.getElementById('roundBorderWrapper').style.borderColor = color;
    if (startBtn) startBtn.style.background = `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`;
    
    showScreen("roundstart");
}

function startRoundTimer() {
    // prevent duplicate starts
    if (isTimerRunning) return;
    // mark as running immediately to prevent re-entrant starts
    isTimerRunning = true;
    // ensure any existing timer is cleared to avoid double intervals
    try { if (timer) { clearInterval(timer); timer = undefined; } } catch (e) {}
    // disable start button to avoid double start
    try { const sb = document.getElementById('startRoundBtn'); if (sb) sb.disabled = true; } catch (e) {}
    const settings = getSettings();
    const roundIndex = currentRound;
    let baseTime = parseInt(settings.roundTimer?.[roundIndex] || 60);
    if (settings.handicapEnabled && activePlayer.handicap) {
        baseTime += parseInt(settings.handicapTime || 5);
    }
    remainingTime = baseTime;
    displayedCards = [];
    skipCounter = 0;
    document.getElementById("playRoundPlayer").textContent = activePlayer.name;
    document.getElementById("playRoundTeam").textContent = `Team ${activeTeamIndex + 1}`;
    document.getElementById("timerDisplay").textContent = `${remainingTime}s`;
    showScreen("play");
    timer = setInterval(() => {
        remainingTime--;
        document.getElementById("timerDisplay").textContent = `${remainingTime}s`;
        // play a short tick for the last 5 seconds
        if (remainingTime > 0 && remainingTime <= 5) {
            playTick();
        }
        if (remainingTime <= 0) {
            clearInterval(timer);
            timer = undefined;
            isTimerRunning = false;
            try { const sb = document.getElementById('startRoundBtn'); if (sb) sb.disabled = false; } catch (e) {}
            // play final alarm sound and then show guessed cards
            try { playEndAlarm(); } catch (e) {}
            stopTick();
            showGuessedCardsAfterTimer();
        }
    }, 1000);
    isTimerRunning = true;
    showNextCard();
}

function showNextCard() {
    const available = currentCards.filter(card => !displayedCards.includes(card.begriff));
    if (available.length === 0) {
        document.getElementById("cardTerm").textContent = "🔄 Keine weiteren Karten";
        document.getElementById("cardExplanation").style.display = "none";
        showGuessedCardsAfterTimer(); // <--- Hier statt endRound()
        return;
    }
    const next = available[Math.floor(Math.random() * available.length)];
    currentCard = next;
    displayedCards.push(next.begriff);
    document.getElementById("cardTerm").textContent = currentCard.begriff;
    document.getElementById("cardExplanation").textContent = currentCard.erklaerung || "";
    document.getElementById("cardExplanation").style.display = "none";
    showingExplanation = false;
    setActionButtonsEnabled(true);
    updateSkipButtonState();
}

function handleCorrect() {
    if (!currentCard) return;
    correctCards[activeTeamIndex].push(currentCard);
    currentCards = currentCards.filter(card => card.begriff !== currentCard.begriff);
    showingExplanation = false;
    showNextCard();
}

function handleSkip() {
    if (!currentCard) return;
    const settings = getSettings();
    const roundIndex = currentRound;
    const skipSetting = settings.roundSkip?.[roundIndex];
    const skipAllowed = skipSetting === "yes";
    if (!skipAllowed) return;
    if (skipSetting === "yes") {
        const maxSkips = parseInt(settings.skipLimitValue?.[roundIndex] || 100);
        if (skipCounter >= maxSkips) return;
    }
    displayedCards.push(currentCard.begriff);
    skipCounter++;
    showNextCard();
}

function handleMistake() {
    if (!currentCard) return;
    const settings = getSettings();
    if (isPenaltyActive) return;
    teamMistakes[activeTeamIndex] = (teamMistakes[activeTeamIndex] || 0) + 1;
    displayedCards.push(currentCard.begriff);
    if (settings.punishEnabled) {
        const delay = parseInt(settings.punishTime || 3);
        isPenaltyActive = true;
        document.getElementById("cardTerm").textContent = "⏱️ Strafzeit…";
        setActionButtonsEnabled(false);
        setTimeout(() => {
            isPenaltyActive = false;
            showNextCard();
        }, delay * 1000);
    } else {
        showNextCard();
    }
}

function updateSkipButtonState() {
    const settings = getSettings();
    const roundIndex = currentRound;
    const skipSetting = (settings.roundSkip?.[roundIndex] || "no").toLowerCase();
    const skipBtn = document.getElementById("btnSkip");
    if (skipSetting === "no") {
        skipBtn.disabled = true;
        skipBtn.style.background = "var(--panel)";
        skipBtn.style.color = "var(--muted)";
        return;
    }
    if (skipSetting === "yes") {
        const maxSkips = parseInt(settings.skipLimitValue?.[roundIndex] || 100);
        if (skipCounter >= maxSkips) {
            skipBtn.disabled = true;
            skipBtn.style.background = "var(--panel)";
            skipBtn.style.color = "var(--muted)";
            return;
        }
    }
    skipBtn.disabled = false;
    skipBtn.style.background = "var(--accent-c)";
    skipBtn.style.color = "var(--accent-c-text)";
}

function toggleExplanation() {
    if (!currentCard) return;
    const explanationEl = document.getElementById("cardExplanation");
    showingExplanation = !showingExplanation;
    explanationEl.style.display = showingExplanation ? "block" : "none";
    const cardTip = document.getElementById("cardTip");
    cardTip.style.display = showingExplanation ? "none" : "block"; 
}

function setNextPlayer() {
    if (teamTurnOrder.length === 0) {
        teamTurnOrder = buildTeamTurnOrder();
        teamTurnOrderPosition = -1;
    }

    if (teamTurnOrder.length === 0) {
        activePlayer = null;
        return;
    }

    teamTurnOrderPosition = (teamTurnOrderPosition + 1) % teamTurnOrder.length;
    activeTeamIndex = teamTurnOrder[teamTurnOrderPosition];
    
    const currentTeam = teams[activeTeamIndex];
    if (!currentTeam || currentTeam.length === 0) {
        activePlayer = null;
        return;
    }
    
    if (!Array.isArray(activePlayerIndicesByTeam) || activePlayerIndicesByTeam.length < totalTeams) {
        activePlayerIndicesByTeam = Array(totalTeams).fill(-1);
    }

    activePlayerIndexInTeam = ((activePlayerIndicesByTeam[activeTeamIndex] ?? -1) + 1) % currentTeam.length;
    activePlayerIndicesByTeam[activeTeamIndex] = activePlayerIndexInTeam;
    activePlayer = currentTeam[activePlayerIndexInTeam];
}

function endRound() {
    try { if (timer) { clearInterval(timer); timer = undefined; } } catch (e) {}
    isTimerRunning = false;
    if (currentCards.length > 0) {
        setNextPlayer();
        showStartRoundScreen();
    } else {
        showRoundStats();
    }
}

function showRoundStats() {
    document.getElementById("statsRoundNumber").textContent = currentRound + 1;
    
    // Update total points and calculate points for this round
    let totalPointsThisRound = 0;
    correctCards.forEach((teamCards, idx) => {
        const teamPoints = teamCards.length;
        totalPoints[idx] += teamPoints;
        totalPointsThisRound += teamPoints;
    });
    
    // Update stats display - new layout for 3+ teams
    const statsContainer = document.getElementById("statsContainer");
    const statsOldTeamsDiv = document.querySelector('#screen-roundstats > div:nth-child(2)');
    
    if (totalTeams > 2) {
        // Show new multi-team display and hide old 2-team display
        if (statsContainer) {
            statsContainer.style.display = 'grid';
            statsContainer.innerHTML = '';
            const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
            
            teams.forEach((team, idx) => {
                const box = document.createElement("div");
                box.className = "team-overview-card";
                
                const title = document.createElement("h3");
                title.textContent = `${teamEmojis[idx % teamEmojis.length]} Team ${idx + 1}`;
                box.appendChild(title);
                
                const points = document.createElement("p");
                points.textContent = `Punkte: ${totalPoints[idx]}`;
                points.style.margin = "0 0 6px 0";
                points.style.fontWeight = "bold";
                points.style.color = "var(--text)";
                box.appendChild(points);
                
                const list = document.createElement("ul");
                
                team.forEach(player => {
                    const li = document.createElement("li");
                    li.textContent = player.name;
                    list.appendChild(li);
                });
                
                box.appendChild(list);
                statsContainer.appendChild(box);
            });
        }
        if (statsOldTeamsDiv) statsOldTeamsDiv.style.display = 'none';
    } else {
        // Show old 2-team display and hide new multi-team display
        if (statsContainer) statsContainer.style.display = 'none';
        if (statsOldTeamsDiv) statsOldTeamsDiv.style.display = 'flex';
        
        // Legacy 2-team display
        const statsTeamAList = document.getElementById("statsTeamAList");
        const statsTeamBList = document.getElementById("statsTeamBList");
        if (statsTeamAList) {
            statsTeamAList.innerHTML = "";
            if (teams[0]) {
                teams[0].forEach(player => {
                    const li = document.createElement("li");
                    li.textContent = player.name || player;
                    statsTeamAList.appendChild(li);
                });
            }
        }
        if (statsTeamBList) {
            statsTeamBList.innerHTML = "";
            if (teams[1]) {
                teams[1].forEach(player => {
                    const li = document.createElement("li");
                    li.textContent = player.name || player;
                    statsTeamBList.appendChild(li);
                });
            }
        }
        
        if (totalPoints.length >= 2) {
            const pointsTeamAEl = document.getElementById("pointsTeamA");
            const pointsTeamBEl = document.getElementById("pointsTeamB");
            if (pointsTeamAEl) pointsTeamAEl.textContent = totalPoints[0];
            if (pointsTeamBEl) pointsTeamBEl.textContent = totalPoints[1];
        }
    }

    showScreen("roundstats");
}

function nextGameRound() {
    const settings = getSettings();
    currentRound++;
    if (currentRound >= totalRounds) {
        showFinalScreen();
        return;
    }
    currentCards = [...playingCards];
    displayedCards = [];
    correctCards = Array(totalTeams).fill(null).map(() => []);
    teamMistakes = Array(totalTeams).fill(0);
    skipCounter = 0;
    setNextPlayer();
    showStartRoundScreen();
}

function showFinalScreen() {
    savePlayedCardsToActiveArchive();
    const container = document.getElementById("finalTeamsContainer");
    const twoTeamContainer = document.getElementById("finalTwoTeamContainer");
    const maxPoints = totalPoints.length ? Math.max(...totalPoints) : 0;
    const winningTeamIndexes = new Set(totalPoints
        .map((points, index) => points === maxPoints ? index : -1)
        .filter(index => index !== -1));

    if (totalTeams > 2 && container) {
        if (twoTeamContainer) twoTeamContainer.style.display = 'none';
        container.style.display = 'grid';
        container.innerHTML = '';
        const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
        
        teams.forEach((team, idx) => {
            const box = document.createElement("div");
            box.className = "team-overview-card";
            if (winningTeamIndexes.has(idx)) {
                box.classList.add("winner-team");
            }
            
            const title = document.createElement("h3");
            title.textContent = `${teamEmojis[idx % teamEmojis.length]} Team ${idx + 1}`;
            box.appendChild(title);
            
            const points = document.createElement("p");
            points.textContent = `Punkte: ${totalPoints[idx]}`;
            points.style.margin = "0 0 6px 0";
            points.style.fontWeight = "bold";
            points.style.fontSize = "1.3rem";
            points.style.color = "var(--text)";
            box.appendChild(points);
            
            const list = document.createElement("ul");
            
            team.forEach(player => {
                const li = document.createElement("li");
                li.textContent = player.name + (player.handicap ? " 🧩" : "");
                list.appendChild(li);
            });
            
            box.appendChild(list);
            container.appendChild(box);
        });
    } else if (container) {
        container.style.display = 'none';
    }
    
    // Legacy 2-team display only
    if (totalTeams === 2) {
        if (twoTeamContainer) twoTeamContainer.style.display = 'flex';
        const finalTeamACard = document.getElementById("finalTeamACard");
        const finalTeamBCard = document.getElementById("finalTeamBCard");
        if (finalTeamACard) finalTeamACard.classList.toggle("winner-team", winningTeamIndexes.has(0));
        if (finalTeamBCard) finalTeamBCard.classList.toggle("winner-team", winningTeamIndexes.has(1));
        const finalTeamA = document.getElementById("finalTeamA");
        const finalTeamB = document.getElementById("finalTeamB");
        if (finalTeamA && teams[0]) {
            finalTeamA.innerHTML = "";
            teams[0].forEach(player => {
                const row = document.createElement("tr");
                const nameCell = document.createElement("td");
                nameCell.textContent = player.name;
                nameCell.style.padding = "4px 12px";
                const handicapCell = document.createElement("td");
                handicapCell.textContent = player.handicap ? "✓" : "";
                handicapCell.style.textAlign = "center";
                row.appendChild(nameCell);
                row.appendChild(handicapCell);
                finalTeamA.appendChild(row);
            });
        }
        if (finalTeamB && teams[1]) {
            finalTeamB.innerHTML = "";
            teams[1].forEach(player => {
                const row = document.createElement("tr");
                const nameCell = document.createElement("td");
                nameCell.textContent = player.name;
                nameCell.style.padding = "4px 12px";
                const handicapCell = document.createElement("td");
                handicapCell.textContent = player.handicap ? "✓" : "";
                handicapCell.style.textAlign = "center";
                row.appendChild(nameCell);
                row.appendChild(handicapCell);
                finalTeamB.appendChild(row);
            });
        }
        
        // Update total points display
        if (totalPoints[0] !== undefined) {
            const finalPointsA = document.getElementById("finalPointsA");
            if (finalPointsA) finalPointsA.textContent = totalPoints[0];
        }
        if (totalPoints[1] !== undefined) {
            const finalPointsB = document.getElementById("finalPointsB");
            if (finalPointsB) finalPointsB.textContent = totalPoints[1];
        }
    }
    
    showScreen("end");
}

function setActionButtonsEnabled(enabled) {
    const correctButton = document.getElementById("btnCorrect");
    const mistakeButton = document.getElementById("btnMistake");
    if (correctButton) correctButton.disabled = !enabled;
    if (mistakeButton) mistakeButton.disabled = !enabled;
}

function confirmStartRound() {
    if (confirm("Bist du bereit, deinen Timer zu starten?\nDeine Zeit beginnt sofort.")) {
        unlockGameAudio();
        startRoundTimer();
    }
}

// === Pause Game ===
function pauseGame() {
    try { if (timer) { clearInterval(timer); timer = undefined; } } catch (e) {}
    isTimerRunning = false;

    // Erstelle Overlay
    let pauseOverlay = document.getElementById("pauseOverlay");
    if (!pauseOverlay) {
        pauseOverlay = document.createElement("div");
        pauseOverlay.id = "pauseOverlay";
        pauseOverlay.style.position = "fixed";
        pauseOverlay.style.top = "0";
        pauseOverlay.style.left = "0";
        pauseOverlay.style.width = "100vw";
        pauseOverlay.style.height = "100vh";
        pauseOverlay.style.background = "rgba(0,0,0,0.35)";
        pauseOverlay.style.display = "flex";
        pauseOverlay.style.flexDirection = "column";
        pauseOverlay.style.alignItems = "center";
        pauseOverlay.style.justifyContent = "center";
        pauseOverlay.style.zIndex = "9999";

    const box = document.createElement("div");
    box.style.background = "var(--card-bg)";
        box.style.padding = "36px 32px";
        box.style.borderRadius = "18px";
        box.style.boxShadow = "0 4px 24px #636e7233";
        box.style.display = "flex";
        box.style.flexDirection = "column";
        box.style.alignItems = "center";
        box.style.gap = "24px";
        box.style.minWidth = "260px";
        box.style.width = "80vw";           // <--- NEU: 80% der Viewport-Breite
        box.style.maxWidth = "600px";       // <--- Optional: Maximalbreite für große Bildschirme

        const title = document.createElement("h2");
        title.textContent = "⏸️ Pause";
        title.style.margin = "0 0 12px 0";
        title.style.fontSize = "2rem";
    title.style.color = "var(--muted)";
        box.appendChild(title);

        const btnContinue = document.createElement("button");
        btnContinue.textContent = "▶️ Weiter";
        btnContinue.style.margin = "0 0 8px 0";
        btnContinue.style.fontSize = "1.3rem";
        btnContinue.style.padding = "12px 32px";
        btnContinue.style.borderRadius = "12px";
    btnContinue.style.background = "var(--primary)";
    btnContinue.style.color = "var(--on-accent)";
        btnContinue.style.border = "none";
        btnContinue.style.cursor = "pointer";
        btnContinue.onclick = function () {
            document.body.removeChild(pauseOverlay);
            resumeTimer();
        };
        box.appendChild(btnContinue);

        const btnPlus3 = document.createElement("button");
        btnPlus3.textContent = "+3";
        btnPlus3.style.fontSize = "1.3rem";
        btnPlus3.style.padding = "12px 32px";
        btnPlus3.style.borderRadius = "12px";
    btnPlus3.style.background = "linear-gradient(90deg, var(--accent-b) 0%, #55efc4 100%)";
    btnPlus3.style.color = "var(--on-accent)";
        btnPlus3.style.border = "none";
        btnPlus3.style.cursor = "pointer";
        btnPlus3.onclick = function () {
            remainingTime += 3;
            document.getElementById("timerDisplay").textContent = `${remainingTime}s`;
            document.body.removeChild(pauseOverlay);
            resumeTimer();
        };
        box.appendChild(btnPlus3);

        pauseOverlay.appendChild(box);
        document.body.appendChild(pauseOverlay);
    }
}

// Hilfsfunktion zum Fortsetzen des Timers
function resumeTimer() {
    // prevent duplicate starts
    if (isTimerRunning) return;
    // mark as running immediately to prevent re-entrant starts
    isTimerRunning = true;
    // ensure no duplicate timer
    try { if (timer) { clearInterval(timer); timer = undefined; } } catch (e) {}
    timer = setInterval(() => {
        remainingTime--;
        document.getElementById("timerDisplay").textContent = `${remainingTime}s`;
        // play a short tick for the last 5 seconds
        if (remainingTime > 0 && remainingTime <= 5) {
            playTick();
        }
        if (remainingTime <= 0) {
            clearInterval(timer);
            timer = undefined;
            isTimerRunning = false;
            try { playEndAlarm(); } catch (e) {}
            stopTick();
            showGuessedCardsAfterTimer();
        }
    }, 1000);
    isTimerRunning = true;
}

// === Guessed Cards ===
function showGuessedCardsAfterTimer() {
    // ensure no timer remains running
    try { if (timer) { clearInterval(timer); timer = undefined; } } catch (e) {}
    isTimerRunning = false;
    try { playEndAlarm(); } catch (e) {}
    try { const sb = document.getElementById('startRoundBtn'); if (sb) sb.disabled = false; } catch (e) {}
    
    // Erstelle Overlay
    let guessedOverlay = document.getElementById("guessedOverlay");
    if (guessedOverlay) guessedOverlay.remove();

    guessedOverlay = document.createElement("div");
    guessedOverlay.id = "guessedOverlay";
    guessedOverlay.style.position = "fixed";
    guessedOverlay.style.top = "0";
    guessedOverlay.style.left = "0";
    guessedOverlay.style.width = "100vw";
    guessedOverlay.style.height = "100vh";
    guessedOverlay.style.background = "rgba(0,0,0,0.35)";
    guessedOverlay.style.display = "flex";
    guessedOverlay.style.flexDirection = "column";
    guessedOverlay.style.alignItems = "center";
    guessedOverlay.style.justifyContent = "center";
    guessedOverlay.style.zIndex = "10000";

    const box = document.createElement("div");
    box.style.background = "var(--card-bg)";
    box.style.padding = "36px 32px";
    box.style.borderRadius = "18px";
    box.style.boxShadow = "0 4px 24px #636e7233";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.alignItems = "center";
    box.style.gap = "0px";
    box.style.minWidth = "260px";
    box.style.width = "80vw";
    box.style.maxWidth = "600px";
    box.style.maxHeight = "80vh";
    box.style.overflowY = "auto";
    box.style.margin = "0";

    // Zuerst: Zwei Hauptoptionen anzeigen
    const title = document.createElement("h2");
    title.textContent = "⏱️ Zeit vorbei!";
    title.style.margin = "0 0 24px 0";
    title.style.fontSize = "2rem";
    title.style.color = "var(--muted)";
    box.appendChild(title);

    const btnCorrect = document.createElement("button");
    btnCorrect.textContent = "✏️ Karten korrigieren";
    btnCorrect.style.marginBottom = "12px";
    btnCorrect.style.fontSize = "1.1rem";
    btnCorrect.style.padding = "14px 32px";
    btnCorrect.style.borderRadius = "12px";
    btnCorrect.style.background = "var(--primary)";
    btnCorrect.style.color = "var(--on-accent)";
    btnCorrect.style.border = "none";
    btnCorrect.style.cursor = "pointer";
    btnCorrect.style.width = "100%";
    btnCorrect.style.maxWidth = "350px";
    btnCorrect.onclick = function () {
        // Zeige den Korrektur-Bildschirm mit Kartenliste
        showCardCorrectionScreen(guessedOverlay);
    };
    box.appendChild(btnCorrect);

    const btnSkip = document.createElement("button");
    btnSkip.textContent = "➡️ Nächster Spieler";
    btnSkip.style.fontSize = "1.1rem";
    btnSkip.style.padding = "14px 32px";
    btnSkip.style.borderRadius = "12px";
    btnSkip.style.background = "linear-gradient(90deg, var(--accent-b) 0%, #55efc4 100%)";
    btnSkip.style.color = "var(--on-accent)";
    btnSkip.style.border = "none";
    btnSkip.style.cursor = "pointer";
    btnSkip.style.width = "100%";
    btnSkip.style.maxWidth = "350px";
    btnSkip.onclick = function () {
        document.body.removeChild(guessedOverlay);
        endRound();
    };
    box.appendChild(btnSkip);

    guessedOverlay.appendChild(box);
    document.body.appendChild(guessedOverlay);
}

// Hilfsfunktion zum Anzeigen des Korrektur-Bildschirms
function showCardCorrectionScreen(guessedOverlay) {
    // Lösche den aktuellen Inhalt des box Elements
    const guessedOverlayNew = document.getElementById("guessedOverlay");
    if (!guessedOverlayNew) return;
    
    const box = guessedOverlayNew.querySelector("div");
    if (!box) return;
    
    // Leere das box Element
    box.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = "✅ Erratene Karten";
    title.style.margin = "0 0 5px 0";
    title.style.fontSize = "2rem";
    title.style.color = "var(--muted)";
    box.appendChild(title);

    // Liste der erratenen Karten
    const list = document.createElement("ul");
    list.style.listStyle = "none";
    list.style.padding = "0";
    list.style.width = "100%";
    list.style.maxWidth = "420px";

    // Kopie für Manipulation
    const guessed = [...correctCards[activeTeamIndex]];

    guessed.forEach((card, idx) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.style.justifyContent = "space-between";
        li.style.padding = "5px 0";
        li.style.borderBottom = "1px solid var(--divider)";

        const begriff = document.createElement("span");
        begriff.textContent = card.begriff;
        begriff.style.fontWeight = "bold";
        begriff.style.fontSize = "1.2rem";
        li.appendChild(begriff);

        const btn = document.createElement("button");
        btn.textContent = "Fehler";
        btn.style.background = "var(--accent-a)";
        btn.style.color = "var(--on-accent)";
        btn.style.border = "none";
        btn.style.borderRadius = "8px";
        btn.style.padding = "6px 18px";
        btn.style.marginLeft = "18px";
        btn.style.cursor = "pointer";
        btn.style.width = "80px";
        btn.onclick = function () {
            // Bestätigung vor dem Entfernen
            if (confirm("Willst du wirklich, dass diese Karte ein Fehler war?")) {
                // Karte aus der richtigen Liste entfernen
                correctCards[activeTeamIndex] = correctCards[activeTeamIndex].filter(c => c !== card);
                // Karte zurück in den Stapel der aktuellen Runde
                currentCards.push(card);
                // Element aus der Liste entfernen
                li.remove();
            }
        };
        li.appendChild(btn);

        list.appendChild(li);
    });

    box.appendChild(list);

    // Button zum Schließen und Fortfahren
    const btnOk = document.createElement("button");
    btnOk.textContent = "Weiter";
    btnOk.style.marginTop = "18px";
    btnOk.style.fontSize = "1.2rem";
    btnOk.style.padding = "12px 32px";
    btnOk.style.borderRadius = "12px";
    btnOk.style.background = "var(--primary)";
    btnOk.style.color = "var(--on-accent)";
    btnOk.style.border = "none";
    btnOk.style.cursor = "pointer";
    btnOk.onclick = function () {
        document.body.removeChild(guessedOverlay);
        endRound();
    };
    box.appendChild(btnOk);
}

// === Initial Load ===
renderRoundSettings();
loadSettingsFromStorage();
loadKartenFromExcel();

// === Theme (Design) Management ===
function applyTheme(theme) {
    // apply theme class to documentElement
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
    // save selection
    try { localStorage.setItem('timesup_theme', theme); } catch (e) { }
    // update select if present
    const sel = document.getElementById('themeSelect');
    if (sel) sel.value = theme;
}

function loadThemeFromStorage() {
    const t = localStorage.getItem('timesup_theme') || 'light';
    applyTheme(t);
}

// run theme load after DOM ready-ish (this script is loaded at end of body in index.html)
loadThemeFromStorage();

function resetGameState() {
    try { if (timer) { clearInterval(timer); } } catch (e) {}
    // Spielverlauf-Variablen zurücksetzen (Settings & Karten bleiben erhalten)
    currentRound = 0;
    totalRounds = 1;
    teams = [];
    currentCardPlayerIndex = 0;
    shuffledCardPool = [];
    playerCardCount = 0;
    cardSelectionTargetCount = 0;
    playingCards = [];
    currentCards = [];
    currentCard = null;
    correctCards = [];
    usedCardsThisTurn = [];
    teamMistakes = [];
    activeTeamIndex = 0;
    activePlayerIndexInTeam = -1;
    teamTurnOrder = [];
    teamTurnOrderPosition = -1;
    activePlayerIndicesByTeam = [];
    activePlayer = null;
    timer = undefined;
    isTimerRunning = false;
    remainingTime = 0;
    displayedCards = [];
    skipCounter = 0;
    isPenaltyActive = false;
    totalPoints = [];
    showingExplanation = false;
    cardsWereShown = false;
    allowCardClick = false;
    activeArchiveId = null;
    refreshStartCardStatus();
    // UI zurücksetzen (optional)
    document.getElementById("playerInput").value = "";
    // ggf. weitere UI-Elemente zurücksetzen
}

// Button-Handler anpassen:
document.querySelectorAll('button[onclick*="showScreen(\'start\')"]').forEach(btn => {
    btn.addEventListener('click', resetGameState);
});

const loadSavesButton = document.getElementById("loadSavesButton");
if (loadSavesButton) {
    loadSavesButton.addEventListener("click", openArchive);
}
