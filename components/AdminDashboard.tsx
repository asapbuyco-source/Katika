
import React, { useState, useEffect } from 'react';
import { User, PlayerProfile } from '../types';
import { Users, DollarSign, Activity, Shield, Search, AlertTriangle, Ban, CheckCircle, Server, RefreshCw, Lock, Power, Trash2, Check, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOCK_PLAYERS } from '../services/mockData';

// Extended type for Admin view management
interface AdminUser extends PlayerProfile {
    id: string;
    balance: number;
    status: 'Active' | 'Banned';
    joinDate: string;
    email: string;
}

interface AdminDashboardProps {
  user: User;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'system'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  // -- STATE MANAGEMENT --
  
  // 1. Users State (Initialized from Mock Data)
  const [usersList, setUsersList] = useState<AdminUser[]>(() => 
      MOCK_PLAYERS.map((p, i) => ({
          ...p,
          id: `usr-${1000 + i}`,
          balance: 12500 * (i + 1),
          status: 'Active' as const, // Explicitly cast to literal type
          joinDate: new Date(Date.now() - Math.random() * 10000000000).toLocaleDateString(),
          email: `${p.name.toLowerCase().replace(' ', '.')}@vantage.cm`
      }))
  );

  // 2. System State
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [activeMatchesCount, setActiveMatchesCount] = useState(142);
  const [networkTraffic, setNetworkTraffic] = useState(Array.from({ length: 24 }, () => Math.random() * 60 + 20));

  // 3. Logs State
  const [logs, setLogs] = useState([
      { id: 1, action: "User Ban", target: "Bot_User_99", time: "2 mins ago", type: "critical" },
      { id: 2, action: "Large Withdrawal", target: "Franck (250,000 FCFA)", time: "15 mins ago", type: "warning" },
      { id: 3, action: "System Update", target: "v1.4.2 Deployed", time: "1 hour ago", type: "info" },
      { id: 4, action: "New Admin", target: user.id || "Admin", time: "2 hours ago", type: "success" },
  ]);

  // Load Maintenance State
  useEffect(() => {
      const isMaint = localStorage.getItem('vantage_maintenance') === 'true';
      setMaintenanceMode(isMaint);
      if (isMaint) setActiveMatchesCount(0);
  }, []);

  // -- ACTIONS --

  const addLog = (action: string, target: string, type: 'critical' | 'warning' | 'info' | 'success') => {
      const newLog = {
          id: Date.now(),
          action,
          target,
          time: 'Just now',
          type
      };
      setLogs(prev => [newLog, ...prev]);
  };

  const toggleUserStatus = (userId: string) => {
      setUsersList(prev => prev.map(u => {
          if (u.id === userId) {
              const newStatus = u.status === 'Active' ? 'Banned' : 'Active';
              addLog(newStatus === 'Banned' ? "User Banned" : "User Unbanned", u.name, newStatus === 'Banned' ? 'critical' : 'success');
              return { ...u, status: newStatus };
          }
          return u;
      }));
  };

  const handleMaintenanceToggle = () => {
      const newState = !maintenanceMode;
      setMaintenanceMode(newState);
      localStorage.setItem('vantage_maintenance', String(newState));
      addLog("Maintenance Mode", newState ? "Enabled" : "Disabled", "warning");
  };

  const handleFlushCache = () => {
      addLog("System Cache", "Flushed Successfully", "info");
      // Visual feedback simulation
      const btn = document.getElementById('flush-btn');
      if(btn) {
          btn.classList.add('animate-spin');
          setTimeout(() => btn.classList.remove('animate-spin'), 1000);
      }
      alert("System Cache Flushed Successfully.");
  };

