import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Gamepad2, Coins, Users, Check, Wallet } from 'lucide-react';
import { User } from '../types';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface OnboardingProps {
    user: User;
    onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ user, onComplete }) => {
    const [step, setStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const steps = [
        {
            icon: <Coins size={50} className="text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />,
            title: "Welcome Gift: 100 FCFA",
            description: "Thanks for joining Katika! We've credited your account with 100 FCFA to get you started. Use it to play your first match and win real cash!",
            bg: "from-amber-600/40 to-royal-900/40"
        },
        {
            icon: <Gamepad2 size={40} className="text-blue-400" />,
            title: "Play Real Matches",
            description: "Compete against real people in Ludo, Chess, Checkers, and more. 100% fair play guaranteed by our AI Referee.",
            bg: "from-blue-900/40 to-royal-900/40"
        },
        {
            icon: <Wallet size={40} className="text-green-400" />,
            title: "Instant Withdrawals",
            description: "Deposit and withdraw instantly using Mobile Money (MTN & Orange). Your funds are fully secure in Escrow during matches.",
            bg: "from-green-900/40 to-royal-900/40"
        },
        {
            icon: <Users size={40} className="text-purple-400" />,
            title: "100 FCFA Referral Bonus",
            description: "Share your referral code! When a friend deposits, you earn 100 FCFA. Wager it in matches, and when you win, it becomes real withdrawable cash!",
            bg: "from-purple-900/40 to-royal-900/40"
        }
    ];

    const handleNext = async () => {
        if (step < steps.length - 1) {
            setStep(s => s + 1);
        } else {
            setIsLoading(true);
            try {
                // Update Firestore so the user doesn't see this again
                const userRef = doc(db, 'users', user.id);
                await updateDoc(userRef, { hasSeenOnboarding: true });
                onComplete();
            } catch (err) {
                console.error("Failed to update onboarding status", err);
                onComplete(); // Failsafe
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-royal-900/90 border border-white/10 rounded-3xl max-w-sm w-full relative overflow-hidden shadow-2xl"
            >
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ x: 50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -50, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className={`p-8 pb-10 bg-gradient-to-br ${steps[step].bg} flex flex-col items-center text-center h-full`}
                    >
                        <div className="w-20 h-20 bg-royal-950 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-white/5">
                            {steps[step].icon}
                        </div>
                        <h2 className="text-2xl font-display font-bold text-white mb-3">
                            {steps[step].title}
                        </h2>
                        <p className="text-slate-300 text-sm leading-relaxed mb-8">
                            {steps[step].description}
                        </p>
                    </motion.div>
                </AnimatePresence>

                <div className="p-6 bg-royal-950 border-t border-white/10 flex items-center justify-between">
                    <div className="flex gap-2">
                        {steps.map((_, i) => (
                            <div 
                                key={i} 
                                className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-gold-400' : 'w-2 bg-slate-700'}`}
                            />
                        ))}
                    </div>

                    <button
                        onClick={handleNext}
                        disabled={isLoading}
                        className="px-6 py-3 bg-white text-royal-950 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? (
                            <span className="animate-pulse">Saving...</span>
                        ) : step === steps.length - 1 ? (
                            <>Get Started <Check size={18} /></>
                        ) : (
                            <>Next <ChevronRight size={18} /></>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};
