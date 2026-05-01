// Lidraughts API Service
// Token must be set via VITE_LIDRAUGHTS_TOKEN environment variable.
// Throws if token is missing — never silently falls back to a committed value.

const getToken = (): string => {
    const token = import.meta.env.VITE_LIDRAUGHTS_TOKEN;
    if (!token) {
        throw new Error('[Lidraughts] VITE_LIDRAUGHTS_TOKEN environment variable is not set.');
    }
    return token;
};

const BASE_URL = "https://lidraughts.org/api";

export interface LidraughtsGame {
    id: string;
    variant: { key: string; name: string; };
    speed: string;
    perf: string;
}

export const toCoords = (square: number) => {
    const row = Math.floor((square - 1) / 4);
    const col = ((square - 1) % 4) * 2 + ((row % 2 === 0) ? 1 : 0);
    return { r: row, c: col };
};

export const toNotation = (r: number, c: number) => {
    return (r * 4) + Math.floor(c / 2) + 1;
};

export const createLidraughtsGame = async (level: number = 1, retries = 2): Promise<LidraughtsGame | null> => {
    let lastError: any;
    const token = getToken();

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const formData = new FormData();
            formData.append('level', level.toString());
            formData.append('color', 'white');
            formData.append('variant', 'english');

            const response = await fetch(`${BASE_URL}/challenge/ai`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                lastError = await response.text();
                if (attempt < retries) continue;
                console.error("Lidraughts Create Error:", lastError);
                return null;
            }
            return await response.json();
        } catch (e) {
            lastError = e;
            if (attempt < retries) { await new Promise(r => setTimeout(r, 500)); continue; }
            console.error("Lidraughts Network Error", e);
        }
    }
    return null;
};

export const fetchLidraughtsState = async (gameId: string) => {
    const token = getToken();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${BASE_URL}/board/game/stream/${gameId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/x-ndjson'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.body) return null;

        const reader = response.body.getReader();
        const { value } = await reader.read();
        reader.cancel();

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(l => l.trim() !== '');
        const lastLine = lines[lines.length - 1];
        return JSON.parse(lastLine);
    } catch (e) {
        console.error("Lidraughts Fetch Error", e);
        return null;
    }
};

export const makeLidraughtsMove = async (gameId: string, moveString: string) => {
    const token = getToken();
    try {
        const response = await fetch(`${BASE_URL}/board/game/${gameId}/move/${moveString}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.ok;
    } catch (e) {
        console.error("Move Failed", e);
        return false;
    }
};
