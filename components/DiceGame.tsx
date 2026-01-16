
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Shield, Zap, Hash, Dna, AlertTriangle } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';

interface DiceGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

const DieDisplay = ({ value, rolling, colorType }: { value: number, rolling: boolean, colorType: 'gold' | 'red' }) => {
    // Pip positions for standard dice faces
    const pips: Record<number, number[]> = {
        1: [4],
        2: [2, 6],
        3: [2, 4, 6],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8]
    };

    const styles = colorType === 'gold' 
        ? 'bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700 border-yellow-200' 
        : 'bg-gradient-to-br from-red-400 via-red-600 to-red-800 border-red-300';
    
    const pipColor = colorType === 'gold' ? 'bg-black/80 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]' : 'bg-white/90 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]';

    return (
        <div className="relative group perspective-1000">
             {/* Shadow Base */}
             <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-16 h-4 md:w-24 md:h-6 bg-black/40 blur-xl rounded-full scale-x-150 transition-all duration-300 group-hover:scale-x-125"></div>

             <motion.div 
                animate={rolling ? { 
                    rotateX: [0, 1080, 2160], 
                    rotateY: [0, 1080, 2160],
                    y: [0, -120, -40, 0],
                    scale: [1, 1.1, 0.9, 1]
                } : { 
                    rotateX: 0, 
                    rotateY: 0, 
                    y: 0,
                    scale: 1 
                }}
                transition={rolling ? { duration: 1.5, ease: "easeInOut" } : { type: "spring", stiffness: 200, damping: 20 }}
                className={`w-20 h-20 md:w-36 md:h-36 rounded-2xl md:rounded-3xl ${styles} shadow-[inset_0_0_20px_rgba(255,255,255,0.3),0_15px_35px_rgba(0,0,0,0.5)] flex items-center justify-center relative border-t border-l transform-style-3d`}
            >
                {/* Gloss effect */}
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/40 to-transparent rounded-2xl md:rounded-3xl pointer-events-none"></div>

                <div className="grid grid-cols-3 grid-rows-3 gap-1 md:gap-3 w-14 h-14 md:w-24 md:h-24 p-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="flex items-center justify-center">
                            {!rolling && pips[value]?.includes(i) && (
                                <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className={`w-3 h-3 md:w-5 md:h-5 rounded-full ${pipColor}`} 
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Motion Blur Effect during roll */}
                {rolling && (
                    <div className="absolute inset-0 flex items-center justify-center">
                         <div className={`w-10 h-10 rounded-full ${colorType === 'gold' ? 'bg-black/10' : 'bg-white/10'} blur-xl animate-pulse`}></div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export const DiceGame: React.FC<DiceGameProps> = ({ table, user, onGameEnd }) => {
  const [gameState, setGameState] = useState<'ready' | 'rolling' | 'round_end' | 'game_over'>('ready');
  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [round, setRound] = useState(1);
  const [currentRoll, setCurrentRoll] = useState({ me: 1, opp: 1 });
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [serverHash, setServerHash] = useState(generateMockHash());
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  function generateMockHash() {
      return Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
  }

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  const playRound = () => {
      if (gameState !== 'ready') return;
      
      setGameState('rolling');
      playSFX('dice');
      addLog("Verifying Server Seed...", "scanning");
      
      // Match the duration of the animation (1.5s)
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
              playSFX('win');
              setScores(s => {
                  const newScore = s.me + 1;
                  addLog(`You won Round ${round}`, 'secure');
                  checkGameEnd(newScore, s.opp);
                  return { ...s, me: newScore };
              });
          } else if (winner === 'opp') {
               playSFX('loss');
               setScores(s => {
                  const newScore = s.opp + 1;
                  addLog(`Opponent won Round ${round}`, 'alert');
                  checkGameEnd(s.me, newScore);
                  return { ...s, opp: newScore };
              });
          } else {
              addLog(`Round ${round} Draw`, 'secure');
              checkGameEnd(scores.me, scores.opp); 
          }

      }, 1500);
  };

  const checkGameEnd = (myScore: number, oppScore: number) => {
      // Best of 5
      if (myScore >= 3 || oppScore >= 3 || round >= 5) {
          setTimeout(() => {
             setGameState('game_over');
             if (myScore > oppScore) { onGameEnd('win'); playSFX('win'); }
             else if (oppScore > myScore) { onGameEnd('loss'); playSFX('loss'); }
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
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-start md:justify-center p-4 pb-28 pt-8 md:pt-4">
       
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
                      {/* Red Glow */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>

                      <div className="flex flex-col items-center text-center mb-6">
                          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                              <AlertTriangle className="text-red-500" size={32} />
                          </div>
                          <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                          <p className="text-sm text-slate-400">
                              Leaving now will result in an <span className="text-red-400 font-bold">immediate loss</span>. 
                              Your staked funds will be transferred to the opponent.
                          </p>
                      </div>

                      <div className="flex gap-3">
                          <button 
                            onClick={() => { setShowForfeitModal(false); playSFX('click'); }}
                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors"
                          >
                              Stay in Game
                          </button>
                          <button 
                            onClick={() => { onGameEnd('quit'); playSFX('click'); }}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors"
                          >
                              Yes, Forfeit
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

       {/* Header */}
       <div className="w-full max-w-5xl flex justify-between items-center mb-6 md:mb-8 gap-2">
           <button onClick={() => { setShowForfeitModal(true); playSFX('click'); }} className="text-slate-400 hover:text-white flex items-center gap-2 group flex-shrink-0">
                <div className="p-2 bg-royal-800 rounded-lg group-hover:bg-royal-700 transition-colors">
                    <ArrowLeft size={20} />
                </div>
                <div className="hidden md:flex flex-col items-start">
                    <span className="text-xs text-slate-500 uppercase">Back to Lobby</span>
                    <span className="font-bold">Forfeit Game</span>
                </div>
           </button>

           <div className="glass-panel px-4 py-2 md:px-6 rounded-2xl flex items-center gap-4 border border-white/5 bg-black/20 flex-1 justify-center max-w-[240px]">
                <div className="text-center">
                    <div className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider">Round</div>
                    <div className="text-xl md:text-2xl font-display font-bold text-white">{round} <span className="text-slate-500 text-sm">/ 5</span></div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center">
                     <div className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pot Size</div>
                     <div className="text-lg md:text-xl font-mono text-gold-400">{(table.stake * 2).toLocaleString()}</div>
                </div>
           </div>

           <div className="w-[40px] md:w-[140px] flex-shrink-0">
               <div className="md:hidden w-10 h-10 bg-royal-800 rounded-lg flex items-center justify-center text-purple-400">
                   <Shield size={20} />
               </div>
               <div className="hidden md:block">
                   <AIReferee externalLog={refereeLog} />
               </div>
           </div>
       </div>

       {/* Arena */}
       <div className="relative w-full max-w-5xl flex-1 flex flex-col justify-center">
            {/* Table Surface Background */}
            <div className="absolute inset-0 bg-royal-900 rounded-[2rem] md:rounded-[3rem] transform rotate-1 scale-105 opacity-50 border border-white/5 -z-10"></div>
            <div className="absolute inset-0 bg-royal-800 rounded-[2rem] md:rounded-[3rem] transform -rotate-1 -z-10 shadow-2xl"></div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-center p-6 md:p-12 relative z-10">
                
                {/* Player Card (Left/Top on Mobile) */}
                <div className={`glass-panel p-4 md:p-6 rounded-3xl border-2 transition-all duration-500 order-2 md:order-1 ${scores.me > scores.opp ? 'border-gold-500 bg-royal-800/80 shadow-[0_0_30px_rgba(251,191,36,0.15)] scale-105' : 'border-transparent'}`}>
                    <div className="flex md:flex-col items-center justify-between md:justify-center md:text-center gap-4">
                        <div className="relative">
                            <img src={user.avatar} alt="Me" className="w-12 h-12 md:w-20 md:h-20 rounded-full border-2 md:border-4 border-gold-500 shadow-xl" />
                            <div className="absolute -bottom-2 md:-bottom-3 left-1/2 -translate-x-1/2 bg-gold-500 text-royal-950 text-[8px] md:text-[10px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-wider shadow-lg">YOU</div>
                        </div>
                        
                        <div className="flex-1 md:flex-none">
                             <h3 className="text-sm md:text-xl font-bold text-white">{user.name}</h3>
                             <div className="text-[10px] md:text-xs text-gold-400 font-mono">{user.elo} ELO</div>
                        </div>
                        
                        <div className="flex flex-col items-end md:items-center">
                            <div className="text-3xl md:text-5xl font-display font-bold text-white">{scores.me}</div>
                             <div className="flex gap-1 mt-1">
                                {[1,2,3].map(i => (
                                    <div key={i} className={`h-1.5 md:h-2 rounded-full transition-all duration-500 ${i <= scores.me ? 'w-4 md:w-6 bg-gold-500 shadow-[0_0_10px_gold]' : 'w-1.5 md:w-2 bg-royal-900'}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center Stage (Dice) */}
                <div className="flex flex-col items-center justify-center min-h-[250px] md:min-h-[400px] order-1 md:order-2">
                    
                    {/* Dice Platform */}
                    <div className="relative flex justify-center items-center gap-6 md:gap-10 mb-8 md:mb-16">
                        {/* Floor Reflection/Glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 md:w-64 h-24 md:h-32 bg-purple-500/20 blur-[40px] md:blur-[50px] rounded-full"></div>

                        {/* My Die */}
                        <DieDisplay 
                            value={currentRoll.me} 
                            rolling={gameState === 'rolling'} 
                            colorType="gold" 
                        />
                        
                        <div className="font-display font-black text-3xl md:text-5xl text-white/10 absolute z-0 select-none">VS</div>

                        {/* Opp Die */}
                        <DieDisplay 
                            value={currentRoll.opp} 
                            rolling={gameState === 'rolling'} 
                            colorType="red" 
                        />
                    </div>

                    <div className="h-20 md:h-24 flex items-center justify-center w-full z-20">
                        <AnimatePresence mode='wait'>
                            {gameState === 'ready' ? (
                                <motion.button 
                                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                    onClick={playRound}
                                    className="bg-gradient-to-b from-gold-400 to-gold-600 text-royal-950 font-black text-lg md:text-xl py-4 md:py-5 px-12 md:px-16 rounded-full shadow-[0_10px_40px_rgba(251,191,36,0.4)] flex items-center gap-2 md:gap-3 border-t border-gold-300 transform transition-transform"
                                >
                                    <Zap size={20} className="md:w-6 md:h-6" fill="currentColor" /> ROLL DICE
                                </motion.button>
                            ) : gameState === 'rolling' ? (
                                <motion.div 
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="text-gold-400 font-black text-xl md:text-2xl animate-pulse tracking-[0.2em] uppercase"
                                >
                                    Rolling...
                                </motion.div>
                            ) : (
                                <motion.div 
                                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                                    className="text-center"
                                >
                                    <div className="text-[10px] md:text-xs text-slate-400 uppercase tracking-widest mb-1">Result</div>
                                    <div className={`text-2xl md:text-3xl font-black ${
                                        currentRoll.me > currentRoll.opp ? "text-gold-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" : 
                                        currentRoll.opp > currentRoll.me ? "text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "text-white"
                                    }`}>
                                        {currentRoll.me > currentRoll.opp ? "YOU WIN" : currentRoll.opp > currentRoll.me ? "OPPONENT WINS" : "DRAW"}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Provably Fair Hash */}
                    <div className="mt-4 md:mt-8 w-full max-w-xs mx-auto">
                        <div className="flex items-center gap-2 text-[8px] md:text-[10px] text-slate-500 uppercase tracking-wider mb-2 justify-center">
                            <Dna size={10} className="md:w-3 md:h-3" /> Server Seed Hash (SHA-256)
                        </div>
                        <div className="bg-black/40 p-2 md:p-3 rounded-xl border border-white/5 backdrop-blur-sm">
                            <p className="font-mono text-[8px] md:text-[9px] text-slate-600 break-all text-center leading-tight tracking-tight">
                                {serverHash}
                            </p>
                        </div>
                    </div>

                </div>

                {/* Opponent Card (Right/Bottom on Mobile) */}
                <div className={`glass-panel p-4 md:p-6 rounded-3xl border-2 transition-all duration-500 order-3 ${scores.opp > scores.me ? 'border-red-500 bg-royal-800/80 shadow-[0_0_30px_rgba(239,68,68,0.15)] scale-105' : 'border-transparent'}`}>
                    <div className="flex md:flex-col items-center justify-between md:justify-center md:text-center gap-4">
                        <div className="relative">
                            <img src={table.host?.avatar || "https://i.pravatar.cc/150"} alt="Opponent" className="w-12 h-12 md:w-20 md:h-20 rounded-full border-2 md:border-4 border-red-500 shadow-xl" />
                            <div className="absolute -bottom-2 md:-bottom-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] md:text-[10px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-wider shadow-lg">OPP</div>
                        </div>
                        
                        <div className="flex-1 md:flex-none">
                            <h3 className="text-sm md:text-xl font-bold text-white">{table.host?.name || "Opponent"}</h3>
                            <div className="text-[10px] md:text-xs text-red-400 font-mono">{table.host?.elo || 1000} ELO</div>
                        </div>
                        
                        <div className="flex flex-col items-end md:items-center">
                             <div className="text-3xl md:text-5xl font-display font-bold text-white">{scores.opp}</div>
                             <div className="flex gap-1 mt-1">
                                {[1,2,3].map(i => (
                                    <div key={i} className={`h-1.5 md:h-2 rounded-full transition-all duration-500 ${i <= scores.opp ? 'w-4 md:w-6 bg-red-500 shadow-[0_0_10px_red]' : 'w-1.5 md:w-2 bg-royal-900'}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
       </div>
    </div>
  );
};
