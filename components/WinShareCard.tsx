import React from 'react';
import { useLanguage } from '../services/i18n';
import { playSFX } from '../services/sound';
import { Share2, Trophy, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WinShareCardProps {
    winnerName: string;
    amount: number;
    gameType: string;
    referralCode: string;
    onClose: () => void;
}

export const WinShareCard: React.FC<WinShareCardProps> = ({
    winnerName,
    amount,
    gameType,
    referralCode,
    onClose
}) => {
    const { t } = useLanguage();

    const shareMessage = `${t('share_text').replace('{amount}', amount.toLocaleString())} Playing ${gameType}!\nJoin me with code ${referralCode} for 200 FCFA bonus 🎮\nvantage.gg`;

    const handleShare = () => {
        playSFX('win');
        if (navigator.share) {
            navigator.share({
                title: 'Vantage Gaming — I Won!',
                text: shareMessage,
                url: window.location.origin
            }).catch(() => {/* user cancelled */});
        } else {
            // WhatsApp fallback
            window.open(
                `https://wa.me/?text=${encodeURIComponent(shareMessage)}`,
                '_blank',
                'noopener,noreferrer'
            );
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.8, y: 40 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.8, y: 40 }}
                    transition={{ type: 'spring', damping: 18 }}
                    onClick={e => e.stopPropagation()}
                    className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
                    style={{
                        background: 'linear-gradient(135deg, #0f1629 0%, #1a2550 50%, #0f1629 100%)',
                        border: '1px solid rgba(251,191,36,0.3)'
                    }}
                >
                    {/* Glowing top bar */}
                    <div className="h-1 w-full bg-gradient-to-r from-yellow-500 via-gold-400 to-yellow-600" />

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
                    >
                        <X size={20} />
                    </button>

                    <div className="p-8 text-center">
                        {/* Trophy icon with glow */}
                        <div className="relative inline-block mb-4">
                            <motion.div
                                animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
                                transition={{ duration: 0.6, delay: 0.3 }}
                            >
                                <Trophy size={56} className="text-gold-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]" />
                            </motion.div>
                        </div>

                        <h2 className="text-2xl font-display font-black text-white mb-1">
                            {winnerName} Won! 🎉
                        </h2>
                        <p className="text-slate-400 text-sm mb-4">{gameType}</p>

                        {/* Amount badge */}
                        <div className="inline-flex items-center gap-2 bg-gold-500/10 border border-gold-500/30 rounded-2xl px-6 py-3 mb-6">
                            <span className="text-3xl font-display font-black text-gold-400">
                                +{amount.toLocaleString()}
                            </span>
                            <span className="text-gold-300 font-bold text-lg">FCFA</span>
                        </div>

                        {/* Referral code display */}
                        <div className="bg-black/30 rounded-xl p-4 mb-6 border border-white/5">
                            <p className="text-xs text-slate-500 mb-1">🎁 Challenge your friends — use your code</p>
                            <p className="font-mono text-gold-400 font-bold text-xl tracking-widest">{referralCode}</p>
                            <p className="text-xs text-slate-500 mt-1">They get 200 FCFA free on signup</p>
                        </div>

                        {/* Share button */}
                        <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={handleShare}
                            className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black rounded-2xl transition-all shadow-[0_0_25px_rgba(34,197,94,0.3)] flex items-center justify-center gap-3 text-lg"
                        >
                            <Share2 size={22} />
                            {t('share_win')} via WhatsApp
                        </motion.button>

                        <button
                            onClick={onClose}
                            className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            Skip
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
