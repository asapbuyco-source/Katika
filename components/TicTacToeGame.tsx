
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Shield, AlertTriangle, X, Circle, RotateCcw, Clock, Cpu, RefreshCw, Settings, ChevronDown } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';

interface TicTacToeGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

type CellValue = 'X' | 'O' | null;
type WinningLine = number[] | null;
type Difficulty = 'Easy' | 'Medium' | 'Hard';

const TURN_DURATION = 15; // Seconds

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({ table, user, onGameEnd }) => {
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true); // X always goes first
  const [winner, setWinner] = useState<CellValue>(null);
  const [winningLine, setWinningLine] = useState<WinningLine>(null);
  const [isDraw, setIsDraw] = useState(false);
  const [drawStreak, setDrawStreak] = useState(0); // Track consecutive draws
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(TURN_DURATION);

  // Player assignments
  // Host plays X (Yellow), Guest plays O (Purple)
  const isHost = table.host?.id === user.id;
  const mySymbol: CellValue = isHost ? 'X' : 'O';
  const isMyTurn = (isXNext && mySymbol === 'X') || (!isXNext && mySymbol === 'O');
  const isBotGame = table.guest?.id === 'bot' || table.host?.id === 'bot';

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // --- GAME LOOP & TIMER ---
  useEffect(() => {
      if (winner || isDraw) return;

      const timer = setInterval(() => {
          setTimeLeft((prev) => {
              if (prev <= 1) {
                  clearInterval(timer);
                  handleTimeout();
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);

      return () => clearInterval(timer);
  }, [isXNext, winner, isDraw]);

  const handleTimeout = () => {
      playSFX('error');
      if (isMyTurn) {
          addLog("Time Expired! You lost.", "alert");
          onGameEnd('loss'); // I ran out of time
      } else {
          addLog("Opponent Time Expired!", "secure");
          onGameEnd('win'); // Opponent ran out of time
      }
  };

  // --- BOT LOGIC ---
  useEffect(() => {
      if (isBotGame && !isMyTurn && !winner && !isDraw) {
          // Delay for realism
          const delay = Math.random() * 1000 + 500;
          const timeout = setTimeout(() => makeBotMove(board), delay);
          return () => clearTimeout(timeout);
      }
  }, [isBotGame, isMyTurn, board, winner, isDraw, difficulty]);

  const checkWinner = (squares: CellValue[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
      [0, 4, 8], [2, 4, 6]             // Diagonals
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

    processMove(index, mySymbol);
  };

  const processMove = (index: number, symbol: CellValue) => {
      const newBoard = [...board];
      newBoard[index] = symbol;
      setBoard(newBoard);
      playSFX(symbol === mySymbol ? 'click' : 'move');
      
      // Reset Timer for next turn
      setTimeLeft(TURN_DURATION);

      const result = checkWinner(newBoard);
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
          // DRAW DETECTED
          const nextStreak = drawStreak + 1;
          setDrawStreak(nextStreak);
          setIsDraw(true); // Lock board temporarily

          if (nextStreak >= 3) {
              // 3rd Draw - End Game
              playSFX('loss');
              addLog("3rd Draw. Match Ended.", "alert");
              setTimeout(() => onGameEnd('quit'), 2500);
          } else {
              // Soft Draw - Restart
              playSFX('notification');
              addLog(`Draw! Rematch (${nextStreak}/3)...`, "scanning");
              
              // Restart after delay
              setTimeout(() => {
                  setBoard(Array(9).fill(null));
                  setWinner(null);
                  setWinningLine(null);
                  setIsDraw(false);
                  setIsXNext(prev => !prev); // Alternate starter
                  setTimeLeft(TURN_DURATION);
              }, 2000);
          }
      } else {
          setIsXNext(!isXNext);
      }
  };

  // --- AI IMPLEMENTATION ---

  const getEmptyIndices = (squares: CellValue[]) => {
      return squares.map((val, idx) => val === null ? idx : null).filter(val => val !== null) as number[];
  };

  // Minimax Algorithm for Hard Mode
  const minimax = (squares: CellValue[], depth: number, isMaximizing: boolean, aiSymbol: CellValue, playerSymbol: CellValue): number => {
      const result = checkWinner(squares);
      if (result?.winner === aiSymbol) return 10 - depth;
      if (result?.winner === playerSymbol) return depth - 10;
      if (!squares.includes(null)) return 0; // Draw

      if (isMaximizing) {
          let bestScore = -Infinity;
          for (let i = 0; i < squares.length; i++) {
              if (squares[i] === null) {
                  squares[i] = aiSymbol;
                  const score = minimax(squares, depth + 1, false, aiSymbol, playerSymbol);
                  squares[i] = null; // Backtrack
                  bestScore = Math.max(score, bestScore);
              }
          }
          return bestScore;
      } else {
          let bestScore = Infinity;
          for (let i = 0; i < squares.length; i++) {
              if (squares[i] === null) {
                  squares[i] = playerSymbol;
                  const score = minimax(squares, depth + 1, true, aiSymbol, playerSymbol);
                  squares[i] = null; // Backtrack
                  bestScore = Math.min(score, bestScore);
              }
          }
          return bestScore;
      }
  };

  const makeBotMove = (currentBoard: CellValue[]) => {
      const botSymbol = mySymbol === 'X' ? 'O' : 'X';
      const playerSymbol = mySymbol;
      const emptyIndices = getEmptyIndices(currentBoard);

      if (emptyIndices.length === 0) return;

      let targetIndex = -1;

      // --- EASY: PURE RANDOM ---
      if (difficulty === 'Easy') {
          targetIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      } 
      
      // --- MEDIUM: BLOCK/WIN/RANDOM ---
      else if (difficulty === 'Medium') {
          // Helper to find a move that results in a win/block for a specific symbol
          const findCriticalMove = (symbol: CellValue): number => {
              const lines = [
                  [0, 1, 2], [3, 4, 5], [6, 7, 8],
                  [0, 3, 6], [1, 4, 7], [2, 5, 8],
                  [0, 4, 8], [2, 4, 6]
              ];
              for (let line of lines) {
                  const [a, b, c] = line;
                  const values = [currentBoard[a], currentBoard[b], currentBoard[c]];
                  const symbolCount = values.filter(v => v === symbol).length;
                  const emptyCount = values.filter(v => v === null).length;
                  if (symbolCount === 2 && emptyCount === 1) {
                      return line[values.indexOf(null)];
                  }
              }
              return -1;
          };

          // 1. Can AI win now?
          targetIndex = findCriticalMove(botSymbol);
          // 2. Must AI block player win?
          if (targetIndex === -1) targetIndex = findCriticalMove(playerSymbol);
          // 3. Random
          if (targetIndex === -1) targetIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      }

      // --- HARD: MINIMAX ---
      else if (difficulty === 'Hard') {
          let bestScore = -Infinity;
          let bestMove = -1;

          // If first move and center is available, take it (optimization for minimax)
          if (emptyIndices.length >= 8 && currentBoard[4] === null) {
              bestMove = 4;
          } else {
              for (let i = 0; i < currentBoard.length; i++) {
                  if (currentBoard[i] === null) {
                      currentBoard[i] = botSymbol;
                      const score = minimax(currentBoard, 0, false, botSymbol, playerSymbol);
                      currentBoard[i] = null; // Backtrack
                      
                      if (score > bestScore) {
                          bestScore = score;
                          bestMove = i;
                      }
                  }
              }
          }
          targetIndex = bestMove !== -1 ? bestMove : emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      }

      // Execute
      if (targetIndex !== -1) {
          processMove(targetIndex, botSymbol);
      }
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
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
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
                        <img src={isHost ? user.avatar : table.host?.avatar} className="w-full h-full object-cover" />
                    </div>
                    {/* Symbol Badge */}
                    <div className="absolute -bottom-2 -right-2 bg-royal-900 rounded-full border-2 border-gold-500 p-1">
                        <X size={14} className="text-gold-400" strokeWidth={4} />
                    </div>
                </div>
                <span className="text-sm font-bold text-white">{isHost ? "You" : table.host?.name}</span>
                {isXNext && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${timeLeft <= 5 ? 'bg-red-500 text-white animate-pulse' : 'bg-gold-500 text-black'}`}>
                        <Clock size={10} /> {timeLeft}s
                    </div>
                )}
            </div>

            {/* VS Divider */}
            <div className="flex flex-col items-center">
                <div className="text-2xl font-black text-slate-700 italic select-none">VS</div>
                {drawStreak > 0 && (
                    <div className="text-xs font-bold text-slate-500 mt-2 bg-white/5 px-2 py-1 rounded">
                        Draw {drawStreak}/3
                    </div>
                )}
            </div>

            {/* Player 2 (Right) */}
            <div className={`flex flex-col items-center gap-2 transition-all duration-300 ${!isXNext ? 'scale-110 opacity-100' : 'opacity-60 grayscale'}`}>
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-purple-500 overflow-hidden shadow-[0_0_20px_purple]">
                        <img src={!isHost ? user.avatar : (table.guest?.avatar || table.host?.avatar)} className="w-full h-full object-cover" />
                    </div>
                    {/* Symbol Badge */}
                    <div className="absolute -bottom-2 -left-2 bg-royal-900 rounded-full border-2 border-purple-500 p-1">
                        <Circle size={14} className="text-purple-400" strokeWidth={4} />
                    </div>
                </div>
                
                {/* Bot Difficulty Selector or Name */}
                {isBotGame && !isHost ? (
                    <div className="flex flex-col items-center">
                        <span className="text-sm font-bold text-white mb-1">V-Bot</span>
                        <div className="relative group">
                            <button className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                difficulty === 'Hard' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 
                                difficulty === 'Medium' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 
                                'bg-green-500/20 text-green-400 border-green-500/30'
                            }`}>
                                {difficulty} <ChevronDown size={10} />
                            </button>
                            {/* Dropdown */}
                            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-royal-900 border border-white/10 rounded-lg overflow-hidden shadow-xl z-50 hidden group-hover:block w-24">
                                {['Easy', 'Medium', 'Hard'].map((d) => (
                                    <button 
                                        key={d}
                                        onClick={() => setDifficulty(d as Difficulty)}
                                        className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <span className="text-sm font-bold text-white">{!isHost ? "You" : (table.guest?.name || "Opponent")}</span>
                )}

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
                        disabled={cell !== null || winner !== null || isDraw}
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

            {/* Winning Line SVG Overlay */}
            {winningLine && (
                <div className="absolute inset-0 pointer-events-none z-10 p-4">
                    {/* 
                       Logic to draw the line can be complex due to grid gap. 
                       For now, the cell highlight (bg color) provides sufficient feedback.
                    */}
                </div>
            )}
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
                        <div className="text-2xl font-black text-slate-400 uppercase tracking-widest">
                            {drawStreak >= 3 ? "Game Over" : "Draw!"}
                        </div>
                        {drawStreak < 3 && (
                            <div className="text-sm font-bold text-gold-400 flex items-center gap-2">
                                <RefreshCw size={14} className="animate-spin" /> Restarting for Round {drawStreak + 1}...
                            </div>
                        )}
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
