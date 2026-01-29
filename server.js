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
const disconnectTimers = new Map(); // userId -> TimeoutID

// --- HELPER FUNCTIONS ---
const generateRoomId = () => `room_${Math.random().toString(36).substr(2, 9)}`;

const calculatePayouts = (stake) => {
    const totalPot = stake * 2;
    const platformFee = Math.floor(totalPot * 0.10); // 10% Fee
    const winnings = totalPot - platformFee;
    return { totalPot, platformFee, winnings };
};

const endGame = (roomId, winnerId, reason) => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'completed') return;

    room.status = 'completed';
    room.winner = winnerId;

    const { totalPot, platformFee, winnings } = calculatePayouts(room.stake);

    io.to(roomId).emit('game_over', { 
        winner: winnerId,
        reason: reason,
        financials: {
            totalPot,
            platformFee,
            winnings
        }
    });

    // Cleanup Room Data after a delay (Extended for Rematch window)
    setTimeout(() => {
        const r = rooms.get(roomId);
        // Only delete if still completed (not rematched)
        if (r && r.status === 'completed') {
            rooms.delete(roomId);
        }
    }, 60000); 
};

// Card Game Helpers
const createDeck = () => {
    const suits = ['H', 'D', 'C', 'S'];
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    let deck = [];
    for(let s of suits) for(let r of ranks) deck.push({ id: s+r, suit: s, rank: r });
    return deck.sort(() => Math.random() - 0.5);
};

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
        case 'Ludo':
            const pieces = [];
            for(let i=0; i<4; i++) pieces.push({ id: i, color: 'Red', step: -1, owner: p1 });
            for(let i=0; i<4; i++) pieces.push({ id: i+4, color: 'Yellow', step: -1, owner: p2 });
            return {
                ...common,
                pieces,
                diceValue: null,
                diceRolled: false,
                turn: p1
            };
        case 'Cards':
            const deck = createDeck();
            return {
                ...common,
                deck: deck.slice(14),
                hands: { [p1]: deck.slice(0, 7), [p2]: deck.slice(7, 14) },
                discardPile: [deck[14]],
                activeSuit: deck[14].suit,
                turn: p1
            };
        case 'Checkers':
            const checkersPieces = [];
            let cid = 0;
            // Player 2 (Top, Rows 0-2)
            for(let r=0; r<3; r++) {
                for(let c=0; c<8; c++) {
                    if((r+c)%2===1) checkersPieces.push({ id: `p2-${cid++}`, owner: p2, isKing: false, r, c });
                }
            }
            // Player 1 (Bottom, Rows 5-7)
            for(let r=5; r<8; r++) {
                for(let c=0; c<8; c++) {
                    if((r+c)%2===1) checkersPieces.push({ id: `p1-${cid++}`, owner: p1, isKing: false, r, c });
                }
            }
            return {
                ...common,
                pieces: checkersPieces,
                turn: p1
            };
        case 'Chess':
            return {
                ...common,
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Standard start FEN
                pgn: '',
                turn: p1
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
        
        // Handle rapid re-connections
        if (disconnectTimers.has(userId)) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
        }

        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        console.log(`Matchmaking request: ${userProfile.name} for ${gameType} (${stake})`);

        // Check if reconnecting to active room
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(userId) && room.status === 'active') {
                socket.join(roomId);
                
                // Notify others that I'm back
                socket.to(roomId).emit('opponent_reconnected', { userId });

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
                console.log(`User ${userId} reconnected to ${roomId}`);
                return;
            }
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
                players: [opponentId, userId], // Player 0 (Host), Player 1 (Joiner)
                profiles: {
                    [opponentId]: opponent.userProfile,
                    [userId]: userProfile
                },
                turn: opponentId, 
                status: 'active',
                gameState: createInitialGameState(gameType, opponentId, userId),
                chat: [],
                rematchVotes: new Set()
            };

            rooms.set(roomId, room);

            // Notify Players
            const oppSocketId = userSockets.get(opponentId);
            
            // Join Socket Rooms
            socket.join(roomId);
            if (io.sockets.sockets.get(oppSocketId)) {
                io.sockets.sockets.get(oppSocketId).join(roomId);
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

    // 2. REJOIN EXPLICIT
    socket.on('rejoin_game', ({ userProfile }) => {
        const userId = userProfile.id;
        
        if (disconnectTimers.has(userId)) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
        }

        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(userId) && room.status === 'active') {
                socket.join(roomId);
                socket.to(roomId).emit('opponent_reconnected', { userId });
                
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
            const winner = room.players.find(id => id !== userId);
            endGame(roomId, winner, 'Opponent Forfeited');
            return;
        }

        // --- REMATCH LOGIC ---
        if (action.type === 'REMATCH_REQUEST') {
            if (!room.rematchVotes) room.rematchVotes = new Set();
            room.rematchVotes.add(userId);

            // Notify other player
            socket.to(roomId).emit('rematch_status', { requestorId: userId, status: 'requested' });

            // If both players accepted
            if (room.rematchVotes.size === room.players.length) {
                console.log(`Rematch accepted in room ${roomId}`);
                
                // Reset Room State
                room.status = 'active';
                room.winner = null;
                room.rematchVotes.clear();
                room.gameState = createInitialGameState(room.gameType, room.players[0], room.players[1]);
                // Keep chat history
                
                // Emit Match Found (this resets the client UI)
                io.to(roomId).emit('match_found', {
                    roomId,
                    players: room.players,
                    gameType: room.gameType,
                    stake: room.stake,
                    gameState: room.gameState,
                    turn: room.turn,
                    profiles: room.profiles,
                    chat: room.chat
                });
            }
            return;
        }

        if (action.type === 'REMATCH_DECLINE') {
            if (room.rematchVotes) room.rematchVotes.delete(userId);
            socket.to(roomId).emit('rematch_status', { requestorId: userId, status: 'declined' });
            return;
        }

        // --- DICE LOGIC ---
        if (room.gameType === 'Dice' && action.type === 'ROLL') {
            if (room.turn !== userId) return; 

            const roll1 = Math.ceil(Math.random() * 6);
            const roll2 = Math.ceil(Math.random() * 6);
            
            room.gameState.roundRolls[userId] = [roll1, roll2];
            
            io.to(roomId).emit('game_update', {
                ...room,
                roomId: roomId, 
                gameState: room.gameState,
                diceRolled: true,
                diceValue: roll1 + roll2 
            });

            const p1 = room.players[0];
            const p2 = room.players[1];
            if (room.gameState.roundRolls[p1] && room.gameState.roundRolls[p2]) {
                setTimeout(() => {
                    const total1 = room.gameState.roundRolls[p1][0] + room.gameState.roundRolls[p1][1];
                    const total2 = room.gameState.roundRolls[p2][0] + room.gameState.roundRolls[p2][1];

                    if (total1 > total2) room.gameState.scores[p1]++;
                    else if (total2 > total1) room.gameState.scores[p2]++;

                    room.gameState.roundState = 'scored';
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });

                    setTimeout(() => {
                        if (room.gameState.scores[p1] >= 3 || room.gameState.scores[p2] >= 3) {
                            const winner = room.gameState.scores[p1] >= 3 ? p1 : p2;
                            endGame(roomId, winner, 'Score Limit Reached');
                        } else {
                            room.gameState.currentRound++;
                            room.gameState.roundRolls = {};
                            room.gameState.roundState = 'waiting';
                            room.turn = room.gameState.currentRound % 2 !== 0 ? p1 : p2;
                            io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
                        }
                    }, 3000);

                }, 2000);
            } else {
                room.turn = room.players.find(id => id !== userId);
                io.to(roomId).emit('game_update', { ...room, roomId });
            }
        }

        // --- CHECKERS & CHESS & TICTACTOE ---
        else if (action.type === 'MOVE') {
            if (room.turn !== userId && room.gameType !== 'Cards') return;

            if (action.newState) {
                room.gameState = { ...room.gameState, ...action.newState };
                if (action.newState.timers) room.gameState.timers = action.newState.timers;
                if (action.newState.turn) room.turn = action.newState.turn;
                
                if (action.newState.winner) {
                    endGame(roomId, action.newState.winner, 'Checkmate / Win Condition');
                    return;
                }
            } 
            else if (action.index !== undefined && room.gameType === 'TicTacToe') {
               const board = room.gameState.board;
               if (board[action.index] === null) {
                   const symbol = userId === room.players[0] ? 'X' : 'O';
                   board[action.index] = symbol;
                   room.turn = room.players.find(id => id !== userId);
                   
                   const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                   let winner = null;
                   for(let line of lines) {
                       if(board[line[0]] && board[line[0]] === board[line[1]] && board[line[0]] === board[line[2]]) {
                           winner = userId;
                       }
                   }
                   
                   if (winner) {
                       endGame(roomId, winner, 'Line Complete');
                       return;
                   } else if (!board.includes(null)) {
                       io.to(roomId).emit('game_update', { ...room, roomId, status: 'draw' });
                       setTimeout(() => {
                           room.gameState.board = Array(9).fill(null);
                           room.status = 'active'; // Reset status from draw
                           io.to(roomId).emit('game_update', { ...room, roomId });
                       }, 3000);
                   }
               }
            }
            io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
        }
        else if (room.gameType === 'TicTacToe' && action.type === 'DRAW_ROUND') {
             io.to(roomId).emit('game_update', { ...room, roomId, status: 'draw' });
             setTimeout(() => {
                 room.gameState.board = Array(9).fill(null);
                 room.status = 'active';
                 io.to(roomId).emit('game_update', { ...room, roomId });
             }, 3000);
        }

        // --- LUDO ---
        else if (room.gameType === 'Ludo') {
            if (action.type === 'ROLL') {
                if (room.turn !== userId) return;
                const diceVal = Math.ceil(Math.random() * 6);
                room.gameState.diceValue = diceVal;
                room.gameState.diceRolled = true;
                io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
            }
            else if (action.type === 'MOVE_PIECE') {
                if (room.turn !== userId) return;
                room.gameState.pieces = action.pieces;
                room.gameState.diceRolled = false;
                if (!action.bonusTurn) {
                    room.turn = room.players.find(id => id !== userId);
                }
                io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
            }
        }

        // --- CARDS ---
        else if (room.gameType === 'Cards') {
            if (room.turn !== userId) return;

            if (action.type === 'PLAY') {
                const hand = room.gameState.hands[userId];
                const cardIndex = hand.findIndex(c => c.id === action.card.id);
                
                if (cardIndex > -1) {
                    // Remove from hand
                    hand.splice(cardIndex, 1);
                    // Add to discard
                    room.gameState.discardPile.push(action.card);
                    // Update suit
                    room.gameState.activeSuit = action.suit;
                    
                    // Emit update BEFORE ending game so client sees empty hand
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });

                    // Win Check
                    if (hand.length === 0) {
                        endGame(roomId, userId, 'Hand Cleared');
                        return;
                    }
                    
                    // Turn Pass
                    room.turn = room.players.find(id => id !== userId);
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
                }
            } else if (action.type === 'DRAW') {
                if (room.gameState.deck.length > 0) {
                    const card = room.gameState.deck.pop();
                    room.gameState.hands[userId].push(card);
                    // Shuffle discard back if empty
                    if (room.gameState.deck.length === 0) {
                        const top = room.gameState.discardPile.pop();
                        room.gameState.deck = room.gameState.discardPile.sort(() => Math.random() - 0.5);
                        room.gameState.discardPile = [top];
                    }
                    if (action.passTurn) {
                        room.turn = room.players.find(id => id !== userId);
                    }
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
                }
            }
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
            if (room.chat.length > 50) room.chat.shift();
            io.to(roomId).emit('game_update', { ...room, roomId, chat: room.chat });
        }

        // --- TIMEOUT CLAIM ---
        else if (action.type === 'TIMEOUT_CLAIM') {
            const winner = room.players.find(id => id !== userId);
            endGame(roomId, winner, 'Time Expired');
        }
    });

    // 4. DISCONNECT
    socket.on('disconnect', () => {
        const userId = socketUsers.get(socket.id);
        console.log(`User disconnected: ${socket.id} (${userId})`);
        
        if (userId) {
            // Find active room
            for (const [roomId, room] of rooms.entries()) {
                if (room.players.includes(userId) && room.status === 'active') {
                    // Start Disconnect Timer
                    console.log(`Starting 240s forfeit timer for ${userId}`);
                    
                    // Notify other player immediately
                    io.to(roomId).emit('opponent_disconnected', { 
                        disconnectedUserId: userId,
                        timeoutSeconds: 240 // 4 minutes
                    });

                    const timerId = setTimeout(() => {
                        // If timer completes, user forfeited
                        console.log(`Time expired for ${userId}, forfeiting game.`);
                        const winner = room.players.find(id => id !== userId);
                        endGame(roomId, winner, 'Opponent Disconnected');
                        disconnectTimers.delete(userId);
                    }, 240000); // 240 seconds

                    disconnectTimers.set(userId, timerId);
                    break;
                }
                // Also notify if game is completed but players are in rematch phase
                if (room.players.includes(userId) && room.status === 'completed') {
                    io.to(roomId).emit('rematch_status', { requestorId: userId, status: 'declined' });
                }
            }

            userSockets.delete(userId);
            socketUsers.delete(socket.id);
            
            // Remove from matchmaking queues
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