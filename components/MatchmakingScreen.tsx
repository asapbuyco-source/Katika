
import React, { useEffect, useState, useRef } from 'react';
import { motion as originalMotion, AnimatePresence } from 'framer-motion';
import { User, Table, PlayerProfile } from '../types';
import { Search, Lock, AlertTriangle, Wifi, ShieldAlert, Zap } from 'lucide-react';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

const MATCHMAKING_TIMEOUT = 15; // seconds before match is guaranteed

interface MatchmakingScreenProps {
  user: User;
  gameType: string;
  stake: number;
  onMatchFound: (table: Table) => void;
  onCancel: () => void;
  isSocketMode?: boolean;
  isTournament?: boolean;
}

export const MatchmakingScreen: React.FC<MatchmakingScreenProps> = ({ user, gameType, stake, onMatchFound, onCancel, isSocketMode = false, isTournament = false }) => {
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'found'>('connecting');
  const [gameId, setGameId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<PlayerProfile | null>(null);
  const [countdown, setCountdown] = useState<number>(MATCHMAKING_TIMEOUT);
  const [countdownDone, setCountdownDone] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize Matchmaking
  useEffect(() => {
    let mounted = true;

    if (isSocketMode) {
        setStatus('waiting');
        return;
    }

    const initMatch = async () => {
        try {
            setStatus('waiting');
        } catch (error) {
            console.error("Matchmaking failed:", error);
        }
    };

    initMatch();

    return () => {
        mounted = false;
        if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, [user, gameType, stake, onMatchFound, isSocketMode]);

  // Countdown timer — only runs in socket waiting mode, not tournaments
  useEffect(() => {
    if (status !== 'waiting' || !isSocketMode || isTournament) return;

    setCountdown(MATCHMAKING_TIMEOUT);
    setCountdownDone(false);

    countdownRef.current = setInterval(() => {
        setCountdown(prev => {
            if (prev <= 1) {
                clearInterval(countdownRef.current!);
                setCountdownDone(true);
                return 0;
            }
            return prev - 1;
        });
    }, 1000);

    return () => {
        if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [status, isSocketMode, isTournament]);

  // Clear countdown when match is found
  useEffect(() => {
    if (status === 'found' && countdownRef.current) {
        clearInterval(countdownRef.current);
    }
  }, [status]);

  // Progress bar fill 0→100% over MATCHMAKING_TIMEOUT seconds
  const progress = ((MATCHMAKING_TIMEOUT - countdown) / MATCHMAKING_TIMEOUT) * 100;

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
                {status === 'waiting' && (countdownDone ? "Getting your match ready..." : "Waiting for Opponent...")}
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
                        <p className="text-slate-400 font-mono text-sm uppercase tracking-widest text-gold-500 font-bold">
                            {countdownDone ? "Preparing arena..." : (isSocketMode ? "Searching Arena..." : "Searching Global Pool...")}
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

        {/* Countdown Bar — only in socket mode, non-tournament, while waiting */}
        {status === 'waiting' && isSocketMode && !isTournament && (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-16 w-full max-w-sm mx-auto"
            >
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500 font-mono uppercase tracking-wider flex items-center gap-1">
                        <Zap size={11} className="text-gold-500" />
                        {countdownDone ? "Securing your match" : "Finding best match"}
                    </span>
                    <AnimatePresence mode="wait">
                        {!countdownDone && (
                            <motion.span
                                key={countdown}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.2 }}
                                transition={{ duration: 0.2 }}
                                className="text-xs font-mono font-bold text-gold-400 tabular-nums"
                            >
                                {countdown}s
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-royal-800 rounded-full overflow-hidden">
                    <motion.div
                        className={`h-full rounded-full ${countdownDone ? 'bg-green-500' : 'bg-gold-500'}`}
                        initial={{ width: '0%' }}
                        animate={{ width: countdownDone ? '100%' : `${progress}%` }}
                        transition={{ ease: 'linear', duration: countdownDone ? 0.3 : 1 }}
                    />
                </div>
            </motion.div>
        )}

        {/* Warning Block */}
        <div className={`${status === 'waiting' && isSocketMode && !isTournament ? 'mt-4' : 'mt-16'} w-full max-w-sm mx-auto`}>
            {status !== 'found' && (
                <>
                    {isTournament ? (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3 text-left mb-6">
                            <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-red-500 uppercase tracking-wide">Arena Rules</p>
                                <p className="text-[11px] text-red-200/70 leading-relaxed">
                                    Your opponent has not arrived yet. If they do not join within <span className="font-bold text-white">5 minutes</span> of the match start time, they will automatically forfeit, and you will advance. Stay on this screen.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex items-start gap-3 text-left mb-6">
                            <ShieldAlert className="text-yellow-500 shrink-0 mt-0.5" size={18} />
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-yellow-500 uppercase tracking-wide">Do not leave this screen</p>
                                <p className="text-[11px] text-yellow-200/70 leading-relaxed">
                                    Minimizing the app or closing the browser during matchmaking may result in a connection drop or forfeit of your stake.
                                </p>
                            </div>
                        </div>
                    )}

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


