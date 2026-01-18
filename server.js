
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Vantage Referee is Ready');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const TURN_DURATION_MS = 20000; 

// --- STATE MANAGEMENT ---
const activeGames = {}; // roomId -> GameState
const waitingQueues = {}; // stake -> { userId, socketId }
const userSessions = {}; // userId -> { socketId, roomId }
const privateMatches = {}; // roomId -> { stake, gameType, players: [] }

// --- GAME LOGIC ENGINES ---

const createInitialState = (gameType, players, stake) => {
    const base = {
        players,
        turn: players[0], // First player starts
        stake,
        gameType,
        status: 'active',
        turnExpiresAt: Date.now() + TURN_DURATION_MS,
    };

    if (gameType === 'Dice') {
        return {
            ...base,
            scores: { [players[0]]: 0, [players[1]]: 0 },
            currentRound: 1,
            roundState: 'waiting', // waiting, rolled_1, scored
            roundRolls: { [players[0]]: null, [players[1]]: null } // [d1, d2]
        };
    }
    
    // Default generic state for others
    return { ...base, board: null, lastMove: null };
};

const handleDiceAction = (game, action, userId) => {
    // Action: { type: 'ROLL' }
    if (action.type === 'ROLL') {
        // Validate Turn
        // In Dice, players roll simultaneously or sequentially depending on implementation.
        // Here: Sequential.
        if (game.turn !== userId) return null;

        const d1 = Math.ceil(Math.random() * 6);
        const d2 = Math.ceil(Math.random() * 6);
        
        game.roundRolls[userId] = [d1, d2];
        
        // Check if other player has rolled this round
        const otherPlayer = game.players.find(p => p !== userId);
        
        if (game.roundRolls[otherPlayer]) {
            // Both rolled, evaluate round
            const p1Roll = game.roundRolls[userId];
            const p2Roll = game.roundRolls[otherPlayer];
            const p1Sum = p1Roll[0] + p1Roll[1];
            const p2Sum = p2Roll[0] + p2Roll[1];

            let roundWinner = null;
            if (p1Sum > p2Sum) {
                game.scores[userId]++;
                roundWinner = userId;
            } else if (p2Sum > p1Sum) {
                game.scores[otherPlayer]++;
                roundWinner = otherPlayer;
            } else {
                roundWinner = 'tie';
            }

            game.roundState = 'scored';
            
            // Check Match Win (First to 3)
            if (game.scores[userId] >= 3) {
                game.status = 'completed';
                game.winner = userId;
            } else if (game.scores[otherPlayer] >= 3) {
                game.status = 'completed';
                game.winner = otherPlayer;
            } else {
                // Next Round Prep
                setTimeout(() => {
                    game.currentRound++;
                    game.roundRolls = { [userId]: null, [otherPlayer]: null };
                    game.roundState = 'waiting';
                    // Loser or alternating starts next? Let's alternate based on round
                    game.turn = game.players[(game.currentRound - 1) % 2];
                    io.to(game.roomId).emit('game_update', game);
                }, 3000); // 3s delay to show results
            }
        } else {
            // Wait for opponent
            game.turn = otherPlayer;
        }
        
        return game;
    }
    return null;
};

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join_game', ({ stake, userProfile, privateRoomId, gameType = 'Dice' }) => {
    if (!userProfile || !userProfile.id) return;
    const userId = userProfile.id;
    const numericStake = parseInt(stake);

    // Reconnection check
    const session = userSessions[userId];
    if (session && session.roomId && activeGames[session.roomId]) {
        const game = activeGames[session.roomId];
        socket.join(session.roomId);
        socket.emit('match_found', game);
        return;
    }

    // --- MATCHMAKING ---
    const queueKey = `${gameType}_${numericStake}`;

    if (privateRoomId) {
        // Private Match Logic
        const roomId = privateRoomId;
        if (privateMatches[roomId]) {
             // Join existing private
             const match = privateMatches[roomId];
             const opponent = match.players[0];
             delete privateMatches[roomId];

             const roomIdReal = `private_${roomId}`; // internal room id
             const gameState = createInitialState(gameType, [opponent.userId, userId], numericStake);
             gameState.roomId = roomIdReal;
             
             activeGames[roomIdReal] = gameState;
             userSessions[opponent.userId] = { socketId: opponent.socketId, roomId: roomIdReal };
             userSessions[userId] = { socketId: socket.id, roomId: roomIdReal };

             socket.join(roomIdReal);
             const oppSocket = io.sockets.sockets.get(opponent.socketId);
             if (oppSocket) oppSocket.join(roomIdReal);

             io.to(roomIdReal).emit('match_found', gameState);

        } else {
             // Create private
             privateMatches[roomId] = { stake: numericStake, gameType, players: [{ userId, socketId: socket.id }] };
             userSessions[userId] = { socketId: socket.id, roomId: null };
             socket.emit('waiting_for_opponent');
        }
        return;
    }

    // Public Match
    if (waitingQueues[queueKey]) {
        const opponent = waitingQueues[queueKey];
        if (opponent.userId === userId) return; // Prevent self-match

        delete waitingQueues[queueKey];
        const roomId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        const gameState = createInitialState(gameType, [opponent.userId, userId], numericStake);
        gameState.roomId = roomId;

        activeGames[roomId] = gameState;
        userSessions[opponent.userId] = { socketId: opponent.socketId, roomId };
        userSessions[userId] = { socketId: socket.id, roomId };

        socket.join(roomId);
        const oppSocket = io.sockets.sockets.get(opponent.socketId);
        if (oppSocket) oppSocket.join(roomId);

        io.to(roomId).emit('match_found', gameState);
    } else {
        waitingQueues[queueKey] = { userId, socketId: socket.id };
        userSessions[userId] = { socketId: socket.id, roomId: null };
        socket.emit('waiting_for_opponent');
    }
  });

  socket.on('game_action', ({ action, roomId }) => {
      const game = activeGames[roomId];
      if (!game) return;
      
      // Identify user from socket
      const userId = Object.keys(userSessions).find(uid => userSessions[uid].socketId === socket.id);
      if (!userId) return;

      let updatedGame = null;

      if (game.gameType === 'Dice') {
          updatedGame = handleDiceAction(game, action, userId);
      } else {
          // Generic relay for other games (Client-side logic trust for MVP)
          io.to(roomId).emit('game_event', { action, userId });
          return;
      }

      if (updatedGame) {
          io.to(roomId).emit('game_update', updatedGame);
          if (updatedGame.status === 'completed') {
              io.to(roomId).emit('game_over', { winner: updatedGame.winner });
              delete activeGames[roomId];
          }
      }
  });

  socket.on('disconnect', () => {
      // Cleanup queues
      for (const key in waitingQueues) {
          if (waitingQueues[key].socketId === socket.id) delete waitingQueues[key];
      }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vantage Referee listening on port ${PORT}`);
});
