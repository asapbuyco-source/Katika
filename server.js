
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
const TURN_DURATION_MS = 60000; // Increased for complex games

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

// --- HELPERS ---
const createInitialState = (gameType, players, stake, profiles) => {
    const base = {
        roomId: `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        players, // [uid1, uid2]
        profiles, // { uid1: profile, uid2: profile }
        turn: players[0],
        stake,
        gameType,
        status: 'active',
        turnExpiresAt: Date.now() + TURN_DURATION_MS,
        scores: { [players[0]]: 0, [players[1]]: 0 },
        winner: null
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
        // Simplified board representation for relay. 
        // We'll trust client init or send standard fen/grid if we wanted full validation.
        // For this P2P relay, we let clients init default board, server just tracks moves/board state updates.
        return { ...base, board: null }; // Client handles initial layout, server relays updates.
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

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Matchmaking Handler
  socket.on('join_game', ({ stake, userProfile, privateRoomId, gameType = 'Dice' }) => {
    if (!userProfile || !userProfile.id) return;
    const userId = userProfile.id;
    
    // Private Room Logic
    if (privateRoomId) {
        console.log(`User ${userId} joining private room: ${privateRoomId}`);
        // Check if room exists/pending
        // Simplification for prototype: If activeGames has it, join. If waitingQueues has it, join. Else create wait.
        // For now, reuse the standard queue logic but keyed by ID.
    }

    const numericStake = parseInt(stake);
    const queueKey = `${gameType}_${numericStake}`; // Simple public queue

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
      
      // Basic turn validation (can be stricter)
      if (game.gameType !== 'Cards' && game.turn !== userId && action.type !== 'ROLL') {
          // Allow Cards 'J' selection or out of turn logic if needed, but mostly block
          // return; 
      }

      // --- DICE ---
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
      }

      // --- TIC TAC TOE ---
      else if (game.gameType === 'TicTacToe' && action.type === 'MOVE') {
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
          // Trust client move calculation for prototype
          // Client sends { pieces: [], turn: nextUserId }
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
              game.diceValue = Math.ceil(Math.random() * 6);
              game.diceRolled = true;
              if (game.diceValue === 6) game.consecutiveSixes++;
              else game.consecutiveSixes = 0;
              
              if (game.consecutiveSixes >= 3) {
                  // Forfeit turn
                  game.turn = game.players.find(p => p !== userId);
                  game.diceRolled = false;
                  game.consecutiveSixes = 0;
              }
          } else if (action.type === 'MOVE_PIECE') {
              // Client calculates new position and sends updated pieces
              game.pieces = action.pieces;
              
              // Check Win
              const myPieces = game.pieces.filter(p => p.owner === userId);
              if (myPieces.every(p => p.step === 56)) {
                  game.winner = userId;
                  game.status = 'completed';
              } else {
                  // Decide next turn based on rules (6 gets another turn)
                  if (!action.bonusTurn) {
                      game.turn = game.players.find(p => p !== userId);
                  }
                  game.diceRolled = false;
              }
          }
      }

      // --- CARDS ---
      else if (game.gameType === 'Cards') {
          if (action.type === 'PLAY') {
              // Move card from hand to pile
              const card = action.card;
              const hand = game.hands[userId];
              game.hands[userId] = hand.filter(c => c.id !== card.id);
              game.discardPile.push(card);
              game.activeSuit = action.suit || card.suit; // Allow override for 'J'

              // Win Check
              if (game.hands[userId].length === 0) {
                  game.winner = userId;
                  game.status = 'completed';
              } else {
                  // Next turn logic (handle skips/pick2)
                  if (action.nextTurn) game.turn = action.nextTurn;
                  else game.turn = game.players.find(p => p !== userId);
              }
          } else if (action.type === 'DRAW') {
              const count = action.count || 1;
              const drawn = [];
              for(let i=0; i<count; i++) {
                  if (game.deck.length === 0) {
                      // Reshuffle discard (keeping top)
                      const top = game.discardPile.pop();
                      game.deck = shuffle(game.discardPile);
                      game.discardPile = [top];
                  }
                  if (game.deck.length > 0) drawn.push(game.deck.pop());
              }
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
      for (const key in waitingQueues) {
          if (waitingQueues[key].socketId === socket.id) delete waitingQueues[key];
      }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vantage Referee listening on port ${PORT}`);
});
