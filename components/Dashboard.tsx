import React, { useState, useEffect } from 'react';
import { Plus, Wallet, Trophy, Flame, Users, Zap, Dice5, Target, Brain, X, Layers, History } from 'lucide-react';
import { Transaction } from '../types';
import { getUserTransactions } from '../services/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../services/i18n';
import { useUser, useNav } from '../services/context';

export const Dashboard: React.FC = () => {
  const { user } = useUser();
  const { setView } = useNav();
  const { t } = useLanguage();
  
  const [winners, setWinners] = useState([
      { name: "Player_992", amount: "5,000", game: "Dice", avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}` }
  ]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

  // Simulation Effects
  useEffect(() => {
      const interval = setInterval(() => {
          setWinners(prev => [{
              name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
              amount: (Math.floor(Math.random() * 50) * 100).toLocaleString(),
              game: ['Dice', 'TicTacToe', 'Checkers', 'Cards', 'Chess'][Math.floor(Math.random() * 5)],
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
          }, ...prev].slice(0, 5));
      }, 5000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      if (user && !user.id.startsWith('guest-')) {
          getUserTransactions(user.id).then(history => setRecentTransactions(history.slice(0, 3)));
      }
  }, [user]);

  if (!user) return null;

  const games = [
    { id: 'Dice', name: 'Dice Duel', players: 1240, icon: Dice5, color: 'text-gold-400', bg: 'hover:bg-gold-500/20 hover:border-gold-500/50', gradient: 'from-gold-500/20 to-transparent' },
    { id: 'TicTacToe', name: 'XO Clash', players: 2100, icon: X, color: 'text-blue-400', bg: 'hover:bg-blue-500/20 hover:border-blue-500/50', gradient: 'from-blue-500/20 to-transparent' },
    { id: 'Cards', name: 'Kmer Card', players: 1850, icon: Layers, color: 'text-pink-400', bg: 'hover:bg-pink-500/20 hover:border-pink-500/50', gradient: 'from-pink-500/20 to-transparent' },
    { id: 'Checkers', name: 'Checkers Pro', players: 156, icon: Target, color: 'text-cam-red', bg: 'hover:bg-cam-red/20 hover:border-cam-red/50', gradient: 'from-cam-red/20 to-transparent' },
    { id: 'Chess', name: 'Master Chess', players: 85, icon: Brain, color: 'text-purple-400', bg: 'hover:bg-purple-500/20 hover:border-purple-500/50', gradient: 'from-purple-500/20 to-transparent' },
  ];

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, show: { y: 0, opacity: 1 } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
      
      {/* Header */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
            {t('hello')}, <span className="text-gold-400">{user.name}</span>
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1">{t('welcome_arena')}</p>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} className="relative cursor-pointer" onClick={() => setView('profile')}>
          <img src={user.avatar} alt="Profile" className="w-12 h-12 rounded-full border-2 border-gold-400 object-cover shadow-[0_0_15px_rgba(251,191,36,0.3)]" />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-cam-green rounded-full border-2 border-royal-900 animate-pulse"></div>
        </motion.div>
      </header>

      {/* Live Winners Ticker */}
      <motion.div variants={itemVariants} className="bg-royal-900/50 border border-white/5 rounded-xl p-3 flex items-center gap-3 overflow-hidden relative">
          <div className="flex items-center gap-2 text-gold-400 font-bold text-[10px] md:text-xs uppercase tracking-wider whitespace-nowrap z-10 bg-royal-900/80 pr-3 border-r border-white/10 shrink-0">
              <Flame size={12} className="animate-bounce" /> {t('live_wins')}
          </div>
          <div className="flex-1 h-6 relative overflow-hidden">
              <AnimatePresence mode='wait'>
                  {winners.length > 0 && (
                      <motion.div
                          key={winners[0].name + Date.now()} 
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -20, opacity: 0 }}
                          className="absolute inset-0 flex items-center gap-2 text-xs text-slate-300 w-full"
                      >
                          <img src={winners[0].avatar} className="w-4 h-4 rounded-full border border-white/20 shrink-0" alt="" />
                          <span className="text-white font-bold truncate max-w-[80px]">{winners[0].name}</span>
                          <span className="shrink-0">{t('won')}</span>
                          <span className="text-gold-400 font-mono font-bold shrink-0">{winners[0].amount} FCFA</span>
                          <span className="text-slate-500 text-[10px] shrink-0 truncate hidden sm:inline">{t('in')} {winners[0].game}</span>
                      </motion.div>
                  )}
              </AnimatePresence>
          </div>
      </motion.div>

      {/* Wallet Card */}
      <motion.div variants={itemVariants} className="glass-panel p-6 rounded-3xl flex flex-col justify-between relative overflow-hidden group border-gold-500/20 bg-gradient-to-br from-royal-800 to-royal-950 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500 transform group-hover:scale-110"><Wallet size={180} /></div>
          <div>
            <div className="flex items-center gap-1.5 text-gold-400 text-xs font-bold uppercase tracking-widest mb-1">
                <span>{t('vantage_vault')}</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mt-2 tracking-tight">
              {user.balance.toLocaleString()} <span className="text-slate-400 text-2xl font-sans font-normal">FCFA</span>
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-8 relative z-10">
            <button onClick={() => setView('finance')} className="flex-1 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 group/btn">
              <Plus size={20} className="group-hover/btn:rotate-90 transition-transform" /> <span>{t('deposit_funds')}</span>
            </button>
          </div>
      </motion.div>

      {/* Games */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mt-4">
             <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><Zap className="text-gold-400" size={20} /> {t('trending_games')}</h3>
             <button onClick={() => setView('lobby')} className="text-xs text-gold-400 font-bold uppercase hover:text-white transition-colors">{t('view_lobby')}</button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {games.map((game) => (
            <motion.div
                key={game.id}
                variants={itemVariants}
                whileHover={{ y: -5, scale: 1.02 }}
                onClick={() => setView('lobby')}
                className={`glass-panel p-5 rounded-2xl border border-white/5 cursor-pointer group relative overflow-hidden transition-all duration-300 ${game.bg}`}
            >
                <div className={`absolute inset-0 bg-gradient-to-br ${game.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-royal-950 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-300 ${game.color}`}>
                            <game.icon size={24} />
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold bg-black/40 px-2 py-1 rounded-full text-slate-300">
                            <Users size={10} /> {game.players}
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1 group-hover:translate-x-1 transition-transform">{game.name}</h3>
                    <button className={`w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wider transition-colors ${game.color}`}>{t('play_now')}</button>
                </div>
            </motion.div>
        ))}
      </div>

      {/* History */}
      <motion.div variants={itemVariants} className="glass-panel p-6 rounded-2xl mt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3"><History className="text-slate-400" size={20} /><h3 className="text-lg font-bold text-white">{t('recent_activity')}</h3></div>
            <button onClick={() => setView('finance')} className="text-xs text-gold-400 hover:text-white font-bold uppercase tracking-wide">{t('view_all')}</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recentTransactions.length > 0 ? (
                recentTransactions.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-royal-900/50 rounded-xl hover:bg-royal-900 transition-colors border border-transparent hover:border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-royal-800 rounded-lg text-slate-400">
                            {item.type === 'winnings' ? <Trophy size={16} /> : item.type === 'stake' ? <Target size={16} /> : <Wallet size={16} />}
                        </div>
                        <div className="flex flex-col"><span className="font-medium text-white text-sm capitalize">{item.type}</span><span className="text-[10px] text-slate-500">{item.date}</span></div>
                    </div>
                    <div className={`font-mono font-bold text-sm ${item.amount > 0 ? 'text-green-400' : 'text-slate-200'}`}>{item.amount > 0 ? '+' : ''}{item.amount} FCFA</div>
                  </div>
                ))
            ) : <div className="col-span-3 text-center text-slate-500 text-sm py-4">No recent activity found.</div>}
          </div>
      </motion.div>
    </motion.div>
  );
};