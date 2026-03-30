
// Synthesized Sound Effects Service
// Uses Web Audio API to generate sounds without external files

let audioCtx: AudioContext | null = null;
let isMuted = localStorage.getItem('vantage_sound') === 'false';

const initAudio = () => {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(e => console.warn("Audio resume failed", e));
        }
    } catch (e) {
        console.warn("AudioContext initialization failed", e);
    }
};

export const setSoundEnabled = (enabled: boolean) => {
    isMuted = !enabled;
    localStorage.setItem('vantage_sound', String(enabled));
    // Provide feedback
    if (enabled) playSFX('click');
};

export const getSoundEnabled = () => !isMuted;

// Oscillators
const playTone = (freq: number, type: OscillatorType, duration: number, vol = 0.1, delay = 0) => {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        
        gain.gain.setValueAtTime(vol, audioCtx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
    } catch (e) {
        console.warn("Failed to play tone", e);
    }
};

const playNoise = (duration: number) => {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    try {
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        noise.connect(gain);
        gain.connect(audioCtx.destination);
        noise.start();
    } catch (e) {
        console.warn("Failed to play noise", e);
    }
};

export type SFXType = 'click' | 'move' | 'capture' | 'dice' | 'win' | 'loss' | 'error' | 'turn' | 'notification' | 'king';

export const playSFX = (type: SFXType) => {
    try {
        switch (type) {
            case 'click':
                playTone(800, 'sine', 0.1, 0.05);
                break;
            case 'move':
                playTone(200, 'triangle', 0.1, 0.1); // Thock sound
                break;
            case 'capture':
                playTone(150, 'sawtooth', 0.1, 0.1); // Punchy low
                playTone(400, 'sine', 0.1, 0.1); // With high ping
                break;
            case 'dice':
                playNoise(0.3); // Shaking noise
                setTimeout(() => playTone(300, 'square', 0.05, 0.05), 100); // rattle
                break;
            case 'turn':
                playTone(500, 'sine', 0.3, 0.05);
                break;
            case 'notification':
                playTone(1000, 'sine', 0.5, 0.05);
                break;
            case 'king':
                playTone(400, 'sine', 0.2, 0.1);
                playTone(600, 'sine', 0.4, 0.1, 0.1);
                break;
            case 'win':
                playTone(523.25, 'sine', 0.3, 0.1, 0);   // C5
                playTone(659.25, 'sine', 0.3, 0.1, 0.1); // E5
                playTone(783.99, 'sine', 0.4, 0.1, 0.2); // G5
                playTone(1046.50, 'triangle', 0.6, 0.1, 0.3); // C6
                break;
            case 'loss':
                playTone(300, 'sawtooth', 0.4, 0.1, 0);
                playTone(250, 'sawtooth', 0.5, 0.1, 0.2);
                break;
            case 'error':
                playTone(150, 'sawtooth', 0.2, 0.1);
                break;
        }
    } catch (e) {
        console.warn("Error playing SFX", e);
    }
};

