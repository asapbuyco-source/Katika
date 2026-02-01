
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Calendar, Users, ChevronRight, Lock, Play, Crown, Info, RefreshCw, AlertTriangle, Clock, CheckCircle2, X, Wallet } from 'lucide-react';
import { User, Tournament, TournamentMatch } from '../types';
import { getTournaments, registerForTournament, getTournamentMatches } from '../services/firebase';
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

  // Registration Modal State
  const [showRegModal, setShowRegModal] = useState(false);
  const [regTarget, setRegTarget] = useState<Tournament | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

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
    setLoading(true);
    const ms = await getTournamentMatches(t.id);
    setMatches(ms);
    setActiveTab('detail');
    setLoading(false);
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
      fetchTournaments(); // Refresh list to show updated participant count
      
      // If we are currently viewing the tournament we just joined, update it locally
      if (selectedTournament?.id === regTarget.id) {
          setSelectedTournament({ ...regTarget, participants: [...regTarget.participants, user.id] });
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

  // Helper to structure bracket data
  const getBracketRounds = () => {
      const rounds: Record<number, TournamentMatch[]> = {};
      matches.forEach(m => {
          if (!rounds[m.round]) rounds[m.round] = [];
          rounds[m.round].push(m);
      });
      // Sort matches within rounds by index
      Object.keys(rounds).forEach(k => {
          rounds[Number(k)].sort((a, b) => a.matchIndex - b.matchIndex);
      });
      return rounds;
  };

  const bracketData = getBracketRounds();

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
                              <p className="text-xs text-slate-400">will be deducted from your wallet immediately.</p>
                          </div>

                          <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-3 text-sm">
                              <h4 className="text-slate-300 font-bold uppercase text-xs tracking-wider mb-2">Rules & Conditions</h4>
                              
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
                                      <span className="text-white font-bold">Auto-Forfeit:</span> Missing the 5-minute start window results in disqualification without refund.
                                  </p>
                              </div>

                              <div className="flex gap-3">
                                  <Wallet className="text-green-400 shrink-0" size={16} />
                                  <p className="text-slate-400 leading-snug">
                                      Entry fees contribute to the prize pool (10% platform fee applies). Fees are non-refundable once the bracket is generated.
                                  </p>
                              </div>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <div className="flex items-center gap-3 p-3 bg-gold-500/10 border border-gold-500/20 rounded-lg">
                              <CheckCircle2 size={16} className="text-gold-400 shrink-0" />
                              <p className="text-[10px] text-gold-200">
                                  By joining, I accept the rules above and authorize the fee deduction.
                              </p>
                          </div>
                          <button 
                              onClick={confirmRegistration} 
                              disabled={isRegistering}
                              className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                              {isRegistering ? "Processing..." : `PAY ${regTarget.entryFee.toLocaleString()} FCFA & JOIN`}
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
                    {isRegistered ? (
                      <div className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full border border-green-500/30 flex items-center gap-1">
                        <Users size={12} /> Registered
                      </div>
                    ) : (
                      <div className="px-3 py-1 bg-royal-800 text-slate-400 text-xs font-bold rounded-full border border-white/10">
                        {t.participants.length}/{t.maxPlayers} Players
                      </div>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-white mb-1 relative z-10">{t.name}</h3>
                  <p className="text-slate-400 text-xs mb-6 relative z-10 font-mono">Starts: {new Date(t.startTime).toLocaleString()}</p>

                  <div className="space-y-3 relative z-10">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Prize Pool</span>
                      <span className="font-bold text-gold-400 text-lg">{(t.entryFee * t.maxPlayers * 0.9).toLocaleString()} FCFA</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Entry Fee</span>
                      <span className="font-bold text-white">{t.entryFee.toLocaleString()} FCFA</span>
                    </div>
                  </div>

                  <div className="mt-6 relative z-10">
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
                <h1 className="text-2xl font-bold text-white">{selectedTournament.name}</h1>
                <div className="flex items-center gap-2 text-slate-400 text-xs mt-1">
                   <Clock size={12} /> Starts {new Date(selectedTournament.startTime).toLocaleString()}
                </div>
              </div>
            </div>

            {/* My Match Action */}
            {selectedTournament.status === 'active' && myNextMatch && (
                <motion.button 
                    initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => onJoinMatch(selectedTournament.gameType, myNextMatch.id)}
                    className="px-6 py-3 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 flex items-center gap-2 animate-pulse"
                >
                    <Play size={20} fill="currentColor" /> ENTER MATCH
                </motion.button>
            )}
            
            {/* Join Action in Detail View (if applicable) */}
            {selectedTournament.status === 'registration' && !selectedTournament.participants.includes(user.id) && selectedTournament.participants.length < selectedTournament.maxPlayers && (
                <button 
                    onClick={() => initiateRegistration(selectedTournament)}
                    className="px-6 py-3 bg-gold-500 hover:bg-gold-400 text-royal-950 font-bold rounded-xl shadow-lg"
                >
                    Join Now
                </button>
            )}
          </header>

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
                              The winner of the Grand Final receives the total Prize Pool (after 10% fee) instantly to their Vantage Wallet.
                          </div>
                      </li>
                  </ul>
              </div>
          )}

          {viewMode === 'bracket' && (
              <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-black/20 rounded-2xl border border-white/5 p-8 relative min-h-[500px]">
                  {loading ? (
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
                                                          {match.player1?.name || "TBD"}
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
                                                          {match.player2?.name || "TBD"}
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
