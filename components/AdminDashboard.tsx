
import React, { useState, useEffect } from 'react';
import { User, BugReport, Tournament, TournamentMatch } from '../types';
import { Users, DollarSign, Activity, Shield, Search, Ban, CheckCircle, Server, RefreshCw, Lock, Bug, CheckSquare, AlertCircle, Gamepad2, Power, Trophy, Plus, Calendar, Play, Trash2, StopCircle, RefreshCcw, Eye, Coins, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllUsers, getActiveGamesCount, getSystemLogs, getGameActivityStats, getBugReports, resolveBugReport, updateGameStatus, subscribeToGameConfigs, createTournament, getTournaments, deleteTournament, updateTournamentStatus, getTournamentMatches, startTournament, banUser, setMaintenanceMode, subscribeToMaintenanceMode, reportTournamentMatchResult, auth } from '../services/firebase';

interface AdminDashboardProps {
    user: User;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'reports' | 'system' | 'games' | 'tournaments' | 'server'>('overview');
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

    // Server Status State
    const [serverStatus, setServerStatus] = useState<any>(null);
    const [loadingServerStatus, setLoadingServerStatus] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [newTourney, setNewTourney] = useState({
        name: '',
        gameType: 'Ludo',
        entryFee: 1000,
        maxPlayers: 16,
        startInHours: 0,
        startInMinutes: 30,
        prizePool: 0,
        type: 'dynamic' as 'fixed' | 'dynamic'
    });

    // Load Real Data
    useEffect(() => {
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
        // Subscribe to real-time Firestore maintenance mode instead of localStorage
        const unsubMaint = subscribeToMaintenanceMode(setMaintenanceMode);
        return () => { unsubGames(); unsubMaint(); };
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
        if (activeTab === 'server') {
            fetchServerStatus();
            const interval = setInterval(fetchServerStatus, 5000);
            return () => clearInterval(interval);
        }
    }, [activeTab]);

    const fetchServerStatus = async () => {
        setLoadingServerStatus(true);
        try {
            const isProd = window.location.hostname !== 'localhost';
            const url = isProd
                ? `${import.meta.env.VITE_SOCKET_URL || ''}/api/admin/server-status`
                : `${window.location.protocol}//${window.location.hostname}:8080/api/admin/server-status`;

            // Use Firebase ID Token for admin auth (no shared secret in bundle)
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Not logged in');

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            setServerStatus(data);
            setServerError(null);
        } catch (e: any) {
            console.error("Server status fetch error", e);
            setServerError(e.message || 'Connection failed');
        }
        setLoadingServerStatus(false);
    };

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

    const handleMaintenanceToggle = async () => {
        try {
            await setMaintenanceMode(!maintenanceMode);
            // State is updated via subscribeToMaintenanceMode listener
            addLog("Maintenance Mode", !maintenanceMode ? "Enabled" : "Disabled", "warning");
        } catch (e: any) {
            console.error('Maintenance toggle failed:', e);
            alert(e.message || 'Failed to toggle maintenance mode');
        }
    };

    const handleBanUser = async (player: any) => {
        const newBan = !player.isBanned;
        const action = newBan ? 'Ban' : 'Unban';
        if (!window.confirm(`${action} user "${player.name}"?`)) return;
        try {
            await banUser(player.id, newBan);
            setUsersList(prev => prev.map(u => u.id === player.id ? { ...u, isBanned: newBan } : u));
            setBannedCount(prev => newBan ? prev + 1 : prev - 1);
            addLog(`User ${action}ned`, player.name, newBan ? 'critical' : 'info');
        } catch (e: any) {
            console.error('Ban action failed:', e);
            alert(e.message || 'Ban action failed');
        }
    };

