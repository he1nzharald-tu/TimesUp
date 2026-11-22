// Einstellungen: Speichern/Laden, Rundeneinstellungen, Design
import { DEFAULT_TURN_SECONDS, SETTINGS_STORAGE_KEY, state } from "./state.js";
import { appAlert, showScreen } from "./ui.js";
import { getCardFilter, getDefaultCardFilter, setCardFilter } from "./filter.js";
import { afterRoundsRendered, refreshSettingsUi } from "./settingsui.js";

export function readJsonStore(key, fallback = {}) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (e) {
        return fallback;
    }
}
export function writeJsonStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
}
// Punktabzug pro Regelverstoß: "no" | "yes" (−1) | "draw" (Remi, −0,5).
// Früher hing er an der Strafzeit (punishPoints galt nur bei aktiver Strafzeit) – alte Einstellungen so übernehmen.
export function getPenaltyMode(settings) {
    const valid = ["no", "yes", "draw"];
    if (valid.includes(settings.penaltyPoints)) return settings.penaltyPoints;
    if (settings.punishEnabled && valid.includes(settings.punishPoints)) return settings.punishPoints;
    return "no";
}

export function getSettings() {
    return readJsonStore(SETTINGS_STORAGE_KEY, {});
}
export function toPositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}
export function getDefaultRuleOptions() {
    return [
        "Nur beschreiben",
        "Nur ein Wort",
        "Pantomime und Geräusche",
        "Nur einsilbig beschreiben"
    ];
}
// === Round Settings ===
export function renderRoundSettings() {
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

        div.dataset.round = String(i);
        div.innerHTML = `
        <button type="button" class="round-head" aria-expanded="false" aria-controls="roundBody${i}">
          <span class="round-head-text"><span class="round-title">Runde ${i}: <span class="round-rule-name"></span></span>
          <span class="round-summary"></span></span><span class="round-edit">Bearbeiten</span>
        </button>
        <div class="round-body" id="roundBody${i}" hidden>
          <label class="set-title" for="rule${i}">Regel</label>
          <select id="rule${i}" class="as-choice" onchange="toggleCustomRuleInput(${i}, true)">
            <option value="">-- bitte auswählen --</option>
            ${ruleOptions.map(rule =>
              `<option value="${rule}" ${selectedRule === rule ? "selected" : ""}>${rule}</option>`
          ).join("")}
            <option value="custom">Eigene Regel</option>
          </select>
          <input type="text" id="customRule${i}" class="hidden set-text-input" placeholder="Eigene Regel eingeben" />
          <div class="set-row">
            <div class="set-text"><label class="set-title" for="timer${i}">Zeit pro Zug</label><span class="set-help">Sekunden</span></div>
            <div class="stepper" data-unit=" s" data-step-size="5"><button type="button" class="step-btn" data-step="-1" aria-label="Zeit verringern">−</button><input type="number" id="timer${i}" min="10" max="600" value="${DEFAULT_TURN_SECONDS}" inputmode="numeric" /><button type="button" class="step-btn" data-step="1" aria-label="Zeit erhöhen">+</button></div>
          </div>
          <div class="set-row">
            <div class="set-text"><span class="set-title" id="skipAllowed${i}Label">Überspringen</span><span class="set-help">Karten weglegen erlaubt</span></div>
            <select id="skipAllowed${i}" class="as-switch" aria-labelledby="skipAllowed${i}Label" onchange="toggleSkipOptions(${i})">
              <option value="no" ${defaultSkip === "no" ? "selected" : ""}>Nein</option>
              <option value="yes" ${defaultSkip === "yes" ? "selected" : ""}>Ja</option>
            </select>
          </div>
          <div id="skipOptions${i}" class="${defaultSkip === 'yes' ? '' : 'hidden'}">
            <div class="set-row set-row-col">
              <div class="set-text"><span class="set-title" id="skipLimitType${i}Label">Wie oft?</span></div>
              <select id="skipLimitType${i}" class="as-segment" aria-labelledby="skipLimitType${i}Label" onchange="toggleSkipLimitValue(${i})">
                <option value="unlimited" selected>Unbegrenzt</option>
                <option value="limited">Begrenzt</option>
              </select>
            </div>
            <div class="stepper hidden" id="skipLimitStepper${i}"><button type="button" class="step-btn" data-step="-1" aria-label="Limit verringern">−</button><input type="number" id="skipLimitValue${i}" class="hidden" min="1" max="50" value="3" inputmode="numeric" /><button type="button" class="step-btn" data-step="1" aria-label="Limit erhöhen">+</button></div>
            <div class="set-row">
              <div class="set-text"><span class="set-title" id="skipReturn${i}Label">Kommen zurück</span><span class="set-help">Übersprungene Karten im selben Zug erneut</span></div>
              <select id="skipReturn${i}" class="as-switch" aria-labelledby="skipReturn${i}Label">
                <option value="yes" selected>Ja</option>
                <option value="no">Nein</option>
              </select>
            </div>
          </div>
        </div>
      `;
        container.appendChild(div);
        setTimeout(() => {
            const select = document.getElementById(`skipAllowed${i}`);
            if (select) select.value = defaultSkip;
        }, 0);
    }
    afterRoundsRendered();
}
export function toggleSkipOptions(round) {
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
export function restoreSkipOptions(round, settings) {
    const skipAllowed = document.getElementById(`skipAllowed${round}`)?.value === "yes";
    const skipOptions = document.getElementById(`skipOptions${round}`);
    const limitType = document.getElementById(`skipLimitType${round}`);
    const limitValue = document.getElementById(`skipLimitValue${round}`);
    const skipReturn = document.getElementById(`skipReturn${round}`);
    if (skipOptions) skipOptions.classList.toggle("hidden", !skipAllowed);
    const savedType = settings.skipLimitType?.[round - 1];
    const limited = skipAllowed && savedType === "limited";
    if (limitType) limitType.value = limited ? "limited" : "unlimited";
    if (limitValue) {
        limitValue.classList.toggle("hidden", !limited);
        if (limited) limitValue.value = settings.skipLimitValue?.[round - 1] || 3;
    }
    if (skipReturn) skipReturn.value = settings.skipReturn?.[round - 1] === "no" ? "no" : "yes";
}
export function toggleCustomRuleInput(round, focusInput = false) {
    const ruleSelect = document.getElementById(`rule${round}`);
    const customRuleInput = document.getElementById(`customRule${round}`);
    if (!ruleSelect || !customRuleInput) return;

    const isCustomRule = ruleSelect.value === "custom";
    customRuleInput.classList.toggle("hidden", !isCustomRule);
    if (isCustomRule && focusInput) {
        customRuleInput.focus();
    }
}
export function toggleSkipLimitValue(round) {
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
export function validateSettingsAndGoBack() {
    const roundCount = parseInt(document.getElementById("roundCount").value);
    for (let i = 1; i <= roundCount; i++) {
        const rule = document.getElementById(`rule${i}`);
        if (!rule || !rule.value || rule.value === "") {
            appAlert(`Bitte wähle eine Regel für Runde ${i}.`, { title: "Regel fehlt" });
            return;
        }
        if (rule.value === "custom") {
            const customRule = document.getElementById(`customRule${i}`)?.value.trim();
            if (!customRule) {
                appAlert(`Bitte gib eine eigene Regel für Runde ${i} ein.`, { title: "Regel fehlt" });
                return;
            }
        }
    }
    saveSettingsToStorage();
    showScreen("start");
}
export function saveSettingsToStorage() {
    const settings = {
        players: state.players,
        cardCount: parseInt(document.getElementById("cardCount").value),
        roundCount: parseInt(document.getElementById("roundCount").value),
        teamCount: parseInt(document.getElementById("teamCount").value || 2),
        roundRules: [],
        roundTimer: [],
        roundSkip: [],
        skipLimitType: [],
        skipLimitValue: [],
        skipReturn: [],
        vetoCount: parseInt(document.getElementById("vetoCount").value),
        handicapEnabled: document.getElementById("handicapEnabled").value === "yes",
        handicapTime: parseInt(document.getElementById("handicapTime").value || 5),
        punishEnabled: document.getElementById("punishEnabled").value === "yes",
        punishTime: parseInt(document.getElementById("punishTime").value || 3),
        penaltyPoints: document.getElementById("penaltyPoints").value,
        cardFilter: getCardFilter()
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
        settings.skipReturn.push(document.getElementById(`skipReturn${i}`)?.value === "no" ? "no" : "yes");
    }
    writeJsonStore(SETTINGS_STORAGE_KEY, settings);
    // also persist theme separately for quicker access
    const themeSel = document.getElementById('themeSelect');
    if (themeSel) localStorage.setItem('timesup_theme', themeSel.value || 'light');
}
export function loadSettingsFromStorage() {
    const settings = getSettings();
    setCardFilter(settings.cardFilter);
    document.getElementById("cardCount").value = settings.cardCount || 40;
    document.getElementById("roundCount").value = settings.roundCount || 3;
    document.getElementById("teamCount").value = settings.teamCount || 2;
    state.totalTeams = settings.teamCount || 2;
    document.getElementById("vetoCount").value = settings.vetoCount || 1;
    document.getElementById("handicapEnabled").value = settings.handicapEnabled ? "yes" : "no";
    toggleHandicapInput();
    document.getElementById("handicapTime").value = settings.handicapTime || 5;
    document.getElementById("punishEnabled").value = settings.punishEnabled ? "yes" : "no";
    togglePunishOptions();
    document.getElementById("punishTime").value = settings.punishTime || 3;
    document.getElementById("penaltyPoints").value = getPenaltyMode(settings);
    renderRoundSettings();
    for (let i = 1; i <= (settings.roundCount || 3); i++) {
        const savedRule = settings.roundRules?.[i - 1] || "";
        const ruleSelect = document.getElementById(`rule${i}`);
        const customRuleInput = document.getElementById(`customRule${i}`);
        if (ruleSelect && Array.isArray(settings.roundRules)) {
            if (savedRule && !getDefaultRuleOptions().includes(savedRule)) {
                ruleSelect.value = "custom";
                if (customRuleInput) customRuleInput.value = savedRule;
            } else {
                ruleSelect.value = savedRule;
                if (customRuleInput) customRuleInput.value = "";
            }
            toggleCustomRuleInput(i);
        }
        document.getElementById(`timer${i}`).value = settings.roundTimer?.[i - 1] || DEFAULT_TURN_SECONDS;
        const skipSelect = document.getElementById(`skipAllowed${i}`);
        if (Array.isArray(settings.roundSkip)) skipSelect.value = settings.roundSkip[i - 1] || "no";
        restoreSkipOptions(i, settings);
    }
    // load theme into selector and apply
    const storedTheme = localStorage.getItem('timesup_theme') || 'light';
    const themeSel = document.getElementById('themeSelect');
    if (themeSel) themeSel.value = storedTheme;
    applyTheme(storedTheme);
    refreshSettingsUi();
}
export function resetAllSettings() {
    setCardFilter(getDefaultCardFilter());
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
    document.getElementById("penaltyPoints").value = "no";
    renderRoundSettings();
    const defaultRules = ["Nur beschreiben", "Nur ein Wort", "Pantomime und Geräusche"];
    const defaultTimers = [DEFAULT_TURN_SECONDS, DEFAULT_TURN_SECONDS, DEFAULT_TURN_SECONDS];
    const defaultSkips = ["no", "yes", "no"];
    for (let i = 1; i <= 3; i++) {
        document.getElementById(`rule${i}`).value = defaultRules[i - 1] || "";
        const customRuleInput = document.getElementById(`customRule${i}`);
        if (customRuleInput) customRuleInput.value = "";
        toggleCustomRuleInput(i);
        document.getElementById(`timer${i}`).value = defaultTimers[i - 1] || DEFAULT_TURN_SECONDS;
        document.getElementById(`skipAllowed${i}`).value = defaultSkips[i - 1] || "no";
    }
    try { localStorage.removeItem(SETTINGS_STORAGE_KEY); } catch (e) {}
    refreshSettingsUi();
}
export function toggleHandicapInput() {
    const enabled = document.getElementById("handicapEnabled").value;
    const container = document.getElementById("handicapTimeContainer");
    container.classList.toggle("hidden", enabled !== "yes");
}
export function togglePunishOptions() {
    const enabled = document.getElementById("punishEnabled").value;
    const container = document.getElementById("punishOptionsContainer");
    container.classList.toggle("hidden", enabled !== "yes");
}
// === Theme (Design) Management ===
export function applyTheme(theme) {
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
export function loadThemeFromStorage() {
    const t = localStorage.getItem('timesup_theme') || 'light';
    applyTheme(t);
}