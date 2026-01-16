import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Scan, Smartphone, ChevronRight, Fingerprint, Lock } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [step, setStep] = useState<'input' | 'verify' | 'success'>('input');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendCode = () => {
      if(phoneNumber.length < 9) return;
      setIsLoading(true);
      setTimeout(() => {
          setIsLoading(false);
          setStep('verify');
      }, 1500);
  };

  const handleVerify = (currentPin?: string) => {
      // Use the passed pin if available (from onChange), otherwise use state
      const pinToCheck = typeof currentPin === 'string' ? currentPin : pin;
      
      if(pinToCheck.length < 4) return;
      setIsLoading(true);
      setTimeout(() => {
          setIsLoading(false);
          setStep('success');
          setTimeout(onAuthenticated, 2000);
      }, 2000);
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-20%] right-[-20%] w-[80vw] h-[80vw] bg-gradient-to-br from-royal-800/20 to-purple-900/20 rounded-full blur-[100px]" 
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-gradient-to-tr from-gold-600/10 to-transparent rounded-full blur-[100px]" 
          />
      </div>

      <div className="w-full max-w-md relative z-10">
        <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-10"
        >
            <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mx-auto flex items-center justify-center text-royal-950 font-black text-3xl shadow-[0_0_40px_rgba(251,191,36,0.3)] mb-4">
                V
            </div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Welcome Back</h1>
            <p className="text-slate-400">Secure Access Portal</p>
        </motion.div>

        <div className="glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
            {/* Top scanning line decoration */}
            <motion.div 
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-gold-400 to-transparent opacity-50"
            />

            {step === 'input' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mobile Number</label>
                        <div className="relative">
                            <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input 
                                type="tel" 
                                placeholder="6XX XXX XXX"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors font-mono"
                            />
                        </div>
                    </div>
                    <button 
                        onClick={handleSendCode}
                        disabled={isLoading || phoneNumber.length < 9}
                        className="w-full bg-white text-royal-900 font-bold py-4 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-2"
                    >
                        {isLoading ? <span className="animate-pulse">Connecting...</span> : <>Continue <ChevronRight size={18}/></>}
                    </button>
                    
                    <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Lock size={12}/> 256-bit Secure</span>
                        <span className="flex items-center gap-1 text-gold-500">MTN / Orange</span>
                    </div>
                </motion.div>
            )}

            {step === 'verify' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="text-center mb-6">
                        <div className="mx-auto w-12 h-12 bg-royal-800 rounded-full flex items-center justify-center mb-2">
                            <Fingerprint className="text-gold-400" size={24} />
                        </div>
                        <h3 className="text-white font-bold">Verify Identity</h3>
                        <p className="text-xs text-slate-400">Enter PIN or Scan Biometrics</p>
                    </div>

                    {/* Added relative positioning to container to constrain the absolute input */}
                    <div className="mb-8 relative">
                        <div className="flex justify-center gap-4">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className={`w-12 h-14 rounded-xl border flex items-center justify-center text-xl font-bold transition-all ${
                                    pin.length > i 
                                    ? 'border-gold-500 text-gold-400 bg-gold-500/10' 
                                    : 'border-royal-700 bg-royal-900/50 text-white'
                                }`}>
                                    {pin.length > i ? '•' : ''}
                                </div>
                            ))}
                        </div>
                        {/* Hidden Input for simulation */}
                        <input 
                            type="password" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            maxLength={4}
                            value={pin}
                            onChange={(e) => {
                                const val = e.target.value;
                                setPin(val);
                                // Pass current value to avoid state race condition
                                if(val.length === 4) handleVerify(val);
                            }}
                            autoFocus
                        />
                    </div>
                    
                    <button 
                         onClick={() => handleVerify()}
                         disabled={isLoading || pin.length < 4}
                         className="w-full bg-gold-500 text-black font-bold py-4 rounded-xl hover:bg-gold-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20 relative z-20"
                    >
                        {isLoading ? "Verifying..." : "Confirm Access"}
                    </button>
                </motion.div>
            )}

            {step === 'success' && (
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center py-8"
                >
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-black mb-4 shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                        <Scan size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">Access Granted</h2>
                    <p className="text-slate-400 text-sm">Redirecting to Dashboard...</p>
                </motion.div>
            )}
        </div>
        
        <p className="text-center text-xs text-slate-600 mt-8">
            By connecting, you agree to Vantage Ludo's <span className="text-slate-400 underline">Terms of Service</span>.
        </p>
      </div>
    </div>
  );
};