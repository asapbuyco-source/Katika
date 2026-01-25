
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Chess } from 'chess.js';

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8080;
const app = express();

// Allow CORS for all origins
app.use(cors({ origin: '*' }));
app.use(express.json()); // Enable JSON body parsing for webhooks

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
});

// --- IN-MEMORY STATE ---
const rooms = new Map(); // roomId -> { players: [], gameState: {}, ... }
const queues = new Map();
const userSockets = new Map();
const socketUsers = new Map();
const disconnectTimers = new Map(); // userId -> TimeoutID
const rateLimits = new Map();

// --- HELPER FUNCTIONS ---
const generateRoomId = () => `room_${Math.random().toString(36).substr(2, 9)}`;

const sanitize = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').slice(0, 500);
};

const endGame = (roomId, winnerId, reason) => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'completed') return;

    room.status = 'completed';
    room.winner = winnerId;

    const totalPot = room.stake * 2;
    const platformFee = Math.floor(totalPot * 0.10);
    const winnings = totalPot - platformFee;

    // Clear any pending timers for this room
    room.players.forEach(pid => {
        if (disconnectTimers.has(pid)) {
            clearTimeout(disconnectTimers.get(pid));
            disconnectTimers.delete(pid);
        }
    });

    io.to(roomId).emit('game_over', { 
        winner: winnerId,
        reason: reason,
        financials: { totalPot, platformFee, winnings }
    });

    // Clean up room after delay
    setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.status === 'completed') rooms.delete(roomId);
    }, 60000); 
};

// --- GAME LOGIC HELPERS ---

// CHECKERS
const initialCheckersState = (p1, p2) => {
    const pieces = [];
    let cid = 0;
    // Player 2 (Top, Rows 0-2) - P2 is traditionally 'Black' or 'Opponent' relative to P1
    for(let r=0; r<3; r++) {
        for(let c=0; c<8; c++) {
            if((r+c)%2===1) pieces.push({ id: `p2-${cid++}`, owner: p2, isKing: false, r, c });
        }
    }
    // Player 1 (Bottom, Rows 5-7) - P1 is 'Red' or 'Me' relative to P1
    for(let r=5; r<8; r++) {
        for(let c=0; c<8; c++) {
            if((r+c)%2===1) pieces.push({ id: `p1-${cid++}`, owner: p1, isKing: false, r, c });
        }
    }
    return { pieces, turn: p1 };
};

const handleCheckersMove = (room, userId, move) => {
    if (room.turn !== userId) return;
    
    const { fromR, fromC, toR, toC } = move;
    const pieces = room.gameState.pieces;
    const pieceIndex = pieces.findIndex(p => p.r === fromR && p.c === fromC && p.owner === userId);
    
    if (pieceIndex === -1) return; // Invalid piece
    
    const piece = pieces[pieceIndex];
    const isPlayer1 = room.players[0] === userId;
    const forwardDir = isPlayer1 ? -1 : 1;
    
    // Validate Geometry
    const dR = toR - fromR;
    const dC = toC - fromC;
    const absDR = Math.abs(dR);
    const absDC = Math.abs(dC);
    
    if (absDR !== absDC) return; // Must be diagonal
    if (absDR === 0 || absDR > 2) return; // Must be 1 or 2 steps
    
    // Validate Direction (unless King)
    if (!piece.isKing) {
        if (Math.sign(dR) !== forwardDir) return; 
    }

    // Check Capture
    let capturedId = null;
    if (absDR === 2) {
        const midR = fromR + dR/2;
        const midC = fromC + dC/2;
        const midPiece = pieces.find(p => p.r === midR && p.c === midC);
        if (!midPiece || midPiece.owner === userId) return; // Must capture opponent
        capturedId = midPiece.id;
    }

    // Update Piece
    piece.r = toR;
    piece.c = toC;
    
    // Promotion
    const promoRow = isPlayer1 ? 0 : 7;
    if (toR === promoRow) piece.isKing = true;

    // Remove Captured
    if (capturedId) {
        const capIdx = pieces.findIndex(p => p.id === capturedId);
        if (capIdx > -1) pieces.splice(capIdx, 1);
    }

    // Win Check
    const opponentId = room.players.find(id => id !== userId);
    const oppPieces = pieces.filter(p => p.owner === opponentId);
    if (oppPieces.length === 0) {
        endGame(room.id, userId, 'All pieces captured');
        return;
    }

    room.turn = opponentId;
    
    // Broadcast State
    io.to(room.id).emit('game_update', { 
        roomId: room.id,
        gameState: { pieces: room.gameState.pieces },
        turn: room.turn
    });
};

