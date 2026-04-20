import { describe, it, expect } from 'vitest';

const checkWinnerLocal = (squares) => {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return { winner: squares[a], line: lines[i] };
        }
    }
    return null;
};

describe('TicTacToe Game Logic Constraints', () => {
    it('should correctly identify X horizontal victory', () => {
        const board = ['X', 'X', 'X', 'O', null, null, null, 'O', null];
        const res = checkWinnerLocal(board);
        expect(res).toBeTruthy();
        expect(res.winner).toBe('X');
        expect(res.line).toEqual([0, 1, 2]);
    });

    it('should correctly identify O diagonal victory', () => {
        const board = ['O', 'X', null, 'X', 'O', null, null, null, 'O'];
        const res = checkWinnerLocal(board);
        expect(res.winner).toBe('O');
        expect(res.line).toEqual([0, 4, 8]);
    });

    it('should correctly identify an ongoing incomplete game (no winner)', () => {
        const board = ['X', 'O', 'X', null, 'O', null, null, null, null];
        expect(checkWinnerLocal(board)).toBeNull();
    });

    it('should correctly identify a full board draw (no winner)', () => {
        const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
        expect(checkWinnerLocal(board)).toBeNull();
    });
});
