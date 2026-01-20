
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
const TURN_DURATION_MS = 60000; 

// --- STATE ---
const activeGames = {}; 
const waitingQueues = {}; // Key format: "GameType_Stake"
const userSessions = {}; 

// --- UTILS ---
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const createDeck = () => {
    const suits = ['H', 'D', 'C', 'S'];
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const deck = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push({ id: `${suit}${rank}`, suit, rank });
        });
    });
    return shuffle(deck);
};

// --- GAME LOGIC HELPERS ---
const createInitialState = (gameType, players, stake, profiles) => {
    const base = {
        roomId: `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        players, // [uid1, uid2]
        profiles, // { uid1: profile, uid2: profile }
        turn: players[0],
        stake,
        gameType,
        status: 'active',
        lastActionAt: Date.now(),
        scores: { [players[0]]: 0, [players[1]]: 0 },
        winner: null,
        chat: [] 
    };

    if (gameType === 'Dice') {
        return { ...base, currentRound: 1, roundState: 'waiting', roundRolls: { [players[0]]: null, [players[1]]: null } };
    }
    if (gameType === 'TicTacToe') {
        return { ...base, board: Array(9).fill(null) };
    }
    if (gameType === 'Checkers') {
        const pieces = [];
        let idCounter = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 === 1) { 
                    if (r < 3) pieces.push({ id: `p2-${idCounter++}`, owner: players[1], isKing: false, r, c });
                    else if (r > 4) pieces.push({ id: `p1-${idCounter++}`, owner: players[0], isKing: false, r, c });
                }
            }
        }
        return { ...base, pieces };
    }
    if (gameType === 'Chess') {
        return { ...base, board: null }; // Client state relay
    }
    if (gameType === 'Ludo') {
        const pieces = [];
        // 4 pieces for P1 (Red), 4 for P2 (Yellow)
        [players[0], players[1]].forEach((uid, idx) => {
            const color = idx === 0 ? 'Red' : 'Yellow';
            for (let i = 0; i < 4; i++) {
                pieces.push({ id: idx * 4 + i, color, owner: uid, step: -1 });
            }
        });
        return { ...base, pieces, diceValue: null, diceRolled: false, consecutiveSixes: 0 };
    }
    if (gameType === 'Cards') {
        const deck = createDeck();
        const hands = {
            [players[0]]: deck.splice(0, 5),
            [players[1]]: deck.splice(0, 5)
        };
        const discardPile = [deck.shift()];
        const activeSuit = discardPile[0].suit;
        return { ...base, deck, hands, discardPile, activeSuit };
    }

    return base;
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

// --- CLEANUP JOB ---
setInterval(() => {
    const now = Date.now();
    for (const roomId in activeGames) {
        // Remove games inactive for 1 hour
        if (now - activeGames[roomId].lastActionAt > 3600000) {
            delete activeGames[roomId];
            console.log(`Cleaned up inactive room: ${roomId}`);
        }
    }
}, 60000 * 5); // Run every 5 mins

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Matchmaking
  socket.on('join_game', ({ stake, userProfile, privateRoomId, gameType = 'Dice' }) => {
    if (!userProfile || !userProfile.id) return;
    const userId = userProfile.id;
    const numericStake = parseInt(stake);
    const queueKey = `${gameType}_${numericStake}`;

    if (waitingQueues[queueKey]) {
        const opponent = waitingQueues[queueKey];
        if (opponent.userId === userId) {
             waitingQueues[queueKey] = { userId, socketId: socket.id, profile: userProfile };
             return;
        }
        delete waitingQueues[queueKey];

        const profiles = { [opponent.userId]: opponent.profile, [userId]: userProfile };
        const gameState = createInitialState(gameType, [opponent.userId, userId], numericStake, profiles);
        
        activeGames[gameState.roomId] = gameState;
        userSessions[opponent.userId] = { socketId: opponent.socketId, roomId: gameState.roomId };
        userSessions[userId] = { socketId: socket.id, roomId: gameState.roomId };

        socket.join(gameState.roomId);
        const oppSocket = io.sockets.sockets.get(opponent.socketId);
        if (oppSocket) oppSocket.join(gameState.roomId);

        io.to(gameState.roomId).emit('match_found', gameState);
    } else {
        waitingQueues[queueKey] = { userId, socketId: socket.id, profile: userProfile };
        userSessions[userId] = { socketId: socket.id, roomId: null };
        socket.emit('waiting_for_opponent');
    }
  });

  // Game Actions
  socket.on('game_action', ({ action, roomId }) => {
      const game = activeGames[roomId];
      if (!game) return;

      const userId = Object.keys(userSessions).find(uid => userSessions[uid].socketId === socket.id);
      game.lastActionAt = Date.now();

      // --- CHAT ---
      if (action.type === 'CHAT') {
          if (!game.chat) game.chat = [];
          game.chat.push({
              id: Date.now().toString(),
              senderId: userId,
              message: action.message,
              timestamp: Date.now()
          });
      }

      // --- DICE ---
      else if (game.gameType === 'Dice' && action.type === 'ROLL') {
          if (game.turn !== userId) return;
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
                  game.turn = game.players[(game.currentRound - 1) % 2]; // Alternate starter
              }
          } else {
              game.turn = game.players.find(p => p !== userId);
          }
      }

      // --- TIC TAC TOE ---
      else if (game.gameType === 'TicTacToe' && action.type === 'MOVE') {
          if (game.turn !== userId) return;
          const index = action.index;
          if (game.board[index] === null) {
              const symbol = game.players[0] === userId ? 'X' : 'O';
              game.board[index] = symbol;

              const winSymbol = checkTicTacToeWin(game.board);
              if (winSymbol) {
                  game.winner = userId;
                  game.status = 'completed';
              } else if (!game.board.includes(null)) {
                  game.status = 'draw'; 
                  game.board = Array(9).fill(null);
              } else {
                  game.turn = game.players.find(p => p !== userId);
              }
          }
      }

      // --- CHECKERS & CHESS (STATE RELAY) ---
      else if ((game.gameType === 'Checkers' || game.gameType === 'Chess') && action.type === 'MOVE') {
          if (game.turn !== userId) return;
          if (action.newState) {
              if (action.newState.pieces) game.pieces = action.newState.pieces;
              if (action.newState.board) game.board = action.newState.board;
              game.turn = action.newState.turn;
              if (action.newState.winner) {
                  game.winner = action.newState.winner;
                  game.status = 'completed';
              }
          }
      }

      // --- LUDO ---
      else if (game.gameType === 'Ludo') {
          if (action.type === 'ROLL') {
              if (game.turn !== userId) return;
              game.diceValue = Math.ceil(Math.random() * 6);
              game.diceRolled = true;
              if (game.diceValue === 6) game.consecutiveSixes++;
              else game.consecutiveSixes = 0;
              
              if (game.consecutiveSixes >= 3) {
                  game.turn = game.players.find(p => p !== userId);
                  game.diceRolled = false;
                  game.consecutiveSixes = 0;
              }
          } else if (action.type === 'MOVE_PIECE') {
              game.pieces = action.pieces;
              const myPieces = game.pieces.filter(p => p.owner === userId);
              if (myPieces.every(p => p.step === 56)) {
                  game.winner = userId;
                  game.status = 'completed';
              } else {
                  if (!action.bonusTurn) {
                      game.turn = game.players.find(p => p !== userId);
                  }
                  game.diceRolled = false;
              }
          }
      }

      // --- CARDS ---
      else if (game.gameType === 'Cards') {
          if (game.turn !== userId) return;
          
          if (action.type === 'PLAY') {
              const card = action.card;
              const hand = game.hands[userId];
              
              // Validate Card presence
              if (hand.some(c => c.id === card.id)) {
                  game.hands[userId] = hand.filter(c => c.id !== card.id);
                  game.discardPile.push(card);
                  // Allow Jack to change suit
                  game.activeSuit = (card.rank === 'J' && action.suit) ? action.suit : card.suit;

                  if (game.hands[userId].length === 0) {
                      game.winner = userId;
                      game.status = 'completed';
                  } else {
                      game.turn = game.players.find(p => p !== userId);
                  }
              }
          } else if (action.type === 'DRAW') {
              const drawn = [];
              if (game.deck.length === 0) {
                  const top = game.discardPile.pop();
                  game.deck = shuffle(game.discardPile);
                  game.discardPile = [top];
              }
              if (game.deck.length > 0) drawn.push(game.deck.pop());
              
              game.hands[userId] = [...game.hands[userId], ...drawn];
              if (action.passTurn) {
                  game.turn = game.players.find(p => p !== userId);
              }
          }
      }

      // Broadcast Update
      io.to(roomId).emit('game_update', game);
      if (game.winner) io.to(roomId).emit('game_over', { winner: game.winner });
  });

  socket.on('disconnect', () => {
      // Remove from queues if waiting
      for (const key in waitingQueues) {
          if (waitingQueues[key].socketId === socket.id) delete waitingQueues[key];
      }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vantage Referee listening on port ${PORT}`);
});
