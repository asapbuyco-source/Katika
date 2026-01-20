
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Cpu, Lock, Smartphone, UserPlus, Swords, Trophy, Wallet, Hash, Server, CheckCircle, Fingerprint } from 'lucide-react';

interface HowItWorksProps {
  onBack: () => void;
  onLogin: () => void;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ onBack, onLogin }) => {
  const steps = [
    {
      title: "1. Create Account",
      desc: "Sign up instantly using your Google account or email. We verify identity to ensure a bot-free environment.",
      icon: UserPlus,
      color: "bg-blue-500",
      textColor: "text-blue-400"
    },
    {
      title: "2. Deposit Funds",
      desc: "Load your wallet via MTN Mobile Money or Orange Money. Your funds are kept in a secure, personal vault.",
      icon: Smartphone,
      color: "bg-yellow-500",
      textColor: "text-yellow-400"
    },
    {
      title: "3. Choose Your Arena",
      desc: "Select a game (Ludo, Dice, Checkers, Chess) and a stake level. From 500 FCFA casual games to 50,000 FCFA pro tables.",
      icon: Swords,
      color: "bg-red-500",
      textColor: "text-red-400"
    },
    {
      title: "4. Win & Withdraw",
      desc: "Defeat your opponent. The escrow automatically releases the pot to your wallet. Withdraw to MoMo instantly.",
      icon: Trophy,
      color: "bg-gold-500",
      textColor: "text-gold-400"
    }
  ];

  return (
    <div className="min-h-screen bg-royal-950 text-white relative overflow-x-hidden">
      {/* Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-600/10 rounded-full blur-[100px]"></div>
         <div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] bg-purple-600/10 rounded-full blur-[80px]"></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10 px-6 py-8">
        
        {/* Navigation */}
        <header className="mb-16 flex items-center justify-between">
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
            >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                <span className="font-bold">Back</span>
            </button>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center text-black font-bold text-sm shadow-[0_0_15px_rgba(251,191,36,0.3)]">V</div>
                <span className="font-display font-bold tracking-wide text-lg">VANTAGE</span>
            </div>
        </header>

        {/* Hero Section */}
        <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-24 max-w-3xl mx-auto"
        >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-bold uppercase tracking-wider mb-6">
                <ShieldCheck size={14} /> The Fair Play Guarantee
            </div>
            <h1 className="text-5xl md:text-7xl font-display font-bold mb-6 leading-tight">
                Skill Based.<br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-white to-gold-500">
                    Trust Secured.
                </span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl leading-relaxed">
                Vantage eliminates luck and fraud from online gaming. We provide the arena, you bring the skill. Our technology handles the rest.
            </p>
        </motion.div>

        {/* The Process (Timeline) */}
        <div className="mb-32">
            <h2 className="text-2xl font-display font-bold text-white mb-12 text-center">How to Start Earning</h2>
            <div className="relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-red-500 to-gold-500 opacity-20"></div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {steps.map((step, idx) => (
                        <motion.div 
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.15 }}
                            className="relative flex flex-col items-center text-center group"
                        >
                            <div className={`w-24 h-24 rounded-3xl ${step.color} bg-opacity-10 border border-white/10 flex items-center justify-center mb-6 relative z-10 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300 shadow-xl`}>
                                <step.icon size={32} className={step.textColor} />
                                <div className={`absolute inset-0 ${step.color} opacity-20 blur-xl rounded-full`}></div>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>

        {/* Deep Dive: Technology Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-32">
            
            {/* Provably Fair Card */}
            <motion.div 
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="bg-gradient-to-br from-royal-900 to-black p-8 rounded-3xl border border-white/5 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-12 bg-purple-500/10 blur-3xl rounded-full"></div>
                
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400">
                        <Server size={24} />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Provably Fair System</h3>
                </div>
                
                <p className="text-slate-400 mb-8 leading-relaxed">
                    We use cryptographic hashing to ensure the game outcome is determined before the turn starts and cannot be altered.
                </p>

                {/* Technical Visualization */}
                <div className="bg-black/40 rounded-xl p-4 font-mono text-xs border border-white/5 space-y-3">
                    <div>
                        <div className="text-slate-500 mb-1">Server Seed (Hashed)</div>
                        <div className="text-green-400 truncate">9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08</div>
                    </div>
                    <div className="flex justify-center text-slate-600">
                        +
                    </div>
                    <div>
                        <div className="text-slate-500 mb-1">Client Seed (Your Input)</div>
                        <div className="text-blue-400">client-seed-12345</div>
                    </div>
                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="flex items-center justify-between">
                        <div className="text-slate-500">Result</div>
                        <div className="text-gold-400 font-bold">Dice Roll: 6</div>
                    </div>
                </div>
            </motion.div>

            {/* Escrow System Card */}
            <motion.div 
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="bg-gradient-to-br from-royal-900 to-black p-8 rounded-3xl border border-white/5 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-12 bg-green-500/10 blur-3xl rounded-full"></div>

                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-green-500/20 rounded-xl text-green-400">
                        <Lock size={24} />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Escrow Protection</h3>
                </div>

                <p className="text-slate-400 mb-8 leading-relaxed">
                    Stakes are locked in a neutral vault before the game begins. The loser cannot "run away" with the money—the code automatically pays the winner.
                </p>

                {/* Visual Flow */}
                <div className="flex items-center justify-between bg-black/40 p-6 rounded-xl border border-white/5">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500 flex items-center justify-center text-blue-400 font-bold text-xs">YOU</div>
                        <div className="text-[10px] text-slate-500">500 FCFA</div>
                    </div>
                    
                    <div className="h-0.5 flex-1 bg-white/10 mx-2 relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500 to-transparent w-1/2 mx-auto"></div>
                    </div>

                    <div className="flex flex-col items-center gap-2 bg-royal-800 p-3 rounded-lg border border-gold-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                        <Lock size={16} className="text-green-400" />
                        <div className="text-[10px] font-bold text-white">VAULT</div>
                    </div>

                    <div className="h-0.5 flex-1 bg-white/10 mx-2 relative">
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500 to-transparent w-1/2 mx-auto"></div>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500 flex items-center justify-center text-red-400 font-bold text-xs">OPP</div>
                        <div className="text-[10px] text-slate-500">500 FCFA</div>
                    </div>
                </div>
            </motion.div>

        </div>

        {/* AI Referee Section */}
        <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-royal-900/30 border border-white/10 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden mb-20"
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500"></div>
            
            <div className="w-20 h-20 bg-royal-800 rounded-full mx-auto flex items-center justify-center mb-6 shadow-2xl border-4 border-royal-950 relative z-10">
                <Cpu size={40} className="text-white" />
            </div>

            <h2 className="text-3xl font-display font-bold text-white mb-4">Meet V-Guard AI</h2>
            <p className="text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
                Our automated referee monitors network latency, game inputs, and user behavior in real-time. It detects bots, rage-quits, and suspicious patterns instantly.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
                {['Anti-Cheat Engine', 'Latency Compensation', 'Bot Detection', 'Auto-Forfeit Logic'].map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/5 text-sm text-slate-300">
                        <CheckCircle size={14} className="text-green-400" /> {feature}
                    </div>
                ))}
            </div>
        </motion.div>

        {/* CTA */}
        <div className="text-center relative z-10">
            <h2 className="text-4xl font-display font-bold text-white mb-8">Ready to play?</h2>
            <button 
                onClick={onLogin}
                className="bg-gold-500 hover:bg-gold-400 text-royal-950 font-black text-xl py-5 px-16 rounded-full shadow-[0_0_40px_rgba(251,191,36,0.4)] hover:shadow-[0_0_60px_rgba(251,191,36,0.6)] transition-all transform hover:-translate-y-2 active:scale-95"
            >
                CREATE ACCOUNT
            </button>
            <p className="text-slate-500 text-sm mt-6">Secure payments powered by Fapshi • Regulated P2P Gaming</p>
        </div>

      </div>
    </div>
  );
};
