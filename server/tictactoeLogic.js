// TicTacToe game validation logic
// Extracted from server.js for better testability and maintainability

export const createInitialState = () => ({
    board: Array(9).fill(null),
    drawCount: 0
});

export const validateMove = (board, index, player) => {
    if (index < 0 || index > 8) return { valid: false, error: 'Invalid index' };
    if (board[index] !== null) return { valid: false, error: 'Cell occupied' };
    if (player !== 'X' && player !== 'O') return { valid: false, error: 'Invalid player' };
    return { valid: true };
};

export const checkWinner = (board) => {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
        [0, 4, 8], [2, 4, 6] // diagonals
    ];
    
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line: [a, b, c] };
        }
    }
    return null;
};

export const isBoardFull = (board) => board.every(cell => cell !== null);