import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Shield, Trophy, AlertTriangle, Crown, Brain, Clock, ScrollText, ShieldAlert, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, RotateCcw } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';
import { Chess } from 'chess.js';
import type { Square, Move } from 'chess.js';

interface ChessGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

// Helper to format 600s -> 10:00
const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const ChessTimer = ({ time, isActive, label, materialDiff }: { time: number, isActive: boolean, label: string, materialDiff: number }) => (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl border transition-colors duration-300 relative ${isActive ? 'bg-gold-500/20 border-gold-500 text-gold-400 animate-pulse shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'bg-black/30 border-white/10 text-slate-500'}`}>
        <div className="flex items-center justify-between w-full mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">{label}</span>
            {materialDiff > 0 && (
                <span className="text-xs font-bold text-green-400 bg-green-900/30 px-1.5 rounded">+{materialDiff}</span>
            )}
        </div>
        <div className="flex items-center gap-2">
            <Clock size={16} />
            <span className="font-mono font-bold text-xl leading-none">{formatTime(time)}</span>
        </div>
    </div>
);

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [game, setGame] = useState(new Chess());
  // viewIndex tracks which move we are looking at. -1 = Start, history.length-1 = Latest
  const [viewIndex, setViewIndex] = useState<number>(-1);
  
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [isBotGame, setIsBotGame] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [endGameReason, setEndGameReason] = useState<string | null>(null);
  const [showCheckAlert, setShowCheckAlert] = useState(false);
  
  // Promotion State
  const [pendingPromotion, setPendingPromotion] = useState<{from: Square, to: Square} | null>(null);
  
  // Timer State (10 mins = 600s)
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });
  
  // Move History Scroll Ref
  const historyRef = useRef<HTMLDivElement>(null);
  // Track previous turn to trigger check sound once
  const prevTurnRef = useRef(game.turn());

  const isP2P = !!socket && !!socketGame;

  // --- DERIVED STATE FOR RENDERING ---
  const moveHistory = game.history();
  
  // This memoized game object represents the state at 'viewIndex'
  const displayGame = useMemo(() => {
      // If viewing latest, return the main game object (optimization)
      if (viewIndex === moveHistory.length - 1) return game;
      if (viewIndex === -1) return new Chess(); // Start position

      // Replay moves to get state
      const tempGame = new Chess();
      for (let i = 0; i <= viewIndex; i++) {
          tempGame.move(moveHistory[i]);
      }
      return tempGame;
  }, [game, viewIndex, moveHistory]);

  const board = displayGame.board();
  const isViewingLatest = viewIndex === moveHistory.length - 1;

  // Check Status
  const isCheck = displayGame.inCheck();
  const isMeCheck = isCheck && displayGame.turn() === myColor;
  const isOppCheck = isCheck && displayGame.turn() !== myColor;

  // Material Calculation
  const materialScore = useMemo(() => {
      let w = 0, b = 0;
      board.flat().forEach(p => {
          if (!p) return;
          if (p.color === 'w') w += PIECE_VALUES[p.type];
          else b += PIECE_VALUES[p.type];
      });
      return { w, b };
  }, [board]);

  // --- INIT & SYNC ---
  useEffect(() => {
      // Local Bot Game Setup
      if (!isP2P && table.guest?.id === 'bot') {
          setIsBotGame(true);
          setMyColor('w');
      }

      if (isP2P && socketGame) {
          // Determine color: Player 0 is White, Player 1 is Black
          if (socketGame.players && socketGame.players[0]) {
              const isPlayer1 = socketGame.players[0] === user.id;
              setMyColor(isPlayer1 ? 'w' : 'b');
          }

          // Sync Game State from PGN (preferred for history) or FEN
          const newGame = new Chess();
          let loaded = false;

          if (socketGame.pgn) {
              try {
                  newGame.loadPgn(socketGame.pgn);
                  loaded = true;
              } catch (e) {
                  console.warn("PGN Load failed, falling back to FEN", e);
              }
          } 
          
          if (!loaded && socketGame.fen) {
              newGame.load(socketGame.fen);
          }

          // Important: Only auto-update view if user was already watching live
          const wasLatest = viewIndex === game.history().length - 1;
          
          setGame(newGame);
          
          if (wasLatest || viewIndex === -1) {
              setViewIndex(newGame.history().length - 1);
          }
          
          // Check Game Over from synced state
          checkGameOver(newGame);

          // Sync Timers
          if (socketGame.timers && socketGame.players) {
              setTimeRemaining({
                  w: socketGame.timers[socketGame.players[0]] || 600,
                  b: socketGame.timers[socketGame.players[1]] || 600
              });
          }

          // Legacy winner check (e.g. from timeout)
          if (socketGame.winner && !isGameOver) {
              setIsGameOver(true);
              setEndGameReason(socketGame.winner === user.id ? "Victory by Timeout" : "Defeat by Timeout");
              if (socketGame.winner === user.id) onGameEnd('win');
              else onGameEnd('loss');
          }
      }
  }, [socketGame?.fen, socketGame?.pgn, socketGame?.winner, user.id, isP2P, table]);

  // Handle Check Sounds & Alerts (Only triggered by live game updates)
  useEffect(() => {
      if (game.inCheck() && game.turn() !== prevTurnRef.current) {
          playSFX('notification');
      }
      prevTurnRef.current = game.turn();
  }, [game]);

  // Manage Check Alert Visibility (Auto-dismiss)
  useEffect(() => {
      if (isMeCheck && isViewingLatest && !isGameOver) {
          setShowCheckAlert(true);
          const timer = setTimeout(() => setShowCheckAlert(false), 2500);
          return () => clearTimeout(timer);
      } else {
          setShowCheckAlert(false);
      }
  }, [isMeCheck, isViewingLatest, isGameOver]);

  // Scroll history to bottom when moves update AND we are viewing latest
  useEffect(() => {
      if (historyRef.current && isViewingLatest) {
          historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }
  }, [game, isViewingLatest]);

  // Scroll to active move in history list if navigating
  useEffect(() => {
      if (historyRef.current) {
          const activeElement = historyRef.current.querySelector('[data-active="true"]');
          if (activeElement) {
              activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
      }
  }, [viewIndex]);

  const checkGameOver = (currentGamState: Chess) => {
      if (currentGamState.isGameOver()) {
          setIsGameOver(true);
          if (currentGamState.isCheckmate()) {
              // Winner is the side who just moved (not current turn)
              const winnerColor = currentGamState.turn() === 'w' ? 'b' : 'w';
              const isWinner = winnerColor === myColor;
              
              setEndGameReason(isWinner ? "Checkmate! You Won!" : "Checkmate! You Lost.");
              playSFX(isWinner ? 'win' : 'loss');
              
              if (isP2P && socketGame) {
                  const winnerId = winnerColor === 'w' ? socketGame.players[0] : socketGame.players[1];
                  if (winnerId === user.id) onGameEnd('win');
                  else onGameEnd('loss');
              } else {
                  // Local/Bot
                  onGameEnd(isWinner ? 'win' : 'loss');
              }
          } else if (currentGamState.isDraw() || currentGamState.isStalemate() || currentGamState.isThreefoldRepetition() || currentGamState.isInsufficientMaterial()) {
              setEndGameReason("Draw / Stalemate");
              onGameEnd('quit'); 
          }
      }
  };

  // --- TIMER EFFECT ---
  useEffect(() => {
      if (isGameOver || game.isGameOver()) return;
      
      const interval = setInterval(() => {
          const activeColor = game.turn();
          setTimeRemaining(prev => {
              if (activeColor === 'w') {
                  if (prev.w <= 0) {
                      handleTimeout('w');
                      return prev;
                  }
                  return { ...prev, w: prev.w - 1 };
              } else {
                  if (prev.b <= 0) {
                      handleTimeout('b');
                      return prev;
                  }
                  return { ...prev, b: prev.b - 1 };
              }
          });
      }, 1000);

      return () => clearInterval(interval);
  }, [game, isGameOver]);

  const handleTimeout = (color: 'w' | 'b') => {
      setIsGameOver(true);
      if (myColor === color) {
          playSFX('loss');
          setEndGameReason("Time Expired");
          if (isP2P && socket) socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'TIMEOUT_CLAIM' } });
          onGameEnd('loss');
      } else {
          playSFX('win');
          setEndGameReason("Opponent Time Expired");
          onGameEnd('win');
      }
  };

  const getMoveOptions = (square: Square) => {
    // Only get options if we are viewing the LIVE game
    if (!isViewingLatest) {
        setOptionSquares({});
        return false;
    }

    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: any = {};
    moves.map((move: any) => {
      newSquares[move.to] = {
        background:
          game.get(move.to) && game.get(move.to).color !== game.get(square).color
            ? 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 25%, transparent 30%)' // Capture target
            : 'radial-gradient(circle, rgba(251, 191, 36, 0.5) 25%, transparent 30%)', // Normal move
      };
      return move;
    });
    newSquares[square] = {
      background: 'rgba(251, 191, 36, 0.2)', // Highlight selected
    };
    setOptionSquares(newSquares);
    return true;
  };

  const executeMove = (from: Square, to: Square, promotion?: string) => {
      try {
          const move = game.move({
              from: from,
              to: to,
              promotion: promotion || 'q', // Default to Q if not specified (should only happen for bots)
          });

          if (move) {
              // Local Update
              const newGame = new Chess();
              newGame.loadPgn(game.pgn());
              
              setGame(newGame);
              setViewIndex(newGame.history().length - 1);
              setSelectedSquare(null);
              setOptionSquares({});
              
              if (move.captured) playSFX('capture');
              else playSFX('move');

              checkGameOver(newGame);

              // P2P Sync
              if (isP2P && socket && socketGame) {
                  const nextUserId = socketGame.players[newGame.turn() === 'w' ? 0 : 1];
                  let winnerId = null;
                  
                  if (newGame.isGameOver()) {
                      if (newGame.isCheckmate()) {
                          winnerId = user.id;
                      }
                  }

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
                              winner: winnerId,
                              timers: updatedTimers
                          }
                      }
                  });
              } else if (isBotGame) {
                  if (!newGame.isGameOver()) {
                      setTimeout(makeBotMove, 800);
                  }
              }
          }
      } catch (e) {
          console.error("Move error:", e);
          setSelectedSquare(null);
          setOptionSquares({});
      }
  };

  const onSquareClick = (square: Square) => {
    if (isGameOver) return;
    
    // Snap to live view
    if (!isViewingLatest) {
        setViewIndex(moveHistory.length - 1);
        return; 
    }

    // Deselect if clicking same square
    if (selectedSquare === square) {
        setSelectedSquare(null);
        setOptionSquares({});
        return;
    }

    // Check if move
    const moveOptions = Object.keys(optionSquares);
    if (selectedSquare && moveOptions.includes(square)) {
        
        // Promotion Check
        const piece = game.get(selectedSquare);
        const isPawn = piece?.type === 'p';
        const isLastRank = (piece.color === 'w' && square[1] === '8') || (piece.color === 'b' && square[1] === '1');
        
        if (isPawn && isLastRank) {
            setPendingPromotion({ from: selectedSquare, to: square });
            // Do NOT execute yet, wait for modal
            return;
        }

        executeMove(selectedSquare, square);
        return;
    }

    // Select Piece
    if (game.get(square)) {
        if (game.get(square).color !== myColor) return;
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

  const makeBotMove = () => {
      const moves = game.moves({ verbose: true });
      if (game.isGameOver() || moves.length === 0) return;
      
      let bestMove = moves[0];
      let bestScore = -Infinity;

      // Shuffle for variety
      const shuffled = moves.sort(() => Math.random() - 0.5);

      // Greedy Bot Logic
      for (const move of shuffled) {
          let score = 0;
          if (move.captured) score += (PIECE_VALUES[move.captured] || 0) * 10;
          if (move.promotion) score += 9;
          
          if (score > bestScore) {
              bestScore = score;
              bestMove = move;
          }
      }
      
      // Execute SAN to handle promotions automatically if implicit
      game.move(bestMove.san);
      
      const newGame = new Chess();
      newGame.loadPgn(game.pgn());
      setGame(newGame);
      setViewIndex(newGame.history().length - 1);
      
      if (bestMove.captured) playSFX('capture');
      else playSFX('move');
      
      checkGameOver(newGame);
  };

  // Render Helpers
  const getPieceComponent = (piece: { type: string, color: string } | null) => {
      if (!piece) return null;
      const symbolMap: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
      return (
          <motion.span 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`text-3xl md:text-5xl select-none relative z-20 ${piece.color === 'w' ? 'text-[#e2e8f0] drop-shadow-md' : 'text-[#a855f7] drop-shadow-md'}`}
              style={{ 
                  textShadow: piece.color === 'w' ? '0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.8)' 
              }}
          >
              {symbolMap[piece.type]}
          </motion.span>
      );
  };

  // History Formatting
  const historyPairs = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
      historyPairs.push({
          num: Math.floor(i / 2) + 1,
          white: moveHistory[i],
          whiteIndex: i,
          black: moveHistory[i + 1] || null,
          blackIndex: i + 1
      });
  }

  // Navigation
  const goStart = () => { setViewIndex(-1); playSFX('click'); };
  const goPrev = () => { setViewIndex(prev => Math.max(-1, prev - 1)); playSFX('click'); };
  const goNext = () => { setViewIndex(prev => Math.min(moveHistory.length - 1, prev + 1)); playSFX('click'); };
  const goEnd = () => { setViewIndex(moveHistory.length - 1); playSFX('click'); };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        
        {/* Promotion Modal */}
        <AnimatePresence>
            {pendingPromotion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-royal-900 border-2 border-gold-500 rounded-2xl p-6 shadow-2xl"
                    >
                        <h3 className="text-white font-bold text-center mb-4 uppercase tracking-widest">Promote Pawn</h3>
                        <div className="flex gap-4">
                            {['q', 'r', 'b', 'n'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => handlePromotionSelect(type)}
                                    className="w-16 h-16 bg-white/10 hover:bg-gold-500/20 border border-white/20 hover:border-gold-500 rounded-xl flex items-center justify-center text-4xl transition-all"
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
            <button onClick={() => setShowForfeitModal(true)} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
            </button>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

       {/* TIMERS & MATERIAL */}
       <div className="w-full max-w-[600px] flex justify-between mb-4">
           <ChessTimer 
                label={myColor === 'w' ? "Black (Opponent)" : "White (Opponent)"} 
                time={myColor === 'w' ? timeRemaining.b : timeRemaining.w} 
                isActive={!isGameOver && game.turn() !== myColor}
                materialDiff={myColor === 'w' ? Math.max(0, materialScore.b - materialScore.w) : Math.max(0, materialScore.w - materialScore.b)}
           />
           <ChessTimer 
                label={myColor === 'w' ? "White (You)" : "Black (You)"} 
                time={myColor === 'w' ? timeRemaining.w : timeRemaining.b} 
                isActive={!isGameOver && game.turn() === myColor} 
                materialDiff={myColor === 'w' ? Math.max(0, materialScore.w - materialScore.b) : Math.max(0, materialScore.b - materialScore.w)}
           />
       </div>

       {/* Board */}
       <div className={`relative w-full max-w-[600px] aspect-square bg-[#1a103c] rounded-xl shadow-2xl p-1 md:p-2 border-4 ${isViewingLatest ? 'border-royal-800' : 'border-gold-500/50'} transition-colors duration-300`}>
            
            {!isViewingLatest && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gold-500 text-royal-950 text-xs font-bold px-3 py-1 rounded-full shadow-lg animate-pulse z-30">
                    VIEWING HISTORY
                </div>
            )}

            {/* Overlays */}
            <AnimatePresence>
                {isMeCheck && showCheckAlert && isViewingLatest && !isGameOver && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-red-600/90 text-white px-6 py-4 rounded-2xl shadow-[0_0_30px_rgba(220,38,38,0.6)] border-2 border-white backdrop-blur-sm text-center pointer-events-none"
                    >
                        <ShieldAlert size={48} className="mx-auto mb-2 animate-bounce" />
                        <div className="text-2xl font-black uppercase tracking-wider">Protect King!</div>
                        <div className="text-xs font-bold text-red-100">You are in Check</div>
                    </motion.div>
                )}
                {isOppCheck && isViewingLatest && !isGameOver && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-gold-500 text-royal-950 px-4 py-1 rounded-full font-black text-sm shadow-lg border border-white/20 animate-pulse pointer-events-none"
                    >
                        CHECK!
                    </motion.div>
                )}
                {isGameOver && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 rounded-lg"
                    >
                        <Trophy size={64} className="text-gold-400 mb-4 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
                        <h2 className="text-3xl font-display font-black text-white mb-2 uppercase">{endGameReason || "Game Over"}</h2>
                        <p className="text-slate-400 text-sm mb-6">Returning to lobby...</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Board Grid */}
            <div className={`w-full h-full grid grid-cols-8 grid-rows-8 border border-white/10`}>
                {board.map((row: any[], rowIndex: number) => 
                    row.map((piece: any, colIndex: number) => {
                        const actualRow = myColor === 'w' ? rowIndex : 7 - rowIndex;
                        const actualCol = myColor === 'w' ? colIndex : 7 - colIndex;
                        const visualPiece = board[actualRow][actualCol]; 

                        const file = ['a','b','c','d','e','f','g','h'][actualCol];
                        const rank = 8 - actualRow;
                        const square = `${file}${rank}` as Square;

                        const isDark = (actualRow + actualCol) % 2 === 1;
                        const option = optionSquares[square];
                        const isKingInCheck = visualPiece?.type === 'k' && visualPiece?.color === displayGame.turn() && displayGame.inCheck();
                        
                        let isLastMove = false;
                        if (viewIndex >= 0) {
                            const lastMoveDetails = displayGame.history({ verbose: true })[viewIndex];
                            if (lastMoveDetails && (lastMoveDetails.to === square || lastMoveDetails.from === square)) {
                                isLastMove = true;
                            }
                        }

                        return (
                            <div 
                                key={square}
                                onClick={() => onSquareClick(square)}
                                className={`
                                    relative flex items-center justify-center 
                                    ${isDark ? 'bg-royal-900/60' : 'bg-slate-300/10'}
                                    ${selectedSquare === square ? 'ring-inset ring-4 ring-gold-500/50' : ''}
                                    ${isKingInCheck ? 'bg-red-500/50 animate-pulse' : ''}
                                    ${isLastMove ? 'bg-yellow-500/20' : ''}
                                    cursor-pointer
                                `}
                            >
                                {option && (
                                    <div 
                                        className="absolute inset-0 z-10 pointer-events-none"
                                        style={{ background: option.background }}
                                    />
                                )}

                                {getPieceComponent(visualPiece)}
                                
                                {/* Coords */}
                                {(actualCol === 0 && myColor === 'w') || (actualCol === 7 && myColor === 'b') ? (
                                    <span className="absolute top-0.5 left-0.5 text-[8px] text-slate-500 font-mono select-none">{rank}</span>
                                ) : null}
                                {(actualRow === 7 && myColor === 'w') || (actualRow === 0 && myColor === 'b') ? (
                                    <span className="absolute bottom-0.5 right-0.5 text-[8px] text-slate-500 font-mono select-none">{file}</span>
                                ) : null}
                            </div>
                        );
                    })
                )}
            </div>
       </div>

       {/* Controls */}
       <div className="w-full max-w-[600px] mt-4 flex items-center justify-center gap-2 bg-royal-900/50 p-2 rounded-xl border border-white/5">
            <button onClick={goStart} disabled={viewIndex === -1} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronsLeft size={20} />
            </button>
            <button onClick={goPrev} disabled={viewIndex === -1} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronLeft size={20} />
            </button>
            <div className="px-4 text-sm font-mono text-slate-300 min-w-[80px] text-center">
                {viewIndex === -1 ? "Start" : `${Math.floor(viewIndex / 2) + 1}${viewIndex % 2 === 0 ? 'w' : 'b'}`} / {Math.ceil(moveHistory.length / 2)}
            </div>
            <button onClick={goNext} disabled={viewIndex === moveHistory.length - 1} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronRight size={20} />
            </button>
            <button onClick={goEnd} disabled={viewIndex === moveHistory.length - 1} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronsRight size={20} />
            </button>
       </div>

       {/* Move History List */}
       <div className="w-full max-w-[600px] mt-4 flex flex-col gap-2">
           <div className="flex items-center gap-2 text-gold-400 font-bold text-xs uppercase tracking-wider pl-2">
               <ScrollText size={14} /> Move History
           </div>
           <div 
               ref={historyRef}
               className="bg-royal-900/50 border border-white/10 rounded-xl p-3 h-32 overflow-y-auto custom-scrollbar shadow-inner"
           >
               <div className="grid grid-cols-5 gap-y-1 text-sm font-mono">
                   {historyPairs.map((pair) => (
                       <React.Fragment key={pair.num}>
                           <div className="col-span-1 text-slate-600 font-bold text-right pr-3">{pair.num}.</div>
                           <div 
                                onClick={() => setViewIndex(pair.whiteIndex)}
                                data-active={viewIndex === pair.whiteIndex}
                                className={`col-span-2 px-2 rounded cursor-pointer transition-colors ${
                                    viewIndex === pair.whiteIndex 
                                    ? 'bg-gold-500 text-royal-950 font-bold' 
                                    : 'bg-white/5 text-slate-200 hover:bg-white/10'
                                }`}
                           >
                               {pair.white}
                           </div>
                           {pair.black && (
                               <div 
                                    onClick={() => setViewIndex(pair.blackIndex)}
                                    data-active={viewIndex === pair.blackIndex}
                                    className={`col-span-2 px-2 rounded cursor-pointer transition-colors ${
                                        viewIndex === pair.blackIndex 
                                        ? 'bg-gold-500 text-royal-950 font-bold' 
                                        : 'bg-black/20 text-slate-200 hover:bg-black/40'
                                    }`}
                               >
                                   {pair.black}
                               </div>
                           )}
                       </React.Fragment>
                   ))}
                   {historyPairs.length === 0 && (
                       <div className="col-span-5 text-center text-slate-600 py-10 italic">Game has not started</div>
                   )}
               </div>
           </div>
       </div>

        {/* P2P Chat */}
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