// Checkers game validation logic
// Extracted from server.js for better testability and maintainability

export const BOARD_SIZE = 8;
export const createInitialState = () => ({
    board: createBoard(),
    turn: 'red'
});

export const createBoard = () => {
    const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if ((row + col) % 2 === 1) {
                if (row < 3) {
                    board[row][col] = { color: 'black', king: false };
                } else if (row > 4) {
                    board[row][col] = { color: 'red', king: false };
                }
            }
        }
    }
    return board;
};

export const getValidMoves = (board, row, col) => {
    const piece = board[row]?.[col];
    if (!piece) return [];
    
    const direction = piece.color === 'red' ? -1 : 1;
    const moves = [];
    const jumps = [];
    
    const dirs = piece.king 
        ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        : [[direction, -1], [direction, 1]];
    
    for (const [dr, dc] of dirs) {
        const newRow = row + dr;
        const newCol = col + dc;
        
        if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
            if (!board[newRow][newCol]) {
                moves.push({ row: newRow, col: newCol });
            } else if (board[newRow][newCol].color !== piece.color) {
                const jumpRow = newRow + dr;
                const jumpCol = newCol + dc;
                if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE && !board[jumpRow][jumpCol]) {
                    jumps.push({ row: jumpRow, col: jumpCol, captured: { row: newRow, col: newCol } });
                }
            }
        }
    }
    
    return jumps.length > 0 ? jumps : moves;
};

export const isValidMove = (board, fromRow, fromCol, toRow, toCol) => {
    const validMoves = getValidMoves(board, fromRow, fromCol);
    return validMoves.some(m => m.row === toRow && m.col === toCol);
};

export const checkWinner = (board) => {
    let redCount = 0;
    let blackCount = 0;
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const piece = board[row][col];
            if (piece) {
                if (piece.color === 'red') redCount++;
                else blackCount++;
            }
        }
    }
    
    if (redCount === 0) return 'black';
    if (blackCount === 0) return 'red';
    return null;
};