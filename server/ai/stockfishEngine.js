/**
 * Stockfish 18 Engine Wrapper for Katika
 * Uses the stockfish npm package (Emscripten WASM).
 * Skill Level 0-20 maps to ~800-3500 ELO.
 * 
 * Shares a single Stockfish instance via a request queue since
 * Stockfish can only analyze one position at a time.
 */

import initEngine from 'stockfish';

let engine = null;
let engineReady = false;
const requestQueue = [];
let processing = false;
let currentCallback = null;
let pendingOutput = '';

const SKILL_TO_ELO_MAP = {
    // skillLevel → approximate ELO
    // These are rough estimates of Stockfish Skill Level playing strength
    0: 800, 1: 900, 2: 1000, 3: 1100, 4: 1200,
    5: 1300, 6: 1400, 7: 1500, 8: 1600, 9: 1700,
    10: 1800, 11: 1900, 12: 2000, 13: 2100, 14: 2200,
    15: 2350, 16: 2500, 17: 2650, 18: 2800, 19: 3100, 20: 3500
};

/**
 * Initialize the Stockfish engine. Call once at server startup.
 */
export async function initStockfish() {
    if (engine) return engine;
    
    console.log('[Stockfish] Initializing engine...');
    engine = await initEngine();
    
    // Capture UCI output via console.log override
    const origLog = console.log;
    const engineLogPrefix = /^(?:id |option |uciok|readyok|bestmove|info |Stockfish)/;
    
    console.log = function(...args) {
        const str = args.join(' ');
        if (typeof str === 'string' && engineLogPrefix.test(str)) {
            handleEngineOutput(str);
            return;
        }
        origLog.apply(console, args);
    };
    
    engine.sendCommand('uci');
    engine.sendCommand('isready');
    
    // Wait for initialization
    await new Promise((resolve) => {
        const check = () => {
            if (engineReady) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        setTimeout(check, 100);
        // Safety timeout
        setTimeout(() => resolve(), 5000);
    });
    
    console.log('[Stockfish] Engine ready.');
    return engine;
}

function handleEngineOutput(line) {
    if (line === 'uciok' || line === 'readyok') {
        engineReady = true;
        return;
    }
    
    // Collect output for the current request
    if (currentCallback) {
        if (line.startsWith('bestmove ')) {
            const bestMove = line.split(' ')[1];
            const cb = currentCallback;
            currentCallback = null;
            pendingOutput = '';
            processing = false;
            processQueue();
            cb(bestMove);
        }
    }
}

function processQueue() {
    if (processing || requestQueue.length === 0) return;
    processing = true;
    const { fen, skillLevel, resolve } = requestQueue.shift();
    
    currentCallback = (bestMove) => {
        // Parse bestmove like "e2e4" or "e7e8q" (with promotion)
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        const promotion = bestMove.length > 4 ? bestMove.substring(4, 5) : undefined;
        resolve({ from, to, promotion });
    };
    
    // Send position + go
    engine.sendCommand('ucinewgame');
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`setoption name Skill Level value ${skillLevel}`);
    engine.sendCommand('go depth 12');  // search depth; higher = stronger
}

/**
 * Get the best move for a given FEN position.
 * @param {string} fen - FEN string of the current position
 * @param {number} skillLevel - Stockfish Skill Level (0-20)
 * @returns {Promise<{from: string, to: string, promotion?: string}>}
 */
export function getStockfishMove(fen, skillLevel) {
    if (!engine || !engineReady) {
        throw new Error('Stockfish engine not initialized');
    }
    
    const clampedSkill = Math.max(0, Math.min(20, Math.round(skillLevel)));
    
    return new Promise((resolve, reject) => {
        requestQueue.push({ fen, skillLevel: clampedSkill, resolve });
        processQueue();
        
        // Timeout after 5 seconds
        setTimeout(() => {
            if (currentCallback) {
                const cb = currentCallback;
                currentCallback = null;
                processing = false;
                processQueue();
                // Fallback: return null so bot forfeits gracefully
                cb(null);
            }
        }, 5000);
    });
}

/**
 * Map a user's ELO and difficulty to a Stockfish Skill Level.
 * This ensures higher ELO players face a stronger engine.
 */
export function mapEloToSkillLevel(userElo, difficulty) {
    if (difficulty === 'easy') {
        if (userElo < 800) return 5;
        if (userElo < 1000) return 7;
        return 9;
    }
    if (difficulty === 'medium') {
        if (userElo < 1000) return 10;
        if (userElo < 1200) return 12;
        return 15;
    }
    // hard
    if (userElo < 1000) return 13;
    if (userElo < 1200) return 15;
    if (userElo < 1500) return 17;
    if (userElo < 1800) return 19;
    return 20; // Stockfish max strength — unbeatable for humans
}

/**
 * Shutdown the engine gracefully.
 */
export function shutdownStockfish() {
    if (engine) {
        try { engine.sendCommand('quit'); } catch (_) {}
        engine = null;
        engineReady = false;
    }
}
