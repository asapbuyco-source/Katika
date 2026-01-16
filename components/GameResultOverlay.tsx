import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, XCircle, Home, RotateCcw, Coins, ShieldAlert, ArrowRight } from 'lucide-react';

interface GameResultOverlayProps {
  result: 'win' | 'loss' | 'quit';
  amount: number;
  onContinue: () => void;
}

export const GameResultOverlay: React.FC<GameResultOverlayProps> = ({ result, amount, onContinue }) => {
  const [displayAmount, setDisplayAmount] = useState(0);

  useEffect(() => {
    // Animate the number counting up
    const duration = 1500;
    const steps = 60;
    const increment = amount / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if ((amount > 0 && current >= amount) || (amount < 0 && current <= amount)) {
        setDisplayAmount(amount);
        clearInterval(timer);
      } else {
        setDisplayAmount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [amount]);

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
                {amount !== 0 && (
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
                                {displayAmount > 0 ? '+' : ''}{displayAmount.toLocaleString()} FCFA
                            </span>
                        </div>
                    </div>
                )}

                {/* Actions */}
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
      </motion.div>
    </div>
  );
};