
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, X, Circle, Clock, Loader2, Wifi, Cpu } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameTimer } from './GameTimer';
import { TurnIndicator } from './TurnIndicator';
import { ForfeitModal } from './ForfeitModal';

interface TicTacToeGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

type CellValue = 'X' | 'O' | null;
type WinningLine = number[] | null;

const TURN_DURATION = 15; 

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true); 
  const [winner, setWinner] = useState<CellValue>(null);
  const [winningLine, setWinningLine] = useState<WinningLine>(null);
  const [isDraw, setIsDraw] = useState(false);
  const [drawStreak, setDrawStreak] = useState(0); 
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [timeLeft, setTimeLeft] = useState(TURN_DURATION);
  const [isProcessingMove, setIsProcessingMove] = useState(false);

  const isP2P = !!socket && !!socketGame;
  const isHost = table.host?.id === user.id || (isP2P && socketGame.players[0] === user.id);
  const mySymbol: CellValue = isHost ? 'X' : 'O'; 
  const isMyTurn = (isXNext && mySymbol === 'X') || (!isXNext && mySymbol === 'O');
  const isBotGame = !isP2P && (table.guest?.id === 'bot' || table.host?.id === 'bot');

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  useEffect(() => {
      if (isP2P && socketGame) {
          const serverBoard = socketGame.gameState?.board;
          if (serverBoard) setBoard(serverBoard);
          
          if (socketGame.turn) setIsXNext(socketGame.turn === socketGame.players[0]);
          
          if (socketGame.winner) {
              const winSymbol = socketGame.winner === socketGame.players[0] ? 'X' : 'O';
              setWinner(winSymbol);
              if (socketGame.winner === user.id) {
                  playSFX('win');
                  addLog("Victory Secured!", "secure");
                  setTimeout(() => onGameEnd('win'), 2500);
              } else {
                  playSFX('loss');
                  addLog("Defeat.", "alert");
                  setTimeout(() => onGameEnd('loss'), 2500);
              }
          } else if (socketGame.status === 'draw') {
              setIsDraw(true);
              playSFX('notification');
              addLog("Draw! Rematch...", "scanning");
          } else {
              if (serverBoard && serverBoard.every((c: any) => c === null) && (winner || isDraw)) {
                  setWinner(null);
                  setIsDraw(false);
                  setIsXNext(true); 
              }
          }
      }
  }, [socketGame, user.id, isP2P]);

  useEffect(() => {
      if (winner || isDraw) return;
      
      setTimeLeft(TURN_DURATION);
      let timeoutId: any;

      const timer = setInterval(() => {
          setTimeLeft((prev) => {
              if (prev <= 1) {
                  clearInterval(timer);
                  timeoutId = setTimeout(() => !isP2P && handleTimeout(), 0);
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);

      return () => {
          clearInterval(timer);
          if (timeoutId) clearTimeout(timeoutId);
      };
  }, [isXNext, winner, isDraw]);

  const handleTimeout = () => {
      if (winner || isDraw) return; 
      playSFX('error');
      if (isMyTurn) {
          addLog("Time Expired! You lost.", "alert");
          onGameEnd('loss');
      } else {
          addLog("Opponent Time Expired!", "secure");
          onGameEnd('win');
      }
  };

  const makeBotMove = useCallback((currentBoard: CellValue[]) => {
      if (winner || isDraw) return; 
      const emptyIndices = currentBoard.map((val, idx) => val === null ? idx : null).filter(val => val !== null) as number[];
      if (emptyIndices.length === 0) return;
      const targetIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)]; 
      processMove(targetIndex, mySymbol === 'X' ? 'O' : 'X');
  }, [winner, isDraw, mySymbol]);

  useEffect(() => {
      if (isBotGame && !isMyTurn && !winner && !isDraw) {
          const delay = Math.random() * 1000 + 500;
          const timeout = setTimeout(() => makeBotMove(board), delay);
          return () => clearTimeout(timeout);
      }
  }, [isBotGame, isMyTurn, board, winner, isDraw, makeBotMove]);

  const checkWinnerLocal = (squares: CellValue[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a], line: lines[i] };
      }
    }
    return null;
  };

  const handleCellClick = (index: number) => {
    if (board[index] || winner || isDraw || !isMyTurn || isProcessingMove) return;

    if (isP2P && socket) {
        setIsProcessingMove(true);
        socket.emit('game_action', { 
            roomId: socketGame.roomId, 
            action: { type: 'MOVE', index } 
        });
        playSFX('click');
        setTimeout(() => setIsProcessingMove(false), 500);
    } else {
        processMove(index, mySymbol);
    }
  };

  const processMove = (index: number, symbol: CellValue) => {
      setBoard(prevBoard => {
          const newBoard = [...prevBoard];
          newBoard[index] = symbol;
          
          playSFX(symbol === mySymbol ? 'click' : 'move');
          
          const result = checkWinnerLocal(newBoard);
          if (result) {
              setWinner(result.winner);
              setWinningLine(result.line);
              if (result.winner === mySymbol) {
                  playSFX('win');
                  setTimeout(() => onGameEnd('win'), 2500);
              } else {
                  playSFX('loss');
                  setTimeout(() => onGameEnd('loss'), 2500);
              }
          } else if (!newBoard.includes(null)) {
              if (isP2P && socket) {
                  socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'DRAW_ROUND' } });
              } else {
                  const nextStreak = drawStreak + 1;
                  setDrawStreak(nextStreak);
                  setIsDraw(true); 
                  if (nextStreak >= 3) {
                      playSFX('loss');
                      setTimeout(() => onGameEnd('quit'), 2500);
                  } else {
                      playSFX('notification');
                      setTimeout(() => {
                          setBoard(Array(9).fill(null));
                          setWinner(null);
                          setWinningLine(null);
                          setIsDraw(false);
                          setIsXNext(prev => !prev);
                      }, 2000);
                  }
              }
          } else {
              setIsXNext(prev => !prev);
          }
          
          return newBoard;
      });
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Header */}
        <div className="w-full max-w-lg flex justify-between items-center mb-8 mt-4">
             <button onClick={() => setShowForfeitModal(true)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
             </button>
             <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                     {isP2P && <Wifi size={12} className="animate-pulse" />} Pot Size
                 </div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
             </div>
             <div className="w-32 hidden md:block">
                 <AIReferee externalLog={refereeLog} />
             </div>
        </div>

        {/* Players & Timer */}
        <div className="w-full max-w-lg flex justify-between items-center mb-8 px-4">
            <div className={`flex flex-col items-center gap-2 transition-all duration-300 ${isXNext ? 'scale-110 opacity-100' : 'opacity-60 grayscale'}`}>
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-gold-500 overflow-hidden shadow-[0_0_20px_gold]">
                        <img src={user.avatar} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-royal-900 rounded-full border-2 border-gold-500 p-1">
                        {isHost ? <X size={14} className="text-gold-400" strokeWidth={4} /> : <Circle size={14} className="text-gold-400" strokeWidth={4} />}
                    </div>
                </div>
                <span className="text-sm font-bold text-white">You</span>
                {isXNext && <GameTimer seconds={timeLeft} isActive={true} />}
            </div>

            <div className="flex flex-col items-center">
                <div className="text-2xl font-black text-slate-700 italic select-none">VS</div>
                {isP2P && !isMyTurn && !winner && !isDraw && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500 bg-black/20 px-2 py-1 rounded-full">
                        <Loader2 size={10} className="animate-spin" /> Waiting...
                    </div>
                )}
            </div>

            <div className={`flex flex-col items-center gap-2 transition-all duration-300 ${!isXNext ? 'scale-110 opacity-100' : 'opacity-60 grayscale'}`}>
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-purple-500 overflow-hidden shadow-[0_0_20px_purple]">
                        <img src={table.host?.id === user.id ? table.guest?.avatar : table.host?.avatar || "https://i.pravatar.cc/150"} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2 -left-2 bg-royal-900 rounded-full border-2 border-purple-500 p-1">
                        {!isHost ? <X size={14} className="text-purple-400" strokeWidth={4} /> : <Circle size={14} className="text-purple-400" strokeWidth={4} />}
                    </div>
                </div>
                <span className="text-sm font-bold text-white">{table.host?.id === user.id ? table.guest?.name : table.host?.name || "Opponent"}</span>
                {!isXNext && <GameTimer seconds={timeLeft} isActive={true} />}
            </div>
        </div>

        {/* Game Board */}
        <div className="relative bg-royal-800/80 p-4 rounded-3xl border-4 border-royal-700 shadow-2xl backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-3">
                {board.map((cell, idx) => (
                    <motion.button
                        key={idx}
                        whileTap={{ scale: 0.95 }}
                        whileHover={cell === null && isMyTurn && !winner ? { backgroundColor: 'rgba(255,255,255,0.05)' } : {}}
                        onClick={() => handleCellClick(idx)}
                        disabled={cell !== null || winner !== null || isDraw || (isP2P && !isMyTurn)}
                        className={`
                            w-24 h-24 rounded-xl flex items-center justify-center text-5xl relative overflow-hidden shadow-inner border border-white/5 transition-colors
                            ${cell === null && isMyTurn && !winner && !isDraw ? 'cursor-pointer' : 'cursor-default'}
                            ${winningLine?.includes(idx) ? (winner === 'X' ? 'bg-gold-500/20 border-gold-500' : 'bg-purple-500/20 border-purple-500') : 'bg-royal-950'}
                        `}
                    >
                        {cell === null && isMyTurn && !winner && (
                            <div className="opacity-10 absolute inset-0 flex items-center justify-center pointer-events-none">
                                {mySymbol === 'X' ? <X size={48} /> : <Circle size={48} />}
                            </div>
                        )}
                        <AnimatePresence>
                            {cell === 'X' && (
                                <motion.div
                                    initial={{ scale: 0, rotate: -45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    className="text-gold-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                                >
                                    <X size={64} strokeWidth={2.5} />
                                </motion.div>
                            )}
                            {cell === 'O' && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.6)]"
                                >
                                    <Circle size={56} strokeWidth={3} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.button>
                ))}
            </div>
        </div>

        {/* Status Text */}
        <div className="mt-8 text-center h-12">
            <AnimatePresence mode="wait">
                {winner ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="text-2xl font-black text-white uppercase tracking-widest drop-shadow-md"
                    >
                        {winner === mySymbol ? <span className="text-green-400">You Won!</span> : <span className="text-red-400">Defeat!</span>}
                    </motion.div>
                ) : isDraw ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center gap-1"
                    >
                        <div className="text-2xl font-black text-slate-400 uppercase tracking-widest">Draw!</div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        key={isMyTurn ? 'me' : 'opp'}
                        className={`text-lg font-bold flex items-center gap-2 justify-center ${isMyTurn ? 'text-gold-400' : 'text-slate-500'}`}
                    >
                        {isMyTurn ? (
                            <>Your Turn</>
                        ) : (
                            <>
                                {isBotGame ? <Cpu size={18} className="animate-pulse" /> : <Clock size={18} className="animate-spin" />}
                                {isBotGame ? "AI is thinking..." : "Opponent's turn..."}
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        <ForfeitModal isOpen={showForfeitModal} onClose={() => setShowForfeitModal(false)} onConfirm={() => onGameEnd('quit')} />
    </div>
  );
};
