
import React, { useState } from 'react';
import { Users, Lock, ChevronRight, LayoutGrid, Brain, Dice5, Wallet, Target, X, Star } from 'lucide-react';
import { ViewState, User, GameTier } from '../types';
import { GAME_TIERS } from '../services/mockData';
import { motion, AnimatePresence } from 'framer-motion';

interface LobbyProps {
  user: User;
  setView: (view: ViewState) => void;
  onQuickMatch: (stake: number, gameType: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ user, setView, onQuickMatch }) => {
  const [selectedGame, setSelectedGame] = useState('Ludo');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [neededAmount, setNeededAmount] = useState(0);

  const games = [
      { id: 'Ludo', icon: LayoutGrid, color: 'text-cam-green' },
      { id: 'Dice', icon: Dice5, color: 'text-gold-400' },
      { id: 'Checkers', icon: Target, color: 'text-cam-red' },
      { id: 'Chess', icon: Brain, color: 'text-purple-400' },
  ];

  const handleTierSelect = (tier: GameTier) => {
      if (user.balance < tier.stake) {
          setNeededAmount(tier.stake - user.balance);
          setShowDepositModal(true);
      } else {
          onQuickMatch(tier.stake, selectedGame);
      }
  };

  const handleDeposit = () => {
      alert("Redirecting to Mobile Money Gateway...");
      setShowDepositModal(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24 md:pb-6 min-h-screen relative">
      
      {/* Deposit Modal */}
      <AnimatePresence>
          {showDepositModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowDepositModal(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-royal-900 border border-gold-500 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                  >
                      <button onClick={() => setShowDepositModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                          <X size={20} />
                      </button>
                      
                      <div className="text-center mb-6">
                          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Wallet className="text-red-500" size={32} />
                          </div>
                          <h2 className="text-xl font-bold text-white mb-2">Insufficient Funds</h2>
                          <p className="text-sm text-slate-400">
                              You need <span className="text-gold-400 font-bold">{neededAmount.toLocaleString()} FCFA</span> more to join this table.
                          </p>
                      </div>

                      <div className="space-y-3">
                          <button 
                            onClick={handleDeposit}
                            className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                          >
                              <span className="font-extrabold">MTN</span> Mobile Money
                          </button>
                          <button 
                            onClick={handleDeposit}
                            className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                          >
                              <span className="font-extrabold">Orange</span> Money
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-white mb-2">Game Selection</h1>
        <p className="text-slate-400">Select a game and choose your stakes.</p>
      </div>

      {/* Game Selector Chips */}
      <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide mb-4">
          {games.map((g) => (
              <button
                  key={g.id}
                  onClick={() => setSelectedGame(g.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all ${
                      selectedGame === g.id 
                      ? 'bg-royal-800 border-gold-500 shadow-[0_0_20px_rgba(251,191,36,0.1)]' 
                      : 'bg-royal-900/50 border-white/10 opacity-60 hover:opacity-100'
                  }`}
              >
                  <g.icon size={20} className={selectedGame === g.id ? g.color : 'text-slate-400'} />
                  <span className={`font-bold ${selectedGame === g.id ? 'text-white' : 'text-slate-400'}`}>
                      {g.id}
                  </span>
              </button>
          ))}
      </div>

      {/* Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {GAME_TIERS.map((tier, idx) => {
              const isPopular = tier.stake === 500;
              return (
                <motion.div
                    key={tier.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ y: -8, scale: 1.02 }}
                    onClick={() => handleTierSelect(tier)}
                    className={`glass-panel p-6 rounded-3xl border cursor-pointer group relative overflow-visible transition-all duration-300 ${
                        isPopular ? 'border-gold-500/50 bg-royal-800/80 shadow-[0_0_30px_rgba(251,191,36,0.1)] ring-1 ring-gold-500/20' : 'border-white/10 hover:border-gold-500/30'
                    }`}
                >
                    {/* MOST POPULAR BADGE */}
                    {isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-max z-20">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gold-400 blur-sm rounded-full opacity-50 animate-pulse"></div>
                                <div className="relative bg-gradient-to-r from-gold-400 to-gold-600 text-royal-950 text-[10px] font-black px-4 py-1 rounded-full shadow-lg flex items-center gap-1">
                                    <Star size={10} fill="currentColor" />
                                    MOST POPULAR
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hover Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-gold-500/0 to-gold-500/0 group-hover:from-gold-500/5 group-hover:to-purple-500/10 transition-all duration-500 rounded-3xl" />

                    {/* Header */}
                    <div className="flex justify-between items-start mb-6 relative z-10">
                        <div>
                            <h3 className={`text-sm font-bold uppercase tracking-wider mb-1 ${isPopular ? 'text-gold-400' : 'text-slate-400'}`}>{tier.name}</h3>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-cam-green">
                                <span className="w-2 h-2 rounded-full bg-cam-green animate-pulse" />
                                {tier.speed} Matchmaking
                            </div>
                        </div>
                        <div className={`p-2 rounded-xl border transition-colors ${
                            isPopular ? 'bg-gold-500/10 border-gold-500/30' : 'bg-royal-950 border-white/10 group-hover:border-gold-500/30'
                        }`}>
                            <Lock size={18} className={isPopular ? 'text-gold-400' : 'text-slate-500 group-hover:text-gold-400'} />
                        </div>
                    </div>

                    {/* Main Stats */}
                    <div className="space-y-4 relative z-10">
                        <div>
                            <p className="text-xs text-slate-500 mb-1">Entry Stake</p>
                            <h2 className="text-3xl font-display font-bold text-white">
                                {tier.stake} <span className="text-sm text-gold-500">FCFA</span>
                            </h2>
                        </div>
                        
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                            <span className="text-xs text-slate-400">Potential Win</span>
                            <span className="font-mono font-bold text-green-400 text-lg">
                                {tier.potentialWin} <span className="text-xs">FCFA</span>
                            </span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center relative z-10">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Users size={14} className={isPopular ? 'text-gold-400' : ''} />
                            <span className={isPopular ? 'text-slate-300 font-bold' : ''}>{tier.playersOnline} Online</span>
                        </div>
                        <ChevronRight size={18} className="text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-transform" />
                    </div>
                </motion.div>
            )})}
      </div>

      <div className="mt-8 p-4 bg-royal-900/30 border border-white/5 rounded-2xl flex items-center justify-center gap-2 text-sm text-slate-400">
          <Lock size={14} /> Stakes are held in secure Escrow until game completion.
      </div>
    </div>
  );
};
