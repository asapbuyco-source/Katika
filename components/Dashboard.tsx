
import React, { useState, useEffect } from 'react';
import { Plus, Wallet, Trophy, Play, History, Shield, Flame, Users, ArrowRight, Zap, LayoutGrid, Dice5, Target, Brain, TrendingUp, X, Layers, Grid3x3, Disc, Lock } from 'lucide-react';
import { User, ViewState, Transaction } from '../types';
import { getUserTransactions, subscribeToGameConfigs, subscribeToGlobalWinners } from '../services/firebase';
import { motion as originalMotion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../services/i18n';
import { BalanceCounter } from './BalanceCounter';
import { StreakBadge } from './StreakBadge';
import { NetworkSignalIndicator } from './NetworkSignalIndicator';
import { getLaunchGameScope } from '../services/launchScope';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

interface DashboardProps {
  user: User;
  setView: (view: ViewState) => void;
  onTopUp: () => void;
  onQuickMatch: (gameId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, setView, onTopUp, onQuickMatch }) => {
  const { t } = useLanguage();
  const [currentWinnerIndex, setCurrentWinnerIndex] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [gameOverrides, setGameOverrides] = useState<Record<string, string>>({});

  // Real Live Winners
  const [winners, setWinners] = useState<any[]>([]);

  useEffect(() => {
    // 1. Subscribe to Real Winners
    const unsubWinners = subscribeToGlobalWinners((newWinners) => {
      setWinners(newWinners);
      setCurrentWinnerIndex(0);
    });

    // 2. Fetch User History
    const fetchHistory = async () => {
      if (!user.id) return;
      const history = await getUserTransactions(user.id);
      setRecentTransactions(history.slice(0, 3));
    };
    fetchHistory();

    // 3. Subscribe to Game Configs (Admin Control)
    const unsubConfigs = subscribeToGameConfigs(setGameOverrides);

    return () => {
      unsubWinners();
      unsubConfigs();
    };
  }, [user.id]);

  // Rotate Winners Ticker
  useEffect(() => {
    const tickerCount = winners.length > 1 ? winners.length : seededWinners.length;
    if (tickerCount > 1) {
      const interval = setInterval(() => {
        setCurrentWinnerIndex(prev => (prev + 1) % tickerCount);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [winners]);

  // P1-1: Build-time scope lock — only show launch-scope games on the dashboard.
  const LAUNCH_GAME_SCOPE = getLaunchGameScope();

  const games = [
    { id: 'Dice', name: 'Dice Duel', icon: Dice5, color: 'text-gold-400', bg: 'hover:bg-gold-500/20 hover:border-gold-500/50', gradient: 'from-gold-500/20 to-transparent', defaultStatus: 'active' },
    { id: 'Chess', name: 'Master Chess', icon: Brain, color: 'text-purple-400', bg: 'hover:bg-purple-500/20 hover:border-purple-500/50', gradient: 'from-purple-500/20 to-transparent', defaultStatus: 'active' },
    { id: 'Checkers', name: 'Checkers Pro', icon: Target, color: 'text-cam-red', bg: 'hover:bg-cam-red/20 hover:border-cam-red/50', gradient: 'from-cam-red/20 to-transparent', defaultStatus: 'active' },
    { id: 'Ludo', name: 'Ludo King', icon: Grid3x3, color: 'text-red-400', bg: 'hover:bg-red-500/20 hover:border-red-500/50', gradient: 'from-red-500/20 to-transparent', defaultStatus: 'active' },
    { id: 'TicTacToe', name: 'XO Clash', icon: X, color: 'text-blue-400', bg: 'hover:bg-blue-500/20 hover:border-blue-500/50', gradient: 'from-blue-500/20 to-transparent', defaultStatus: 'active' },
    { id: 'Cards', name: 'Kmer Card', icon: Layers, color: 'text-pink-400', bg: 'hover:bg-pink-500/20 hover:border-pink-500/50', gradient: 'from-pink-500/20 to-transparent', defaultStatus: 'disabled' },
    { id: 'Pool', name: '8-Ball Pool', icon: Disc, color: 'text-green-400', bg: 'hover:bg-green-500/20 hover:border-green-500/50', gradient: 'from-green-500/20 to-transparent', defaultStatus: 'active' },
  ].filter(g => LAUNCH_GAME_SCOPE.has(g.id));

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

  const currentWinner = winners.length > 0 ? winners[currentWinnerIndex] : null;

  const seededWinners = [
    { name: 'Jean-Marc D.', amount: 4500, game: 'Ludo', avatar: '' },
    { name: 'Amina K.', amount: 1800, game: 'Dice', avatar: '' },
    { name: 'Paul B.', amount: 9000, game: 'Chess', avatar: '' },
    { name: 'Christelle T.', amount: 3600, game: 'Checkers', avatar: '' },
    { name: 'Eric M.', amount: 2000, game: 'Ludo', avatar: '' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {/* Header */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
              {t('hello')}, <span className="text-gold-400">{user.name}</span>
            </h1>
            <p className="text-slate-400 text-xs md:text-sm mt-1">{t('welcome_arena')}</p>
          </div>
          <div className="flex items-center gap-4">
            <NetworkSignalIndicator />
            <motion.div whileHover={{ scale: 1.05 }} className="relative cursor-pointer" onClick={() => setView('profile')}>
              <img
                src={user.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + (user.name || 'U')}
                alt="Profile"
                className="w-12 h-12 rounded-full border-2 border-gold-400 object-cover shadow-[0_0_15px_rgba(251,191,36,0.3)]"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + (user.name || 'U'); }}
              />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-cam-green rounded-full border-2 border-royal-900 animate-pulse"></div>
            </motion.div>
          </div>
        </header>

        {/* Live Wins Ticker */}
        <motion.div variants={itemVariants} className="bg-royal-900/50 border border-white/5 rounded-xl p-3 flex items-center gap-3 overflow-hidden relative">
            <div className="flex items-center gap-2 text-gold-400 font-bold text-[10px] md:text-xs uppercase tracking-wider whitespace-nowrap z-10 bg-royal-900/80 pr-3 border-r border-white/10 shrink-0">
              <Flame size={12} className="animate-bounce" /> {t('live_wins')}
            </div>
            <div className="flex-1 h-6 relative overflow-hidden">
              <AnimatePresence mode='wait'>
                <motion.div
                  key={winners.length > 0 ? currentWinnerIndex : `seed-${currentWinnerIndex}`}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="absolute inset-0 flex items-center gap-2 text-xs text-slate-300 w-full"
                >
                  {winners.length > 0 && currentWinner ? (
                    <>
                      <img src={currentWinner.avatar || "https://i.pravatar.cc/150"} className="w-4 h-4 rounded-full border border-white/20 shrink-0" alt={currentWinner.name} />
                      <span className="text-white font-bold truncate max-w-[100px]">{currentWinner.name}</span>
                      <span className="shrink-0">{t('won')}</span>
                      <span className="text-gold-400 font-mono font-bold shrink-0">{currentWinner.amount} FCFA</span>
                      <span className="text-slate-500 text-[10px] shrink-0 truncate hidden sm:inline">{t('in')} {currentWinner.game}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-4 h-4 rounded-full bg-gold-500/30 border border-gold-500/20 shrink-0 flex items-center justify-center text-[8px]">★</div>
                      <span className="text-white font-bold truncate max-w-[100px]">{seededWinners[currentWinnerIndex]?.name}</span>
                      <span className="shrink-0">{t('won')}</span>
                      <span className="text-gold-400 font-mono font-bold shrink-0">{seededWinners[currentWinnerIndex]?.amount} FCFA</span>
                      <span className="text-slate-500 text-[10px] shrink-0 truncate hidden sm:inline">{t('in')} {seededWinners[currentWinnerIndex]?.game}</span>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Money-First Wallet Card */}
          <motion.div variants={itemVariants} className="glass-panel p-6 rounded-3xl flex flex-col justify-between relative overflow-hidden group border-gold-500/20 bg-gradient-to-br from-royal-800 to-royal-950 shadow-xl md:col-span-3">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500 transform group-hover:scale-110">
              <Wallet size={180} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-gold-400 text-xs font-bold uppercase tracking-widest mb-1">
                <Shield size={12} fill="currentColor" />
                <span>{t('vantage_vault')}</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-display font-bold text-white mt-2 tracking-tight">
                <BalanceCounter value={user.balance} suffix=" FCFA" className="text-4xl md:text-5xl font-display font-bold" />
              </h2>
              {(user.winStreak ?? 0) >= 2 && (
                <div className="mt-2">
                  <StreakBadge streak={user.winStreak ?? 0} />
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-8 relative z-10">
              <button
                onClick={onTopUp}
                className="flex-1 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:shadow-[0_0_30px_rgba(251,191,36,0.5)] active:scale-95 group/btn"
              >
                <Plus size={20} className="group-hover/btn:rotate-90 transition-transform" />
                <span>{t('deposit_funds')}</span>
              </button>
              <div className="flex gap-2">
                <button onClick={onTopUp} className="w-14 h-full bg-[#ffcc00] rounded-xl flex items-center justify-center text-[10px] font-black text-black hover:scale-105 transition-transform shadow-lg" title="MTN Mobile Money">MTN</button>
                <button onClick={onTopUp} className="w-14 h-full bg-[#ff6600] rounded-xl flex items-center justify-center text-[10px] font-black text-white hover:scale-105 transition-transform shadow-lg" title="Orange Money">OM</button>
              </div>
            </div>
          </motion.div>


          <motion.div variants={itemVariants} className="md:col-span-3 flex items-center justify-between mt-4">
            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Zap className="text-gold-400 fill-gold-400" size={20} /> {t('trending_games')}
            </h3>
            <button onClick={() => onQuickMatch()} className="text-xs text-gold-400 font-bold uppercase hover:text-white transition-colors">{t('view_lobby')}</button>
          </motion.div>

          {/* GAMES GRID */}
          {games.map((game, i) => {
            const status = gameOverrides[game.id] || game.defaultStatus;
            const isActive = status === 'active';

            return (
              <motion.div
                key={game.id}
                variants={itemVariants}
                whileHover={isActive ? { y: -5, scale: 1.02 } : {}}
                onClick={() => isActive && onQuickMatch(game.id)}
                className={`
                      premium-glass p-5 rounded-3xl relative overflow-hidden transition-all duration-300
                      ${isActive ? `cursor-pointer group hover:shadow-[0_20px_40px_-10px_rgba(251,191,36,0.15)] ${game.bg}` : 'opacity-60 cursor-not-allowed bg-royal-900/20 grayscale'}
                  `}
              >
                {/* Ambient card glow behind icon */}
                {isActive && (
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-gold-500/10 rounded-full blur-3xl group-hover:bg-gold-500/20 transition-colors"></div>
                )}

                {/* Coming Soon Overlay */}
                {!isActive && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                    <div className="px-3 py-1 bg-black/60 border border-white/10 rounded-full flex items-center gap-1.5 shadow-lg">
                      <Lock size={10} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Coming Soon</span>
                    </div>
                  </div>
                )}

                {/* Background Gradient on Hover */}
                {isActive && (
                  <div className={`absolute inset-0 bg-gradient-to-br ${game.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                )}

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-royal-950/80 flex items-center justify-center border border-white/10 ${isActive ? 'group-hover:scale-110 group-hover:border-gold-500/30 transition-all duration-300 shadow-lg' : ''} ${game.color}`}>
                      <game.icon size={24} />
                    </div>
                    {isActive && (
                        <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-[8px] font-bold text-green-400 uppercase tracking-wider">Live</span>
                        </div>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-white mb-1 group-hover:translate-x-1 group-hover:text-glow transition-all tracking-tight">{game.name}</h3>
                  <p className="text-xs text-slate-500 mb-4 group-hover:text-gold-400/80 transition-colors">
                    {isActive ? t('ranked_casual_tables') : t('under_development')}
                  </p>

                  <button className={`w-full py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${isActive
                      ? `bg-white/5 group-hover:bg-gold-500/20 group-hover:border-gold-500/40 border-white/10 group-hover:shadow-[0_0_15px_rgba(251,191,36,0.3)] ${game.color}`
                      : 'bg-transparent border-white/5 text-slate-600'
                    }`}>
                    {isActive ? t('play_now') : t('locked')}
                  </button>
                </div>
              </motion.div>
            )
          })}

          {/* Recent History (Full Width) */}
          <motion.div variants={itemVariants} className="glass-panel p-6 rounded-2xl md:col-span-3 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <History className="text-slate-400" size={20} />
                <h3 className="text-lg font-bold text-white">{t('recent_activity')}</h3>
              </div>
              <button onClick={() => setView('finance')} className="text-xs text-gold-400 hover:text-white font-bold uppercase tracking-wide">{t('view_all')}</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {recentTransactions.length > 0 ? (
                recentTransactions.map((item, idx) => {
                  const typeLabels: Record<string, string> = {
                    winnings: 'Win',
                    stake: 'Game Entry',
                    escrow_lock: 'Game Entry',
                    game_fee: 'Game Fee',
                    bot_winnings: 'Win vs AI',
                    stake_loss: 'Loss',
                    deposit: 'Deposit',
                    withdrawal: 'Withdrawal',
                    referral_bonus: 'Referral Bonus',
                    streak_bonus: 'Streak Bonus',
                  };
                  const displayType = typeLabels[item.type] || item.type.replace(/_/g, ' ');
                  const displayDate = item.date
                    ? (() => { try { const d = new Date(item.date); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch { return ''; } })()
                    : '';
                  return (
                    <div key={idx} className="flex justify-between items-center p-3 bg-royal-900/50 rounded-xl hover:bg-royal-900 transition-colors border border-transparent hover:border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-royal-800 rounded-lg text-slate-400">
                          {(item.type === 'winnings' || (item.type as string) === 'bot_winnings') ? <Trophy size={16} /> :
                           (item.type === 'stake' || item.type === 'escrow_lock' || (item.type as string) === 'game_fee') ? <Target size={16} /> : <Wallet size={16} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-white text-sm capitalize">{displayType}</span>
                          <span className="text-[10px] text-slate-500">{displayDate}</span>
                        </div>
                      </div>
                      <div className={`font-mono font-bold text-sm ${item.amount > 0 ? 'text-green-400' : 'text-slate-200'}`}>
                        {item.amount > 0 ? '+' : ''}{item.amount} FCFA
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-3 text-center text-slate-500 text-sm py-4">
                  {user.balance === 0 && recentTransactions.length === 0
                    ? t('new_here_prompt')
                    : t('no_activity')}
                </div>
              )}
            </div>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
};
