// Leaderboard service — fetches weekly Chess + Checkers leaderboards from server API.
import { getApiUrl } from './init';
import { auth } from './init';

export interface LeaderboardEntry {
    rank: number;
    userId: string;
    name: string;
    avatar: string;
    elo: number;
    rankTier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
    winCount: number;
    gamesPlayed: number;
}

export interface LeaderboardResponse {
    rankings: LeaderboardEntry[];
    generatedAt: string;
}

export const getLeaderboard = async (gameType: 'Chess' | 'Checkers'): Promise<LeaderboardEntry[]> => {
    try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return [];
        const response = await fetch(`${getApiUrl()}/api/leaderboard/${gameType}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        const data: LeaderboardResponse = await response.json();
        return data.rankings || [];
    } catch (e) {
        console.error('[Leaderboard] Fetch failed:', e);
        return [];
    }
};