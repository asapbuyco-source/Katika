// Dice game validation logic
// Extracted from server.js for better testability and maintainability

export const WINNING_SCORE = 3;
export const MAX_ROUNDS = 20;

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

export const evaluateDiceRound = (p1Roll, p2Roll) => {
    const total1 = p1Roll[0] + p1Roll[1];
    const total2 = p2Roll[0] + p2Roll[1];

    if (total1 > total2) return 'p1';
    if (total2 > total1) return 'p2';
    return 'tie';
};

export const applyDiceRound = (state, players) => {
    const [p1, p2] = players;
    const p1Roll = state.roundRolls?.[p1];
    const p2Roll = state.roundRolls?.[p2];

    if (!p1Roll || !p2Roll) {
        return {
            ...state,
            turn: p1Roll ? p2 : p1
        };
    }

    const scores = { ...state.scores };
    const roundWinner = evaluateDiceRound(p1Roll, p2Roll);

    if (roundWinner === 'p1') scores[p1] = (scores[p1] || 0) + 1;
    if (roundWinner === 'p2') scores[p2] = (scores[p2] || 0) + 1;

    if (scores[p1] >= WINNING_SCORE) {
        return { ...state, scores, roundState: 'scored', winner: p1, endReason: 'Score Limit Reached' };
    }

    if (scores[p2] >= WINNING_SCORE) {
        return { ...state, scores, roundState: 'scored', winner: p2, endReason: 'Score Limit Reached' };
    }

    if ((state.currentRound || 1) >= MAX_ROUNDS) {
        return { ...state, scores, roundState: 'scored', winner: null, endReason: 'Draw' };
    }

    const currentRound = (state.currentRound || 1) + 1;

    return {
        ...state,
        scores,
        currentRound,
        roundRolls: {},
        roundState: 'waiting',
        turn: currentRound % 2 === 0 ? p2 : p1
    };
};
