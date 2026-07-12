/**
 * Checkers Minimax Engine with Alpha-Beta Pruning
 * Operates on the server's gameState.pieces format: [{r, c, owner, isKing, id}]
 * Board: 10×10, international checkers rules.
 */

import { getValidMoveSequences } from '../checkersLogic.js';

const PAWN_VALUE = 100;
const KING_VALUE = 180;

function clonePieces(pieces) {
    return pieces.map(p => ({ ...p }));
}

function getPlayerForward(playerId, pieces) {
    const myPieces = pieces.filter(p => p.owner === playerId && !p.captured && !p.removed);
    if (myPieces.length === 0) return 0;
    const avgRow = myPieces.reduce((s, p) => s + p.r, 0) / myPieces.length;
    return avgRow < 5 ? 1 : -1;
}

function getAllMoves(pieces, playerId, mustJumpFrom = null) {
    const forward = getPlayerForward(playerId, pieces);
    if (forward === 0) return [];
    
    // We reuse the server's authoritative logic.
    // It enforces the "maximum capture" rule natively!
    const { moves } = getValidMoveSequences(playerId, pieces, forward, mustJumpFrom);
    return moves;
}

function applyMove(pieces, move) {
    const newPieces = clonePieces(pieces);
    
    // If it's a multi-jump sequence, apply all intermediate steps
    if (move.isJump && move.fullSequence) {
        let piece = newPieces.find(p => p.r === move.fromR && p.c === move.fromC);
        if (!piece) return newPieces;
        
        const forward = getPlayerForward(piece.owner, newPieces);
        const promotionRow = forward > 0 ? 9 : 0;
        
        for (const step of move.fullSequence) {
            piece.r = step.r;
            piece.c = step.c;
            
            const captured = newPieces.find(p => p.id === step.jumpId);
            if (captured) captured.captured = true;
            
            if (step.r === promotionRow && !piece.isKing) {
                piece.isKing = true;
            }
        }
    } else {
        // Single move or single jump without fullSequence
        const piece = newPieces.find(p => p.r === move.fromR && p.c === move.fromC);
        if (!piece) return newPieces;

        piece.r = move.r; // getValidMoveSequences uses `r` and `c` for destination
        piece.c = move.c;

        const forward = getPlayerForward(piece.owner, newPieces);
        const promotionRow = forward > 0 ? 9 : 0;
        if (move.r === promotionRow && !piece.isKing) {
            piece.isKing = true;
        }

        if (move.isJump && move.jumpId) {
            const captured = newPieces.find(p => p.id === move.jumpId);
            if (captured) captured.captured = true;
        }
    }

    return newPieces;
}

function evaluateBoard(pieces, playerId) {
    const forward = getPlayerForward(playerId, pieces);
    let score = 0;

    for (const p of pieces) {
        if (p.captured || p.removed) continue;
        const isOurs = p.owner === playerId;
        const multiplier = isOurs ? 1 : -1;

        if (p.isKing) {
            score += KING_VALUE * multiplier;
        } else {
            score += PAWN_VALUE * multiplier;
            // Advancement bonus
            const progress = forward > 0 ? p.r : (9 - p.r);
            score += Math.floor(progress * 4) * multiplier;
            
            // Back-row defense (very important in Checkers to prevent opponent kings)
            if (progress === 0) {
                score += 15 * multiplier; 
            }
        }

        // Center control bonus
        if (p.c >= 3 && p.c <= 6 && p.r >= 3 && p.r <= 6) {
            score += 12 * multiplier;
        }
        // Edge penalty (sometimes good for defense, but generally less mobility)
        if (p.c === 0 || p.c === 9) {
            score -= 5 * multiplier;
        }
    }

    return score;
}

