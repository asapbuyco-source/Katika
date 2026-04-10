import React, { useEffect, useState, useRef } from 'react';
import { db } from '../services/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

const GAME_ICONS: Record<string, string> = {
    Dice: '🎲', Chess: '♟️', Pool: '🎱', TicTacToe: '✖️',
    Checkers: '🔴', Cards: '🃏', Ludo: '🎮'
};

interface WinEvent {
    id: string;
    playerName: string;
    playerAvatar: string;
    gameType: string;
    amount: number;
}

export const LiveWinFeed: React.FC = () => {
    const [events, setEvents] = useState<WinEvent[]>([]);
    const [visible, setVisible] = useState<WinEvent | null>(null);
    const queueRef = useRef<WinEvent[]>([]);
    const timerRef = useRef<any>(null);

    useEffect(() => {
        const q = query(
            collection(db, 'live_winners'),
            orderBy('timestamp', 'desc'),
            limit(20)
        );
        const unsub = onSnapshot(q, (snap) => {
            const newEvents: WinEvent[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as WinEvent));
            queueRef.current = newEvents;
            if (!timerRef.current) showNext();
        });
        return () => { unsub(); clearTimeout(timerRef.current); };
    }, []);

    const showNext = () => {
        const next = queueRef.current.shift();
        if (!next) {
            timerRef.current = setTimeout(showNext, 5000);
            return;
        }
        setVisible(next);
        timerRef.current = setTimeout(() => {
            setVisible(null);
            timerRef.current = setTimeout(showNext, 1200);
        }, 4500);
    };

    if (!visible) return null;

    const short = visible.playerName.length > 12
        ? visible.playerName.slice(0, 12) + '…'
        : visible.playerName;

    return (
        <AnimatePresence>
            <motion.div
                key={visible.id}
                initial={{ x: '110%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '110%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed bottom-20 right-3 z-[90] pointer-events-none"
            >
                <div className="flex items-center gap-3 bg-[#181830]/90 backdrop-blur-md border border-gold-500/40 rounded-2xl px-4 py-2.5 shadow-[0_0_24px_rgba(251,191,36,0.15)]">
                    {/* Avatar */}
                    <img src={visible.playerAvatar} alt={short}
                        className="w-8 h-8 rounded-full border-2 border-gold-400 object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(visible.playerName)}`; }}
                    />
                    <div className="flex flex-col leading-tight">
                        <span className="text-white text-xs font-bold">{short}</span>
                        <span className="text-slate-400 text-[10px]">
                            just won {GAME_ICONS[visible.gameType] || '🎮'} {visible.gameType}
                        </span>
                    </div>
                    <div className="text-gold-400 font-black text-sm ml-1 tabular-nums">
                        +{visible.amount.toLocaleString()} <span className="text-[9px] text-gold-500/70">FCFA</span>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
