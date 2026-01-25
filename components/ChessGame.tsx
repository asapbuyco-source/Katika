
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, BookOpen, X, Clock, AlertTriangle } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

interface ChessGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [game, setGame] = useState(new Chess());
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [isBotGame, setIsBotGame] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [endGameReason, setEndGameReason] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{from: Square, to: Square} | null>(null);
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });

  const isP2P = !!socket && !!socketGame;
  const board = game.board();

  // --- INITIALIZATION & SYNC ---
  useEffect(() => {
      // Bot Setup
      if (!isP2P && table.guest?.id === 'bot') {
          setIsBotGame(true);
          setMyColor('w');
      }

      // P2P Sync Logic - THE "BASIC" FIX
      if (isP2P && socketGame) {
          // 1. Determine Color
          if (socketGame.players && socketGame.players[0]) {
              const isPlayer1 = socketGame.players[0] === user.id;
              setMyColor(isPlayer1 ? 'w' : 'b');
          }

          // 2. Load Board State (FEN)
          // We trust the server completely. If server sends FEN, we load it.
          if (socketGame.gameState && socketGame.gameState.fen) {
              const currentFen = game.fen();
              const serverFen = socketGame.gameState.fen;
              
              // Only update if different to avoid infinite loops, but do it forcefully
              if (currentFen !== serverFen) {
                  const newGame = new Chess();
                  try {
                      newGame.load(serverFen);
                      setGame(newGame);
                      checkGameOver(newGame);
                  } catch (e) {
                      console.error("Invalid FEN from server:", serverFen);
                  }
              }
          }

          // 3. Sync Timers (Safe Access Fix)
          const timers = socketGame.gameState?.timers;
          const players = socketGame.players;
          if (timers && Array.isArray(players) && players.length >= 2) {
              setTimeRemaining({
                  w: timers[players[0]] || 600,
                  b: timers[players[1]] || 600
              });
          }

          // 4. Handle Game Over
          if (socketGame.winner && !isGameOver) {
              setIsGameOver(true);
              const isWin = socketGame.winner === user.id;
              setEndGameReason(isWin ? "Victory by Timeout" : "Defeat by Timeout");
              onGameEnd(isWin ? 'win' : 'loss');
          }
      }
  }, [socketGame, user.id, isP2P, table]);

  // Local Timer Tick
  useEffect(() => {
      if (isGameOver) return;
      const interval = setInterval(() => {
          const activeColor = game.turn(); 
          setTimeRemaining(prev => {
              if (prev[activeColor] <= 0) return prev;
              return { ...prev, [activeColor]: Math.max(0, prev[activeColor] - 1) };
          });
      }, 1000);
      return () => clearInterval(interval);
  }, [game, isGameOver]);

  const checkGameOver = (currentGame: Chess) => {
      if (currentGame.isGameOver()) {
          setIsGameOver(true);
          if (currentGame.isCheckmate()) {
              const winnerColor = currentGame.turn() === 'w' ? 'b' : 'w';
              const isWinner = winnerColor === myColor;
              setEndGameReason(isWinner ? "Checkmate! You Won!" : "Checkmate! You Lost.");
              playSFX(isWinner ? 'win' : 'loss');
              
              if (!isP2P) {
                  setTimeout(() => onGameEnd(isWinner ? 'win' : 'loss'), 2000);
              }
          } else {
              setEndGameReason("Draw / Stalemate");
              setTimeout(() => onGameEnd('quit'), 2000);
          }
      }
  };

  const getMoveOptions = (square: Square) => {
    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }
    const newSquares: any = {};
    moves.map((move: any) => {
      const targetPiece = game.get(move.to);
      newSquares[move.to] = {
        background: targetPiece && targetPiece.color !== game.get(square).color
            ? 'radial-gradient(circle, rgba(255, 0, 0, 0.5) 20%, transparent 30%)' // Red for capture
            : 'radial-gradient(circle, rgba(0, 0, 0, 0.2) 20%, transparent 30%)',   // Dot for move
      };
      return move;
    });
    newSquares[square] = { background: 'rgba(255, 215, 0, 0.4)' }; // Highlight selected
    setOptionSquares(newSquares);
    return true;
  };

  const executeMove = (from: Square, to: Square, promotion?: string) => {
      try {
          const moveAttempt = { from, to, promotion: promotion || 'q' };
          const result = game.move(moveAttempt);
          
          if (result) {
              // Optimistic UI update
              const newGame = new Chess(game.fen()); 
              setGame(newGame);
              setSelectedSquare(null);
              setOptionSquares({});
              
              if (result.captured) playSFX('capture'); else playSFX('move');
              checkGameOver(newGame);

              if (isP2P && socket && socketGame) {
                  // Simply send the move. Server calculates FEN and sends it back.
                  socket.emit('game_action', {
                      roomId: socketGame.roomId,
                      action: {
                          type: 'MOVE',
                          move: moveAttempt
                      }
                  });
              } else if (isBotGame && !newGame.isGameOver()) {
                  setTimeout(makeBotMove, 800);
              }
          }
      } catch (e) {
          console.error("Move Failed", e);
          setSelectedSquare(null);
          setOptionSquares({});
      }
  };

  const onSquareClick = (square: Square) => {
    if (isGameOver) return;

    // Deselect if clicking same square
    if (selectedSquare === square) { 
        setSelectedSquare(null); 
        setOptionSquares({}); 
        return; 
    }

    // Attempt Move if square is in options
    const moveOptions = Object.keys(optionSquares);
    if (selectedSquare && moveOptions.includes(square)) {
        const piece = game.get(selectedSquare);
        // Pawn promotion check
        if (piece && piece.type === 'p') {
            const isLastRank = (piece.color === 'w' && square[1] === '8') || (piece.color === 'b' && square[1] === '1');
            if (isLastRank) {
                setPendingPromotion({ from: selectedSquare, to: square });
                return;
            }
        }
        executeMove(selectedSquare, square);
        return;
    }

    // Select Piece
    const clickedPiece = game.get(square);
    if (clickedPiece) {
        // Can only select own pieces
        if (clickedPiece.color !== myColor) return;
        // Can only select if it's my turn (Basic rule enforcement)
        if (game.turn() !== myColor) return;

        setSelectedSquare(square);
        getMoveOptions(square);
        playSFX('click');
    } else {
        setSelectedSquare(null);
        setOptionSquares({});
    }
  };

  const handlePromotionSelect = (pieceType: string) => {
      if (!pendingPromotion) return;
      executeMove(pendingPromotion.from, pendingPromotion.to, pieceType);
      setPendingPromotion(null);
  };

  const handleQuit = () => {
      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      onGameEnd('quit');
  };

  const makeBotMove = () => {
      const moves = game.moves({ verbose: true });
      if (game.isGameOver() || moves.length === 0) return;
      
      let bestMove = moves[0];
      let bestScore = -Infinity;
      const shuffled = moves.sort(() => Math.random() - 0.5);

      for (const move of shuffled) {
          let score = 0;
          if (move.captured) score += (PIECE_VALUES[move.captured] || 0) * 10;
          if (move.promotion) score += 9;
          if (score > bestScore) { bestScore = score; bestMove = move; }
      }
      
      try {
          game.move(bestMove.san);
          setGame(new Chess(game.fen()));
          
          if (bestMove.captured) playSFX('capture'); else playSFX('move');
          checkGameOver(game);
      } catch (e) {
          console.error("Bot move failed", e);
      }
  };

  const getPieceComponent = (piece: { type: string, color: string } | null) => {
      if (!piece) return null;
      const symbolMap: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
      
      const isWhite = piece.color === 'w';
      
      return (
          <motion.span 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`text-4xl md:text-5xl select-none relative z-20 ${
                  isWhite 
                  ? 'text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]' 
                  : 'text-black drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]'
              }`}
          >
              {symbolMap[piece.type]}
          </motion.span>
      );
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Promotion Modal */}
        <AnimatePresence>
            {pendingPromotion && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="bg-royal-900 border-2 border-gold-500 rounded-2xl p-6 shadow-2xl"
                    >
                        <h3 className="text-white font-bold text-center mb-4 uppercase">Promote Pawn</h3>
                        <div className="flex gap-4">
                            {['q', 'r', 'b', 'n'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => handlePromotionSelect(type)}
                                    className="w-16 h-16 bg-white/10 hover:bg-gold-500/20 border border-white/20 rounded-xl flex items-center justify-center text-4xl"
                                >
                                    {getPieceComponent({ type, color: myColor })}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Header */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-4 mt-2">
            <div className="flex items-center gap-2">
                <button onClick={() => setShowForfeitModal(true)} className="flex items-center gap-2 text-slate-400 hover:text-white">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
                </button>
            </div>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

       {/* Turn Indicator */}
       <div className="mb-2 flex flex-col items-center">
            <div className={`px-8 py-2 rounded-full font-black text-sm uppercase tracking-widest shadow-lg border transition-all ${
                game.turn() === myColor 
                ? 'bg-gold-500 text-royal-950 border-gold-400' 
                : 'bg-royal-800 text-slate-400 border-white/10'
            }`}>
                {game.turn() === myColor ? "YOUR MOVE" : "OPPONENT'S MOVE"}
            </div>
       </div>

        {/* Opponent Info */}
        <div className="w-full max-w-[600px] flex justify-between items-center mb-2 px-2">
            <div className={`flex items-center gap-3 transition-opacity ${game.turn() !== myColor ? 'opacity-100' : 'opacity-60'}`}>
                <div className="w-10 h-10 rounded-full border border-white/20 overflow-hidden bg-royal-800">
                    <img src={table.host?.id === user.id ? table.guest?.avatar : table.host?.avatar || "https://i.pravatar.cc/150"} className="w-full h-full object-cover" />
                </div>
                <div>
                    <span className="text-sm font-bold text-slate-300 block leading-tight">{table.host?.id === user.id ? table.guest?.name : table.host?.name || "Opponent"}</span>
                    <span className="text-[10px] text-slate-500">{myColor === 'w' ? 'Black' : 'White'}</span>
                </div>
            </div>
            <div className={`px-3 py-1 rounded bg-black/40 text-xs font-mono font-bold ${game.turn() !== myColor ? 'text-white border border-white/20' : 'text-slate-500'}`}>
                <Clock size={12} className="inline mr-1" /> {formatTime(timeRemaining[myColor === 'w' ? 'b' : 'w'])}
            </div>
        </div>

        {/* Board */}
        <div className="relative w-full max-w-[600px] aspect-square bg-[#262421] rounded-lg shadow-2xl overflow-hidden border-4 border-[#333] select-none">
            <div className="w-full h-full grid grid-cols-8 grid-rows-8">
                {board.map((row, r) => 
                    row.map((piece, c) => {
                        // Rotation Logic: If playing Black, rotate board 180deg
                        const actualR = myColor === 'w' ? r : 7 - r;
                        const actualC = myColor === 'w' ? c : 7 - c;
                        
                        const square = String.fromCharCode(97 + actualC) + (8 - actualR) as Square;
                        const isDark = (actualR + actualC) % 2 === 1;
                        const p = board[actualR][actualC]; 
                        const isSelected = selectedSquare === square;
                        const optionStyle = optionSquares[square];
                        
                        return (
                            <div 
                                key={square} 
                                onClick={() => onSquareClick(square)}
                                className={`
                                    relative flex items-center justify-center 
                                    ${isDark ? 'bg-[#769656]' : 'bg-[#eeeed2]'} 
                                `}
                            >   
                                {/* Move Highlight */}
                                {isSelected && (
                                    <div className="absolute inset-0 bg-[rgba(255,255,0,0.4)] z-0" />
                                )}

                                {/* Move Options */}
                                {optionStyle && (
                                    <div 
                                        className="absolute inset-0 z-10 pointer-events-none" 
                                        style={{ background: optionStyle.background }}
                                    />
                                )}

                                {/* Piece */}
                                {getPieceComponent(p)}
                                
                                {/* Coordinates */}
                                {actualC === 0 && (
                                    <span className={`absolute top-0.5 left-0.5 text-[8px] md:text-[10px] font-bold ${isDark ? 'text-[#eeeed2]' : 'text-[#769656]'}`}>
                                        {8 - actualR}
                                    </span>
                                )}
                                {actualR === 7 && (
                                    <span className={`absolute bottom-0 right-0.5 text-[8px] md:text-[10px] font-bold ${isDark ? 'text-[#eeeed2]' : 'text-[#769656]'}`}>
                                        {String.fromCharCode(97 + actualC)}
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
            
            {/* Game Over Overlay */}
            {isGameOver && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-30">
                    <div className="bg-royal-900 border border-gold-500 p-8 rounded-2xl text-center shadow-2xl max-w-xs">
                        <h2 className="text-2xl font-black text-white mb-2 uppercase">{endGameReason}</h2>
                        <div className="h-1 w-16 bg-gold-500 mx-auto mb-6"></div>
                        <button onClick={() => onGameEnd('quit')} className="w-full px-6 py-3 bg-gold-500 text-black font-bold rounded-xl hover:bg-gold-400 transition-transform active:scale-95">
                            Continue
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* My Info */}
        <div className="w-full max-w-[600px] flex justify-between items-center mt-2 px-2">
            <div className={`flex items-center gap-3 transition-opacity ${game.turn() === myColor ? 'opacity-100' : 'opacity-60'}`}>
                <div className="w-10 h-10 rounded-full border border-gold-500 overflow-hidden bg-royal-800">
                    <img src={user.avatar} className="w-full h-full object-cover" />
                </div>
                <div>
                    <span className="text-sm font-bold text-white block leading-tight">You</span>
                    <span className="text-[10px] text-slate-400">{myColor === 'w' ? 'White' : 'Black'}</span>
                </div>
            </div>
            <div className={`px-3 py-1 rounded bg-black/40 text-xs font-mono font-bold ${game.turn() === myColor ? 'text-gold-400 border border-gold-500' : 'text-slate-500'}`}>
                <Clock size={12} className="inline mr-1" /> {formatTime(timeRemaining[myColor])}
            </div>
        </div>

        {isP2P && socketGame && (
            <GameChat 
                messages={socketGame.chat || []}
                onSendMessage={(msg) => socket?.emit('game_action', { roomId: socketGame.roomId, action: { type: 'CHAT', message: msg } })}
                currentUserId={user.id}
                profiles={socketGame.profiles || {}}
            />
        )}

        {/* Forfeit Modal */}
        <AnimatePresence>
          {showForfeitModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForfeitModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                  <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-[#1a1a1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                      <div className="flex flex-col items-center text-center mb-6">
                          <AlertTriangle className="text-red-500 mb-4" size={32} />
                          <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                          <p className="text-sm text-slate-400">
                              Leaving now will result in an <span className="text-red-400 font-bold">immediate loss</span>.
                          </p>
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => setShowForfeitModal(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10">Resume</button>
                          <button onClick={handleQuit} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl">Forfeit</button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>
    </div>
  );
};
