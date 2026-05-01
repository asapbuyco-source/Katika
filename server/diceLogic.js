// Dice game validation logic
// Extracted from server.js for better testability and maintainability

export const WINNING_SCORE = 3;

export const createInitialState = () => ({
    scores: {},
    currentRoll: null,
    roundActive: false
});

export const validateRoll = (playerId) => {
    if (!playerId) return { valid: false, error: 'Missing playerId' };
    return { valid: true };
};

export const updateScore = (scores, playerId, roll, opponentId) => {
    const newScores = { ...scores };
    
    if (roll === 6) {
        newScores[playerId] = (newScores[playerId] || 0) + 1;
    } else if (roll === 1) {
        newScores[opponentId] = (newScores[opponentId] || 0) + 1;
    }
    
    return newScores;
};

export const checkWinner = (scores) => {
    for (const [player, score] of Object.entries(scores)) {
        if (score >= WINNING_SCORE) {
            return player;
        }
    }
    return null;
};

export const isRoundComplete = (roll) => {
    return roll !== 6;
};