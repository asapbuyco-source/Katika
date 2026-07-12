// International Checkers game validation logic

export const BOARD_SIZE = 10;
export const createInitialState = () => ({
    board: createBoard(),
    turn: 'red'
});

export const createBoard = () => {
    const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if ((row + col) % 2 === 1) {
                if (row < 4) {
                    board[row][col] = { color: 'black', king: false };
                } else if (row > 5) {
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
    const captureDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dr, dc] of captureDirs) {
        let step = 1;
        let foundEnemy = null;

        while (true) {
            const newRow = row + dr * step;
            const newCol = col + dc * step;

            if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) break;

            const occupant = board[newRow][newCol];
            if (!occupant && foundEnemy) {
                jumps.push({ row: newRow, col: newCol, captured: foundEnemy });
            } else if (occupant?.color !== undefined) {
                if (occupant.color === piece.color || foundEnemy) break;
                foundEnemy = { row: newRow, col: newCol };
            } else {
                // Empty square before an enemy: flying kings may keep scanning.
            }

            if (!piece.king && step >= 2) break;
            step++;
        }
    }

    if (jumps.length > 0) return jumps;

    const moveDirs = piece.king
        ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        : [[direction, -1], [direction, 1]];

    for (const [dr, dc] of moveDirs) {
        let step = 1;

        while (true) {
            const newRow = row + dr * step;
            const newCol = col + dc * step;

            if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) break;
            if (board[newRow][newCol]) break;

            moves.push({ row: newRow, col: newCol });

            if (!piece.king) break;
            step++;
        }
    }
    
    return moves;
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

export const getValidMoveSequences = (playerUserId, currentPieces, forwardDir, specificId = null) => {
    const myPieces = currentPieces.filter(p => p.owner === playerUserId && !p.captured && !p.removed);
    const toCheck = specificId ? myPieces.filter(p => p.id === specificId) : myPieces;
    const pieceMap = new Map(currentPieces.filter(p => !p.captured && !p.removed).map(cp => [`${cp.r},${cp.c}`, cp]));

    const isValidPos = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 10;

    const getJumpSequences = (startPiece, visitedIds) => {
        const sequences = [];
        const isKing = startPiece.isKing;
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

        for (const [dr, dc] of dirs) {
            let step = 1;
            let foundEnemy = null;
            
            while (true) {
                const mr = startPiece.r + dr * step;
                const mc = startPiece.c + dc * step;
                if (!isValidPos(mr, mc)) break;
                
                const mid = pieceMap.get(`${mr},${mc}`);
                if (mid) {
                    if (mid.owner === playerUserId) break;
                    if (foundEnemy) break;
                    if (visitedIds.has(mid.id)) break;
                    foundEnemy = mid;
                } else if (foundEnemy) {
                    const jumpMove = {
                        fromR: startPiece.r, fromC: startPiece.c,
                        r: mr, c: mc, isJump: true, jumpId: foundEnemy.id
                    };
                    
                    const newVisited = new Set(visitedIds);
                    newVisited.add(foundEnemy.id);
                    
                    const tempPiece = { ...startPiece, r: mr, c: mc };
                    const nextSequences = getJumpSequences(tempPiece, newVisited);
                    
                    if (nextSequences.length === 0) {
                        sequences.push([jumpMove]);
                    } else {
                        for (const seq of nextSequences) {
                            sequences.push([jumpMove, ...seq]);
                        }
                    }
                }
                
                if (!isKing && step >= 2) break;
                step++;
            }
        }
        return sequences;
    };

    let allSequences = [];
    toCheck.forEach(p => {
        allSequences.push(...getJumpSequences(p, new Set()));
    });

    if (allSequences.length > 0) {
        const maxCaptures = Math.max(...allSequences.map(seq => seq.length));
        const bestSequences = allSequences.filter(seq => seq.length === maxCaptures);
        
        const uniqueFirstMoves = new Map();
        bestSequences.forEach(seq => {
            const firstMove = seq[0];
            const key = `${firstMove.fromR},${firstMove.fromC}-${firstMove.r},${firstMove.c}`;
            if (!uniqueFirstMoves.has(key)) {
                // Attach the full sequence so the engine can evaluate it
                firstMove.fullSequence = seq; 
                uniqueFirstMoves.set(key, firstMove);
            }
        });
        
        return { moves: Array.from(uniqueFirstMoves.values()), hasJump: true };
    }

    let allMoves = [];
    toCheck.forEach(p => {
        const moveDir = forwardDir;
        const dirs = p.isKing ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[moveDir, -1], [moveDir, 1]];

        for (const [dr, dc] of dirs) {
            let step = 1;
            while (true) {
                const tr = p.r + dr * step;
                const tc = p.c + dc * step;
                if (!isValidPos(tr, tc)) break;
                if (pieceMap.has(`${tr},${tc}`)) break;
                
                allMoves.push({ fromR: p.r, fromC: p.c, r: tr, c: tc, isJump: false });
                
                if (!p.isKing) break;
                step++;
            }
        }
    });

    return { moves: allMoves, hasJump: false };
};
