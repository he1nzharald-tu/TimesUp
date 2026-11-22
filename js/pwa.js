// Offline-Modus und Updates: registriert den Service Worker und zeigt auf dem
// Startbildschirm "Neue Version – neu laden", sobald eine neue Version bereitliegt.
// Eine neue Version wird nie von selbst aktiviert, also auch nie mitten in einem Zug.
import { state } from "./state.js";

const RESTORE_PLAYERS_KEY = "timesup_restore_players";
let updateRequested = false;
let waitingWorker = null;

function showUpdateBanner(worker) {
    waitingWorker = worker;
    const banner = document.getElementById("updateBanner");
    if (banner) banner.hidden = false;
}

function applyUpdate() {
    if (!waitingWorker) return;
    updateRequested = true;
    // Bereits eingetragene Spieler über das Neuladen retten
    try {
        if (state.players.length) sessionStorage.setItem(RESTORE_PLAYERS_KEY, JSON.stringify(state.players));
    } catch (e) {}
    const button = document.getElementById("updateReloadButton");
    if (button) button.disabled = true;
    if (waitingWorker.state === "activating" || waitingWorker.state === "activated") {
        // Neue Version ist schon aktiv: nur noch die Seite neu laden
        window.location.reload();
        return;
    }
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

// Nach einem Update-Neuladen die Spieler wiederherstellen
export function restorePlayersAfterUpdate() {
    try {
        const raw = sessionStorage.getItem(RESTORE_PLAYERS_KEY);
        if (!raw) return false;
        sessionStorage.removeItem(RESTORE_PLAYERS_KEY);
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved)) return false;
        state.players.splice(0, state.players.length,
            ...saved.filter(p => p && p.name).map(p => ({ name: String(p.name), handicap: !!p.handicap })));
        return true;
    } catch (e) {
        return false;
    }
}

export function initServiceWorker() {
    const button = document.getElementById("updateReloadButton");
    if (button) button.addEventListener("click", applyUpdate);
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
        // Nur nach "Neu laden" neu laden, nicht bei der allerersten Installation
        if (updateRequested) window.location.reload();
    });

    navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" })
        .then(registration => {
            const hasController = () => !!navigator.serviceWorker.controller;
            if (registration.waiting && hasController()) showUpdateBanner(registration.waiting);
            registration.addEventListener("updatefound", () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener("statechange", () => {
                    if (worker.state === "installed" && hasController()) showUpdateBanner(worker);
                });
            });
            // Installierte Apps bleiben lange offen: beim Zurückkehren nach Updates schauen
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") registration.update().catch(() => {});
            });
        })
        .catch(err => console.error("Service Worker konnte nicht registriert werden:", err));
}

// === Hinweis „Als App installieren“ (einmalig, schließbar; nie in der installierten App) ===
const INSTALL_HINT_KEY = "timesup_install_hint_dismissed";
let deferredInstallPrompt = null;

export function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIos() {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
function hintDismissed() {
    try { return localStorage.getItem(INSTALL_HINT_KEY) === "1"; } catch (e) { return true; }
}
function showInstallBanner(text, withButton) {
    const banner = document.getElementById("installBanner");
    if (!banner || hintDismissed() || isStandalone()) return;
    document.getElementById("installBannerText").textContent = text;
    document.getElementById("installButton").hidden = !withButton;
    banner.hidden = false;
}
function hideInstallBanner(remember) {
    const banner = document.getElementById("installBanner");
    if (banner) banner.hidden = true;
    if (remember) {
        try { localStorage.setItem(INSTALL_HINT_KEY, "1"); } catch (e) {}
    }
}
export function initInstallHint() {
    document.getElementById("installDismissButton")?.addEventListener("click", () => hideInstallBanner(true));
    document.getElementById("installButton")?.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        try { await deferredInstallPrompt.userChoice; } catch (e) {}
        deferredInstallPrompt = null;
        hideInstallBanner(true);
    });
    // Android/Chrome: eigenes Installieren-Angebot
    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        showInstallBanner("TimesUp als App installieren: startet im Vollbild und funktioniert offline.", true);
    });
    window.addEventListener("appinstalled", () => hideInstallBanner(true));
    // iPhone/iPad: Anleitung, da Safari kein Installieren-Angebot kennt
    if (isIos() && !isStandalone()) {
        showInstallBanner("Tipp: Teilen-Symbol antippen und „Zum Home-Bildschirm“ wählen – dann läuft TimesUp im Vollbild.", false);
    }
}
