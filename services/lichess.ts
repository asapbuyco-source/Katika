// All Lichess API calls go through the server-side proxy or direct browser API.
// The token for bot play must be set via VITE_LICHESS_TOKEN env var.
// Never commit a raw Lichess API token to git.

const LICHESS_API_TOKEN = import.meta.env.VITE_LICHESS_TOKEN;
const BASE_URL = "https://lichess.org/api";

const requireToken = (): string => {
    if (!LICHESS_API_TOKEN) {
        throw new Error('[Lichess] VITE_LICHESS_TOKEN environment variable is not set.');
    }
    return LICHESS_API_TOKEN;
};

export const createLichessAiGame = async (level: number = 1, color: 'white' | 'black' | 'random' = 'white') => {
    const token = requireToken();
    try {
        const formData = new FormData();
        formData.append('level', level.toString());
        formData.append('color', color);

        const response = await fetch(`${BASE_URL}/challenge/ai`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Lichess API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Failed to create Lichess game", error);
        return null;
    }
};

export const fetchLichessGameState = async (gameId: string) => {
    try {
        const response = await fetch(`${BASE_URL}/game/export/${gameId}?moves=true&tags=false&clocks=true&evals=false`, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        return null;
    }
};

export const makeLichessMove = async (gameId: string, move: string) => {
    const token = requireToken();
    try {
        const response = await fetch(`${BASE_URL}/board/game/${gameId}/move/${move}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("Lichess Move Failed:", err);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Lichess Move Network Error", e);
        return false;
    }
};
