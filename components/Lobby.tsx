import React, { useState, useEffect, useRef } from 'react';
import { Users, Lock, ChevronRight, Brain, Dice5, Wallet, Target, X, Star, Swords, Search, ArrowLeft, AlertTriangle, Loader2, Bot, Layers } from 'lucide-react';
import { GameTier, PlayerProfile } from '../types';
import { GAME_TIERS } from '../services/mockData';
import { initiateFapshiPayment } from '../services/fapshi';
import { playSFX } from '../services/sound';
import { searchUsers, sendChallenge, subscribeToChallengeStatus, subscribeToGameMaintenance } from '../services/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../services/i18n';
import { useUser, useSocket } from '../services/context';

interface LobbyProps {
  onBotMatch?: (gameType: string) => void;
}

const AVAILABLE_GAMES = [
    { id: 'Dice', name: 'Dice Duel', players: 1240, icon: Dice5, color: 'text-gold-400', bg: 'bg-gold-500/10', border: 'border-gold-500/20' },
    { id: 'TicTacToe', name: 'XO Clash', players: 2100, icon: X, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { id: 'Cards', name: 'Kmer Card', players: 1850, icon: Layers, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
    { id: 'Checkers', name: 'Checkers Pro', players: 156, icon: Target, color: 'text-cam-red', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    { id: 'Chess', name: 'Master Chess', players: 85, icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
];

export const Lobby: React.FC<LobbyProps> = ({ onBotMatch }) => {
  const { user } = useUser();
  const { joinGame } = useSocket();
  const { t } = useLanguage();
  
  const [viewState, setViewState] = useState<'games' | 'stakes'>('games');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [gameMaintenance, setGameMaintenance] = useState<Record<string, boolean>>({});
  
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [neededAmount, setNeededAmount] = useState(0);

  // Challenge Mode
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeStep, setChallengeStep] = useState<'search' | 'config' | 'sending'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<PlayerProfile | null>(null);
  const [challengeStake, setChallengeStake] = useState<number>(1000);
  const [challengeGame, setChallengeGame] = useState('Dice');
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const challengeUnsubscribeRef = useRef<(() => void) | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  useEffect(() => {
      const maintenance = localStorage.getItem('vantage_maintenance') === 'true';
      setIsMaintenance(maintenance);
      const unsubscribe = subscribeToGameMaintenance((status) => setGameMaintenance(status));
      return () => unsubscribe();
  }, []);

  // Cleanup challenge listener
  useEffect(() => {
      return () => { if (challengeUnsubscribeRef.current) challengeUnsubscribeRef.current(); };
  }, []);

  // Real-time Search
  useEffect(() => {
      const delayDebounceFn = setTimeout(async () => {
          if (searchQuery.length >= 3 && user) {
              setIsSearching(true);
              try {
                  const results = await searchUsers(searchQuery);
                  setSearchResults(results.filter(r => r.id !== user.id));
              } catch (error) { console.error(error); }
              setIsSearching(false);
          } else { setSearchResults([]); }
      }, 500);
      return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, user]);

  if (!user) return null;

  const handleGameSelect = (gameId: string) => {
      if (isMaintenance) return;
      if (gameMaintenance[gameId]) {
          playSFX('error');
          alert("This game is temporarily under maintenance.");
          return;
      }
      setSelectedGame(gameId);
      setViewState('stakes');
      playSFX('click');
  };

  const handleBackToGames = () => {
      setViewState('games');
      setSelectedGame(null);
      playSFX('click');
  };

  const handleTierSelect = (tier: GameTier) => {
      playSFX('click');
      if (isMaintenance || !selectedGame) return;
      if (user.balance < tier.stake) {
          setNeededAmount(tier.stake - user.balance);
          setShowDepositModal(true);
          playSFX('error');
      } else {
          joinGame(selectedGame, tier.stake);
      }
  };

  const handleBotPlay = () => {
      playSFX('click');
      if (!selectedGame || !onBotMatch) return;
      onBotMatch(selectedGame);
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

  const handleSendChallenge = async () => {
      playSFX('click');
      if (isMaintenance || !selectedFriend || !selectedFriend.id) return;
      if (user.balance < challengeStake) {
          setNeededAmount(challengeStake - user.balance);
          setShowChallengeModal(false);
          setShowDepositModal(true);
          return;
      }
      setChallengeStep('sending');
      try {
          const challengeId = await sendChallenge(user, selectedFriend.id, challengeGame, challengeStake);
          setActiveChallengeId(challengeId);
          challengeUnsubscribeRef.current = subscribeToChallengeStatus(challengeId, (data) => {
              if (data.status === 'accepted' && data.gameId) {
                  playSFX('win');
                  setShowChallengeModal(false);
                  joinGame(challengeGame, challengeStake, data.gameId);
                  setActiveChallengeId(null);
                  if (challengeUnsubscribeRef.current) challengeUnsubscribeRef.current();
              } else if (data.status === 'declined') {
                  playSFX('error');
                  alert(`${selectedFriend.name} declined the challenge.`);
                  setChallengeStep('search');
                  setActiveChallengeId(null);
                  if (challengeUnsubscribeRef.current) challengeUnsubscribeRef.current();
              }
          });
      } catch (error) {
          console.error("Failed to send challenge", error);
          alert("Error sending challenge.");
          setChallengeStep('config');
      }
  };

  const activeGameData = AVAILABLE_GAMES.find(g => g.id === selectedGame);
  const pageVariants = { enter: { opacity: 0, x: 20 }, center: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24 md:pb-6 min-h-screen relative overflow-hidden">
      
      {/* Maintenance Overlay */}
      {isMaintenance && (
          <div className="absolute inset-0 z-50 bg-royal-950/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8">
              <div className="bg-royal-900 border border-red-500/30 p-8 rounded-3xl shadow-2xl max-w-md relative overflow-hidden">
                  <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none"></div>
                  <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} className="text-red-500" /></div>
                  <h2 className="text-3xl font-display font-bold text-white mb-3">System Maintenance</h2>
                  <p className="text-slate-400 mb-6 leading-relaxed">The Vantage Network is currently undergoing critical upgrades.</p>
              </div>
          </div>
      )}

      {/* Deposit Modal */}
      <AnimatePresence>
          {showDepositModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDepositModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                  <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-royal-900 border border-gold-500 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                      <button onClick={() => setShowDepositModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
                      <div className="text-center mb-6">
                          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><Wallet className="text-red-500" size={32} /></div>
                          <h2 className="text-xl font-bold text-white mb-2">Insufficient Funds</h2>
                          <p className="text-sm text-slate-400">You need <span className="text-gold-400 font-bold">{neededAmount.toLocaleString()} FCFA</span> more.</p>
                      </div>
                      <button onClick={handleDeposit} disabled={isProcessingPayment} className="w-full py-3 bg-yellow-400 text-black font-bold rounded-xl flex items-center justify-center gap-2 mb-3">{isProcessingPayment ? "Processing..." : "MTN Mobile Money"}</button>
                      <button onClick={handleDeposit} disabled={isProcessingPayment} className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-2">{isProcessingPayment ? "Processing..." : "Orange Money"}</button>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* Challenge Modal */}
      <AnimatePresence>
          {showChallengeModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowChallengeModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                  <motion.div layout initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-royal-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                      <div className="p-6 border-b border-white/5 bg-royal-950/50 flex justify-between items-center z-10">
                          <h2 className="text-xl font-display font-bold text-white flex items-center gap-2"><Swords className="text-gold-400" size={20} /> Challenge Friend</h2>
                          <button onClick={() => setShowChallengeModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                      </div>
                      <div className="p-6 overflow-y-auto custom-scrollbar relative min-h-[400px]">
                          {challengeStep === 'search' ? (
                              <div className="space-y-4">
                                  <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Search username..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:border-gold-500" /></div>
                                  <div className="space-y-2">
                                      {searchResults.map((friend, idx) => (
                                          <button key={idx} onClick={() => { setSelectedFriend(friend); setChallengeStep('config'); playSFX('click'); }} className="w-full p-3 rounded-xl border border-white/5 flex items-center justify-between hover:bg-white/5"><span className="text-white font-bold">{friend.name}</span><Swords size={16} className="text-gold-400" /></button>
                                      ))}
                                  </div>
                              </div>
                          ) : challengeStep === 'config' ? (
                              <div className="space-y-6">
                                  <div className="text-center text-white">Challenge <span className="font-bold text-gold-400">{selectedFriend?.name}</span></div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-500 block mb-2">Stake (FCFA)</label>
                                      <input type="number" value={challengeStake} onChange={(e) => setChallengeStake(Number(e.target.value))} className="w-full bg-royal-950 border border-white/10 rounded-xl py-3 pl-4 text-white font-bold text-lg" />
                                  </div>
                                  <button onClick={handleSendChallenge} className="w-full bg-gold-500 text-royal-950 font-bold py-4 rounded-xl">SEND CHALLENGE</button>
                              </div>
                          ) : (
                              <div className="flex flex-col items-center justify-center p-6 text-center">
                                  <Loader2 className="animate-spin text-gold-400 mb-4" size={32} />
                                  <h3 className="text-xl font-bold text-white mb-2">Sending...</h3>
                                  <button onClick={() => { if (challengeUnsubscribeRef.current) challengeUnsubscribeRef.current(); setChallengeStep('search'); setShowChallengeModal(false); }} className="text-red-400 text-xs font-bold mt-4">Cancel</button>
                              </div>
                          )}
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      <div className="mb-8 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">{viewState === 'games' ? t('game_selection') : activeGameData?.name}</h1>
            <p className="text-slate-400">{viewState === 'games' ? t('choose_arena') : t('select_entry')}</p>
        </div>
        <button onClick={() => { setChallengeStep('search'); setShowChallengeModal(true); playSFX('click'); }} className="flex items-center gap-2 px-5 py-3 bg-gold-500/10 border border-gold-500/30 text-gold-400 rounded-xl font-bold hover:bg-gold-500/20 transition-all"><Swords size={18} /> {t('challenge_friend')}</button>
      </div>

      <AnimatePresence mode="wait">
          {viewState === 'games' ? (
              <motion.div key="games" variants={pageVariants} initial="enter" animate="center" exit="exit" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {AVAILABLE_GAMES.map((game, idx) => (
                      <motion.div key={game.id} layoutId={`game-card-${game.id}`} onClick={() => handleGameSelect(game.id)} whileHover={{ y: -8, scale: 1.02 }} className={`glass-panel p-6 rounded-3xl border cursor-pointer group ${game.bg} ${game.border} ${gameMaintenance[game.id] ? 'grayscale' : ''}`}>
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-royal-950 border border-white/10 ${game.color}`}><game.icon size={32} /></div>
                          <h3 className="text-xl font-bold text-white mb-2">{game.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-slate-400 mb-6"><Users size={14} /> {game.players} Active</div>
                      </motion.div>
                  ))}
              </motion.div>
          ) : (
              <motion.div key="stakes" variants={pageVariants} initial="enter" animate="center" exit="exit" className="space-y-6">
                  <div className="flex items-center justify-between mb-8">
                      <button onClick={handleBackToGames} className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
                      <button onClick={handleBotPlay} className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/50 text-purple-300 rounded-xl font-bold text-xs uppercase"><Bot size={16} /> {t('practice_ai')}</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {GAME_TIERS.map((tier, idx) => (
                          <motion.div key={tier.id} onClick={() => handleTierSelect(tier)} whileHover={{ y: -8, scale: 1.02 }} className="glass-panel p-6 rounded-3xl border border-white/10 hover:border-gold-500/30 cursor-pointer">
                              <h3 className="text-sm font-bold uppercase tracking-wider mb-6 text-slate-400">{tier.name}</h3>
                              <h2 className="text-3xl font-display font-bold text-white">{tier.stake} <span className="text-sm text-gold-500">FCFA</span></h2>
                              <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center"><div className="flex items-center gap-2 text-xs text-slate-500"><Users size={14} /> {tier.playersOnline} {t('online')}</div><ChevronRight size={18} className="text-slate-500" /></div>
                          </motion.div>
                      ))}
                  </div>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
};