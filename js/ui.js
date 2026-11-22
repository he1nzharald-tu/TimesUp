// Oberfläche: Bildschirme, Dialoge, Spieler- und Teamlisten
import { state } from "./state.js";
import { removePlayer, toggleHandicap, togglePlayerTeam } from "./game.js";
import { icon, renderTeamCards } from "./teamview.js";

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
    const list = document.getElementById("playerList");
    if (!list) return;
    list.textContent = "";
    state.players.forEach(p => {
        const li = document.createElement("li");
        li.className = "player-row";

        const name = appendText(li, "span", p.name);
        name.className = "player-name-chip";

        // Handicap als Schalter (mehr Zeit für diesen Spieler)
        const label = document.createElement("label");
        label.className = "player-handicap";
        label.title = "Handicap: mehr Zeit";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "handicap-check";
        checkbox.checked = p.handicap;
        checkbox.setAttribute("aria-label", `Handicap für ${p.name}`);
        checkbox.onchange = () => toggleHandicap(p.name, checkbox.checked);
        label.appendChild(checkbox);
        label.appendChild(icon("handicap"));
        li.appendChild(label);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "icon-btn player-remove";
        btn.setAttribute("aria-label", `${p.name} entfernen`);
        btn.title = "Entfernen";
        btn.appendChild(icon("trash"));
        btn.onclick = () => removePlayer(p.name);
        li.appendChild(btn);

        list.appendChild(li);
    });
    const count = document.getElementById("playerCount");
    if (count) count.textContent = String(state.players.length);
    const empty = document.getElementById("playerEmptyHint");
    if (empty) empty.hidden = state.players.length > 0;
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
    const list = document.getElementById("teamPlayerList");
    if (!list) return;
    list.textContent = "";
    state.players.forEach(p => {
        const li = appendText(list, "li", p.name);
        li.className = "name-chip";
        if (p.handicap) li.appendChild(icon("handicap", "ico ico-handicap"));
    });
}
export function displayTeams() {
    renderTeamCards(document.getElementById("teamsContainer"), {
        teams: state.teams,
        onPlayerClick: (name, teamIdx) => togglePlayerTeam(name, teamIdx)
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