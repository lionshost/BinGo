// ============================================================
// AUDIO FEEDBACK MODULE (WEB AUDIO API)
// ============================================================

let audioCtx = null;
let soundEnabled = true;

function getAudioContext() {
    if (typeof window === "undefined") return null;
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

export function setSoundEnabled(enabled) {
    soundEnabled = Boolean(enabled);
}

export function isSoundEnabled() {
    return soundEnabled;
}

/**
 * Play a gentle sound when a bin is collected
 */
export function playCollectSound(priority = "medium") {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const baseFreq = priority === "high" ? 660 : priority === "medium" ? 520 : 440;
        osc.type = "sine";
        osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.12);
    } catch {
        // AudioContext may be restricted by autoplay policy
    }
}

/**
 * Play completion fanfare chime
 */
export function playCompleteSound() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);

            gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.2);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + i * 0.08);
            osc.stop(ctx.currentTime + i * 0.08 + 0.2);
        });
    } catch {
        // Ignore
    }
}
