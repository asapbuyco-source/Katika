
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Vantage Referee is Live');
});

const httpServer = createServer(app);

// CRITICAL: CORS Configuration for Netlify & Localhost
const io = new Server(httpServer, {
  cors: {
    origin: [
        process.env.FRONTEND_URL || "https://heroic-brioche-b08cf2.netlify.app",
        "http://localhost:5173", 
        "http://localhost:3000",
        "http://127.0.0.1:5173"
    ],
    methods: ["GET", "POST"]
  }
});

// 1. Use Railway Port or default 8080
const PORT = process.env.PORT || 8080;
const TURN_DURATION_MS = 20000; 

// --- STATE ---
const activeGames = {}; 
const waitingQueues = {}; // Key format: "GameType_Stake"
const userSessions = {}; 

// --- HELPERS ---
const createInitialState = (gameType, players, stake) => {
    return {
        roomId: `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        players, 
        turn: players[0],
        stake,
        gameType,
        status: 'active',
        turnExpiresAt: Date.now() + TURN_DURATION_MS,
        scores: { [players[0]]: 0, [players[1]]: 0 },
        currentRound: 1,
        roundState: 'waiting',
        roundRolls: { [players[0]]: null, [players[1]]: null },
        board: Array(9).fill(null), // For TicTacToe
        winner: null
    };
};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // 3. Matchmaking Handler
  socket.on('join_game', ({ stake, userProfile, gameType = 'Dice' }) => {
    if (!userProfile || !userProfile.id) return;
    const userId = userProfile.id;
    const numericStake = parseInt(stake);
    
    // Create a specific queue key for this Game Type + Stake amount
    const queueKey = `${gameType}_${numericStake}`;

    console.log(`User ${userId} joining queue: ${queueKey}`);

    // Check if someone is waiting in this specific queue
    if (waitingQueues[queueKey]) {
        const opponent = waitingQueues[queueKey];

        // Prevent playing against self (unless testing locally with different sockets but same user ID - simple check)
        if (opponent.userId === userId) {
             // In local dev, sometimes we want to play self, but usually this is a bug.
             // For now, allow overwrite if same user re-joins
             waitingQueues[queueKey] = { userId, socketId: socket.id };
             return;
        }

        // Remove opponent from queue
        delete waitingQueues[queueKey];

        // Create Match
        const gameState = createInitialState(gameType, [opponent.userId, userId], numericStake);
        
        // Save Game
        activeGames[gameState.roomId] = gameState;
        userSessions[opponent.userId] = { socketId: opponent.socketId, roomId: gameState.roomId };
        userSessions[userId] = { socketId: socket.id, roomId: gameState.roomId };

        // Join Rooms
        socket.join(gameState.roomId);
        const oppSocket = io.sockets.sockets.get(opponent.socketId);
        if (oppSocket) oppSocket.join(gameState.roomId);

        // Notify Players
        io.to(gameState.roomId).emit('match_found', gameState);
        console.log(`Match created: ${gameState.roomId}`);

    } else {
        // No opponent found, add to queue
        waitingQueues[queueKey] = { userId, socketId: socket.id };
        userSessions[userId] = { socketId: socket.id, roomId: null };
        socket.emit('waiting_for_opponent');
        console.log(`User ${userId} added to queue`);
    }
  });

  // Handle Game Moves (Rolls, Board moves)
  socket.on('game_action', ({ action, roomId }) => {
      const game = activeGames[roomId];
      if (!game) return;

      // Simple Dice Logic
      if (game.gameType === 'Dice' && action.type === 'ROLL') {
          // Identify roller
          const userId = Object.keys(userSessions).find(uid => userSessions[uid].socketId === socket.id);
          if (game.turn !== userId) return;

          const d1 = Math.ceil(Math.random() * 6);
          const d2 = Math.ceil(Math.random() * 6);
          game.roundRolls[userId] = [d1, d2];

          // Check if both rolled
          const p1 = game.players[0];
          const p2 = game.players[1];

          if (game.roundRolls[p1] && game.roundRolls[p2]) {
              // Scoring
              const sum1 = game.roundRolls[p1][0] + game.roundRolls[p1][1];
              const sum2 = game.roundRolls[p2][0] + game.roundRolls[p2][1];
              
              if (sum1 > sum2) game.scores[p1]++;
              else if (sum2 > sum1) game.scores[p2]++;

              game.roundState = 'scored';
              
              // Win Condition
              if (game.scores[p1] >= 3) { game.status = 'completed'; game.winner = p1; }
              else if (game.scores[p2] >= 3) { game.status = 'completed'; game.winner = p2; }
              else {
                  // Next Round Reset (simulated delay handled by client or manual trigger)
                  game.currentRound++;
                  game.roundRolls = { [p1]: null, [p2]: null };
                  game.roundState = 'waiting';
                  game.turn = game.players[(game.currentRound - 1) % 2];
              }
          } else {
              // Switch turn to other player
              game.turn = game.players.find(p => p !== userId);
          }
          
          io.to(roomId).emit('game_update', game);
          if (game.winner) io.to(roomId).emit('game_over', { winner: game.winner });
      }
  });

  socket.on('disconnect', () => {
      // Remove from queues
      for (const key in waitingQueues) {
          if (waitingQueues[key].socketId === socket.id) delete waitingQueues[key];
      }
      console.log('Client disconnected');
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vantage Referee listening on port ${PORT}`);
});
