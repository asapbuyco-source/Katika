
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Calendar, Users, ChevronRight, Lock, Play, Crown, Info, RefreshCw, AlertTriangle, Clock, CheckCircle2, X, Wallet, Shield, Star, Coins, TrendingUp } from 'lucide-react';
import { User, Tournament, TournamentMatch } from '../types';
import { getTournaments, registerForTournament, checkTournamentTimeouts, subscribeToUser, subscribeToTournament, subscribeToTournamentMatches } from '../services/firebase';
import { playSFX } from '../services/sound';

interface TournamentsProps {
  user: User;
  onJoinMatch: (gameType: string, tournamentMatchId: string) => void;
}

export const Tournaments: React.FC<TournamentsProps> = ({ user, onJoinMatch }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'detail'>('list');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'bracket' | 'rules'>('bracket');
  const [championProfile, setChampionProfile] = useState<User | null>(null);

  // Registration Modal State
  const [showRegModal, setShowRegModal] = useState(false);
  const [regTarget, setRegTarget] = useState<Tournament | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Real-time Status Subscription
  useEffect(() => {
      let unsubTournament: (() => void) | undefined;
      let unsubMatches: (() => void) | undefined;
      
      if (selectedTournament) {
          // Listen to Tournament Updates
          unsubTournament = subscribeToTournament(selectedTournament.id, (updatedT) => {
              setSelectedTournament(updatedT);
          });

          // Listen to Match Updates (Bracket)
          setLoading(true);
          unsubMatches = subscribeToTournamentMatches(selectedTournament.id, (updatedMatches) => {
              setMatches(updatedMatches);
              setLoading(false);
          });
      }
      return () => { 
          if(unsubTournament) unsubTournament();
          if(unsubMatches) unsubMatches();
      };
  }, [selectedTournament?.id]);

  // Time Elimination Loop
  useEffect(() => {
      let interval: any;
      if (selectedTournament && selectedTournament.status === 'active') {
          interval = setInterval(() => {
              checkTournamentTimeouts(selectedTournament.id);
          }, 15000); 
      }
      return () => clearInterval(interval);
  }, [selectedTournament?.status, selectedTournament?.id]);

  // Fetch Champion Logic
  useEffect(() => {
      if (selectedTournament?.status === 'completed' && selectedTournament.winnerId) {
          const unsub = subscribeToUser(selectedTournament.winnerId, (u) => setChampionProfile(u));
          return () => unsub();
      } else {
          setChampionProfile(null);
      }
  }, [selectedTournament?.status, selectedTournament?.winnerId]);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    setLoading(true);
    const data = await getTournaments();
    setTournaments(data);
    setLoading(false);
  };

  const handleSelectTournament = async (t: Tournament) => {
    setSelectedTournament(t);
    // Loading handled by useEffect subscription now
    setActiveTab('detail');
  };

  const initiateRegistration = (t: Tournament) => {
      if (user.balance < t.entryFee) {
          alert("Insufficient funds. Please deposit to your wallet first.");
          return;
      }
      setRegTarget(t);
      setShowRegModal(true);
      playSFX('click');
  };

  const confirmRegistration = async () => {
    if (!regTarget) return;
    
    setIsRegistering(true);
    const success = await registerForTournament(regTarget.id, user);
    setIsRegistering(false);

    if (success) {
      playSFX('win'); 
      setShowRegModal(false);
      fetchTournaments(); 
      
      if (selectedTournament?.id === regTarget.id) {
          const updatedT = { ...regTarget, participants: [...regTarget.participants, user.id] };
          if (regTarget.type !== 'fixed') {
              updatedT.prizePool = (updatedT.prizePool || 0) + (regTarget.entryFee * 0.9);
          }
          setSelectedTournament(updatedT);
      }
      setRegTarget(null);
    } else {
      playSFX('error');
      alert("Registration failed. The tournament might be full or an error occurred.");
    }
  };

  const getMyNextMatch = () => {
    if (!matches || !user) return null;
    return matches.find(m => 
      m.status !== 'completed' && 
      (m.player1?.id === user.id || m.player2?.id === user.id)
    );
  };

  const myNextMatch = getMyNextMatch();

  const getBracketRounds = () => {
      const rounds: Record<number, TournamentMatch[]> = {};
      matches.forEach(m => {
          if (!rounds[m.round]) rounds[m.round] = [];
          rounds[m.round].push(m);
      });
      Object.keys(rounds).forEach(k => {
          rounds[Number(k)].sort((a, b) => a.matchIndex - b.matchIndex);
      });
      return rounds;
  };

  const bracketData = getBracketRounds();

  const MatchTimer = ({ startTime }: { startTime: string }) => {
      const [timeLeft, setTimeLeft] = useState("");
      
      useEffect(() => {
          const timer = setInterval(() => {
              const start = new Date(startTime).getTime();
              const now = Date.now();
              const diff = start - now;
              
              if (diff <= 0) {
                  if (now - start > 3 * 60 * 1000) {
                      setTimeLeft("AWAITING FORFEIT");
                  } else {
                      setTimeLeft("LIVE - JOIN NOW");
                  }
              } else {
                  const m = Math.floor(diff / 60000);
                  const s = Math.floor((diff % 60000) / 1000);
                  setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
              }
          }, 1000);
          return () => clearInterval(timer);
      }, [startTime]);

      return <span className="font-mono font-bold text-gold-400">{timeLeft}</span>;
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto min-h-screen pb-24 md:pb-6 relative overflow-hidden">
      
      {/* REGISTRATION MODAL */}
      <AnimatePresence>
          {showRegModal && regTarget && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => setShowRegModal(false)}
                      className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                      initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                      className="relative bg-royal-900 border border-gold-500 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]"
                  >
                      <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
                          <h2 className="text-xl font-bold text-white flex items-center gap-2">
                              <Trophy size={20} className="text-gold-400"/> Registration
                          </h2>
                          <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                      </div>

                      <div className="overflow-y-auto space-y-6 custom-scrollbar pr-2 mb-6">
                          <div className="text-center">
                              <h3 className="text-lg font-bold text-white">{regTarget.name}</h3>
                              <div className="text-gold-400 text-2xl font-mono font-bold my-2">{regTarget.entryFee.toLocaleString()} FCFA</div>
                              <p className="text-xs text-slate-400">Entry Fee</p>
                          </div>

                          <div className="bg-black/40 rounded-xl p-4 border border-white/10">
                              <h4 className="text-slate-300 font-bold uppercase text-xs tracking-wider mb-3 flex items-center gap-2">
                                  <Info size={12} /> Fee Breakdown
                              </h4>
                              {regTarget.type === 'fixed' ? (
                                  <div className="text-sm text-slate-400 leading-relaxed">
                                      This is a <strong className="text-white">Fixed Prize</strong> tournament. 
                                      The prize pool is guaranteed by the house regardless of player count.
                                      <div className="mt-2 text-green-400 font-bold">Guaranteed Prize: {regTarget.prizePool.toLocaleString()} FCFA</div>
                                  </div>
                              ) : (
                                  <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                          <span className="text-slate-400">Entry Fee</span>
                                          <span className="text-white font-mono">{regTarget.entryFee.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between text-red-400">
                                          <span>Platform Fee (10%)</span>
                                          <span className="font-mono">-{Math.floor(regTarget.entryFee * 0.1).toLocaleString()}</span>
                                      </div>
                                      <div className="border-t border-white/10 my-1"></div>
                                      <div className="flex justify-between text-green-400 font-bold">
                                          <span>Added to Pot</span>
                                          <span className="font-mono">+{Math.floor(regTarget.entryFee * 0.9).toLocaleString()}</span>
                                      </div>
                                      <p className="text-[10px] text-slate-500 mt-2 italic">
                                          Prize pool grows with every participant.
                                      </p>
                                  </div>
                              )}
                          </div>

                          <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-3 text-sm">
                              <div className="flex gap-3">
                                  <Clock className="text-blue-400 shrink-0" size={16} />
                                  <p className="text-slate-400 leading-snug">
                                      Start Time: <span className="text-white font-bold">{new Date(regTarget.startTime).toLocaleString()}</span>. 
                                      <br/>Be online 5 minutes early.
                                  </p>
                              </div>
                              <div className="flex gap-3">
                                  <AlertTriangle className="text-red-400 shrink-0" size={16} />
                                  <p className="text-slate-400 leading-snug">
                                      <span className="text-white font-bold">Auto-Forfeit:</span> Missing the start window results in disqualification without refund.
                                  </p>
                              </div>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <button 
                              onClick={confirmRegistration} 
                              disabled={isRegistering}
                              className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                              {isRegistering ? "Processing..." : `PAY & JOIN`}
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* List View */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
                <Trophy className="text-gold-400" size={32} /> Tournaments
              </h1>
              <p className="text-slate-400 text-sm">Compete for the cup. Winner takes all.</p>
            </div>
            <button onClick={fetchTournaments} className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white">
                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t) => {
              const isRegistered = t.participants.includes(user.id);
              const isFull = t.participants.length >= t.maxPlayers;
              const isFixed = t.type === 'fixed';
              
              // Calculate pool if dynamic
              const currentPool = isFixed 
                  ? t.prizePool 
                  : (t.prizePool || 0) + (t.entryFee * t.participants.length * 0.9);

              return (
                <motion.div 
                  key={t.id}
                  whileHover={{ y: -5 }}
                  onClick={() => handleSelectTournament(t)}
                  className="bg-royal-900 border border-white/10 rounded-2xl p-6 relative overflow-hidden group cursor-pointer hover:border-gold-500/50 transition-all"
                >
                  <div className={`absolute top-0 right-0 p-12 bg-gold-500/5 rounded-full blur-3xl transition-opacity ${isRegistered ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}></div>
                  
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-gold-400">
                      <Trophy size={24} />
                    </div>
                    <div className="flex gap-2">
                        {isFixed ? (
                            <div className="px-2 py-1 bg-purple-500/20 text-purple-300 text-[10px] font-bold rounded-full border border-purple-500/30 flex items-center gap-1">
                                <Crown size={10} /> Fixed
                            </div>
                        ) : (
                            <div className="px-2 py-1 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-full border border-blue-500/30 flex items-center gap-1">
                                <TrendingUp size={10} /> Dynamic
                            </div>
                        )}
                        {isRegistered && (
                          <div className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-full border border-green-500/30 flex items-center gap-1">
                            <CheckCircle2 size={10} /> Joined
                          </div>
                        )}
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-1 relative z-10">{t.name}</h3>
                  <div className="flex items-center gap-2 mb-6">
                      <span className="text-[10px] px-2 py-0.5 bg-white/10 rounded text-slate-300 font-mono">{t.participants.length}/{t.maxPlayers} Players</span>
                      <span className="text-slate-500 text-[10px]">|</span>
                      <span className="text-slate-400 text-[10px] font-mono">{new Date(t.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>

                  <div className="space-y-3 relative z-10 bg-black/20 p-3 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 flex items-center gap-1"><Coins size={12}/> {isFixed ? 'Guaranteed Prize' : 'Current Pool'}</span>
                      <span className="font-bold text-gold-400 text-lg">{currentPool.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Entry Fee</span>
                      <span className="font-bold text-white">{t.entryFee.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="mt-4 relative z-10">
                    {t.status === 'registration' && !isRegistered && !isFull && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); initiateRegistration(t); }}
                        className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-royal-950 font-bold rounded-xl transition-colors shadow-lg shadow-gold-500/20"
                      >
                        Join Tournament
                      </button>
                    )}
                    {t.status === 'registration' && isRegistered && (
                        <div className="w-full py-3 bg-white/5 text-slate-300 font-bold rounded-xl text-center border border-white/10">
                            Waiting for Start
                        </div>
                    )}
                    {t.status === 'active' && (
                        <button className="w-full py-3 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition-colors animate-pulse">
                            View Live Bracket
                        </button>
                    )}
                    {t.status === 'completed' && (
                        <div className="w-full py-3 bg-gold-500/20 text-gold-400 font-bold rounded-xl text-center border border-gold-500/30 flex items-center justify-center gap-2">
                            <Crown size={16} /> Winner Declared
                        </div>
                    )}
                    {isFull && !isRegistered && t.status === 'registration' && (
                        <div className="w-full py-3 bg-red-500/10 text-red-400 font-bold rounded-xl text-center border border-red-500/20">
                            Full
                        </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail View */}
      {activeTab === 'detail' && selectedTournament && (
        <div className="h-full flex flex-col">
          <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setActiveTab('list')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
              >
                <ChevronRight size={20} className="rotate-180" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    {selectedTournament.name}
                    {selectedTournament.type === 'fixed' && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 uppercase">Fixed Pool</span>}
                </h1>
                <div className="flex items-center gap-2 text-slate-400 text-xs mt-1">
                   <Clock size={12} /> Starts {new Date(selectedTournament.startTime).toLocaleString()}
                </div>
              </div>
            </div>
            
            {/* Join Action in Detail View */}
            {selectedTournament.status === 'registration' && !selectedTournament.participants.includes(user.id) && selectedTournament.participants.length < selectedTournament.maxPlayers && (
                <button 
                    onClick={() => initiateRegistration(selectedTournament)}
                    className="px-6 py-3 bg-gold-500 hover:bg-gold-400 text-royal-950 font-bold rounded-xl shadow-lg"
                >
                    Join Now
                </button>
            )}
          </header>

          {/* --- COMPLETED TOURNAMENT CHAMPION DISPLAY --- */}
          {selectedTournament.status === 'completed' && championProfile && (
              <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 p-8 rounded-3xl bg-gradient-to-br from-gold-500/20 to-royal-900 border border-gold-500/50 relative overflow-hidden flex flex-col items-center text-center shadow-[0_0_50px_rgba(251,191,36,0.2)]"
              >
                  {/* Background FX */}
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                  <div className="absolute top-0 right-0 p-20 bg-gold-500/10 blur-[100px] rounded-full"></div>

                  <div className="relative z-10 flex flex-col items-center">
                      <div className="mb-4 relative">
                          <div className="absolute inset-0 bg-gold-500 blur-xl opacity-50 rounded-full"></div>
                          <img src={championProfile.avatar} alt={championProfile.name} className="w-32 h-32 rounded-full border-4 border-gold-400 shadow-2xl relative z-10 object-cover" />
                          <div className="absolute -top-6 -right-6 text-gold-400 animate-bounce">
                              <Crown size={48} fill="currentColor" />
                          </div>
                      </div>
                      
                      <h2 className="text-gold-400 font-bold text-sm uppercase tracking-[0.2em] mb-2">Tournament Champion</h2>
                      <h1 className="text-4xl md:text-6xl font-display font-black text-white mb-4 drop-shadow-md">
                          {championProfile.name}
                      </h1>
                      
                      <div className="flex items-center gap-2 bg-black/40 px-6 py-3 rounded-full border border-gold-500/30">
                          <Trophy size={20} className="text-gold-400" />
                          <span className="text-slate-300 text-sm">Prize Won:</span>
                          <span className="text-xl font-mono font-bold text-white">
                              {(selectedTournament.type === 'fixed' 
                                  ? selectedTournament.prizePool 
                                  : (selectedTournament.prizePool || 0) + (selectedTournament.entryFee * selectedTournament.participants.length * 0.9)
                              ).toLocaleString()} FCFA
                          </span>
                      </div>
                  </div>
              </motion.div>
          )}

          {/* --- DASHBOARD FOR ACTIVE TOURNAMENTS --- */}
          {selectedTournament.status === 'active' && (
              <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* My Next Match Card */}
                  <div className="glass-panel p-6 rounded-2xl border border-gold-500/30 bg-gradient-to-br from-royal-900 to-black relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={80}/></div>
                      <h3 className="text-gold-400 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Shield size={16} /> Your Status
                      </h3>
                      {myNextMatch ? (
                          myNextMatch.winnerId ? (
                              <div className="text-center py-4">
                                  <div className="text-green-400 text-xl font-black mb-2 flex items-center justify-center gap-2"><CheckCircle2/> ADVANCED</div>
                                  <p className="text-slate-400 text-sm">You won this round! Waiting for next opponent.</p>
                              </div>
                          ) : (
                              <div>
                                  <div className="flex justify-between items-end mb-4">
                                      <div>
                                          <div className="text-xs text-slate-500 font-bold mb-1">VS</div>
                                          <div className="text-lg font-bold text-white">{myNextMatch.player1?.id === user.id ? myNextMatch.player2?.name || "BYE (Auto Win)" : myNextMatch.player1?.name}</div>
                                      </div>
                                      <div className="text-right">
                                          <div className="text-xs text-slate-500 font-bold mb-1">STARTS IN</div>
                                          <MatchTimer startTime={myNextMatch.startTime} />
                                      </div>
                                  </div>
                                  {myNextMatch.player2 ? (
                                      <button 
                                          onClick={() => onJoinMatch(selectedTournament.gameType, myNextMatch.id)}
                                          className="w-full py-3 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl shadow-lg animate-pulse"
                                      >
                                          ENTER MATCH LOBBY
                                      </button>
                                  ) : (
                                      <div className="w-full py-3 bg-white/5 border border-white/10 text-slate-300 font-bold rounded-xl text-center">
                                          Automatic Bye (Wait for Next Round)
                                      </div>
                                  )}
                              </div>
                          )
                      ) : (
                          <div className="text-center py-4 text-slate-500">
                              <p>No active match. You may be waiting for the next round or have been eliminated.</p>
                          </div>
                      )}
                  </div>

                  {/* Winners Feed */}
                  <div className="glass-panel p-6 rounded-2xl border border-white/5">
                      <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Crown size={16} className="text-yellow-400" /> Recent Winners
                      </h3>
                      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {matches.filter(m => m.winnerId).slice(0, 5).map(m => {
                              const winner = m.winnerId === m.player1?.id ? m.player1 : m.player2;
                              return (
                                  <div key={m.id} className="flex flex-col items-center gap-2 min-w-[80px]">
                                      <div className="w-10 h-10 rounded-full border-2 border-yellow-400 p-0.5">
                                          <img src={winner?.avatar || "https://i.pravatar.cc/150"} className="w-full h-full rounded-full object-cover"/>
                                      </div>
                                      <span className="text-[10px] font-bold text-white truncate max-w-full">{winner?.name}</span>
                                  </div>
                              )
                          })}
                          {matches.filter(m => m.winnerId).length === 0 && (
                              <div className="text-xs text-slate-500 italic">No matches completed yet.</div>
                          )}
                      </div>
                  </div>
              </div>
          )}

          <div className="flex gap-4 mb-6 border-b border-white/10">
              <button 
                onClick={() => setViewMode('bracket')}
                className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${viewMode === 'bracket' ? 'text-gold-400 border-gold-400' : 'text-slate-500 border-transparent hover:text-white'}`}
              >
                  Tournament Bracket
              </button>
              <button 
                onClick={() => setViewMode('rules')}
                className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${viewMode === 'rules' ? 'text-gold-400 border-gold-400' : 'text-slate-500 border-transparent hover:text-white'}`}
              >
                  Rules
              </button>
          </div>

          {viewMode === 'rules' && (
              <div className="glass-panel p-6 rounded-2xl border border-white/10 max-w-2xl">
                  <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                      <Info size={18} className="text-blue-400" /> Tournament Rules: <span className="text-gold-400">{selectedTournament.name}</span>
                  </h3>
                  <ul className="space-y-6 text-slate-300 text-sm">
                      <li className="flex flex-col md:flex-row gap-2 md:gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                          <div className="font-bold text-white min-w-[140px] flex items-center gap-2">
                              <Calendar size={16} className="text-gold-400" /> Match Schedule
                          </div>
                          <div>
                              Matches begin strictly at <span className="text-white font-bold">{new Date(selectedTournament.startTime).toLocaleString() || "TBD"}</span>. 
                              Please be online 5 minutes before.
                          </div>
                      </li>
                      
                      <li className="flex flex-col md:flex-row gap-2 md:gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                          <div className="font-bold text-white min-w-[140px] flex items-center gap-2">
                              <AlertTriangle size={16} className="text-red-400" /> Auto-Forfeit
                          </div>
                          <div>
                              Players have a <span className="text-red-400 font-bold">5-minute grace period</span> to join the lobby. 
                              If you do not click "Start Match" within 5 minutes of the start time, you will automatically forfeit.
                          </div>
                      </li>

                      <li className="flex flex-col md:flex-row gap-2 md:gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                          <div className="font-bold text-white min-w-[140px] flex items-center gap-2">
                              <Lock size={16} className="text-green-400" /> Entry Fee
                          </div>
                          <div>
                              A non-refundable entry fee of <span className="text-white font-bold">{selectedTournament.entryFee.toLocaleString()} FCFA</span> is deducted upon registration.
                          </div>
                      </li>

                      <li className="flex flex-col md:flex-row gap-2 md:gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                          <div className="font-bold text-white min-w-[140px] flex items-center gap-2">
                              <Trophy size={16} className="text-yellow-400" /> Payouts
                          </div>
                          <div>
                              The winner of the Grand Final receives the total Prize Pool (after 10% fee if applicable) instantly to their Vantage Wallet.
                          </div>
                      </li>
                  </ul>
              </div>
          )}

          {viewMode === 'bracket' && (
              <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-black/20 rounded-2xl border border-white/5 p-8 relative min-h-[500px]">
                  {loading && matches.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                          <RefreshCw className="animate-spin text-gold-400" size={32} />
                      </div>
                  ) : matches.length === 0 ? (
                      <div className="text-center text-slate-500 mt-20">Bracket will be generated when tournament starts.</div>
                  ) : (
                      <div className="flex gap-16 min-w-max h-full items-center">
                          {Object.keys(bracketData).sort((a,b) => Number(a)-Number(b)).map((roundNum, rIdx) => (
                              <div key={roundNum} className="flex flex-col justify-around h-full gap-8">
                                  <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
                                      {Number(roundNum) === Object.keys(bracketData).length ? "Finals" : `Round ${roundNum}`}
                                  </div>
                                  {bracketData[Number(roundNum)].map((match, mIdx) => (
                                      <div key={match.id} className="relative flex items-center">
                                          {/* Match Card */}
                                          <div className={`
                                              w-56 bg-royal-900 border rounded-xl overflow-hidden relative z-10 flex flex-col
                                              ${match.status === 'active' ? 'border-gold-500 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'border-white/10'}
                                          `}>
                                              {/* Player 1 */}
                                              <div className={`p-3 border-b border-white/5 flex items-center justify-between ${match.winnerId === match.player1?.id ? 'bg-green-500/10' : ''}`}>
                                                  <div className="flex items-center gap-2">
                                                      <div className="w-6 h-6 rounded-full bg-slate-800 overflow-hidden">
                                                          {match.player1 ? <img src={match.player1.avatar} className="w-full h-full object-cover"/> : null}
                                                      </div>
                                                      <span className={`text-xs font-bold ${match.winnerId === match.player1?.id ? 'text-green-400' : 'text-slate-300'}`}>
                                                          {match.player1?.name || (match.player2 ? "TBD" : "Bye")}
                                                      </span>
                                                  </div>
                                                  {match.winnerId === match.player1?.id && <Crown size={12} className="text-gold-400" fill="currentColor" />}
                                              </div>
                                              
                                              {/* Player 2 */}
                                              <div className={`p-3 flex items-center justify-between ${match.winnerId === match.player2?.id ? 'bg-green-500/10' : ''}`}>
                                                  <div className="flex items-center gap-2">
                                                      <div className="w-6 h-6 rounded-full bg-slate-800 overflow-hidden">
                                                          {match.player2 ? <img src={match.player2.avatar} className="w-full h-full object-cover"/> : null}
                                                      </div>
                                                      <span className={`text-xs font-bold ${match.winnerId === match.player2?.id ? 'text-green-400' : 'text-slate-300'}`}>
                                                          {match.player2?.name || (match.player1 ? "TBD" : "Bye")}
                                                      </span>
                                                  </div>
                                                  {match.winnerId === match.player2?.id && <Crown size={12} className="text-gold-400" fill="currentColor" />}
                                              </div>

                                              {/* Status Overlay */}
                                              {match.status === 'active' && (
                                                  <div className="absolute top-1 right-1">
                                                      <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                      </span>
                                                  </div>
                                              )}
                                          </div>

                                          {/* Connector Lines (Horizontal) */}
                                          {rIdx < Object.keys(bracketData).length - 1 && (
                                              <div className="absolute left-full top-1/2 w-8 h-px bg-white/10"></div>
                                          )}
                                          {/* Connector Lines (Vertical - Simplified for now) */}
                                      </div>
                                  ))}
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          )}
        </div>
      )}
    </div>
  );
};
