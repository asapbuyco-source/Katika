import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, XCircle, Home, RotateCcw, Coins, ShieldAlert, ArrowRight, Wallet, Percent, Users, Loader2 } from 'lucide-react';

interface GameResultOverlayProps {
  result: 'win' | 'loss' | 'quit';
  amount: number; // This is now the NET winnings if win
  financials?: {
      totalPot: number;
      platformFee: number;
      winnings: number;
  };
  onContinue: () => void;
  // Rematch Props
  onRematch?: () => void;
  rematchStatus?: 'idle' | 'requested' | 'opponent_requested' | 'declined';
  stake?: number;
  userBalance?: number;
}

export const GameResultOverlay: React.FC<GameResultOverlayProps> = ({ 
    result, 
    amount, 
    financials, 
    onContinue,
    onRematch,
    rematchStatus = 'idle',
    stake = 0,
    userBalance = 0
}) => {
  const [displayAmount, setDisplayAmount] = useState(0);

  // If financials provided, use those, else use amount prop
  const netAmount = financials ? financials.winnings : amount;
  const fee = financials ? financials.platformFee : 0;
  const pot = financials ? financials.totalPot : 0;

  useEffect(() => {
    // Animate the number counting up
    const duration = 1500;
    const steps = 60;
    const target = result === 'win' ? netAmount : 0;
    const increment = target / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setDisplayAmount(target);
        clearInterval(timer);
      } else {
        setDisplayAmount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [netAmount, result]);

  // Confetti Particles
  const particles = Array.from({ length: 50 });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
      {/* Confetti for Win */}
      {result === 'win' && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                y: -20, 
                x: Math.random() * window.innerWidth, 
                rotate: 0,
                opacity: 1
              }}
              animate={{ 
                y: window.innerHeight + 20, 
                rotate: 360 + Math.random() * 360,
                opacity: 0 
              }}
              transition={{ 
                duration: 2 + Math.random() * 3, 
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: "linear"
              }}
              className={`absolute w-3 h-3 rounded-sm ${
                ['bg-gold-400', 'bg-cam-red', 'bg-cam-green', 'bg-purple-400'][Math.floor(Math.random() * 4)]
              }`}
            />
          ))}
        </div>
      )}

      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="relative max-w-sm w-full"
      >
        {/* Glow Effect */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] rounded-full blur-[100px] -z-10 ${
            result === 'win' ? 'bg-gold-500/30' : 'bg-red-500/20'
        }`} />

        <div className={`
            glass-panel rounded-3xl p-1 border-2 overflow-hidden shadow-2xl relative
            ${result === 'win' ? 'border-gold-500/50 bg-royal-900/90' : 'border-red-500/30 bg-black/90'}
        `}>
             <div className="relative p-8 flex flex-col items-center text-center z-10">
                
                {/* Icon Header */}
                <div className="mb-6 relative">
                    {result === 'win' ? (
                        <>
                            <div className="absolute inset-0 bg-gold-400 blur-2xl opacity-40 animate-pulse"></div>
                            <motion.div 
                                animate={{ rotate: [0, -10, 10, 0] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <Trophy size={80} className="text-gold-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" fill="currentColor" />
                            </motion.div>
                        </>
                    ) : (
                        <>
                            <div className="absolute inset-0 bg-red-500 blur-2xl opacity-20"></div>
                            <XCircle size={80} className="text-red-500" />
                        </>
                    )}
                </div>

                {/* Text Content */}
                <h2 className={`text-4xl font-display font-black uppercase mb-2 ${
                    result === 'win' ? 'text-transparent bg-clip-text bg-gradient-to-b from-white to-gold-400' : 'text-slate-200'
                }`}>
                    {result === 'win' ? 'Victory!' : result === 'quit' ? 'Draw' : 'Defeat'}
                </h2>
                
                <p className="text-slate-400 mb-8 text-sm">
                    {result === 'win' ? 'Great match! Your winnings have been secured.' : 'Better luck next time. Your skill is improving.'}
                </p>

                {/* Money Animation */}
                {result === 'win' && financials ? (
                    <div className="mb-8 w-full bg-royal-950/50 rounded-2xl p-4 border border-white/10">
                        <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
                            <span>Total Pot</span>
                            <span className="font-mono">{pot.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-red-400 mb-4 pb-2 border-b border-white/10">
                            <span className="flex items-center gap-1"><Percent size={10} /> Platform Fee (10%)</span>
                            <span className="font-mono">-{fee.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1">Net Winnings</div>
                            <div className="text-3xl font-mono font-bold text-white text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600">
                                {displayAmount.toLocaleString()} <span className="text-xs text-slate-500">FCFA</span>
                            </div>
                        </div>
                    </div>
                ) : amount !== 0 && (
                    <div className="mb-8 w-full">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                            {result === 'win' ? 'Winnings Added' : 'Stake Lost'}
                        </div>
                        <div className={`
                            py-4 px-6 rounded-2xl border flex items-center justify-center gap-3 text-2xl font-mono font-bold
                            ${result === 'win' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}
                        `}>
                            {result === 'win' ? <Coins size={24} /> : <ShieldAlert size={24} />}
                            <span>
                                {result === 'win' ? '+' : ''}{result === 'win' ? displayAmount.toLocaleString() : amount.toLocaleString()} FCFA
                            </span>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="w-full space-y-3">
                    {/* REMATCH BUTTON */}
                    {onRematch && (
                        <div className="w-full">
                            {rematchStatus === 'declined' ? (
                                <div className="text-red-400 text-xs font-bold bg-red-500/10 p-2 rounded-lg mb-2 border border-red-500/20">
                                    Opponent Declined Rematch
                                </div>
                            ) : null}
                            
                            <button 
                                onClick={onRematch}
                                disabled={rematchStatus === 'requested' || rematchStatus === 'declined'}
                                className={`
                                    w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 border
                                    ${rematchStatus === 'opponent_requested' 
                                        ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/30 border-transparent animate-pulse' 
                                        : 'bg-white/5 text-gold-400 border-gold-500/30 hover:bg-gold-500/10'}
                                    ${rematchStatus === 'requested' ? 'opacity-70 cursor-not-allowed' : ''}
                                `}
                            >
                                {rematchStatus === 'requested' ? (
                                    <><Loader2 size={18} className="animate-spin" /> Waiting for Opponent...</>
                                ) : rematchStatus === 'opponent_requested' ? (
                                    <><RotateCcw size={18} /> Accept Rematch</>
                                ) : (
                                    <><RotateCcw size={18} /> Request Rematch</>
                                )}
                            </button>
                            {rematchStatus !== 'requested' && stake > 0 && (
                                <div className={`text-[10px] mt-1 ${userBalance >= stake ? 'text-slate-500' : 'text-red-400'}`}>
                                    {userBalance >= stake 
                                        ? `Stake: ${stake} FCFA (Available: ${userBalance})` 
                                        : `Insufficient funds for rematch (Need ${stake})`
                                    }
                                </div>
                            )}
                        </div>
                    )}

                    <button 
                        onClick={onContinue}
                        className={`
                            w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95
                            ${result === 'win' ? 'bg-gold-500 text-royal-950 hover:bg-gold-400 shadow-gold-500/20' : 'bg-white/10 text-white hover:bg-white/20'}
                        `}
                    >
                        {result === 'win' ? 'Claim Winnings' : 'Return to Lobby'} <ArrowRight size={20} />
                    </button>
                </div>
             </div>
        </div>
      </motion.div>
    </div>
  );
};