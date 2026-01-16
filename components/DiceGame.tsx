
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Shield, Zap, Hash, Dna } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { motion, AnimatePresence } from 'framer-motion';

interface DiceGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

const DieDisplay = ({ value, rolling, color }: { value: number, rolling: boolean, color: string }) => {
    // Pip positions for standard dice faces
    const pips: Record<number, number[]> = {
        1: [4],
        2: [2, 6],
        3: [2, 4, 6],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8]
    };

    return (
        <motion.div 
            animate={rolling ? { 
                rotateX: [0, 360, 720, 1080], 
                rotateY: [0, 360, 720, 1080],
                y: [0, -60, 0],
                scale: [1, 1.2, 1]
            } : { 
                rotateX: 0, 
                rotateY: 0, 
                y: 0,
                scale: 1 
            }}
            transition={rolling ? { duration: 0.8, ease: "easeInOut" } : { type: "spring" }}
            className={`w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-gradient-to-br ${color} shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center relative border border-white/10`}
        >
            <div className="grid grid-cols-3 grid-rows-3 gap-1 md:gap-2 w-16 h-16 md:w-20 md:h-20">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="flex items-center justify-center">
                        {pips[value]?.includes(i) && (
                            <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-black/80 shadow-inner" />
                        )}
                    </div>
                ))}
            </div>
        </motion.div>
    );
};

