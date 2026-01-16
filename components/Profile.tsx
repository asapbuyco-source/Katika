import React, { useState } from 'react';
import { User, Transaction } from '../types';
import { MOCK_TRANSACTIONS } from '../services/mockData';
import { Settings, CreditCard, Trophy, TrendingUp, ChevronDown, LogOut, Edit2, Shield, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProfileProps {
  user: User;
  onLogout: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'settings'>('overview');

  const handleDeposit = () => {
    alert("Deposit Successful! 10,000 FCFA has been added to your balance.");
  };

  const handleWithdraw = () => {
    alert("Withdrawal Initiated! 5,000 FCFA has been sent to your Mobile Money account.");
  };

  const getRankColor = (tier: string) => {
      switch(tier) {
          case 'Diamond': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
          case 'Gold': return 'text-gold-400 bg-gold-400/10 border-gold-400/20';
          case 'Silver': return 'text-slate-300 bg-slate-300/10 border-slate-300/20';
          default: return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen pb-24 md:pb-6">
       
       {/* Profile Header */}
       <header className="relative mb-8 pt-10">
           {/* Banner/Cover */}
           <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-royal-800 via-royal-700 to-royal-800 rounded-2xl opacity-50 -z-10"></div>
           
           <div className="flex flex-col md:flex-row items-end md:items-center justify-between px-4 pb-4">
               <div className="flex flex-col md:flex-row items-center md:items-end gap-6 w-full">
                   <div className="relative group">
                       <div className="w-28 h-28 rounded-full border-4 border-royal-950 p-1 bg-royal-800 relative z-10">
                           <img src={user.avatar} alt="Profile" className="w-full h-full rounded-full object-cover" />
                       </div>
                       <button className="absolute bottom-1 right-1 bg-gold-500 text-black p-2 rounded-full z-20 hover:scale-110 transition-transform shadow-lg">
                           <Edit2 size={14} />
                       </button>
                   </div>
                   
                   <div className="text-center md:text-left mb-2 flex-1">
                       <h1 className="text-3xl font-display font-bold text-white mb-1 flex items-center justify-center md:justify-start gap-2">
                           {user.name}
                           <Shield size={18} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                       </h1>
                       <div className="flex items-center justify-center md:justify-start gap-3 text-sm">
                           <span className={`px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${getRankColor(user.rankTier)}`}>
                               {user.rankTier} Tier
                           </span>
                           <span className="text-slate-400 font-mono">ID: {user.id.toUpperCase()}</span>
                       </div>
                   </div>

                   <div className="flex gap-3 mt-4 md:mt-0 w-full md:w-auto">
                       <button className="flex-1 md:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium transition-all">
                           Edit Profile
                       </button>
                       <button onClick={onLogout} className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl border border-red-500/20 transition-all">
                           <LogOut size={20} />
                       </button>
                   </div>
               </div>
           </div>
       </header>

       {/* Navigation Tabs */}
       <div className="flex items-center gap-8 border-b border-white/10 mb-8 overflow-x-auto">
           {['overview', 'history', 'settings'].map((tab) => (
               <button 
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`pb-4 text-sm font-bold capitalize transition-colors relative whitespace-nowrap ${
                      activeTab === tab ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
               >
                   {tab}
                   {activeTab === tab && <motion.div layoutId="profileTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-gold-500" />}
               </button>
           ))}
       </div>

       <motion.div 
          key={activeTab}
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
       >
           {/* OVERVIEW TAB */}
           {activeTab === 'overview' && (
               <>
                  {/* Left Column - Stats */}
                  <motion.div variants={itemVariants} className="md:col-span-2 space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                              { label: 'Total Games', value: '142', icon: Trophy, color: 'text-purple-400' },
                              { label: 'Win Rate', value: '68%', icon: TrendingUp, color: 'text-green-400' },
                              { label: 'Current Streak', value: '4 🔥', icon: Zap, color: 'text-orange-400' },
                              { label: 'Total Earnings', value: '1.2M', icon: Wallet, color: 'text-gold-400' },
                          ].map((stat, idx) => (
                              <div key={idx} className="glass-panel p-4 rounded-2xl border border-white/5">
                                  <stat.icon className={`mb-3 ${stat.color}`} size={24} />
                                  <div className="text-2xl font-bold text-white font-display">{stat.value}</div>
                                  <div className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</div>
                              </div>
                          ))}
                      </div>

                      <div className="glass-panel p-6 rounded-2xl">
                          <h3 className="text-lg font-bold text-white mb-4">Performance Analytics</h3>
                          <div className="h-48 flex items-end justify-between gap-2">
                              {[30, 45, 25, 60, 75, 50, 80].map((h, i) => (
                                  <div key={i} className="w-full bg-royal-800 rounded-t-lg relative group">
                                      <motion.div 
                                        initial={{ height: 0 }}
                                        animate={{ height: `${h}%` }}
                                        transition={{ duration: 1, delay: i * 0.1 }}
                                        className="absolute bottom-0 w-full bg-gradient-to-t from-gold-600 to-gold-400 rounded-t-lg opacity-80 group-hover:opacity-100 transition-opacity"
                                      />
                                  </div>
                              ))}
                          </div>
                          <div className="flex justify-between mt-2 text-xs text-slate-500 font-mono">
                              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                          </div>
                      </div>
                  </motion.div>

                  {/* Right Column - Balance & quick actions */}
                  <motion.div variants={itemVariants} className="md:col-span-1 space-y-6">
                      <div className="glass-panel p-6 rounded-2xl bg-gradient-to-br from-royal-900 to-black border border-gold-500/20 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-5">
                             <CreditCard size={120} />
                          </div>
                          <div className="relative z-10">
                              <p className="text-sm text-slate-400 mb-1">Available Balance</p>
                              <h2 className="text-4xl font-display font-bold text-white mb-6">
                                  {user.balance.toLocaleString()} <span className="text-lg text-gold-400">FCFA</span>
                              </h2>
                              <div className="space-y-3">
                                  <button 
                                    onClick={handleDeposit}
                                    className="w-full py-3 bg-gold-500 text-black font-bold rounded-xl hover:bg-gold-400 transition-colors"
                                  >
                                      Deposit
                                  </button>
                                  <button 
                                    onClick={handleWithdraw}
                                    className="w-full py-3 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-colors border border-white/10"
                                  >
                                      Withdraw
                                  </button>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-4 rounded-2xl border border-dashed border-white/10 text-center">
                          <p className="text-sm text-slate-400 mb-2">Referral Code</p>
                          <div className="bg-black/40 p-3 rounded-lg font-mono text-gold-400 font-bold text-lg mb-2">
                              AMARA-2024
                          </div>
                          <p className="text-xs text-slate-500">Share to earn 500 FCFA per friend</p>
                      </div>
                  </motion.div>
               </>
           )}

           {/* HISTORY TAB */}
           {activeTab === 'history' && (
               <motion.div variants={itemVariants} className="md:col-span-3">
                   <div className="glass-panel rounded-2xl overflow-hidden">
                       <table className="w-full text-left">
                           <thead className="bg-royal-800/50 text-xs uppercase text-slate-500 font-medium">
                               <tr>
                                   <th className="p-4">Type</th>
                                   <th className="p-4">Date</th>
                                   <th className="p-4">Status</th>
                                   <th className="p-4 text-right">Amount</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-white/5">
                               {MOCK_TRANSACTIONS.map((tx) => (
                                   <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                                       <td className="p-4">
                                           <div className="flex items-center gap-3">
                                               <div className={`p-2 rounded-lg ${
                                                   tx.type === 'deposit' || tx.type === 'winnings' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                               }`}>
                                                   {tx.type === 'deposit' ? <CreditCard size={16} /> : 
                                                    tx.type === 'winnings' ? <Trophy size={16} /> : <TrendingUp size={16} />}
                                               </div>
                                               <span className="capitalize font-medium text-slate-300">{tx.type}</span>
                                           </div>
                                       </td>
                                       <td className="p-4 text-sm text-slate-500 font-mono">{tx.date}</td>
                                       <td className="p-4">
                                           <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                               tx.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                           }`}>
                                               {tx.status}
                                           </span>
                                       </td>
                                       <td className={`p-4 text-right font-mono font-bold ${
                                           tx.amount > 0 ? 'text-green-400' : 'text-slate-200'
                                       }`}>
                                           {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} FCFA
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               </motion.div>
           )}
           
           {/* SETTINGS TAB */}
           {activeTab === 'settings' && (
               <motion.div variants={itemVariants} className="md:col-span-3">
                   <div className="glass-panel p-8 rounded-2xl text-center text-slate-400">
                       <Settings size={48} className="mx-auto mb-4 opacity-50" />
                       <h3 className="text-xl text-white font-bold mb-2">Account Settings</h3>
                       <p>Security, Notifications, and Language preferences coming soon.</p>
                   </div>
               </motion.div>
           )}
       </motion.div>
    </div>
  );
};

function Zap(props: any) {
    return <TrendingUp {...props} /> 
}