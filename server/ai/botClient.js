// DEPRECATED: Bot is now driven server-internally via scheduleBotTurn() →
// processBotAction() in server.js. This loopback socket client is no longer used.
// Kept for reference; can be safely deleted when no longer needed.
import { io } from 'socket.io-client';
import { calculateBotMove } from './botEngine.js';

const PORT = process.env.PORT || 8080;
const BOT_SECRET = process.env.INTERNAL_BOT_SECRET || 'KATIKA_INTERNAL_BOT_SECURE_BYPASS_992';

let botSocket = null;

export function initBotClient() {
    if (botSocket) return;

    botSocket = io(`http://localhost:${PORT}`, {
        auth: { token: BOT_SECRET },
        transports: ['websocket'],
        reconnection: true
    });

    botSocket.on('connect', () => {
        console.log('[BotClient] Katika Host connected to local socket server.');
    });

    botSocket.on('connect_error', (err) => {
        console.error('[BotClient] Connection error:', err.message);
    });

    botSocket.on('match_found', (data) => {
        console.log(`[BotClient] Match found! Room: ${data.roomId}, Game: ${data.gameType}`);
        handleRoomUpdate(data);
    });

    botSocket.on('game_update', (roomData) => {
        handleRoomUpdate(roomData);
    });

    function handleRoomUpdate(room) {
        if (!room || room.status !== 'active') return;
        
        // Katika Host / Trainer IDs
        const botId = room.players.find(id => id.startsWith('katika_host') || id.startsWith('katika_trainer'));
        if (!botId) return;

        if (room.turn === botId) {
            // It's the bot's turn! Calculate move after a realistic delay
            const difficulty = room.gameState?.difficulty || 'medium';
            const action = calculateBotMove(room.gameType, room.gameState, difficulty, botId);

            if (action) {
                // Simulate human thinking time (1.5 to 3 seconds)
                const delay = Math.floor(Math.random() * 1500) + 1500;
                setTimeout(() => {
                    botSocket.emit('game_action', { roomId: room.id || room.roomId, action });
                }, delay);
            }
        }
    }
}
