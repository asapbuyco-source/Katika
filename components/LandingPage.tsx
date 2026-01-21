import React, { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, useMotionTemplate } from 'framer-motion';
import { ShieldCheck, Lock, Cpu, ChevronRight, Trophy, Users, Brain, Dice5, Target, TrendingUp, Zap, Star, Smartphone, Activity, LayoutGrid, Layers, UserPlus, Wallet, Swords } from 'lucide-react';
import { useLanguage } from '../services/i18n';

interface LandingPageProps {
  onLogin: () => void;
  onHowItWorks: () => void;
}

// --- SUB-COMPONENTS ---

const InfiniteMarquee = ({ items }: { items: string[] }) => {
  return (
    <div className="flex overflow-hidden bg-gold-500/10 border-y border-gold-500/20 py-3 backdrop-blur-md relative z-20">
      <div className="absolute inset-0 bg-gold-500/5"></div>
      <motion.div 
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: [0, -1000] }}
        transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
      >
        {[...items, ...items, ...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm font-bold text-gold-200">
            <Star size={12} className="text-gold-500 fill-gold-500" />
            {item}
          </div>
        ))}
      </motion.div>
    </div>
  );
};

interface GameCardProps {
  game: {
    name: string;
    desc: string;
    players: string;
    pot: string;
    icon: any;
    color: string;
    bg: string;
    border: string;
  };
  onClick: () => void;
  index: number;
}

