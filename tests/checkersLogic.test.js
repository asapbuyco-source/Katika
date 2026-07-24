import { describe, it, expect } from 'vitest';
import {
    BOARD_SIZE,
    createBoard,
    createDrawState,
    getCheckersDrawReason,
    getValidMoves,
    isValidMove,
    checkWinner,
    updateCheckersDrawState
} from '../server/checkersLogic.js';

const checkForwardDirection = (piece, newRow) => {
    if (piece.isKing) return true;
    
    if (piece.player === 'me') {
        return newRow < piece.r;
    } else {
        return newRow > piece.r;
    }
};

describe('Checkers Orientation & Movement', () => {
    it('should deny backwards movement for non-king pieces (me going up)', () => {
        expect(checkForwardDirection({ isKing: false, player: 'me', r: 5 }, 6)).toBe(false);
        expect(checkForwardDirection({ isKing: false, player: 'me', r: 5 }, 4)).toBe(true);
    });

    it('should deny backwards movement for non-king pieces (opponent going down)', () => {
        expect(checkForwardDirection({ isKing: false, player: 'opponent', r: 2 }, 1)).toBe(false); 
        expect(checkForwardDirection({ isKing: false, player: 'opponent', r: 2 }, 3)).toBe(true); 
    });

    it('should allow backwards movement for kings, defying orientation', () => {
        expect(checkForwardDirection({ isKing: true, player: 'me', r: 3 }, 4)).toBe(true);
        expect(checkForwardDirection({ isKing: true, player: 'opponent', r: 6 }, 5)).toBe(true);
    });
});

describe('International Checkers Rules', () => {
    const emptyBoard = () => Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

    it('creates a 10x10 board with 20 pieces per player', () => {
        const board = createBoard();
        const pieces = board.flat().filter(Boolean);

        expect(board).toHaveLength(10);
        expect(board[0]).toHaveLength(10);
        expect(pieces.filter(p => p.color === 'red')).toHaveLength(20);
        expect(pieces.filter(p => p.color === 'black')).toHaveLength(20);
    });

    it('prefers captures over quiet moves for a piece', () => {
        const board = emptyBoard();
        board[5][4] = { color: 'red', king: false };
        board[4][3] = { color: 'black', king: false };

        expect(getValidMoves(board, 5, 4)).toEqual([
            { row: 3, col: 2, captured: { row: 4, col: 3 } }
        ]);
        expect(isValidMove(board, 5, 4, 4, 5)).toBe(false);
        expect(isValidMove(board, 5, 4, 3, 2)).toBe(true);
    });

    it('allows men to capture backward while still blocking backward quiet moves', () => {
        const board = emptyBoard();
        board[5][4] = { color: 'red', king: false };
        board[6][5] = { color: 'black', king: false };

        expect(getValidMoves(board, 5, 4)).toEqual([
            { row: 7, col: 6, captured: { row: 6, col: 5 } }
        ]);
        expect(isValidMove(board, 5, 4, 6, 3)).toBe(false);
        expect(isValidMove(board, 5, 4, 7, 6)).toBe(true);
    });

    it('allows kings to move multiple diagonal squares', () => {
        const board = emptyBoard();
        board[5][4] = { color: 'red', king: true };

        expect(getValidMoves(board, 5, 4)).toContainEqual({ row: 2, col: 1 });
        expect(getValidMoves(board, 5, 4)).toContainEqual({ row: 8, col: 7 });
    });

    it('allows flying kings to land beyond a captured piece', () => {
        const board = emptyBoard();
        board[5][4] = { color: 'red', king: true };
        board[3][2] = { color: 'black', king: false };

        expect(getValidMoves(board, 5, 4)).toContainEqual({ row: 2, col: 1, captured: { row: 3, col: 2 } });
        expect(getValidMoves(board, 5, 4)).toContainEqual({ row: 1, col: 0, captured: { row: 3, col: 2 } });
    });

    it('detects the winner when one color has no pieces left', () => {
        const board = emptyBoard();
        board[5][4] = { color: 'red', king: false };

        expect(checkWinner(board)).toBe('red');
    });

    it('declares draw on repeated position three times', () => {
        let drawState = createDrawState();
        const pieces = [
            { id: 'a', owner: 'p1', isKing: true, r: 1, c: 2 },
            { id: 'b', owner: 'p2', isKing: true, r: 8, c: 7 }
        ];

        for (let i = 0; i < 3; i++) {
            drawState = updateCheckersDrawState(pieces, pieces, 'p1', { fromR: 1, fromC: 2, toR: 1, toC: 2 }, drawState);
        }

        expect(getCheckersDrawReason(drawState)).toBe('Draw by Threefold Repetition');
    });

    it('declares draw after 25 king-only moves without progress', () => {
        let drawState = createDrawState();
        let pieces = [
            { id: 'a', owner: 'p1', isKing: true, r: 1, c: 2 },
            { id: 'b', owner: 'p2', isKing: true, r: 8, c: 7 },
            { id: 'c', owner: 'p1', isKing: true, r: 2, c: 3 },
            { id: 'd', owner: 'p2', isKing: true, r: 7, c: 6 },
            { id: 'e', owner: 'p1', isKing: true, r: 3, c: 4 }
        ];

        for (let i = 0; i < 50; i++) {
            const next = pieces.map(p => ({ ...p }));
            next[0] = { ...next[0], r: Math.floor(i / 10), c: i % 10 };
            drawState = updateCheckersDrawState(pieces, next, i % 2 ? 'p1' : 'p2', { fromR: pieces[0].r, fromC: pieces[0].c, toR: next[0].r, toC: next[0].c }, drawState);
            pieces = next;
        }

        expect(getCheckersDrawReason(drawState)).toBe('Draw by 25 King Moves Without Progress');
    });

    it('declares draw in low-material king endgames after 16 full moves', () => {
        let drawState = createDrawState();
        let pieces = [
            { id: 'a', owner: 'p1', isKing: true, r: 1, c: 2 },
            { id: 'b', owner: 'p2', isKing: true, r: 8, c: 7 }
        ];

        for (let i = 0; i < 32; i++) {
            const next = pieces.map(p => ({ ...p }));
            next[0] = { ...next[0], r: Math.floor(i / 10), c: i % 10 };
            drawState = updateCheckersDrawState(pieces, next, i % 2 ? 'p1' : 'p2', { fromR: pieces[0].r, fromC: pieces[0].c, toR: next[0].r, toC: next[0].c }, drawState);
            pieces = next;
        }

        expect(getCheckersDrawReason(drawState)).toBe('Draw by Low-Material King Endgame');
    });
});
