
import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ShieldCheck, Zap, Globe, Smartphone, Lock, PlayCircle, Dice5, Brain, Target, X, Layers, Grid3x3 } from 'lucide-react';
import { ViewState } from '../types';

interface LandingPageProps {
  onLogin: () => void;
  onNavigate: (view: ViewState) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onNavigate }) => {
  
  const features = [
    {
      icon: ShieldCheck,
      title: "Secure Escrow",
      desc: "Funds are locked in a vault before the game starts. The winner is paid automatically."
    },
    {
      icon: Zap,
      title: "Instant Payouts",
      desc: "Withdraw your winnings directly to MTN Mobile Money or Orange Money in seconds."
    },
    {
      icon: Globe,
      title: "V-Guard AI",
      desc: "Our automated referee ensures fair play, detecting bots and cheating instantly."
    }
  ];

  const games = [
    { id: 'ludo', name: "Ludo King", icon: Grid3x3, color: "text-red-400", border: "border-red-500/20", bg: "bg-red-500/10", desc: "The classic race to home." },
    { id: 'dice', name: "Dice Duel", icon: Dice5, color: "text-gold-400", border: "border-gold-500/20", bg: "bg-gold-500/10", desc: "Predict, roll, and win." },
    { id: 'chess', name: "Master Chess", icon: Brain, color: "text-purple-400", border: "border-purple-500/20", bg: "bg-purple-500/10", desc: "Pure strategy & skill." },
    { id: 'checkers', name: "Checkers Pro", icon: Target, color: "text-orange-400", border: "border-orange-500/20", bg: "bg-orange-500/10", desc: "Jump your way to victory." },
    { id: 'tictactoe', name: "XO Clash", icon: X, color: "text-blue-400", border: "border-blue-500/20", bg: "bg-blue-500/10", desc: "Fast-paced logic battle." },
    { id: 'cards', name: "Kmer Cards", icon: Layers, color: "text-pink-400", border: "border-pink-500/20", bg: "bg-pink-500/10", desc: "Local favorites (Whot/Kmer)." },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-white font-sans selection:bg-gold-500/30 overflow-x-hidden flex flex-col">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gold-600/10 rounded-full blur-[100px]"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
          
          {/* Floating Elements */}
          <motion.div 
            animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[15%] right-[10%] text-white/5"
          >
              <Dice5 size={120} />
          </motion.div>
          <motion.div 
            animate={{ y: [0, 30, 0], rotate: [0, -15, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-[20%] left-[5%] text-white/5"
          >
              <Brain size={140} />
          </motion.div>
      </div>

      {/* Navbar */}
      <nav className="relative z-50 w-full px-6 py-6 max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-lg shadow-gold-500/20">V</div>
            <span className="font-display font-bold text-xl tracking-wide text-white">VANTAGE</span>
        </div>
        
        <div className="flex items-center gap-4">
            <button 
                onClick={() => onNavigate('how-it-works')}
                className="hidden md:block text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
                How it Works
            </button>
            <button 
                onClick={onLogin}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-sm font-bold transition-all backdrop-blur-md"
            >
                Login
            </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 relative z-10 flex flex-col items-center pt-20 pb-12 px-6 max-w-7xl mx-auto w-full">
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
            className="text-center max-w-4xl mx-auto mb-20"
          >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-bold uppercase tracking-wider mb-8 shadow-[0_0_15px_rgba(251,191,36,0.2)]"
              >
                  <span className="w-2 h-2 rounded-full bg-gold-500 animate-pulse"></span>
                  Live in Cameroon
              </motion.div>

              <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-black leading-[1.1] mb-6 tracking-tight">
                  Play Skills. <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-yellow-100 to-gold-500 drop-shadow-sm">
                      Win Money.
                  </span>
              </h1>

              <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                  The first premium P2P gaming platform. Challenge real players in Ludo, Chess, and Dice. Secure withdrawals to MoMo.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={onLogin}
                      className="w-full sm:w-auto px-8 py-4 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black text-lg rounded-2xl shadow-[0_0_30px_rgba(251,191,36,0.3)] transition-all flex items-center justify-center gap-2"
                  >
                      Start Playing <ChevronRight size={20} />
                  </motion.button>
                  
                  <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onNavigate('how-it-works')}
                      className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-lg rounded-2xl backdrop-blur-md transition-all flex items-center justify-center gap-2"
                  >
                      <PlayCircle size={20} className="text-slate-400" /> How it Works
                  </motion.button>
              </div>
          </motion.div>

          {/* Games Showcase */}
          <div className="w-full mb-24">
              <div className="text-center mb-10">
                  <h3 className="text-lg font-bold text-white uppercase tracking-widest mb-2 opacity-80">Choose Your Arena</h3>
                  <div className="h-1 w-20 bg-gradient-to-r from-transparent via-gold-500 to-transparent mx-auto"></div>
              </div>
              
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
              >
                  {games.map((game) => (
                      <motion.div
                          key={game.id}
                          variants={itemVariants}
                          whileHover={{ y: -5, backgroundColor: 'rgba(255,255,255,0.08)' }}
                          className={`
                              p-4 rounded-2xl border bg-white/5 backdrop-blur-sm flex flex-col items-center text-center cursor-default transition-colors
                              ${game.border}
                          `}
                      >
                          <div className={`p-3 rounded-xl mb-3 ${game.bg} ${game.color}`}>
                              <game.icon size={24} />
                          </div>
                          <h4 className="font-bold text-white text-sm mb-1">{game.name}</h4>
                          <p className="text-[10px] text-slate-400 leading-tight">{game.desc}</p>
                      </motion.div>
                  ))}
              </motion.div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {features.map((feature, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-left relative overflow-hidden group"
                  >
                      <div className="absolute top-0 right-0 p-8 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"></div>
                      <div className="w-12 h-12 rounded-xl bg-royal-800 flex items-center justify-center text-gold-400 mb-4 shadow-lg relative z-10">
                          <feature.icon size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2 relative z-10">{feature.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed relative z-10">{feature.desc}</p>
                  </motion.div>
              ))}
          </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-black/40 backdrop-blur-md pt-12 pb-8 px-6">
          <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                  <div className="col-span-2 md:col-span-1">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-slate-700 rounded-md flex items-center justify-center text-black font-bold text-xs">V</div>
                          <span className="font-bold text-white">VANTAGE</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                          The trusted platform for skill-based gaming in Africa.
                      </p>
                  </div>
                  
                  <div>
                      <h4 className="text-white font-bold text-sm mb-4">Platform</h4>
                      <ul className="space-y-2 text-xs text-slate-400">
                          <li><button onClick={() => onNavigate('how-it-works')} className="hover:text-gold-400 transition-colors">How it Works</button></li>
                          <li><button onClick={() => onNavigate('matchmaking')} className="hover:text-gold-400 transition-colors">Games</button></li>
                          <li><button onClick={onLogin} className="hover:text-gold-400 transition-colors">Login / Sign Up</button></li>
                      </ul>
                  </div>

                  <div>
                      <h4 className="text-white font-bold text-sm mb-4">Legal</h4>
                      <ul className="space-y-2 text-xs text-slate-400">
                          <li><button onClick={() => onNavigate('terms')} className="hover:text-gold-400 transition-colors">Terms of Service</button></li>
                          <li><button onClick={() => onNavigate('privacy')} className="hover:text-gold-400 transition-colors">Privacy Policy</button></li>
                          <li><button onClick={() => onNavigate('terms')} className="hover:text-gold-400 transition-colors">Fair Play Policy</button></li>
                      </ul>
                  </div>

                  <div>
                      <h4 className="text-white font-bold text-sm mb-4">Support</h4>
                      <ul className="space-y-2 text-xs text-slate-400">
                          <li><button onClick={() => onNavigate('help-center')} className="hover:text-gold-400 transition-colors">Help Center</button></li>
                          <li><button onClick={() => onNavigate('report-bug')} className="hover:text-gold-400 transition-colors">Report Issue</button></li>
                          <li className="flex items-center gap-2">
                              <Smartphone size={12} /> +237 657 960 690
                          </li>
                      </ul>
                  </div>
              </div>
              
              <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-slate-600">
                  <p>&copy; 2024 Vantage Gaming Cameroon. All rights reserved.</p>
                  <div className="flex gap-4">
                      <span>Douala, Cameroon</span>
                      <span>18+ Play Responsibly</span>
                  </div>
              </div>
          </div>
      </footer>

    </div>
  );
};
