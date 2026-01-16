
import React, { useState } from 'react';
import { User, Transaction } from '../types';
import { MOCK_TRANSACTIONS } from '../services/mockData';
import { Settings, CreditCard, Trophy, TrendingUp, ChevronDown, LogOut, Edit2, Shield, Wallet, Bell, Lock, Globe, Volume2, HelpCircle, ChevronRight, Fingerprint, Smartphone, Moon, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProfileProps {
  user: User;
  onLogout: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'settings'>('overview');
  
  // Mock Settings State
  const [preferences, setPreferences] = useState({
      biometrics: true,
      notifications: true,
      sound: true,
      marketing: false,
      language: 'English'
  });

  const togglePref = (key: keyof typeof preferences) => {
      setPreferences(prev => ({ ...prev, [key]: !prev[key as keyof typeof preferences] }));
  };

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
           <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-royal-800 via-royal-700 to-royal-800 rounded-2xl opacity-50 -z-10 overflow-hidden">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30"></div>
           </div>
           
           <div className="flex flex-col md:flex-row items-end md:items-center justify-between px-4 pb-4">
               <div className="flex flex-col md:flex-row items-center md:items-end gap-6 w-full">
                   <div className="relative group">
                       <div className="w-28 h-28 rounded-full border-4 border-royal-950 p-1 bg-royal-800 relative z-10 shadow-2xl">
                           <img src={user.avatar} alt="Profile" className="w-full h-full rounded-full object-cover" />
                       </div>
                       <button className="absolute bottom-1 right-1 bg-gold-500 text-black p-2 rounded-full z-20 hover:scale-110 transition-transform shadow-lg border-2 border-royal-950">
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
                           <span className="text-slate-400 font-mono flex items-center gap-1">
                               ID: <span className="text-slate-200">{user.id.toUpperCase()}</span>
                           </span>
                       </div>
                   </div>

                   <div className="flex gap-3 mt-4 md:mt-0 w-full md:w-auto">
                       <button className="flex-1 md:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium transition-all text-sm">
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
                  className={`pb-4 text-sm font-bold capitalize transition-colors relative whitespace-nowrap px-2 ${
                      activeTab === tab ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
               >
                   {tab}
                   {activeTab === tab && (
                       <motion.div 
                           layoutId="profileTab" 
                           className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-gold-400 to-gold-600 shadow-[0_-2px_10px_rgba(251,191,36,0.5)]" 
                       />
                   )}
               </button>
           ))}
       </div>

       <AnimatePresence mode="wait">
           <motion.div 
              key={activeTab}
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: 10 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
           >
               {/* OVERVIEW TAB */}
               {activeTab === 'overview' && (
                   <>
                      {/* Left Column - Stats */}
                      <motion.div variants={itemVariants} className="md:col-span-2 space-y-6">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {[
                                  { label: 'Total Games', value: '142', icon: Trophy, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
                                  { label: 'Win Rate', value: '68%', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
                                  { label: 'Current Streak', value: '4 🔥', icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                                  { label: 'Total Earnings', value: '1.2M', icon: Wallet, color: 'text-gold-400', bg: 'bg-gold-500/10', border: 'border-gold-500/20' },
                              ].map((stat, idx) => (
                                  <div key={idx} className={`glass-panel p-4 rounded-2xl border ${stat.border} hover:bg-white/5 transition-colors`}>
                                      <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}>
                                          <stat.icon size={20} />
                                      </div>
                                      <div className="text-2xl font-bold text-white font-display">{stat.value}</div>
                                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{stat.label}</div>
                                  </div>
                              ))}
                          </div>

                          <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
                              <div className="flex justify-between items-center mb-6 relative z-10">
                                  <h3 className="text-lg font-bold text-white">Performance Analytics</h3>
                                  <select className="bg-black/30 text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 outline-none">
                                      <option>Last 7 Days</option>
                                      <option>Last 30 Days</option>
                                  </select>
                              </div>
                              <div className="h-48 flex items-end justify-between gap-3 relative z-10 px-2">
                                  {[30, 45, 25, 60, 75, 50, 80].map((h, i) => (
                                      <div key={i} className="w-full bg-royal-800/50 rounded-t-lg relative group">
                                          <motion.div 
                                            initial={{ height: 0 }}
                                            animate={{ height: `${h}%` }}
                                            transition={{ duration: 1, delay: i * 0.1, ease: "circOut" }}
                                            className="absolute bottom-0 w-full bg-gradient-to-t from-gold-600 to-gold-400 rounded-t-lg opacity-80 group-hover:opacity-100 transition-opacity shadow-[0_0_15px_rgba(251,191,36,0.2)]"
                                          />
                                          {/* Tooltip */}
                                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-royal-950 text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                              {h * 100}
                                          </div>
                                      </div>
                                  ))}
                              </div>
                              <div className="flex justify-between mt-4 text-xs text-slate-500 font-mono px-2">
                                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                              </div>
                          </div>
                      </motion.div>

                      {/* Right Column - Balance & quick actions */}
                      <motion.div variants={itemVariants} className="md:col-span-1 space-y-6">
                          <div className="glass-panel p-6 rounded-2xl bg-gradient-to-br from-royal-900 to-black border border-gold-500/20 relative overflow-hidden group">
                              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                 <CreditCard size={120} />
                              </div>
                              <div className="relative z-10">
                                  <div className="flex justify-between items-start mb-4">
                                      <p className="text-sm text-slate-400">Available Balance</p>
                                      <div className="p-2 bg-gold-500/10 rounded-lg">
                                          <Shield size={16} className="text-gold-400"/>
                                      </div>
                                  </div>
                                  <h2 className="text-4xl font-display font-bold text-white mb-6">
                                      {user.balance.toLocaleString()} <span className="text-lg text-gold-400">FCFA</span>
                                  </h2>
                                  <div className="space-y-3">
                                      <button 
                                        onClick={handleDeposit}
                                        className="w-full py-3.5 bg-gold-500 text-black font-bold rounded-xl hover:bg-gold-400 transition-all shadow-[0_0_20px_rgba(251,191,36,0.2)] hover:shadow-[0_0_30px_rgba(251,191,36,0.4)] active:scale-95 flex items-center justify-center gap-2"
                                      >
                                          <Wallet size={18} /> Deposit Funds
                                      </button>
                                      <button 
                                        onClick={handleWithdraw}
                                        className="w-full py-3.5 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-colors border border-white/10 flex items-center justify-center gap-2"
                                      >
                                          <CreditCard size={18} /> Withdraw
                                      </button>
                                  </div>
                              </div>
                          </div>
                          
                          <div className="p-5 rounded-2xl border border-dashed border-white/10 text-center bg-royal-900/30">
                              <p className="text-sm text-slate-400 mb-2 font-medium">Referral Code</p>
                              <div className="bg-black/40 p-3 rounded-xl font-mono text-gold-400 font-bold text-lg mb-3 tracking-widest border border-white/5 select-all">
                                  AMARA-2024
                              </div>
                              <p className="text-xs text-slate-500">Share to earn <span className="text-white font-bold">500 FCFA</span> per friend</p>
                          </div>
                      </motion.div>
                   </>
               )}

               {/* HISTORY TAB */}
               {activeTab === 'history' && (
                   <motion.div variants={itemVariants} className="md:col-span-3">
                       <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                           <div className="p-4 border-b border-white/5 flex justify-between items-center bg-royal-900/50">
                               <h3 className="font-bold text-white">Transaction History</h3>
                               <button className="text-xs text-gold-400 font-bold uppercase hover:text-white">Export CSV</button>
                           </div>
                           <div className="overflow-x-auto">
                               <table className="w-full text-left whitespace-nowrap">
                                   <thead className="bg-royal-950/50 text-xs uppercase text-slate-500 font-medium">
                                       <tr>
                                           <th className="p-4">Transaction Type</th>
                                           <th className="p-4">Reference ID</th>
                                           <th className="p-4">Date & Time</th>
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
                                                       <span className="capitalize font-bold text-slate-300">{tx.type}</span>
                                                   </div>
                                               </td>
                                               <td className="p-4 text-xs text-slate-500 font-mono uppercase">{tx.id}</td>
                                               <td className="p-4 text-sm text-slate-400">{tx.date}</td>
                                               <td className="p-4">
                                                   <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${
                                                       tx.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                                   }`}>
                                                       {tx.status}
                                                   </span>
                                               </td>
                                               <td className={`p-4 text-right font-mono font-bold text-sm ${
                                                   tx.amount > 0 ? 'text-green-400' : 'text-slate-200'
                                               }`}>
                                                   {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} FCFA
                                               </td>
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                           </div>
                       </div>
                   </motion.div>
               )}
               
               {/* SETTINGS TAB */}
               {activeTab === 'settings' && (
                   <>
                       <motion.div variants={itemVariants} className="md:col-span-2 space-y-6">
                           
                           {/* Security Section */}
                           <section className="glass-panel p-6 rounded-2xl border border-white/5">
                               <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                   <Shield className="text-gold-400" size={20} /> Security & Access
                               </h3>
                               
                               <div className="space-y-4">
                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Fingerprint size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">Biometric Login</div>
                                               <div className="text-xs text-slate-500">Use FaceID or Fingerprint to sign in</div>
                                           </div>
                                       </div>
                                       <button 
                                          onClick={() => togglePref('biometrics')}
                                          className={`w-12 h-6 rounded-full transition-colors relative ${preferences.biometrics ? 'bg-gold-500' : 'bg-royal-800'}`}
                                       >
                                           <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${preferences.biometrics ? 'translate-x-6' : 'translate-x-0'}`} />
                                       </button>
                                   </div>

                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Lock size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">Transaction PIN</div>
                                               <div className="text-xs text-slate-500">Change your 4-digit security code</div>
                                           </div>
                                       </div>
                                       <button className="text-xs font-bold text-gold-400 hover:text-white px-3 py-1.5 bg-gold-500/10 hover:bg-gold-500/20 rounded-lg transition-colors">
                                           Update
                                       </button>
                                   </div>

                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Smartphone size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">Two-Factor Authentication</div>
                                               <div className="text-xs text-slate-500">SMS verification for withdrawals</div>
                                           </div>
                                       </div>
                                       <span className="text-xs font-bold text-green-400 flex items-center gap-1">
                                           <Shield size={12} fill="currentColor" /> Enabled
                                       </span>
                                   </div>
                               </div>
                           </section>

                           {/* App Preferences */}
                           <section className="glass-panel p-6 rounded-2xl border border-white/5">
                               <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                   <Settings className="text-purple-400" size={20} /> App Preferences
                               </h3>
                               
                               <div className="space-y-4">
                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Globe size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">Language / Langue</div>
                                               <div className="text-xs text-slate-500">App interface language</div>
                                           </div>
                                       </div>
                                       <select 
                                          value={preferences.language}
                                          onChange={(e) => setPreferences({...preferences, language: e.target.value})}
                                          className="bg-royal-950 text-xs font-bold text-white border border-white/10 rounded-lg px-3 py-2 outline-none"
                                       >
                                           <option value="English">English</option>
                                           <option value="French">Français</option>
                                       </select>
                                   </div>

                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Volume2 size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">Sound Effects</div>
                                               <div className="text-xs text-slate-500">Game audio and UI sounds</div>
                                           </div>
                                       </div>
                                       <button 
                                          onClick={() => togglePref('sound')}
                                          className={`w-12 h-6 rounded-full transition-colors relative ${preferences.sound ? 'bg-gold-500' : 'bg-royal-800'}`}
                                       >
                                           <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${preferences.sound ? 'translate-x-6' : 'translate-x-0'}`} />
                                       </button>
                                   </div>
                               </div>
                           </section>

                       </motion.div>

                       <motion.div variants={itemVariants} className="md:col-span-1 space-y-6">
                           {/* Notifications */}
                           <section className="glass-panel p-6 rounded-2xl border border-white/5">
                               <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                   <Bell className="text-red-400" size={20} /> Notifications
                               </h3>
                               <div className="space-y-4">
                                   <div className="flex items-center justify-between">
                                       <span className="text-sm text-slate-300">Push Notifications</span>
                                       <button 
                                          onClick={() => togglePref('notifications')}
                                          className={`w-10 h-5 rounded-full transition-colors relative ${preferences.notifications ? 'bg-green-500' : 'bg-royal-800'}`}
                                       >
                                           <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${preferences.notifications ? 'translate-x-5' : 'translate-x-0'}`} />
                                       </button>
                                   </div>
                                   <div className="flex items-center justify-between">
                                       <span className="text-sm text-slate-300">Marketing Emails</span>
                                       <button 
                                          onClick={() => togglePref('marketing')}
                                          className={`w-10 h-5 rounded-full transition-colors relative ${preferences.marketing ? 'bg-green-500' : 'bg-royal-800'}`}
                                       >
                                           <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${preferences.marketing ? 'translate-x-5' : 'translate-x-0'}`} />
                                       </button>
                                   </div>
                               </div>
                           </section>

                           {/* Support */}
                           <section className="glass-panel p-6 rounded-2xl border border-white/5">
                               <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                   <HelpCircle className="text-blue-400" size={20} /> Support
                               </h3>
                               <div className="space-y-2">
                                   <button className="w-full text-left px-4 py-3 rounded-xl bg-royal-900/50 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors flex justify-between items-center">
                                       Help Center <ChevronRight size={16} />
                                   </button>
                                   <button className="w-full text-left px-4 py-3 rounded-xl bg-royal-900/50 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors flex justify-between items-center">
                                       Report a Bug <ChevronRight size={16} />
                                   </button>
                                   <button className="w-full text-left px-4 py-3 rounded-xl bg-royal-900/50 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors flex justify-between items-center">
                                       Terms of Service <ChevronRight size={16} />
                                   </button>
                               </div>
                           </section>

                           {/* Version Info */}
                           <div className="text-center text-xs text-slate-600 font-mono">
                               Vantage App v1.4.2 (Build 20240315)
                               <br />
                               Server: Cameroon-Central-1
                           </div>
                       </motion.div>
                   </>
               )}
           </motion.div>
       </AnimatePresence>
    </div>
  );
};

function Zap(props: any) {
    return <TrendingUp {...props} /> 
}
