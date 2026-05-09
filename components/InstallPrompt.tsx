import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, X } from 'lucide-react';

const DISMISSED_KEY = 'vantage_install_prompt_dismissed';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
        || (navigator as any).standalone
        || document.referrer.includes('android-app://');
}

function isIOS(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/.test(ua);
}

export const InstallPrompt: React.FC = () => {
    const [showPrompt, setShowPrompt] = useState(false);
    const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

    const dismiss = useCallback(() => {
        setShowPrompt(false);
        try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
    }, []);

    useEffect(() => {
        if (isStandalone()) return;
        try {
            if (localStorage.getItem(DISMISSED_KEY) === '1') return;
        } catch {}

        if (isIOS()) {
            setPlatform('ios');
            const timer = setTimeout(() => setShowPrompt(true), 2000);
            return () => clearTimeout(timer);
        }

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setPlatform('android');
            setTimeout(() => setShowPrompt(true), 2000);
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setShowPrompt(false);
        } else {
            dismiss();
        }
        setDeferredPrompt(null);
    };

    if (!showPrompt || !platform) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="w-full max-w-sm bg-royal-900 border border-gold-500/30 rounded-2xl p-5 shadow-2xl"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                                <Download size={20} className="text-gold-500" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-sm">
                                    Install Vantage Gaming
                                </h3>
                                <p className="text-slate-400 text-xs">
                                    {platform === 'android'
                                        ? 'Add to home screen for quick access'
                                        : 'Install this app on your iPhone'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={dismiss}
                            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                        >
                            <X size={16} className="text-slate-400" />
                        </button>
                    </div>

                    {platform === 'android' ? (
                        <button
                            onClick={handleInstall}
                            className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-royal-950 font-bold rounded-xl transition-all active:scale-[0.98]"
                        >
                            Install App
                        </button>
                    ) : (
                        <div className="space-y-3">
                            <div className="bg-royal-800/50 rounded-xl p-3 flex items-center gap-3">
                                <Share2 size={18} className="text-gold-500 shrink-0" />
                                <p className="text-slate-300 text-xs">
                                    Tap <span className="text-white font-semibold">Share</span> in Safari,
                                    then <span className="text-white font-semibold">Add to Home Screen</span>
                                </p>
                            </div>
                            <button
                                onClick={dismiss}
                                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-medium rounded-xl transition-colors text-sm"
                            >
                                Got it
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
