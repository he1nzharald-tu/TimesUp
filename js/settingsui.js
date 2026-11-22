// Einstellungen (Variante B): Symbolleiste, Stepper, Schalter, Segmentknöpfe, Rundenkarten,
// Kartenfilter-Kacheln und sofortiges Speichern.
// Die eigentlichen Werte stehen weiter in den bekannten Feldern (cardCount, rule1, skipAllowed1, …);
// die Bedienelemente hier spiegeln und ändern nur diese Felder.
import { state } from "./state.js";
import { saveSettingsToStorage } from "./settings.js";
import { countCardsByCategory, getCardFilter, getFilteredCardPool, NSFW_THEME, setCardFilter } from "./filter.js";
import { updateCardFilterStatus } from "./cards.js";

const $ = (id) => document.getElementById(id);
const screen = () => $("screen-settings");
let toastTimer = null;

// ---------- Reiter ----------
export function selectSettingsTab(tab) {
    screen()?.querySelectorAll(".set-tab").forEach(btn => {
        const on = btn.dataset.tab === tab;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    screen()?.querySelectorAll(".set-panel").forEach(panel => {
        const on = panel.id === `settingsPanel-${tab}`;
        panel.classList.toggle("active", on);
        panel.hidden = !on;
    });
}

// ---------- Hinweis „Gespeichert“ ----------
function showSavedToast() {
    const toast = $("settingsToast");
    if (!toast) return;
    toast.textContent = "Gespeichert";
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 1200);
}
function saveNow() {
    saveSettingsToStorage();
    showSavedToast();
}

// ---------- Stepper ----------
function stepInput(btn) {
    const wrap = btn.closest(".stepper");
    const input = wrap?.querySelector("input[type=number]");
    if (!input) return;
    const size = parseInt(wrap.dataset.stepSize || "1", 10);
    const dir = parseInt(btn.dataset.step, 10);
    const min = input.min !== "" ? parseInt(input.min, 10) : -Infinity;
    const max = input.max !== "" ? parseInt(input.max, 10) : Infinity;
    const cur = parseInt(input.value, 10);
    let next = (Number.isFinite(cur) ? cur : (Number.isFinite(min) ? min : 0)) + dir * size;
    next = Math.min(max, Math.max(min, next));
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

// ---------- Auswahlfelder als Schalter / Segmente / Regelknöpfe ----------
function setSelect(select, value) {
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
}
function enhanceSelect(select) {
    if (select.dataset.enhanced) return;
    select.dataset.enhanced = "1";
    select.classList.add("visually-hidden");
    select.tabIndex = -1;
    if (select.classList.contains("as-switch")) {
        const sw = document.createElement("button");
        sw.type = "button";
        sw.className = "switch";
        sw.setAttribute("role", "switch");
        sw.dataset.for = select.id;
        const label = select.getAttribute("aria-labelledby");
        if (label) sw.setAttribute("aria-labelledby", label);
        sw.appendChild(document.createElement("span"));
        sw.addEventListener("click", () => setSelect(select, select.value === "yes" ? "no" : "yes"));
        select.after(sw);
    } else {
        const group = document.createElement("div");
        const isTheme = select.classList.contains("as-theme");
        group.className = isTheme ? "theme-grid" : select.classList.contains("as-choice") ? "choice-grid" : "segment";
        group.dataset.for = select.id;
        group.setAttribute("role", "group");
        const label = select.getAttribute("aria-labelledby");
        if (label) group.setAttribute("aria-labelledby", label);
        for (const opt of select.options) {
            if (!opt.value) continue;               // „bitte auswählen“
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.value = opt.value;
            if (isTheme) {
                // Design-Kachel mit kleiner Farbvorschau
                const sw = document.createElement("span");
                sw.className = `theme-swatch theme-swatch-${opt.value}`;
                sw.setAttribute("aria-hidden", "true");
                b.appendChild(sw);
                b.appendChild(document.createTextNode(opt.textContent));
            } else {
                b.textContent = opt.textContent;
            }
            b.addEventListener("click", () => setSelect(select, opt.value));
            group.appendChild(b);
        }
        select.after(group);
    }
}
function syncEnhanced(root = screen()) {
    if (!root) return;
    root.querySelectorAll("select.as-switch, select.as-segment, select.as-choice, select.as-theme").forEach(enhanceSelect);
    root.querySelectorAll(".switch[data-for]").forEach(sw => {
        const on = $(sw.dataset.for)?.value === "yes";
        sw.setAttribute("aria-checked", on ? "true" : "false");
    });
    root.querySelectorAll(".segment[data-for], .choice-grid[data-for], .theme-grid[data-for]").forEach(group => {
        const value = $(group.dataset.for)?.value;
        group.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.value === value ? "true" : "false"));
    });
    // Stepper für das Überspringen-Limit folgt der Sichtbarkeit seines Feldes
    root.querySelectorAll("input[id^=skipLimitValue]").forEach(input => {
        input.closest(".stepper")?.classList.toggle("hidden", input.classList.contains("hidden"));
    });
    updateRoundSummaries(root);
}

