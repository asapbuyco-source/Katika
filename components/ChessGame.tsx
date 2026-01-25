
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Clock, RotateCcw } from 'lucide-react';
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

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [game, setGame] = useState(new Chess());
  const [viewIndex, setViewIndex] = useState<number>(0);
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [isBotGame, setIsBotGame] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [endGameReason, setEndGameReason] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{from: Square, to: Square} | null>(null);
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });
  
  // Ref to track the last applied PGN to prevent unnecessary re-renders/resets
  const prevPgnRef = useRef(""); 

  const isP2P = !!socket && !!socketGame;

  // Derived state for display (history browsing)
  const moveHistory = game.history();
  
  const displayGame = useMemo(() => {
      if (viewIndex === moveHistory.length) return game;
      const tempGame = new Chess();
      for (let i = 0; i < viewIndex; i++) {
          tempGame.move(moveHistory[i]);
      }
      return tempGame;
  }, [game, viewIndex, moveHistory]);

  const board = displayGame.board();
  const isViewingLatest = viewIndex === moveHistory.length;

  const checkGameOver = useCallback((currentGameState: Chess) => {
      if (currentGameState.isGameOver()) {
          setIsGameOver(true);
          if (currentGameState.isCheckmate()) {
              const winnerColor = currentGameState.turn() === 'w' ? 'b' : 'w';
              const isWinner = winnerColor === myColor;
              setEndGameReason(isWinner ? "Checkmate! You Won!" : "Checkmate! You Lost.");
              playSFX(isWinner ? 'win' : 'loss');
              
              // In P2P, server handles the 'win' event usually, but we trigger local UI
              if (!isP2P) { 
                  setTimeout(() => onGameEnd(isWinner ? 'win' : 'loss'), 2000);
              }
          } else {
              setEndGameReason("Draw / Stalemate");
              setTimeout(() => onGameEnd('quit'), 2000);
          }
      }
  }, [myColor, isP2P, onGameEnd]);

  // Bot Logic - Wrapped in useCallback to prevent stale closures
  const makeBotMove = useCallback((currentGame: Chess) => {
      if (currentGame.isGameOver() || currentGame.turn() === myColor) return;
      const moves = currentGame.moves();
      if (moves.length > 0) {
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          try {
              currentGame.move(randomMove);
              const newGame = new Chess(currentGame.fen()); 
              setGame(newGame);
              setViewIndex(newGame.history().length);
              playSFX('move');
              checkGameOver(newGame);
          } catch (e) { console.error("Bot move failed", e); }
      }
  }, [myColor, checkGameOver]);

  // Timer logic
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

  // Sync / Init logic
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

          const serverPgn = socketGame.gameState?.pgn || "";
          
          // Only update if the server state is different from what we last processed
          if (serverPgn !== prevPgnRef.current) {
              const newGame = new Chess();
              try {
                  if (serverPgn) newGame.loadPgn(serverPgn);
                  
                  // Only update state if it's actually a new move (length check or content check)
                  if (newGame.history().length !== game.history().length || serverPgn !== game.pgn()) {
                      setGame(newGame);
                      prevPgnRef.current = serverPgn;
                      
                      // Auto-scroll to latest move
                      setViewIndex(newGame.history().length);
                      
                      // Play sound based on last move
                      const history = newGame.history({ verbose: true });
                      const lastMove = history[history.length - 1];
                      if (lastMove) {
                          if (lastMove.color !== myColor) { // Only play sound for opponent moves here
                              playSFX(lastMove.captured ? 'capture' : 'move');
                          }
                      }
                      
                      checkGameOver(newGame);
                  }
              } catch (e) { 
                  console.warn("PGN load error", e); 
              }
          }

          if (socketGame.winner && !isGameOver) {
              setIsGameOver(true);
              const amIWinner = socketGame.winner === user.id;
              setEndGameReason(amIWinner ? "Victory by Resignation/Timeout" : "Defeat");
              playSFX(amIWinner ? 'win' : 'loss');
              setTimeout(() => onGameEnd(amIWinner ? 'win' : 'loss'), 3000);
          }
      }
  }, [socketGame, user.id, isP2P, checkGameOver, myColor, game, onGameEnd]);

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
          // Use current game state to avoid stale closure
          if (game.turn() !== myColor) return;

          const moveResult = game.move({ from, to, promotion: promotion || 'q' });
          if (moveResult) {
              // Valid move
              const newPgn = game.pgn();
              const newFen = game.fen();
              
              // Force new instance for React state detection
              const newGame = new Chess();
              newGame.loadPgn(newPgn);
              
              setGame(newGame);
              prevPgnRef.current = newPgn;
              setViewIndex(newGame.history().length);
              setSelectedSquare(null);
              setOptionSquares({});
              
              playSFX(moveResult.captured ? 'capture' : 'move');
              checkGameOver(newGame);

              if (isP2P && socket && socketGame) {
                  socket.emit('game_action', {
                      roomId: socketGame.roomId,
                      action: {
                          type: 'MOVE',
                          pgn: newPgn,
                          fen: newFen,
                          move: { from, to, promotion: promotion || 'q' } 
                      }
                  });
              } else if (isBotGame && !newGame.isGameOver()) {
                  // Pass the updated game instance to the bot
                  setTimeout(() => makeBotMove(newGame), 800);
              }
          }
      } catch (e) {
          console.error("Move execution failed", e);
          setSelectedSquare(null);
          setOptionSquares({});
      }
  };

  const onSquareClick = (square: Square) => {
    if (isGameOver) return;
    if (!isViewingLatest) { setViewIndex(moveHistory.length); return; }

    // Deselect if clicking same square
    if (selectedSquare === square) { setSelectedSquare(null); setOptionSquares({}); return; }

    // If clicking a move option for the selected piece
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

    // Select a piece
    const clickedPiece = game.get(square);
    if (clickedPiece) {
        if (clickedPiece.color !== myColor) return; // Can't select opponent pieces
        if (game.turn() !== myColor) return; // Can't select if not my turn
        
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

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4 relative">
        {/* Promotion Modal */}
        <AnimatePresence>
            {pendingPromotion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-royal-900 border border-gold-500 rounded-xl p-4 flex gap-4">
                        {['q', 'r', 'b', 'n'].map(p => (
                            <button key={p} onClick={() => handlePromotionSelect(p)} className="p-4 bg-white/10 hover:bg-white/20 rounded-lg">
                                <img src={`https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${myColor}${p}.svg`} className="w-12 h-12" />
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

        {/* Opponent Info */}
        <div className="w-full max-w-[600px] flex justify-between items-center mb-2 px-2">
            <div className="flex items-center gap-2">
                <img src={table.host?.id === user.id ? table.guest?.avatar : table.host?.avatar || "https://i.pravatar.cc/150"} className="w-8 h-8 rounded-full border border-white/20" />
                <span className="text-sm font-bold text-slate-300">{table.host?.id === user.id ? table.guest?.name : table.host?.name || "Opponent"}</span>
            </div>
            <div className={`px-3 py-1 rounded bg-black/40 text-xs font-mono font-bold ${game.turn() !== myColor ? 'text-white border border-white/20' : 'text-slate-500'}`}>
                <Clock size={12} className="inline mr-1" /> {formatTime(timeRemaining[myColor === 'w' ? 'b' : 'w'])}
            </div>
        </div>

        {/* Board */}
        <div className="relative w-full max-w-[600px] aspect-square bg-royal-900 rounded-lg shadow-2xl overflow-hidden border-4 border-royal-800 select-none">
            <div className="w-full h-full grid grid-cols-8 grid-rows-8">
                {board.map((row, r) => 
                    row.map((piece, c) => {
                        // Flip board if playing black so my pieces are at bottom
                        const actualR = myColor === 'w' ? r : 7 - r;
                        const actualC = myColor === 'w' ? c : 7 - c;
                        
                        const square = String.fromCharCode(97 + actualC) + (8 - actualR) as Square;
                        const isDark = (actualR + actualC) % 2 === 1;
                        const p = board[actualR][actualC]; 
                        
                        return (
                            <div 
                                key={square} 
                                onClick={() => onSquareClick(square)}
                                className={`relative flex items-center justify-center ${isDark ? 'bg-[#779556]' : 'bg-[#ebecd0]'}`}
                            >   
                                {/* Move Hint / Highlight */}
                                {(optionSquares[square] || selectedSquare === square) && (
                                    <div 
                                        className="absolute inset-0 z-0" 
                                        style={optionSquares[square] || { background: 'rgba(255, 255, 0, 0.5)' }} 
                                    />
                                )}

                                {/* Piece - Removed layoutId for stability */}
                                {p && (
                                    <img 
                                        src={`https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${p.color}${p.type}.svg`}
                                        className="w-[90%] h-[90%] z-10 select-none cursor-pointer"
                                    />
                                )}
                                
                                {/* Coordinates */}
                                {actualC === 0 && <span className={`absolute top-0 left-0.5 text-[10px] font-bold ${isDark ? 'text-[#ebecd0]' : 'text-[#779556]'}`}>{8 - actualR}</span>}
                                {actualR === 7 && <span className={`absolute bottom-0 right-0.5 text-[10px] font-bold ${isDark ? 'text-[#ebecd0]' : 'text-[#779556]'}`}>{String.fromCharCode(97 + actualC)}</span>}
                            </div>
                        );
                    })
                )}
            </div>
            
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
            <div className="flex items-center gap-2">
                <img src={user.avatar} className="w-8 h-8 rounded-full border-2 border-gold-500" />
                <span className="text-sm font-bold text-white">You</span>
            </div>
            <div className={`px-3 py-1 rounded bg-black/40 text-xs font-mono font-bold ${game.turn() === myColor ? 'text-gold-400 border border-gold-500' : 'text-slate-500'}`}>
                <Clock size={12} className="inline mr-1" /> {formatTime(timeRemaining[myColor])}
            </div>
        </div>

        {/* History Controls */}
        <div className="w-full max-w-[600px] mt-4 flex justify-center gap-4">
            <button 
                onClick={() => setViewIndex(Math.max(0, viewIndex - 1))}
                disabled={viewIndex === 0}
                className="p-3 rounded-full bg-royal-800 disabled:opacity-30 hover:bg-royal-700 transition-colors"
            >
                <ArrowLeft size={16} />
            </button>
            <button 
                onClick={() => setViewIndex(moveHistory.length)}
                disabled={isViewingLatest}
                className="p-3 rounded-full bg-royal-800 disabled:opacity-30 hover:bg-royal-700 transition-colors"
            >
                <RotateCcw size={16} />
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
