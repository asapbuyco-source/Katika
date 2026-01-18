
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Cpu, Lock, Smartphone, UserPlus, Swords, Trophy, Wallet } from 'lucide-react';

interface HowItWorksProps {
  onBack: () => void;
  onLogin: () => void;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ onBack, onLogin }) => {
  const steps = [
    {
      title: "Create & Verify Account",
      desc: "Sign up instantly. We use biometric verification (FaceID/Fingerprint) to ensure every player is a real person. No bots allowed.",
      icon: UserPlus,
      color: "text-blue-400"
    },
    {
      title: "Deposit Funds Securely",
      desc: "Link your MTN Mobile Money or Orange Money account. Deposits are instant and kept in your secure Vantage Wallet.",
      icon: Smartphone,
      color: "text-yellow-400"
    },
    {
      title: "Choose Your Arena",
      desc: "Select a game (Cards, Dice, Checkers, Chess) and pick your stakes. From 100 FCFA casual matches to 50,000 FCFA High Roller tables.",
      icon: Swords,
      color: "text-red-400"
    },
    {
      title: "Win & Withdraw Instantly",
      desc: "When you win, the pot is instantly transferred to your wallet. Cash out to Mobile Money in seconds. No waiting periods.",
      icon: Trophy,
      color: "text-gold-400"
    }
  ];

  const features = [
    {
      title: "Escrow Technology",
      desc: "Before a match starts, both players' stakes are locked in a neutral digital vault. This guarantees the winner always gets paid.",
      icon: Lock,
      color: "text-cam-green"
    },
    {
      title: "AI Referee",
      desc: "Our V-Guard AI monitors every move for suspicious patterns. If an opponent disconnects or cheats, you automatically win.",
      icon: Cpu,
      color: "text-purple-400"
    },
    {
      title: "Provably Fair",
      desc: "We use cryptographic hashing (SHA-256) for dice rolls and shuffles. You can verify the fairness of every game outcome yourself.",
      icon: ShieldCheck,
      color: "text-gold-400"
    }
  ];

  return (
    <div className="min-h-screen bg-royal-950 text-white p-6 relative overflow-x-hidden">
      {/* Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-600/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <header className="mb-12 flex items-center justify-between">
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
            >
                <div className="p-2 rounded-xl bg-white/5 group-hover:bg-white/10 border border-white/5">
                    <ArrowLeft size={20} />
                </div>
                <span className="font-medium">Back to Home</span>
            </button>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center text-black font-bold text-sm">V</div>
                <span className="font-display font-bold tracking-wide">VANTAGE</span>
            </div>
        </header>

        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-20"
        >
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-6">
                Fair Play. <span className="text-gold-400">Instant Pay.</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                Vantage is built on a simple promise: If you have the skill, you keep the money. Here is how our technology guarantees a fair game every time.
            </p>
        </motion.div>

        {/* Steps Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-24">
            <div className="relative">
                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gradient-to-b from-gold-500 via-white/10 to-transparent"></div>
                <div className="space-y-12 relative z-10">
                    {steps.map((step, idx) => (
                        <motion.div 
                            key={idx}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="flex gap-6"
                        >
                            <div className={`w-12 h-12 rounded-full bg-royal-900 border border-white/10 flex items-center justify-center flex-shrink-0 z-10 ${step.color} shadow-xl`}>
                                <step.icon size={20} />
                            </div>
                            <div className="pt-2">
                                <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                                <p className="text-slate-400 leading-relaxed text-sm">{step.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
            
            <div className="flex items-center justify-center">
                {/* Visual Representation Card */}
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    className="w-full max-w-sm bg-gradient-to-br from-royal-800 to-black p-8 rounded-3xl border border-gold-500/30 relative overflow-hidden shadow-2xl"
                >
                    <div className="absolute top-0 right-0 p-12 bg-gold-500/10 blur-3xl rounded-full"></div>
                    <div className="relative z-10 text-center space-y-6">
                        <Wallet size={64} className="text-gold-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white">Your Money is Safe</h3>
                        <p className="text-slate-400 text-sm">
                            Vantage operates as a secure P2P escrow service. We never touch your winnings—they go directly from the loser's escrow to your wallet.
                        </p>
                        <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20 text-green-400 font-mono text-sm">
                            <ShieldCheck size={16} className="inline mr-2" />
                            100% Payout Guarantee
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>

        {/* Tech Features */}
        <div className="mb-24">
            <h2 className="text-3xl font-display font-bold text-white mb-10 text-center">The Technology Core</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {features.map((feat, idx) => (
                    <motion.div 
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-royal-900/40 p-8 rounded-3xl border border-white/5 hover:border-gold-500/30 transition-colors group"
                    >
                        <div className={`mb-6 p-4 rounded-2xl bg-white/5 inline-block group-hover:scale-110 transition-transform ${feat.color}`}>
                            <feat.icon size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">{feat.title}</h3>
                        <p className="text-slate-400 leading-relaxed text-sm">{feat.desc}</p>
                    </motion.div>
                ))}
            </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-gradient-to-r from-royal-800 via-royal-900 to-royal-800 rounded-3xl p-12 border border-white/10 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="relative z-10">
                <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-6">Ready to prove your skill?</h2>
                <button 
                    onClick={onLogin}
                    className="bg-gold-500 hover:bg-gold-400 text-royal-950 font-black text-lg py-4 px-12 rounded-full shadow-[0_0_30px_rgba(251,191,36,0.4)] hover:shadow-[0_0_50px_rgba(251,191,36,0.6)] transition-all transform hover:-translate-y-1 active:scale-95"
                >
                    START PLAYING NOW
                </button>
            </div>
        </div>

        <footer className="mt-20 pt-8 border-t border-white/5 text-center text-slate-500 text-sm">
            &copy; 2024 Vantage Gaming Cameroon. Built for Trust.
        </footer>
      </div>
    </div>
  );
};
