import { describe, it, expect, vi } from 'vitest';

const evaluateRound = (pDice, oDice) => {
    const pTotal = pDice[0] + pDice[1];
    const oTotal = oDice[0] + oDice[1];
    
    if (pTotal > oTotal) return 'me';
    if (oTotal > pTotal) return 'opp';
    return 'tie';
};

describe('Dice Duel Logical Rules', () => {
    it('should grant victory to player if player rolls higher', () => {
        expect(evaluateRound([6, 6], [1, 2])).toBe('me');
        expect(evaluateRound([3, 4], [3, 3])).toBe('me');
    });

    it('should grant victory to opponent if opponent rolls higher', () => {
        expect(evaluateRound([1, 1], [1, 2])).toBe('opp');
        expect(evaluateRound([4, 5], [5, 5])).toBe('opp');
    });

    it('should output tie on identical totals', () => {
        expect(evaluateRound([2, 5], [3, 4])).toBe('tie'); // both 7
        expect(evaluateRound([6, 6], [6, 6])).toBe('tie'); // both 12
    });
});
