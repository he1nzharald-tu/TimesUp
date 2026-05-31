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
let teamA = [];
let teamB = [];
let currentCardPlayerIndex = 0;
let shuffledCardPool = [];
let playerCardCount = 0;

// === Load Cards from Excel ===
async function loadKartenFromExcel() {
    const filePath = 'js/db_Karten.xlsx';
    try {
        const response = await fetch(filePath);
        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        cardPool = rows
            .filter(row => row[0] && row[1])
            .map(row => ({ begriff: row[0], erklaerung: row[1] }));

        updateKartenStatusText(`${cardPool.length} Karten erfolgreich geladen`);
    } catch (err) {
        console.error("❌ Fehler beim Laden:", err);
        updateKartenStatusText("❌ Fehler beim Laden der Karten.");
    }
}

// === Player Management ===
function addPlayer() {
    const input = document.getElementById("playerInput");
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
    tbody.innerHTML = '';
    players.forEach(p => {
        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.setAttribute("data-label", "Spielername");
    // Make player name bold in a box (theme-aware)
    tdName.innerHTML = `<span style="display:inline-block; font-weight:bold; background:var(--card-bg); border-radius:8px; padding:4px 12px;">${p.name}</span>`;
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
    document.getElementById('screen-' + id).classList.add('active');
}

function showTab(tabId) {
    if (tabId === "rules") {
        document.getElementById("tab-rules").classList.remove("hidden");
    }
}

function continueToNext() {
    alert("Hier folgt der nächste Bildschirm…");
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
        const ruleOptions = [
            "Nur beschreiben",
            "Nur ein Wort",
            "Pantomime und Geräusche",
            "Nur einsilbig beschreiben"
        ];

        div.innerHTML = `
        <h4>Runde ${i}</h4>
        <label for="rule${i}">Regel</label>
        <select id="rule${i}">
          <option value="">-- bitte auswählen --</option>
          ${ruleOptions.map(rule =>
            `<option value="${rule}" ${selectedRule === rule ? "selected" : ""}>${rule}</option>`
        ).join("")}
        </select>
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
    }
    saveSettingsToStorage();
    showScreen("start");
}

function saveSettingsToStorage() {
    const settings = {
        players,
        cardCount: parseInt(document.getElementById("cardCount").value),
        roundCount: parseInt(document.getElementById("roundCount").value),
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
        const rule = document.getElementById(`rule${i}`).value;
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
    localStorage.setItem("timesup_settings", JSON.stringify(settings));
    // also persist theme separately for quicker access
    const themeSel = document.getElementById('themeSelect');
    if (themeSel) localStorage.setItem('timesup_theme', themeSel.value || 'light');
}

function exitSettings() {
    saveSettingsToStorage();
    showScreen("start");
}

function loadSettingsFromStorage() {
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
    document.getElementById("cardCount").value = settings.cardCount || 40;
    document.getElementById("roundCount").value = settings.roundCount || 3;
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
        document.getElementById(`rule${i}`).value = settings.roundRules?.[i - 1] || "";
        document.getElementById(`timer${i}`).value = settings.roundTimer?.[i - 1] || 60;
        document.getElementById(`skipAllowed${i}`).value = settings.roundSkip?.[i - 1] || "Nein";
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
    const defaultSkips = ["Nein", "Ja", "Nein"];
    for (let i = 1; i <= 3; i++) {
        document.getElementById(`rule${i}`).value = defaultRules[i - 1] || "";
        document.getElementById(`timer${i}`).value = defaultTimers[i - 1] || 30;
        document.getElementById(`skipAllowed${i}`).value = defaultSkips[i - 1] || "Nein";
    }
    localStorage.removeItem("timesup_settings");
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
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    teamA = [];
    teamB = [];
    shuffled.forEach((p, i) => {
        if (i % 2 === 0) teamA.push(p);
        else teamB.push(p);
    });
    displayTeams(teamA, teamB);
    showScreen("teamuebersicht");
}

function displayTeams(teamAList, teamBList) {
    const listA = document.getElementById("teamAList");
    const listB = document.getElementById("teamBList");
    if (!listA || !listB) return;
    listA.innerHTML = '';
    listB.innerHTML = '';
    teamAList.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name + (p.handicap ? " 🧩" : "");
        li.style.cursor = "pointer";
        li.onclick = () => togglePlayerTeam(p.name);
        listA.appendChild(li);
    });
    teamBList.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name + (p.handicap ? " 🧩" : "");
        li.style.cursor = "pointer";
        li.onclick = () => togglePlayerTeam(p.name);
        listB.appendChild(li);
    });
}

function assignTeamsManually() {
    teamA = [...players];
    teamB = [];
    displayTeams(teamA, teamB);
    showScreen("teamuebersicht");
}

function togglePlayerTeam(name) {
    let playerInA = teamA.find(p => p.name === name);
    let playerInB = teamB.find(p => p.name === name);
    if (playerInA) {
        teamA = teamA.filter(p => p.name !== name);
        teamB.push(playerInA);
    } else if (playerInB) {
        teamB = teamB.filter(p => p.name !== name);
        teamA.push(playerInB);
    }
    displayTeams(teamA, teamB);
}

// === Card Selection ===
function updateKartenStatusText(text) {
    const el = document.getElementById("kartenStatusText");
    if (el) el.textContent = text;
}

function startCardSelection(withVeto) {
    const totalCards = parseInt(document.getElementById("cardCount").value || "40");
    const cardsPerPlayer = Math.floor(totalCards / players.length);
    shuffledCardPool = [...cardPool].sort(() => Math.random() - 0.5);
    playerCardCount = cardsPerPlayer;
    currentCardPlayerIndex = 0;
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
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
    const totalCards = parseInt(document.getElementById("cardCount").value || "40");
    shuffledCardPool = [...cardPool].sort(() => Math.random() - 0.5);
    playingCards = shuffledCardPool.slice(0, totalCards);

    // Layout-Elemente holen
    const playerLabel = document.getElementById("cardSelectionPlayerName");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const ul = document.getElementById("cardSelectionList");
    const doneBtn = document.getElementById("cardDoneButton");
    const startBtn = document.getElementById("startGameOverviewButton");

    // Layout wie bei showScreen("kartenauswahl")
    playerLabel.textContent = "✓ Fertig!";
    info.innerHTML = `${playingCards.length} Karten wurden zufällig ausgewählt.`.replace(/\./g, ".<br>");
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
    li.innerHTML = `<span style="background: var(--panel); padding: 2px 6px; border-radius: 6px;">${card.begriff}</span> – ${card.erklaerung}`;
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
    listItem.textContent = `🃏 ${newCard.begriff} – ${newCard.erklaerung}`;
    listItem.onclick = null;
    listItem.style.opacity = "0.6";
    listItem.style.pointerEvents = "none";
    remainingVetos--;
    updateVetoDisplay();
    document.getElementById("vetoInfoText").textContent =
        `Du hast ${remainingVetos} Veto${remainingVetos !== 1 ? 's' : ''}`;
}

function handleCardSelectionDone() {
    document.getElementById("startGameOverviewButton").style.display = "none";
    if (remainingVetos > 0) {
        const confirmFinish = confirm(`Du hast noch ${remainingVetos} Veto${remainingVetos !== 1 ? 's' : ''} übrig. Möchtest du wirklich fortfahren?`);
        if (!confirmFinish) return;
    }
    const ul = document.getElementById("cardSelectionList");
    const playerLabel = document.getElementById("cardSelectionPlayerName");
    const info = document.getElementById("cardSelectionInfo");
    const vetoInfo = document.getElementById("vetoInfoText");
    const doneBtn = document.getElementById("cardDoneButton");
    for (let i = 0; i < ul.children.length; i++) {
        const cardText = ul.children[i].textContent;
        const clean = cardText.replace(/^🃏\s*/, "").split(" – ");
        if (clean.length === 2) {
            playingCards.push({
                begriff: clean[0].trim(),
                erklaerung: clean[1].trim()
            });
        }
    }
    currentCardPlayerIndex++;
    if (currentCardPlayerIndex >= players.length) {
        const targetCount = parseInt(document.getElementById("cardCount").value || "40");
        const fehlendeKarten = Math.max(0, targetCount - playingCards.length);
        for (let i = 0; i < fehlendeKarten && shuffledCardPool.length > 0; i++) {
            const card = shuffledCardPool.shift();
            playingCards.push({
                begriff: card.begriff,
                erklaerung: card.erklaerung
            });
        }
        playerLabel.textContent = "✓ Fertig!";
        //info.style.flexWrap = "wrap";
        info.innerHTML = `Alle Spieler haben ihre Karten. Gesamt: ${playingCards.length} Karten. Davon ${fehlendeKarten} automatisch ergänzt.`
          .replace(/\./g, ".<br>");
        info.style.display = "block";
        info.style.cursor = "not-allowed";
        info.style.pointerEvents = "none";
        vetoInfo.textContent = "";
        vetoInfo.style.display = "none";
        ul.innerHTML = "";
        doneBtn.style.display = "none";
        allowCardClick = false;
        document.getElementById("startGameOverviewButton").style.display = "inline-block";
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
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
    const rounds = parseInt(settings.roundCount || 3);
    const roundEl = document.getElementById("roundSummary");
    if (roundEl) {
        roundEl.textContent = `Es werden ${rounds} Runden gespielt. Bisher 0 abgeschlossen.`;
    }
    const general = document.getElementById("generalRulesList");
    if (general) {
        general.innerHTML = "";
        general.innerHTML += `<li>🃏 Anzahl Karten: ${settings.cardCount || 40}</li>`;
        general.innerHTML += `<li>🔁 Spielrunden: ${rounds}</li>`;
        general.innerHTML += `<li>🧩 Handicap: ${settings.handicapEnabled ? 'Ja, +' + (settings.handicapTime || 5) + 's' : 'Nein'}</li>`;
        if (settings.punishEnabled) {
            general.innerHTML += `<li>⚠️ Regelmissachtung: Ja<br>
          ⏱️ Strafzeit: ${settings.punishTime || 3}s<br>
          ❌ Punktabzug: ${settings.punishPoints || 'Nein'}</li>`;
        } else {
            general.innerHTML += `<li>⚠️ Regelmissachtung: Nein</li>`;
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
            box.innerHTML = `
          <strong>Runde ${i + 1}</strong><br>
          Regel: ${rule}<br>
          Zeit: ${timer} Sekunden<br>
          Überspringen: ${skip}
        `;
            roundWrap.appendChild(box);
        }
    }
    const listA = document.getElementById("overviewTeamA");
    const listB = document.getElementById("overviewTeamB");
    if (listA && listB) {
        listA.innerHTML = "";
        listB.innerHTML = "";
        teamA.forEach(p => {
            const li = document.createElement("li");
            li.textContent = p.name + (p.handicap ? " 🧩" : "");
            listA.appendChild(li);
        });
        teamB.forEach(p => {
            const li = document.createElement("li");
            li.textContent = p.name + (p.handicap ? " 🧩" : "");
            listB.appendChild(li);
        });
    }
    const teamATitle = document.getElementById("teamATitle");
    const teamBTitle = document.getElementById("teamBTitle");
    if (teamATitle) teamATitle.textContent = "🔴 Team A – 0 Punkte";
    if (teamBTitle) teamBTitle.textContent = "🟢 Team B – 0 Punkte";
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
try {
    // prefer a short ticking/pip audio for the last seconds
    tickAudio = new Audio('assets/timer5.m4a');
    tickAudio.preload = 'auto';
    tickAudio.volume = 0.7;
} catch (e) { tickAudio = null; }
try {
    const el = document.getElementById('alarm-sound');
    if (el && el.tagName === 'AUDIO') {
        endAudio = el;
    } else {
        endAudio = new Audio('assets/Alarm.m4a');
        endAudio.preload = 'auto';
    }
    try { endAudio.volume = 0.85; } catch (e) {}
} catch (e) { endAudio = null; }

function playTick() {
    if (!tickAudio) return;
    if (audiotime) return; // prevent overlapping ticks if one is still playing
    try {
        tickAudio.currentTime = 0;
        const p = tickAudio.play();
        if (p && p.catch) p.catch(() => {});
    } catch (e) { }
    audiotime = true;
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
let activePlayerIndexA = -1;
let activePlayerIndexB = -1;
let isPenaltyActive = false;
let totalPoints = { A: 0, B: 0 };
let currentCards = [];
let currentCard = null;
let correctCards = { A: [], B: [] };
let usedCardsThisTurn = [];
let teamMistakes = { A: 0, B: 0 };
let activeTeam = "A";
let activePlayerIndex = 0;
let activePlayer = null;

function startGame() {
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
    totalRounds = parseInt(settings.roundCount || 3);
    currentRound = 0;
    currentCards = [...playingCards];
    let startingTeam;
    if (teamA.length < teamB.length) {
        startingTeam = "B";
    } else if (teamB.length < teamA.length) {
        startingTeam = "A";
    } else {
        startingTeam = Math.random() < 0.5 ? "A" : "B";
    }
    activeTeam = startingTeam;
    activePlayerIndex = 0;
    //activePlayer = (startingTeam === "A") ? teamA[0] : teamB[0];
    setNextPlayer();
    currentRoundCards = [...currentCards];
    correctCards = { A: [], B: [] };
    usedCardsThisTurn = [];
    teamMistakes = { A: 0, B: 0 };
    showStartRoundScreen();
}

function showStartRoundScreen() {
    document.getElementById("roundPlayerName").textContent = activePlayer.name;
    const teamEl = document.getElementById("roundPlayerTeam");
    teamEl.textContent = `Team ${activeTeam}`;
    const startBtn = document.getElementById("startRoundBtn");
    if (activeTeam === "A") {
        teamEl.style.background = `linear-gradient(90deg, rgba(255,118,117,0.12) 60%, var(--panel) 100%)`;
        teamEl.style.color = `var(--accent-a)`;
        document.getElementById('roundBorderWrapper').style.borderColor = 'var(--accent-a)';
        if (startBtn) startBtn.style.background = 'var(--primary)';
    } else {
        teamEl.style.background = `linear-gradient(90deg, rgba(0,184,148,0.12) 60%, var(--panel) 100%)`;
        teamEl.style.color = `var(--accent-b)`;
        document.getElementById('roundBorderWrapper').style.borderColor = 'var(--accent-b)';
        if (startBtn) startBtn.style.background = 'linear-gradient(90deg, var(--accent-b) 0%, #55efc4 100%)';
    }
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
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
    const roundIndex = currentRound;
    let baseTime = parseInt(settings.roundTimer?.[roundIndex] || 60);
    if (settings.handicapEnabled && activePlayer.handicap) {
        baseTime += parseInt(settings.handicapTime || 5);
    }
    remainingTime = baseTime;
    displayedCards = [];
    skipCounter = 0;
    document.getElementById("playRoundPlayer").textContent = activePlayer.name;
    document.getElementById("playRoundTeam").textContent = `Team ${activeTeam}`;
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
            stopTick();
            try { const sb = document.getElementById('startRoundBtn'); if (sb) sb.disabled = false; } catch (e) {}
            // play final alarm sound and then show guessed cards
            try { playEndAlarm(); } catch (e) {}
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
    correctCards[activeTeam].push(currentCard);
    currentCards = currentCards.filter(card => card.begriff !== currentCard.begriff);
    showingExplanation = false;
    showNextCard();
}

function handleSkip() {
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
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
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
    if (isPenaltyActive) return;
    teamMistakes[activeTeam] = (teamMistakes[activeTeam] || 0) + 1;
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
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
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
    // Team wechseln
    activeTeam = (activeTeam === "A") ? "B" : "A";
    if (activeTeam === "A") {
        if (teamA.length === 0) {
            activePlayer = null;
        } else {
            activePlayerIndexA = (typeof activePlayerIndexA === "number" ? activePlayerIndexA : 0);
            activePlayerIndexA = (activePlayerIndexA + 1) % teamA.length;
            activePlayer = teamA[activePlayerIndexA];
        }
    } else {
        if (teamB.length === 0) {
            activePlayer = null;
        } else {
            activePlayerIndexB = (typeof activePlayerIndexB === "number" ? activePlayerIndexB : 0);
            activePlayerIndexB = (activePlayerIndexB + 1) % teamB.length;
            activePlayer = teamB[activePlayerIndexB];
        }
    }
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
    const pointsA = correctCards.A.length;
    const pointsB = correctCards.B.length;
    totalPoints.A += pointsA;
    totalPoints.B += pointsB;
    document.getElementById("pointsTeamA").textContent = totalPoints.A;
    document.getElementById("pointsTeamB").textContent = totalPoints.B;

    // Team A Spielernamen
    const statsTeamAList = document.getElementById("statsTeamAList");
    statsTeamAList.innerHTML = "";
    teamA.forEach(player => {
        const li = document.createElement("li");
        li.textContent = player.name || player; // falls nur String
        statsTeamAList.appendChild(li);
    });

    // Team B Spielernamen
    const statsTeamBList = document.getElementById("statsTeamBList");
    statsTeamBList.innerHTML = "";
    teamB.forEach(player => {
        const li = document.createElement("li");
        li.textContent = player.name || player;
        statsTeamBList.appendChild(li);
    });

    showScreen("roundstats");
}

function nextGameRound() {
    const settings = JSON.parse(localStorage.getItem("timesup_settings") || "{}");
    currentRound++;
    if (currentRound >= totalRounds) {
        showFinalScreen();
        return;
    }
    currentCards = [...playingCards];
    displayedCards = [];
    correctCards = { A: [], B: [] };
    teamMistakes = { A: 0, B: 0 };
    skipCounter = 0;
    setNextPlayer();
    showStartRoundScreen();
}

function showFinalScreen() {
    document.getElementById("finalPointsA").textContent = totalPoints.A || 0;
    document.getElementById("finalPointsB").textContent = totalPoints.B || 0;
    const listA = document.getElementById("finalTeamA");
    const listB = document.getElementById("finalTeamB");
    listA.innerHTML = "";
    listB.innerHTML = "";
    teamA.forEach(player => {
        const row = document.createElement("tr");
        row.innerHTML = `
        <td style="padding: 4px 12px;">${player.name}</td>
        <td style="text-align: center;">${player.handicap ? "✔️" : ""}</td>
      `;
        listA.appendChild(row);
    });
    teamB.forEach(player => {
        const row = document.createElement("tr");
        row.innerHTML = `
        <td style="padding: 4px 12px;">${player.name}</td>
        <td style="text-align: center;">${player.handicap ? "✔️" : ""}</td>
      `;
        listB.appendChild(row);
    });
    showScreen("end");
}

function setActionButtonsEnabled(enabled) {
    document.getElementById("btnCorrect").disabled = !enabled;
    document.getElementById("btnMistake").disabled = !enabled;
}

function confirmStartRound() {
    if (confirm("Bist du bereit, deinen Timer zu starten?\nDeine Zeit beginnt sofort.")) {
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
            stopTick();
            try { playEndAlarm(); } catch (e) {}
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
    box.style.marginTop = "5vh";    // Abstand zum oberen Rand
    box.style.marginBottom = "5vh"; // Abstand zum unteren Rand

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
    const guessed = [...correctCards[activeTeam]];

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
            // Karte aus der richtigen Liste entfernen
            correctCards[activeTeam] = correctCards[activeTeam].filter(c => c !== card);
            // Karte zurück in den Stapel der aktuellen Runde
            currentCards.push(card);
            // Element aus der Liste entfernen
            li.remove();
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
        endRound(); // oder showRoundStats(), je nach Spiellogik
    };
    box.appendChild(btnOk);

    guessedOverlay.appendChild(box);
    document.body.appendChild(guessedOverlay);
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
    // Spielverlauf-Variablen zurücksetzen (Settings & Karten bleiben erhalten)
    currentRound = 0;
    totalRounds = 1;
    teamA = [];
    teamB = [];
    currentCardPlayerIndex = 0;
    shuffledCardPool = [];
    playerCardCount = 0;
    playingCards = [];
    currentCards = [];
    currentCard = null;
    correctCards = { A: [], B: [] };
    usedCardsThisTurn = [];
    teamMistakes = { A: 0, B: 0 };
    activeTeam = "A";
    activePlayerIndex = 0;
    activePlayer = null;
    activePlayerIndexA = -1;
    activePlayerIndexB = -1;
    timer = undefined;
    remainingTime = 0;
    displayedCards = [];
    skipCounter = 0;
    isPenaltyActive = false;
    totalPoints = { A: 0, B: 0 };
    showingExplanation = false;
    cardsWereShown = false;
    allowCardClick = false;
    // UI zurücksetzen (optional)
    document.getElementById("playerInput").value = "";
    // ggf. weitere UI-Elemente zurücksetzen
}

// Button-Handler anpassen:
document.querySelectorAll('button[onclick*="showScreen(\'start\')"]').forEach(btn => {
    btn.addEventListener('click', resetGameState);
});