function minimax(pieces, depth, alpha, beta, isMaximizing, playerId, opponentId, startTime, maxTime) {
    if (Date.now() - startTime > maxTime) return null;
    if (depth === 0) return evaluateBoard(pieces, playerId);

    const currentPlayer = isMaximizing ? playerId : opponentId;
    const moves = getAllMoves(pieces, currentPlayer);

    if (moves.length === 0) {
        return isMaximizing ? -9999 : 9999;
    }

    if (isMaximizing) {
        let best = -Infinity;
        for (const move of moves) {
            const newPieces = applyMove(pieces, move);
            const val = minimax(newPieces, depth - 1, alpha, beta, false, playerId, opponentId, startTime, maxTime);
            if (val === null) return null;
            best = Math.max(best, val);
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const move of moves) {
            const newPieces = applyMove(pieces, move);
            const val = minimax(newPieces, depth - 1, alpha, beta, true, playerId, opponentId, startTime, maxTime);
            if (val === null) return null;
            best = Math.min(best, val);
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}

/**
 * @param {Array} pieces - Server gameState.pieces array
 * @param {string} botId - Bot's player ID
 * @param {string} difficulty - 'easy', 'medium', 'hard'
 * @param {number} userElo - Approximate player ELO for depth scaling
 * @param {string} mustJumpFrom - Optional piece ID to force jump from
 * @returns {{ type: 'MOVE', fromR, fromC, toR, toC, isJump } | null}
 */
export function getCheckersEngineMove(pieces, botId, difficulty, userElo = 1000, mustJumpFrom = null) {
    try {
        const opponentId = 'opponent';
        const currentPieces = clonePieces(pieces);
        // Ensure all opponent pieces have a consistent ID
        for (const p of currentPieces) {
            if (p.owner !== botId) p.owner = opponentId;
        }

        const allMoves = getAllMoves(currentPieces, botId, mustJumpFrom);
        if (allMoves.length === 0) return null;

        // If there's only one forced move, take it instantly without search
        if (allMoves.length === 1 && allMoves[0].isJump) {
            const bestMove = allMoves[0];
            return {
                type: 'MOVE',
                fromR: bestMove.fromR,
                fromC: bestMove.fromC,
                toR: bestMove.r,
                toC: bestMove.c,
                isJump: bestMove.isJump || false
            };
        }

        let depth;
        if (difficulty === 'easy') {
            depth = 5;
        } else if (difficulty === 'medium') {
            depth = 7;
        } else {
            depth = 9;
        }

        const maxTime = 2500; 
        const startTime = Date.now();

        let bestMove = allMoves[Math.floor(Math.random() * allMoves.length)];
        let bestScore = -Infinity;

        for (let d = 1; d <= depth; d++) {
            let bestAtDepth = null;
            let bestAtDepthScore = -Infinity;

            for (const move of allMoves) {
                if (Date.now() - startTime > maxTime) break;
                const newPieces = applyMove(currentPieces, move);
                const score = minimax(newPieces, d - 1, -Infinity, Infinity, false, botId, opponentId, startTime, maxTime);
                if (score === null) break;
                if (score > bestAtDepthScore) {
                    bestAtDepthScore = score;
                    bestAtDepth = move;
                }
            }

            if (bestAtDepth) {
                bestMove = bestAtDepth;
                bestScore = bestAtDepthScore;
            }
            if (Date.now() - startTime > maxTime) break;
        }

        // Simulate human-like play at easy
        if (difficulty === 'easy' && Math.random() < 0.3) {
            const nonJump = allMoves.filter(m => !m.isJump);
            if (nonJump.length > 0) {
                bestMove = nonJump[Math.floor(Math.random() * nonJump.length)];
            }
        }

        return {
            type: 'MOVE',
            fromR: bestMove.fromR,
            fromC: bestMove.fromC,
            toR: bestMove.r, // getValidMoveSequences uses 'r' instead of 'toR'
            toC: bestMove.c, // getValidMoveSequences uses 'c' instead of 'toC'
            isJump: bestMove.isJump || false
        };
    } catch (e) {
        console.error('[CheckersEngine] Error:', e.message);
        return null;
    }
}