// ---------- Rundenkarten ----------
function updateRoundSummaries(root = screen()) {
    root?.querySelectorAll(".round-settings[data-round]").forEach(card => {
        const i = card.dataset.round;
        const rule = $(`rule${i}`);
        const custom = $(`customRule${i}`);
        const ruleText = rule?.value === "custom" ? (custom?.value.trim() || "Eigene Regel") : (rule?.value || "Regel wählen");
        const skip = $(`skipAllowed${i}`)?.value === "yes";
        const limited = $(`skipLimitType${i}`)?.value === "limited";
        const skipText = !skip ? "Kein Überspringen" : (limited ? `Überspringen max. ${$(`skipLimitValue${i}`)?.value || 3}×` : "Überspringen erlaubt");
        const name = card.querySelector(".round-rule-name");
        const summary = card.querySelector(".round-summary");
        if (name) name.textContent = ruleText;
        if (summary) summary.textContent = `${$(`timer${i}`)?.value || "?"} s · ${skipText}`;
    });
}
function toggleRoundCard(head) {
    const body = $(head.getAttribute("aria-controls"));
    if (!body) return;
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute("aria-expanded", open ? "true" : "false");
    head.closest(".round-settings")?.classList.toggle("open", open);
}

// ---------- Kartenfilter ----------
const allIds = (list) => list.map(x => x.id);
function toggleId(current, all, id) {
    const set = new Set(current ?? all);
    if (set.has(id)) set.delete(id); else set.add(id);
    const list = all.filter(x => set.has(x));
    return list.length === all.length ? null : list;
}
function applyFilter(patch) {
    setCardFilter({ ...getCardFilter(), ...patch });
    saveNow();
    updateCardFilterStatus();
    renderCardFilterUi();
}
export function renderCardFilterUi() {
    const k = state.kategorien;
    if (!k || !$("levelButtons")) return;
    const f = getCardFilter();
    const counts = countCardsByCategory(state.cardPool);
    const levelIds = allIds(k.stufen);
    const themeIds = allIds(k.themen.filter(t => t.id !== NSFW_THEME));

    const levelBox = $("levelButtons");
    levelBox.replaceChildren(...k.stufen.map(s => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "level-btn";
        b.dataset.level = s.id;
        b.setAttribute("aria-pressed", (!f.levels || f.levels.includes(s.id)) ? "true" : "false");
        b.title = s.beschreibung || "";
        b.innerHTML = `<span></span><small></small>`;
        b.firstChild.textContent = s.name;
        b.lastChild.textContent = String(counts.levels[s.id] || 0);
        b.addEventListener("click", () => applyFilter({ levels: toggleId(f.levels, levelIds, s.id) }));
        return b;
    }));

    const chip = (t) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.dataset.theme = t.id;
        b.setAttribute("aria-pressed", (!f.themes || f.themes.includes(t.id)) ? "true" : "false");
        b.append(document.createTextNode(t.name + " "));
        const small = document.createElement("small");
        small.textContent = String(counts.themes[t.id] || 0);
        b.append(small);
        b.addEventListener("click", () => applyFilter({ themes: toggleId(f.themes, themeIds, t.id) }));
        return b;
    };
    $("themeChipsAllgemein").replaceChildren(...k.themen.filter(t => t.gruppe === "allgemein").map(chip));
    $("themeChipsNerd").replaceChildren(...k.themen.filter(t => t.gruppe === "nerd").map(chip));
    const allThemes = !f.themes;
    const themesBtn = $("themesAllBtn");
    themesBtn.textContent = allThemes ? "Keine" : "Alle";
    themesBtn.onclick = () => applyFilter({ themes: allThemes ? [] : null });

    const nsfw = $("nsfwSwitch");
    nsfw.setAttribute("aria-checked", f.nsfw ? "true" : "false");
    nsfw.onclick = () => applyFilter({ nsfw: !getCardFilter().nsfw });

    const deckIds = allIds(k.decks);
    $("deckTiles").replaceChildren(...k.decks.map(d => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "deck-tile";
        b.dataset.deck = d.id;
        b.setAttribute("aria-pressed", f.decks.includes(d.id) ? "true" : "false");
        const name = document.createElement("span");
        name.className = "deck-name";
        name.textContent = d.name;
        const meta = document.createElement("small");
        meta.textContent = `${counts.decks[d.id] || 0} Karten`;
        b.append(name, meta);
        b.addEventListener("click", () => {
            const set = new Set(getCardFilter().decks);
            if (set.has(d.id)) set.delete(d.id); else set.add(d.id);
            applyFilter({ decks: deckIds.filter(x => set.has(x)) });
        });
        return b;
    }));
    const allDecks = deckIds.length > 0 && deckIds.every(id => f.decks.includes(id));
    const decksBtn = $("decksAllBtn");
    decksBtn.textContent = allDecks ? "Keine" : "Alle";
    decksBtn.onclick = () => applyFilter({ decks: allDecks ? [] : deckIds });

    updateCardMatchInfo();
}
export function updateCardMatchInfo() {
    const info = $("cardMatchInfo");
    const warn = $("cardMatchWarning");
    if (!info || !warn) return;
    if (!state.cardPool.length) { info.textContent = "Karten werden geladen …"; warn.classList.add("hidden"); return; }
    const matching = getFilteredCardPool().length;
    const wanted = parseInt($("cardCount")?.value, 10) || 0;
    info.textContent = `${matching.toLocaleString("de-DE")} Karten passen zur Auswahl`;
    if (matching === 0) {
        warn.textContent = "Keine Karte passt. Wähle mehr Stufen, Themen oder Decks.";
    } else if (matching < wanted) {
        warn.textContent = `Zu wenige Karten für ${wanted} pro Spiel. Wähle mehr Stufen, Themen oder Decks.`;
    } else {
        warn.textContent = "";
    }
    warn.classList.toggle("hidden", !warn.textContent);
}

