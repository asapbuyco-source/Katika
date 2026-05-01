import { describe, it, expect } from 'vitest';
import { validateMove, checkWinner, isBoardFull, createInitialState } from '../server/tictactoeLogic.js';

describe('TicTacToe Logic', () => {
    describe('createInitialState', () => {
        it('should create empty board', () => {
            const state = createInitialState();
            expect(state.board).toHaveLength(9);
            expect(state.board.every(c => c === null)).toBe(true);
        });
    });

    describe('validateMove', () => {
        it('should accept valid move', () => {
            const board = Array(9).fill(null);
            const result = validateMove(board, 4, 'X');
            expect(result.valid).toBe(true);
        });

        it('should reject occupied cell', () => {
            const board = Array(9).fill(null);
            board[4] = 'X';
            const result = validateMove(board, 4, 'O');
            expect(result.valid).toBe(false);
        });

        it('should reject invalid index', () => {
            const board = Array(9).fill(null);
            const result = validateMove(board, 9, 'X');
            expect(result.valid).toBe(false);
        });
    });

    describe('checkWinner', () => {
        it('should detect row wins', () => {
            const board = ['X', 'X', 'X', null, null, null, null, null, null];
            const result = checkWinner(board);
            expect(result.winner).toBe('X');
        });

        it('should detect column wins', () => {
            const board = ['X', null, null, 'X', null, null, 'X', null, null];
            const result = checkWinner(board);
            expect(result.winner).toBe('X');
        });

        it('should detect diagonal wins', () => {
            const board = ['X', null, null, null, 'X', null, null, null, 'X'];
            const result = checkWinner(board);
            expect(result.winner).toBe('X');
        });

        it('should return null for no winner', () => {
            const board = ['X', 'O', 'X', 'O', 'O', 'X', null, null, null];
            const result = checkWinner(board);
            expect(result).toBeNull();
        });
    });

    describe('isBoardFull', () => {
        it('should return true for full board', () => {
            const board = ['X', 'O', 'X', 'X', 'O', 'X', 'O', 'X', 'O'];
            expect(isBoardFull(board)).toBe(true);
        });

        it('should return false for partial board', () => {
            const board = ['X', null, 'O', null, null, null, null, null, null];
            expect(isBoardFull(board)).toBe(false);
        });
    });
});