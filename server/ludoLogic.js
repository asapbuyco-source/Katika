// Ludo game validation logic
// Extracted from server.js for better testability and maintainability

export const COLORS = ['Red', 'Blue'];
export const HOME_STEP = -1;
export const MAX_STEP = 57;
export const PATH_LENGTH = 58;

export const createInitialPieces = (players) => {
    const pieces = [];
    players.forEach((pid, colorIdx) => {
        for (let i = 0; i < 4; i++) {
            pieces.push({
                id: `${COLORS[colorIdx]}-${i}`,
                color: COLORS[colorIdx],
                owner: pid,
                step: HOME_STEP,
                finished: false
            });
        }
    });
    return pieces;
};

export const createInitialState = (players) => ({
    pieces: createInitialPieces(players),
    diceValue: null,
    diceRolled: false
});

export const validateRoll = (diceValue) => {
    return diceValue >= 1 && diceValue <= 6;
};

export const canEnterFromHome = (piece, diceValue) => {
    return piece.step === HOME_STEP && diceValue === 6;
};

export const canMove = (piece, diceValue) => {
    if (piece.step === HOME_STEP) return diceValue === 6;
    if (piece.finished) return false;
    return (piece.step + diceValue) <= MAX_STEP;
};

export const validateMove = (prevPiece, newStep, diceValue) => {
    if (prevPiece.step === HOME_STEP && newStep >= 0) {
        return diceValue === 6;
    }
    if (prevPiece.finished) return false;
    const stepDiff = newStep - prevPiece.step;
    return stepDiff > 0 && stepDiff <= diceValue;
};

export const checkWinner = (pieces) => {
    for (const color of COLORS) {
        const colorPieces = pieces.filter(p => p.color === color);
        if (colorPieces.every(p => p.finished)) {
            return color;
        }
    }
    return null;
};

export const isPathBlocked = (piece, targetStep, opponentPieces) => {
    if (targetStep < 0 || targetStep >= PATH_LENGTH) return false;
    const startStep = piece.color === 'Red' ? 0 : 28;
    const pathSteps = [];
    const stepsToCheck = Math.min(targetStep, MAX_STEP - startStep);
    for (let s = 0; s < stepsToCheck; s++) {
        pathSteps.push((startStep + s) % PATH_LENGTH);
    }
    return opponentPieces.some(p => pathSteps.includes(p.step));
};