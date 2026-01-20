
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Shield, Trophy, AlertTriangle, Crown, Brain, Clock } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';
import { Chess } from 'chess.js';

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

const ChessTimer = ({ time, isActive, label }: { time: number, isActive: boolean, label: string }) => (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl border transition-colors duration-300 ${isActive ? 'bg-gold-500/20 border-gold-500 text-gold-400 animate-pulse shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'bg-black/30 border-white/10 text-slate-500'}`}>
        <span className="text-[10px] uppercase font-bold tracking-wider mb-1 opacity-70">{label}</span>
        <div className="flex items-center gap-2">
            <Clock size={16} />
            <span className="font-mono font-bold text-xl leading-none">{formatTime(time)}</span>
        </div>
    </div>
);

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [game, setGame] = useState(new Chess());
  const [board, setBoard] = useState(game.board());
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [isBotGame, setIsBotGame] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  
  // Timer State (10 mins = 600s)
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });
  
  const isP2P = !!socket && !!socketGame;

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

          // Sync Game State from FEN
          if (socketGame.fen) {
              const newGame = new Chess(socketGame.fen);
              setGame(newGame);
              setBoard(newGame.board());
              
              // Check Game Over from synced state
              if (newGame.isGameOver()) {
                  setIsGameOver(true);
                  if (newGame.isCheckmate()) {
                      // Winner is the side who just moved (not current turn)
                      // If turn is White, Black won.
                      const winnerColor = newGame.turn() === 'w' ? 'b' : 'w';
                      const winnerId = winnerColor === 'w' ? socketGame.players[0] : socketGame.players[1];
                      if (winnerId === user.id) onGameEnd('win');
                      else onGameEnd('loss');
                  } else if (newGame.isDraw() || newGame.isStalemate()) {
                      onGameEnd('quit'); // Treat as draw/quit for now
                  }
              }
          }

          // Sync Timers
          if (socketGame.timers && socketGame.players) {
              setTimeRemaining({
                  w: socketGame.timers[socketGame.players[0]] || 600,
                  b: socketGame.timers[socketGame.players[1]] || 600
              });
          }

          // Legacy winner check (e.g. from timeout)
          if (socketGame.winner) {
              setIsGameOver(true);
              if (socketGame.winner === user.id) onGameEnd('win');
              else onGameEnd('loss');
          }
      }
  }, [socketGame?.fen, socketGame?.winner, user.id, isP2P, table]);

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
          if (isP2P && socket) socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'TIMEOUT_CLAIM' } });
          onGameEnd('loss');
      } else {
          playSFX('win');
          onGameEnd('win');
      }
  };

  const getMoveOptions = (square: string) => {
    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: any = {};
    moves.map((move) => {
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

  const onSquareClick = (square: string) => {
    if (isGameOver) return;

    // 1. If trying to move to a square (completing a move)
    const moveOptions = Object.keys(optionSquares);
    if (selectedSquare && moveOptions.includes(square)) {
        
        // Execute Move
        try {
            const move = game.move({
                from: selectedSquare,
                to: square,
                promotion: 'q', // Always promote to queen for simplicity in MVP
            });

            if (move) {
                // Local Update
                setGame(new Chess(game.fen()));
                setBoard(game.board());
                setSelectedSquare(null);
                setOptionSquares({});
                
                // Sound
                if (move.captured) playSFX('capture');
                else playSFX('move');

                if (game.inCheck()) playSFX('notification'); // Check sound

                // P2P Sync
                if (isP2P && socket && socketGame) {
                    const nextUserId = socketGame.players[game.turn() === 'w' ? 0 : 1];
                    let winnerId = null;
                    
                    if (game.isGameOver()) {
                        if (game.isCheckmate()) {
                            winnerId = user.id;
                            playSFX('win');
                            onGameEnd('win');
                        } else {
                            // Draw conditions
                            onGameEnd('quit'); 
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
                                fen: game.fen(),
                                turn: nextUserId,
                                winner: winnerId,
                                timers: updatedTimers
                            }
                        }
                    });
                } else if (isBotGame) {
                    // Bot Move
                    if (!game.isGameOver()) {
                        setTimeout(makeBotMove, 500);
                    }
                }
            }
        } catch(e) {
            console.error(e);
            setSelectedSquare(null);
            setOptionSquares({});
        }
        return;
    }

    // 2. Selecting a piece
    if (game.get(square as any)) {
        // Can only select own pieces
        if (game.get(square as any).color !== myColor) return;
        
        // Can only select if it's my turn
        if (game.turn() !== myColor) return;

        setSelectedSquare(square);
        getMoveOptions(square);
        playSFX('click');
    } else {
        // Deselect if clicking empty square
        setSelectedSquare(null);
        setOptionSquares({});
    }
  };

  const makeBotMove = () => {
      const possibleMoves = game.moves();
      if (game.isGameOver() || game.isDraw() || possibleMoves.length === 0) return;
      
      const randomIndex = Math.floor(Math.random() * possibleMoves.length);
      game.move(possibleMoves[randomIndex]);
      
      setGame(new Chess(game.fen()));
      setBoard(game.board());
      
      playSFX('move');
      if (game.inCheck()) playSFX('notification');
      if (game.isCheckmate()) {
          setIsGameOver(true);
          onGameEnd('loss');
          playSFX('loss');
      }
  };

  // Render Helpers
  const getPieceComponent = (piece: { type: string, color: string } | null) => {
      if (!piece) return null;
      // Use unicode characters
      const symbolMap: Record<string, string> = {
          p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚'
      };
      
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

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
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

       {/* TIMERS */}
       <div className="w-full max-w-[600px] flex justify-between mb-4">
           <ChessTimer 
                label={myColor === 'w' ? "Black (Opponent)" : "White (Opponent)"} 
                time={myColor === 'w' ? timeRemaining.b : timeRemaining.w} 
                isActive={game.turn() !== myColor} 
           />
           <ChessTimer 
                label={myColor === 'w' ? "White (You)" : "Black (You)"} 
                time={myColor === 'w' ? timeRemaining.w : timeRemaining.b} 
                isActive={game.turn() === myColor} 
           />
       </div>

       {/* Board */}
       <div className="relative w-full max-w-[600px] aspect-square bg-[#1a103c] rounded-xl shadow-2xl p-1 md:p-2 border-4 border-royal-800 transition-transform duration-700">
            <div className={`w-full h-full grid grid-cols-8 grid-rows-8 border border-white/10`}>
                {board.map((row, rowIndex) => 
                    row.map((piece, colIndex) => {
                        // Logic to handle board flipping
                        const r = myColor === 'w' ? rowIndex : 7 - rowIndex;
                        const c = myColor === 'w' ? colIndex : 7 - colIndex;
                        
                        // We need to map visual grid index to algebraic notation (e.g., 'e4')
                        // chess.js board() returns board[0][0] as 'a8'.
                        // row 0 = rank 8, col 0 = file a.
                        
                        const actualRow = myColor === 'w' ? rowIndex : 7 - rowIndex;
                        const actualCol = myColor === 'w' ? colIndex : 7 - colIndex;
                        const visualPiece = board[actualRow][actualCol]; // Get piece at logic coord

                        const file = ['a','b','c','d','e','f','g','h'][actualCol];
                        const rank = 8 - actualRow;
                        const square = `${file}${rank}`;

                        const isDark = (actualRow + actualCol) % 2 === 1;
                        const option = optionSquares[square];

                        return (
                            <div 
                                key={square}
                                onClick={() => onSquareClick(square)}
                                className={`
                                    relative flex items-center justify-center 
                                    ${isDark ? 'bg-royal-900/60' : 'bg-slate-300/10'}
                                    ${selectedSquare === square ? 'ring-inset ring-4 ring-gold-500/50' : ''}
                                    cursor-pointer
                                `}
                            >
                                {/* Move Hint / Highlight */}
                                {option && (
                                    <div 
                                        className="absolute inset-0 z-10 pointer-events-none"
                                        style={{ background: option.background }}
                                    />
                                )}

                                {getPieceComponent(visualPiece)}
                                
                                {/* Coords (optional, for learning) */}
                                {(actualCol === 0 && myColor === 'w') || (actualCol === 7 && myColor === 'b') ? (
                                    <span className="absolute top-0.5 left-0.5 text-[8px] text-slate-500 font-mono">{rank}</span>
                                ) : null}
                                {(actualRow === 7 && myColor === 'w') || (actualRow === 0 && myColor === 'b') ? (
                                    <span className="absolute bottom-0.5 right-0.5 text-[8px] text-slate-500 font-mono">{file}</span>
                                ) : null}
                            </div>
                        );
                    })
                )}
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
