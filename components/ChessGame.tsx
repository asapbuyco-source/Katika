import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Clock, BookOpen, X, AlertTriangle, RefreshCw, Cpu, ExternalLink } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { createLichessAiGame, makeLichessMove, fetchLichessGameState } from '../services/lichess';

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
  const [viewIndex, setViewIndex] = useState<number>(-1);
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  
  // Lichess State
  const [lichessId, setLichessId] = useState<string | null>(null);
  const [isLichessLoading, setIsLichessLoading] = useState(false);

  const [isGameOver, setIsGameOver] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{from: Square, to: Square} | null>(null);
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });

  const isP2P = !!socket && !!socketGame;
  const isBotGame = !isP2P && table.guest?.id === 'bot';

  const moveHistory = game.history();
  const displayGame = useMemo(() => {
      if (viewIndex === moveHistory.length - 1) return game;
      if (viewIndex === -1) return new Chess();
      const tempGame = new Chess();
      for (let i = 0; i <= viewIndex; i++) {
          tempGame.move(moveHistory[i]);
      }
      return tempGame;
  }, [game, viewIndex, moveHistory]);

  const board = displayGame.board();
  const isViewingLatest = viewIndex === moveHistory.length - 1;

  // Lichess Integration Hook
  useEffect(() => {
      // If playing against Bot, initialize Lichess Game
      if (isBotGame && !lichessId && !isLichessLoading) {
          setIsLichessLoading(true);
          createLichessAiGame(1, 'white').then(data => {
              if (data && data.id) {
                  setLichessId(data.id);
                  setMyColor('w'); // Assuming we play white for simplicity against AI
                  console.log("Lichess Game Started:", data.id);
              }
              setIsLichessLoading(false);
          });
      }
  }, [isBotGame, lichessId]);

  // Lichess Polling (Simplified Stream)
  useEffect(() => {
      if (lichessId && !isGameOver) {
          const interval = setInterval(async () => {
              const state = await fetchLichessGameState(lichessId);
              if (state && state.moves) {
                  const moves = state.moves.split(' ');
                  const newGame = new Chess();
                  
                  // Replay all moves
                  let invalid = false;
                  for (const m of moves) {
                      try {
                          // Lichess returns long algebraic (e2e4), chess.js needs conversion or robust parsing
                          // Chess.js .move() handles standard algebraic well, but UCI (e2e4) sometimes needs from/to
                          // We try to let chess.js figure it out or fallback
                          const from = m.substring(0, 2);
                          const to = m.substring(2, 4);
                          const promotion = m.length > 4 ? m.substring(4, 5) : undefined;
                          newGame.move({ from, to, promotion });
                      } catch (e) {
                          // Fallback for SAN if moves are SAN
                          try { newGame.move(m); } catch(e2) { invalid = true; }
                      }
                  }

                  if (!invalid && newGame.fen() !== game.fen()) {
                      setGame(newGame);
                      setViewIndex(newGame.history().length - 1);
                      playSFX('move');
                      checkGameOver(newGame);
                  }
              }
          }, 2000); // Poll every 2s
          return () => clearInterval(interval);
      }
  }, [lichessId, game, isGameOver]);

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

  // Local Timer
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

  const getMoveOptions = (square: Square) => {
    if (!isViewingLatest) {
        setOptionSquares({});
        return false;
    }
    const sourcePiece = game.get(square);
    if (!sourcePiece) return false;

    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }
    const newSquares: any = {};
    moves.map((move: any) => {
      const targetPiece = game.get(move.to);
      newSquares[move.to] = {
        background: targetPiece && targetPiece.color !== sourcePiece.color
            ? 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 25%, transparent 30%)'
            : 'radial-gradient(circle, rgba(251, 191, 36, 0.5) 25%, transparent 30%)',
      };
      return move;
    });
    newSquares[square] = { background: 'rgba(251, 191, 36, 0.2)' };
    setOptionSquares(newSquares);
    return true;
  };

  const executeMove = async (from: Square, to: Square, promotion?: string) => {
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

              // 1. P2P Logic
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
              // 2. Lichess Logic
              else if (lichessId) {
                  await makeLichessMove(lichessId, move.from + move.to + (move.promotion || ''));
              }
          }
      } catch (e) {
          setSelectedSquare(null);
          setOptionSquares({});
      }
  };

  const onSquareClick = (square: Square) => {
    if (isGameOver || (isLichessLoading)) return;
    if (!isViewingLatest) { setViewIndex(moveHistory.length - 1); return; }

    if (selectedSquare === square) { setSelectedSquare(null); setOptionSquares({}); return; }

    const moveOptions = Object.keys(optionSquares);
    if (selectedSquare && moveOptions.includes(square)) {
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

    const clickedPiece = game.get(square);
    if (clickedPiece) {
        if (clickedPiece.color !== myColor) return;
        if (game.turn() !== myColor) return;
        setSelectedSquare(square);
        getMoveOptions(square);
        playSFX('click');
    } else {
        setSelectedSquare(null);
        setOptionSquares({});
    }
  };

  const handleQuit = () => {
      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      onGameEnd('quit');
  };

  const getPieceComponent = (piece: { type: string, color: string } | null) => {
      if (!piece) return null;
      const symbolMap: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
      return (
          <motion.span 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`text-3xl md:text-5xl select-none relative z-20 ${piece.color === 'w' ? 'text-[#e2e8f0] drop-shadow-md' : 'text-[#a855f7] drop-shadow-md'}`}
              style={{ textShadow: piece.color === 'w' ? '0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.8)' }}
          >
              {symbolMap[piece.type]}
          </motion.span>
      );
  };

  const opponentColor = myColor === 'w' ? 'b' : 'w';
  const opponent = !isP2P ? { name: "Lichess AI", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=chess" } 
      : (socketGame?.profiles ? socketGame.profiles[socketGame.players.find((id: string) => id !== user.id)] : { name: "Opponent", avatar: "https://i.pravatar.cc/150?u=opp" });

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

       {/* Turn Indicator & Lichess Status */}
       <div className="mb-2 flex flex-col items-center justify-center">
            {isLichessLoading ? (
                <div className="px-6 py-2 rounded-full bg-royal-800 text-gold-400 border border-gold-500/30 flex items-center gap-2">
                    <RefreshCw className="animate-spin" size={16} /> Connecting to Lichess...
                </div>
            ) : (
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
            )}
       </div>

       {/* OPPONENT BAR */}
       <div className="w-full max-w-[600px] flex justify-between items-end mb-2 px-2">
            <div className="flex items-center gap-3">
                <img src={opponent.avatar} className="w-10 h-10 rounded-full border border-white/20" alt="Opponent" />
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">{opponent.name}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{opponentColor === 'w' ? 'White' : 'Black'}</span>
                </div>
                {lichessId && <a href={`https://lichess.org/${lichessId}`} target="_blank" className="text-xs text-blue-400 flex items-center gap-1"><ExternalLink size={10}/> Lichess</a>}
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${game.turn() === opponentColor ? 'bg-red-500/20 border-red-500 text-white animate-pulse' : 'bg-black/30 border-white/10 text-slate-400'}`}>
                <Clock size={16} />
                <span className="font-mono font-bold text-lg">{formatTime(timeRemaining[opponentColor])}</span>
            </div>
       </div>

       {/* Board */}
       <div className={`relative w-full max-w-[600px] aspect-square bg-[#1a103c] rounded-xl shadow-2xl p-1 md:p-2 border-4 ${isViewingLatest ? 'border-royal-800' : 'border-gold-500/50'} transition-colors duration-300`}>
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
                        if (viewIndex >= 0 && moveHistory?.[viewIndex]) {
                            const hist = displayGame.history({ verbose: true });
                            const lastMoveDetails = hist?.[viewIndex];
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

                                {visualPiece && getPieceComponent(visualPiece)}
                                
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

        {/* ... Modal Code (Rules/Forfeit) hidden for brevity ... */}
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