/**
 * Checkers Minimax Engine with Alpha-Beta Pruning
 * Operates on the server's gameState.pieces format: [{r, c, owner, isKing, id}]
 * Board: 10×10, international checkers rules.
 */

const PAWN_VALUE = 100;
const KING_VALUE = 180;
const ADVANCED_PAWN_BONUS = 30;

function clonePieces(pieces) {
    return pieces.map(p => ({ ...p }));
}

function buildBoard(pieces) {
    const board = Array.from({ length: 10 }, () => Array(10).fill(null));
    for (const p of pieces) {
        if (!p.captured && !p.removed) board[p.r][p.c] = p;
    }
    return board;
}

function getPlayerForward(playerId, pieces) {
    const myPieces = pieces.filter(p => p.owner === playerId && !p.captured && !p.removed);
    if (myPieces.length === 0) return 0;
    const avgRow = myPieces.reduce((s, p) => s + p.r, 0) / myPieces.length;
    return avgRow < 5 ? 1 : -1;
}

function getOpponentForward(playerId, pieces) {
    return -getPlayerForward(playerId, pieces);
}

function getAllMoves(pieces, playerId) {
    const forward = getPlayerForward(playerId, pieces);
    if (forward === 0) return [];
    const myPieces = pieces.filter(p => p.owner === playerId && !p.captured && !p.removed);
    const opponentPieces = pieces.filter(p => p.owner !== playerId && !p.captured && !p.removed);
    const pieceMap = new Map();
    for (const p of pieces) {
        if (!p.captured && !p.removed) pieceMap.set(`${p.r},${p.c}`, p);
    }
    const isValidPos = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 10;
    const isEmpty = (r, c) => !pieceMap.has(`${r},${c}`);

    const simpleMoves = [];
    const jumpMoves = [];

    for (const piece of myPieces) {
        const dirs = piece.isKing
            ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
            : [[forward, -1], [forward, 1]];

        for (const [dr, dc] of dirs) {
            // Simple move
            const tr = piece.r + dr;
            const tc = piece.c + dc;
            if (isValidPos(tr, tc) && isEmpty(tr, tc)) {
                simpleMoves.push({
                    piece, fromR: piece.r, fromC: piece.c, toR: tr, toC: tc,
                    capturedId: null, isJump: false
                });
            }

            // Jump move
            const jr = piece.r + dr * 2;
            const jc = piece.c + dc * 2;
            const midKey = `${tr},${tc}`;
            if (isValidPos(jr, jc) && pieceMap.has(midKey) &&
                pieceMap.get(midKey).owner !== playerId && isEmpty(jr, jc)) {
                jumpMoves.push({
                    piece, fromR: piece.r, fromC: piece.c, toR: jr, toC: jc,
                    capturedId: pieceMap.get(midKey).id, isJump: true
                });
            }
        }
    }

    // Extended multi-jump sequences for kings
    if (myPieces.some(p => p.isKing)) {
        for (const piece of myPieces.filter(p => p.isKing)) {
            for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
                // Flying king: slide through empty squares to find jumps
                for (let step = 1; step < 10; step++) {
                    const sr = piece.r + dr * step;
                    const sc = piece.c + dc * step;
                    if (!isValidPos(sr, sc)) break;
                    const skey = `${sr},${sc}`;
                    if (pieceMap.has(skey)) {
                        if (pieceMap.get(skey).owner !== playerId) {
                            // Found opponent — check landing
                            const lr = sr + dr;
                            const lc = sc + dc;
                            if (isValidPos(lr, lc) && isEmpty(lr, lc)) {
                                jumpMoves.push({
                                    piece, fromR: piece.r, fromC: piece.c, toR: lr, toC: lc,
                                    capturedId: pieceMap.get(skey).id, isJump: true
                                });
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    return jumpMoves.length > 0 ? jumpMoves : simpleMoves;
}

function applyMove(pieces, move) {
    const newPieces = clonePieces(pieces);
    const piece = newPieces.find(p => p.id === move.piece.id);
    if (!piece) return newPieces;

    piece.r = move.toR;
    piece.c = move.toC;

    const forward = getPlayerForward(piece.owner, newPieces);
    const promotionRow = forward > 0 ? 9 : 0;
    if (move.toR === promotionRow && !piece.isKing) {
        piece.isKing = true;
    }

    if (move.capturedId) {
        const captured = newPieces.find(p => p.id === move.capturedId);
        if (captured) captured.captured = true;
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
        }

        // Center control bonus
        if (p.c >= 3 && p.c <= 6) score += 10 * multiplier;
        // Edge penalty
        if (p.c === 0 || p.c === 9) score -= 8 * multiplier;
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
 * @returns {{ type: 'MOVE', fromR, fromC, toR, toC, isJump } | null}
 */
export function getCheckersEngineMove(pieces, botId, difficulty, userElo = 1000) {
    try {
        const opponentId = 'opponent';
        const currentPieces = clonePieces(pieces);
        // Ensure all opponent pieces have a consistent ID
        for (const p of currentPieces) {
            if (p.owner !== botId) p.owner = opponentId;
        }

        const allMoves = getAllMoves(currentPieces, botId);
        if (allMoves.length === 0) return null;

        let depth;
        if (difficulty === 'easy') {
            depth = 12;
        } else if (difficulty === 'medium') {
            depth = 14;
        } else {
            depth = 16;
        }

        const maxTime = 3000;
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
        if (difficulty === 'easy' && Math.random() < 0.5) {
            const nonJump = allMoves.filter(m => !m.isJump);
            if (nonJump.length > 0) {
                bestMove = nonJump[Math.floor(Math.random() * nonJump.length)];
            }
        }

        return {
            type: 'MOVE',
            fromR: bestMove.fromR,
            fromC: bestMove.fromC,
            toR: bestMove.toR,
            toC: bestMove.toC,
            isJump: bestMove.isJump || false
        };
    } catch (e) {
        console.error('[CheckersEngine] Error:', e.message);
        return null;
    }
}
