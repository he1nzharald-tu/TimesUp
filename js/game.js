// Spiel: Spieler und Teams, Runden, Timer, Punkte, Pause und Zugende
import { DEFAULT_TURN_SECONDS, state } from "./state.js";
import { getPenaltyMode, getSettings, toPositiveInt } from "./settings.js";
import { ensureActiveArchive, isSameCard, resetCardSelectionUi, savePlayedCardsToActiveArchive, shuffleArray } from "./cards.js";
import { playEndAlarm, playTick, stopTick, unlockGameAudio } from "./audio.js";
import { appendText, appAlert, appConfirm, displayTeams, refreshStartCardStatus, renderTeamPlayerList, showScreen, updatePlayerTable } from "./ui.js";

// === Player Management ===
export function addPlayer() {
    const input = document.getElementById("playerInput");
    if (!input) return;
    const name = input.value.trim();
    if (name && !state.players.some(p => p.name === name)) {
        state.players.push({ name, handicap: false });
        updatePlayerTable();
    }
    input.value = '';
}
export function removePlayer(name) {
    const index = state.players.findIndex(p => p.name === name);
    if (index !== -1) {
        state.players.splice(index, 1);
        updatePlayerTable();
    }
}
export function toggleHandicap(name, checked) {
    const player = state.players.find(p => p.name === name);
    if (player) player.handicap = checked;
}
// === Team Management ===
export async function confirmBeforeContinue() {
    if (state.players.length === 0) {
        appAlert("Bitte füge zuerst mindestens einen Spieler hinzu.");
        return;
    }
    const confirmed = await appConfirm("Sind alle Spieler hinzugefügt und alle Einstellungen getroffen?", {
        okText: "Weiter", cancelText: "Zurück"
    });
    if (confirmed) {
        renderTeamPlayerList();
        showScreen("teamauswahl");
    }
}
export function assignRandomTeams() {
    const teamCount = parseInt(document.getElementById("teamCount").value || 2);
    state.totalTeams = teamCount;
    const shuffled = shuffleArray(state.players);
    
    // Initialize teams array
    state.teams = [];
    for (let i = 0; i < teamCount; i++) {
        state.teams.push([]);
    }
    
    // Distribute players round-robin to teams
    shuffled.forEach((p, i) => {
        state.teams[i % teamCount].push(p);
    });
    
    displayTeams();
    showScreen("teamuebersicht");
}
export function assignTeamsManually() {
    const teamCount = parseInt(document.getElementById("teamCount").value || 2);
    state.totalTeams = teamCount;
    
    state.teams = [];
    for (let i = 0; i < teamCount; i++) {
        state.teams.push([]);
    }
    state.teams[0] = [...state.players];
    
    displayTeams();
    showScreen("teamuebersicht");
}
export function togglePlayerTeam(name, fromTeamIdx) {
    // Find player and remove from current team
    const player = state.teams[fromTeamIdx].find(p => p.name === name);
    if (!player) return;
    
    state.teams[fromTeamIdx] = state.teams[fromTeamIdx].filter(p => p.name !== name);
    
    // Find next empty team or next team in rotation
    let targetTeamIdx = -1;
    for (let i = (fromTeamIdx + 1) % state.totalTeams; i !== fromTeamIdx; i = (i + 1) % state.totalTeams) {
        targetTeamIdx = i;
        break;
    }
    
    if (targetTeamIdx === -1) targetTeamIdx = (fromTeamIdx + 1) % state.totalTeams;
    
    state.teams[targetTeamIdx].push(player);
    displayTeams();
}
// === Game Overview ===
// Kompakte Übersicht der Runden und Strafen in der Spielübersicht
export function describeSkip(settings, i) {
    if (settings.roundSkip?.[i] !== "yes") return "Überspringen: Nein";
    const limited = settings.skipLimitType?.[i] === "limited";
    const limit = limited ? ` (max. ${settings.skipLimitValue?.[i]})` : "";
    const back = settings.skipReturn?.[i] === "no" ? ", ohne Zurücklegen" : "";
    return `Überspringen: Ja${limit}${back}`;
}

