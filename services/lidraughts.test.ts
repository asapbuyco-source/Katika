import { describe, it, expect } from 'vitest';
import { toCoords, toNotation } from './lidraughts';

describe('Lidraughts Notation Converters', () => {
    describe('toCoords (1-32 to Row/Col)', () => {
        it('should correctly map square 1 to row 0, col 1', () => {
            const coords = toCoords(1);
            expect(coords).toEqual({ r: 0, c: 1 });
        });

        it('should correctly map square 5 to row 1, col 0', () => {
            const coords = toCoords(5);
            expect(coords).toEqual({ r: 1, c: 0 });
        });

        it('should correctly map square 32 to row 7, col 6', () => {
            const coords = toCoords(32);
            expect(coords).toEqual({ r: 7, c: 6 });
        });
    });

    describe('toNotation (Row/Col to 1-32)', () => {
        it('should correctly map row 0, col 1 to square 1', () => {
            const square = toNotation(0, 1);
            expect(square).toBe(1);
        });

        it('should correctly map row 1, col 0 to square 5', () => {
            const square = toNotation(1, 0);
            expect(square).toBe(5);
        });

        it('should correctly map row 7, col 6 to square 32', () => {
            const square = toNotation(7, 6);
            expect(square).toBe(32);
        });
    });

    describe('Conversion Reversibility', () => {
        it('should yield the original square after round-trip conversion', () => {
            for (let i = 1; i <= 32; i++) {
                const { r, c } = toCoords(i);
                expect(toNotation(r, c)).toBe(i);
            }
        });
    });
});
