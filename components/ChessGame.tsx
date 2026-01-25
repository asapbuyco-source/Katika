
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Clock, RefreshCw, AlertTriangle, CheckCircle2, Crown } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';
import { Chess, Square } from 'chess.js';

interface ChessGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- ASSETS ---
const PIECES: Record<string, string> = {
  'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  'P': 'https://upload.wikimedia.org/wikipedia/commons/1/10/Chess_plt45.svg',
  'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
};

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  // Game State
  const [game, setGame] = useState(new Chess());
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([]);
  
  // UI State
  const [isGameOver, setIsGameOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [promotionSquare, setPromotionSquare] = useState<{from: Square, to: Square} | null>(null);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  
  // P2P / Bot Flags
  const isP2P = !!socket && !!socketGame;
  const isBotGame = !isP2P && (table.guest?.id === 'bot' || table.host?.id === 'bot');
  
  // Refs for checking stale state in callbacks
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  // --- INITIALIZATION ---
  useEffect(() => {
      // 1. Determine Color
      if (isP2P && socketGame && socketGame.players) {
          const p1 = socketGame.players[0]; // Player 1 is White
          setMyColor(user.id === p1 ? 'w' : 'b');
      } else {
          setMyColor('w'); // Local/Bot default to White
      }
  }, [isP2P, socketGame, user.id]);

  // --- SYNC WITH SERVER ---
  useEffect(() => {
      if (isP2P && socketGame && socketGame.gameState) {
          const serverFen = socketGame.gameState.fen;
          const currentFen = game.fen();

          // Only update if FEN is different (prevents infinite loops)
          if (serverFen && serverFen !== currentFen) {
              try {
                  const newGame = new Chess(serverFen);
                  setGame(newGame);
                  
                  // Check for Game Over conditions from Server State
                  if (newGame.isGameOver()) {
                      handleGameOver(newGame);
                  } else {
                      // Play sound if it's now my turn (meaning opponent moved)
                      if (newGame.turn() === myColor) playSFX('move');
                  }
              } catch (e) {
                  console.error("Failed to load server FEN:", e);
              }
          }
          
          if (socketGame.winner && !isGameOver) {
              const iWon = socketGame.winner === user.id;
              setIsGameOver(true);
              setStatusMessage(iWon ? "Opponent Resigned. You Win!" : "You Lost.");
              playSFX(iWon ? 'win' : 'loss');
              setTimeout(() => onGameEnd(iWon ? 'win' : 'loss'), 3000);
          }
      }
  }, [socketGame, isP2P, myColor, isGameOver]);

  // --- GAME LOGIC ---

  const handleGameOver = (finalGame: Chess) => {
      setIsGameOver(true);
      if (finalGame.isCheckmate()) {
          const winner = finalGame.turn() === 'w' ? 'b' : 'w';
          const iWon = winner === myColor;
          setStatusMessage(iWon ? "Checkmate! You Won!" : "Checkmate. You Lost.");
          playSFX(iWon ? 'win' : 'loss');
          if (!isP2P) setTimeout(() => onGameEnd(iWon ? 'win' : 'loss'), 2000);
      } else if (finalGame.isDraw() || finalGame.isStalemate()) {
          setStatusMessage("Draw / Stalemate");
          playSFX('error');
          if (!isP2P) setTimeout(() => onGameEnd('quit'), 2000);
      }
  };

  const makeBotMove = useCallback(() => {
      if (isGameOver || gameRef.current.turn() === myColor) return;
      
      const moves = gameRef.current.moves();
      if (moves.length > 0) {
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          const newGame = new Chess(gameRef.current.fen());
          newGame.move(randomMove);
          setGame(newGame);
          playSFX('move');
          
          if (newGame.isGameOver()) handleGameOver(newGame);
      }
  }, [myColor, isGameOver]);

  useEffect(() => {
      if (isBotGame && game.turn() !== myColor && !isGameOver) {
          const timer = setTimeout(makeBotMove, 800);
          return () => clearTimeout(timer);
      }
  }, [game, isBotGame, myColor, isGameOver, makeBotMove]);

  const onSquareClick = (square: Square) => {
      if (isGameOver) return;

      // 1. If trying to move selected piece
      if (selectedSquare) {
          // Attempt move
          try {
              // Check for promotion
              const piece = game.get(selectedSquare);
              const isPawn = piece?.type === 'p';
              const targetRank = square[1]; // '1' or '8'
              const isPromo = isPawn && ((piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1'));

              if (isPromo) {
                  // Validate if it's a legal move first
                  const moves = game.moves({ square: selectedSquare, verbose: true });
                  const valid = moves.some(m => m.to === square);
                  if (valid) {
                      setPromotionSquare({ from: selectedSquare, to: square });
                      return;
                  }
              }

              const move = {
                  from: selectedSquare,
                  to: square,
                  promotion: 'q' // Default to queen if not intercepted above
              };

              const newGame = new Chess(game.fen());
              const result = newGame.move(move); // This throws if invalid? No, returns null.

              if (result) {
                  // VALID MOVE
                  setGame(newGame);
                  setSelectedSquare(null);
                  setPossibleMoves([]);
                  playSFX(result.captured ? 'capture' : 'move');

                  // Send to Server
                  if (isP2P && socket && socketGame) {
                      socket.emit('game_action', {
                          roomId: socketGame.roomId,
                          action: {
                              type: 'MOVE',
                              fen: newGame.fen(),
                              pgn: newGame.pgn(),
                              move: result
                          }
                      });
                  }

                  if (newGame.isGameOver()) handleGameOver(newGame);
                  return;
              }
          } catch (e) {
              // Invalid move, ignore or deselect
          }
      }

      // 2. Select a piece
      const piece = game.get(square);
      if (piece) {
          // Strict Turn Check for P2P
          if (piece.color !== myColor) {
              // If we clicked opponent piece, just clear selection (or maybe show their moves? No, strict.)
              setSelectedSquare(null);
              setPossibleMoves([]);
              return;
          }
          
          if (isP2P && game.turn() !== myColor) {
              // Not my turn
              return;
          }

          setSelectedSquare(square);
          const moves = game.moves({ square, verbose: true });
          setPossibleMoves(moves.map(m => m.to as Square));
          playSFX('click');
      } else {
          setSelectedSquare(null);
          setPossibleMoves([]);
      }
  };

  const handlePromotionSelect = (pieceType: string) => {
      if (!promotionSquare) return;
      
      const newGame = new Chess(game.fen());
      const result = newGame.move({
          from: promotionSquare.from,
          to: promotionSquare.to,
          promotion: pieceType
      });

      if (result) {
          setGame(newGame);
          setPromotionSquare(null);
          setSelectedSquare(null);
          setPossibleMoves([]);
          playSFX('king');

          if (isP2P && socket && socketGame) {
              socket.emit('game_action', {
                  roomId: socketGame.roomId,
                  action: {
                      type: 'MOVE',
                      fen: newGame.fen(),
                      pgn: newGame.pgn(),
                      move: result
                  }
              });
          }
      }
  };

  // --- RENDER HELPERS ---
  
  // Board Rendering Loop
  // If myColor is White: Rows 0..7 (mapped to 8..1), Cols 0..7 (a..h)
  // If myColor is Black: Rows 7..0 (mapped to 1..8), Cols 7..0 (h..a)
  const boardRows = [];
  for (let r = 0; r < 8; r++) {
      const rowSquares = [];
      for (let c = 0; c < 8; c++) {
          // Orientation Logic
          const actualRow = myColor === 'w' ? r : 7 - r;
          const actualCol = myColor === 'w' ? c : 7 - c;
          
          // Chess.js uses algebraic 'a1', 'h8'.
          // Row index 0 in UI = Rank 8 in Chess (usually).
          // Let's map strict indices:
          // White Top (Index 0) -> Rank 8. White Bottom (Index 7) -> Rank 1.
          const rankIndex = 7 - actualRow; // 0->7 (8), 7->0 (1)
          const fileIndex = actualCol;     // 0->a, 7->h
          
          const square = String.fromCharCode(97 + fileIndex) + (rankIndex + 1) as Square;
          
          // Color Check
          // (0,0) is a8 (Light). (0,1) is b8 (Dark).
          // Logic: (row + col) % 2 === 0 ? Light : Dark
          // Wait, a8 is white? Standard is a8=white.
          // r=0, c=0 -> 0%2=0 -> Light. Correct.
          const isLight = (actualRow + actualCol) % 2 === 0;
          
          const piece = game.get(square);
          const isSelected = selectedSquare === square;
          const isPossible = possibleMoves.includes(square);
          const isLastMove = false; // Could impl from socketGame.lastMove

          rowSquares.push(
              <div 
                  key={square}
                  onClick={() => onSquareClick(square)}
                  className={`
                      w-full h-full flex items-center justify-center relative
                      ${isLight ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'}
                      ${isSelected ? 'bg-[rgba(255,255,0,0.5)]' : ''}
                  `}
              >
                  {/* Coordinates Markers */}
                  {actualCol === 0 && <span className={`absolute top-0.5 left-0.5 text-[10px] font-bold ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}`}>{rankIndex + 1}</span>}
                  {actualRow === 7 && <span className={`absolute bottom-0 right-1 text-[10px] font-bold ${isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]'}`}>{String.fromCharCode(97 + fileIndex)}</span>}

                  {/* Move Hint */}
                  {isPossible && (
                      <div className={`absolute w-3 h-3 rounded-full ${piece ? 'bg-red-500/50 ring-4 ring-red-500/30' : 'bg-black/10'}`} />
                  )}

                  {/* Piece */}
                  {piece && (
                      <motion.img 
                          layoutId={square} // Smooth transition if same key logic used (hard with dynamic keys, so simple scale in)
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          src={PIECES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]} 
                          className="w-[90%] h-[90%] z-10 cursor-pointer drop-shadow-md select-none"
                      />
                  )}
              </div>
          );
      }
      boardRows.push(<div key={r} className="flex flex-1">{rowSquares}</div>);
  }

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        
        {/* Promotion Modal */}
        <AnimatePresence>
            {promotionSquare && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-xl p-4 flex gap-4 shadow-2xl">
                        {['q', 'r', 'b', 'n'].map(p => (
                            <button key={p} onClick={() => handlePromotionSelect(p)} className="p-2 hover:bg-slate-100 rounded-lg">
                                <img src={PIECES[myColor === 'w' ? p.toUpperCase() : p]} className="w-16 h-16" />
                            </button>
                        ))}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Header */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-6 mt-2">
            <button onClick={() => onGameEnd('quit')} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
            </button>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

       {/* Turn Status */}
       <div className="mb-6">
            {isGameOver ? (
                <div className="px-6 py-2 bg-red-500 text-white font-bold rounded-full animate-pulse">{statusMessage}</div>
            ) : (
                <div className={`px-8 py-2 rounded-full font-black text-sm uppercase tracking-widest shadow-lg border ${
                    game.turn() === myColor 
                    ? 'bg-gold-500 text-royal-950 border-gold-400 shadow-gold-500/20' 
                    : 'bg-royal-800 text-slate-500 border-white/10'
                }`}>
                    {game.turn() === myColor ? "Your Move" : "Opponent Thinking"}
                </div>
            )}
       </div>

        {/* The Board */}
        <div className="w-full max-w-[500px] aspect-square bg-[#3d2b1f] p-1 rounded-sm shadow-2xl">
            <div className="w-full h-full flex flex-col border-2 border-[#b58863]">
                {boardRows}
            </div>
        </div>

        {/* Player Info */}
        <div className="w-full max-w-[500px] flex justify-between items-center mt-6">
            <div className="flex items-center gap-3">
                <img src={user.avatar} className="w-10 h-10 rounded-full border-2 border-gold-500" />
                <div className="text-sm">
                    <div className="font-bold text-white">You</div>
                    <div className="text-xs text-slate-400">{myColor === 'w' ? 'White' : 'Black'}</div>
                </div>
            </div>
            {isP2P && (
                <div className="flex items-center gap-3 text-right">
                    <div className="text-sm">
                        <div className="font-bold text-slate-300">{table.host?.id === user.id ? table.guest?.name : table.host?.name || "Opponent"}</div>
                        <div className="text-xs text-slate-500">{myColor === 'w' ? 'Black' : 'White'}</div>
                    </div>
                    <img src={table.host?.id === user.id ? table.guest?.avatar : table.host?.avatar || "https://i.pravatar.cc/150"} className="w-10 h-10 rounded-full border-2 border-slate-600" />
                </div>
            )}
        </div>

        {isP2P && socketGame && (
            <GameChat 
                messages={socketGame.chat || []}
                onSendMessage={(msg) => socket?.emit('game_action', { roomId: socketGame.roomId, action: { type: 'CHAT', message: msg } })}
                currentUserId={user.id}
                profiles={socketGame.profiles || {}}
            />
        )}
    </div>
  );
};
