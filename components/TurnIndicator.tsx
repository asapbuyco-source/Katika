
import React from 'react';
import { motion } from 'framer-motion';

interface TurnIndicatorProps {
  isMyTurn: boolean;
  myLabel?: string;
  opponentLabel?: string;
}

export const TurnIndicator: React.FC<TurnIndicatorProps> = ({ 
    isMyTurn, 
    myLabel = "YOUR TURN", 
    opponentLabel = "OPPONENT'S TURN" 
}) => {
  return (
    <div className="flex justify-center mb-4">
        <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            key={isMyTurn ? 'my' : 'opp'}
            className={`px-8 py-2 rounded-full font-black text-sm uppercase tracking-widest shadow-lg border transition-all duration-300 ${
                isMyTurn 
                ? 'bg-gold-500 text-royal-950 border-gold-400 scale-105 shadow-gold-500/20' 
                : 'bg-royal-800 text-slate-400 border-white/10'
            }`}
        >
            {isMyTurn ? myLabel : opponentLabel}
        </motion.div>
    </div>
  );
};