    const handleForceWin = async (match: TournamentMatch, winnerId: string) => {
        if (!window.confirm(`Force win for player ${winnerId === match.player1?.id ? match.player1?.name : match.player2?.name}?`)) return;
        try {
            await reportTournamentMatchResult(match.id, winnerId);
            addLog('Force Win Applied', `Match ${match.id}`, 'warning');
            // Refresh matches
            if (selectedTourneyId) handleSelectTournament(selectedTourneyId);
        } catch (e: any) {
            console.error('Force win failed:', e);
            alert(e.message || 'Force win failed');
        }
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
        const totalMinutes = (Number(newTourney.startInHours) * 60) + Number(newTourney.startInMinutes);
        if (totalMinutes < 1) {
            alert('Tournament must start at least 1 minute from now.');
            return;
        }
        // Compute absolute ISO start time from timer offset
        const startTime = new Date(Date.now() + totalMinutes * 60 * 1000).toISOString();
        try {
            await createTournament({
                name: newTourney.name,
                gameType: newTourney.gameType,
                entryFee: Number(newTourney.entryFee),
                maxPlayers: Number(newTourney.maxPlayers),
                startTime,
                participants: [],
                status: 'registration',
                prizePool: newTourney.type === 'fixed' ? Number(newTourney.prizePool) : 0,
                type: newTourney.type
            });
            alert(`Tournament Created! Starts in ${newTourney.startInHours}h ${newTourney.startInMinutes}m.`);
            addLog('Tournament Created', newTourney.name, 'info');
            setShowCreateTourney(false);
            setNewTourney({ name: '', gameType: 'Ludo', entryFee: 1000, maxPlayers: 16, startInHours: 0, startInMinutes: 30, prizePool: 0, type: 'dynamic' });
            fetchAdminTournaments();
        } catch (err: any) {
            console.error('Tournament creation error:', err);
            alert(err.message || 'Failed to create tournament');
        }
    };

    const handleDeleteTournament = async (id: string) => {
        if (!window.confirm("Delete this tournament? This cannot be undone.")) return;
        try {
            await deleteTournament(id);
            fetchAdminTournaments();
            if (selectedTourneyId === id) setSelectedTourneyId(null);
            addLog("Tournament Deleted", id, "critical");
        } catch (e: any) {
            console.error('Tournament deletion failed:', e);
            alert(e.message || 'Failed to delete tournament');
        }
    };

