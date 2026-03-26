import { describe, it, expect } from 'vitest';
import { generateFirstRoundMatches, generateNextRoundMatches, shuffleArray } from '../server/tournamentLogic.js';

describe('Tournament Logic Generation', () => {
    describe('shuffleArray', () => {
        it('should contain all original elements', () => {
            const arr = ['a', 'b', 'c', 'd'];
            const shuffled = shuffleArray(arr);
            expect(shuffled.length).toBe(4);
            expect(shuffled).toContain('a');
            expect(shuffled).toContain('d');
        });
    });

    describe('generateFirstRoundMatches', () => {
        it('should correctly pair 4 participants into 2 scheduled matches', () => {
            const participants = ['user1', 'user2', 'user3', 'user4'];
            const playerProfiles = new Map([
                ['user1', { id: 'user1', name: 'Alice' }],
                ['user2', { id: 'user2', name: 'Bob' }],
                ['user3', { id: 'user3', name: 'Charlie' }],
                ['user4', { id: 'user4', name: 'Dave' }],
            ]);

            const matches = generateFirstRoundMatches(participants, 't1', '2025-01-01', playerProfiles);
            expect(matches.length).toBe(2);
            expect(matches[0].status).toBe('scheduled');
            expect(matches[1].status).toBe('scheduled');
            expect(matches[0].winnerId).toBeNull();
        });

        it('should correctly handle 5 participants (odd) by granting 1 bye', () => {
            const participants = ['u1', 'u2', 'u3', 'u4', 'u5'];
            const profiles = new Map();

            const matches = generateFirstRoundMatches(participants, 't1', '2025-01-01', profiles);
            expect(matches.length).toBe(3); // 2 pairs + 1 bye
            
            // At least one match should be a bye (completed instantly with a winner)
            const byeMatches = matches.filter(m => m.status === 'completed' && m.winnerId !== null);
            expect(byeMatches.length).toBe(1);
            expect(byeMatches[0].player2).toBeNull();
            expect(byeMatches[0].winnerId).toBe(byeMatches[0].player1.id);
        });
    });

    describe('generateNextRoundMatches', () => {
        it('should pair tournament round winners correctly', () => {
            const winners = ['winnerA', 'winnerB'];
            const profiles = new Map();

            const matches = generateNextRoundMatches(winners, 't1', 2, 0, profiles);
            expect(matches.length).toBe(1);
            expect(matches[0].player1.id).toBe('winnerA');
            expect(matches[0].player2.id).toBe('winnerB');
            expect(matches[0].status).toBe('scheduled');
            expect(matches[0].winnerId).toBeNull();
            expect(matches[0].round).toBe(2);
        });

        it('should grant a bye to the odd winner remaining', () => {
            const winners = ['winnerA'];
            const profiles = new Map();

            const matches = generateNextRoundMatches(winners, 't1', 3, 0, profiles);
            expect(matches.length).toBe(1);
            expect(matches[0].player2).toBeNull();
            expect(matches[0].status).toBe('completed');
            expect(matches[0].winnerId).toBe('winnerA');
        });
    });
});
