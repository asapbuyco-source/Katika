
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ForfeitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ForfeitModal: React.FC<ForfeitModalProps> = ({ isOpen, onClose, onConfirm }) => {
  return (
    <AnimatePresence>
        {isOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                    onClick={onClose} 
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
                />
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} 
                    className="relative bg-royal-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                >
                    <div className="flex flex-col items-center text-center mb-6">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                            <AlertTriangle className="text-red-500" size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                        <p className="text-sm text-slate-400">
                            Leaving now will result in an <span className="text-red-400 font-bold">immediate loss</span> of your stake.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition-colors">
                            Resume
                        </button>
                        <button onClick={onConfirm} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors">
                            Forfeit
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
    </AnimatePresence>
  );
};
