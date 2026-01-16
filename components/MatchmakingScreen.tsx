
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Table, PlayerProfile } from '../types';
import { Search, Lock } from 'lucide-react';

interface MatchmakingScreenProps {
  user: User;
  gameType: string;
  stake: number;
  onMatchFound: (table: Table) => void;
  onCancel: () => void;
}

export const MatchmakingScreen: React.FC<MatchmakingScreenProps> = ({ user, gameType, stake, onMatchFound, onCancel }) => {
  const [status, setStatus] = useState<'connecting' | 'scanning' | 'analyzing' | 'found'>('connecting');
  const [foundOpponent, setFoundOpponent] = useState<PlayerProfile | null>(null);

  // Simulated Matchmaking Logic
  useEffect(() => {
    const sequence = async () => {
      // Step 1: Connecting
      await new Promise(r => setTimeout(r, 1000));
      setStatus('scanning');

      // Step 2: Scanning for ELO match
      await new Promise(r => setTimeout(r, 2000));
      setStatus('analyzing');

      // Step 3: Analyzing specific opponents
      await new Promise(r => setTimeout(r, 1500));
      
      // Step 4: Found Match
      const mockOpponent: PlayerProfile = {
        name: 'Jean-Paul',
        elo: user.elo + Math.floor(Math.random() * 50) - 25, // +/- 25 ELO
        rankTier: user.rankTier,
        avatar: 'https://i.pravatar.cc/150?u=JeanPaul'
      };
      setFoundOpponent(mockOpponent);
      setStatus('found');

      // Step 5: Launch Game (Delay allows user to see "Escrow Secured")
      await new Promise(r => setTimeout(r, 3000));
      
      const newTable: Table = {
        id: `match-${Date.now()}`,
        gameType: gameType as any,
        stake: stake,
        players: 2,
        maxPlayers: 2,
        status: 'active',
        host: mockOpponent
      };
      onMatchFound(newTable);
    };

    sequence();
  }, [user, gameType, stake, onMatchFound]);

  return (
    <div className="fixed inset-0 z-50 bg-royal-950 flex flex-col items-center justify-center p-6">
      {/* Background Pulse */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
             <motion.div 
                animate={{ scale: [1, 3], opacity: [0.3, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                className="w-[500px] h-[500px] rounded-full border border-gold-500/30"
             />
             <motion.div 
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ duration: 2, delay: 0.5, repeat: Infinity, ease: "easeOut" }}
                className="w-[500px] h-[500px] rounded-full border border-gold-500/20 absolute top-0 left-0"
             />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        
        {/* Status Text */}
        <motion.div
            key={status}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
        >
            <h2 className="text-2xl font-display font-bold text-white mb-2">
                {status === 'connecting' && "Connecting to Vantage Network..."}
                {status === 'scanning' && `Searching for ${user.rankTier} Opponents...`}
                {status === 'analyzing' && "Analyzing Skill Compatibility..."}
                {status === 'found' && "MATCH CONFIRMED"}
            </h2>
            
            <div className="flex flex-col items-center gap-2">
                {status !== 'found' ? (
                    <>
                        <p className="text-slate-400 font-mono text-sm">
                            ELO Range: {user.elo - 100} - {user.elo + 100}
                        </p>
                        <div className="px-3 py-1 bg-royal-800 rounded-full border border-gold-500/30 text-gold-400 text-xs font-bold">
                            Stake: {stake.toLocaleString()} FCFA
                        </div>
                    </>
                ) : (
                    /* THE HANDSHAKE ANIMATION */
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-green-500/20 border border-green-500/50 px-6 py-3 rounded-2xl flex items-center gap-3 text-green-400 shadow-[0_0_30px_rgba(34,197,94,0.3)]"
                    >
                        <Lock size={20} className="animate-pulse" />
                        <span className="font-bold font-mono tracking-wider">ESCROW LOCKED: {stake * 2} FCFA</span>
                    </motion.div>
                )}
            </div>
        </motion.div>

        {/* Avatars */}
        <div className="flex items-center justify-center gap-8 md:gap-12 relative h-40">
            
            {/* User Avatar */}
            <motion.div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-gold-500 overflow-hidden relative z-10 bg-royal-800 shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                    <img src={user.avatar} alt="Me" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <div className="font-bold text-white">{user.name}</div>
                    <div className="text-xs text-gold-400 font-mono">{user.elo} ELO</div>
                </div>
            </motion.div>

            {/* VS Badge */}
            <div className="font-display font-black text-4xl text-white/20 italic">VS</div>

            {/* Opponent Avatar */}
            <div className="relative">
                <AnimatePresence mode='wait'>
                    {status === 'found' && foundOpponent ? (
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="relative"
                        >
                             <div className="w-24 h-24 rounded-full border-4 border-red-500 overflow-hidden relative z-10 bg-royal-800 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                                <img src={foundOpponent.avatar} alt="Opponent" className="w-full h-full object-cover" />
                            </div>
                            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                <div className="font-bold text-white">{foundOpponent.name}</div>
                                <div className="text-xs text-red-400 font-mono">{foundOpponent.elo} ELO</div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1, repeat: Infinity }}
                            className="w-24 h-24 rounded-full border-4 border-slate-700 bg-royal-900 flex items-center justify-center"
                        >
                            <Search className="text-slate-600" size={32} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

        </div>

        {/* Cancel Button */}
        {status !== 'found' && (
            <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onCancel}
                className="mt-20 text-slate-500 hover:text-white text-sm font-medium transition-colors"
            >
                Cancel Matchmaking
            </motion.button>
        )}

      </div>
    </div>
  );
};
