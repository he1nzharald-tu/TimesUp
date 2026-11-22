// Ton: Countdown-Ticken und Alarm, Freischalten unter iOS

// short tick/beep for last countdown seconds
let tickAudio = null;
let endAudio = null;
let audiotime = false;
let audioUnlocked = false;

export function prepareAudioElement(audio) {
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
export function unlockSingleAudio(audio) {
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
export function unlockGameAudio() {
    if (audioUnlocked) return Promise.resolve();

    return Promise.all([
        unlockSingleAudio(tickAudio),
        unlockSingleAudio(endAudio)
    ]).then(results => {
        audioUnlocked = results.every(Boolean);
    });
}
export function playTick() {
    if (!tickAudio) return;
    if (audiotime) return; // prevent overlapping ticks if one is still playing
    try {
        tickAudio.currentTime = 0;
        const p = tickAudio.play();
        if (p && p.catch) p.catch(() => { audiotime = false; });
        audiotime = true;
    } catch (e) { }
}
export function stopTick() {
    if (!tickAudio) return;

    try {
        tickAudio.pause();
        tickAudio.currentTime = 0;
    } catch (e) { }
    audiotime = false;
}
export function playEndAlarm() {
    if (!endAudio) return;
    try {
        endAudio.currentTime = 0;
        const p = endAudio.play();
        if (p && p.catch) p.catch(() => {});
    } catch (e) { }
}