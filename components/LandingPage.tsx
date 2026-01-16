import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ShieldCheck, Lock, Cpu, ChevronRight, Trophy, Users, Brain, Dice5, Target, TrendingUp, LayoutGrid } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [activeTicker, setActiveTicker] = useState(0);

  // Simulated Live Winners Data
  const winners = [
    { name: "Amara", amount: "5,000", game: "Ludo" },
    { name: "Jean-Paul", amount: "12,500", game: "Chess" },
    { name: "Sarah", amount: "2,000", game: "Dice" },
    { name: "Franck", amount: "50,000", game: "Checkers" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTicker((prev) => (prev + 1) % winners.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const games = [
    { 
        name: "Speed Ludo", 
        desc: "Classic race to the finish. 4 Players, 1 Winner.", 
        players: "842", 
        pot: "1.2M", 
        icon: LayoutGrid, 
        color: "text-cam-green", 
        bg: "bg-cam-green/10", 
        border: "border-cam-green/20" 
    },
    { 
        name: "Pro Chess", 
        desc: "Pure skill. High stakes strategy battles.", 
        players: "315", 
        pot: "850k", 
        icon: Brain, 
        color: "text-purple-400", 
        bg: "bg-purple-500/10", 
        border: "border-purple-500/20" 
    },
    { 
        name: "Dice Duel", 
        desc: "Instant results. 50/50 chance to double up.", 
        players: "1.2k", 
        pot: "500k", 
        icon: Dice5, 
        color: "text-gold-400", 
        bg: "bg-gold-500/10", 
        border: "border-gold-500/20" 
    },
    { 
        name: "Checkers", 
        desc: "The Cameroonian classic. King me.", 
        players: "156", 
        pot: "240k", 
        icon: Target, 
        color: "text-red-400", 
        bg: "bg-red-500/10", 
        border: "border-red-500/20" 
    },
  ];

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 },
    },
  };

  const itemVariants: Variants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.6, ease: "easeOut" }
    },
  };

  return (
    <div className="min-h-screen bg-royal-950 text-white selection:bg-gold-500/30 overflow-x-hidden relative">
      {/* Background (Fixed) */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-purple-900/20 rounded-full blur-[120px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gold-600/5 rounded-full blur-[100px]"></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-50 p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center text-black font-bold text-xl shadow-lg shadow-gold-500/20">V</div>
            <span className="font-display font-bold text-xl tracking-wide">VANTAGE</span>
        </div>
        <button 
            onClick={onLogin} 
            className="px-6 py-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors font-medium text-sm"
        >
            Client Access
        </button>
      </nav>

      {/* Hero Section */}
      <motion.section 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 container mx-auto px-6 py-12 md:py-20 flex flex-col justify-center items-center text-center min-h-[70vh]"
      >
         {/* Live Ticker */}
         <motion.div variants={itemVariants} className="mb-8">
             <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-black/40 border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs font-bold text-gold-400 uppercase tracking-wider border-r border-white/10 pr-3">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-500"></span>
                    </span>
                    Live Payouts
                </div>
                <div className="h-4 overflow-hidden relative w-48 text-left">
                    <AnimatePresence mode='wait'>
                        <motion.div
                            key={activeTicker}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className="text-xs text-slate-300 truncate"
                        >
                            <span className="text-white font-bold">{winners[activeTicker].name}</span> won <span className="text-gold-400">{winners[activeTicker].amount} FCFA</span> in {winners[activeTicker].game}
                        </motion.div>
                    </AnimatePresence>
                </div>
             </div>
         </motion.div>

         {/* Main Title */}
         <motion.h1 variants={itemVariants} className="text-5xl md:text-8xl font-display font-bold leading-tight mb-6">
            Play Skill.<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-gold-200 to-gold-500">
              Win Cash.
            </span>
         </motion.h1>

         <motion.p variants={itemVariants} className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            The premium P2P gaming platform for Cameroon. Secure Escrow, AI Referee, and instant Mobile Money withdrawals.
         </motion.p>

         <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-4">
            <button 
                onClick={onLogin}
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-royal-900 rounded-full font-bold text-lg shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-105 transition-all"
            >
                <span>Connect Wallet</span>
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="px-8 py-4 rounded-full border border-white/10 hover:bg-white/5 font-medium text-slate-300 transition-colors">
                How it Works
            </button>
         </motion.div>
      </motion.section>

      {/* Games Showcase */}
      <section className="relative z-10 border-y border-white/5 bg-black/20 backdrop-blur-sm py-20">
         <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
                <div>
                    <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">The Arena</h2>
                    <p className="text-slate-400">Choose your game and stake your claim.</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gold-400 font-medium">
                    <Users size={16} /> 2,492 Players Online
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {games.map((game, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1 }}
                        whileHover={{ y: -5 }}
                        className={`group p-6 rounded-2xl border ${game.border} ${game.bg} hover:bg-opacity-20 transition-all cursor-pointer`}
                        onClick={onLogin}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${game.color} bg-black/20`}>
                                <game.icon size={28} />
                            </div>
                            <div className="flex items-center gap-1 text-xs font-bold bg-black/30 px-2 py-1 rounded text-slate-300">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                Live
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{game.name}</h3>
                        <p className="text-slate-400 text-sm mb-6 h-10">{game.desc}</p>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Pot Size</span>
                                <span className={`font-mono font-bold ${game.color}`}>{game.pot}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Active</span>
                                <span className="text-white font-medium">{game.players}</span>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
         </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 container mx-auto px-6 py-20">
         <div className="text-center mb-16">
            <h2 className="text-3xl font-display font-bold text-white mb-4">Built on Trust</h2>
            <p className="text-slate-400 max-w-xl mx-auto">We use advanced technology to ensure every match is fair, every payout is instant, and your money is always safe.</p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-royal-900/40 p-8 rounded-3xl border border-white/5 hover:border-gold-500/30 transition-colors"
             >
                <Lock className="text-cam-green mb-6" size={40} />
                <h3 className="text-xl font-bold text-white mb-3">Escrow Secured</h3>
                <p className="text-slate-400 leading-relaxed">
                    Entry fees are locked in a neutral vault before the game starts. The winner is automatically paid out the moment the game ends.
                </p>
             </motion.div>

             <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="bg-royal-900/40 p-8 rounded-3xl border border-white/5 hover:border-gold-500/30 transition-colors"
             >
                <Cpu className="text-purple-400 mb-6" size={40} />
                <h3 className="text-xl font-bold text-white mb-3">AI Referee</h3>
                <p className="text-slate-400 leading-relaxed">
                    Vantage AI monitors for cheating, bots, and connection drops. Rage quitters forfeit their stake to the winner.
                </p>
             </motion.div>

             <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="bg-royal-900/40 p-8 rounded-3xl border border-white/5 hover:border-gold-500/30 transition-colors"
             >
                <ShieldCheck className="text-gold-400 mb-6" size={40} />
                <h3 className="text-xl font-bold text-white mb-3">Provably Fair</h3>
                <p className="text-slate-400 leading-relaxed">
                    Every dice roll and card shuffle is cryptographically hashed. You can verify the fairness of every move yourself.
                </p>
             </motion.div>
         </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-12 bg-black/40">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 opacity-50">
                <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-black font-bold text-sm">V</div>
                <span className="font-display font-bold tracking-wide">VANTAGE</span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
                <a href="#" className="hover:text-white">Terms</a>
                <a href="#" className="hover:text-white">Privacy</a>
                <a href="#" className="hover:text-white">Fairness Policy</a>
            </div>
            <div className="text-xs text-slate-600">
                &copy; 2024 Vantage Gaming Cameroon.
            </div>
        </div>
      </footer>
    </div>
  );
};