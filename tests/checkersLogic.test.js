import { describe, it, expect } from 'vitest';
import { BOARD_SIZE, createBoard, getValidMoves, isValidMove, checkWinner } from '../server/checkersLogic.js';

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
});
