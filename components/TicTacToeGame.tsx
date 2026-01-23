import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Shield, AlertTriangle, X, Circle, RotateCcw, Clock, Cpu, RefreshCw, Settings, ChevronDown, Wifi, Loader2 } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';

interface TicTacToeGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

type CellValue = 'X' | 'O' | null;
type WinningLine = number[] | null;
type Difficulty = 'Easy' | 'Medium' | 'Hard';

const TURN_DURATION = 15; // Seconds

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true); // X always goes first
  const [winner, setWinner] = useState<CellValue>(null);
  const [winningLine, setWinningLine] = useState<WinningLine>(null);
  const [isDraw, setIsDraw] = useState(false);
  const [drawStreak, setDrawStreak] = useState(0); 
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(TURN_DURATION);

  // Player assignments
  const isP2P = !!socket && !!socketGame;
  const isHost = table.host?.id === user.id || (isP2P && socketGame.players[0] === user.id);
  const mySymbol: CellValue = isHost ? 'X' : 'O'; // Host/Player1 is X
  const isMyTurn = (isXNext && mySymbol === 'X') || (!isXNext && mySymbol === 'O');
  const isBotGame = !isP2P && (table.guest?.id === 'bot' || table.host?.id === 'bot');

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // --- SOCKET SYNC ---
  useEffect(() => {
      if (isP2P && socketGame) {
          if (socketGame.board) {
              setBoard(socketGame.board);
              
              // Determine turn from backend or deduce from board state
              // Backend 'turn' holds userId.
              const isPlayer1Turn = socketGame.turn === socketGame.players[0];
              setIsXNext(isPlayer1Turn);
          }

          if (socketGame.winner) {
              // Convert userId winner to Symbol
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
              // Auto-restart handled by backend state reset usually, 
              // but for now visual feedback only
          } else {
              // Reset if new round started
              if (socketGame.board.every((c: any) => c === null) && (winner || isDraw)) {
                  setWinner(null);
                  setIsDraw(false);
              }
          }
      }
  }, [socketGame, user.id, isP2P]);

  // --- GAME LOOP & TIMER ---
  useEffect(() => {
      if (winner || isDraw) return;

      // Reset timer on turn switch
      setTimeLeft(TURN_DURATION);

      const timer = setInterval(() => {
          setTimeLeft((prev) => {
              if (prev <= 1) {
                  clearInterval(timer);
                  // In P2P, server handles timeout usually, but we can show local alert
                  if (!isP2P) handleTimeout();
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);

      return () => clearInterval(timer);
  }, [isXNext, winner, isDraw, board]); // Reset on board change (move made)

  const handleTimeout = () => {
      playSFX('error');
      if (isMyTurn) {
          addLog("Time Expired! You lost.", "alert");
          onGameEnd('loss');
      } else {
          addLog("Opponent Time Expired!", "secure");
          onGameEnd('win');
      }
  };

  // --- BOT LOGIC (LOCAL ONLY) ---
  useEffect(() => {
      if (isBotGame && !isMyTurn && !winner && !isDraw) {
          const delay = Math.random() * 1000 + 500;
          const timeout = setTimeout(() => makeBotMove(board), delay);
          return () => clearTimeout(timeout);
      }
  }, [isBotGame, isMyTurn, board, winner, isDraw, difficulty]);

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
    if (board[index] || winner || isDraw || !isMyTurn) return;

    if (isP2P && socket) {
        // Emit move to server
        socket.emit('game_action', { 
            roomId: socketGame.roomId, 
            action: { type: 'MOVE', index } 
        });
        playSFX('click'); // Feedback immediately
    } else {
        // Local processing
        processMove(index, mySymbol);
    }
  };

  const processMove = (index: number, symbol: CellValue) => {
      const newBoard = [...board];
      newBoard[index] = symbol;
      setBoard(newBoard);
      playSFX(symbol === mySymbol ? 'click' : 'move');
      
      const result = checkWinnerLocal(newBoard);
      if (result) {
          setWinner(result.winner);
          setWinningLine(result.line);
          if (result.winner === mySymbol) {
              playSFX('win');
              addLog("Victory Secured!", "secure");
              setTimeout(() => onGameEnd('win'), 2500);
          } else {
              playSFX('loss');
              addLog("Defeat.", "alert");
              setTimeout(() => onGameEnd('loss'), 2500);
          }
      } else if (!newBoard.includes(null)) {
          const nextStreak = drawStreak + 1;
          setDrawStreak(nextStreak);
          setIsDraw(true); 

          if (nextStreak >= 3) {
              playSFX('loss');
              addLog("3rd Draw. Match Ended.", "alert");
              setTimeout(() => onGameEnd('quit'), 2500);
          } else {
              playSFX('notification');
              addLog(`Draw! Rematch (${nextStreak}/3)...`, "scanning");
              setTimeout(() => {
                  setBoard(Array(9).fill(null));
                  setWinner(null);
                  setWinningLine(null);
                  setIsDraw(false);
                  setIsXNext(prev => !prev);
              }, 2000);
          }
      } else {
          setIsXNext(!isXNext);
      }
  };

  // --- BOT LOGIC (OMITTED FOR BREVITY, SAME AS BEFORE) ---
  const getEmptyIndices = (squares: CellValue[]) => squares.map((val, idx) => val === null ? idx : null).filter(val => val !== null) as number[];
  
  const makeBotMove = (currentBoard: CellValue[]) => {
      const emptyIndices = getEmptyIndices(currentBoard);
      if (emptyIndices.length === 0) return;
      const targetIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)]; // Simple random for now
      processMove(targetIndex, mySymbol === 'X' ? 'O' : 'X');
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* FORFEIT MODAL */}
        <AnimatePresence>
          {showForfeitModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowForfeitModal(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-royal-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl overflow-hidden"
                  >
                      <div className="flex flex-col items-center text-center mb-6">
                          <AlertTriangle className="text-red-500 mb-4" size={32} />
                          <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                          <p className="text-sm text-slate-400">
                              Leaving now will result in an <span className="text-red-400 font-bold">immediate loss</span>.
                          </p>
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => setShowForfeitModal(false)} className="flex-1 py-3 bg-white/5 rounded-xl text-slate-300 font-bold">Cancel</button>
                          <button onClick={() => onGameEnd('quit')} className="flex-1 py-3 bg-red-600 rounded-xl text-white font-bold">Forfeit</button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

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
            {/* Player 1 (Left) */}
            <div className={`flex flex-col items-center gap-2 transition-all duration-300 ${isXNext ? 'scale-110 opacity-100' : 'opacity-60 grayscale'}`}>
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-gold-500 overflow-hidden shadow-[0_0_20px_gold]">
                        <img src={user.avatar} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-royal-900 rounded-full border-2 border-gold-500 p-1">
                        {/* If I am Host (Player 1), I am X */}
                        {isHost ? <X size={14} className="text-gold-400" strokeWidth={4} /> : <Circle size={14} className="text-gold-400" strokeWidth={4} />}
                    </div>
                </div>
                <span className="text-sm font-bold text-white">You</span>
                {isXNext && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${timeLeft <= 5 ? 'bg-red-500 text-white animate-pulse' : 'bg-gold-500 text-black'}`}>
                        <Clock size={10} /> {timeLeft}s
                    </div>
                )}
            </div>

            {/* VS Divider */}
            <div className="flex flex-col items-center">
                <div className="text-2xl font-black text-slate-700 italic select-none">VS</div>
                {isP2P && !isMyTurn && !winner && !isDraw && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500 bg-black/20 px-2 py-1 rounded-full">
                        <Loader2 size={10} className="animate-spin" /> Waiting...
                    </div>
                )}
            </div>

            {/* Player 2 (Right) */}
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
                {!isXNext && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${timeLeft <= 5 ? 'bg-red-500 text-white animate-pulse' : 'bg-purple-500 text-white'}`}>
                        <Clock size={10} /> {timeLeft}s
                    </div>
                )}
            </div>
        </div>

        {/* Game Board */}
        <div className="relative bg-royal-800/80 p-4 rounded-3xl border-4 border-royal-700 shadow-2xl backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-3">
                {board.map((cell, idx) => (
                    <motion.button
                        key={idx}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleCellClick(idx)}
                        disabled={cell !== null || winner !== null || isDraw || (isP2P && !isMyTurn)}
                        className={`
                            w-24 h-24 rounded-xl flex items-center justify-center text-5xl relative overflow-hidden shadow-inner border border-white/5 transition-colors
                            ${cell === null && isMyTurn && !winner && !isDraw ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}
                            ${winningLine?.includes(idx) ? (winner === 'X' ? 'bg-gold-500/20 border-gold-500' : 'bg-purple-500/20 border-purple-500') : 'bg-royal-950'}
                        `}
                    >
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

    </div>
  );
};