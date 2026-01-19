
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

// CRITICAL: CORS Configuration
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;
const TURN_DURATION_MS = 20000; 

// --- STATE ---
const activeGames = {}; 
const waitingQueues = {}; // Key format: "GameType_Stake"
const userSessions = {}; 

// --- HELPERS ---
const createInitialState = (gameType, players, stake, profiles) => {
    return {
        roomId: `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        players, // [uid1, uid2]
        profiles, // { uid1: profile, uid2: profile }
        turn: players[0],
        stake,
        gameType,
        status: 'active',
        turnExpiresAt: Date.now() + TURN_DURATION_MS,
        scores: { [players[0]]: 0, [players[1]]: 0 },
        
        // Dice Specific
        currentRound: 1,
        roundState: 'waiting',
        roundRolls: { [players[0]]: null, [players[1]]: null },
        
        // TicTacToe Specific
        board: Array(9).fill(null),
        
        winner: null
    };
};

const checkTicTacToeWin = (board) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], 
      [0, 3, 6], [1, 4, 7], [2, 5, 8], 
      [0, 4, 8], [2, 4, 6]             
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Matchmaking Handler
  socket.on('join_game', ({ stake, userProfile, gameType = 'Dice' }) => {
    if (!userProfile || !userProfile.id) return;
    const userId = userProfile.id;
    const numericStake = parseInt(stake);
    const queueKey = `${gameType}_${numericStake}`;

    console.log(`User ${userId} joining queue: ${queueKey}`);

    if (waitingQueues[queueKey]) {
        const opponent = waitingQueues[queueKey];

        // Prevent self-play (optional check)
        if (opponent.userId === userId) {
             waitingQueues[queueKey] = { userId, socketId: socket.id, profile: userProfile };
             return;
        }

        delete waitingQueues[queueKey];

        const profiles = {
            [opponent.userId]: opponent.profile,
            [userId]: userProfile
        };

        // Create Match
        const gameState = createInitialState(gameType, [opponent.userId, userId], numericStake, profiles);
        
        activeGames[gameState.roomId] = gameState;
        userSessions[opponent.userId] = { socketId: opponent.socketId, roomId: gameState.roomId };
        userSessions[userId] = { socketId: socket.id, roomId: gameState.roomId };

        socket.join(gameState.roomId);
        const oppSocket = io.sockets.sockets.get(opponent.socketId);
        if (oppSocket) oppSocket.join(gameState.roomId);

        io.to(gameState.roomId).emit('match_found', gameState);
        console.log(`Match created: ${gameState.roomId}`);

    } else {
        waitingQueues[queueKey] = { userId, socketId: socket.id, profile: userProfile };
        userSessions[userId] = { socketId: socket.id, roomId: null };
        socket.emit('waiting_for_opponent');
    }
  });

  // Handle Game Moves
  socket.on('game_action', ({ action, roomId }) => {
      const game = activeGames[roomId];
      if (!game) return;

      const userId = Object.keys(userSessions).find(uid => userSessions[uid].socketId === socket.id);
      if (game.turn !== userId) return; // Not your turn

      // --- DICE LOGIC ---
      if (game.gameType === 'Dice' && action.type === 'ROLL') {
          const d1 = Math.ceil(Math.random() * 6);
          const d2 = Math.ceil(Math.random() * 6);
          game.roundRolls[userId] = [d1, d2];

          const p1 = game.players[0];
          const p2 = game.players[1];

          if (game.roundRolls[p1] && game.roundRolls[p2]) {
              const sum1 = game.roundRolls[p1][0] + game.roundRolls[p1][1];
              const sum2 = game.roundRolls[p2][0] + game.roundRolls[p2][1];
              
              if (sum1 > sum2) game.scores[p1]++;
              else if (sum2 > sum1) game.scores[p2]++;

              game.roundState = 'scored';
              
              if (game.scores[p1] >= 3) { game.status = 'completed'; game.winner = p1; }
              else if (game.scores[p2] >= 3) { game.status = 'completed'; game.winner = p2; }
              else {
                  game.currentRound++;
                  game.roundRolls = { [p1]: null, [p2]: null };
                  game.roundState = 'waiting';
                  game.turn = game.players[(game.currentRound - 1) % 2];
              }
          } else {
              game.turn = game.players.find(p => p !== userId);
          }
          
          io.to(roomId).emit('game_update', game);
          if (game.winner) io.to(roomId).emit('game_over', { winner: game.winner });
      }

      // --- TIC TAC TOE LOGIC ---
      if (game.gameType === 'TicTacToe' && action.type === 'MOVE') {
          const index = action.index;
          if (game.board[index] === null) {
              // Assign Symbol (P1 = X, P2 = O)
              const symbol = game.players[0] === userId ? 'X' : 'O';
              game.board[index] = symbol;

              // Check Win
              const winSymbol = checkTicTacToeWin(game.board);
              if (winSymbol) {
                  game.winner = userId;
                  game.status = 'completed';
              } else if (!game.board.includes(null)) {
                  // Draw
                  game.status = 'draw'; 
                  // Reset board for next round (simplified for now, usually ends game)
                  game.board = Array(9).fill(null);
              } else {
                  // Switch Turn
                  game.turn = game.players.find(p => p !== userId);
              }

              io.to(roomId).emit('game_update', game);
              if (game.winner) io.to(roomId).emit('game_over', { winner: game.winner });
          }
      }
  });

  socket.on('disconnect', () => {
      for (const key in waitingQueues) {
          if (waitingQueues[key].socketId === socket.id) delete waitingQueues[key];
      }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vantage Referee listening on port ${PORT}`);
});
