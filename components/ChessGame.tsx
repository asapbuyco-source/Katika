
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Clock, BookOpen, X, AlertTriangle, RefreshCw, Cpu, ExternalLink } from 'lucide-react';
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

// --- Optimized Square Component ---
const ChessSquare = React.memo(({ 
    square, 
    isDark, 
    isSelected, 
    isLastMove, 
    isKingInCheck, 
    piece, 
    moveOption, 
    onClick,
    rankLabel,
    fileLabel
}: any) => {
    
    // Stable symbol map
    const symbolMap: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
    
    const handleClick = () => {
        onClick(square);
    };

    return (
        <div 
            onClick={handleClick}
            className={`
                relative flex items-center justify-center w-full h-full
                ${isDark ? 'bg-royal-900/60' : 'bg-slate-300/10'}
                ${isSelected ? 'ring-inset ring-4 ring-gold-500/50' : ''}
                ${isKingInCheck ? 'bg-red-500/50 animate-pulse' : ''}
                ${isLastMove ? 'bg-yellow-500/20' : ''}
                cursor-pointer
            `}
        >
            {/* Move Hint / Option */}
            {moveOption && (
                <div 
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{ background: moveOption.background }}
                />
            )}

            {/* Piece Render */}
            {piece && (
                <motion.span 
                    layoutId={`piece-${square}`} // Framer Motion layout animation for smooth sliding
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={`text-3xl md:text-5xl select-none relative z-20 ${piece.color === 'w' ? 'text-[#e2e8f0] drop-shadow-md' : 'text-[#a855f7] drop-shadow-md'}`}
                    style={{ textShadow: piece.color === 'w' ? '0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.8)' }}
                >
                    {symbolMap[piece.type]}
                </motion.span>
            )}
            
            {/* Labels */}
            {rankLabel && (
                <span className="absolute top-0.5 left-0.5 text-[8px] text-slate-500 font-mono select-none">{rankLabel}</span>
            )}
            {fileLabel && (
                <span className="absolute bottom-0.5 right-0.5 text-[8px] text-slate-500 font-mono select-none">{fileLabel}</span>
            )}
        </div>
    );
}, (prev, next) => {
    // Custom Comparison for Performance
    if (prev.square !== next.square) return false;
    if (prev.isDark !== next.isDark) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isLastMove !== next.isLastMove) return false;
    if (prev.isKingInCheck !== next.isKingInCheck) return false;
    
    // Deep check piece
    const p1 = prev.piece;
    const p2 = next.piece;
    if (p1 !== p2) {
        if (!p1 || !p2) return false;
        if (p1.type !== p2.type || p1.color !== p2.color) return false;
    }

    // Check move option style
    const m1 = prev.moveOption;
    const m2 = next.moveOption;
    if (m1 !== m2) {
        if (!m1 || !m2) return false;
        if (m1.background !== m2.background) return false;
    }

    return true;
});

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [game, setGame] = useState(new Chess());
  const [viewIndex, setViewIndex] = useState<number>(-1);
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  
  const [isGameOver, setIsGameOver] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{from: Square, to: Square} | null>(null);
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });

  const isP2P = !!socket && !!socketGame;
  const isBotGame = !isP2P && (table.guest?.id === 'bot' || !table.guest);

  const moveHistory = game.history();
  const displayGame = useMemo(() => {
      if (viewIndex === moveHistory.length - 1 || viewIndex === -1) return game;
      const tempGame = new Chess();
      for (let i = 0; i <= viewIndex; i++) {
          tempGame.move(moveHistory[i]);
      }
      return tempGame;
  }, [game, viewIndex, moveHistory.length]); // Optimized dep array

  const board = displayGame.board();
  
  // State Ref to allow stable callbacks
  const stateRef = useRef({
      game,
      viewIndex,
      myColor,
      selectedSquare,
      optionSquares,
      isGameOver,
      socket,
      socketGame,
      timeRemaining
  });

  useEffect(() => {
      stateRef.current = {
          game,
          viewIndex,
          myColor,
          selectedSquare,
          optionSquares,
          isGameOver,
          socket,
          socketGame,
          timeRemaining
      };
  }, [game, viewIndex, myColor, selectedSquare, optionSquares, isGameOver, socket, socketGame, timeRemaining]);

  // Socket State Sync
  useEffect(() => {
      if (isP2P && socketGame) {
          if (socketGame.players && socketGame.players[0]) {
              const isPlayer1 = socketGame.players[0] === user.id;
              setMyColor(isPlayer1 ? 'w' : 'b');
          }

          const newGame = new Chess();
          if (socketGame.gameState && socketGame.gameState.pgn) {
              try { newGame.loadPgn(socketGame.gameState.pgn); } catch (e) {}
          }
          
          const wasLatest = viewIndex === game.history().length - 1;
          setGame(newGame);
          if (wasLatest || viewIndex === -1) setViewIndex(newGame.history().length - 1);
          checkGameOver(newGame);

          if (socketGame.gameState && socketGame.gameState.timers && socketGame.players) {
              setTimeRemaining({
                  w: socketGame.gameState.timers[socketGame.players[0]] || 600,
                  b: socketGame.gameState.timers[socketGame.players[1]] || 600
              });
          }

          if (socketGame.winner && !isGameOver) {
              setIsGameOver(true);
              if (socketGame.winner === user.id) onGameEnd('win');
              else onGameEnd('loss');
          }
      }
  }, [socketGame, user.id, isP2P]);

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

  const checkGameOver = (currentGamState: Chess) => {
      if (currentGamState.isGameOver()) {
          setIsGameOver(true);
          if (currentGamState.isCheckmate()) {
              const winnerColor = currentGamState.turn() === 'w' ? 'b' : 'w';
              const isWinner = winnerColor === myColor;
              playSFX(isWinner ? 'win' : 'loss');
              onGameEnd(isWinner ? 'win' : 'loss');
          } else {
              onGameEnd('quit'); 
          }
      }
  };

  // Stable Move Execution
  const executeMove = useCallback(async (from: Square, to: Square, promotion?: string) => {
      const { game, isP2P, socket, socketGame, timeRemaining } = stateRef.current;
      
      try {
          const moveAttempt = { from, to, promotion: promotion || 'q' };
          const move = game.move(moveAttempt);
          
          if (move) {
              const newGame = new Chess();
              newGame.loadPgn(game.pgn());
              
              setGame(newGame);
              setViewIndex(newGame.history().length - 1);
              setSelectedSquare(null);
              setOptionSquares({});
              
              if (move.captured) playSFX('capture'); else playSFX('move');
              checkGameOver(newGame);

              if (isP2P && socket && socketGame) {
                  const nextUserId = socketGame.players[newGame.turn() === 'w' ? 0 : 1];
                  const updatedTimers = {
                      [socketGame.players[0]]: timeRemaining.w,
                      [socketGame.players[1]]: timeRemaining.b
                  };
                  socket.emit('game_action', {
                      roomId: socketGame.roomId,
                      action: {
                          type: 'MOVE',
                          newState: {
                              fen: newGame.fen(),
                              pgn: newGame.pgn(),
                              turn: nextUserId,
                              timers: updatedTimers
                          }
                      }
                  });
              } 
          }
      } catch (e) {
          setSelectedSquare(null);
          setOptionSquares({});
      }
  }, []);

  // Local Bot AI Logic
  useEffect(() => {
      if (isBotGame && !isGameOver && game.turn() !== myColor) {
          const timer = setTimeout(() => {
              const moves = game.moves({ verbose: true });
              if (moves.length > 0) {
                  // Simple AI: Random move for now
                  const randomMove = moves[Math.floor(Math.random() * moves.length)];
                  executeMove(randomMove.from, randomMove.to, randomMove.promotion);
              }
          }, 1000); // 1 second think time
          return () => clearTimeout(timer);
      }
  }, [game, isBotGame, isGameOver, myColor, executeMove]);

  const onSquareClick = useCallback((square: Square) => {
    const { 
        game, viewIndex, myColor, selectedSquare, optionSquares, 
        isGameOver
    } = stateRef.current;

    const moveHistory = game.history();
    const isViewingLatest = viewIndex === moveHistory.length - 1 || viewIndex === -1;

    if (isGameOver) return;
    if (!isViewingLatest) { setViewIndex(moveHistory.length - 1); return; }

    if (selectedSquare === square) { setSelectedSquare(null); setOptionSquares({}); return; }

    // Execute Move if option clicked
    if (selectedSquare && optionSquares[square]) {
        const piece = game.get(selectedSquare);
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
        if (clickedPiece.color !== myColor) return;
        if (game.turn() !== myColor) return;
        
        setSelectedSquare(square);
        
        // Calculate Options Inline to avoid state thrashing
        const moves = game.moves({ square, verbose: true });
        const newSquares: any = {};
        if (moves.length > 0) {
            moves.forEach((move: any) => {
                const targetPiece = game.get(move.to);
                newSquares[move.to] = {
                    background: targetPiece && targetPiece.color !== clickedPiece.color
                        ? 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 25%, transparent 30%)'
                        : 'radial-gradient(circle, rgba(251, 191, 36, 0.5) 25%, transparent 30%)',
                };
            });
            newSquares[square] = { background: 'rgba(251, 191, 36, 0.2)' };
        }
        setOptionSquares(newSquares);
        playSFX('click');
    } else {
        setSelectedSquare(null);
        setOptionSquares({});
    }
  }, [executeMove]); // Stable handler

  const handleQuit = () => {
      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      onGameEnd('quit');
  };

  const opponentColor = myColor === 'w' ? 'b' : 'w';
  const opponent = !isP2P ? { name: "Vantage AI", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=chess" } 
      : (socketGame?.profiles ? socketGame.profiles[socketGame.players.find((id: string) => id !== user.id)] : { name: "Opponent", avatar: "https://i.pravatar.cc/150?u=opp" });

  // Get piece symbol for promotion modal
  const getPieceSymbol = (type: string) => {
      const map: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
      return map[type];
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Promotion Modal */}
        <AnimatePresence>
            {pendingPromotion && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-royal-900 border-2 border-gold-500 rounded-2xl p-6 shadow-2xl relative"
                    >
                        <h3 className="text-white font-bold text-center mb-4 uppercase tracking-widest">Promote Pawn</h3>
                        <div className="flex gap-4">
                            {['q', 'r', 'b', 'n'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => { executeMove(pendingPromotion.from, pendingPromotion.to, type); setPendingPromotion(null); }}
                                    className="w-16 h-16 bg-white/10 hover:bg-gold-500/20 border border-white/20 hover:border-gold-500 rounded-xl flex items-center justify-center text-4xl transition-all"
                                >
                                    <span className={myColor === 'w' ? 'text-white' : 'text-purple-500'}>{getPieceSymbol(type)}</span>
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
                <button onClick={() => setShowRulesModal(true)} className="p-2 bg-white/5 rounded-xl border border-white/10 text-gold-400 hover:text-white">
                    <BookOpen size={18} />
                </button>
            </div>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

       {/* Turn Indicator */}
       <div className="mb-2 flex flex-col items-center justify-center">
            <motion.div
                key={game.turn()} 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className={`px-6 py-2 rounded-full font-bold text-sm uppercase tracking-widest shadow-lg border transition-colors duration-300 ${
                    game.turn() === myColor 
                    ? 'bg-gold-500 text-royal-950 border-gold-400' 
                    : 'bg-royal-800 text-slate-400 border-white/10'
                }`}
            >
                {game.turn() === myColor ? "Your Turn" : "Opponent's Turn"}
            </motion.div>
       </div>

       {/* OPPONENT BAR */}
       <div className="w-full max-w-[600px] flex justify-between items-end mb-2 px-2">
            <div className="flex items-center gap-3">
                <img src={opponent.avatar} className="w-10 h-10 rounded-full border border-white/20" alt="Opponent" />
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">{opponent.name}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{opponentColor === 'w' ? 'White' : 'Black'}</span>
                </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${game.turn() === opponentColor ? 'bg-red-500/20 border-red-500 text-white animate-pulse' : 'bg-black/30 border-white/10 text-slate-400'}`}>
                <Clock size={16} />
                <span className="font-mono font-bold text-lg">{formatTime(timeRemaining[opponentColor])}</span>
            </div>
       </div>

       {/* Board */}
       <div className={`relative w-full max-w-[600px] aspect-square bg-[#1a103c] rounded-xl shadow-2xl p-1 md:p-2 border-4 ${viewIndex === moveHistory.length - 1 || viewIndex === -1 ? 'border-royal-800' : 'border-gold-500/50'} transition-colors duration-300`}>
            {/* Board Grid */}
            <div className={`w-full h-full grid grid-cols-8 grid-rows-8 border border-white/10`}>
                {board.map((row: any[], rowIndex: number) => 
                    row.map((piece: any, colIndex: number) => {
                        const actualRow = myColor === 'w' ? rowIndex : 7 - rowIndex;
                        const actualCol = myColor === 'w' ? colIndex : 7 - colIndex;
                        const visualPiece = board[actualRow]?.[actualCol]; 

                        const file = ['a','b','c','d','e','f','g','h'][actualCol];
                        const rank = 8 - actualRow;
                        const square = `${file}${rank}` as Square;

                        const isDark = (actualRow + actualCol) % 2 === 1;
                        const option = optionSquares[square];
                        const isKingInCheck = visualPiece?.type === 'k' && visualPiece.color === displayGame.turn() && displayGame.inCheck();
                        
                        let isLastMove = false;
                        if ((viewIndex === -1 && moveHistory.length > 0) || (viewIndex >= 0 && moveHistory?.[viewIndex])) {
                            const hist = displayGame.history({ verbose: true });
                            const idx = viewIndex === -1 ? hist.length - 1 : viewIndex;
                            const lastMoveDetails = hist?.[idx];
                            if (lastMoveDetails && (lastMoveDetails.to === square || lastMoveDetails.from === square)) {
                                isLastMove = true;
                            }
                        }

                        return (
                            <ChessSquare 
                                key={square}
                                square={square}
                                isDark={isDark}
                                isSelected={selectedSquare === square}
                                isLastMove={isLastMove}
                                isKingInCheck={isKingInCheck}
                                piece={visualPiece}
                                moveOption={option}
                                onClick={onSquareClick}
                                rankLabel={(actualCol === 0 && myColor === 'w') || (actualCol === 7 && myColor === 'b') ? rank : null}
                                fileLabel={(actualRow === 7 && myColor === 'w') || (actualRow === 0 && myColor === 'b') ? file : null}
                            />
                        );
                    })
                )}
            </div>
       </div>

       {/* PLAYER BAR (ME) */}
       <div className="w-full max-w-[600px] flex justify-between items-start mt-2 mb-4 px-2">
            <div className="flex items-center gap-3">
                <img src={user.avatar} className="w-10 h-10 rounded-full border border-gold-500" alt="Me" />
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">You</span>
                    <span className="text-[10px] text-slate-400 font-bold">{myColor === 'w' ? 'White' : 'Black'}</span>
                </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${game.turn() === myColor ? 'bg-gold-500/20 border-gold-500 text-white animate-pulse' : 'bg-black/30 border-white/10 text-slate-400'}`}>
                <Clock size={16} />
                <span className="font-mono font-bold text-lg">{formatTime(timeRemaining[myColor])}</span>
            </div>
       </div>

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
