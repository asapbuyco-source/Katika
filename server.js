
      // --- CHECKERS & CHESS (STATE RELAY) ---
      else if ((game.gameType === 'Checkers' || game.gameType === 'Chess') && action.type === 'MOVE') {
          if (game.turn !== userId) return;
          if (action.newState) {
              if (action.newState.pieces) game.pieces = action.newState.pieces;
              if (action.newState.board) game.board = action.newState.board;
              if (action.newState.fen) game.fen = action.newState.fen; // Added FEN support
              if (action.newState.pgn) game.pgn = action.newState.pgn; // Added PGN support for history
              // Sync timers if provided
              if (action.newState.timers) game.timers = action.newState.timers;
              
              game.turn = action.newState.turn;
              if (action.newState.winner) {
                  game.winner = action.newState.winner;
                  game.status = 'completed';
              }
          }
      }
