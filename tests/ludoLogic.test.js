import { describe, it, expect } from 'vitest';

const checkLudoCapture = (pieceA, pieceB) => {
    if (pieceA.color === pieceB.color) return false; 
    if (pieceB.isSafeSquare) return false;
    return pieceA.boardIndex === pieceB.boardIndex;
};

describe('Ludo Capture Constraints', () => {
    it('should detect captures if landing on opposing player not on safe square', () => {
        expect(checkLudoCapture({ color: 'red', boardIndex: 12 }, { color: 'blue', boardIndex: 12, isSafeSquare: false })).toBe(true);
    });

    it('should deny capture if landing on opposing player sitting on safe square', () => {
        expect(checkLudoCapture({ color: 'red', boardIndex: 8 }, { color: 'blue', boardIndex: 8, isSafeSquare: true })).toBe(false);
    });

    it('should deny capture if landing on teammate', () => {
        expect(checkLudoCapture({ color: 'red', boardIndex: 12 }, { color: 'red', boardIndex: 12, isSafeSquare: false })).toBe(false);
    });
});
