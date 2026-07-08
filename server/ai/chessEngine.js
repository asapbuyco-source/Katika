import { Chess } from 'chess.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PAWN_TABLE = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_TABLE = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
];

function evaluateBoard(chess) {
    const fen = chess.fen();
    const board = new Array(64).fill(null);
    const fenParts = fen.split(' ');
    const fenBoard = fenParts[0];
    let rank = 0, file = 0;
    for (const ch of fenBoard) {
        if (ch === '/') { rank++; file = 0; continue; }
        if (ch >= '1' && ch <= '8') { file += parseInt(ch); continue; }
        board[rank * 8 + file] = ch;
        file++;
    }

    let score = 0;
    for (let i = 0; i < 64; i++) {
        const piece = board[i];
        if (!piece) continue;
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isWhite = piece === piece.toUpperCase();
        const absPiece = piece.toLowerCase();
        const value = PIECE_VALUES[absPiece] || 0;

        const multiplier = isWhite ? 1 : -1;
        score += value * multiplier;

        if (absPiece === 'p') {
            const tableRow = isWhite ? 7 - row : row;
            score += PAWN_TABLE[tableRow][col] * multiplier;
        }
        if (absPiece === 'n') {
            const tableRow = isWhite ? 7 - row : row;
            score += KNIGHT_TABLE[tableRow][col] * multiplier;
        }
    }

    // Mobility bonus
    const turn = chess.turn();
    const temp = new Chess(fen);
    const mobility = temp.moves().length;
    const mobilityScore = turn === 'w' ? mobility * 3 : -mobility * 3;
    score += mobilityScore;

    return score;
}

function orderMoves(chess, moves) {
    return moves.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        if (a.captured) scoreA += PIECE_VALUES[a.captured] - (PIECE_VALUES[a.piece] || 0) / 10;
        if (b.captured) scoreB += PIECE_VALUES[b.captured] - (PIECE_VALUES[b.piece] || 0) / 10;
        if (a.san.includes('+')) scoreA += 50;
        if (b.san.includes('+')) scoreB += 50;
        if (a.promotion) scoreA += PIECE_VALUES[a.promotion] || 0;
        if (b.promotion) scoreB += PIECE_VALUES[b.promotion] || 0;
        return scoreB - scoreA;
    });
}

function minimax(chess, depth, alpha, beta, isMaximizing, startTime, maxTime) {
    if (Date.now() - startTime > maxTime) return null;

    if (depth === 0) return evaluateBoard(chess);

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
        if (chess.isCheckmate()) return isMaximizing ? -99999 + (10 - depth) : 99999 - (10 - depth);
        return 0;
    }

    const ordered = orderMoves(chess, moves);

    if (isMaximizing) {
        let best = -Infinity;
        for (const move of ordered) {
            chess.move(move);
            const val = minimax(chess, depth - 1, alpha, beta, false, startTime, maxTime);
            chess.undo();
            if (val === null) return null;
            best = Math.max(best, val);
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const move of ordered) {
            chess.move(move);
            const val = minimax(chess, depth - 1, alpha, beta, true, startTime, maxTime);
            chess.undo();
            if (val === null) return null;
            best = Math.min(best, val);
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}

/**
 * @param {string} fen - Current board position in FEN notation
 * @param {string} difficulty - 'easy', 'medium', 'hard'
 * @param {number} userElo - Approximate player ELO for depth scaling
 * @returns {{ from: string, to: string, promotion?: string } | null}
 */
export function getStockfishLevelMove(fen, difficulty, userElo = 1000) {
    try {
        const chess = new Chess(fen);
        const moves = chess.moves({ verbose: true });
        if (moves.length === 0) return null;

        let depth;
        if (difficulty === 'easy') {
            depth = 5;
        } else if (difficulty === 'medium') {
            depth = 6;
        } else {
            depth = 7;
        }

        const maxTime = 5000; // 3s max (increased for deeper search)
        const startTime = Date.now();

        // Iterative deepening: try increasing depths, fall back to best result if time runs out
        let bestMove = moves[Math.floor(Math.random() * moves.length)];
        let bestScore = -Infinity;

        for (let d = 1; d <= depth; d++) {
            const ordered = orderMoves(chess, moves.slice());
            let bestAtDepth = null;
            let bestAtDepthScore = -Infinity;

            for (const move of ordered) {
                if (Date.now() - startTime > maxTime) break;
                chess.move(move);
                const score = minimax(chess, d - 1, -Infinity, Infinity, false, startTime, maxTime);
                chess.undo();
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

        // For easy/medium, occasionally pick a suboptimal move to simulate human play
        if (difficulty === 'easy' && Math.random() < 0.4) {
            const subOptimal = moves.filter(m => !m.captured || Math.random() < 0.3);
            if (subOptimal.length > 0) {
                bestMove = subOptimal[Math.floor(Math.random() * subOptimal.length)];
            }
        }
        if (difficulty === 'medium' && Math.random() < 0.15) {
            const nonBest = moves.filter(m => m !== bestMove);
            if (nonBest.length > 0) {
                bestMove = nonBest[Math.floor(Math.random() * nonBest.length)];
            }
        }

        return {
            from: bestMove.from,
            to: bestMove.to,
            promotion: bestMove.promotion || undefined
        };
    } catch (e) {
        console.error('[ChessEngine] Error:', e.message);
        return null;
    }
}
