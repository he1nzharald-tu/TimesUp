// Oberfläche: Bildschirme, Dialoge, Spieler- und Teamlisten
import { state } from "./state.js";
import { removePlayer, toggleHandicap, togglePlayerTeam } from "./game.js";

export function appendText(parent, tagName, text) {
    const el = document.createElement(tagName);
    el.textContent = text;
    parent.appendChild(el);
    return el;
}
// === Eigene Dialoge (ersetzen alert/confirm) ===
// showAppDialog liefert ein Promise: true = OK, false = Abbrechen.
// onOk läuft synchron im Klick, z. B. um Audio unter iOS freizuschalten.
let dialogQueue = Promise.resolve();
export function showAppDialog({ message, title = "", okText = "OK", cancelText = null, danger = false, onOk = null }) {
    const run = () => new Promise(resolve => {
        const previousFocus = document.activeElement;
        const backdrop = document.createElement("div");
        backdrop.className = "app-dialog-backdrop";

        const dialog = document.createElement("div");
        dialog.className = "app-dialog";
        dialog.setAttribute("role", cancelText ? "alertdialog" : "dialog");
        dialog.setAttribute("aria-modal", "true");

        if (title) {
            const heading = appendText(dialog, "h2", title);
            heading.className = "app-dialog-title";
            heading.id = "appDialogTitle";
            dialog.setAttribute("aria-labelledby", heading.id);
        }
        const text = appendText(dialog, "p", message);
        text.className = "app-dialog-message";
        text.id = "appDialogMessage";
        dialog.setAttribute("aria-describedby", text.id);

        const actions = document.createElement("div");
        actions.className = "app-dialog-actions";
        let cancelBtn = null;
        if (cancelText) {
            cancelBtn = appendText(actions, "button", cancelText);
            cancelBtn.type = "button";
            cancelBtn.className = "secondary";
            cancelBtn.setAttribute("data-dialog-cancel", "");
        }
        const okBtn = appendText(actions, "button", okText);
        okBtn.type = "button";
        okBtn.setAttribute("data-dialog-ok", "");
        if (danger) okBtn.classList.add("danger");
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);

        const close = result => {
            document.removeEventListener("keydown", onKey, true);
            backdrop.remove();
            if (previousFocus && typeof previousFocus.focus === "function") {
                try { previousFocus.focus({ preventScroll: true }); } catch (e) {}
            }
            resolve(result);
        };
        const onKey = event => {
            if (event.key === "Escape") {
                event.preventDefault();
                close(false);
            } else if (event.key === "Enter" && document.activeElement !== cancelBtn) {
                event.preventDefault();
                okBtn.click();
            } else if (event.key === "Tab") {
                // Fokus im Dialog halten
                const buttons = [cancelBtn, okBtn].filter(Boolean);
                const index = buttons.indexOf(document.activeElement);
                event.preventDefault();
                buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
            }
        };
        okBtn.addEventListener("click", () => {
            if (onOk) {
                try { onOk(); } catch (e) { console.error(e); }
            }
            close(true);
        });
        if (cancelBtn) cancelBtn.addEventListener("click", () => close(false));
        backdrop.addEventListener("click", event => {
            if (event.target === backdrop) close(!cancelText);
        });
        document.addEventListener("keydown", onKey, true);

        document.body.appendChild(backdrop);
        okBtn.focus({ preventScroll: true });
    });

    const result = dialogQueue.then(run);
    dialogQueue = result.catch(() => {});
    return result;
}
export function appAlert(message, options = {}) {
    return showAppDialog({ message, ...options });
}
export function appConfirm(message, options = {}) {
    return showAppDialog({ message, okText: "OK", cancelText: "Abbrechen", ...options });
}
export function updatePlayerTable() {
    const tbody = document.getElementById("playerTableBody");
    if (!tbody) return;
    tbody.innerHTML = '';
    state.players.forEach(p => {
        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.setAttribute("data-label", "Spielername");
        appendText(tdName, "span", p.name).className = "player-name-chip";
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
        tdRemove.className = "remove-cell";
        const btn = document.createElement("button");
        btn.textContent = "❌ Entfernen";
        btn.onclick = () => removePlayer(p.name);
        tdRemove.appendChild(btn);
        tr.appendChild(tdRemove);

        tbody.appendChild(tr);
    });
}
// === UI Helpers ===
export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(div => div.classList.remove('active'));
    const screen = document.getElementById('screen-' + id);
    if (!screen) return;
    screen.classList.add('active');
    if (id === "start") {
        refreshStartCardStatus();
    }
}
export function renderTeamPlayerList() {
    const tbody = document.getElementById("teamPlayerTableBody");
    tbody.innerHTML = '';
    state.players.forEach(p => {
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
export function displayTeams() {
    const container = document.getElementById("teamsContainer");
    if (!container) return;
    const legacyContainer = document.getElementById("teamOverviewLegacy");
    const legacyTeamA = document.getElementById("teamOverviewTeamA");
    const legacyTeamB = document.getElementById("teamOverviewTeamB");
    
    container.innerHTML = '';
    if (legacyTeamA) legacyTeamA.innerHTML = '';
    if (legacyTeamB) legacyTeamB.innerHTML = '';

    if (state.totalTeams === 2 && legacyContainer && legacyTeamA && legacyTeamB) {
        legacyContainer.style.display = 'flex';
        container.style.display = 'none';

        [legacyTeamA, legacyTeamB].forEach((list, teamIdx) => {
            (state.teams[teamIdx] || []).forEach(p => {
                const li = document.createElement("li");
                li.textContent = p.name + (p.handicap ? " 🧩" : "");
                li.className = "team-member";
                li.onclick = () => togglePlayerTeam(p.name, teamIdx);
                list.appendChild(li);
            });
        });
        return;
    }

    if (legacyContainer) legacyContainer.style.display = 'none';
    container.style.display = 'grid';

    const teamEmojis = ['🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚫', '⚪'];
    
    state.teams.forEach((team, teamIdx) => {
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
// === Card Selection ===
export function updateKartenStatusText(text) {
    const el = document.getElementById("kartenStatusText");
    if (el) el.textContent = text;
}
export function setCardLoadStatusText(text) {
    state.cardLoadStatusText = text;
    if (!state.activeArchiveId) {
        updateKartenStatusText(state.cardLoadStatusText);
    }
}
export function refreshStartCardStatus() {
    if (!state.activeArchiveId) {
        updateKartenStatusText(state.cardLoadStatusText);
    }
}