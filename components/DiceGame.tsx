import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Box, Clock, Hand, XCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Table, User as AppUser, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
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

    useEffect(() => {
        if (rolling) {
            const interval = setInterval(() => {
                setDisplayVal(Math.ceil(Math.random() * 6));
            }, 80);
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
                rotate: [0, -15, 15, -15, 15, 0],
                x: [0, -5, 5, -5, 5, 0],
                y: [0, -5, 5, 0],
                scale: 1.1
            } : {
                scale: 1,
                rotate: 0,
                x: 0,
                y: 0
            }}
            transition={rolling ? { duration: 0.2, repeat: Infinity } : { duration: 0.4, type: 'spring', bounce: 0.5 }}
            className={`
                w-20 h-20 md:w-24 md:h-24 rounded-2xl shadow-[0_10px_20px_rgba(0,0,0,0.5)] flex items-center justify-center p-2 border-2 relative
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
                                w-3 h-3 md:w-4 md:h-4 rounded-full shadow-inner
                                ${isMe ? 'bg-black' : 'bg-white'}
                            `} />
                        )}
                    </div>
                ))}
            </div>
            <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-white/40 to-transparent rounded-tr-xl pointer-events-none"></div>
        </motion.div>
    );
};

export const DiceGame: React.FC<DiceGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const isP2P = !!socket && !!socketGame;
  const opponentId = isP2P && Array.isArray(socketGame?.players) 
      ? socketGame.players.find((id: string) => id !== user.id) 
      : 'bot';

  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<'waiting' | 'rolling' | 'scored'>('waiting');
  const [myDice, setMyDice] = useState([1, 1]);
  const [oppDice, setOppDice] = useState([1, 1]);
  const [roundWinner, setRoundWinner] = useState<'me' | 'opp' | 'tie' | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_LIMIT);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const opponentName = table.host?.id === user.id && table.guest ? table.guest.name : (table.host?.name || "Opponent");
  const opponentAvatar = table.host?.id === user.id && table.guest ? table.guest.avatar : (table.host?.avatar || "https://i.pravatar.cc/150");

  const prevRoundState = useRef<string>('');

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  const handleQuit = () => {
      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      onGameEnd('quit');
  };

  // Improved Sync with Socket State
  useEffect(() => {
      if (isP2P && socketGame) {
          const amITurn = socketGame.turn === user.id;
          setIsMyTurn(amITurn);
          
          if (socketGame.scores && (socketGame.scores[user.id] !== scores.me || socketGame.scores[opponentId] !== scores.opp)) {
              setScores({
                  me: socketGame.scores[user.id] || 0,
                  opp: socketGame.scores[opponentId] || 0
              });
          }
          
          if (socketGame.currentRound && socketGame.currentRound !== round) {
              setRound(socketGame.currentRound);
          }

          if (socketGame.roundRolls) {
              if (socketGame.roundRolls[user.id] && JSON.stringify(socketGame.roundRolls[user.id]) !== JSON.stringify(myDice)) {
                  setMyDice(socketGame.roundRolls[user.id]);
              }
              if (socketGame.roundRolls[opponentId] && JSON.stringify(socketGame.roundRolls[opponentId]) !== JSON.stringify(oppDice)) {
                  setOppDice(socketGame.roundRolls[opponentId]);
              }
          }

          if (socketGame.roundState === 'scored') {
              setPhase('scored');
              
              if (prevRoundState.current !== 'scored') {
                  const myD = socketGame.roundRolls[user.id] || [0,0];
                  const oppD = socketGame.roundRolls[opponentId] || [0,0];
                  const myTotal = myD[0] + myD[1];
                  const oppTotal = oppD[0] + oppD[1];

                  if (myTotal > oppTotal) {
                      setRoundWinner('me');
                      playSFX('win');
                  } else if (oppTotal > myTotal) {
                      setRoundWinner('opp');
                      playSFX('loss');
                  } else {
                      setRoundWinner('tie');
                  }
              }
          } else {
              if (phase === 'rolling' && !amITurn) {
                  setPhase('waiting');
              }
              if (phase === 'scored' && socketGame.roundState === 'waiting') {
                  setPhase('waiting');
                  setRoundWinner(null);
                  addLog(`Round ${socketGame.currentRound} Started`);
                  setTimeLeft(TURN_TIME_LIMIT);
              }
          }
          prevRoundState.current = socketGame.roundState;
          
          if (socketGame.winner) {
              onGameEnd(socketGame.winner === user.id ? 'win' : 'loss');
          }
      }
  }, [socketGame, user.id, opponentId, isP2P]);

  useEffect(() => {
      if (phase !== 'waiting') return;

      setTimeLeft(TURN_TIME_LIMIT);
      let timeoutId: any;

      const timer = setInterval(() => {
          setTimeLeft(prev => {
              if (prev <= 1) {
                  clearInterval(timer);
                  timeoutId = setTimeout(() => handleTimeout(), 0);
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);

      return () => {
          clearInterval(timer);
          if (timeoutId) clearTimeout(timeoutId);
      };
  }, [isMyTurn, round, phase]);

  const handleTimeout = () => {
      if (phase !== 'waiting') return;
      
      if (isMyTurn) {
          playSFX('error');
          addLog("Auto-roll triggered", "alert");
          roll();
      } else if (!isP2P) {
          botPlay(); 
      }
  };

  const roll = () => {
      if (!isMyTurn || phase !== 'waiting' || isProcessing) return;
      
      playSFX('dice');
      
      if (isP2P && socket) {
          setPhase('rolling');
          setIsProcessing(true);
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } });
          setTimeout(() => setIsProcessing(false), 500);
      } else {
          setPhase('rolling');
          setTimeout(() => {
              const d1 = Math.ceil(Math.random() * 6);
              const d2 = Math.ceil(Math.random() * 6);
              setMyDice([d1, d2]);
              setPhase('waiting'); 
              setIsMyTurn(false);
              setTimeout(botPlay, 1500); 
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
          playSFX('win');
      } else if (oTotal > pTotal) {
          setScores(s => ({ ...s, opp: s.opp + 1 }));
          setRoundWinner('opp');
          playSFX('loss');
      } else {
          setRoundWinner('tie');
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
          setTimeLeft(TURN_TIME_LIMIT);
      }
  };

  const handleSwipe = (event: any, info: PanInfo) => {
      if (info.offset.y < -50 && isMyTurn && phase === 'waiting') {
          roll();
      }
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-between p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] opacity-10 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60 pointer-events-none"></div>

        {/* --- HEADER --- */}
        <div className="w-full max-w-2xl flex justify-between items-start relative z-10 pt-2">
            <button onClick={() => setShowForfeitModal(true)} className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white">
                <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col items-center">
                <div className="text-gold-400 font-bold text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
                    Round {round} of 5
                </div>
                <div className="bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 flex items-center gap-4">
                    <div className="flex flex-col items-center">
                        <span className={`font-bold text-2xl ${scores.me > scores.opp ? 'text-green-400' : 'text-white'}`}>{scores.me}</span>
                        <span className="text-[8px] uppercase text-slate-500 font-bold">YOU</span>
                    </div>
                    <div className="h-8 w-px bg-white/10"></div>
                    <div className="flex flex-col items-center">
                        <span className={`font-bold text-2xl ${scores.opp > scores.me ? 'text-red-400' : 'text-white'}`}>{scores.opp}</span>
                        <span className="text-[8px] uppercase text-slate-500 font-bold">OPP</span>
                    </div>
                </div>
            </div>
            <div className="w-32 hidden md:block">
                 <AIReferee externalLog={refereeLog} />
            </div>
        </div>

        {/* --- TURN INDICATOR --- */}
        <div className="mt-6 flex justify-center w-full relative z-20">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                key={isMyTurn ? 'my-turn' : 'opp-turn'}
                className={`px-8 py-2 rounded-full font-black text-sm uppercase tracking-widest shadow-lg transition-all duration-300 ${
                    isMyTurn 
                    ? 'bg-gold-500 text-royal-950 scale-110 shadow-gold-500/20' 
                    : 'bg-royal-800 text-slate-400 border border-white/10'
                }`}
            >
                {isMyTurn ? "Your Turn" : "Opponent's Turn"}
            </motion.div>
        </div>

        {/* --- ARENA --- */}
        <div className="flex-1 w-full max-w-lg flex flex-col justify-center relative z-10 my-4 gap-8">
            <div className="relative">
                <div className={`flex flex-col items-center gap-4 transition-all duration-500 ${!isMyTurn ? 'scale-105 z-20' : 'scale-95 opacity-60'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`relative ${!isMyTurn ? 'ring-4 ring-red-500/50 rounded-full' : ''}`}>
                            <img src={opponentAvatar} className="w-12 h-12 rounded-full border-2 border-red-500" />
                            {!isMyTurn && phase === 'rolling' && (
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">Rolling...</div>
                            )}
                        </div>
                        <div className="text-red-200 font-bold text-sm">{opponentName}</div>
                    </div>

                    <div className="relative bg-black/20 rounded-3xl p-6 border border-white/5 w-full">
                        <div className="flex justify-center gap-6">
                            <Die2D value={oppDice[0]} rolling={!isMyTurn && phase === 'rolling'} isMe={false} />
                            <Die2D value={oppDice[1]} rolling={!isMyTurn && phase === 'rolling'} isMe={false} />
                        </div>
                        <div className="absolute -right-4 top-1/2 -translate-y-1/2">
                            {(isMyTurn || phase === 'scored') && (
                                <motion.div 
                                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    className="w-12 h-12 rounded-full bg-royal-800 border-2 border-red-500 flex items-center justify-center text-white font-black text-xl shadow-lg"
                                >
                                    {oppDice[0] + oppDice[1]}
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <motion.div 
                className={`flex flex-col items-center gap-4 transition-all duration-500 ${isMyTurn ? 'scale-105 z-20 cursor-grab active:cursor-grabbing' : 'scale-95 opacity-60'}`}
                onPanEnd={handleSwipe}
                onTouchEnd={(e) => {
                    // Simple swipe logic for touch
                    if (isMyTurn && phase === 'waiting') {
                       roll();
                    }
                }}
            >
                <div className="relative bg-black/20 rounded-3xl p-6 border border-white/5 w-full">
                    {isMyTurn && phase === 'waiting' && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute -top-8 left-1/2 -translate-x-1/2 text-gold-400 text-xs font-bold flex flex-col items-center gap-1 animate-bounce"
                        >
                            <Hand className="rotate-180" size={16} />
                            SWIPE UP TO ROLL
                        </motion.div>
                    )}

                    <div className="flex justify-center gap-6">
                        <Die2D value={myDice[0]} rolling={isMyTurn && phase === 'rolling'} isMe={true} />
                        <Die2D value={myDice[1]} rolling={isMyTurn && phase === 'rolling'} isMe={true} />
                    </div>

                    <div className="absolute -right-4 top-1/2 -translate-y-1/2">
                        {(!isMyTurn || phase === 'scored') && (
                            <motion.div 
                                initial={{ scale: 0 }} animate={{ scale: 1 }}
                                className="w-12 h-12 rounded-full bg-royal-800 border-2 border-gold-500 flex items-center justify-center text-white font-black text-xl shadow-lg"
                            >
                                {myDice[0] + myDice[1]}
                            </motion.div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`relative ${isMyTurn ? 'ring-4 ring-gold-500/50 rounded-full' : ''}`}>
                        <img src={user.avatar} className="w-12 h-12 rounded-full border-2 border-gold-500" />
                        {isMyTurn && phase === 'rolling' && (
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gold-500 text-royal-950 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">Rolling...</div>
                        )}
                    </div>
                    <div className="text-gold-200 font-bold text-sm">You</div>
                </div>
            </motion.div>
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
                        <Box size={24} strokeWidth={3} /> ROLL DICE ({timeLeft}s)
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
                        {phase === 'rolling' ? <RefreshCw className="animate-spin" size={20} /> : <Clock className="animate-pulse" size={20} />}
                        {phase === 'rolling' ? 'Rolling...' : isP2P && phase === 'scored' ? 'Starting Next Round...' : `Waiting for ${opponentName}...`}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* ROUND RESULT */}
        <AnimatePresence>
            {phase === 'scored' && roundWinner && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.5, opacity: 0 }}
                        className={`px-8 py-4 rounded-3xl border-4 shadow-2xl backdrop-blur-md flex flex-col items-center gap-2 ${
                            roundWinner === 'me' 
                            ? 'bg-green-500/80 border-green-400 text-white' 
                            : roundWinner === 'opp' 
                            ? 'bg-red-600/80 border-red-500 text-white'
                            : 'bg-slate-600/80 border-slate-400 text-white'
                        }`}
                    >
                        {roundWinner === 'me' && <CheckCircle2 size={48} className="drop-shadow-md" />}
                        {roundWinner === 'opp' && <XCircle size={48} className="drop-shadow-md" />}
                        {roundWinner === 'tie' && <RefreshCw size={48} className="drop-shadow-md" />}
                        
                        <h2 className="text-3xl font-black uppercase italic tracking-tighter drop-shadow-lg">
                            {roundWinner === 'me' ? "Round Won!" : roundWinner === 'opp' ? "Round Lost" : "Draw"}
                        </h2>
                        {roundWinner === 'me' && <p className="text-sm font-bold opacity-90">+1 Point</p>}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    </div>
  );
};