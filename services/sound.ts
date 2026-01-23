
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
