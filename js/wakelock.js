// Bildschirm bleibt während eines Zuges an (Screen Wake Lock API, Safari ab 16.4, Chrome ab 84).
// Ohne Unterstützung passiert einfach nichts.
let sentinel = null;
let wanted = false;

async function request() {
    if (!wanted || sentinel || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
        sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => { sentinel = null; });
    } catch (e) {
        sentinel = null;   // z. B. Energiesparmodus: kein Fehler für Spieler
    }
}

export function keepScreenOn() {
    wanted = true;
    request();
}

export function allowScreenOff() {
    wanted = false;
    const s = sentinel;
    sentinel = null;
    if (s) s.release().catch(() => {});
}

export function isScreenKeptOn() {
    return !!sentinel;
}

// Beim Zurückkehren in die App gibt der Browser die Sperre frei – neu anfordern
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") request();
});
