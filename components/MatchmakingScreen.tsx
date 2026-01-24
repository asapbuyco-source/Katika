import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Lock } from 'lucide-react';
import { useUser, useSocket } from '../services/context';

export const MatchmakingScreen: React.FC = () => {
  const { user } = useUser();
  const { leaveGame, matchmakingStatus, socketGame } = useSocket();

  if (!user) return null;

  // Derive display data from socket game if available, or just generic searching
  // If socketGame is present, we are likely about to transition to 'game' view
  // but we can show opponent info here briefly.
  const opponent = socketGame?.players?.find((id: string) => id !== user.id);
  const oppProfile = socketGame?.profiles?.[opponent];

  return (
    <div className="fixed inset-0 z-50 bg-royal-950 flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
             <motion.div animate={{ scale: [1, 3], opacity: [0.3, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} className="w-[500px] h-[500px] rounded-full border border-gold-500/30" />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        <motion.div key={matchmakingStatus} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <h2 className="text-2xl font-display font-bold text-white mb-2">
                {matchmakingStatus === 'searching' && "Searching Global Pool..."}
                {matchmakingStatus === 'found' && "MATCH SECURED"}
            </h2>
            <div className="flex flex-col items-center gap-2">
                {matchmakingStatus === 'found' ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-green-500/20 border border-green-500/50 px-6 py-3 rounded-2xl flex items-center gap-3 text-green-400 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                        <Lock size={20} className="animate-pulse" />
                        <span className="font-bold font-mono tracking-wider">ESCROW LOCKED</span>
                    </motion.div>
                ) : (
                    <p className="text-slate-400 font-mono text-sm">Connecting to peer...</p>
                )}
            </div>
        </motion.div>

        <div className="flex items-center justify-center gap-8 md:gap-12 relative h-40">
            <motion.div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-gold-500 overflow-hidden relative z-10 bg-royal-800 shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                    <img src={user.avatar} alt="Me" className="w-full h-full object-cover" />
                </div>
            </motion.div>

            <div className="font-display font-black text-4xl text-white/20 italic">VS</div>

            <div className="relative">
                <AnimatePresence mode='wait'>
                    {matchmakingStatus === 'found' && oppProfile ? (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
                             <div className="w-24 h-24 rounded-full border-4 border-red-500 overflow-hidden relative z-10 bg-royal-800 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                                <img src={oppProfile.avatar} alt="Opponent" className="w-full h-full object-cover" />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }} className="w-24 h-24 rounded-full border-4 border-slate-700 bg-royal-900 flex items-center justify-center">
                            <Search className="text-slate-600" size={32} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>

        <div className="mt-16 space-y-3">
            {matchmakingStatus !== 'found' && (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={leaveGame} className="text-slate-500 hover:text-white text-sm font-medium transition-colors">
                    Cancel Matchmaking
                </motion.button>
            )}
        </div>
      </div>
    </div>
  );
};