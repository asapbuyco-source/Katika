import React from 'react';
import { motion } from 'framer-motion';

interface StreakBadgeProps {
    streak: number; // consecutive wins
    className?: string;
}

const STREAK_CONFIG = [
    { min: 2, max: 2, emoji: '🔥', label: 'Win Streak', color: 'from-orange-500/20 to-amber-500/20', border: 'border-orange-500/50', text: 'text-orange-400' },
    { min: 3, max: 4, emoji: '🔥🔥', label: 'Hot Streak!', color: 'from-orange-600/25 to-red-500/20', border: 'border-orange-400/60', text: 'text-orange-300' },
    { min: 5, max: 9, emoji: '⚡🔥', label: 'On Fire!', color: 'from-red-500/30 to-orange-500/25', border: 'border-red-400/70', text: 'text-red-300' },
    { min: 10, max: Infinity, emoji: '👑🔥', label: 'Unstoppable!', color: 'from-gold-500/30 to-orange-500/25', border: 'border-gold-400/80', text: 'text-gold-300' },
];

export const StreakBadge: React.FC<StreakBadgeProps> = ({ streak, className = '' }) => {
    if (streak < 2) return null;

    const config = STREAK_CONFIG.find(c => streak >= c.min && streak <= c.max) || STREAK_CONFIG[0];

    return (
        <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${config.color} border ${config.border} ${className}`}
        >
            <motion.span
                animate={{ rotate: [0, -8, 8, -8, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                className="text-base leading-none"
            >
                {config.emoji}
            </motion.span>
            <span className={`text-xs font-black uppercase tracking-wide ${config.text}`}>
                {streak}× {config.label}
            </span>
        </motion.div>
    );
};
