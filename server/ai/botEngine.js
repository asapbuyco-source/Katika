import { getStockfishLevelMove } from './chessEngine.js';
import { getCheckersEngineMove } from './checkersEngine.js';

/**
 * Calculates the next move for the Katika Host / Trainer.
 * @param {string} gameType - 'Chess', 'Checkers', 'TicTacToe', 'Ludo', 'Dice', 'Pool'
 * @param {Object} gameState - The current game state
 * @param {string} difficulty - 'easy', 'medium', 'hard' (based on user MMR)
 * @param {string} botId - The ID of the bot playing
 * @param {number} [userElo] - The human player's ELO for difficulty scaling
 * @returns {Object|null} - The action to be emitted by the bot, or null if no action.
 */
export function calculateBotMove(gameType, gameState, difficulty, botId, userElo = 1000) {
    switch (gameType) {
        case 'TicTacToe':
            return getTicTacToeMove(gameState, difficulty, botId);
        case 'Chess':
            return getChessMove(gameState, difficulty, botId, userElo);
        case 'Dice':
            return getDiceMove(gameState, difficulty, botId);
        case 'Ludo':
            return getLudoMove(gameState, difficulty, botId);
        case 'Checkers':
            return getCheckersMove(gameState, difficulty, botId, userElo);
        default:
            return null;
    }
}

function getTicTacToeMove(gameState, difficulty, botId) {
    const board = gameState.board;
    const available = [];
    board.forEach((cell, i) => { if (!cell) available.push(i); });
    if (available.length === 0) return null;

    const mySymbol = botId === gameState.playerX ? 'X' : 'O';
    const oppSymbol = mySymbol === 'X' ? 'O' : 'X';

    if (difficulty === 'easy') {
        const pick = available[Math.floor(Math.random() * available.length)];
        return { type: 'MAKE_MOVE', index: pick };
    }

    const winLines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (let sym of [mySymbol, oppSymbol]) {
        for (let line of winLines) {
            const [a, b, c] = line;
            if (board[a] === sym && board[b] === sym && !board[c]) return { type: 'MAKE_MOVE', index: c };
            if (board[a] === sym && board[c] === sym && !board[b]) return { type: 'MAKE_MOVE', index: b };
            if (board[b] === sym && board[c] === sym && !board[a]) return { type: 'MAKE_MOVE', index: a };
        }
    }

    if (difficulty === 'hard' && !board[4]) return { type: 'MAKE_MOVE', index: 4 };

    const pick = available[Math.floor(Math.random() * available.length)];
    return { type: 'MAKE_MOVE', index: pick };
}

function getChessMove(gameState, difficulty, botId, userElo) {
    try {
        const fen = gameState.fen;
        if (!fen) return null;
        const move = getStockfishLevelMove(fen, difficulty, userElo);
        return move ? { type: 'MOVE', move } : null;
    } catch (e) {
        console.error('[BotEngine/Chess] Fallback error:', e.message);
        return null;
    }
}

function getDiceMove(gameState, difficulty, botId) {
    return { type: 'ROLL' };
}

function getLudoMove(gameState, difficulty, botId) {
    if (gameState.expectedAction === 'ROLL' || gameState.turnPhase === 'roll') {
        return { type: 'ROLL_DICE' };
    }
    if (gameState.expectedAction === 'MOVE' || gameState.turnPhase === 'move') {
        const myColor = gameState.turnColor || gameState.currentPlayerColor;
        const dieValue = gameState.die || gameState.lastRoll || 0;
        const myPieces = (gameState.pieces || []).filter(p => p.color === myColor && !p.finished);
        if (myPieces.length === 0) return null;

        if (difficulty === 'easy') {
            return { type: 'MOVE_PIECE', pieceId: myPieces[0].id };
        }

        // medium/hard: prefer pieces that can enter (die 6 and in base),
        // then pieces closest to home, avoiding captures where possible
        const safeSpots = gameState.safeSpots || [];
        const opponentPieces = (gameState.pieces || []).filter(p => p.color !== myColor && !p.finished);

        const scored = myPieces.map(p => {
            let score = 0;
            if (p.position === -1 && dieValue === 6) score += 100; // can enter from base
            if (p.position >= 0) {
                score += p.position; // prefer pieces furthest along the path
                if (safeSpots.includes(p.position)) score += 20; // prefer safe spots
                // avoid landing on opponent-occupied squares if at risk
                const nextPos = p.position + dieValue;
                const wouldLandOnOpponent = opponentPieces.some(
                    op => op.position >= 0 && op.position === nextPos
                );
                if (wouldLandOnOpponent) score -= 180; // heavily avoid bad captures
            }
            return { piece: p, score };
        }).sort((a, b) => b.score - a.score);

        return { type: 'MOVE_PIECE', pieceId: scored[0].piece.id };
    }
    return null;
}

function getCheckersMove(gameState, difficulty, botId, userElo) {
    try {
        const pieces = gameState.pieces || [];
        const myPieces = pieces.filter(p => p.owner === botId && !p.captured && !p.removed);
        if (myPieces.length === 0) return null;

        const move = getCheckersEngineMove(pieces, botId, difficulty, userElo);
        return move;
    } catch (e) {
        console.error('[BotEngine/Checkers] Error:', e.message);
        return null;
    }
}


