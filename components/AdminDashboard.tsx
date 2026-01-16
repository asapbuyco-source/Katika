
import React, { useState } from 'react';
import { User } from '../types';
import { Users, DollarSign, Activity, Shield, Search, AlertTriangle, Ban, CheckCircle, Server, RefreshCw, Lock, Power, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { MOCK_PLAYERS } from '../services/mockData';

interface AdminDashboardProps {
  user: User;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'system'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mock Admin Data
  const stats = [
      { label: 'Total Revenue', value: '15.4M', unit: 'FCFA', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10' },
      { label: 'Active Players', value: '2,841', unit: 'Online', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
      { label: 'Active Matches', value: '142', unit: 'Live', icon: Activity, color: 'text-gold-400', bg: 'bg-gold-500/10' },
      { label: 'Security Alerts', value: '3', unit: 'Critical', icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  const recentLogs = [
      { id: 1, action: "User Ban", target: "Bot_User_99", time: "2 mins ago", type: "critical" },
      { id: 2, action: "Large Withdrawal", target: "Franck (250,000 FCFA)", time: "15 mins ago", type: "warning" },
      { id: 3, action: "System Update", target: "v1.4.2 Deployed", time: "1 hour ago", type: "info" },
      { id: 4, action: "New Admin", target: "abrackly@gmail.com", time: "2 hours ago", type: "success" },
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
                    {/* Live Activity Chart Placeholder */}
                    <div className="md:col-span-2 glass-panel p-6 rounded-2xl border border-white/5">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <Activity size={18} className="text-blue-400" /> Network Traffic
                        </h3>
                        <div className="h-64 flex items-end gap-2">
                            {Array.from({ length: 24 }).map((_, i) => (
                                <div key={i} className="flex-1 bg-royal-800 rounded-t-sm relative group overflow-hidden">
                                    <motion.div 
                                        initial={{ height: 0 }}
                                        animate={{ height: `${Math.random() * 80 + 20}%` }}
                                        transition={{ duration: 1, delay: i * 0.05 }}
                                        className="w-full bg-blue-500/50 hover:bg-blue-400 transition-colors absolute bottom-0 left-0 right-0 rounded-t-sm"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Logs */}
                    <div className="glass-panel p-6 rounded-2xl border border-white/5">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <Shield size={18} className="text-red-400" /> Audit Log
                        </h3>
                        <div className="space-y-4">
                            {recentLogs.map((log) => (
                                <div key={log.id} className="flex gap-3 items-start pb-4 border-b border-white/5 last:border-0 last:pb-0">
                                    <div className={`mt-1 w-2 h-2 rounded-full ${
                                        log.type === 'critical' ? 'bg-red-500 shadow-[0_0_8px_red]' :
                                        log.type === 'warning' ? 'bg-yellow-500' :
                                        log.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                                    }`} />
                                    <div>
                                        <div className="text-sm font-bold text-white">{log.action}</div>
                                        <div className="text-xs text-slate-400">{log.target}</div>
                                        <div className="text-[10px] text-slate-600 mt-1 font-mono">{log.time}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
             <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                 <div className="p-4 border-b border-white/5 bg-royal-900/50 flex flex-col md:flex-row gap-4 justify-between items-center">
                     <h3 className="font-bold text-white flex items-center gap-2">
                         <Users size={18} className="text-gold-400" /> User Management
                     </h3>
                     <div className="relative w-full md:w-64">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                         <input 
                            type="text" 
                            placeholder="Search by ID or Email"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-gold-500"
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
                             {MOCK_PLAYERS.map((player, i) => (
                                 <tr key={i} className="hover:bg-white/5 transition-colors">
                                     <td className="p-4">
                                         <div className="flex items-center gap-3">
                                             <img src={player.avatar} className="w-8 h-8 rounded-full" alt="" />
                                             <div>
                                                 <div className="font-bold text-sm text-white">{player.name}</div>
                                                 <div className="text-xs text-slate-500">ID: usr-{1000+i}</div>
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
                                     <td className="p-4 font-mono text-sm text-white">{(12500 * (i+1)).toLocaleString()} FCFA</td>
                                     <td className="p-4">
                                         <span className="flex items-center gap-1.5 text-xs text-green-400">
                                             <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                             Active
                                         </span>
                                     </td>
                                     <td className="p-4 text-right">
                                         <div className="flex items-center justify-end gap-2">
                                             <button className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors" title="Ban User">
                                                 <Ban size={16} />
                                             </button>
                                             <button className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors" title="View Details">
                                                 <Search size={16} />
                                             </button>
                                         </div>
                                     </td>
                                 </tr>
                             ))}
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
                            <button className="w-12 h-6 bg-royal-800 rounded-full relative">
                                <div className="absolute left-1 top-1 w-4 h-4 bg-slate-500 rounded-full transition-all"></div>
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                            <div>
                                <div className="font-bold text-white">Flush Cache</div>
                                <div className="text-xs text-slate-500">Reset global game states</div>
                            </div>
                            <button className="p-2 bg-royal-800 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                            <div>
                                <div className="font-bold text-red-400">Emergency Shutdown</div>
                                <div className="text-xs text-red-300/70">Disconnect all active sessions</div>
                            </div>
                            <button className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
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
                        <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white border border-white/5">
                            Audit Logs
                        </button>
                        <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white border border-white/5">
                            API Keys
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
