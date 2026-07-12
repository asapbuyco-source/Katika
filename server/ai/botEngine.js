import { getStockfishLevelMove } from './chessEngine.js';
import { getCheckersEngineMove } from './checkersEngine.js';
import { getStockfishMove, mapEloToSkillLevel } from './stockfishEngine.js';

/**
 * Async version — used by scheduleBotTurn. Chess uses Stockfish (async);
 * all other games use synchronous engines.
 */
export async function calculateBotMoveAsync(gameType, gameState, difficulty, botId, userElo = 1000) {
    switch (gameType) {
        case 'Chess':
            return await getChessMoveAsync(gameState, difficulty, botId, userElo);
        case 'Checkers':
            return getCheckersMove(gameState, difficulty, botId, userElo);
        default:
            return calculateBotMove(gameType, gameState, difficulty, botId, userElo);
    }
}

/**
 * Synchronous version — used by all games except Chess.
 */
export function calculateBotMove(gameType, gameState, difficulty, botId, userElo = 1000) {
    switch (gameType) {
        case 'TicTacToe':
            return getTicTacToeMove(gameState, difficulty, botId);
        case 'Dice':
            return getDiceMove(gameState, difficulty, botId);
        case 'Ludo':
            return getLudoMove(gameState, difficulty, botId);
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

async function getChessMoveAsync(gameState, difficulty, botId, userElo) {
    try {
        const fen = gameState.fen;
        if (!fen) return null;
        const skillLevel = mapEloToSkillLevel(userElo, difficulty);
        const move = await getStockfishMove(fen, skillLevel);
        if (!move) return null;
        return {
            type: 'MOVE',
            move: {
                from: move.from,
                to: move.to,
                promotion: move.promotion || undefined
            }
        };
    } catch (e) {
        console.error('[BotEngine/Chess] Stockfish error, falling back to minimax:', e.message);
        // Fall back to synchronous minimax
        return getStockfishLevelMove(fen, difficulty, userElo)
            ? { type: 'MOVE', move: getStockfishLevelMove(fen, difficulty, userElo) }
            : null;
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
            if (p.step === -1 && dieValue === 6) score += 100; // can enter from base
            if (p.step >= 0) {
                score += p.step; // prefer pieces furthest along the path
                if (safeSpots.includes(p.step)) score += 20; // prefer safe spots
                // avoid landing on opponent-occupied squares if at risk
                const nextPos = p.step + dieValue;
                const wouldLandOnOpponent = opponentPieces.some(
                    op => op.step >= 0 && op.step === nextPos
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

        const move = getCheckersEngineMove(pieces, botId, difficulty, userElo, gameState.mustJumpFrom);
        return move;
    } catch (e) {
        console.error('[BotEngine/Checkers] Error:', e.message);
        return null;
    }
}