// LUDO
const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];
const handleLudoMove = (room, userId, pieceId) => {
    if (room.turn !== userId || !room.gameState.diceRolled) return;
    
    const pieces = room.gameState.pieces;
    const pIdx = pieces.findIndex(p => p.id === pieceId && p.owner === userId);
    if (pIdx === -1) return;
    
    const p = pieces[pIdx];
    const diceVal = room.gameState.diceValue;
    
    // Validate Move Start
    if (p.step === -1 && diceVal !== 6) return;
    
    // Calculate New Position
    const nextStep = p.step === -1 ? 0 : p.step + diceVal;
    if (nextStep > 56) return; // Cannot overshoot home
    
    p.step = nextStep;
    
    // Collision / Capture Logic
    let captured = false;
    const isPlayer1 = room.players[0] === userId; // P1 is Red
    
    if (nextStep >= 0 && nextStep <= 50) {
        const myAbsPos = isPlayer1 ? nextStep : (nextStep + 26) % 52;
        
        // Check collision with opponents
        const opponentId = room.players.find(id => id !== userId);
        const oppPieces = pieces.filter(op => op.owner === opponentId && op.step !== -1 && op.step <= 50);
        
        oppPieces.forEach(op => {
            const oppAbsPos = !isPlayer1 ? op.step : (op.step + 26) % 52; // Inverse logic for opponent
            if (myAbsPos === oppAbsPos && !SAFE_ZONES.includes(myAbsPos)) {
                op.step = -1; // Send home
                captured = true;
            }
        });
    }

    const bonusTurn = diceVal === 6 || captured;
    room.gameState.diceRolled = false;
    room.gameState.diceValue = null;
    
    // Win Check
    const myPieces = pieces.filter(mp => mp.owner === userId);
    if (myPieces.every(mp => mp.step === 56)) { 
        endGame(room.id, userId, 'All pieces home');
        return;
    }

    if (!bonusTurn) {
        room.turn = room.players.find(id => id !== userId);
    }

    io.to(room.id).emit('game_update', {
        roomId: room.id,
        gameState: room.gameState,
        turn: room.turn
    });
};

// CHESS - SIMPLIFIED HANDLER
const handleChessMove = (room, userId, move) => {
    if (room.turn !== userId) return;

    try {
        const game = new Chess();
        
        // Always load current FEN to calculate next state
        // If no FEN, use default start position
        if (room.gameState.fen) {
            game.load(room.gameState.fen);
        }
        
        // Apply Move
        const result = game.move(move);

        if (result) {
            // Update Server State
            room.gameState.fen = game.fen();
            
            // Check Game Over
            if (game.isGameOver()) {
                if (game.isCheckmate()) {
                    endGame(room.id, userId, 'Checkmate');
                } else {
                    // Stalemate / Draw
                    room.status = 'completed';
                    room.winner = 'DRAW';
                    io.to(room.id).emit('game_over', { 
                        winner: 'DRAW',
                        reason: 'Draw / Stalemate',
                        financials: null 
                    });
                    setTimeout(() => rooms.delete(room.id), 60000);
                }
            } else {
                // Next turn
                const opponentId = room.players.find(id => id !== userId);
                room.turn = opponentId;
            }

            // Broadcast New State
            io.to(room.id).emit('game_update', {
                roomId: room.id,
                gameState: { fen: room.gameState.fen },
                lastMove: result,
                turn: room.turn
            });
        }
    } catch (e) {
        console.error("Chess move error", e);
    }
};

