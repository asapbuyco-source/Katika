// Pure algorithmic logic for tournament bracket generation

export const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

export const generateFirstRoundMatches = (participants, tournamentId, startTime, playerProfilesMap) => {
    const shuffled = shuffleArray(participants);
    const matches = [];
    let matchCount = 0;
    
    // Pop 2 at a time. If 1 is left, they get a bye.
    while (shuffled.length > 0) {
        const p1Id = shuffled.pop();
        const p2Id = shuffled.pop(); // Could be undefined if odd number

        const p1 = playerProfilesMap.get(p1Id) || { id: p1Id, name: 'Unknown' };
        const p2 = p2Id ? (playerProfilesMap.get(p2Id) || { id: p2Id, name: 'Unknown' }) : null;

        matches.push({
            id: `m-${tournamentId}-r1-${matchCount}`,
            tournamentId,
            round: 1,
            matchIndex: matchCount,
            player1: p1,
            player2: p2,
            winnerId: p2 ? null : p1.id, // bye yields instant win
            status: p2 ? 'scheduled' : 'completed',
            startTime,
            nextMatchId: null
        });
        matchCount++;
    }
    return matches;
};

export const generateNextRoundMatches = (winners, tournamentId, nextRound, nextMatchCountStartIndex, playerProfilesMap) => {
    const matches = [];
    let matchCount = nextMatchCountStartIndex;
    
    for (let i = 0; i < winners.length; i += 2) {
        const p1Id = winners[i];
        const p2Id = winners[i + 1]; // Could be undefined

        const p1 = playerProfilesMap.get(p1Id) || { id: p1Id, name: 'Unknown' };
        const p2 = p2Id ? (playerProfilesMap.get(p2Id) || { id: p2Id, name: 'Unknown' }) : null;

        matches.push({
            id: `m-${tournamentId}-r${nextRound}-${matchCount}`,
            tournamentId,
            round: nextRound,
            matchIndex: matchCount,
            player1: p1,
            player2: p2,
            winnerId: p2Id ? null : p1Id,
            status: p2Id ? 'scheduled' : 'completed',
            startTime: new Date(Date.now() + 60000).toISOString() // +1 min for next round scheduled
        });
        matchCount++;
    }
    return matches;
};