const GameCard: React.FC<GameCardProps> = ({ game, onClick, index }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            whileHover={{ y: -10 }}
            onClick={onClick}
            className={`group h-[400px] p-6 rounded-[2rem] border ${game.border} ${game.bg} backdrop-blur-md relative overflow-hidden cursor-pointer flex flex-col justify-between transition-all shadow-lg hover:shadow-2xl`}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${game.color} bg-black/40 border border-white/10 shadow-xl group-hover:scale-110 transition-transform duration-300`}>
                        <game.icon size={36} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold bg-black/40 px-3 py-1.5 rounded-full text-slate-300 border border-white/5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        Live
                    </div>
                </div>
                
                <h3 className="text-3xl font-display font-bold text-white mb-3 group-hover:translate-x-1 transition-transform">{game.name}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{game.desc}</p>
            </div>
            
            <div className="relative z-10 pt-6 border-t border-white/10 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Pot Size</span>
                    <span className={`font-mono font-bold text-xl ${game.color}`}>{game.pot}</span>
                </div>
                <div className="w-full h-1 bg-black/20 rounded-full overflow-hidden">
                    <div className={`h-full w-3/4 ${game.color.replace('text-', 'bg-')} opacity-50`}></div>
                </div>
                <div className="mt-2 text-right text-[10px] text-slate-500">{game.players} players active</div>
            </div>
        </motion.div>
    );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onHowItWorks }) => {
  const { t } = useLanguage();
  const { scrollY } = useScroll();
  
  // Parallax transforms
  const yHero = useTransform(scrollY, [0, 500], [0, 100]);
  const yBg1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const yBg2 = useTransform(scrollY, [0, 1000], [0, -150]);
  const opacityHero = useTransform(scrollY, [0, 300], [1, 0]);

  // Fake Stats Counter
  const [payoutCounter, setPayoutCounter] = useState(1450000);
  useEffect(() => {
      const interval = setInterval(() => {
          setPayoutCounter(prev => prev + Math.floor(Math.random() * 2500));
      }, 3000);
      return () => clearInterval(interval);
  }, []);

  const winnersList = [
      "Amara won 5,000 FCFA in Dice",
      "Blaise just joined the Arena",
      "Jean-Paul withdrew 12,500 FCFA via MTN",
      "New High Score in Checkers!",
      "Sarah won 2,000 FCFA",
      "Franck locked 50,000 FCFA in Escrow",
      "Tournament Mode is Live!"
  ];

  const games = [
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
        name: "Kmer Cards", 
        desc: "The classic card game played in Yaoundé.", 
        players: "2.1k", 
        pot: "1.2M", 
        icon: Layers, 
        color: "text-pink-400", 
        bg: "bg-pink-500/10", 
        border: "border-pink-500/20" 
    },
    { 
        name: "Checkers", 
        desc: "Casual strategy. King me to win big.", 
        players: "156", 
        pot: "240k", 
        icon: Target, 
        color: "text-red-400", 
        bg: "bg-red-500/10", 
        border: "border-red-500/20" 
    },
  ];

  const howItWorksSteps = [
      { title: "Create Account", desc: "Sign up in seconds via Google or Email.", icon: UserPlus },
      { title: "Deposit Funds", desc: "Securely load your wallet with MTN/Orange Money.", icon: Wallet },
      { title: "Win Real Cash", desc: "Dominate the arena and withdraw instantly.", icon: Trophy }
  ];

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-white selection:bg-gold-500/30 overflow-x-hidden font-sans">
      
      {/* Parallax Background */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1a103c] via-[#0f0a1f] to-black">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          
          <motion.div 
            style={{ y: yBg1 }}
            className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] opacity-30"
          />
          <motion.div 
            style={{ y: yBg2 }}
            className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] bg-gold-600/10 rounded-full blur-[120px] opacity-20"
          />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 p-6 backdrop-blur-md border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-lg shadow-gold-500/20">V</div>
                <span className="font-display font-bold text-xl tracking-wide text-white">VANTAGE</span>
            </div>
            <div className="flex items-center gap-4">
                <button onClick={onHowItWorks} className="hidden md:block text-sm font-medium text-slate-300 hover:text-white transition-colors">How it works</button>
                <button 
                    onClick={onLogin} 
                    className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-all font-bold text-sm backdrop-blur-md flex items-center gap-2 group"
                >
                    <Smartphone size={16} className="text-gold-400 group-hover:scale-110 transition-transform" /> 
                    Client Access
                </button>
            </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative z-10 pt-32 pb-20 px-6 max-w-7xl mx-auto min-h-[90vh] flex flex-col justify-center">
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
             
             {/* Left: Text Content */}
             <motion.div 
                style={{ opacity: opacityHero }}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
             >
                 <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-bold uppercase tracking-wider mb-8 animate-fade-in-up shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-500"></span>
                    </span>
                    Live in Cameroon
                 </div>
                 
                 <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-black leading-[0.95] mb-8 tracking-tight">
                    Play Skill.<br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-yellow-100 to-gold-500 drop-shadow-sm">
                      Win Cash.
                    </span>
                 </h1>
                 
                 <p className="text-slate-400 text-lg md:text-xl max-w-lg leading-relaxed mb-10 border-l-2 border-white/10 pl-6">
                    The first premium P2P gaming platform with <span className="text-white font-bold">Escrow Protection</span> and <span className="text-white font-bold">AI Refereeing</span>. Instant withdrawals to MoMo & Orange Money.
                 </p>

                 <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                        onClick={onLogin}
                        className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-gold-500 to-gold-600 text-royal-950 rounded-2xl font-black text-lg shadow-[0_0_40px_rgba(251,191,36,0.4)] hover:shadow-[0_0_60px_rgba(251,191,36,0.6)] hover:scale-[1.02] transition-all overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <span className="relative z-10 flex items-center gap-2">START PLAYING <ChevronRight size={20} /></span>
                    </button>
                    
                    <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                        <div className="flex -space-x-3">
                            {[1,2,3].map(i => (
                                <div key={i} className="w-8 h-8 rounded-full border-2 border-royal-900 bg-slate-700 overflow-hidden">
                                    <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="" className="w-full h-full" />
                                </div>
                            ))}
                        </div>
                        <div className="text-sm font-bold">
                            <span className="text-white">2.4k+</span>
                            <span className="block text-xs text-slate-400 font-normal">Players Online</span>
                        </div>
                    </div>
                 </div>
             </motion.div>

             {/* Right: Phone Mockup with Parallax */}
             <motion.div 
                style={{ y: yHero }}
                className="relative hidden lg:block"
             >
                 <motion.div 
                    animate={{ y: [0, -15, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    className="relative z-20 w-[300px] mx-auto h-[600px] bg-black rounded-[3rem] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/20"
                 >
                     {/* Phone UI */}
                     <div className="absolute top-0 left-0 w-full h-full bg-royal-950 flex flex-col">
                         {/* Dynamic Notch */}
                         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-xl z-50"></div>
                         
                         {/* Phone Content (Simulated Game) */}
                         <div className="flex-1 relative flex flex-col items-center justify-center p-4">
                             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                             
                             {/* Match Found Animation inside Phone */}
                             <motion.div 
                                animate={{ scale: [0.9, 1, 0.9], opacity: [0.8, 1, 0.8] }}
                                transition={{ duration: 3, repeat: Infinity }}
                                className="w-40 h-40 rounded-full border-4 border-gold-500/30 flex items-center justify-center relative"
                             >
                                 <div className="absolute inset-0 rounded-full border-t-4 border-gold-500 animate-spin"></div>
                                 <div className="text-center">
                                     <div className="text-3xl font-black text-white">VS</div>
                                     <div className="text-[10px] text-gold-400 font-bold uppercase tracking-widest mt-1">Match Found</div>
                                 </div>
                             </motion.div>

                             <div className="mt-8 w-full bg-white/5 rounded-xl p-3 border border-white/10 flex items-center justify-between">
                                 <div className="flex items-center gap-2">
                                     <div className="w-8 h-8 rounded-full bg-red-500"></div>
                                     <div className="h-2 w-16 bg-slate-700 rounded"></div>
                                 </div>
                                 <div className="text-xs font-mono text-green-400">+5,000 FCFA</div>
                             </div>
                         </div>

                         {/* Bottom Button */}
                         <div className="p-4 pb-8">
                             <div className="w-full h-12 bg-gradient-to-r from-gold-500 to-gold-600 rounded-xl flex items-center justify-center text-royal-950 font-bold shadow-lg">
                                 ENTER MATCH
                             </div>
                         </div>
                     </div>
                 </motion.div>

                 {/* Glow Behind Phone */}
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[600px] bg-purple-500/20 blur-[100px] -z-10 rounded-full pointer-events-none"></div>
             </motion.div>
         </div>
      </section>

      {/* INFINITE MARQUEE */}
      <div className="relative z-20 mb-20">
          <div className="bg-royal-900/80 border-y border-gold-500/30 py-3 shadow-2xl backdrop-blur-md">
              <InfiniteMarquee items={winnersList} />
          </div>
      </div>

      {/* STATS STRIP */}
      <div className="container mx-auto px-6 mb-32 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                  { label: "Total Payouts", value: `${(payoutCounter).toLocaleString()} FCFA`, icon: TrendingUp, color: "text-green-400" },
                  { label: "Active Matches", value: "842 Live", icon: Activity, color: "text-blue-400" },
                  { label: "Avg. Match Time", value: "4m 12s", icon: Zap, color: "text-purple-400" }
              ].map((stat, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.2 }}
                    className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-3xl flex items-center gap-5 hover:bg-white/10 transition-colors group cursor-default"
                  >
                      <div className={`p-4 rounded-2xl bg-black/40 ${stat.color} group-hover:scale-110 transition-transform`}>
                          <stat.icon size={28} />
                      </div>
                      <div>
                          <div className="text-3xl font-display font-bold text-white mb-1">{stat.value}</div>
                          <div className="text-xs text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1">
                              {stat.label}
                          </div>
                      </div>
                  </motion.div>
              ))}
          </div>
      </div>

      {/* HOW IT WORKS (ANIMATED STEPS) */}
      <section className="relative z-10 py-20 px-6 max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
              <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">Start Winning in Minutes</h2>
              <p className="text-slate-400 text-lg">No complex setup. Just pure skill-based gaming.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {howItWorksSteps.map((step, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ delay: idx * 0.2, type: "spring", stiffness: 50 }}
                    className="relative p-8 rounded-3xl bg-royal-900/40 border border-white/10 flex flex-col items-center text-center group hover:bg-royal-900/60 transition-colors"
                  >
                      {/* Step Number Background */}
                      <div className="absolute top-4 right-6 text-6xl font-black text-white/5 select-none">{idx + 1}</div>
                      
                      <div className="w-16 h-16 rounded-2xl bg-gold-500/10 flex items-center justify-center text-gold-400 mb-6 group-hover:scale-110 transition-transform duration-300 border border-gold-500/20">
                          <step.icon size={32} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                  </motion.div>
              ))}
          </div>
      </section>

      {/* GAMES SHOWCASE */}
      <section className="relative z-10 py-20 overflow-hidden">
         <div className="container mx-auto px-6">
            <motion.div 
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="text-center mb-16 max-w-2xl mx-auto"
            >
                <h2 className="text-4xl md:text-6xl font-display font-bold text-white mb-6">Choose Your Arena</h2>
                <p className="text-slate-400 text-lg">Four classic games. One secure platform. Prove your skill in 1v1 matches.</p>
            </motion.div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {games.map((game, idx) => (
                    <GameCard key={idx} game={game} index={idx} onClick={onLogin} />
                ))}
            </div>
         </div>
      </section>

      {/* TRUST SECTION */}
      <section className="relative z-10 py-32 bg-black/20 border-y border-white/5">
         <div className="container mx-auto px-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                 <motion.div 
                    initial={{ opacity: 0, x: -50 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                 >
                     <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-8 leading-tight">
                         <span className="text-purple-400">V-Guard AI</span> Referee System
                     </h2>
                     <p className="text-slate-400 text-lg mb-10 leading-relaxed border-l-2 border-purple-500/30 pl-6">
                         Our proprietary AI monitors every move in real-time. It detects bots, collusion, and network manipulation instantly to ensure a fair game.
                     </p>
                     
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         {['Anti-Cheat Engine', 'Latency Checks', 'Bot Detection', 'Auto-Forfeit Logic'].map((feature, i) => (
                             <motion.div 
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5"
                             >
                                 <div className="p-1 rounded-full bg-green-500/20 text-green-400"><ShieldCheck size={16} /></div>
                                 <span className="text-slate-200 font-bold text-sm">{feature}</span>
                             </motion.div>
                         ))}
                     </div>
                 </motion.div>

                 <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="relative bg-royal-900/50 rounded-3xl p-8 border border-white/10 overflow-hidden shadow-2xl"
                 >
                     {/* Scanner Effect */}
                     <div className="absolute top-0 left-0 w-full h-1 bg-purple-500 shadow-[0_0_20px_#a855f7] animate-scan opacity-70 z-10"></div>
                     
                     <div className="flex items-center gap-4 mb-8">
                         <div className="w-14 h-14 rounded-2xl bg-royal-800 flex items-center justify-center border border-white/10 shadow-inner">
                             <Cpu size={28} className="text-purple-400" />
                         </div>
                         <div>
                             <div className="font-bold text-white text-lg">System Status</div>
                             <div className="text-xs text-green-400 font-mono flex items-center gap-2">
                                 <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> ALL SYSTEMS OPERATIONAL
                             </div>
                         </div>
                     </div>
                     
                     <div className="space-y-4 font-mono text-sm">
                         <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg border border-white/5">
                             <span className="text-slate-400">Integrity Check</span>
                             <span className="text-green-400 font-bold">PASSED</span>
                         </div>
                         <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg border border-white/5">
                             <span className="text-slate-400">Server Latency</span>
                             <span className="text-white">24ms</span>
                         </div>
                         <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg border border-white/5">
                             <span className="text-slate-400">Encryption</span>
                             <span className="text-gold-400">AES-256</span>
                         </div>
                     </div>
                 </motion.div>
             </div>
         </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/5 py-12 bg-black/40 mt-12">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3 opacity-50 hover:opacity-100 transition-opacity">
                <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-black font-bold text-sm">V</div>
                <span className="font-display font-bold tracking-wide text-lg">VANTAGE</span>
            </div>
            <div className="flex gap-8 text-sm text-slate-500 font-medium">
                <a href="#" className="hover:text-white transition-colors">Terms</a>
                <a href="#" className="hover:text-white transition-colors">Privacy</a>
                <a href="#" className="hover:text-white transition-colors">Fairness Policy</a>
            </div>
            <div className="text-xs text-slate-600">
                &copy; 2024 Vantage Gaming Cameroon.
            </div>
        </div>
      </footer>
      
      <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            50% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        .animate-scan {
            animation: scan 3s linear infinite;
        }
        .animate-fade-in-up {
            animation: fadeInUp 0.8s ease-out forwards;
        }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};