// --- Pool Specific Sounds (Realistic Web Audio Synthesis) ---
export const playPoolSound = (type: 'cue-hit' | 'ball-hit' | 'cushion' | 'pocket' | 'roll', intensity: number = 1) => {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    try {
        const t = audioCtx.currentTime;

        if (type === 'cue-hit') {
            // Crisp sharp transient: chalk tip + ash wood thwack
            // Layer 1: High click attack
            const osc1 = audioCtx.createOscillator();
            const g1 = audioCtx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(1800, t);
            osc1.frequency.exponentialRampToValueAtTime(400, t + 0.04);
            g1.gain.setValueAtTime(0.0001, t);
            g1.gain.linearRampToValueAtTime(Math.min(0.3, 0.08 + intensity * 0.22), t + 0.002);
            g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
            osc1.connect(g1); g1.connect(audioCtx.destination);
            osc1.start(t); osc1.stop(t + 0.07);

            // Layer 2: Low woody thud body
            const osc2 = audioCtx.createOscillator();
            const g2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(180 + intensity * 80, t);
            osc2.frequency.exponentialRampToValueAtTime(60, t + 0.12);
            g2.gain.setValueAtTime(0.0001, t);
            g2.gain.linearRampToValueAtTime(Math.min(0.25, 0.05 + intensity * 0.2), t + 0.005);
            g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
            osc2.connect(g2); g2.connect(audioCtx.destination);
            osc2.start(t); osc2.stop(t + 0.16);

        } else if (type === 'ball-hit') {
            // Two phenolic resin balls: sharp HIGH-frequency crack, very short decay
            const freq = Math.max(900, 2200 - intensity * 700);
            // Primary impact tone
            const osc1 = audioCtx.createOscillator();
            const g1 = audioCtx.createGain();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(freq, t);
            osc1.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.018);
            g1.gain.setValueAtTime(0.0001, t);
            g1.gain.linearRampToValueAtTime(Math.min(0.28, 0.04 + intensity * 0.24), t + 0.001);
            g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
            osc1.connect(g1); g1.connect(audioCtx.destination);
            osc1.start(t); osc1.stop(t + 0.06);

            // Secondary harmonic ping (resonance ring)
            const osc2 = audioCtx.createOscillator();
            const g2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(freq * 1.8, t);
            g2.gain.setValueAtTime(Math.min(0.12, intensity * 0.1), t + 0.002);
            g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
            osc2.connect(g2); g2.connect(audioCtx.destination);
            osc2.start(t + 0.001); osc2.stop(t + 0.08);

        } else if (type === 'cushion') {
            // Rubber cushion: low resonant thump with slight bounce
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120 + intensity * 60, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(Math.min(0.22, 0.03 + intensity * 0.18), t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
            osc.connect(g); g.connect(audioCtx.destination);
            osc.start(t); osc.stop(t + 0.22);

            // Slight higher-freq snap
            const osc2 = audioCtx.createOscillator();
            const g2 = audioCtx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(380, t);
            osc2.frequency.exponentialRampToValueAtTime(90, t + 0.06);
            g2.gain.setValueAtTime(Math.min(0.1, intensity * 0.08), t);
            g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
            osc2.connect(g2); g2.connect(audioCtx.destination);
            osc2.start(t); osc2.stop(t + 0.08);

        } else if (type === 'pocket') {
            // Satisfying leather drop: deep thunk + harmonic tail + soft rattle
            // Deep drop
            const osc1 = audioCtx.createOscillator();
            const g1 = audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(260, t);
            osc1.frequency.exponentialRampToValueAtTime(40, t + 0.25);
            g1.gain.setValueAtTime(0.0001, t);
            g1.gain.linearRampToValueAtTime(0.32, t + 0.008);
            g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            osc1.connect(g1); g1.connect(audioCtx.destination);
            osc1.start(t); osc1.stop(t + 0.32);

            // Metallic ring resonance (the pocket rim)
            const osc2 = audioCtx.createOscillator();
            const g2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(520, t + 0.01);
            g2.gain.setValueAtTime(0.0001, t + 0.01);
            g2.gain.linearRampToValueAtTime(0.09, t + 0.015);
            g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            osc2.connect(g2); g2.connect(audioCtx.destination);
            osc2.start(t + 0.01); osc2.stop(t + 0.23);

            // Soft leather net rustle (noise burst)
            const bufSize = Math.floor(audioCtx.sampleRate * 0.15);
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
            const noise = audioCtx.createBufferSource();
            noise.buffer = buf;
            const gn = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass'; filter.frequency.value = 600;
            gn.gain.setValueAtTime(0.0001, t + 0.05);
            gn.gain.linearRampToValueAtTime(0.06, t + 0.07);
            gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
            noise.connect(filter); filter.connect(gn); gn.connect(audioCtx.destination);
            noise.start(t + 0.05);
        }
    } catch (e) {
        console.warn("Failed to play pool sound", e);
    }
};


