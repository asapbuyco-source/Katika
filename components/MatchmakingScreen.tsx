
import React, { useEffect, useState, useRef } from 'react';
import { motion as originalMotion, AnimatePresence } from 'framer-motion';
import { User, Table, PlayerProfile } from '../types';
import { Search, Lock, AlertTriangle, Wifi, ShieldAlert } from 'lucide-react';
import { findOrCreateMatch, subscribeToGame } from '../services/firebase';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

interface MatchmakingScreenProps {
  user: User;
  gameType: string;
  stake: number;
  onMatchFound: (table: Table) => void;
  onCancel: () => void;
  isSocketMode?: boolean; // New prop to toggle behavior
}

export const MatchmakingScreen: React.FC<MatchmakingScreenProps> = ({ user, gameType, stake, onMatchFound, onCancel, isSocketMode = false }) => {
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'found'>('connecting');
  const [gameId, setGameId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<PlayerProfile | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize Matchmaking
  useEffect(() => {
    let mounted = true;

    // If using Socket Mode, we don't use Firebase Matchmaking here.
    // We just wait for the parent component (App.tsx) to tell us a match is found via props/view change.
    if (isSocketMode) {
        setStatus('waiting');
        return;
    }

    const initMatch = async () => {
        try {
            const id = await findOrCreateMatch(user, gameType, stake);
            if (!mounted) return;
            setGameId(id);
            setStatus('waiting');

            // Listen for opponent
            unsubscribeRef.current = subscribeToGame(id, (gameData) => {
                if (!mounted) return;

                // Check if game is active (opponent joined)
                if (gameData.status === 'active' && gameData.guest && gameData.host) {
                    const isHost = gameData.host.id === user.id;
                    const opp = isHost ? gameData.guest : gameData.host;
                    
                    setOpponent({
                        name: opp.name,
                        avatar: opp.avatar,
                        elo: opp.elo,
                        rankTier: opp.rankTier
                    });
                    setStatus('found');

                    // Delay slightly to show "Match Found" UI before switching views
                    setTimeout(() => {
                        const table: Table = {
                            id: gameData.id,
                            gameType: gameData.gameType,
                            stake: gameData.stake,
                            players: 2,
                            maxPlayers: 2,
                            status: 'active',
                            host: opp // For the game view, 'host' visually usually means opponent in top bar
                        };
                        onMatchFound(table);
                    }, 2000);
                }
            });

        } catch (error) {
            console.error("Matchmaking failed:", error);
            // Handle error (maybe retry or show alert)
        }
    };

    initMatch();

    return () => {
        mounted = false;
        if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, [user, gameType, stake, onMatchFound, isSocketMode]);

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
                {status === 'connecting' && "Accessing Vantage Network..."}
                {status === 'waiting' && (isSocketMode ? "Connecting to Real-time Server..." : "Waiting for Opponent...")}
                {status === 'found' && "MATCH SECURED"}
            </h2>
            
            <div className="flex flex-col items-center gap-2">
                {status === 'found' ? (
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-green-500/20 border border-green-500/50 px-6 py-3 rounded-2xl flex items-center gap-3 text-green-400 shadow-[0_0_30px_rgba(34,197,94,0.3)]"
                    >
                        <Lock size={20} className="animate-pulse" />
                        <span className="font-bold font-mono tracking-wider">ESCROW LOCKED: {(stake * 2).toLocaleString()} FCFA</span>
                    </motion.div>
                ) : (
                    <>
                        <p className="text-slate-400 font-mono text-sm">
                            {isSocketMode ? "Searching for players..." : "Searching Global Pool..."}
                        </p>
                        <div className="px-3 py-1 bg-royal-800 rounded-full border border-gold-500/30 text-gold-400 text-xs font-bold">
                            Stake: {stake.toLocaleString()} FCFA
                        </div>
                    </>
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
                    {status === 'found' && opponent ? (
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="relative"
                        >
                             <div className="w-24 h-24 rounded-full border-4 border-red-500 overflow-hidden relative z-10 bg-royal-800 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                                <img src={opponent.avatar} alt="Opponent" className="w-full h-full object-cover" />
                            </div>
                            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                <div className="font-bold text-white">{opponent.name}</div>
                                <div className="text-xs text-red-400 font-mono">{opponent.elo} ELO</div>
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

        {/* Warning Block */}
        <div className="mt-16 w-full max-w-sm">
            {status !== 'found' && (
                <>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex items-start gap-3 text-left mb-6">
                        <ShieldAlert className="text-yellow-500 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-yellow-500 uppercase tracking-wide">Do not leave this screen</p>
                            <p className="text-[11px] text-yellow-200/70 leading-relaxed">
                                Minimizing the app or closing the browser during matchmaking may result in a connection drop or forfeit of your stake.
                            </p>
                        </div>
                    </div>

                    <motion.button 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={onCancel}
                        className="w-full text-slate-500 hover:text-white text-sm font-medium transition-colors py-2"
                    >
                        Cancel Matchmaking
                    </motion.button>
                </>
            )}
        </div>

      </div>
    </div>
  );
};
