
import React, { useState, useEffect } from 'react';
import { Users, Lock, ChevronRight, LayoutGrid, Brain, Dice5, Wallet, Target, X, Star, Swords, Search, UserPlus, ArrowLeft, Shield, CircleDot } from 'lucide-react';
import { ViewState, User, GameTier, PlayerProfile } from '../types';
import { GAME_TIERS, MOCK_PLAYERS } from '../services/mockData';
import { initiateFapshiPayment } from '../services/fapshi';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';

interface LobbyProps {
  user: User;
  setView: (view: ViewState) => void;
  onQuickMatch: (stake: number, gameType: string) => void;
  initialGameId?: string | null;
  onClearInitialGame?: () => void;
}

const AVAILABLE_GAMES = [
    { id: 'Ludo', name: 'Ludo Club', players: 842, icon: LayoutGrid, color: 'text-cam-green', bg: 'bg-cam-green/10', border: 'border-cam-green/20' },
    { id: 'Dice', name: 'Dice Duel', players: 1240, icon: Dice5, color: 'text-gold-400', bg: 'bg-gold-500/10', border: 'border-gold-500/20' },
    { id: 'Pool', name: '8 Ball Pool', players: 960, icon: CircleDot, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { id: 'Checkers', name: 'Checkers Pro', players: 156, icon: Target, color: 'text-cam-red', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    { id: 'Chess', name: 'Master Chess', players: 85, icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
];

export const Lobby: React.FC<LobbyProps> = ({ user, setView, onQuickMatch, initialGameId, onClearInitialGame }) => {
  const [viewState, setViewState] = useState<'games' | 'stakes'>('games');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [neededAmount, setNeededAmount] = useState(0);

  // Challenge Mode State
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeStep, setChallengeStep] = useState<'search' | 'config'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<PlayerProfile | null>(null);
  const [challengeStake, setChallengeStake] = useState<number>(1000);
  const [challengeGame, setChallengeGame] = useState('Ludo');
  
  // Payment State
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Handle Initial Deep Link
  useEffect(() => {
    if (initialGameId) {
        setSelectedGame(initialGameId);
        setViewState('stakes');
    } else {
        setViewState('games');
        setSelectedGame(null);
    }
  }, [initialGameId]);

  const handleGameSelect = (gameId: string) => {
      setSelectedGame(gameId);
      setViewState('stakes');
      playSFX('click');
  };

  const handleBackToGames = () => {
      setViewState('games');
      setSelectedGame(null);
      playSFX('click');
      if (onClearInitialGame) onClearInitialGame();
  };

  const handleTierSelect = (tier: GameTier) => {
      playSFX('click');
      if (!selectedGame) return;
      if (user.balance < tier.stake) {
          setNeededAmount(tier.stake - user.balance);
          setShowDepositModal(true);
          playSFX('error');
      } else {
          onQuickMatch(tier.stake, selectedGame);
      }
  };

  const handleDeposit = async () => {
      playSFX('click');
      const depositAmount = Math.max(neededAmount, 500); 
      setIsProcessingPayment(true);
      const response = await initiateFapshiPayment(depositAmount, user);
      setIsProcessingPayment(false);

      if (response && response.link) {
          window.open(response.link, '_blank');
          setShowDepositModal(false);
          alert("Payment page opened! Please complete transaction to update balance.");
      } else {
          alert("Payment initiation failed.");
      }
  };

  const filteredFriends = MOCK_PLAYERS.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendChallenge = () => {
      playSFX('click');
      if (user.balance < challengeStake) {
          setNeededAmount(challengeStake - user.balance);
          setShowChallengeModal(false);
          setShowDepositModal(true);
          return;
      }
      setShowChallengeModal(false);
      alert(`Challenge sent to ${selectedFriend?.name} for ${challengeStake} FCFA in ${challengeGame}!`);
      setChallengeStep('search');
      setSearchQuery('');
      setSelectedFriend(null);
  };

  const activeGameData = AVAILABLE_GAMES.find(g => g.id === selectedGame);

  // Animation Variants
  const pageVariants = {
      enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
      center: { x: 0, opacity: 1 },
      exit: (direction: number) => ({ x: direction > 0 ? -50 : 50, opacity: 0 })
  };

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24 md:pb-6 min-h-screen relative overflow-hidden">
      
      {/* --- DEPOSIT MODAL --- */}
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
                              You need <span className="text-gold-400 font-bold">{neededAmount.toLocaleString()} FCFA</span> more.
                          </p>
                      </div>
                      <div className="space-y-3">
                          <button onClick={handleDeposit} disabled={isProcessingPayment} className="w-full py-3 bg-yellow-400 text-black font-bold rounded-xl flex items-center justify-center gap-2">
                              {isProcessingPayment ? "Processing..." : "MTN Mobile Money"}
                          </button>
                          <button onClick={handleDeposit} disabled={isProcessingPayment} className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                               {isProcessingPayment ? "Processing..." : "Orange Money"}
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* --- CHALLENGE MODAL --- */}
      <AnimatePresence>
          {showChallengeModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowChallengeModal(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                    layout
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    className="relative bg-royal-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                  >
                      <div className="p-6 border-b border-white/5 bg-royal-950/50 flex justify-between items-center z-10">
                          <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                              <Swords className="text-gold-400" size={20} />
                              {challengeStep === 'search' ? 'Challenge a Friend' : 'Configure Match'}
                          </h2>
                          <button onClick={() => setShowChallengeModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                      </div>

                      <div className="p-6 overflow-y-auto custom-scrollbar relative min-h-[400px]">
                          <AnimatePresence mode="wait" initial={false}>
                              {challengeStep === 'search' ? (
                                  <motion.div
                                      key="search"
                                      initial={{ x: -50, opacity: 0 }}
                                      animate={{ x: 0, opacity: 1 }}
                                      exit={{ x: -50, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="space-y-4 absolute inset-0 p-6"
                                  >
                                      <div className="relative">
                                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                          <input 
                                              type="text" 
                                              placeholder="Search by username..."
                                              value={searchQuery}
                                              onChange={(e) => setSearchQuery(e.target.value)}
                                              className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:border-gold-500 transition-colors"
                                              autoFocus
                                          />
                                      </div>
                                      
                                      <div className="space-y-2">
                                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suggested Friends</p>
                                          {filteredFriends.map((friend, idx) => (
                                              <motion.button
                                                  key={idx}
                                                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
                                                  onClick={() => { setSelectedFriend(friend); setChallengeStep('config'); playSFX('click'); }}
                                                  className="w-full p-3 rounded-xl border border-white/5 flex items-center justify-between group transition-all"
                                              >
                                                  <div className="flex items-center gap-3">
                                                      <img src={friend.avatar} alt={friend.name} className="w-10 h-10 rounded-full" />
                                                      <div className="text-left">
                                                          <div className="font-bold text-white">{friend.name}</div>
                                                          <div className="text-xs text-slate-400">{friend.rankTier}</div>
                                                      </div>
                                                  </div>
                                                  <div className="p-2 bg-royal-800 rounded-lg text-gold-400 opacity-0 group-hover:opacity-100"><Swords size={16} /></div>
                                              </motion.button>
                                          ))}
                                      </div>
                                  </motion.div>
                              ) : (
                                  <motion.div
                                      key="config"
                                      initial={{ x: 50, opacity: 0 }}
                                      animate={{ x: 0, opacity: 1 }}
                                      exit={{ x: 50, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="space-y-6 absolute inset-0 p-6"
                                  >
                                      <div className="flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5">
                                          <div className="flex flex-col items-center">
                                              <img src={user.avatar} className="w-12 h-12 rounded-full border-2 border-gold-500" />
                                              <span className="text-xs font-bold text-white mt-1">You</span>
                                          </div>
                                          <div className="text-2xl font-black text-slate-600 italic">VS</div>
                                          <div className="flex flex-col items-center">
                                              <img src={selectedFriend?.avatar} className="w-12 h-12 rounded-full border-2 border-red-500" />
                                              <span className="text-xs font-bold text-white mt-1">{selectedFriend?.name}</span>
                                          </div>
                                      </div>

                                      <div>
                                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Game</label>
                                          <div className="grid grid-cols-4 gap-2">
                                              {AVAILABLE_GAMES.map(g => (
                                                  <button 
                                                      key={g.id}
                                                      onClick={() => { setChallengeGame(g.id); playSFX('click'); }}
                                                      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all ${
                                                          challengeGame === g.id ? 'bg-royal-800 border-gold-500 text-white' : 'border-white/10 text-slate-500 hover:bg-white/5'
                                                      }`}
                                                  >
                                                      <g.icon size={20} className={challengeGame === g.id ? 'text-gold-400' : ''} />
                                                  </button>
                                              ))}
                                          </div>
                                      </div>

                                      <div>
                                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Stake (FCFA)</label>
                                          <input 
                                              type="number" 
                                              value={challengeStake}
                                              onChange={(e) => setChallengeStake(Number(e.target.value))}
                                              className="w-full bg-royal-950 border border-white/10 rounded-xl py-3 pl-4 text-white font-mono font-bold text-lg focus:border-gold-500"
                                          />
                                          <div className="flex gap-2 mt-2">
                                              {[500, 1000, 5000].map(amt => (
                                                  <button key={amt} onClick={() => { setChallengeStake(amt); playSFX('click'); }} className="px-2 py-1 bg-white/5 rounded text-xs text-slate-400 hover:text-white">{amt}</button>
                                              ))}
                                          </div>
                                      </div>

                                      <div className="flex gap-3 pt-2">
                                          <button onClick={() => { setChallengeStep('search'); playSFX('click'); }} className="p-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400"><ArrowLeft size={20} /></button>
                                          <button onClick={handleSendChallenge} className="flex-1 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2">
                                              <Swords size={20} /> SEND CHALLENGE
                                          </button>
                                      </div>
                                  </motion.div>
                              )}
                          </AnimatePresence>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* --- HEADER --- */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">
                {viewState === 'games' ? 'Game Selection' : activeGameData?.name || 'Select Stake'}
            </h1>
            <p className="text-slate-400">
                {viewState === 'games' ? 'Choose your arena and prove your skill.' : 'Select your entry stake level.'}
            </p>
        </div>
        <button 
            onClick={() => { setChallengeStep('search'); setShowChallengeModal(true); playSFX('click'); }}
            className="flex items-center gap-2 px-5 py-3 bg-gold-500/10 border border-gold-500/30 hover:bg-gold-500/20 text-gold-400 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(251,191,36,0.1)] hover:shadow-[0_0_25px_rgba(251,191,36,0.2)]"
        >
            <Swords size={18} /> Challenge Friend
        </button>
      </div>

      {/* --- MAIN CONTENT (2-STEP FLOW) --- */}
      <AnimatePresence mode="wait" custom={viewState === 'stakes' ? 1 : -1}>
          
          {/* STEP 1: GAME SELECTION */}
          {viewState === 'games' && (
              <motion.div
                  key="games"
                  custom={-1}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
              >
                  {AVAILABLE_GAMES.map((game, idx) => (
                      <motion.div
                          key={game.id}
                          layoutId={`game-card-${game.id}`}
                          onClick={() => handleGameSelect(game.id)}
                          whileHover={{ y: -8, scale: 1.02 }}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className={`glass-panel p-6 rounded-3xl border cursor-pointer group relative overflow-hidden transition-all duration-300 ${game.bg} ${game.border}`}
                      >
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-royal-950 border border-white/10 group-hover:scale-110 transition-transform ${game.color}`}>
                              <game.icon size={32} />
                          </div>
                          
                          <h3 className="text-xl font-bold text-white mb-2 group-hover:translate-x-1 transition-transform">{game.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
                              <Users size={14} /> {game.players} Active
                          </div>

                          <button className={`w-full py-3 rounded-xl bg-royal-950/50 border border-white/10 text-sm font-bold uppercase tracking-wider transition-colors group-hover:bg-white/10 ${game.color}`}>
                              Select Table
                          </button>
                      </motion.div>
                  ))}
              </motion.div>
          )}

          {/* STEP 2: STAKE SELECTION */}
          {viewState === 'stakes' && activeGameData && (
              <motion.div
                  key="stakes"
                  custom={1}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
              >
                  {/* Back Button & Selected Game Indicator */}
                  <div className="flex items-center gap-4 mb-8">
                      <button 
                          onClick={handleBackToGames}
                          className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                      >
                          <ArrowLeft size={20} />
                      </button>
                      <motion.div 
                          layoutId={`game-card-${activeGameData.id}`} 
                          className={`flex items-center gap-3 px-4 py-2 rounded-xl border bg-royal-900/50 ${activeGameData.border}`}
                      >
                          <activeGameData.icon size={20} className={activeGameData.color} />
                          <span className="font-bold text-white">{activeGameData.name}</span>
                      </motion.div>
                  </div>

                  {/* Tiers Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {GAME_TIERS.map((tier, idx) => {
                          const isPopular = tier.stake === 500;
                          return (
                            <motion.div
                                key={tier.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                whileHover={{ y: -8, scale: 1.02 }}
                                onClick={() => handleTierSelect(tier)}
                                className={`glass-panel p-6 rounded-3xl border cursor-pointer group relative overflow-visible transition-all duration-300 ${
                                    isPopular ? 'border-gold-500/50 bg-royal-800/80 shadow-[0_0_30px_rgba(251,191,36,0.1)] ring-1 ring-gold-500/20' : 'border-white/10 hover:border-gold-500/30'
                                }`}
                            >
                                {isPopular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-max z-20">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-gold-400 blur-sm rounded-full opacity-50 animate-pulse"></div>
                                            <div className="relative bg-gradient-to-r from-gold-400 to-gold-600 text-royal-950 text-[10px] font-black px-4 py-1 rounded-full shadow-lg flex items-center gap-1">
                                                <Star size={10} fill="currentColor" /> POPULAR
                                            </div>
                                        </div>
                                    </div>
                                )}

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
              </motion.div>
          )}

      </AnimatePresence>

      <div className="mt-8 p-4 bg-royal-900/30 border border-white/5 rounded-2xl flex items-center justify-center gap-2 text-sm text-slate-400">
          <Lock size={14} /> Stakes are held in secure Escrow until game completion.
      </div>
    </div>
  );
};
