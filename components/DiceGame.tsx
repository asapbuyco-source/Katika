
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trophy, Shield, Box, User, Cpu, Wifi, Clock, Zap } from 'lucide-react';
import { Table, User as AppUser, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';

interface DiceGameProps {
  table: Table;
  user: AppUser;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

const TURN_TIME_LIMIT = 15; // Seconds

// --- 2D DIE COMPONENT ---
const Die2D: React.FC<{ value: number; rolling: boolean; isMe: boolean }> = ({ value, rolling, isMe }) => {
    const [displayVal, setDisplayVal] = useState(value);

    // Simulate fast face changing when rolling
    useEffect(() => {
        if (rolling) {
            const interval = setInterval(() => {
                setDisplayVal(Math.ceil(Math.random() * 6));
            }, 80); // Fast cycle
            return () => clearInterval(interval);
        } else {
            setDisplayVal(value);
        }
    }, [rolling, value]);

    const getPips = (val: number) => {
        switch (val) {
            case 1: return [4];
            case 2: return [0, 8];
            case 3: return [0, 4, 8];
            case 4: return [0, 2, 6, 8];
            case 5: return [0, 2, 4, 6, 8];
            case 6: return [0, 2, 3, 5, 6, 8];
            default: return [];
        }
    };

    const pips = getPips(displayVal);

    return (
        <motion.div
            animate={rolling ? {
                rotate: [0, -10, 10, -10, 10, 0],
                x: [0, -2, 2, -2, 2, 0],
                y: [0, -2, 2, 0],
            } : {
                scale: [1.1, 1],
                rotate: 0,
                x: 0,
                y: 0
            }}
            transition={rolling ? { duration: 0.3, repeat: Infinity } : { duration: 0.4, type: 'spring' }}
            className={`
                w-20 h-20 md:w-24 md:h-24 rounded-2xl shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center p-2 border-2
                ${isMe 
                    ? 'bg-gradient-to-br from-amber-100 to-amber-400 border-amber-500' 
                    : 'bg-gradient-to-br from-red-100 to-red-400 border-red-500'}
            `}
        >
            <div className="grid grid-cols-3 grid-rows-3 w-full h-full gap-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                    <div key={idx} className="flex items-center justify-center">
                        {pips.includes(idx) && (
                            <div className={`
                                w-3 h-3 md:w-4 md:h-4 rounded-full shadow-sm
                                ${isMe ? 'bg-black' : 'bg-white'}
                            `} />
                        )}
                    </div>
                ))}
            </div>
        </motion.div>
    );
};

// --- GAME LOGIC ---