  const handleEmergencyShutdown = () => {
      if(window.confirm("CRITICAL WARNING: Are you sure you want to disconnect all players and halt servers? This will refund all active stakes.")) {
           
           let refundedCount = 0;
           let totalRefunded = 0;

           // Simulate refunds for a subset of users who might be in a game
           setUsersList(prev => prev.map(u => {
               // 30% chance a user is in a match for simulation
               if (Math.random() < 0.3) {
                   const stake = [1000, 5000, 10000][Math.floor(Math.random() * 3)];
                   refundedCount++;
                   totalRefunded += stake;
                   return { ...u, balance: u.balance + stake };
               }
               return u;
           }));

           setActiveMatchesCount(0);
           setMaintenanceMode(true);
           localStorage.setItem('vantage_maintenance', 'true');
           
           addLog("Emergency Shutdown", `Refunded ${totalRefunded.toLocaleString()} FCFA to ${refundedCount} active players.`, "critical");
           alert(`Emergency Shutdown Initiated.\n\nSessions Terminated: ${refundedCount}\nTotal Refunded: ${totalRefunded.toLocaleString()} FCFA\n\nMaintenance Mode is now ACTIVE.`);
      }
  };

  // Filter Users
  const filteredUsers = usersList.filter(u => 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats Derived from State
  const stats = [
      { label: 'Total Revenue', value: '15.4M', unit: 'FCFA', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10' },
      { label: 'Registered Users', value: usersList.length.toString(), unit: 'Total', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
      { label: 'Active Matches', value: maintenanceMode ? '0' : activeMatchesCount.toString(), unit: 'Live', icon: Activity, color: 'text-gold-400', bg: 'bg-gold-500/10' },
      { label: 'Banned Users', value: usersList.filter(u => u.status === 'Banned').length.toString(), unit: 'Restricted', icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen pb-24 md:pb-6">
        <header className="mb-8 flex justify-between items-end">
           <div>
               <div className="flex items-center gap-2 mb-1">
                   <div className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-[10px] font-bold text-red-400 uppercase tracking-widest">
                       Admin Access
                   </div>
                   <span className="text-slate-500 text-xs">v1.4.2</span>
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
        <div className="flex gap-4 mb-8 border-b border-white/10">
            {['overview', 'users', 'system'].map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`pb-4 px-2 text-sm font-bold capitalize transition-all border-b-2 ${
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
                        <motion.div 
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="glass-panel p-5 rounded-xl border border-white/5 relative overflow-hidden"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-lg ${stat.bg} ${stat.color}`}>
                                    <stat.icon size={20} />
                                </div>
                                <span className="text-xs font-mono text-slate-500">{stat.unit}</span>
                            </div>
                            <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                            <div className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</div>
                        </motion.div>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Live Activity Chart */}
                    <div className="md:col-span-2 glass-panel p-6 rounded-2xl border border-white/5">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Activity size={18} className="text-blue-400" /> Network Traffic
                            </h3>
                            {maintenanceMode && <span className="text-xs font-bold text-red-500 uppercase animate-pulse">Maintenance Active</span>}
                        </div>
                        <div className="h-64 flex items-end gap-2">
                            {networkTraffic.map((h, i) => (
                                <div key={i} className="flex-1 bg-royal-800 rounded-t-sm relative group overflow-hidden">
                                    <motion.div 
                                        initial={{ height: 0 }}
                                        animate={{ height: maintenanceMode ? 0 : `${h}%` }}
                                        transition={{ duration: 1, delay: i * 0.05 }}
                                        className={`w-full transition-colors absolute bottom-0 left-0 right-0 rounded-t-sm ${maintenanceMode ? 'bg-slate-700' : 'bg-blue-500/50 hover:bg-blue-400'}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Logs */}
                    <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col h-[380px]">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <Shield size={18} className="text-red-400" /> Audit Log
                        </h3>
                        <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                            <AnimatePresence>
                                {logs.map((log) => (
                                    <motion.div 
                                        key={log.id} 
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex gap-3 items-start pb-4 border-b border-white/5 last:border-0 last:pb-0"
                                    >
                                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                                            log.type === 'critical' ? 'bg-red-500 shadow-[0_0_8px_red]' :
                                            log.type === 'warning' ? 'bg-yellow-500' :
                                            log.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                                        }`} />
                                        <div>
                                            <div className="text-sm font-bold text-white">{log.action}</div>
                                            <div className="text-xs text-slate-400">{log.target}</div>
                                            <div className="text-[10px] text-slate-600 mt-1 font-mono">{log.time}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        )}

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
                     <table className="w-full text-left">
                         <thead className="bg-royal-950 text-xs uppercase text-slate-500">
                             <tr>
                                 <th className="p-4">User</th>
                                 <th className="p-4">Rank</th>
                                 <th className="p-4">Balance</th>
                                 <th className="p-4">Status</th>
                                 <th className="p-4 text-right">Actions</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-white/5">
                             {filteredUsers.length > 0 ? (
                                 filteredUsers.map((player) => (
                                     <tr key={player.id} className={`hover:bg-white/5 transition-colors ${player.status === 'Banned' ? 'bg-red-500/5' : ''}`}>
                                         <td className="p-4">
                                             <div className="flex items-center gap-3">
                                                 <img src={player.avatar} className={`w-8 h-8 rounded-full ${player.status === 'Banned' ? 'grayscale opacity-50' : ''}`} alt="" />
                                                 <div>
                                                     <div className="font-bold text-sm text-white">{player.name}</div>
                                                     <div className="text-xs text-slate-500">{player.email}</div>
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
                                             <AnimatePresence mode='popLayout'>
                                                 <motion.span 
                                                    key={player.balance}
                                                    initial={{ opacity: 0.5, scale: 1.1 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className={player.balance > 12500 ? "text-green-400 font-bold" : ""}
                                                 >
                                                     {player.balance.toLocaleString()} FCFA
                                                 </motion.span>
                                             </AnimatePresence>
                                         </td>
                                         <td className="p-4">
                                             <span className={`flex items-center gap-1.5 text-xs font-bold ${player.status === 'Active' ? 'text-green-400' : 'text-red-400'}`}>
                                                 <span className={`w-1.5 h-1.5 rounded-full ${player.status === 'Active' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
                                                 {player.status}
                                             </span>
                                         </td>
                                         <td className="p-4 text-right">
                                             <div className="flex items-center justify-end gap-2">
                                                 <button 
                                                    onClick={() => toggleUserStatus(player.id)}
                                                    className={`p-2 rounded-lg transition-colors border ${
                                                        player.status === 'Banned' 
                                                        ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20' 
                                                        : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                                    }`} 
                                                    title={player.status === 'Banned' ? 'Unban User' : 'Ban User'}
                                                 >
                                                     {player.status === 'Banned' ? <CheckCircle size={16} /> : <Ban size={16} />}
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
                                     <td colSpan={5} className="p-8 text-center text-slate-500 text-sm">
                                         No users found matching "{searchQuery}"
                                     </td>
                                 </tr>
                             )}
                         </tbody>
                     </table>
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
                                onClick={handleFlushCache}
                                id="flush-btn"
                                className="p-2 bg-royal-800 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                            <div>
                                <div className="font-bold text-red-400">Emergency Shutdown</div>
                                <div className="text-xs text-red-300/70">Disconnect and Refund Players</div>
                            </div>
                            <button 
                                onClick={handleEmergencyShutdown}
                                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
                            >
                                <Power size={16} />
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
                            IP: 192.168.1.1 (Cameroon)
                            <br/>
                            Auth: Firebase Token (Exp: 55m)
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => alert("Downloading logs...")} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white border border-white/5 flex items-center justify-center gap-2">
                            <Server size={14} /> Audit Logs
                        </button>
                        <button onClick={() => alert("API Keys managed via Firebase Console")} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white border border-white/5 flex items-center justify-center gap-2">
                            <Lock size={14} /> API Keys
                        </button>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-white/5">
                        <div className="text-xs text-slate-500 mb-2 font-bold uppercase">System Health</div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">CPU Usage</span>
                                <span className="text-green-400">12%</span>
                            </div>
                            <div className="w-full bg-royal-950 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-green-500 h-full w-[12%]"></div>
                            </div>
                            
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Memory</span>
                                <span className="text-yellow-400">45%</span>
                            </div>
                            <div className="w-full bg-royal-950 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-yellow-500 h-full w-[45%]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
