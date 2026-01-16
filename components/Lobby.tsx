
import React, { useState } from 'react';
import { Users, Lock, ChevronRight, LayoutGrid, Brain, Dice5, Wallet, Target, X, Star, Swords, Search, UserPlus, ArrowLeft, Shield } from 'lucide-react';
import { ViewState, User, GameTier, PlayerProfile } from '../types';
import { GAME_TIERS, MOCK_PLAYERS } from '../services/mockData';
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

  // Challenge Mode State
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeStep, setChallengeStep] = useState<'search' | 'config'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<PlayerProfile | null>(null);
  const [challengeStake, setChallengeStake] = useState<number>(1000);
  const [challengeGame, setChallengeGame] = useState('Ludo');

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

  const filteredFriends = MOCK_PLAYERS.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendChallenge = () => {
      if (user.balance < challengeStake) {
          setNeededAmount(challengeStake - user.balance);
          setShowChallengeModal(false);
          setShowDepositModal(true);
          return;
      }
      
      // Simulate API call
      setShowChallengeModal(false);
      alert(`Challenge sent to ${selectedFriend?.name} for ${challengeStake} FCFA in ${challengeGame}!`);
      
      // Reset state
      setChallengeStep('search');
      setSearchQuery('');
      setSelectedFriend(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24 md:pb-6 min-h-screen relative">
      
      {/* Deposit Modal */}
      <AnimatePresence>
          {showDepositModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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

      {/* Challenge Friend Modal */}
      <AnimatePresence>
          {showChallengeModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowChallengeModal(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    className="relative bg-royal-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                  >
                      {/* Modal Header */}
                      <div className="p-6 border-b border-white/5 bg-royal-950/50 flex justify-between items-center">
                          <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                              <Swords className="text-gold-400" size={20} />
                              {challengeStep === 'search' ? 'Challenge a Friend' : 'Configure Match'}
                          </h2>
                          <button onClick={() => setShowChallengeModal(false)} className="text-slate-400 hover:text-white transition-colors">
                              <X size={20} />
                          </button>
                      </div>

                      {/* Modal Content */}
                      <div className="p-6 overflow-y-auto custom-scrollbar">
                          {challengeStep === 'search' ? (
                              <div className="space-y-4">
                                  <div className="relative">
                                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                      <input 
                                          type="text" 
                                          placeholder="Search by username or ID..."
                                          value={searchQuery}
                                          onChange={(e) => setSearchQuery(e.target.value)}
                                          className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-gold-500 transition-colors"
                                          autoFocus
                                      />
                                  </div>
                                  
                                  <div className="space-y-2">
                                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suggested Friends</p>
                                      {filteredFriends.length > 0 ? (
                                          filteredFriends.map((friend, idx) => (
                                              <motion.button
                                                  key={idx}
                                                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
                                                  whileTap={{ scale: 0.98 }}
                                                  onClick={() => {
                                                      setSelectedFriend(friend);
                                                      setChallengeStep('config');
                                                  }}
                                                  className="w-full p-3 rounded-xl border border-white/5 flex items-center justify-between group transition-all"
                                              >
                                                  <div className="flex items-center gap-3">
                                                      <img src={friend.avatar} alt={friend.name} className="w-10 h-10 rounded-full border border-white/10" />
                                                      <div className="text-left">
                                                          <div className="font-bold text-white">{friend.name}</div>
                                                          <div className="text-xs text-slate-400">{friend.rankTier} • {friend.elo} ELO</div>
                                                      </div>
                                                  </div>
                                                  <div className="p-2 bg-royal-800 rounded-lg text-gold-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                      <Swords size={16} />
                                                  </div>
                                              </motion.button>
                                          ))
                                      ) : (
                                          <div className="text-center py-8 text-slate-500">
                                              <UserPlus size={32} className="mx-auto mb-2 opacity-50" />
                                              <p>No friends found.</p>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          ) : (
                              <div className="space-y-6">
                                  {/* VS Header */}
                                  <div className="flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5">
                                      <div className="flex flex-col items-center">
                                          <img src={user.avatar} className="w-12 h-12 rounded-full border-2 border-gold-500 mb-1" />
                                          <span className="text-xs font-bold text-white">You</span>
                                      </div>
                                      <div className="text-2xl font-black text-slate-600 italic">VS</div>
                                      <div className="flex flex-col items-center">
                                          <img src={selectedFriend?.avatar} className="w-12 h-12 rounded-full border-2 border-red-500 mb-1" />
                                          <span className="text-xs font-bold text-white">{selectedFriend?.name}</span>
                                      </div>
                                  </div>

                                  {/* Game Selector */}
                                  <div>
                                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Game</label>
                                      <div className="grid grid-cols-4 gap-2">
                                          {games.map(g => (
                                              <button 
                                                  key={g.id}
                                                  onClick={() => setChallengeGame(g.id)}
                                                  className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all ${
                                                      challengeGame === g.id 
                                                      ? `bg-royal-800 border-gold-500 text-white shadow-[0_0_15px_rgba(251,191,36,0.2)]` 
                                                      : 'border-white/10 text-slate-500 hover:bg-white/5'
                                                  }`}
                                              >
                                                  <g.icon size={20} className={challengeGame === g.id ? 'text-gold-400' : ''} />
                                                  <span className="text-[10px] font-bold">{g.id}</span>
                                              </button>
                                          ))}
                                      </div>
                                  </div>

                                  {/* Stake Input */}
                                  <div>
                                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Stake Amount (FCFA)</label>
                                      <div className="relative">
                                          <input 
                                              type="number" 
                                              value={challengeStake}
                                              onChange={(e) => setChallengeStake(Number(e.target.value))}
                                              className="w-full bg-royal-950 border border-white/10 rounded-xl py-4 pl-4 pr-16 text-white font-mono font-bold text-lg focus:outline-none focus:border-gold-500 transition-colors"
                                          />
                                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">FCFA</span>
                                      </div>
                                      <div className="flex justify-between mt-2">
                                          <div className="flex gap-2">
                                              {[500, 1000, 5000].map(amt => (
                                                  <button 
                                                    key={amt} 
                                                    onClick={() => setChallengeStake(amt)}
                                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] text-slate-400 font-mono transition-colors"
                                                  >
                                                      {amt}
                                                  </button>
                                              ))}
                                          </div>
                                          <span className="text-[10px] text-slate-500">Balance: <span className="text-white">{user.balance.toLocaleString()}</span></span>
                                      </div>
                                  </div>

                                  {/* Info Box */}
                                  <div className="p-3 bg-gold-500/10 border border-gold-500/20 rounded-xl flex gap-3 items-start">
                                      <Shield className="text-gold-500 flex-shrink-0 mt-0.5" size={16} />
                                      <div className="text-xs text-gold-200/80">
                                          Funds will be locked in Escrow. Winner takes <strong>{(challengeStake * 1.9).toLocaleString()} FCFA</strong> (after 10% platform fee).
                                      </div>
                                  </div>

                                  <div className="flex gap-3 pt-2">
                                      <button 
                                          onClick={() => setChallengeStep('search')}
                                          className="p-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 transition-colors"
                                      >
                                          <ArrowLeft size={20} />
                                      </button>
                                      <button 
                                          onClick={handleSendChallenge}
                                          className="flex-1 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-400 hover:to-gold-500 text-royal-950 font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                                      >
                                          <Swords size={20} /> SEND CHALLENGE
                                      </button>
                                  </div>
                              </div>
                          )}
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Game Selection</h1>
            <p className="text-slate-400">Select a game and choose your stakes.</p>
        </div>
        <button 
            onClick={() => {
                setChallengeStep('search');
                setShowChallengeModal(true);
            }}
            className="flex items-center gap-2 px-5 py-3 bg-gold-500/10 border border-gold-500/30 hover:bg-gold-500/20 text-gold-400 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(251,191,36,0.1)] hover:shadow-[0_0_25px_rgba(251,191,36,0.2)]"
        >
            <Swords size={18} />
            Challenge Friend
        </button>
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