export const DiceGame: React.FC<DiceGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  // P2P or Local?
  const isP2P = !!socket && !!socketGame;
  // SAFE ACCESS: Check if players array exists before finding
  const opponentId = isP2P && Array.isArray(socketGame?.players) 
      ? socketGame.players.find((id: string) => id !== user.id) 
      : 'bot';

  // State
  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<'waiting' | 'rolling' | 'scored'>('waiting');
  const [myDice, setMyDice] = useState([1, 1]);
  const [oppDice, setOppDice] = useState([1, 1]);
  const [roundWinner, setRoundWinner] = useState<'me' | 'opp' | 'tie' | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [gameLog, setGameLog] = useState("Round 1 Start");
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_LIMIT);
  const [isMyTurn, setIsMyTurn] = useState(true);

  // Sync with Socket State
  useEffect(() => {
      if (isP2P && socketGame) {
          const amITurn = socketGame.turn === user.id;
          setIsMyTurn(amITurn);
          
          if (socketGame.scores) {
              setScores({
                  me: socketGame.scores[user.id] || 0,
                  opp: socketGame.scores[opponentId] || 0
              });
          }
          if (socketGame.currentRound) setRound(socketGame.currentRound);

          // Handle Rolls safely
          if (socketGame.roundRolls) {
              if (socketGame.roundRolls[user.id]) setMyDice(socketGame.roundRolls[user.id]);
              if (socketGame.roundRolls[opponentId]) setOppDice(socketGame.roundRolls[opponentId]);
          }

          if (socketGame.roundState === 'scored') {
              setPhase('scored');
          } else {
              if (phase !== 'rolling') setPhase('waiting');
              setRoundWinner(null);
          }
      }
  }, [socketGame, user.id, opponentId, isP2P]);

  // Timer Effect
  useEffect(() => {
      if (phase !== 'waiting') return;

      // Reset timer when turn changes
      setTimeLeft(TURN_TIME_LIMIT);

      const timer = setInterval(() => {
          setTimeLeft(prev => {
              if (prev <= 1) {
                  clearInterval(timer);
                  handleTimeout();
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);

      return () => clearInterval(timer);
  }, [isMyTurn, round, phase]);

  const handleTimeout = () => {
      if (phase !== 'waiting') return;
      
      // Auto-roll on timeout to keep game moving
      if (isMyTurn) {
          playSFX('error');
          setGameLog("Time's up! Auto-rolling...");
          roll();
      } else if (!isP2P) {
          botPlay(); 
      }
  };

  // Determine Opponent info
  const opponentName = table.host?.id === user.id && table.guest ? table.guest.name : (table.host?.name || "Opponent");
  const opponentAvatar = table.host?.id === user.id && table.guest ? table.guest.avatar : (table.host?.avatar || "https://i.pravatar.cc/150");

  const roll = () => {
      if (!isMyTurn || phase !== 'waiting') return;
      setPhase('rolling');
      playSFX('dice');
      setGameLog("You are rolling...");

      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } });
      } else {
          // Local Logic
          setTimeout(() => {
              const d1 = Math.ceil(Math.random() * 6);
              const d2 = Math.ceil(Math.random() * 6);
              setMyDice([d1, d2]);
              setPhase('waiting'); 
              setIsMyTurn(false);
              setGameLog(`${opponentName}'s Turn`);
              setTimeout(botPlay, 1000); 
          }, 1000);
      }
  };

  const botPlay = () => {
      setPhase('rolling');
      playSFX('dice');
      setTimeout(() => {
          const d1 = Math.ceil(Math.random() * 6);
          const d2 = Math.ceil(Math.random() * 6);
          setOppDice([d1, d2]);
          evaluateRoundLocal([myDice[0], myDice[1]], [d1, d2]);
      }, 1000);
  };

  const evaluateRoundLocal = (pDice: number[], oDice: number[]) => {
      const pTotal = pDice[0] + pDice[1];
      const oTotal = oDice[0] + oDice[1];
      setPhase('scored');
      
      if (pTotal > oTotal) {
          setScores(s => ({ ...s, me: s.me + 1 }));
          setRoundWinner('me');
          setGameLog(`You Won Round ${round}!`);
          playSFX('win');
      } else if (oTotal > pTotal) {
          setScores(s => ({ ...s, opp: s.opp + 1 }));
          setRoundWinner('opp');
          setGameLog(`${opponentName} Won Round ${round}`);
          playSFX('loss');
      } else {
          setRoundWinner('tie');
          setGameLog("Round Tied");
      }
  };

  const nextRoundLocal = () => {
      if (scores.me >= 3 || scores.opp >= 3) {
          onGameEnd(scores.me >= 3 ? 'win' : 'loss');
      } else {
          setRound(r => r + 1);
          setIsMyTurn(true);
          setPhase('waiting');
          setRoundWinner(null);
          setGameLog(`Round ${round + 1} Start`);
          setTimeLeft(TURN_TIME_LIMIT);
      }
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-between p-4 relative overflow-hidden">
        
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] opacity-10 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60 pointer-events-none"></div>

        {/* --- HEADER --- */}
        <div className="w-full max-w-lg flex justify-between items-start relative z-10 pt-2">
            <button onClick={() => setShowForfeitModal(true)} className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white">
                <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col items-center">
                <div className="text-gold-400 font-bold text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
                    {isP2P && <Wifi size={12} className="animate-pulse" />} First to 3 Wins
                </div>
                <div className="bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 flex items-center gap-4">
                    <span className={`font-bold ${scores.me > scores.opp ? 'text-green-400' : 'text-white'}`}>{scores.me}</span>
                    <span className="text-slate-500 text-xs">VS</span>
                    <span className={`font-bold ${scores.opp > scores.me ? 'text-red-400' : 'text-white'}`}>{scores.opp}</span>
                </div>
            </div>
            <div className="w-10"></div>
        </div>

        {/* --- ARENA --- */}
        <div className="flex-1 w-full max-w-lg flex flex-col justify-center gap-10 md:gap-16 relative z-10 my-4 md:my-8">
            
            {/* Opponent Zone */}
            <div className={`transition-all duration-500 relative ${!isMyTurn ? 'opacity-100 z-20' : 'opacity-60 scale-95 blur-[1px]'}`}>
                {/* Timer Bar Opponent */}
                {!isMyTurn && phase === 'waiting' && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-32 h-1 bg-royal-800 rounded-full overflow-hidden">
                        <motion.div 
                            initial={{ width: '100%' }} 
                            animate={{ width: '0%' }} 
                            transition={{ duration: TURN_TIME_LIMIT, ease: "linear" }}
                            className="h-full bg-red-500" 
                        />
                    </div>
                )}

                <div className="flex justify-center mb-6">
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-lg transition-all ${!isMyTurn ? 'bg-red-500/20 border-red-500/50' : 'bg-red-900/20 border-red-500/10'}`}>
                        <img src={opponentAvatar} className="w-8 h-8 rounded-full border border-red-500" />
                        <span className="text-red-200 font-bold text-sm">{opponentName}</span>
                        {!isMyTurn && phase === 'waiting' && <span className="text-xs text-red-400 animate-pulse font-mono">{timeLeft}s</span>}
                        {!isMyTurn && phase === 'rolling' && <span className="text-xs text-red-400 font-bold">Rolling...</span>}
                    </div>
                </div>
                <div className="flex justify-center gap-6 md:gap-12">
                    <Die2D value={oppDice[0]} rolling={!isMyTurn && phase === 'rolling'} isMe={false} />
                    <Die2D value={oppDice[1]} rolling={!isMyTurn && phase === 'rolling'} isMe={false} />
                </div>
                <div className="text-center mt-6 h-8">
                    {(isMyTurn || phase === 'scored') && (
                        <motion.span 
                            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="text-4xl font-display font-black text-white drop-shadow-md"
                        >
                            {oppDice[0] + oppDice[1]}
                        </motion.span>
                    )}
                </div>
            </div>

            {/* Divider / Status */}
            <div className="flex items-center justify-center relative">
                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent w-full absolute top-1/2 -translate-y-1/2"></div>
                <div className="relative z-10">
                    <div className="text-slate-300 text-xs font-bold uppercase tracking-wider bg-royal-950 px-6 py-2 rounded-full border border-white/10 shadow-xl flex items-center gap-2">
                        {phase === 'waiting' && <Clock size={12} className="animate-pulse text-gold-400"/>}
                        {gameLog}
                    </div>
                </div>
            </div>

            {/* Player Zone */}
            <div className={`transition-all duration-500 relative ${isMyTurn ? 'opacity-100 z-20' : 'opacity-60 scale-95 blur-[1px]'}`}>
                <div className="text-center mb-6 h-8">
                    {(!isMyTurn || phase === 'scored') && (
                        <motion.span 
                            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="text-4xl font-display font-black text-white drop-shadow-md"
                        >
                            {myDice[0] + myDice[1]}
                        </motion.span>
                    )}
                </div>
                <div className="flex justify-center gap-6 md:gap-12 mb-6">
                    <Die2D value={myDice[0]} rolling={isMyTurn && phase === 'rolling'} isMe={true} />
                    <Die2D value={myDice[1]} rolling={isMyTurn && phase === 'rolling'} isMe={true} />
                </div>
                <div className="flex justify-center">
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-lg transition-all ${isMyTurn ? 'bg-gold-500/20 border-gold-500/50' : 'bg-gold-500/5 border-gold-500/10'}`}>
                        <img src={user.avatar} className="w-8 h-8 rounded-full border border-gold-500" />
                        <span className="text-gold-200 font-bold text-sm">You</span>
                        {isMyTurn && phase === 'waiting' && <span className="text-xs text-gold-400 animate-pulse font-mono">{timeLeft}s</span>}
                        {isMyTurn && phase === 'rolling' && <span className="text-xs text-gold-400 font-bold">Rolling...</span>}
                    </div>
                </div>

                {/* Timer Bar Player */}
                {isMyTurn && phase === 'waiting' && (
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-32 h-1 bg-royal-800 rounded-full overflow-hidden">
                        <motion.div 
                            initial={{ width: '100%' }} 
                            animate={{ width: '0%' }} 
                            transition={{ duration: TURN_TIME_LIMIT, ease: "linear" }}
                            className="h-full bg-gold-500" 
                        />
                    </div>
                )}
            </div>

        </div>

        {/* --- CONTROLS --- */}
        <div className="w-full max-w-md pb-6 relative z-20 h-24 flex items-end justify-center">
            <AnimatePresence mode="wait">
                {phase === 'waiting' && isMyTurn ? (
                    <motion.button 
                        key="roll"
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                        onClick={roll}
                        className="w-full py-4 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-400 hover:to-gold-500 text-royal-950 font-black text-xl rounded-2xl shadow-[0_0_40px_rgba(251,191,36,0.4)] transition-all transform active:scale-95 flex items-center justify-center gap-3 border-t border-white/20"
                    >
                        <Box size={24} strokeWidth={3} /> ROLL DICE
                    </motion.button>
                ) : phase === 'scored' && !isP2P ? (
                    <motion.button 
                        key="next"
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                        onClick={nextRoundLocal}
                        className="w-full py-4 bg-white hover:bg-slate-200 text-royal-950 font-black text-xl rounded-2xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-3"
                    >
                        {scores.me >= 3 || scores.opp >= 3 ? 'FINISH MATCH' : 'NEXT ROUND'} <ArrowLeft className="rotate-180" strokeWidth={3} />
                    </motion.button>
                ) : (
                    <motion.div 
                        key="status"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="w-full py-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center gap-2 text-slate-400 font-bold backdrop-blur-sm"
                    >
                        {phase === 'rolling' ? <Cpu className="animate-spin" size={20} /> : <Clock className="animate-pulse" size={20} />}
                        {phase === 'rolling' ? 'Rolling...' : isP2P && phase === 'scored' ? 'Starting Next Round...' : 'Opponent Turn...'}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        <AnimatePresence>
          {showForfeitModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowForfeitModal(false)}
                    className="absolute inset-0 bg-black/90 backdrop-blur-md"
                  />
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-[#1a1a1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                  >
                      <h2 className="text-xl font-black text-white mb-2 uppercase italic text-center">Forfeit?</h2>
                      <p className="text-sm text-slate-400 text-center mb-6">
                          You will lose your entire stake.
                      </p>
                      <div className="flex gap-3">
                          <button onClick={() => setShowForfeitModal(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10">Resume</button>
                          <button onClick={() => onGameEnd('quit')} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl">Quit</button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

    </div>
  );
};
