import { Chess } from 'chess.js';

export const validateChessMove = (fen, moveObj) => {
    try {
        const chess = new Chess(fen);
        const moveResult = chess.move(moveObj); // { from, to, promotion }
        
        let status = 'active';
        let winner = null;
        let reason = null;

        if (chess.isCheckmate()) {
            status = 'completed';
            // The person whose turn it IS (after the move, so the one who is checkmated) loses
            // the person who just moved wins.
            winner = chess.turn() === 'w' ? 'black' : 'white'; 
            reason = 'Checkmate';
        } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
            status = 'completed';
            reason = 'Draw';
        }

        return {
            isValid: true,
            newFen: chess.fen(),
            isGameOver: status === 'completed',
            winner,
            reason,
            captured: moveResult.captured
        };
    } catch (e) {
        // chess.js throws an error if move is invalid
        return { isValid: false, error: e.message };
    }
};