export const DiceGame: React.FC<DiceGameProps> = ({ table, user, onGameEnd }) => {
  const [gameState, setGameState] = useState<'ready' | 'rolling' | 'round_end' | 'game_over'>('ready');
  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [round, setRound] = useState(1);
  const [currentRoll, setCurrentRoll] = useState({ me: 1, opp: 1 });
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [serverHash, setServerHash] = useState(generateMockHash());

  function generateMockHash() {
      return Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
  }

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  const playRound = () => {
      if (gameState !== 'ready') return;
      
      setGameState('rolling');
      addLog("Verifying Server Seed...", "scanning");
      
      setTimeout(() => {
          const myRoll = Math.floor(Math.random() * 6) + 1;
          const oppRoll = Math.floor(Math.random() * 6) + 1;
          
          setCurrentRoll({ me: myRoll, opp: oppRoll });
          setGameState('round_end');

          let winner = null;
          if (myRoll > oppRoll) winner = 'me';
          if (oppRoll > myRoll) winner = 'opp';

          // Update Hash for next round visual
          setServerHash(generateMockHash());

          if (winner === 'me') {
              setScores(s => {
                  const newScore = s.me + 1;
                  addLog(`You won Round ${round}`, 'secure');
                  checkGameEnd(newScore, s.opp);
                  return { ...s, me: newScore };
              });
          } else if (winner === 'opp') {
               setScores(s => {
                  const newScore = s.opp + 1;
                  addLog(`Opponent won Round ${round}`, 'alert');
                  checkGameEnd(s.me, newScore);
                  return { ...s, opp: newScore };
              });
          } else {
              addLog(`Round ${round} Draw`, 'secure');
              checkGameEnd(scores.me, scores.opp); // Just check if max rounds reached, usually draw triggers redo or next round without score
          }

      }, 1500);
  };

  const checkGameEnd = (myScore: number, oppScore: number) => {
      // Best of 5
      if (myScore >= 3 || oppScore >= 3 || round >= 5) {
          setTimeout(() => {
             setGameState('game_over');
             if (myScore > oppScore) onGameEnd('win');
             else if (oppScore > myScore) onGameEnd('loss');
             else onGameEnd('quit'); // Draw case handling
          }, 2000);
      } else {
          setTimeout(() => {
              setRound(r => r + 1);
              setGameState('ready');
          }, 2000);
      }
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-4">
       
       {/* Header */}
       <div className="w-full max-w-4xl flex justify-between items-center mb-8">
           <button onClick={() => onGameEnd('quit')} className="text-slate-400 hover:text-white flex items-center gap-2 group">
                <div className="p-2 bg-royal-800 rounded-lg group-hover:bg-royal-700 transition-colors">
                    <ArrowLeft size={20} />
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-xs text-slate-500 uppercase">Back to Lobby</span>
                    <span className="font-bold">Forfeit Game</span>
                </div>
           </button>

           <div className="glass-panel px-6 py-2 rounded-2xl flex items-center gap-4">
                <div className="text-center">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Round</div>
                    <div className="text-2xl font-display font-bold text-white">{round} <span className="text-slate-500 text-sm">/ 5</span></div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center">
                     <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pot Size</div>
                     <div className="text-xl font-mono text-gold-400">{(table.stake * 2).toLocaleString()}</div>
                </div>
           </div>

           <div className="w-[140px]">
               <AIReferee externalLog={refereeLog} />
           </div>
       </div>

       {/* Arena */}
       <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            
            {/* Player Card (Left) */}
            <div className={`glass-panel p-6 rounded-3xl border-2 transition-all ${scores.me > scores.opp ? 'border-gold-500 bg-royal-800/80' : 'border-transparent'}`}>
                <div className="flex flex-col items-center text-center">
                    <div className="relative mb-4">
                        <img src={user.avatar} alt="Me" className="w-20 h-20 rounded-full border-4 border-gold-500 shadow-xl" />
                        <div className="absolute -bottom-2 -right-2 bg-gold-500 text-royal-950 text-xs font-bold px-2 py-1 rounded-full">YOU</div>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1">{user.name}</h3>
                    <div className="text-xs text-gold-400 font-mono mb-6">{user.elo} ELO</div>
                    
                    <div className="w-full bg-black/20 rounded-xl p-4 mb-4">
                        <div className="text-xs text-slate-500 uppercase mb-1">Current Score</div>
                        <div className="text-4xl font-display font-bold text-white">{scores.me}</div>
                    </div>

                    <div className="flex gap-1">
                        {[1,2,3].map(i => (
                            <div key={i} className={`w-3 h-3 rounded-full ${i <= scores.me ? 'bg-gold-500 shadow-[0_0_10px_gold]' : 'bg-royal-900 border border-white/10'}`} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Center Stage (Dice) */}
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                
                <div className="relative flex justify-center items-center gap-8 mb-12">
                     {/* My Die */}
                     <DieDisplay 
                        value={currentRoll.me} 
                        rolling={gameState === 'rolling'} 
                        color="from-gold-300 to-gold-600" 
                     />
                     
                     <div className="font-display font-black text-4xl text-white/10 absolute z-0">VS</div>

                     {/* Opp Die */}
                     <DieDisplay 
                        value={currentRoll.opp} 
                        rolling={gameState === 'rolling'} 
                        color="from-red-400 to-red-600" 
                     />
                </div>

                <div className="h-24 flex items-center justify-center w-full">
                    {gameState === 'ready' ? (
                        <motion.button 
                            initial={{ scale: 0.9 }} animate={{ scale: 1 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={playRound}
                            className="bg-gold-500 hover:bg-gold-400 text-royal-950 font-black text-xl py-4 px-12 rounded-full shadow-[0_0_40px_rgba(251,191,36,0.3)] flex items-center gap-3 transition-colors"
                        >
                            <Zap size={24} fill="currentColor" /> ROLL DICE
                        </motion.button>
                    ) : gameState === 'rolling' ? (
                        <div className="text-gold-400 font-bold animate-pulse tracking-widest">ROLLING...</div>
                    ) : (
                        <div className="text-center">
                            <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Result</div>
                            <div className="text-2xl font-bold text-white">
                                {currentRoll.me > currentRoll.opp ? "YOU WIN" : currentRoll.opp > currentRoll.me ? "OPPONENT WINS" : "DRAW"}
                            </div>
                        </div>
                    )}
                </div>

                {/* Provably Fair Hash */}
                <div className="mt-8 w-full">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-wider mb-2 justify-center">
                        <Dna size={12} /> Server Seed Hash
                    </div>
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <p className="font-mono text-[8px] text-slate-600 break-all text-center leading-tight">
                            {serverHash}
                        </p>
                    </div>
                </div>

            </div>

            {/* Opponent Card (Right) */}
            <div className={`glass-panel p-6 rounded-3xl border-2 transition-all ${scores.opp > scores.me ? 'border-red-500 bg-royal-800/80' : 'border-transparent'}`}>
                <div className="flex flex-col items-center text-center">
                    <div className="relative mb-4">
                        <img src={table.host?.avatar || "https://i.pravatar.cc/150"} alt="Opponent" className="w-20 h-20 rounded-full border-4 border-red-500 shadow-xl" />
                        <div className="absolute -bottom-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">OPP</div>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1">{table.host?.name || "Opponent"}</h3>
                    <div className="text-xs text-red-400 font-mono mb-6">{table.host?.elo || 1000} ELO</div>
                    
                    <div className="w-full bg-black/20 rounded-xl p-4 mb-4">
                        <div className="text-xs text-slate-500 uppercase mb-1">Current Score</div>
                        <div className="text-4xl font-display font-bold text-white">{scores.opp}</div>
                    </div>

                    <div className="flex gap-1">
                         {[1,2,3].map(i => (
                            <div key={i} className={`w-3 h-3 rounded-full ${i <= scores.opp ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-royal-900 border border-white/10'}`} />
                        ))}
                    </div>
                </div>
            </div>

       </div>
    </div>
  );
};
