
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Clock, Check, X, Shield } from 'lucide-react';
import { Challenge } from '../types';
import { playSFX } from '../services/sound';

interface ChallengeRequestModalProps {
  challenge: Challenge;
  onAccept: () => void;
  onDecline: () => void;
}

export const ChallengeRequestModal: React.FC<ChallengeRequestModalProps> = ({ challenge, onAccept, onDecline }) => {
  const [timeLeft, setTimeLeft] = useState(15); // 15 seconds to accept

  useEffect(() => {
    playSFX('notification');
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onDecline]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
        <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="relative w-full max-w-sm"
        >
            {/* Pulsing Background */}
            <div className="absolute inset-0 bg-gold-500/20 rounded-3xl blur-xl animate-pulse"></div>

            <div className="bg-royal-900 border-2 border-gold-500/50 rounded-3xl p-1 relative overflow-hidden shadow-2xl">
                
                {/* Progress Bar Top */}
                <div className="h-1 bg-royal-950 w-full absolute top-0 left-0 z-20">
                    <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: 15, ease: 'linear' }}
                        className="h-full bg-gold-500"
                    />
                </div>

                <div className="bg-gradient-to-b from-royal-800 to-royal-950 rounded-[20px] p-6 text-center relative z-10">
                    
                    <div className="mb-6 relative inline-block">
                        <div className="w-20 h-20 rounded-full border-4 border-gold-500 p-1 relative z-10 bg-royal-900">
                            <img src={challenge.sender.avatar} className="w-full h-full rounded-full object-cover" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-red-500 text-white p-1.5 rounded-full border-2 border-royal-900 z-20">
                            <Swords size={16} />
                        </div>
                    </div>

                    <h3 className="text-white font-bold text-lg mb-1">INCOMING CHALLENGE</h3>
                    <p className="text-slate-400 text-sm mb-4">
                        <span className="text-white font-bold">{challenge.sender.name}</span> wants to play <span className="text-gold-400 font-bold">{challenge.gameType}</span>
                    </p>

                    <div className="bg-black/30 border border-white/10 rounded-xl p-3 mb-6 flex justify-between items-center">
                        <div className="flex items-center gap-2 text-gold-400">
                            <Shield size={16} />
                            <span className="font-mono font-bold text-lg">{challenge.stake.toLocaleString()} FCFA</span>
                        </div>
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Stake</div>
                    </div>

                    <div className="flex gap-3">
                        <button 
                            onClick={onDecline}
                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            <X size={18} /> Decline
                        </button>
                        <button 
                            onClick={onAccept}
                            className="flex-1 py-3 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black rounded-xl shadow-lg shadow-gold-500/20 flex items-center justify-center gap-2 transition-colors animate-pulse"
                        >
                            <Check size={18} /> ACCEPT
                        </button>
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-500">
                        <Clock size={12} /> Auto-declining in {timeLeft}s
                    </div>

                </div>
            </div>
        </motion.div>
    </div>
  );
};
