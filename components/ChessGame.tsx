// ... (imports)
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Crown, Shield, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertTriangle, BookOpen, X, Clock } from 'lucide-react';
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

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  // ... (Keep existing state)
  const [game, setGame] = useState(new Chess());
  const [viewIndex, setViewIndex] = useState<number>(0);
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [isBotGame, setIsBotGame] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [endGameReason, setEndGameReason] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{from: Square, to: Square} | null>(null);
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });
  const prevTurnRef = useRef(game.turn());

  const isP2P = !!socket && !!socketGame;

  const moveHistory = game.history();
  const displayGame = useMemo(() => {
      if (viewIndex === moveHistory.length) return game;
      if (viewIndex === 0) return new Chess();
      const tempGame = new Chess();
      for (let i = 0; i < viewIndex; i++) {
          tempGame.move(moveHistory[i]);
      }
      return tempGame;
  }, [game, viewIndex, moveHistory]);

  const board = displayGame.board();
  const isViewingLatest = viewIndex === moveHistory.length;

  // ... (Keep Timer logic) ...
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

  useEffect(() => {
      if (!isP2P && table.guest?.id === 'bot') {
          setIsBotGame(true);
          setMyColor('w');
      }

      if (isP2P && socketGame) {
          if (socketGame.players && socketGame.players[0]) {
              const isPlayer1 = socketGame.players[0] === user.id;
              setMyColor(isPlayer1 ? 'w' : 'b');
          }

          const newGame = new Chess();
          let loaded = false;

          // Priority 1: Load PGN to preserve history
          if (socketGame.gameState && socketGame.gameState.pgn) {
              try {
                  newGame.loadPgn(socketGame.gameState.pgn);
                  loaded = true;
              } catch (e) { console.warn("PGN load failed"); }
          }

          // Priority 2: Load FEN 
          if (!loaded && socketGame.gameState && socketGame.gameState.fen) {
              try {
                  newGame.load(socketGame.gameState.fen);
              } catch (e) { console.warn("FEN load failed"); }
          }
          
          setGame(newGame);
          
          if (viewIndex === 0 || viewIndex === game.history().length) {
              setViewIndex(newGame.history().length);
          }
          
          checkGameOver(newGame);

          if (socketGame.winner && !isGameOver) {
              setIsGameOver(true);
              setEndGameReason(socketGame.winner === user.id ? "Victory by Timeout" : "Defeat by Timeout");
              if (socketGame.winner === user.id) onGameEnd('win');
              else onGameEnd('loss');
          }
      }
  }, [socketGame, user.id, isP2P, table]);

  const checkGameOver = (currentGamState: Chess) => {
      if (currentGamState.isGameOver()) {
          setIsGameOver(true);
          if (currentGamState.isCheckmate()) {
              const winnerColor = currentGamState.turn() === 'w' ? 'b' : 'w';
              const isWinner = winnerColor === myColor;
              setEndGameReason(isWinner ? "Checkmate! You Won!" : "Checkmate! You Lost.");
              playSFX(isWinner ? 'win' : 'loss');
              
              if (!isP2P) { 
                  onGameEnd(isWinner ? 'win' : 'loss');
              }
          } else {
              setEndGameReason("Draw / Stalemate");
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

  const executeMove = (from: Square, to: Square, promotion?: string) => {
      try {
          const move = game.move({ from, to, promotion: promotion || 'q' });
          if (move) {
              const newGame = new Chess();
              newGame.loadPgn(game.pgn());
              
              setGame(newGame);
              setViewIndex(newGame.history().length);
              setSelectedSquare(null);
              setOptionSquares({});
              
              if (move.captured) playSFX('capture'); else playSFX('move');
              checkGameOver(newGame);

              if (isP2P && socket && socketGame) {
                  socket.emit('game_action', {
                      roomId: socketGame.roomId,
                      action: {
                          type: 'MOVE',
                          fen: newGame.fen(),
                          pgn: newGame.pgn(),
                          move: { from, to, promotion: promotion || 'q' } // Explicit move details for server relay
                      }
                  });
              } else if (isBotGame && !newGame.isGameOver()) {
                  setTimeout(makeBotMove, 800);
              }
          }
      } catch (e) {
          setSelectedSquare(null);
          setOptionSquares({});
      }
  };

  const onSquareClick = (square: Square) => {
    if (isGameOver) return;
    if (!isViewingLatest) { setViewIndex(moveHistory.length); return; }

    if (selectedSquare === square) { setSelectedSquare(null); setOptionSquares({}); return; }

    const moveOptions = Object.keys(optionSquares);
    if (selectedSquare && moveOptions.includes(square)) {
        const piece = game.get(selectedSquare);
        if (piece) {
            const isPawn = piece.type === 'p';
            const isLastRank = (piece.color === 'w' && square[1] === '8') || (piece.color === 'b' && square[1] === '1');
            
            if (isPawn && isLastRank) {
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
      
      game.move(bestMove.san);
      const newGame = new Chess();
      newGame.loadPgn(game.pgn());
      setGame(newGame);
      setViewIndex(newGame.history().length);
      
      if (bestMove.captured) playSFX('capture'); else playSFX('move');
      checkGameOver(newGame);
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
  const getOpponentProfile = () => {
      if (!isP2P) return { name: "Vantage Bot", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=chess" };
      if (socketGame?.profiles) {
          const oppId = socketGame.players.find((id: string) => id !== user.id);
          return socketGame.profiles[oppId] || { name: "Opponent", avatar: "https://i.pravatar.cc/150?u=opp" };
      }
      return { name: "Opponent", avatar: "https://i.pravatar.cc/150?u=opp" };
  };
  const opponent = getOpponentProfile();

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* ... (Keep UI rendering: Modals, Header, Board, Chat) ... */}
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

        {/* ... (Keep Forfeit/Rules Modal, Header, Turn Indicator, Player Bars, Board, History Controls, Chat) ... */}
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

       {/* Rules Modal */}
       <AnimatePresence>
          {showRulesModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowRulesModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                  <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-royal-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
                      <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
                          <h2 className="text-xl font-bold text-white flex items-center gap-2"><BookOpen size={20} className="text-gold-400"/> Chess Rules</h2>
                          <button onClick={() => setShowRulesModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                      </div>
                      <div className="overflow-y-auto space-y-4 text-sm text-slate-300 pr-2 custom-scrollbar">
                          <section>
                              <h3 className="text-white font-bold mb-1">Objective</h3>
                              <p>Checkmate the opponent's King. If the King is under attack (Check) and cannot escape, it is Checkmate.</p>
                          </section>
                          <section>
                              <h3 className="text-white font-bold mb-1">Time Control</h3>
                              <p>Each player has 10 minutes. If your time runs out, you lose (unless opponent has insufficient material).</p>
                          </section>
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
                <span className="ml-2 text-xs opacity-75">({game.turn() === 'w' ? 'White' : 'Black'})</span>
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
                        if (isViewingLatest && moveHistory.length > 0) {
                            const hist = displayGame.history({ verbose: true });
                            const lastMoveDetails = hist?.[hist.length - 1];
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

        {/* History Controls */}
        <div className="flex items-center justify-between w-full max-w-sm gap-2 bg-royal-800/50 p-2 rounded-xl border border-white/5">
            <button 
                onClick={() => setViewIndex(0)} 
                disabled={viewIndex === 0} 
                className="p-3 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors text-slate-300 hover:text-white"
            >
                <ChevronsLeft size={20} />
            </button>
            <button 
                onClick={() => setViewIndex(v => Math.max(0, v - 1))} 
                disabled={viewIndex === 0} 
                className="p-3 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors text-slate-300 hover:text-white"
            >
                <ChevronLeft size={20} />
            </button>
            
            <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Moves</span>
                <span className="text-sm font-mono text-white font-bold">
                    {viewIndex} <span className="text-slate-500">/</span> {moveHistory.length}
                </span>
            </div>

            <button 
                onClick={() => setViewIndex(v => Math.min(moveHistory.length, v + 1))} 
                disabled={isViewingLatest} 
                className="p-3 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors text-slate-300 hover:text-white"
            >
                <ChevronRight size={20} />
            </button>
            <button 
                onClick={() => setViewIndex(moveHistory.length)} 
                disabled={isViewingLatest} 
                className="p-3 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors text-slate-300 hover:text-white"
            >
                <ChevronsRight size={20} />
            </button>
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