export function renderOverviewRules(settings = getSettings()) {
    const wrap = document.getElementById("overviewRules");
    if (!wrap) return;
    wrap.innerHTML = "";
    const rounds = toPositiveInt(settings.roundCount, 3);
    const list = document.createElement("div");
    list.className = "overview-rounds";
    for (let i = 0; i < rounds; i++) {
        const card = document.createElement("div");
        card.className = "overview-round";
        appendText(card, "span", `Runde ${i + 1} · ${settings.roundTimer?.[i] || DEFAULT_TURN_SECONDS} s`).className = "overview-round-title";
        appendText(card, "span", settings.roundRules?.[i] || "–").className = "overview-round-rule";
        appendText(card, "span", describeSkip(settings, i)).className = "overview-round-meta";
        list.appendChild(card);
    }
    wrap.appendChild(list);

    const extras = [];
    extras.push(settings.punishEnabled ? `Strafzeit ${settings.punishTime || 3} s` : "Keine Strafzeit");
    const perMistake = getPenaltyPerMistake(settings);
    extras.push(perMistake ? `Punktabzug −${formatPoints(perMistake)} pro Fehler` : "Kein Punktabzug");
    if (settings.handicapEnabled) extras.push(`Handicap +${settings.handicapTime || 5} s`);
    appendText(wrap, "p", "⚠️ " + extras.join(" · ")).className = "overview-penalties";
}

