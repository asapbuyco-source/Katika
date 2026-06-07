import { describe, it, expect } from 'vitest';
import { applyDiceRound, evaluateDiceRound } from '../server/diceLogic.js';

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

describe('Dice Duel Server Round Flow', () => {
    const players = ['p1', 'p2'];

    it('evaluates two-dice totals without trusting the client winner', () => {
        expect(evaluateDiceRound([6, 1], [3, 3])).toBe('p1');
        expect(evaluateDiceRound([1, 2], [2, 4])).toBe('p2');
        expect(evaluateDiceRound([4, 2], [5, 1])).toBe('tie');
    });

    it('passes the turn to the opponent after the first player rolls', () => {
        const next = applyDiceRound({
            scores: { p1: 0, p2: 0 },
            currentRound: 1,
            roundRolls: { p1: [3, 4] },
            roundState: 'waiting'
        }, players);

        expect(next.turn).toBe('p2');
        expect(next.scores).toEqual({ p1: 0, p2: 0 });
    });

    it('scores a completed round and alternates the next starting player', () => {
        const next = applyDiceRound({
            scores: { p1: 0, p2: 0 },
            currentRound: 1,
            roundRolls: { p1: [6, 4], p2: [2, 3] },
            roundState: 'waiting'
        }, players);

        expect(next.scores).toEqual({ p1: 1, p2: 0 });
        expect(next.currentRound).toBe(2);
        expect(next.roundRolls).toEqual({});
        expect(next.roundState).toBe('waiting');
        expect(next.turn).toBe('p2');
    });

    it('ends when a player reaches the score limit', () => {
        const next = applyDiceRound({
            scores: { p1: 2, p2: 1 },
            currentRound: 4,
            roundRolls: { p1: [5, 5], p2: [1, 1] },
            roundState: 'waiting'
        }, players);

        expect(next.winner).toBe('p1');
        expect(next.endReason).toBe('Score Limit Reached');
    });

    it('declares a draw after the maximum round', () => {
        const next = applyDiceRound({
            scores: { p1: 1, p2: 1 },
            currentRound: 20,
            roundRolls: { p1: [3, 3], p2: [3, 3] },
            roundState: 'waiting'
        }, players);

        expect(next.winner).toBeNull();
        expect(next.endReason).toBe('Draw');
    });
});
