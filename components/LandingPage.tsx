
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring, useMotionValue, useMotionTemplate } from 'framer-motion';
import { ShieldCheck, Lock, Cpu, ChevronRight, Trophy, Users, Brain, Dice5, Target, TrendingUp, LayoutGrid, Zap, Star, Smartphone, Activity } from 'lucide-react';
import { useLanguage } from '../services/i18n';

interface LandingPageProps {
  onLogin: () => void;
  onHowItWorks: () => void;
}

// --- SUB-COMPONENTS ---

const InfiniteMarquee = ({ items }: { items: string[] }) => {
  return (
    <div className="flex overflow-hidden bg-gold-500/10 border-y border-gold-500/20 py-3 backdrop-blur-md">
      <motion.div 
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: [0, -1000] }}
        transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
      >
        {[...items, ...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm font-bold text-gold-200">
            <Star size={12} className="text-gold-500 fill-gold-500" />
            {item}
          </div>
        ))}
      </motion.div>
    </div>
  );
};

const TiltCard = ({ children, className, onClick }: any) => {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const xSpring = useSpring(x);
    const ySpring = useSpring(y);
    const transform = useMotionTemplate`rotateX(${xSpring}deg) rotateY(${ySpring}deg)`;

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = (e.clientX - rect.left) * 32.5;
        const mouseY = (e.clientY - rect.top) * 32.5;
        const rX = (mouseY / height - 32.5 / 2) * -1;
        const rY = (mouseX / width - 32.5 / 2);
        x.set(rX);
        y.set(rY);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
            style={{ transformStyle: "preserve-3d", transform }}
            className={className}
        >
            {children}
        </motion.div>
    );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onHowItWorks }) => {
  const { t } = useLanguage();
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -150]);

  const [counter, setCounter] = useState(1245000);

  useEffect(() => {
      const interval = setInterval(() => {
          setCounter(prev => prev + Math.floor(Math.random() * 500));
      }, 2000);
      return () => clearInterval(interval);
  }, []);

  const winnersList = [
      "Amara won 5,000 FCFA in Dice",
      "Blaise just joined the Arena",
      "Jean-Paul withdrew 12,500 FCFA",
      "New High Score in Checkers!",
      "Sarah won 2,000 FCFA",
      "Franck locked 50,000 FCFA in Escrow",
      "Tournament Mode is Live!"
  ];

  const games = [
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

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-white selection:bg-gold-500/30 overflow-x-hidden relative font-sans">
      
      {/* Animated Background Grid */}
      <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-gold-500 opacity-20 blur-[100px]"></div>
          <div className="absolute right-0 bottom-0 -z-10 h-[400px] w-[400px] rounded-full bg-purple-600 opacity-20 blur-[120px]"></div>
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 p-6 backdrop-blur-sm border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-lg shadow-gold-500/20">V</div>
                <span className="font-display font-bold text-xl tracking-wide text-white">VANTAGE</span>
            </div>
            <div className="flex items-center gap-4">
                <button onClick={onHowItWorks} className="hidden md:block text-sm font-medium text-slate-300 hover:text-white transition-colors">How it works</button>
                <button 
                    onClick={onLogin} 
                    className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-all font-bold text-sm backdrop-blur-md flex items-center gap-2"
                >
                    <Smartphone size={16} /> Client Access
                </button>
            </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative z-10 pt-32 pb-20 px-6 max-w-7xl mx-auto min-h-screen flex flex-col justify-center">
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
             
             {/* Left: Text Content */}
             <motion.div 
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
             >
                 <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-bold uppercase tracking-wider mb-6 animate-fade-in-up">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-500"></span>
                    </span>
                    Live in Cameroon
                 </div>
                 
                 <h1 className="text-5xl md:text-7xl font-display font-black leading-[1.1] mb-6">
                    Play Skill.<br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-yellow-200 to-gold-500 drop-shadow-sm">
                      Win Real Cash.
                    </span>
                 </h1>
                 
                 <p className="text-slate-400 text-lg md:text-xl max-w-lg leading-relaxed mb-8">
                    The first premium P2P gaming platform with <span className="text-white font-bold">Escrow Protection</span> and <span className="text-white font-bold">AI Refereeing</span>. Instant withdrawals to MoMo.
                 </p>

                 <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                        onClick={onLogin}
                        className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-gold-500 to-gold-600 text-royal-950 rounded-2xl font-black text-lg shadow-[0_0_30px_rgba(251,191,36,0.3)] hover:shadow-[0_0_50px_rgba(251,191,36,0.5)] hover:scale-[1.02] transition-all"
                    >
                        <span>START PLAYING</span>
                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <div className="flex items-center gap-4 px-6 text-sm font-medium text-slate-400">
                        <div className="flex -space-x-2">
                            {[1,2,3].map(i => (
                                <div key={i} className="w-8 h-8 rounded-full border-2 border-royal-900 bg-slate-700">
                                    <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="" className="w-full h-full rounded-full" />
                                </div>
                            ))}
                        </div>
                        <p>2.4k+ Players Online</p>
                    </div>
                 </div>
             </motion.div>

             {/* Right: 3D Phone Mockup */}
             <motion.div 
                style={{ y: y1 }}
                className="relative hidden lg:block"
             >
                 {/* Floating Elements */}
                 <motion.div 
                    animate={{ y: [0, -20, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="relative z-20"
                 >
                     <div className="relative w-[300px] mx-auto h-[600px] bg-royal-900 rounded-[3rem] border-8 border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10">
                         {/* Fake UI Inside Phone */}
                         <div className="absolute top-0 left-0 w-full h-full bg-royal-950 flex flex-col">
                             {/* Phone Header */}
                             <div className="h-24 bg-gradient-to-b from-royal-800 to-royal-950 p-6 pt-10 flex justify-between items-center">
                                 <div className="w-8 h-8 rounded-full bg-gold-500/20 flex items-center justify-center"><Trophy size={16} className="text-gold-500" /></div>
                                 <div className="px-3 py-1 bg-black/40 rounded-full text-xs font-mono text-green-400 font-bold">+5,000 FCFA</div>
                             </div>
                             {/* Phone Body (Game Board Mock) */}
                             <div className="flex-1 p-4 flex flex-col items-center justify-center gap-4 relative">
                                 <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                                 
                                 {/* Opponent */}
                                 <div className="flex items-center gap-3 w-full bg-white/5 p-3 rounded-xl border border-white/5">
                                     <div className="w-10 h-10 rounded-full bg-red-500 border-2 border-red-400"></div>
                                     <div className="h-2 w-20 bg-slate-700 rounded"></div>
                                 </div>

                                 {/* Board */}
                                 <div className="w-full aspect-square bg-royal-900 rounded-xl border-2 border-gold-500/30 flex items-center justify-center relative shadow-[0_0_30px_rgba(251,191,36,0.1)]">
                                     <div className="text-4xl font-black text-white">VS</div>
                                     <motion.div 
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-0 border-2 border-dashed border-white/10 rounded-xl"
                                     />
                                 </div>

                                 {/* Me */}
                                 <div className="flex items-center gap-3 w-full bg-gold-500/10 p-3 rounded-xl border border-gold-500/20">
                                     <div className="w-10 h-10 rounded-full bg-gold-500 border-2 border-white"></div>
                                     <div className="h-2 w-24 bg-slate-600 rounded"></div>
                                 </div>
                             </div>
                             {/* Phone Footer (CTA) */}
                             <div className="p-4">
                                 <div className="w-full h-12 bg-gold-500 rounded-xl flex items-center justify-center text-royal-950 font-bold shadow-lg">ROLL DICE</div>
                             </div>
                         </div>
                     </div>
                 </motion.div>

                 {/* Decorative Blobs behind phone */}
                 <motion.div 
                    animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gold-500/20 blur-[100px] -z-10 rounded-full"
                 />
             </motion.div>
         </div>
      </section>

      {/* Infinite Marquee */}
      <div className="relative z-20 -mt-10 mb-20 transform -rotate-1 shadow-2xl">
          <div className="bg-royal-900 border-y-4 border-gold-500 py-4 overflow-hidden">
              <InfiniteMarquee items={winnersList} />
          </div>
      </div>

      {/* STATS STRIP */}
      <div className="container mx-auto px-6 mb-24 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                  { label: "Total Payouts", value: `${(counter).toLocaleString()} FCFA`, icon: TrendingUp, color: "text-green-400" },
                  { label: "Active Matches", value: "842 Live", icon: Activity, color: "text-blue-400" },
                  { label: "Avg. Match Time", value: "4m 12s", icon: Zap, color: "text-purple-400" }
              ].map((stat, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.2 }}
                    className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition-colors"
                  >
                      <div className={`p-3 rounded-xl bg-black/40 ${stat.color}`}>
                          <stat.icon size={24} />
                      </div>
                      <div>
                          <div className="text-2xl font-display font-bold text-white">{stat.value}</div>
                          <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">{stat.label}</div>
                      </div>
                  </motion.div>
              ))}
          </div>
      </div>

      {/* Games Showcase (3D Tilt Cards) */}
      <section className="relative z-10 py-20">
         <div className="container mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">Choose Your Arena</h2>
                <p className="text-slate-400 text-lg">Four classic games. One secure platform.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 perspective-1000">
                {games.map((game, idx) => (
                    <TiltCard
                        key={idx}
                        onClick={onLogin}
                        className={`group p-8 rounded-3xl border ${game.border} ${game.bg} backdrop-blur-sm relative overflow-hidden cursor-pointer transition-all shadow-2xl`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        
                        <div className="flex justify-between items-start mb-8 relative z-10">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${game.color} bg-black/40 border border-white/10 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                <game.icon size={32} />
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold bg-black/40 px-3 py-1.5 rounded-full text-slate-300 border border-white/5">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                Live
                            </div>
                        </div>
                        
                        <div className="relative z-10 transform group-hover:translate-z-10 transition-transform">
                            <h3 className="text-2xl font-bold text-white mb-2">{game.name}</h3>
                            <p className="text-slate-400 text-sm mb-6 leading-relaxed">{game.desc}</p>
                            
                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div>
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Pot Size</span>
                                    <span className={`font-mono font-bold text-lg ${game.color}`}>{game.pot}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Players</span>
                                    <span className="text-white font-medium">{game.players}</span>
                                </div>
                            </div>
                        </div>
                    </TiltCard>
                ))}
            </div>
         </div>
      </section>

      {/* Trust & Security Section */}
      <section className="relative z-10 py-20 bg-black/20 border-y border-white/5">
         <div className="container mx-auto px-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                 <motion.div 
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                 >
                     <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-6">
                         <span className="text-purple-400">V-Guard AI</span> Referee
                     </h2>
                     <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                         Our proprietary AI monitors every move in real-time. It detects bots, collusion, and network manipulation instantly.
                     </p>
                     
                     <div className="space-y-4">
                         {['Anti-Cheat Engine', 'Latency Compensation', 'Bot Detection', 'Auto-Forfeit Logic'].map((feature, i) => (
                             <div key={i} className="flex items-center gap-3">
                                 <div className="p-1 rounded-full bg-green-500/20 text-green-400"><ShieldCheck size={14} /></div>
                                 <span className="text-slate-200 font-medium">{feature}</span>
                             </div>
                         ))}
                     </div>
                 </motion.div>

                 <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="relative bg-royal-900/50 rounded-3xl p-8 border border-white/10 overflow-hidden"
                 >
                     {/* Scanner Effect */}
                     <div className="absolute top-0 left-0 w-full h-1 bg-purple-500 shadow-[0_0_15px_#a855f7] animate-scan opacity-50"></div>
                     
                     <div className="flex items-center gap-4 mb-6">
                         <div className="w-12 h-12 rounded-xl bg-royal-800 flex items-center justify-center border border-white/10">
                             <Cpu size={24} className="text-purple-400" />
                         </div>
                         <div>
                             <div className="font-bold text-white">System Status</div>
                             <div className="text-xs text-green-400 font-mono">ALL SYSTEMS OPERATIONAL</div>
                         </div>
                     </div>
                     
                     <div className="space-y-3 font-mono text-xs text-slate-400">
                         <div className="flex justify-between border-b border-white/5 pb-2">
                             <span>Integrity Check</span>
                             <span className="text-green-400">PASSED</span>
                         </div>
                         <div className="flex justify-between border-b border-white/5 pb-2">
                             <span>Server Latency</span>
                             <span className="text-white">24ms</span>
                         </div>
                         <div className="flex justify-between">
                             <span>Encryption</span>
                             <span className="text-gold-400">AES-256</span>
                         </div>
                     </div>
                 </motion.div>
             </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-12 bg-black/40 mt-12">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 opacity-50">
                <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-black font-bold text-sm">V</div>
                <span className="font-display font-bold tracking-wide">VANTAGE</span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
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
      `}</style>
    </div>
  );
};
