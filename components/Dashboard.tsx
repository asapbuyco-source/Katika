
import React, { useState, useEffect } from 'react';
import { Plus, Wallet, Trophy, Play, History, Shield, Flame, Users, ArrowRight, Zap, LayoutGrid, Dice5, Target, Brain, TrendingUp } from 'lucide-react';
import { User, ViewState } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardProps {
  user: User;
  setView: (view: ViewState) => void;
  onTopUp: () => void;
  onQuickMatch: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, setView, onTopUp, onQuickMatch }) => {
  const [currentWinnerIndex, setCurrentWinnerIndex] = useState(0);

  // Mock Live Winners for the Ticker
  const winners = [
      { name: "Blaise", amount: "15,000", game: "Ludo", avatar: "https://i.pravatar.cc/150?u=Blaise" },
      { name: "Chantal", amount: "2,500", game: "Dice", avatar: "https://i.pravatar.cc/150?u=Chantal" },
      { name: "Franck", amount: "50,000", game: "Checkers", avatar: "https://i.pravatar.cc/150?u=Franck" },
      { name: "Sarah", amount: "8,000", game: "Chess", avatar: "https://i.pravatar.cc/150?u=Sarah" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWinnerIndex((prev) => (prev + 1) % winners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const getRankColor = (tier: string) => {
      switch(tier) {
          case 'Diamond': return 'text-cyan-400 border-cyan-400 bg-cyan-400/10';
          case 'Gold': return 'text-yellow-400 border-yellow-400 bg-yellow-400/10';
          case 'Silver': return 'text-slate-300 border-slate-300 bg-slate-300/10';
          default: return 'text-orange-400 border-orange-400 bg-orange-400/10';
      }
  };

  const games = [
    { id: 'Ludo', name: 'Ludo Club', players: 842, icon: LayoutGrid, color: 'text-cam-green', bg: 'hover:bg-cam-green/20 hover:border-cam-green/50', gradient: 'from-cam-green/20 to-transparent' },
    { id: 'Dice', name: 'Dice Duel', players: 1240, icon: Dice5, color: 'text-gold-400', bg: 'hover:bg-gold-500/20 hover:border-gold-500/50', gradient: 'from-gold-500/20 to-transparent' },
    { id: 'Checkers', name: 'Checkers Pro', players: 156, icon: Target, color: 'text-cam-red', bg: 'hover:bg-cam-red/20 hover:border-cam-red/50', gradient: 'from-cam-red/20 to-transparent' },
    { id: 'Chess', name: 'Master Chess', players: 85, icon: Brain, color: 'text-purple-400', bg: 'hover:bg-purple-500/20 hover:border-purple-500/50', gradient: 'from-purple-500/20 to-transparent' },
  ];

  const containerVariants = {
      hidden: { opacity: 0 },
      show: {
          opacity: 1,
          transition: { staggerChildren: 0.1 }
      }
  };

  const itemVariants = {
      hidden: { y: 20, opacity: 0 },
      show: { y: 0, opacity: 1 }
  };

  return (
    <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 pb-24 md:pb-6"
    >
      {/* Header */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
            Bonjour, <span className="text-gold-400">{user.name}</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
             <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getRankColor(user.rankTier)}`}>
                {user.rankTier} Tier
             </span>
             <span className="text-slate-400 text-sm font-mono">{user.elo} ELO</span>
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} className="relative cursor-pointer" onClick={() => setView('profile')}>
          <img
            src={user.avatar}
            alt="Profile"
            className="w-12 h-12 rounded-full border-2 border-gold-400 object-cover shadow-[0_0_15px_rgba(251,191,36,0.3)]"
          />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-cam-green rounded-full border-2 border-royal-900 animate-pulse"></div>
        </motion.div>
      </header>

      {/* Live Winners Ticker */}
      <motion.div variants={itemVariants} className="bg-royal-900/50 border border-white/5 rounded-xl p-3 flex items-center gap-4 overflow-hidden relative">
          <div className="flex items-center gap-2 text-gold-400 font-bold text-xs uppercase tracking-wider whitespace-nowrap z-10 bg-royal-900/80 pr-4 border-r border-white/10">
              <Flame size={14} className="animate-bounce" /> Live Wins
          </div>
          <div className="flex-1 h-6 relative overflow-hidden">
              <AnimatePresence mode='wait'>
                  <motion.div
                      key={currentWinnerIndex}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                      className="absolute inset-0 flex items-center gap-2 text-sm text-slate-300"
                  >
                      <img src={winners[currentWinnerIndex].avatar} className="w-5 h-5 rounded-full border border-white/20" alt="" />
                      <span className="text-white font-bold">{winners[currentWinnerIndex].name}</span>
                      <span>just won</span>
                      <span className="text-gold-400 font-mono font-bold">{winners[currentWinnerIndex].amount} FCFA</span>
                      <span className="text-slate-500 text-xs">in {winners[currentWinnerIndex].game}</span>
                  </motion.div>
              </AnimatePresence>
          </div>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Money-First Wallet Card */}
        <motion.div variants={itemVariants} className="glass-panel p-6 rounded-3xl flex flex-col justify-between relative overflow-hidden group border-gold-500/20 bg-gradient-to-br from-royal-800 to-royal-950 shadow-xl md:col-span-2">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500 transform group-hover:scale-110">
            <Wallet size={180} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-gold-400 text-xs font-bold uppercase tracking-widest mb-1">
                <Shield size={12} fill="currentColor" /> 
                <span>Vantage Secure Vault</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mt-2 tracking-tight">
              {user.balance.toLocaleString()} <span className="text-slate-400 text-2xl font-sans font-normal">FCFA</span>
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-8 relative z-10">
            <button 
                onClick={onTopUp}
                className="flex-1 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:shadow-[0_0_30px_rgba(251,191,36,0.5)] active:scale-95 group/btn"
            >
              <Plus size={20} className="group-hover/btn:rotate-90 transition-transform" /> 
              <span>DEPOSIT FUNDS</span>
            </button>
            <div className="flex gap-2">
                <button onClick={onTopUp} className="w-14 h-full bg-[#ffcc00] rounded-xl flex items-center justify-center text-[10px] font-black text-black hover:scale-105 transition-transform shadow-lg" title="MTN Mobile Money">MTN</button>
                <button onClick={onTopUp} className="w-14 h-full bg-[#ff6600] rounded-xl flex items-center justify-center text-[10px] font-black text-white hover:scale-105 transition-transform shadow-lg" title="Orange Money">OM</button>
            </div>
          </div>
        </motion.div>

        {/* Stats / Rank Card */}
        <motion.div variants={itemVariants} className="glass-panel p-6 rounded-3xl md:col-span-1 border-l-4 border-l-cam-red relative overflow-hidden">
             <div className="absolute -right-4 -top-4 w-24 h-24 bg-cam-red/20 blur-3xl rounded-full"></div>
             <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-2">
                    <Trophy className="text-cam-red" size={20} />
                    <h3 className="text-lg font-bold text-white">Season Rank</h3>
                </div>
                <ArrowRight size={16} className="text-slate-500" />
             </div>
             
             <div className="space-y-6 relative z-10">
                 <div className="text-center py-2">
                     <div className="text-3xl font-display font-bold text-white mb-1">{user.rankTier}</div>
                     <div className="text-xs text-slate-400 uppercase tracking-widest">Current Division</div>
                 </div>
                 
                 <div>
                    <div className="flex justify-between items-center text-xs mb-2">
                        <span className="text-slate-400">Progress to Gold</span>
                        <span className="text-white font-mono">85%</span>
                    </div>
                    <div className="w-full bg-royal-900 rounded-full h-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-cam-red to-orange-500 h-2 rounded-full w-[85%] shadow-[0_0_10px_rgba(206,17,38,0.5)] relative overflow-hidden">
                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite] skew-x-12"></div>
                        </div>
                    </div>
                 </div>

                 <div className="p-3 bg-white/5 rounded-xl flex justify-between items-center">
                     <span className="text-xs text-slate-400">Global Rank</span>
                     <span className="text-sm font-mono font-bold text-white">#1,420</span>
                 </div>
             </div>
        </motion.div>

        {/* GAMES GRID TITLE */}
        <motion.div variants={itemVariants} className="md:col-span-3 flex items-center justify-between mt-4">
             <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                 <Zap className="text-gold-400 fill-gold-400" size={20} /> Trending Games
             </h3>
             <button onClick={onQuickMatch} className="text-xs text-gold-400 font-bold uppercase hover:text-white transition-colors">View Lobby</button>
        </motion.div>

        {/* GAMES GRID */}
        {games.map((game, i) => (
            <motion.div
                key={game.id}
                variants={itemVariants}
                whileHover={{ y: -5, scale: 1.02 }}
                onClick={() => {
                    // Logic to jump to specific game or lobby
                    onQuickMatch();
                }}
                className={`glass-panel p-5 rounded-2xl border border-white/5 cursor-pointer group relative overflow-hidden transition-all duration-300 ${game.bg}`}
            >
                {/* Background Gradient on Hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${game.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-royal-950 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-300 ${game.color}`}>
                            <game.icon size={24} />
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold bg-black/40 px-2 py-1 rounded-full text-slate-300">
                            <Users size={10} />
                            {game.players}
                        </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-white mb-1 group-hover:translate-x-1 transition-transform">{game.name}</h3>
                    <p className="text-xs text-slate-500 mb-4 group-hover:text-slate-400">Ranked & Casual Tables</p>

                    <button className={`w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wider transition-colors ${game.color}`}>
                        Play Now
                    </button>
                </div>
            </motion.div>
        ))}

        {/* Recent History (Full Width) */}
        <motion.div variants={itemVariants} className="glass-panel p-6 rounded-2xl md:col-span-3 mt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <History className="text-slate-400" size={20} />
              <h3 className="text-lg font-bold text-white">Recent Activity</h3>
            </div>
            <button className="text-xs text-gold-400 hover:text-white font-bold uppercase tracking-wide">View All</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { game: 'Ludo Classic', result: 'Won', amount: '+900', time: '2 mins ago', color: 'text-cam-green', icon: LayoutGrid },
              { game: 'Dice Roll', result: 'Lost', amount: '-500', time: '1 hour ago', color: 'text-cam-red', icon: Dice5 },
              { game: 'Checkers', result: 'Won', amount: '+2,700', time: '3 hours ago', color: 'text-cam-green', icon: Target },
            ].map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-royal-900/50 rounded-xl hover:bg-royal-900 transition-colors border border-transparent hover:border-white/5">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-royal-800 rounded-lg text-slate-400">
                        <item.icon size={16} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-medium text-white text-sm">{item.game}</span>
                        <span className="text-[10px] text-slate-500">{item.time}</span>
                    </div>
                </div>
                <div className={`font-mono font-bold text-sm ${item.color}`}>
                  {item.amount} FCFA
                </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
};