export function prepareGameOverview() {
    const settings = getSettings();
    const teamCount = parseInt(settings.teamCount || 2);
    state.totalTeams = teamCount;
    renderOverviewRules(settings);
    
    // Display all teams - new layout for 3+ teams
    const overviewTeamsContainer = document.getElementById("overviewTeamsContainer");
    const teamsDiv = document.querySelector('#screen-spieluebersicht .teams');
    
    if (state.totalTeams > 2) {
        // Show new multi-team display and hide old 2-team display
        if (overviewTeamsContainer) {
            overviewTeamsContainer.style.display = 'grid';
            overviewTeamsContainer.innerHTML = '';
            const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
            
            state.teams.forEach((team, idx) => {
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
        if (listA && state.teams[0]) {
            listA.innerHTML = "";
            state.teams[0].forEach(p => {
                const li = document.createElement("li");
                li.textContent = p.name + (p.handicap ? " 🧩" : "");
                listA.appendChild(li);
            });
        }
        if (listB && state.teams[1]) {
            listB.innerHTML = "";
            state.teams[1].forEach(p => {
                const li = document.createElement("li");
                li.textContent = p.name + (p.handicap ? " 🧩" : "");
                listB.appendChild(li);
            });
        }
    }
    showScreen("spieluebersicht");
}
export function buildTeamTurnOrder() {
    const groupedBySize = new Map();

    state.teams.forEach((team, index) => {
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
export function startGame() {
    if (state.playingCards.length === 0) {
        appAlert("Bitte wähle zuerst Karten aus.");
        return;
    }
    if (!state.teams.some(team => Array.isArray(team) && team.length > 0)) {
        appAlert("Bitte teile zuerst Teams ein.");
        return;
    }
    ensureActiveArchive();
    const settings = getSettings();
    state.totalRounds = parseInt(settings.roundCount || 3);
    state.totalTeams = parseInt(settings.teamCount || 2);
    state.currentRound = 0;
    state.currentCards = [...state.playingCards];
    
    // Initialize points and correctCards arrays for all teams
    state.totalPoints = Array(state.totalTeams).fill(0);
    state.penaltyPoints = Array(state.totalTeams).fill(0);
    state.correctCards = Array(state.totalTeams).fill(null).map(() => []);
    state.roundPointsApplied = false;
    state.teamMistakes = Array(state.totalTeams).fill(0);
    
    state.teamTurnOrder = buildTeamTurnOrder();
    state.teamTurnOrderPosition = -1;
    state.activePlayerIndicesByTeam = Array(state.totalTeams).fill(-1);
    state.activePlayerIndexInTeam = -1;
    setNextPlayer();
    
    showStartRoundScreen();
}
export function showStartRoundScreen() {
    if (!state.activePlayer) {
        setNextPlayer();
    }
    if (!state.activePlayer) {
        appAlert("Es ist kein aktiver Spieler verfügbar. Bitte prüfe die Teams.");
        showScreen("teamuebersicht");
        return;
    }
    
    document.getElementById("roundPlayerName").textContent = state.activePlayer.name;
    const teamEl = document.getElementById("roundPlayerTeam");
    teamEl.textContent = `Team ${state.activeTeamIndex + 1}`;
    const startBtn = document.getElementById("startRoundBtn");
    const settings = getSettings();
    const roundRule = settings.roundRules?.[state.currentRound] || "-";
    const roundTime = settings.roundTimer?.[state.currentRound] || DEFAULT_TURN_SECONDS;
    const roundSkip = (settings.roundSkip?.[state.currentRound] || "no").toLowerCase() === "yes"
        ? (settings.skipReturn?.[state.currentRound] === "no" ? "Ja, ohne Zurücklegen" : "Ja")
        : "Nein";
    const timeEl = document.getElementById("roundStartTime");
    const ruleEl = document.getElementById("roundStartRule");
    const skipEl = document.getElementById("roundStartSkip");
    if (timeEl) timeEl.textContent = `Zeit: ${roundTime}s`;
    if (ruleEl) ruleEl.textContent = `Regel: ${roundRule}`;
    if (skipEl) skipEl.textContent = `Überspringen: ${roundSkip}`;
    
    // Generate team colors dynamically
    const teamColors = ['#ff7675', '#00b894', '#3498db', '#f39c12', '#9b59b6', '#e74c3c', '#1abc9c', '#34495e'];
    const color = teamColors[state.activeTeamIndex % teamColors.length];
    
    teamEl.style.background = `linear-gradient(90deg, rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},0.12) 60%, var(--panel) 100%)`;
    teamEl.style.color = color;
    document.getElementById('roundBorderWrapper').style.borderColor = color;
    if (startBtn) startBtn.style.background = `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`;
    
    showScreen("roundstart");
}
export function startRoundTimer() {
    // prevent duplicate starts
    if (state.isTimerRunning) return;
    // mark as running immediately to prevent re-entrant starts
    state.isTimerRunning = true;
    // ensure any existing timer is cleared to avoid double intervals
    try { if (state.timer) { clearInterval(state.timer); state.timer = undefined; } } catch (e) {}
    // disable start button to avoid double start
    try { const sb = document.getElementById('startRoundBtn'); if (sb) sb.disabled = true; } catch (e) {}
    const settings = getSettings();
    const roundIndex = state.currentRound;
    let baseTime = parseInt(settings.roundTimer?.[roundIndex] || DEFAULT_TURN_SECONDS);
    if (settings.handicapEnabled && state.activePlayer.handicap) {
        baseTime += parseInt(settings.handicapTime || 5);
    }
    state.remainingTime = baseTime;
    state.displayedCards = [];
    state.skippedThisTurn = [];
    state.skipCounter = 0;
    document.getElementById("playRoundPlayer").textContent = state.activePlayer.name;
    document.getElementById("playRoundTeam").textContent = `Team ${state.activeTeamIndex + 1}`;
    document.getElementById("timerDisplay").textContent = `${state.remainingTime}s`;
    showScreen("play");
    state.timer = setInterval(() => {
        state.remainingTime--;
        document.getElementById("timerDisplay").textContent = `${state.remainingTime}s`;
        // play a short tick for the last 5 seconds
        if (state.remainingTime > 0 && state.remainingTime <= 5) {
            playTick();
        }
        if (state.remainingTime <= 0) {
            clearInterval(state.timer);
            state.timer = undefined;
            state.isTimerRunning = false;
            try { const sb = document.getElementById('startRoundBtn'); if (sb) sb.disabled = false; } catch (e) {}
            // play final alarm sound and then show guessed cards
            try { playEndAlarm(); } catch (e) {}
            stopTick();
            showGuessedCardsAfterTimer();
        }
    }, 1000);
    state.isTimerRunning = true;
    showNextCard();
}
export function skippedCardsReturn() {
    return getSettings().skipReturn?.[state.currentRound] !== "no";
}
export function showNextCard() {
    let available = state.currentCards.filter(card => !state.displayedCards.includes(card.id));
    if (available.length === 0 && state.skippedThisTurn.length > 0 && skippedCardsReturn()) {
        // Stapel ist durch: übersprungene Karten kommen wieder nach oben
        const returning = new Set(state.skippedThisTurn);
        state.displayedCards = state.displayedCards.filter(key => !returning.has(key));
        state.skippedThisTurn = [];
        available = state.currentCards.filter(card => !state.displayedCards.includes(card.id));
    }
    if (available.length === 0) {
        document.getElementById("cardTerm").textContent = "🔄 Keine weiteren Karten";
        document.getElementById("cardExplanation").style.display = "none";
        showGuessedCardsAfterTimer(); // <--- Hier statt endRound()
        return;
    }
    const next = available[Math.floor(Math.random() * available.length)];
    state.currentCard = next;
    state.displayedCards.push(next.id);
    document.getElementById("cardTerm").textContent = state.currentCard.begriff;
    document.getElementById("cardExplanation").textContent = state.currentCard.erklaerung || "";
    document.getElementById("cardExplanation").style.display = "none";
    state.showingExplanation = false;
    setActionButtonsEnabled(true);
    updateSkipButtonState();
}
export function handleCorrect() {
    if (!state.currentCard) return;
    state.correctCards[state.activeTeamIndex].push(state.currentCard);
    state.currentCards = state.currentCards.filter(card => !isSameCard(card, state.currentCard));
    state.showingExplanation = false;
    showNextCard();
}
export function markCurrentCardCorrectAfterTimer() {
    if (!state.currentCard) return false;
    const cardStillOpen = state.currentCards.some(card => isSameCard(card, state.currentCard));
    if (!cardStillOpen) return false;

    const alreadyCounted = state.correctCards[state.activeTeamIndex].some(card => isSameCard(card, state.currentCard));
    if (!alreadyCounted) {
        state.correctCards[state.activeTeamIndex].push(state.currentCard);
    }
    state.currentCards = state.currentCards.filter(card => !isSameCard(card, state.currentCard));
    state.showingExplanation = false;
    return true;
}
export function handleSkip() {
    if (!state.currentCard) return;
    const settings = getSettings();
    const roundIndex = state.currentRound;
    const skipSetting = settings.roundSkip?.[roundIndex];
    const skipAllowed = skipSetting === "yes";
    if (!skipAllowed) return;
    if (skipSetting === "yes") {
        const maxSkips = parseInt(settings.skipLimitValue?.[roundIndex] || 100);
        if (state.skipCounter >= maxSkips) return;
    }
    if (!state.displayedCards.includes(state.currentCard.id)) state.displayedCards.push(state.currentCard.id);
    state.skippedThisTurn.push(state.currentCard.id);
    state.skipCounter++;
    showNextCard();
}
export function handleMistake() {
    if (!state.currentCard) return;
    const settings = getSettings();
    if (state.isPenaltyActive) return;
    state.teamMistakes[state.activeTeamIndex] = (state.teamMistakes[state.activeTeamIndex] || 0) + 1;
    if (!state.displayedCards.includes(state.currentCard.id)) state.displayedCards.push(state.currentCard.id);
    // Die Karte ist für diesen Zug erledigt und darf nach Zeitablauf nicht als "richtig" angeboten werden
    state.currentCard = null;
    if (settings.punishEnabled) {
        const delay = parseInt(settings.punishTime || 3);
        state.isPenaltyActive = true;
        document.getElementById("cardTerm").textContent = "⏱️ Strafzeit…";
        document.getElementById("cardExplanation").style.display = "none";
        setActionButtonsEnabled(false);
        state.penaltyTimeout = setTimeout(() => {
            state.penaltyTimeout = null;
            state.isPenaltyActive = false;
            showNextCard();
        }, delay * 1000);
    } else {
        showNextCard();
    }
}
// Bricht eine laufende Strafzeit ab (Zugende, Pause, Spielabbruch)
export function cancelPenalty() {
    const wasActive = state.isPenaltyActive;
    if (state.penaltyTimeout) {
        clearTimeout(state.penaltyTimeout);
        state.penaltyTimeout = null;
    }
    state.isPenaltyActive = false;
    return wasActive;
}
export function updateSkipButtonState() {
    const settings = getSettings();
    const roundIndex = state.currentRound;
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
        if (state.skipCounter >= maxSkips) {
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
export function toggleExplanation() {
    if (!state.currentCard) return;
    const explanationEl = document.getElementById("cardExplanation");
    state.showingExplanation = !state.showingExplanation;
    explanationEl.style.display = state.showingExplanation ? "block" : "none";
    const cardTip = document.getElementById("cardTip");
    cardTip.style.display = state.showingExplanation ? "none" : "block"; 
}
export function setNextPlayer() {
    if (state.teamTurnOrder.length === 0) {
        state.teamTurnOrder = buildTeamTurnOrder();
        state.teamTurnOrderPosition = -1;
    }

    if (state.teamTurnOrder.length === 0) {
        state.activePlayer = null;
        return;
    }

    state.teamTurnOrderPosition = (state.teamTurnOrderPosition + 1) % state.teamTurnOrder.length;
    state.activeTeamIndex = state.teamTurnOrder[state.teamTurnOrderPosition];
    
    const currentTeam = state.teams[state.activeTeamIndex];
    if (!currentTeam || currentTeam.length === 0) {
        state.activePlayer = null;
        return;
    }
    
    if (!Array.isArray(state.activePlayerIndicesByTeam) || state.activePlayerIndicesByTeam.length < state.totalTeams) {
        state.activePlayerIndicesByTeam = Array(state.totalTeams).fill(-1);
    }

    state.activePlayerIndexInTeam = ((state.activePlayerIndicesByTeam[state.activeTeamIndex] ?? -1) + 1) % currentTeam.length;
    state.activePlayerIndicesByTeam[state.activeTeamIndex] = state.activePlayerIndexInTeam;
    state.activePlayer = currentTeam[state.activePlayerIndexInTeam];
}
export function endRound() {
    try { if (state.timer) { clearInterval(state.timer); state.timer = undefined; } } catch (e) {}
    cancelPenalty();
    state.isTimerRunning = false;
    if (state.currentCards.length > 0) {
        setNextPlayer();
        showStartRoundScreen();
    } else if (state.currentRound >= state.totalRounds - 1) {
        applyCurrentRoundPoints();
        showFinalScreen();
    } else {
        showRoundStats();
    }
}
// Abzug pro Regelverstoß laut Einstellung "Punktabzug": Ja = 1 Punkt, Remi = 0,5 Punkte
export function getPenaltyPerMistake(settings = getSettings()) {
    const mode = getPenaltyMode(settings);
    if (mode === "yes") return 1;
    if (mode === "draw") return 0.5;
    return 0;
}

export function formatPoints(value) {
    return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

// Text wie " (−1,5 Strafe)", leer ohne Abzug
export function formatPenalty(value) {
    return value > 0 ? ` (−${formatPoints(value)} Strafe)` : "";
}

export function applyCurrentRoundPoints() {
    if (state.roundPointsApplied) return;
    const perMistake = getPenaltyPerMistake();
    state.correctCards.forEach((teamCards, idx) => {
        const before = state.totalPoints[idx] || 0;
        const gained = teamCards.length;
        const penalty = (state.teamMistakes[idx] || 0) * perMistake;
        // Gesamtpunkte fallen durch Strafen nie unter 0
        state.totalPoints[idx] = Math.max(0, before + gained - penalty);
        state.penaltyPoints[idx] = (state.penaltyPoints[idx] || 0) + (before + gained - state.totalPoints[idx]);
    });
    state.roundPointsApplied = true;
}
export function showRoundStats() {
    document.getElementById("statsRoundNumber").textContent = state.currentRound + 1;
    
    applyCurrentRoundPoints();
    
    // Update stats display - new layout for 3+ teams
    const statsContainer = document.getElementById("statsContainer");
    const statsOldTeamsDiv = document.querySelector('#screen-roundstats > div:nth-child(2)');
    
    if (state.totalTeams > 2) {
        // Show new multi-team display and hide old 2-team display
        if (statsContainer) {
            statsContainer.style.display = 'grid';
            statsContainer.innerHTML = '';
            const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
            
            state.teams.forEach((team, idx) => {
                const box = document.createElement("div");
                box.className = "team-overview-card";
                
                const title = document.createElement("h3");
                title.textContent = `${teamEmojis[idx % teamEmojis.length]} Team ${idx + 1}`;
                box.appendChild(title);
                
                const points = document.createElement("p");
                points.textContent = `Punkte: ${formatPoints(state.totalPoints[idx])}${formatPenalty(state.penaltyPoints[idx])}`;
                points.className = "team-points";
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
            if (state.teams[0]) {
                state.teams[0].forEach(player => {
                    const li = document.createElement("li");
                    li.textContent = player.name || player;
                    statsTeamAList.appendChild(li);
                });
            }
        }
        if (statsTeamBList) {
            statsTeamBList.innerHTML = "";
            if (state.teams[1]) {
                state.teams[1].forEach(player => {
                    const li = document.createElement("li");
                    li.textContent = player.name || player;
                    statsTeamBList.appendChild(li);
                });
            }
        }
        
        if (state.totalPoints.length >= 2) {
            const pointsTeamAEl = document.getElementById("pointsTeamA");
            const pointsTeamBEl = document.getElementById("pointsTeamB");
            if (pointsTeamAEl) pointsTeamAEl.textContent = formatPoints(state.totalPoints[0]);
            if (pointsTeamBEl) pointsTeamBEl.textContent = formatPoints(state.totalPoints[1]);
            const penaltyA = document.getElementById("penaltyTeamA");
            const penaltyB = document.getElementById("penaltyTeamB");
            if (penaltyA) penaltyA.textContent = formatPenalty(state.penaltyPoints[0]);
            if (penaltyB) penaltyB.textContent = formatPenalty(state.penaltyPoints[1]);
        }
    }

    showScreen("roundstats");
}
export function nextGameRound() {
    const settings = getSettings();
    state.currentRound++;
    if (state.currentRound >= state.totalRounds) {
        showFinalScreen();
        return;
    }
    state.currentCards = [...state.playingCards];
    state.displayedCards = [];
    state.correctCards = Array(state.totalTeams).fill(null).map(() => []);
    state.roundPointsApplied = false;
    state.teamMistakes = Array(state.totalTeams).fill(0);
    state.skipCounter = 0;
    setNextPlayer();
    showStartRoundScreen();
}
export function showFinalScreen() {
    savePlayedCardsToActiveArchive();
    const container = document.getElementById("finalTeamsContainer");
    const twoTeamContainer = document.getElementById("finalTwoTeamContainer");
    const maxPoints = state.totalPoints.length ? Math.max(...state.totalPoints) : 0;
    const winningTeamIndexes = new Set(state.totalPoints
        .map((points, index) => points === maxPoints ? index : -1)
        .filter(index => index !== -1));

    if (state.totalTeams > 2 && container) {
        if (twoTeamContainer) twoTeamContainer.style.display = 'none';
        container.style.display = 'grid';
        container.innerHTML = '';
        const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
        
        state.teams.forEach((team, idx) => {
            const box = document.createElement("div");
            box.className = "team-overview-card";
            if (winningTeamIndexes.has(idx)) {
                box.classList.add("winner-team");
            }
            
            const title = document.createElement("h3");
            title.textContent = `${teamEmojis[idx % teamEmojis.length]} Team ${idx + 1}`;
            box.appendChild(title);
            
            const points = document.createElement("p");
            points.textContent = `Punkte: ${formatPoints(state.totalPoints[idx])}${formatPenalty(state.penaltyPoints[idx])}`;
            points.className = "team-points";
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
    if (state.totalTeams === 2) {
        if (twoTeamContainer) twoTeamContainer.style.display = 'flex';
        const finalTeamACard = document.getElementById("finalTeamACard");
        const finalTeamBCard = document.getElementById("finalTeamBCard");
        if (finalTeamACard) finalTeamACard.classList.toggle("winner-team", winningTeamIndexes.has(0));
        if (finalTeamBCard) finalTeamBCard.classList.toggle("winner-team", winningTeamIndexes.has(1));
        const finalTeamA = document.getElementById("finalTeamA");
        const finalTeamB = document.getElementById("finalTeamB");
        if (finalTeamA && state.teams[0]) {
            finalTeamA.innerHTML = "";
            state.teams[0].forEach(player => {
                const row = document.createElement("tr");
                const nameCell = document.createElement("td");
                nameCell.textContent = player.name;
                nameCell.className = "final-name-cell";
                const handicapCell = document.createElement("td");
                handicapCell.textContent = player.handicap ? "✓" : "";
                handicapCell.className = "final-handicap-cell";
                row.appendChild(nameCell);
                row.appendChild(handicapCell);
                finalTeamA.appendChild(row);
            });
        }
        if (finalTeamB && state.teams[1]) {
            finalTeamB.innerHTML = "";
            state.teams[1].forEach(player => {
                const row = document.createElement("tr");
                const nameCell = document.createElement("td");
                nameCell.textContent = player.name;
                nameCell.className = "final-name-cell";
                const handicapCell = document.createElement("td");
                handicapCell.textContent = player.handicap ? "✓" : "";
                handicapCell.className = "final-handicap-cell";
                row.appendChild(nameCell);
                row.appendChild(handicapCell);
                finalTeamB.appendChild(row);
            });
        }
        
        // Update total points display
        if (state.totalPoints[0] !== undefined) {
            const finalPointsA = document.getElementById("finalPointsA");
            if (finalPointsA) finalPointsA.textContent = formatPoints(state.totalPoints[0]);
            const finalPenaltyA = document.getElementById("finalPenaltyA");
            if (finalPenaltyA) finalPenaltyA.textContent = formatPenalty(state.penaltyPoints[0]);
        }
        if (state.totalPoints[1] !== undefined) {
            const finalPointsB = document.getElementById("finalPointsB");
            if (finalPointsB) finalPointsB.textContent = formatPoints(state.totalPoints[1]);
            const finalPenaltyB = document.getElementById("finalPenaltyB");
            if (finalPenaltyB) finalPenaltyB.textContent = formatPenalty(state.penaltyPoints[1]);
        }
    }
    
    showScreen("end");
}
export function setActionButtonsEnabled(enabled) {
    const correctButton = document.getElementById("btnCorrect");
    const mistakeButton = document.getElementById("btnMistake");
    if (correctButton) correctButton.disabled = !enabled;
    if (mistakeButton) mistakeButton.disabled = !enabled;
}
let startRoundDialogOpen = false;
export async function confirmStartRound() {
    if (startRoundDialogOpen || state.isTimerRunning) return;
    startRoundDialogOpen = true;
    // Audio muss direkt im Klick freigeschaltet werden (iOS), daher onOk statt nach dem await
    const ready = await appConfirm("Bist du bereit, deinen Timer zu starten?\nDeine Zeit beginnt sofort.", {
        title: "Bereit?", okText: "Start", cancelText: "Noch nicht", onOk: unlockGameAudio
    });
    startRoundDialogOpen = false;
    if (ready) startRoundTimer();
}
// === Pause Game ===
export function pauseGame() {
    try { if (state.timer) { clearInterval(state.timer); state.timer = undefined; } } catch (e) {}
    state.isTimerRunning = false;
    if (cancelPenalty()) state.penaltyInterruptedByPause = true;

    // Erstelle Overlay
    let pauseOverlay = document.getElementById("pauseOverlay");
    if (!pauseOverlay) {
        pauseOverlay = document.createElement("div");
        pauseOverlay.className = "overlay";
        pauseOverlay.id = "pauseOverlay";

    const box = document.createElement("div");
    box.className = "overlay-box";

        const title = document.createElement("h2");
        title.className = "overlay-title";
        title.textContent = "⏸️ Pause";
        box.appendChild(title);

        const btnContinue = document.createElement("button");
        btnContinue.className = "pause-continue-btn";
        btnContinue.textContent = "▶️ Weiter";
        btnContinue.onclick = function () {
            document.body.removeChild(pauseOverlay);
            resumeTimer();
        };
        box.appendChild(btnContinue);

        const btnPlus3 = document.createElement("button");
        btnPlus3.className = "pause-plus-btn";
        btnPlus3.textContent = "+3";
        btnPlus3.onclick = function () {
            state.remainingTime += 3;
            document.getElementById("timerDisplay").textContent = `${state.remainingTime}s`;
            document.body.removeChild(pauseOverlay);
            resumeTimer();
        };
        box.appendChild(btnPlus3);

        pauseOverlay.appendChild(box);
        document.body.appendChild(pauseOverlay);
    }
}
// Hilfsfunktion zum Fortsetzen des Timers
export function resumeTimer() {
    // prevent duplicate starts
    if (state.isTimerRunning) return;
    if (state.penaltyInterruptedByPause) {
        // Strafzeit wurde durch die Pause beendet: direkt mit der nächsten Karte weitermachen
        state.penaltyInterruptedByPause = false;
        showNextCard();
        if (document.getElementById("guessedOverlay")) return;
    }
    // mark as running immediately to prevent re-entrant starts
    state.isTimerRunning = true;
    // ensure no duplicate timer
    try { if (state.timer) { clearInterval(state.timer); state.timer = undefined; } } catch (e) {}
    state.timer = setInterval(() => {
        state.remainingTime--;
        document.getElementById("timerDisplay").textContent = `${state.remainingTime}s`;
        // play a short tick for the last 5 seconds
        if (state.remainingTime > 0 && state.remainingTime <= 5) {
            playTick();
        }
        if (state.remainingTime <= 0) {
            clearInterval(state.timer);
            state.timer = undefined;
            state.isTimerRunning = false;
            try { playEndAlarm(); } catch (e) {}
            stopTick();
            showGuessedCardsAfterTimer();
        }
    }, 1000);
    state.isTimerRunning = true;
}
// === Guessed Cards ===
export function showGuessedCardsAfterTimer(playAlarm = true) {
    // ensure no timer remains running
    try { if (state.timer) { clearInterval(state.timer); state.timer = undefined; } } catch (e) {}
    cancelPenalty();
    state.penaltyInterruptedByPause = false;
    state.isTimerRunning = false;
    if (playAlarm) {
        try { playEndAlarm(); } catch (e) {}
    }
    try { const sb = document.getElementById('startRoundBtn'); if (sb) sb.disabled = false; } catch (e) {}
    
    // Erstelle Overlay
    let guessedOverlay = document.getElementById("guessedOverlay");
    if (guessedOverlay) guessedOverlay.remove();

    guessedOverlay = document.createElement("div");
    guessedOverlay.className = "overlay";
    guessedOverlay.id = "guessedOverlay";

    const box = document.createElement("div");
    box.className = "overlay-box";

    // Zuerst: Zwei Hauptoptionen anzeigen
    const title = document.createElement("h2");
    title.className = "overlay-title";
    title.textContent = "⏱️ Zeit vorbei!";
    box.appendChild(title);

    const btnCorrect = document.createElement("button");
    btnCorrect.className = "time-up-correct-btn";
    btnCorrect.textContent = "✏️ Karten korrigieren";
    btnCorrect.onclick = function () {
        // Zeige den Korrektur-Bildschirm mit Kartenliste
        showCardCorrectionScreen(guessedOverlay);
    };
    box.appendChild(btnCorrect);

    if (state.currentCard && state.currentCards.some(card => isSameCard(card, state.currentCard))) {
        const btnLastCorrect = document.createElement("button");
        btnLastCorrect.className = "time-up-last-card-btn";
        btnLastCorrect.textContent = `✅ "${state.currentCard.begriff}" richtig`;
        btnLastCorrect.onclick = function () {
            if (markCurrentCardCorrectAfterTimer()) {
                showGuessedCardsAfterTimer(false);
            }
        };
        box.appendChild(btnLastCorrect);
    }

    const btnSkip = document.createElement("button");
    btnSkip.className = "time-up-next-btn";
    btnSkip.textContent = "➡️ Nächster Spieler";
    btnSkip.onclick = function () {
        document.body.removeChild(guessedOverlay);
        endRound();
    };
    box.appendChild(btnSkip);

    guessedOverlay.appendChild(box);
    document.body.appendChild(guessedOverlay);
}
// Hilfsfunktion zum Anzeigen des Korrektur-Bildschirms
export function showCardCorrectionScreen(guessedOverlay) {
    // Lösche den aktuellen Inhalt des box Elements
    const guessedOverlayNew = document.getElementById("guessedOverlay");
    if (!guessedOverlayNew) return;
    
    const box = guessedOverlayNew.querySelector("div");
    if (!box) return;
    
    // Leere das box Element
    box.innerHTML = "";

    const title = document.createElement("h2");
    title.className = "correction-title";
    title.textContent = "✅ Erratene Karten";
    box.appendChild(title);

    // Liste der erratenen Karten
    const list = document.createElement("ul");
    list.className = "correction-list";

    // Kopie für Manipulation
    const guessed = [...state.correctCards[state.activeTeamIndex]];

    guessed.forEach((card, idx) => {
        const li = document.createElement("li");
        li.className = "correction-item";

        const begriff = document.createElement("span");
        begriff.className = "correction-term";
        begriff.textContent = card.begriff;
        li.appendChild(begriff);

        const btn = document.createElement("button");
        btn.className = "correction-mistake-btn";
        btn.textContent = "Fehler";
        btn.onclick = async function () {
            // Bestätigung vor dem Entfernen
            if (await appConfirm("Willst du wirklich, dass diese Karte ein Fehler war?", { okText: "Ja, Fehler" })) {
                // Karte aus der richtigen Liste entfernen
                state.correctCards[state.activeTeamIndex] = state.correctCards[state.activeTeamIndex].filter(c => c !== card);
                // Karte zurück in den Stapel der aktuellen Runde
                state.currentCards.push(card);
                // Element aus der Liste entfernen
                li.remove();
            }
        };
        li.appendChild(btn);

        list.appendChild(li);
    });

    box.appendChild(list);

    // Button zum Zurückkehren in den Zeit-vorbei-Dialog
    const btnOk = document.createElement("button");
    btnOk.className = "correction-back-btn";
    btnOk.textContent = "Zurück";
    btnOk.onclick = function () {
        showGuessedCardsAfterTimer(false);
    };
    box.appendChild(btnOk);
}
export function resetGameState() {
    try { if (state.timer) { clearInterval(state.timer); } } catch (e) {}
    // Spielverlauf-Variablen zurücksetzen (Settings & Karten bleiben erhalten)
    state.currentRound = 0;
    state.totalRounds = 1;
    state.teams = [];
    state.currentCardPlayerIndex = 0;
    state.shuffledCardPool = [];
    state.playerCardCount = 0;
    state.cardSelectionTargetCount = 0;
    state.playingCards = [];
    state.currentCards = [];
    state.currentCard = null;
    state.correctCards = [];
    state.roundPointsApplied = false;
    state.teamMistakes = [];
    state.activeTeamIndex = 0;
    state.activePlayerIndexInTeam = -1;
    state.teamTurnOrder = [];
    state.teamTurnOrderPosition = -1;
    state.activePlayerIndicesByTeam = [];
    state.activePlayer = null;
    state.timer = undefined;
    state.isTimerRunning = false;
    state.remainingTime = 0;
    state.displayedCards = [];
    state.skippedThisTurn = [];
    state.skipCounter = 0;
    cancelPenalty();
    state.penaltyInterruptedByPause = false;
    state.totalPoints = [];
    state.penaltyPoints = [];
    state.showingExplanation = false;
    state.cardsWereShown = false;
    state.allowCardClick = false;
    state.activeArchiveId = null;
    refreshStartCardStatus();
    resetCardSelectionUi();
    // UI zurücksetzen (optional)
    document.getElementById("playerInput").value = "";
    // ggf. weitere UI-Elemente zurücksetzen
}