    const handleStartTournament = async (id: string) => {
        if (!window.confirm("Start tournament now? Registration will close, participants will be shuffled.")) return;
        await startTournament(id);
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
                {['overview', 'users', 'reports', 'system', 'games', 'tournaments', 'server'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`pb-4 px-2 text-sm font-bold capitalize transition-all border-b-2 whitespace-nowrap ${activeTab === tab ? 'text-white border-red-500' : 'text-slate-500 border-transparent hover:text-slate-300'
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
                                    {/* Type Toggle */}
                                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/10 mb-2">
                                        <button
                                            type="button"
                                            onClick={() => setNewTourney({ ...newTourney, type: 'fixed' })}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${newTourney.type === 'fixed' ? 'bg-royal-800 text-gold-400 shadow-sm' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            House Funded (Fixed)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNewTourney({ ...newTourney, type: 'dynamic' })}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${newTourney.type === 'dynamic' ? 'bg-royal-800 text-gold-400 shadow-sm' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            User Funded (Dynamic)
                                        </button>
                                    </div>

                                    <input className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" placeholder="Name" value={newTourney.name} onChange={e => setNewTourney({ ...newTourney, name: e.target.value })} required />
                                    <div className="flex gap-2">
                                        <select className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" value={newTourney.gameType} onChange={e => setNewTourney({ ...newTourney, gameType: e.target.value })}>
                                            {manageableGames.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                        </select>
                                        <input type="number" className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" placeholder="Max Players" value={newTourney.maxPlayers} onChange={e => setNewTourney({ ...newTourney, maxPlayers: Number(e.target.value) })} />
                                    </div>
                                    <div className="flex gap-2">
                                        <input type="number" className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white" placeholder="Entry Fee (FCFA)" value={newTourney.entryFee} onChange={e => setNewTourney({ ...newTourney, entryFee: Number(e.target.value) })} />
                                        {newTourney.type === 'fixed' ? (
                                            <input type="number" className="flex-1 bg-black/30 border border-gold-500/50 rounded-lg p-2 text-xs text-gold-400 font-bold" placeholder="Guaranteed Pot (FCFA)" value={newTourney.prizePool} onChange={e => setNewTourney({ ...newTourney, prizePool: Number(e.target.value) })} required />
                                        ) : (
                                            <div className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-[10px] text-slate-400 flex items-center justify-center">
                                                Calculated from entries
                                            </div>
                                        )}
                                    </div>
                                    {/* Timer-based start: "starts in X hours Y minutes" */}
                                    <div>
                                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                                            <Clock size={10} /> Starts In (from now)
                                        </label>
                                        <div className="flex gap-2 items-center">
                                            <div className="flex-1 relative">
                                                <input
                                                    id="tourney-start-hours"
                                                    type="number"
                                                    min={0} max={72}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white text-center font-mono"
                                                    value={newTourney.startInHours}
                                                    onChange={e => setNewTourney({ ...newTourney, startInHours: Math.max(0, Number(e.target.value)) })}
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">h</span>
                                            </div>
                                            <span className="text-slate-500 font-bold text-sm">:</span>
                                            <div className="flex-1 relative">
                                                <input
                                                    id="tourney-start-mins"
                                                    type="number"
                                                    min={0} max={59}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white text-center font-mono"
                                                    value={newTourney.startInMinutes}
                                                    onChange={e => setNewTourney({ ...newTourney, startInMinutes: Math.min(59, Math.max(0, Number(e.target.value))) })}
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">m</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            Will start at approx. {(() => {
                                                const t = new Date(Date.now() + ((newTourney.startInHours * 60) + newTourney.startInMinutes) * 60000);
                                                return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            })()}
                                        </p>
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
                                    className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedTourneyId === t.id ? 'bg-royal-800 border-gold-500' : 'bg-royal-900/50 border-white/10 hover:border-white/20'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-white text-sm">{t.name}</h4>
                                        <div className="flex gap-1">
                                            {t.type === 'fixed' && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30">Fixed</span>}
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${t.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                                t.status === 'completed' ? 'bg-white/10 text-slate-400' : 'bg-yellow-500/20 text-yellow-400'
                                                }`}>
                                                {t.status}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-400 mb-3">
                                        <span>{t.participants.length}/{t.maxPlayers} Players</span>
                                        <span>Pool: {t.type === 'fixed' ? t.prizePool.toLocaleString() : ((t.prizePool || 0) + (t.entryFee * t.participants.length * 0.9)).toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        {t.status === 'registration' && (
                                            <button onClick={(e) => { e.stopPropagation(); handleStartTournament(t.id) }} className="flex-1 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-[10px] font-bold border border-green-500/20">
                                                START
                                            </button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteTournament(t.id) }} className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] border border-red-500/20">
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
                                        <button onClick={() => handleSelectTournament(selectedTourneyId)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400"><RefreshCw size={14} /></button>
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
                                                        {match.player1?.name || "Bye/Empty"}
                                                    </div>
                                                    <div className={`flex items-center gap-2 text-sm ${match.winnerId === match.player2?.id ? 'text-green-400 font-bold' : 'text-slate-300'}`}>
                                                        <span className="w-4 text-center text-xs text-slate-600">2</span>
                                                        {match.player2?.name || "Bye/Empty"}
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
                                                            <button
                                                                onClick={() => match.player1?.id && handleForceWin(match, match.player1.id)}
                                                                className="px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] font-bold rounded border border-green-500/20"
                                                                title={`Force ${match.player1?.name} Win`}
                                                            >P1</button>
                                                            <button
                                                                onClick={() => match.player2?.id && handleForceWin(match, match.player2.id)}
                                                                className="px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] font-bold rounded border border-green-500/20"
                                                                title={`Force ${match.player2?.name} Win`}
                                                            >P2</button>
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
                                        filteredUsers.map((player: any) => (
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
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${player.rankTier === 'Diamond' ? 'text-cyan-400 border-cyan-400/20 bg-cyan-400/10' :
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
                                                            onClick={() => handleBanUser(player)}
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
                                    {bugReports.map((bug: any) => (
                                        <tr key={bug.id} className={`hover:bg-white/5 transition-colors ${bug.status === 'resolved' ? 'opacity-50' : ''}`}>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${bug.severity === 'critical' ? 'bg-red-500 text-white' :
                                                    bug.severity === 'medium' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                    }`}>
                                                    {bug.severity}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-sm font-bold text-white">{bug.userName}</div>
                                                <div className="text-xs text-slate-500 font-mono">{bug.userId.substring(0, 8)}...</div>
                                            </td>
                                            <td className="p-4 max-w-md">
                                                <div className="text-sm text-slate-300 line-clamp-2">{bug.description}</div>
                                                {bug.reproduceSteps && (
                                                    <div className="text-[10px] text-slate-500 mt-1">Steps provided</div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={`flex items-center gap-1 text-xs font-bold ${bug.status === 'resolved' ? 'text-green-500' : 'text-yellow-500'
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
                        {manageableGames.map((game: any) => {
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

            {/* TOURNAMENTS TAB (ALREADY EXISTS EARLIER IN FILE, SO NO NEED TO DUPLICATE. 
                WE JUST REORDERED OVERVIEW/USERS/REPORTS/SYSTEM/GAMES ABOVE) */}

            {/* SERVER TAB */}
            {activeTab === 'server' && (
                <div className="space-y-6">
                    {/* Connection Status Banner */}
                    <div className={`flex items-center justify-between p-4 rounded-xl border ${serverError
                            ? 'bg-red-500/10 border-red-500/30'
                            : serverStatus
                                ? 'bg-green-500/10 border-green-500/30'
                                : 'bg-yellow-500/10 border-yellow-500/30'
                        }`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full animate-pulse ${serverError ? 'bg-red-500' : serverStatus ? 'bg-green-500' : 'bg-yellow-500'
                                }`} />
                            <div>
                                <div className={`text-sm font-bold ${serverError ? 'text-red-400' : serverStatus ? 'text-green-400' : 'text-yellow-400'
                                    }`}>
                                    {serverError ? 'Server Unreachable' : serverStatus ? 'Server Online' : 'Connecting...'}
                                </div>
                                {serverError && (
                                    <div className="text-xs text-red-400/70 mt-0.5 font-mono">{serverError}</div>
                                )}
                                {serverStatus && (
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {serverStatus.environment?.toUpperCase()} · {serverStatus.nodeVersion} · Last polled: {new Date(serverStatus.timestamp).toLocaleTimeString()}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={fetchServerStatus}
                            disabled={loadingServerStatus}
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                            <RefreshCw size={16} className={loadingServerStatus ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {serverError && !serverStatus ? (
                        <div className="glass-panel rounded-2xl border border-red-500/20 p-12 text-center">
                            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">Cannot Connect to Server</h3>
                            <p className="text-sm text-slate-400 max-w-md mx-auto mb-1">
                                The admin dashboard could not reach the game server API.
                            </p>
                            <p className="text-xs text-red-400/80 font-mono mb-6">{serverError}</p>
                            <div className="text-xs text-slate-500 space-y-1">
                                <p>• Check that the server is running (<code className="text-slate-400">node server.js</code>)</p>
                                <p>• Verify ADMIN_SECRET matches in both .env and VITE_ADMIN_SECRET</p>
                                <p>• If in production, ensure the server is deployed and healthy</p>
                            </div>
                        </div>
                    ) : !serverStatus ? (
                        <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
                            <RefreshCw className="animate-spin" size={16} /> Connecting to server API...
                        </div>
                    ) : (
                        <>
                            {/* Metrics Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="glass-panel p-5 rounded-xl border border-white/5">
                                    <Activity className="text-gold-400 mb-2" size={20} />
                                    <div className="text-2xl font-bold text-white mb-1">{serverStatus.sockets.totalConnected}</div>
                                    <div className="text-xs text-slate-400 uppercase tracking-wider">Live Connections</div>
                                </div>
                                <div className="glass-panel p-5 rounded-xl border border-white/5">
                                    <Gamepad2 className="text-blue-400 mb-2" size={20} />
                                    <div className="text-2xl font-bold text-white mb-1">{serverStatus.sockets.activeRooms}</div>
                                    <div className="text-xs text-slate-400 uppercase tracking-wider">Active Game Rooms</div>
                                </div>
                                <div className="glass-panel p-5 rounded-xl border border-white/5">
                                    <RefreshCw className="text-green-400 mb-2" size={20} />
                                    <div className="text-2xl font-bold text-white mb-1">{serverStatus.sockets.activeQueues}</div>
                                    <div className="text-xs text-slate-400 uppercase tracking-wider">Matchmaking Pools</div>
                                </div>
                                <div className="glass-panel p-5 rounded-xl border border-white/5">
                                    <Play className="text-purple-400 mb-2" size={20} />
                                    <div className="text-2xl font-bold text-white mb-1">
                                        {Math.floor(serverStatus.uptime / 3600)}h {Math.floor((serverStatus.uptime % 3600) / 60)}m
                                    </div>
                                    <div className="text-xs text-slate-400 uppercase tracking-wider">Server Uptime</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Memory Usage */}
                                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                                        <Activity size={16} className="text-red-400" /> Memory Lifecycle
                                    </h3>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-slate-400">Heap Used</span>
                                                <span className="text-white font-mono">{serverStatus.memoryUsage.heapUsed} MB</span>
                                            </div>
                                            <div className="w-full bg-white/5 rounded-full h-2">
                                                <div
                                                    className="bg-gold-500 h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${Math.min(100, (serverStatus.memoryUsage.heapUsed / serverStatus.memoryUsage.heapTotal) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-2">
                                            <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Heap</div>
                                                <div className="text-sm font-bold text-white">{serverStatus.memoryUsage.heapTotal} MB</div>
                                            </div>
                                            <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">RSS Size</div>
                                                <div className="text-sm font-bold text-white">{serverStatus.memoryUsage.rss} MB</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Active Queues */}
                                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                                        <RefreshCw size={16} className="text-green-400" /> Active Queues
                                    </h3>
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {serverStatus.queues.length === 0 ? (
                                            <div className="text-slate-500 text-xs text-center py-4">No players currently in queue</div>
                                        ) : (
                                            serverStatus.queues.map((q: any) => (
                                                <div key={q.key} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                                                    <span className="text-xs font-bold text-slate-300 uppercase">{q.key.replace('_', ' @ ')} FCFA</span>
                                                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px] font-bold">{q.count} WAITING</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Active Rooms Table */}
                            <div className="glass-panel rounded-2xl border border-white/5">
                                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                        <Gamepad2 size={16} className="text-blue-400" /> Live Match Rooms
                                    </h3>
                                    <span className="text-[10px] font-mono text-slate-500">Auto-refresh: 5s</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-white/5 text-[10px] uppercase text-slate-500">
                                            <tr>
                                                <th className="p-4">Room ID</th>
                                                <th className="p-4">Game</th>
                                                <th className="p-4">Stake</th>
                                                <th className="p-4">Players</th>
                                                <th className="p-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {serverStatus.rooms.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="p-8 text-center text-slate-500 text-xs italic">No active game sessions</td>
                                                </tr>
                                            ) : (
                                                serverStatus.rooms.map((room: any) => (
                                                    <tr key={room.id} className="hover:bg-white/5 transition-colors text-xs text-slate-300">
                                                        <td className="p-4 font-mono text-gold-400">{room.id}</td>
                                                        <td className="p-4 font-bold">{room.gameType}</td>
                                                        <td className="p-4">{room.stake} FCFA</td>
                                                        <td className="p-4">{room.players}/2</td>
                                                        <td className="p-4">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${room.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                                }`}>
                                                                {room.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* System Activity Logs */}
                            <div className="glass-panel rounded-2xl border border-white/5">
                                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                        <AlertCircle size={16} className="text-yellow-400" /> System Event Log
                                    </h3>
                                    <span className="text-[10px] font-mono text-slate-500">Last 10 events</span>
                                </div>
                                <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
                                    {logs.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500 text-xs italic">No system events recorded</div>
                                    ) : (
                                        logs.map((log: any) => (
                                            <div key={log.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${log.type === 'critical' ? 'bg-red-500' :
                                                            log.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                                                        }`} />
                                                    <div>
                                                        <div className="text-xs font-bold text-white">{log.action}</div>
                                                        <div className="text-[10px] text-slate-500">{log.target}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${log.type === 'critical' ? 'bg-red-500/20 text-red-400' :
                                                            log.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                                                        }`}>
                                                        {log.type}
                                                    </span>
                                                    <span className="text-[10px] text-slate-600 font-mono">{log.time}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
