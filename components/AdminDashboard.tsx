
import React, { useState, useEffect } from 'react';
import { User, BugReport, Tournament, TournamentMatch } from '../types';
import { Users, DollarSign, Activity, Shield, Search, Ban, CheckCircle, Server, RefreshCw, Lock, Bug, CheckSquare, AlertCircle, Gamepad2, Power, Trophy, Plus, Calendar, Play, Trash2, StopCircle, RefreshCcw, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllUsers, getActiveGamesCount, getSystemLogs, getGameActivityStats, getBugReports, resolveBugReport, updateGameStatus, subscribeToGameConfigs, createTournament, getTournaments, deleteTournament, updateTournamentStatus, getTournamentMatches } from '../services/firebase';

interface AdminDashboardProps {
  user: User;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'reports' | 'system' | 'games' | 'tournaments'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  // -- STATE MANAGEMENT --
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // System State
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [activeMatchesCount, setActiveMatchesCount] = useState(0); 
  const [networkTraffic, setNetworkTraffic] = useState<number[]>(Array(24).fill(0));
  const [totalSystemFunds, setTotalSystemFunds] = useState(0);
  const [bannedCount, setBannedCount] = useState(0);

  // Logs State
  const [logs, setLogs] = useState<any[]>([]);

  // Bug Reports State
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [loadingBugs, setLoadingBugs] = useState(false);

  // Game Config State
  const [gameConfigs, setGameConfigs] = useState<Record<string, string>>({});

  // Tournament Management State
  const [adminTournaments, setAdminTournaments] = useState<Tournament[]>([]);
  const [selectedTourneyId, setSelectedTourneyId] = useState<string | null>(null);
  const [tourneyMatches, setTourneyMatches] = useState<TournamentMatch[]>([]);
  const [showCreateTourney, setShowCreateTourney] = useState(false);
  
  const [newTourney, setNewTourney] = useState({
      name: '',
      gameType: 'Ludo',
      entryFee: 1000,
      maxPlayers: 16,
      startTime: ''
  });

  // Load Real Data
  useEffect(() => {
      const isMaint = localStorage.getItem('vantage_maintenance') === 'true';
      setMaintenanceMode(isMaint);
      
      const fetchData = async () => {
          setLoadingUsers(true);
          try {
              const users = await getAllUsers();
              setUsersList(users);
              const totalFunds = users.reduce((acc, u) => acc + (u.balance || 0), 0);
              setTotalSystemFunds(totalFunds);
              setBannedCount(users.filter(u => u.isBanned).length);
              setActiveMatchesCount(await getActiveGamesCount());
              setLogs(await getSystemLogs());
              setNetworkTraffic(await getGameActivityStats());
          } catch (e) {
              console.error("Admin data fetch error", e);
          }
          setLoadingUsers(false);
      };
      fetchData();

      const unsubGames = subscribeToGameConfigs(setGameConfigs);
      return () => unsubGames();
  }, []);

  // Tab Specific Fetches
  useEffect(() => {
      if (activeTab === 'reports') {
          setLoadingBugs(true);
          getBugReports().then(reports => {
              setBugReports(reports);
              setLoadingBugs(false);
          });
      }
      if (activeTab === 'tournaments') {
          fetchAdminTournaments();
      }
  }, [activeTab]);

  const fetchAdminTournaments = async () => {
      const data = await getTournaments();
      setAdminTournaments(data);
  };

  const handleSelectTournament = async (id: string) => {
      setSelectedTourneyId(id);
      const matches = await getTournamentMatches(id);
      setTourneyMatches(matches);
  };

  // -- ACTIONS --

  const addLog = (action: string, target: string, type: string) => {
      setLogs(prev => [{ id: Date.now(), action, target, time: 'Just now', type }, ...prev]);
  };

  const handleMaintenanceToggle = () => {
      const newState = !maintenanceMode;
      setMaintenanceMode(newState);
      localStorage.setItem('vantage_maintenance', String(newState));
      addLog("Maintenance Mode", newState ? "Enabled" : "Disabled", "warning");
  };

  const handleResolveBug = async (id: string) => {
      await resolveBugReport(id);
      setBugReports(prev => prev.map(bug => bug.id === id ? { ...bug, status: 'resolved' } : bug));
      addLog("Bug Resolved", id, "info");
  };