// INITIALIZATION MAP
const createInitialGameState = (gameType, p1, p2) => {
    const common = {
        startTime: Date.now(),
        lastMoveTime: Date.now(),
        timers: { [p1]: 600, [p2]: 600 },
        lastUpdate: Date.now()
    };

    switch (gameType) {
        case 'Dice': return { ...common, scores: { [p1]: 0, [p2]: 0 }, currentRound: 1, roundRolls: {}, roundState: 'waiting' };
        case 'TicTacToe': return { ...common, board: Array(9).fill(null), status: 'active' };
        case 'Ludo': 
            const ludoPieces = [];
            for(let i=0; i<4; i++) ludoPieces.push({ id: i, color: 'Red', step: -1, owner: p1 });
            for(let i=0; i<4; i++) ludoPieces.push({ id: i+4, color: 'Yellow', step: -1, owner: p2 });
            return { ...common, pieces: ludoPieces, diceValue: null, diceRolled: false, turn: p1 };
        case 'Checkers': return { ...common, ...initialCheckersState(p1, p2) };
        case 'Chess': return { ...common, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', turn: p1 };
        default: return common;
    }
};

// --- WEBHOOK FOR PAYMENTS ---
app.post('/webhook/fapshi', (req, res) => {
    const { transId, status, userId, amount } = req.body;
    console.log(`Payment Webhook: ${transId} for ${userId} (${amount}) - ${status}`);
    res.sendStatus(200);
});

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    
    socket.on('join_game', ({ stake, userProfile, gameType }) => {
        const userId = userProfile.id;
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        if (disconnectTimers.has(userId)) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
        }

        const queueKey = `${gameType}_${stake}`;
        if (!queues.has(queueKey)) queues.set(queueKey, []);
        const queue = queues.get(queueKey);
        
        if (queue.length > 0) {
            const opponent = queue.shift();
            if (opponent.userProfile.id === userId) {
                queue.push({ socketId: socket.id, userProfile });
                socket.emit('waiting_for_opponent');
                return;
            }

            const roomId = generateRoomId();
            const room = {
                id: roomId,
                gameType,
                stake,
                players: [opponent.userProfile.id, userId],
                profiles: { [opponent.userProfile.id]: opponent.userProfile, [userId]: userProfile },
                turn: opponent.userProfile.id,
                status: 'active',
                gameState: createInitialGameState(gameType, opponent.userProfile.id, userId),
                chat: []
            };
            rooms.set(roomId, room);
            
            socket.join(roomId);
            const oppSocket = io.sockets.sockets.get(opponent.socketId);
            if (oppSocket) oppSocket.join(roomId);

            io.to(roomId).emit('match_found', { ...room });
        } else {
            queue.push({ socketId: socket.id, userProfile });
            socket.emit('waiting_for_opponent');
        }
    });

    socket.on('rejoin_game', ({ userProfile }) => {
        const userId = userProfile.id;
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        if (disconnectTimers.has(userId)) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
        }

        rooms.forEach((room, roomId) => {
            if (room.status === 'active' && room.players.includes(userId)) {
                socket.join(roomId);
                io.to(roomId).emit('opponent_reconnected', { userId });
                socket.emit('match_found', room); 
            }
        });
    });

    socket.on('leave_queue', () => {
        for (const [key, queue] of queues.entries()) {
            const idx = queue.findIndex(item => item.socketId === socket.id);
            if (idx !== -1) queue.splice(idx, 1);
        }
    });

    socket.on('game_action', ({ roomId, action }) => {
        const room = rooms.get(roomId);
        const userId = socketUsers.get(socket.id);
        if (!room || !userId || !room.players.includes(userId)) return;
        
        // --- GAME LOGIC ROUTER ---
        
        // General
        if (action.type === 'FORFEIT') {
            const winner = room.players.find(id => id !== userId);
            endGame(roomId, winner, 'Opponent Forfeited');
        }
        else if (action.type === 'CHAT') {
            room.chat = room.chat || [];
            room.chat.push({ id: Date.now().toString(), senderId: userId, message: sanitize(action.message), timestamp: Date.now() });
            io.to(roomId).emit('game_update', { roomId, chat: room.chat });
        }

        // Checkers
        else if (room.gameType === 'Checkers' && action.type === 'MOVE') {
            handleCheckersMove(room, userId, action.move);
        }

        // Ludo
        else if (room.gameType === 'Ludo') {
            if (action.type === 'ROLL') {
                if (room.turn === userId && !room.gameState.diceRolled) {
                    const val = Math.ceil(Math.random() * 6);
                    room.gameState.diceValue = val;
                    room.gameState.diceRolled = true;
                    io.to(roomId).emit('game_update', { roomId, gameState: room.gameState });
                }
            } else if (action.type === 'MOVE_PIECE') {
                handleLudoMove(room, userId, action.pieceId);
            }
        }

        // Chess
        else if (room.gameType === 'Chess' && action.type === 'MOVE') {
            handleChessMove(room, userId, action.move);
        }

        // TicTacToe
        else if (room.gameType === 'TicTacToe' && action.type === 'MOVE') {
             if (room.turn !== userId) return;
             const board = room.gameState.board;
             if (board[action.index] === null) {
                 const sym = userId === room.players[0] ? 'X' : 'O';
                 board[action.index] = sym;
                 room.turn = room.players.find(id => id !== userId);
                 
                 const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                 let winner = null;
                 for(let l of lines) if(board[l[0]] && board[l[0]]===board[l[1]] && board[l[0]]===board[l[2]]) winner = userId;
                 
                 if (winner) endGame(roomId, winner, 'Win');
                 else if (!board.includes(null)) {
                     io.to(roomId).emit('game_update', { roomId, status: 'draw' });
                     setTimeout(() => { room.gameState.board = Array(9).fill(null); io.to(roomId).emit('game_update', { roomId, gameState: room.gameState }); }, 3000);
                 } else {
                     io.to(roomId).emit('game_update', { roomId, gameState: room.gameState, turn: room.turn });
                 }
             }
        }
        
        // Dice
        else if (room.gameType === 'Dice' && action.type === 'ROLL') {
             if (room.turn !== userId) return;
             const r1 = Math.ceil(Math.random()*6);
             const r2 = Math.ceil(Math.random()*6);
             room.gameState.roundRolls[userId] = [r1, r2];
             io.to(roomId).emit('game_update', { roomId, gameState: room.gameState, diceRolled: true, diceValue: r1+r2 });
             const p1 = room.players[0]; const p2 = room.players[1];
             if (room.gameState.roundRolls[p1] && room.gameState.roundRolls[p2]) {
                 setTimeout(() => {
                     const s1 = room.gameState.roundRolls[p1].reduce((a,b)=>a+b,0);
                     const s2 = room.gameState.roundRolls[p2].reduce((a,b)=>a+b,0);
                     if (s1 > s2) room.gameState.scores[p1]++;
                     else if (s2 > s1) room.gameState.scores[p2]++;
                     room.gameState.roundState = 'scored';
                     io.to(roomId).emit('game_update', { roomId, gameState: room.gameState });
                     
                     setTimeout(() => {
                         if (room.gameState.scores[p1] >= 3 || room.gameState.scores[p2] >= 3) {
                             endGame(roomId, room.gameState.scores[p1] >= 3 ? p1 : p2, 'Score Reached');
                         } else {
                             room.gameState.currentRound++;
                             room.gameState.roundRolls = {};
                             room.gameState.roundState = 'waiting';
                             room.turn = room.gameState.currentRound % 2 !== 0 ? p1 : p2;
                             io.to(roomId).emit('game_update', { roomId, gameState: room.gameState });
                         }
                     }, 3000);
                 }, 2000);
             } else {
                 room.turn = room.players.find(id => id !== userId);
                 io.to(roomId).emit('game_update', { roomId, turn: room.turn });
             }
        }
    });

    socket.on('disconnect', () => {
        const userId = socketUsers.get(socket.id);
        if (userId) {
            for (const [key, queue] of queues.entries()) {
                const idx = queue.findIndex(item => item.userProfile.id === userId);
                if (idx !== -1) queue.splice(idx, 1);
            }

            rooms.forEach((room, roomId) => {
                if (room.status === 'active' && room.players.includes(userId)) {
                    if (room.winner) return; 

                    io.to(roomId).emit('opponent_disconnected', { userId });

                    const timer = setTimeout(() => {
                        const r = rooms.get(roomId);
                        if (r && r.status === 'active' && !r.winner) {
                            const winnerId = r.players.find(p => p !== userId);
                            endGame(roomId, winnerId, 'Opponent Timed Out');
                        }
                        disconnectTimers.delete(userId);
                    }, 60000); 

                    disconnectTimers.set(userId, timer);
                }
            });

            userSockets.delete(userId);
            socketUsers.delete(socket.id);
        }
    });
});

httpServer.listen(PORT, () => console.log(`Secure Game Server running on ${PORT}`));