// ---------- Alles aktualisieren (nach Laden, Standardwerten, neuen Runden) ----------
export function refreshSettingsUi() {
    syncEnhanced();
    renderCardFilterUi();
}

export function initSettingsUi() {
    const root = screen();
    if (!root || root.dataset.uiReady) return;
    root.dataset.uiReady = "1";
    root.addEventListener("click", (e) => {
        const tab = e.target.closest(".set-tab");
        if (tab) { selectSettingsTab(tab.dataset.tab); return; }
        const step = e.target.closest(".step-btn");
        if (step) { stepInput(step); return; }
        const head = e.target.closest(".round-head");
        if (head) toggleRoundCard(head);
    });
    // Jede Änderung sofort speichern und die Anzeige nachziehen
    root.addEventListener("change", (e) => {
        if (e.target.id === "roundCount") return;   // renderRoundSettings baut neu; danach speichern wir
        // Die onchange-Handler am Feld selbst (toggleSkipOptions …) sind beim Hochblubbern schon gelaufen
        syncEnhanced();
        updateCardMatchInfo();
        saveNow();
    });
    root.addEventListener("input", (e) => {
        if (e.target.id === "cardCount") updateCardMatchInfo();
        if (/^(timer|customRule|skipLimitValue)\d+$/.test(e.target.id)) updateRoundSummaries();
    });
    syncEnhanced();
}

// Nach dem Neuaufbau der Runden (andere Rundenzahl) speichern
export function afterRoundsRendered() {
    syncEnhanced();
    if (screen()?.classList.contains("active")) saveNow();
}