  const handleGameStatusToggle = async (gameId: string, currentStatus: string) => {
      const newStatus = currentStatus === 'active' ? 'coming_soon' : 'active';
      await updateGameStatus(gameId, newStatus);
      addLog("Game Status", `${gameId}: ${newStatus}`, newStatus === 'active' ? "info" : "warning");
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          await createTournament({
              name: newTourney.name,
              gameType: newTourney.gameType,
              entryFee: Number(newTourney.entryFee),
              maxPlayers: Number(newTourney.maxPlayers),
              startTime: newTourney.startTime,
              participants: [],
              status: 'registration',
              prizePool: 0
          });
          alert("Tournament Created!");
          addLog("Tournament Created", newTourney.name, "info");
          setShowCreateTourney(false);
          fetchAdminTournaments();
      } catch (err) {
          alert("Failed to create tournament");
      }
  };

  const handleDeleteTournament = async (id: string) => {
      if(!window.confirm("Delete this tournament? This cannot be undone.")) return;
      await deleteTournament(id);
      fetchAdminTournaments();
      if(selectedTourneyId === id) setSelectedTourneyId(null);
      addLog("Tournament Deleted", id, "critical");
  };

  const handleStartTournament = async (id: string) => {
      if(!window.confirm("Start tournament now? Registration will close.")) return;
      await updateTournamentStatus(id, 'active');
      fetchAdminTournaments();
      addLog("Tournament Started", id, "info");
  };

  const formatNumber = (num: number) => {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
      return num.toLocaleString();
  };

  const filteredUsers = usersList.filter(u => 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const manageableGames = [
      { id: 'Dice', name: 'Dice Duel' },
      { id: 'Chess', name: 'Master Chess' },
      { id: 'Checkers', name: 'Checkers Pro' },
      { id: 'Ludo', name: 'Ludo King' },
      { id: 'TicTacToe', name: 'XO Clash' },
      { id: 'Cards', name: 'Kmer Cards' },
      { id: 'Pool', name: '8-Ball Pool' },
  ];

  const stats = [
      { label: 'Total User Funds', value: formatNumber(totalSystemFunds), unit: 'FCFA', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10' },
      { label: 'Registered Users', value: usersList.length.toString(), unit: 'Total', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
      { label: 'Active Matches', value: maintenanceMode ? '0' : activeMatchesCount.toString(), unit: 'Live', icon: Activity, color: 'text-gold-400', bg: 'bg-gold-500/10' },
      { label: 'Banned Users', value: bannedCount.toString(), unit: 'Restricted', icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen pb-24 md:pb-6">
        <header className="mb-8 flex justify-between items-end">
           <div>
               <div className="flex items-center gap-2 mb-1">
                   <div className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-[10px] font-bold text-red-400 uppercase tracking-widest">
                       Admin Access
                   </div>
                   <span className="text-slate-500 text-xs">v1.4.3</span>
               </div>
               <h1 className="text-3xl font-display font-bold text-white">Command Center</h1>
           </div>
           <div className="flex items-center gap-3">
               <div className="text-right hidden md:block">
                   <div className="text-sm font-bold text-white">{user.name}</div>
                   <div className="text-xs text-slate-400">Super Admin</div>
               </div>
               <img src={user.avatar} className="w-10 h-10 rounded-full border-2 border-red-500" alt="Admin" />
           </div>
        </header>

        {/* Admin Navigation */}
        <div className="flex gap-4 mb-8 border-b border-white/10 overflow-x-auto">
            {['overview', 'users', 'reports', 'system', 'games', 'tournaments'].map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`pb-4 px-2 text-sm font-bold capitalize transition-all border-b-2 whitespace-nowrap ${
                        activeTab === tab ? 'text-white border-red-500' : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                >
                    {tab}
                </button>
            ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {stats.map((stat, i) => (
                        <div key={i} className="glass-panel p-5 rounded-xl border border-white/5 relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon size={20} /></div>
                                <span className="text-xs font-mono text-slate-500">{stat.unit}</span>
                            </div>
                            <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                            <div className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* TOURNAMENTS TAB (NEW) */}
        {activeTab === 'tournaments' && (
            <div className="flex flex-col md:flex-row gap-6">
                
                {/* Left Column: Tournament List */}
                <div className="w-full md:w-1/3 space-y-4">
                    <button 
                        onClick={() => setShowCreateTourney(!showCreateTourney)}
                        className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-royal-950 font-bold rounded-xl flex items-center justify-center gap-2 mb-4"
                    >
                        {showCreateTourney ? 'Cancel Creation' : <><Plus size={18} /> New Tournament</>}
                    </button>

                    {showCreateTourney && (
                        <div className="glass-panel p-4 rounded-xl border border-gold-500/30 mb-4 animate-in fade-in slide-in-from-top-4">
                            <h4 className="font-bold text-white mb-4 text-sm">Configure Event</h4>
                            <form onSubmit={handleCreateTournament} className="space-y-3">
                                <input className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" placeholder="Name" value={newTourney.name} onChange={e=>setNewTourney({...newTourney, name: e.target.value})} required/>
                                <div className="flex gap-2">
                                    <select className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" value={newTourney.gameType} onChange={e=>setNewTourney({...newTourney, gameType: e.target.value})}>
                                        {manageableGames.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                    <select className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" value={newTourney.maxPlayers} onChange={e=>setNewTourney({...newTourney, maxPlayers: Number(e.target.value)})}>
                                        {[4,8,16,32].map(n => <option key={n} value={n}>{n} Players</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <input type="number" className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" placeholder="Fee (FCFA)" value={newTourney.entryFee} onChange={e=>setNewTourney({...newTourney, entryFee: Number(e.target.value)})}/>
                                    <input type="datetime-local" className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" value={newTourney.startTime} onChange={e=>setNewTourney({...newTourney, startTime: e.target.value})} required/>
                                </div>
                                <button type="submit" className="w-full py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg text-xs">Create Event</button>
                            </form>
                        </div>
                    )}

                    <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                        {adminTournaments.map(t => (
                            <div 
                                key={t.id} 
                                onClick={() => handleSelectTournament(t.id)}
                                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                    selectedTourneyId === t.id ? 'bg-royal-800 border-gold-500' : 'bg-royal-900/50 border-white/10 hover:border-white/20'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-white text-sm">{t.name}</h4>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        t.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                                        t.status === 'completed' ? 'bg-white/10 text-slate-400' : 'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                        {t.status}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-400 mb-3">
                                    <span>{t.participants.length}/{t.maxPlayers} Players</span>
                                    <span>{t.entryFee} FCFA</span>
                                </div>
                                <div className="flex gap-2">
                                    {t.status === 'registration' && (
                                        <button onClick={(e) => {e.stopPropagation(); handleStartTournament(t.id)}} className="flex-1 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-[10px] font-bold border border-green-500/20">
                                            START
                                        </button>
                                    )}
                                    <button onClick={(e) => {e.stopPropagation(); handleDeleteTournament(t.id)}} className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] border border-red-500/20">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column: Match Overseer */}
                <div className="flex-1 glass-panel rounded-2xl border border-white/5 p-6 bg-black/20 min-h-[600px]">
                    {selectedTourneyId ? (
                        <>
                            <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <Trophy size={18} className="text-gold-400" /> 
                                    {adminTournaments.find(t => t.id === selectedTourneyId)?.name} Matches
                                </h3>
                                <div className="flex gap-2">
                                    <button onClick={() => handleSelectTournament(selectedTourneyId)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400"><RefreshCw size={14}/></button>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {tourneyMatches.length === 0 ? (
                                    <div className="text-center text-slate-500 text-sm py-12">No matches generated yet. Start the tournament.</div>
                                ) : (
                                    tourneyMatches.map((match) => (
                                        <div key={match.id} className="bg-royal-900/50 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                                            <div className="flex flex-col gap-1 w-1/3">
                                                <div className={`flex items-center gap-2 text-sm ${match.winnerId === match.player1?.id ? 'text-green-400 font-bold' : 'text-slate-300'}`}>
                                                    <span className="w-4 text-center text-xs text-slate-600">1</span>
                                                    {match.player1?.name || "TBD"}
                                                </div>
                                                <div className={`flex items-center gap-2 text-sm ${match.winnerId === match.player2?.id ? 'text-green-400 font-bold' : 'text-slate-300'}`}>
                                                    <span className="w-4 text-center text-xs text-slate-600">2</span>
                                                    {match.player2?.name || "TBD"}
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-center">
                                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Round {match.round}</div>
                                                <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${match.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                    {match.status}
                                                </div>
                                            </div>

                                            <div className="flex gap-1">
                                                {match.status !== 'completed' && (
                                                    <>
                                                        <button className="px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] font-bold rounded border border-green-500/20" title="Force P1 Win">P1</button>
                                                        <button className="px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] font-bold rounded border border-green-500/20" title="Force P2 Win">P2</button>
                                                        <button className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded border border-red-500/20" title="Reset"><RefreshCcw size={12}/></button>
                                                    </>
                                                )}
                                                {match.status === 'completed' && (
                                                    <div className="text-xs text-slate-500 italic px-2">Finalized</div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                            <Trophy size={48} className="mb-4" />
                            <p>Select a tournament to view details</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* ... (Keep existing Users, System, Reports Tabs) */}
        {/* USERS TAB */}
        {activeTab === 'users' && (
             <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden min-h-[500px]">
                 <div className="p-4 border-b border-white/5 bg-royal-900/50 flex flex-col md:flex-row gap-4 justify-between items-center">
                     <h3 className="font-bold text-white flex items-center gap-2">
                         <Users size={18} className="text-gold-400" /> User Management
                     </h3>
                     <div className="relative w-full md:w-64">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                         <input 
                            type="text" 
                            placeholder="Search by ID or Name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-gold-500 transition-colors"
                         />
                     </div>
                 </div>
                 <div className="overflow-x-auto">
                     {loadingUsers ? (
                         <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
                             <RefreshCw className="animate-spin" size={16} /> Loading database...
                         </div>
                     ) : (
                     <table className="w-full text-left">
                         <thead className="bg-royal-950 text-xs uppercase text-slate-500">
                             <tr>
                                 <th className="p-4">User</th>
                                 <th className="p-4">Rank</th>
                                 <th className="p-4">Balance</th>
                                 <th className="p-4 text-right">Actions</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-white/5">
                             {filteredUsers.length > 0 ? (
                                 filteredUsers.map((player) => (
                                     <tr key={player.id} className="hover:bg-white/5 transition-colors">
                                         <td className="p-4">
                                             <div className="flex items-center gap-3">
                                                 <img src={player.avatar} className="w-8 h-8 rounded-full" alt="" />
                                                 <div>
                                                     <div className="font-bold text-sm text-white">{player.name}</div>
                                                     <div className="text-xs text-slate-500">{player.id.substring(0, 8)}...</div>
                                                 </div>
                                             </div>
                                         </td>
                                         <td className="p-4">
                                             <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${
                                                 player.rankTier === 'Diamond' ? 'text-cyan-400 border-cyan-400/20 bg-cyan-400/10' :
                                                 player.rankTier === 'Gold' ? 'text-gold-400 border-gold-400/20 bg-gold-400/10' :
                                                 'text-slate-400 border-slate-400/20 bg-slate-400/10'
                                             }`}>
                                                 {player.rankTier}
                                             </span>
                                         </td>
                                         <td className="p-4 font-mono text-sm text-white">
                                             {player.balance.toLocaleString()} FCFA
                                         </td>
                                         <td className="p-4 text-right">
                                             <div className="flex items-center justify-end gap-2">
                                                 <button 
                                                    className={`p-2 rounded-lg transition-colors border ${player.isBanned ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'}`}
                                                    title={player.isBanned ? "Unban User" : "Ban User"}
                                                 >
                                                     <Ban size={16} />
                                                 </button>
                                                 <button className="p-2 bg-royal-800 hover:bg-white/10 text-blue-400 rounded-lg transition-colors border border-white/5" title="View Details">
                                                     <Search size={16} />
                                                 </button>
                                             </div>
                                         </td>
                                     </tr>
                                 ))
                             ) : (
                                 <tr>
                                     <td colSpan={4} className="p-8 text-center text-slate-500 text-sm">
                                         No users found matching "{searchQuery}"
                                     </td>
                                 </tr>
                             )}
                         </tbody>
                     </table>
                     )}
                 </div>
             </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden min-h-[500px]">
                <div className="p-4 border-b border-white/5 bg-royal-900/50 flex items-center justify-between">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Bug size={18} className="text-yellow-500" /> Bug Reports
                    </h3>
                    <button 
                        onClick={() => { setLoadingBugs(true); getBugReports().then(b => { setBugReports(b); setLoadingBugs(false); }); }}
                        className="p-2 bg-royal-800 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw size={16} className={loadingBugs ? "animate-spin" : ""} />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    {loadingBugs ? (
                        <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
                            <RefreshCw className="animate-spin" size={16} /> Loading reports...
                        </div>
                    ) : bugReports.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            No bug reports found. Good job!
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-royal-950 text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="p-4">Severity</th>
                                    <th className="p-4">Reported By</th>
                                    <th className="p-4">Description</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {bugReports.map((bug) => (
                                    <tr key={bug.id} className={`hover:bg-white/5 transition-colors ${bug.status === 'resolved' ? 'opacity-50' : ''}`}>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                                bug.severity === 'critical' ? 'bg-red-500 text-white' :
                                                bug.severity === 'medium' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                                'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            }`}>
                                                {bug.severity}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="text-sm font-bold text-white">{bug.userName}</div>
                                            <div className="text-xs text-slate-500 font-mono">{bug.userId.substring(0,8)}...</div>
                                        </td>
                                        <td className="p-4 max-w-md">
                                            <div className="text-sm text-slate-300 line-clamp-2">{bug.description}</div>
                                            {bug.reproduceSteps && (
                                                <div className="text-[10px] text-slate-500 mt-1">Steps provided</div>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className={`flex items-center gap-1 text-xs font-bold ${
                                                bug.status === 'resolved' ? 'text-green-500' : 'text-yellow-500'
                                            }`}>
                                                {bug.status === 'resolved' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                                                {bug.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {bug.status === 'open' && (
                                                <button 
                                                    onClick={() => handleResolveBug(bug.id)}
                                                    className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg border border-green-500/30 transition-colors"
                                                    title="Mark as Resolved"
                                                >
                                                    <CheckSquare size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        )}

        {/* SYSTEM TAB */}
        {activeTab === 'system' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Server size={18} className="text-gold-400" /> Server Controls
                    </h3>
                    
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                            <div>
                                <div className="font-bold text-white">Maintenance Mode</div>
                                <div className="text-xs text-slate-500">Disable matchmaking for updates</div>
                            </div>
                            <button 
                                onClick={handleMaintenanceToggle}
                                className={`w-12 h-6 rounded-full relative transition-colors ${maintenanceMode ? 'bg-gold-500' : 'bg-royal-800'}`}
                            >
                                <div className={`absolute left-1 top-1 w-4 h-4 rounded-full transition-all ${maintenanceMode ? 'bg-white translate-x-6' : 'bg-slate-500 translate-x-0'}`}></div>
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                            <div>
                                <div className="font-bold text-white">Flush Cache</div>
                                <div className="text-xs text-slate-500">Reset global game states</div>
                            </div>
                            <button 
                                onClick={() => addLog("Cache", "Flushed", "info")}
                                className="p-2 bg-royal-800 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Lock size={18} className="text-blue-400" /> Admin Permissions
                    </h3>
                    <div className="p-4 bg-royal-900/50 rounded-xl border border-white/5 mb-4">
                        <div className="text-sm font-bold text-white mb-2">Current Session</div>
                        <div className="flex items-center gap-2 text-xs text-green-400 mb-2">
                            <CheckCircle size={12} /> Encrypted (SSL)
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                            Auth: Firebase Token
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* GAMES TAB */}
        {activeTab === 'games' && (
            <div className="glass-panel rounded-2xl border border-white/5 p-6">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Gamepad2 size={18} className="text-purple-400" /> Game Availability Control
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {manageableGames.map((game) => {
                        const status = gameConfigs[game.id] || 'active'; // Default to active if not set
                        const isActive = status === 'active';
                        return (
                            <div key={game.id} className={`p-4 rounded-xl border transition-colors ${isActive ? 'bg-royal-900/50 border-white/10' : 'bg-red-500/5 border-red-500/20'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold text-white">{game.name}</h4>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {isActive ? 'Active' : 'Locked'}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-4">
                                    <span className="text-xs text-slate-500">
                                        {isActive ? 'Players can join tables' : 'Marked as "Coming Soon"'}
                                    </span>
                                    <button 
                                        onClick={() => handleGameStatusToggle(game.id, status)}
                                        className={`w-12 h-6 rounded-full relative transition-colors ${isActive ? 'bg-green-500' : 'bg-royal-800'}`}
                                    >
                                        <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-all ${isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}
    </div>
  );
};
