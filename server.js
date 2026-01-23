import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8080;
const app = express();

// Allow CORS for all origins (Netlify frontend compatibility)
app.use(cors({ origin: '*' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'], // Ensure compatibility
  pingTimeout: 60000,
});

// --- IN-MEMORY STATE ---
const rooms = new Map(); // roomId -> { players: [], gameState: {}, ... }
const queues = new Map(); // gameType_stake -> [ { socketId, userProfile } ]
const userSockets = new Map(); // userId -> socketId
const socketUsers = new Map(); // socketId -> userId

// --- HELPER FUNCTIONS ---
const generateRoomId = () => `room_${Math.random().toString(36).substr(2, 9)}`;

const createInitialGameState = (gameType, p1, p2) => {
    const common = {
        startTime: Date.now(),
        lastMoveTime: Date.now(),
        timers: { [p1]: 600, [p2]: 600 }, // 10 mins default
    };

    switch (gameType) {
        case 'Dice':
            return {
                ...common,
                scores: { [p1]: 0, [p2]: 0 },
                currentRound: 1,
                roundRolls: {}, // { uid: [1, 2] }
                roundState: 'waiting', // waiting, rolling, scored
            };
        case 'TicTacToe':
            return {
                ...common,
                board: Array(9).fill(null),
                status: 'active'
            };
        case 'Checkers':
        case 'Chess':
        case 'Ludo':
        case 'Cards':
            return {
                ...common,
                board: null, // Client initializes
                fen: null,
                pgn: null,
                pieces: null
            };
        default:
            return common;
    }
};

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. JOIN GAME (MATCHMAKING)
    socket.on('join_game', ({ stake, userProfile, gameType, privateRoomId }) => {
        const userId = userProfile.id;
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        console.log(`Matchmaking request: ${userProfile.name} for ${gameType} (${stake})`);

        // Check if reconnecting to active room
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(userId) && room.status === 'active') {
                socket.join(roomId);
                socket.emit('match_found', {
                    roomId,
                    players: room.players,
                    gameType: room.gameType,
                    stake: room.stake,
                    gameState: room.gameState,
                    turn: room.turn,
                    profiles: room.profiles
                });
                return;
            }
        }

        // Handle Private Room
        if (privateRoomId) {
            // Implementation simplified for P2P queue focus
            // In a real scenario, we'd check if room exists or create it waiting for specific peer
        }

        // Public Matchmaking Queue
        const queueKey = `${gameType}_${stake}`;
        if (!queues.has(queueKey)) queues.set(queueKey, []);
        
        const queue = queues.get(queueKey);
        
        // Remove self from queue if already there
        const existingIdx = queue.findIndex(item => item.userProfile.id === userId);
        if (existingIdx > -1) queue.splice(existingIdx, 1);

        if (queue.length > 0) {
            // MATCH FOUND!
            const opponent = queue.shift();
            const opponentId = opponent.userProfile.id;
            const roomId = generateRoomId();

            // Create Room
            const room = {
                id: roomId,
                gameType,
                stake,
                players: [opponentId, userId], // Player 0, Player 1
                profiles: {
                    [opponentId]: opponent.userProfile,
                    [userId]: userProfile
                },
                turn: opponentId, // Challenger (first in queue) starts usually, or random
                status: 'active',
                gameState: createInitialGameState(gameType, opponentId, userId),
                chat: []
            };

            rooms.set(roomId, room);

            // Notify Players
            const oppSocket = userSockets.get(opponentId);
            
            // Join Socket Rooms
            socket.join(roomId);
            if (io.sockets.sockets.get(oppSocket)) {
                io.sockets.sockets.get(oppSocket).join(roomId);
            }

            // Emit Start
            io.to(roomId).emit('match_found', {
                roomId,
                players: room.players,
                gameType,
                stake,
                gameState: room.gameState,
                turn: room.turn,
                profiles: room.profiles
            });

            console.log(`Match created: ${roomId}`);

        } else {
            // ADD TO QUEUE
            queue.push({ socketId: socket.id, userProfile });
            socket.emit('waiting_for_opponent');
            console.log(`Added to queue: ${queueKey}`);
        }
    });

    // 2. REJOIN
    socket.on('rejoin_game', ({ userProfile }) => {
        const userId = userProfile.id;
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(userId) && room.status === 'active') {
                socket.join(roomId);
                socket.emit('match_found', {
                    roomId,
                    players: room.players,
                    gameType: room.gameType,
                    stake: room.stake,
                    gameState: room.gameState,
                    turn: room.turn,
                    profiles: room.profiles,
                    chat: room.chat
                });
                console.log(`User ${userId} rejoined ${roomId}`);
                break;
            }
        }
    });

    // 3. GAME ACTIONS
    socket.on('game_action', ({ roomId, action }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const userId = socketUsers.get(socket.id);
        if (!userId || !room.players.includes(userId)) return;

        // --- FORFEIT / QUIT (Generic) ---
        if (action.type === 'FORFEIT') {
            room.status = 'completed';
            const winner = room.players.find(id => id !== userId);
            room.winner = winner;
            io.to(roomId).emit('game_over', { winner });
            return;
        }

        // --- DICE LOGIC (Server Authoritative) ---
        if (room.gameType === 'Dice' && action.type === 'ROLL') {
            if (room.turn !== userId) return; // Not your turn

            const roll1 = Math.ceil(Math.random() * 6);
            const roll2 = Math.ceil(Math.random() * 6);
            
            room.gameState.roundRolls[userId] = [roll1, roll2];
            
            // Notify roll
            io.to(roomId).emit('game_update', {
                ...room,
                gameState: room.gameState,
                diceRolled: true,
                diceValue: roll1 + roll2 // For UI display if needed
            });

            // Check if both rolled
            const p1 = room.players[0];
            const p2 = room.players[1];
            if (room.gameState.roundRolls[p1] && room.gameState.roundRolls[p2]) {
                // Round Complete
                setTimeout(() => {
                    const total1 = room.gameState.roundRolls[p1][0] + room.gameState.roundRolls[p1][1];
                    const total2 = room.gameState.roundRolls[p2][0] + room.gameState.roundRolls[p2][1];

                    if (total1 > total2) room.gameState.scores[p1]++;
                    else if (total2 > total1) room.gameState.scores[p2]++;
                    // Tie: no points

                    room.gameState.roundState = 'scored';
                    io.to(roomId).emit('game_update', {
                        ...room,
                        gameState: room.gameState
                    });

                    // Next Round logic (after delay)
                    setTimeout(() => {
                        if (room.gameState.scores[p1] >= 3 || room.gameState.scores[p2] >= 3) {
                            // Game Over
                            room.status = 'completed';
                            room.winner = room.gameState.scores[p1] >= 3 ? p1 : p2;
                            io.to(roomId).emit('game_over', { winner: room.winner });
                        } else {
                            // Reset Round
                            room.gameState.currentRound++;
                            room.gameState.roundRolls = {};
                            room.gameState.roundState = 'waiting';
                            room.turn = room.gameState.currentRound % 2 !== 0 ? p1 : p2; // Alternate starts
                            
                            io.to(roomId).emit('game_update', { ...room, gameState: room.gameState });
                        }
                    }, 3000);

                }, 2000); // Wait for roll animation
            } else {
                // Switch turn to other player to roll
                room.turn = room.players.find(id => id !== userId);
                io.to(roomId).emit('game_update', { ...room });
            }
        }

        // --- CHECKERS & CHESS & TICTACTOE (Relay + Validation) ---
        else if (action.type === 'MOVE') {
            if (room.turn !== userId && room.gameType !== 'Cards') return;

            // Relay State
            if (action.newState) {
                // For Chess/Checkers where client calculates state
                room.gameState = { ...room.gameState, ...action.newState };
                
                // Update Timers
                if (action.newState.timers) room.gameState.timers = action.newState.timers;
                
                // Update Turn
                if (action.newState.turn) room.turn = action.newState.turn;
                
                // Check Winner
                if (action.newState.winner) {
                    room.status = 'completed';
                    room.winner = action.newState.winner;
                    io.to(roomId).emit('game_over', { winner: room.winner });
                }
            } 
            // For TicTacToe (Index based)
            else if (action.index !== undefined && room.gameType === 'TicTacToe') {
               const board = room.gameState.board;
               if (board[action.index] === null) {
                   const symbol = userId === room.players[0] ? 'X' : 'O';
                   board[action.index] = symbol;
                   room.turn = room.players.find(id => id !== userId);
                   
                   // Simple Win Check
                   const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                   let winner = null;
                   for(let line of lines) {
                       if(board[line[0]] && board[line[0]] === board[line[1]] && board[line[0]] === board[line[2]]) {
                           winner = userId;
                       }
                   }
                   
                   if (winner) {
                       room.status = 'completed';
                       room.winner = winner;
                       io.to(roomId).emit('game_over', { winner });
                   } else if (!board.includes(null)) {
                       // Draw
                       io.to(roomId).emit('game_update', { ...room, status: 'draw' });
                       // Reset board for next round (simplified)
                       setTimeout(() => {
                           room.gameState.board = Array(9).fill(null);
                           io.to(roomId).emit('game_update', { ...room });
                       }, 3000);
                   }
               }
            }

            io.to(roomId).emit('game_update', { ...room, gameState: room.gameState });
        }

        // --- LUDO LOGIC (Hybrid) ---
        else if (room.gameType === 'Ludo') {
            if (action.type === 'ROLL') {
                if (room.turn !== userId) return;
                const diceVal = Math.ceil(Math.random() * 6);
                room.gameState.diceValue = diceVal;
                room.gameState.diceRolled = true;
                
                io.to(roomId).emit('game_update', { ...room, gameState: room.gameState });
            }
            else if (action.type === 'MOVE_PIECE') {
                if (room.turn !== userId) return;
                room.gameState.pieces = action.pieces;
                room.gameState.diceRolled = false;
                
                // Bonus turn if 6, else switch
                if (!action.bonusTurn) {
                    room.turn = room.players.find(id => id !== userId);
                }
                io.to(roomId).emit('game_update', { ...room, gameState: room.gameState });
            }
        }

        // --- CARD GAME (Kmer Cards) ---
        else if (room.gameType === 'Cards') {
            // Simplified Relay
            io.to(roomId).emit('game_update', { ...room }); 
        }

        // --- CHAT ---
        else if (action.type === 'CHAT') {
            const msg = {
                id: Date.now().toString(),
                senderId: userId,
                message: action.message,
                timestamp: Date.now()
            };
            if (!room.chat) room.chat = [];
            room.chat.push(msg);
            // Limit history
            if (room.chat.length > 50) room.chat.shift();
            
            io.to(roomId).emit('game_update', { ...room, chat: room.chat });
        }

        // --- TIMEOUT ---
        else if (action.type === 'TIMEOUT_CLAIM') {
            // Trust client for now, or implement server timer
            room.status = 'completed';
            const winner = room.players.find(id => id !== userId); // The OTHER player wins
            room.winner = winner;
            io.to(roomId).emit('game_over', { winner });
        }
    });

    // 4. DISCONNECT
    socket.on('disconnect', () => {
        const userId = socketUsers.get(socket.id);
        console.log(`User disconnected: ${socket.id} (${userId})`);
        
        if (userId) {
            userSockets.delete(userId);
            socketUsers.delete(socket.id);
            
            // Optional: Remove from queues
            queues.forEach((queue, key) => {
                const idx = queue.findIndex(i => i.userProfile.id === userId);
                if (idx > -1) queue.splice(idx, 1);
            });
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`Vantage Game Server running on port ${PORT}`);
});