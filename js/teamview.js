// Teams einheitlich darstellen: Teamübersicht, Spielübersicht, Rundenstatistik, Spielende
// (vorher vier eigene Varianten, je eine für 2 und für 3+ Teams)

export const TEAM_COLORS = ['#ff7675', '#00b894', '#3498db', '#f39c12', '#9b59b6', '#e84393', '#1abc9c', '#34495e'];

export function teamLetter(index) {
    return String.fromCharCode(65 + (index % 26));
}
export function teamName(index) {
    return `Team ${teamLetter(index)}`;
}
export function teamColor(index) {
    return TEAM_COLORS[index % TEAM_COLORS.length];
}

// Kleines Linien-Symbol aus dem Sprite in index.html
export function icon(name, className = "ico") {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", `#i-${name}`);
    svg.appendChild(use);
    return svg;
}

// Knopfinhalt: Symbol + Text
export function setButtonContent(button, iconName, text) {
    button.textContent = "";
    if (iconName) button.appendChild(icon(iconName));
    const span = document.createElement("span");
    span.textContent = text;
    button.appendChild(span);
    return button;
}

/**
 * Teamkarten in einen Container zeichnen.
 * options:
 *   teams          Array von Spieler-Arrays ({name, handicap})
 *   points         Punkte je Team (optional)
 *   penalties      Strafpunkte je Team (optional, Text über formatPenalty)
 *   winners        Set mit Gewinner-Indizes (optional)
 *   activeIndex    hervorgehobenes Team (optional)
 *   onPlayerClick  (name, teamIndex) => void, macht Namen antippbar
 *   idPrefix       vergibt IDs für Punkte/Strafe von Team A/B, z. B. "final" -> finalPointsA, finalPenaltyA
 *   formatPoints, formatPenalty  Formatierer aus game.js
 */
export function renderTeamCards(container, options) {
    if (!container) return;
    const { teams = [], points = null, penalties = null, winners = null, activeIndex = null, onPlayerClick = null,
        idPrefix = null, formatPoints = v => String(v), formatPenalty = () => "", showHandicap = true } = options;
    container.textContent = "";
    container.dataset.teams = String(teams.length);
    teams.forEach((team, idx) => {
        const card = document.createElement("section");
        card.className = "team-card team-overview-card";
        card.dataset.team = String(idx);
        card.style.setProperty("--team", teamColor(idx));
        if (winners && winners.has(idx)) card.classList.add("winner-team");
        if (activeIndex === idx) card.classList.add("is-active");

        const head = document.createElement("div");
        head.className = "team-card-head";
        const dot = document.createElement("span");
        dot.className = "team-dot";
        head.appendChild(dot);
        const title = document.createElement("h3");
        title.textContent = teamName(idx);
        head.appendChild(title);
        const count = document.createElement("span");
        count.className = "team-count";
        count.textContent = `${team.length} Spieler`;
        head.appendChild(count);
        card.appendChild(head);

        if (points) {
            const p = document.createElement("p");
            p.className = "team-points";
            const value = document.createElement("span");
            value.className = "team-points-value";
            value.dataset.points = String(points[idx] || 0);
            value.textContent = formatPoints(points[idx]);
            if (idPrefix && idx < 2) value.id = `${idPrefix}Points${teamLetter(idx)}`;
            p.appendChild(value);
            const unit = document.createElement("span");
            unit.className = "team-points-unit";
            unit.textContent = " Punkte";
            p.appendChild(unit);
            const pen = document.createElement("span");
            pen.className = "penalty-note";
            if (idPrefix && idx < 2) pen.id = `${idPrefix}Penalty${teamLetter(idx)}`;
            pen.textContent = penalties ? formatPenalty(penalties[idx]) : "";
            p.appendChild(pen);
            card.appendChild(p);
        }

        const list = document.createElement("ul");
        list.className = "team-members";
        team.forEach(player => {
            const li = document.createElement("li");
            li.className = "team-member";
            const name = document.createElement("span");
            name.className = "team-member-name";
            name.textContent = player.name;
            if (onPlayerClick) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "team-member-btn";
                btn.setAttribute("aria-label", `${player.name} ins nächste Team schieben`);
                btn.appendChild(name);
                if (showHandicap && player.handicap) btn.appendChild(icon("handicap", "ico ico-handicap"));
                btn.appendChild(icon("swap", "ico ico-swap"));
                btn.onclick = () => onPlayerClick(player.name, idx);
                li.appendChild(btn);
            } else {
                li.appendChild(name);
                if (showHandicap && player.handicap) {
                    const h = icon("handicap", "ico ico-handicap");
                    li.appendChild(h);
                }
            }
            list.appendChild(li);
        });
        if (team.length === 0) {
            const li = document.createElement("li");
            li.className = "team-member team-empty";
            li.textContent = "noch leer";
            list.appendChild(li);
        }
        card.appendChild(list);
        container.appendChild(card);
    });
}
