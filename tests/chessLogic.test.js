import { describe, it, expect } from 'vitest';
import { validateChessMove } from '../server/chessLogic.js';
import { Chess } from 'chess.js';

describe('Chess Logic Validation', () => {
    it('should validate a normal opening move', () => {
        const initialFen = new Chess().fen();
        const result = validateChessMove(initialFen, { from: 'e2', to: 'e4' });
        
        expect(result.isValid).toBe(true);
        expect(result.isGameOver).toBe(false);
        expect(result.newFen).not.toBe(initialFen);
    });

    it('should reject an illegal move', () => {
        const initialFen = new Chess().fen();
        // Pawn can't move 3 squares
        const result = validateChessMove(initialFen, { from: 'e2', to: 'e5' });
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('should detect checkmate and assign the winner correctly', () => {
        // Fools mate sequence: 1. f3 e5 2. g4 Qh4#
        let fen = new Chess().fen();
        fen = validateChessMove(fen, { from: 'f2', to: 'f3' }).newFen;
        fen = validateChessMove(fen, { from: 'e7', to: 'e5' }).newFen;
        fen = validateChessMove(fen, { from: 'g2', to: 'g4' }).newFen;
        
        const finalMove = validateChessMove(fen, { from: 'd8', to: 'h4' });
        
        expect(finalMove.isValid).toBe(true);
        expect(finalMove.isGameOver).toBe(true);
        expect(finalMove.reason).toBe('Checkmate');
        // Black delivered mate, so black wins
        expect(finalMove.winner).toBe('black');
    });

    it('should detect draw by insufficient material (king vs king)', () => {
        const c = new Chess('8/8/8/8/8/8/8/4kK2 w - - 0 1');
        expect(c.isDraw()).toBe(true);
        const r = validateChessMove('8/8/8/8/8/8/8/4kK2 w - - 0 1', { from: 'g2', to: 'f2' });
        expect(r.isValid).toBe(false);
    });

it('should detect stalemate as a draw', () => {
        // King vs King: after any legal move the game is still a draw (insufficient material)
        const c = new Chess('8/8/8/8/8/8/8/4kK2 w - - 0 1');
        expect(c.isDraw()).toBe(true);
        const legalMoves = c.moves({ verbose: true });
        const m = legalMoves[0];
        const result = validateChessMove('8/8/8/8/8/8/8/4kK2 w - - 0 1', { from: m.from, to: m.to });
        expect(result.isValid).toBe(true);
        expect(result.isGameOver).toBe(true);
        expect(result.reason).toBe('Draw');
    });

    it('should reject moves that leave the board', () => {
        const r = validateChessMove(new Chess().fen(), { from: 'e1', to: 'e9' });
        expect(r.isValid).toBe(false);
    });
});
