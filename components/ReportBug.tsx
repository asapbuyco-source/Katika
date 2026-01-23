import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bug, Paperclip, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { playSFX } from '../services/sound';
import { submitBugReport } from '../services/firebase';
import { User } from '../types';

interface ReportBugProps {
  onBack: () => void;
  user?: User | null;
}

export const ReportBug: React.FC<ReportBugProps> = ({ onBack, user }) => {
  const [step, setStep] = useState<'form' | 'submitting' | 'success'>('form');
  const [severity, setSeverity] = useState('low');
  const [description, setDescription] = useState('');
  const [reproduce, setReproduce] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      playSFX('click');
      setStep('submitting');
      
      const reportData = {
          userId: user?.id || 'guest',
          userName: user?.name || 'Guest User',
          severity: severity as any,
          description,
          reproduceSteps: reproduce
      };

      await submitBugReport(reportData);
      
      setStep('success');
      playSFX('win');
  };

  return (
    <div className="min-h-screen bg-royal-950 p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-lg">
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-display font-bold text-white">Report an Issue</h1>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-white/10 bg-royal-900/50">
                <AnimatePresence mode='wait'>
                    {step === 'form' && (
                        <motion.form 
                            key="form"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            onSubmit={handleSubmit} 
                            className="space-y-6"
                        >
                            <div className="flex items-start gap-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                                <Bug className="text-yellow-500 shrink-0" size={24} />
                                <div className="text-xs text-yellow-200/80 leading-relaxed">
                                    Please describe the issue clearly. If you lost funds due to a bug, include the Match ID from your history.
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Severity Level</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['low', 'medium', 'critical'].map((level) => (
                                        <button
                                            type="button"
                                            key={level}
                                            onClick={() => setSeverity(level)}
                                            className={`py-2 px-4 rounded-lg text-sm font-bold capitalize border transition-colors ${
                                                severity === level 
                                                ? (level === 'critical' ? 'bg-red-500 border-red-500 text-white' : level === 'medium' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-blue-500 border-blue-500 text-white')
                                                : 'bg-black/30 border-white/10 text-slate-400 hover:border-white/20'
                                            }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">What happened?</label>
                                <textarea 
                                    required
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full h-32 bg-black/30 border border-white/10 rounded-xl p-4 text-white placeholder:text-slate-600 focus:border-gold-500 outline-none resize-none text-sm"
                                    placeholder="Describe the bug in detail..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Steps to Reproduce (Optional)</label>
                                <textarea 
                                    value={reproduce}
                                    onChange={(e) => setReproduce(e.target.value)}
                                    className="w-full h-24 bg-black/30 border border-white/10 rounded-xl p-4 text-white placeholder:text-slate-600 focus:border-gold-500 outline-none resize-none text-sm"
                                    placeholder="1. Opened Ludo game&#10;2. Rolled dice...&#10;"
                                />
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button type="button" className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
                                    <Paperclip size={16} /> Attach Screenshot
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={!description}
                                    className="px-8 py-3 bg-white text-royal-950 font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    Submit Report <Send size={16} />
                                </button>
                            </div>
                        </motion.form>
                    )}

                    {step === 'submitting' && (
                        <motion.div 
                            key="submitting"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-20"
                        >
                            <Loader2 size={48} className="text-gold-400 animate-spin mb-4" />
                            <h3 className="text-lg font-bold text-white">Sending Report...</h3>
                            <p className="text-slate-400 text-sm">Uploading details to admin team</p>
                        </motion.div>
                    )}

                    {step === 'success' && (
                        <motion.div 
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center py-10 text-center"
                        >
                            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle size={40} />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Report Received</h3>
                            <p className="text-slate-400 text-sm mb-8 max-w-xs">
                                Thank you for helping us improve Vantage. Our engineering team has been notified.
                            </p>
                            <button 
                                onClick={onBack}
                                className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors border border-white/5"
                            >
                                Return to Profile
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    </div>
  );
};