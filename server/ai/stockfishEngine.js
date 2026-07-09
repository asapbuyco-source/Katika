/**
 * Stockfish 18 Engine Wrapper for Katika
 * Uses the stockfish npm package (Emscripten WASM).
 * Skill Level 0-20 maps to ~800-3500 ELO.
 * 
 * Uses `go movetime 3000` so Stockfish stops itself after 3s —
 * no JS timeout race conditions.
 */

import initEngine from 'stockfish';

let engine = null;
let engineReady = false;
const requestQueue = [];
let processing = false;
let currentResolve = null;

/**
 * Initialize the Stockfish engine. Call once at server startup.
 */
export async function initStockfish() {
    if (engine) return engine;
    
    console.log('[Stockfish] Initializing engine...');
    engine = await initEngine();
    
    const engineLogPrefix = /^(?:id |option |uciok|readyok|bestmove|info |Stockfish)/;
    
    engine.listener = function(line) {
        if (typeof line === 'string' && engineLogPrefix.test(line)) {
            handleEngineOutput(line);
        }
    };
    engine.print = function(line) {
        if (typeof line === 'string' && engineLogPrefix.test(line)) {
            handleEngineOutput(line);
        }
    };
    
    engine.sendCommand('uci');
    engine.sendCommand('isready');
    
    await new Promise((resolve) => {
        const check = () => {
            if (engineReady) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        setTimeout(check, 100);
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
    
    if (line.startsWith('bestmove ') && currentResolve) {
        const parts = line.split(' ');
        const bestMove = parts[1];
        const resolve = currentResolve;
        currentResolve = null;
        processing = false;
        
        if (bestMove && bestMove !== '(none)') {
            const from = bestMove.substring(0, 2);
            const to = bestMove.substring(2, 4);
            const promotion = bestMove.length > 4 ? bestMove.substring(4, 5) : undefined;
            resolve({ from, to, promotion });
        } else {
            resolve(null);
        }
        
        processQueue();
    }
}

function processQueue() {
    if (processing || requestQueue.length === 0) return;
    processing = true;
    const { fen, skillLevel, resolve } = requestQueue.shift();
    currentResolve = resolve;
    
    engine.sendCommand('ucinewgame');
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`setoption name Skill Level value ${skillLevel}`);
    engine.sendCommand('go movetime 3000');
}

/**
 * Get the best move for a given FEN position.
 * @param {string} fen - FEN string of the current position
 * @param {number} skillLevel - Stockfish Skill Level (0-20)
 * @returns {Promise<{from: string, to: string, promotion?: string} | null>}
 */
export function getStockfishMove(fen, skillLevel) {
    if (!engine || !engineReady) {
        throw new Error('Stockfish engine not initialized');
    }
    
    const clampedSkill = Math.max(0, Math.min(20, Math.round(skillLevel)));
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            // Stockfish didn't respond — remove our resolve from the queue
            if (currentResolve) {
                currentResolve = null;
                processing = false;
                processQueue();
            }
            resolve(null);
        }, 5000);
        
        const wrappedResolve = (result) => {
            clearTimeout(timeout);
            resolve(result);
        };
        
        requestQueue.push({ fen, skillLevel: clampedSkill, resolve: wrappedResolve });
        processQueue();
    });
}

/**
 * Map difficulty to Stockfish Skill Level.
 */
export function mapEloToSkillLevel(userElo, difficulty) {
    if (difficulty === 'easy') {
        if (userElo < 1000) return 16;
        if (userElo < 1200) return 17;
        return 18;
    }
    if (difficulty === 'medium') {
        if (userElo < 1000) return 17;
        if (userElo < 1200) return 18;
        if (userElo < 1500) return 19;
        return 20;
    }
    // hard
    if (userElo < 1000) return 18;
    if (userElo < 1200) return 19;
    return 20;
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
