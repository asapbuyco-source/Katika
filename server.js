import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// Root route for health check
app.get('/', (req, res) => {
  res.send('Vantage Referee is Awake');
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
// We map games by Room ID, and track user sessions to handle reconnections.
const activeGames = {}; // roomId -> GameState
const waitingQueues = {}; // stake -> { userId, socketId }
const userSessions = {}; // userId -> { socketId, roomId, timerId }

// Helper: Switch Turn
const switchTurn = (roomId) => {
    const game = activeGames[roomId];
    if (!game) return;

    // Clear existing timer
    if (game.timerId) clearTimeout(game.timerId);

    // Determine Next Player
    const currentIndex = game.players.indexOf(game.turn);
    const nextIndex = (currentIndex + 1) % game.players.length;
    game.turn = game.players[nextIndex];
    
    // Reset State
    game.diceValue = null;
    game.turnExpiresAt = Date.now() + TURN_DURATION_MS;

    // Set Timeout
    game.timerId = setTimeout(() => {
        io.to(roomId).emit('turn_timeout', { message: "Time Expired! Turn Skipped." });
        switchTurn(roomId);
    }, TURN_DURATION_MS);

    io.to(roomId).emit('game_update', game);
};

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. MATCHMAKING & RECONNECTION
  socket.on('join_game', ({ stake, userProfile }) => {
    if (!userProfile || !userProfile.id) return;
    const userId = userProfile.id;
    const numericStake = parseInt(stake);

    console.log(`User ${userId} attempting to join/reconnect`);

    // A. CHECK FOR EXISTING ACTIVE GAME (Reconnection)
    const existingSession = userSessions[userId];
    if (existingSession && existingSession.roomId && activeGames[existingSession.roomId]) {
        const roomId = existingSession.roomId;
        const game = activeGames[roomId];
        
        // Update Socket ID map
        userSessions[userId].socketId = socket.id;
        socket.join(roomId);
        
        console.log(`User ${userId} reconnected to ${roomId}`);
        socket.emit('match_found', game); // Send current state immediately
        return;
    }

    // B. NEW MATCHMAKING
    const waitingPlayer = waitingQueues[numericStake];

    if (waitingPlayer && waitingPlayer.userId !== userId) {
      // Match Found!
      const opponentId = waitingPlayer.userId;
      const opponentSocketId = waitingPlayer.socketId;
      const roomId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Clear queue
      delete waitingQueues[numericStake];

      // Init State
      const gameState = {
        roomId,
        players: [opponentId, userId],
        turn: opponentId, // Opponent starts
        stake: numericStake,
        positions: {
            [opponentId]: 0,
            [userId]: 0
        },
        diceValue: null,
        status: 'active',
        turnExpiresAt: Date.now() + TURN_DURATION_MS,
        timerId: null
      };

      activeGames[roomId] = gameState;

      // Register Sessions
      userSessions[opponentId] = { socketId: opponentSocketId, roomId };
      userSessions[userId] = { socketId: socket.id, roomId };

      // Join Rooms
      socket.join(roomId);
      const oppSocket = io.sockets.sockets.get(opponentSocketId);
      if (oppSocket) oppSocket.join(roomId);

      // Start Timer
      gameState.timerId = setTimeout(() => switchTurn(roomId), TURN_DURATION_MS);

      // Broadcast
      io.to(roomId).emit('match_found', gameState);
      console.log(`Match started: ${roomId}`);

    } else {
      // Add to Queue
      waitingQueues[numericStake] = { userId, socketId: socket.id };
      // Also register session (no room yet)
      userSessions[userId] = { socketId: socket.id, roomId: null };
      
      socket.emit('waiting_for_opponent');
      console.log(`User ${userId} queued for ${numericStake}`);
    }
  });

  // 2. GAME ACTIONS
  // Helper to find game by socket
  const getGameFromSocket = () => {
      // This is O(N) but safe for prototype. 
      // Better: pass userId from client or map socket.id -> userId -> gameId
      const entry = Object.entries(userSessions).find(([uid, sess]) => sess.socketId === socket.id);
      if (!entry) return null;
      const [userId, session] = entry;
      if (!session.roomId) return null;
      return { game: activeGames[session.roomId], userId };
  };

  socket.on('roll_dice', () => {
    const data = getGameFromSocket();
    if (!data) return;
    const { game, userId } = data;

    if (game.turn === userId && !game.diceValue) {
        const roll = Math.floor(Math.random() * 6) + 1;
        game.diceValue = roll;
        io.to(game.roomId).emit('dice_rolled', { value: roll });
        io.to(game.roomId).emit('game_update', game);
    }
  });

  socket.on('move_piece', () => {
    const data = getGameFromSocket();
    if (!data) return;
    const { game, userId } = data;

    if (game.turn === userId && game.diceValue) {
        // Move
        game.positions[userId] += game.diceValue;
        
        // Win Condition
        if (game.positions[userId] >= 15) {
            game.status = 'completed';
            if (game.timerId) clearTimeout(game.timerId);
            io.to(game.roomId).emit('game_over', { winner: userId });
            
            // Cleanup
            delete activeGames[game.roomId];
            game.players.forEach(pid => {
                if (userSessions[pid]) userSessions[pid].roomId = null;
            });
        } else {
            // Bonus Turn or Switch
            if (game.diceValue === 6) {
                game.diceValue = null;
                // Reset timer for bonus
                game.turnExpiresAt = Date.now() + TURN_DURATION_MS;
                if (game.timerId) clearTimeout(game.timerId);
                game.timerId = setTimeout(() => switchTurn(game.roomId), TURN_DURATION_MS);
                io.to(game.roomId).emit('game_update', game);
            } else {
                switchTurn(game.roomId);
            }
        }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    // We do NOT delete the game session immediately to allow reconnect.
    // Cleanup for waiting queue only
    for (const [stake, waiter] of Object.entries(waitingQueues)) {
        if (waiter.socketId === socket.id) {
            delete waitingQueues[stake];
        }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vantage Referee listening on port ${PORT}`);
});