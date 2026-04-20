import { describe, it, expect } from 'vitest';

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
