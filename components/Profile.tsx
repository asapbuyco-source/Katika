import React, { useState, useEffect } from 'react';
import { User, ViewState, Transaction } from '../types';
import { getUserTransactions, auth, triggerPasswordReset, updateUserEmail, deleteAccount } from '../services/firebase';
import { setSoundEnabled, getSoundEnabled, playSFX } from '../services/sound';
import { Settings, CreditCard, Trophy, TrendingUp, ChevronDown, LogOut, Edit2, Shield, Wallet, Bell, Lock, Globe, Volume2, HelpCircle, ChevronRight, Fingerprint, Smartphone, Moon, Sun, Languages, Camera, Check, X, Zap, CheckCircle, Mail, Key, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../services/i18n';
import { useTheme } from '../services/theme';

interface ProfileProps {
  user: User;
  onLogout: () => void;
  onUpdateProfile: (updates: Partial<User>) => void;
  onNavigate: (view: ViewState) => void;
}

// Explicitly define the allowed tab values
type ProfileTab = 'overview' | 'history' | 'settings';

const PRESET_AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Caleb',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Milo',
    'https://i.pravatar.cc/150?u=1',
    'https://i.pravatar.cc/150?u=2',
    'https://i.pravatar.cc/150?u=3',
];

export const Profile: React.FC<ProfileProps> = ({ user, onLogout, onUpdateProfile, onNavigate }) => {
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  // Ensure the state uses the ProfileTab union type
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Real Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState({
      totalGames: 0,
      winRate: 0,
      streak: 0,
      totalEarnings: 0
  });

  // Edit State
  const [tempName, setTempName] = useState(user.name);
  const [tempAvatar, setTempAvatar] = useState(user.avatar);
  
  // Settings State - Initialize with defaults or load later
  const [preferences, setPreferences] = useState({
      notifications: true,
      sound: getSoundEnabled(),
      marketing: false,
  });

  // Account Management State
  const [currentEmail, setCurrentEmail] = useState(auth.currentUser?.email || '');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');

  // Tabs Configuration - strictly typed
  const tabs: ProfileTab[] = ['overview', 'history', 'settings'];

  // Load Preferences from LocalStorage on Mount
  useEffect(() => {
      const savedPrefs = localStorage.getItem('vantage_profile_prefs');
      if (savedPrefs) {
          try {
              const parsed = JSON.parse(savedPrefs);
              // Ensure sound state is synced with the service source of truth
              parsed.sound = getSoundEnabled();
              setPreferences(parsed);
          } catch (e) {
              console.error("Failed to load preferences", e);
          }
      }
      
      // Sync email if changed elsewhere
      if (auth.currentUser?.email) setCurrentEmail(auth.currentUser.email);
  }, []);

  // Save Preferences to LocalStorage on Change
  useEffect(() => {
      localStorage.setItem('vantage_profile_prefs', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!isEditing) {
        setTempName(user.name);
        setTempAvatar(user.avatar);
    }
  }, [user, isEditing]);

  // Fetch Data for Profile
  useEffect(() => {
      const fetchData = async () => {
          if (user.id.startsWith('guest-')) return;
          
          try {
              const txs = await getUserTransactions(user.id);
              setTransactions(txs);

              // Calculate Stats
              const stakes = txs.filter(t => t.type === 'stake');
              const winnings = txs.filter(t => t.type === 'winnings');
              
              const totalGames = stakes.length;
              const totalWins = winnings.length;
              // Win rate calculation (simplistic)
              const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
              const totalEarnings = winnings.reduce((acc, curr) => acc + curr.amount, 0);

              // Calculate Streak (Consecutive wins in recent history)
              let streak = 0;
              let pendingWins = 0;
              
              // Transactions are sorted desc (newest first)
              for (const tx of txs) {
                   if (tx.type === 'winnings') {
                       pendingWins++;
                   } else if (tx.type === 'stake') {
                       if (pendingWins > 0) {
                           streak++;
                           pendingWins--; 
                       } else {
                           break; // Loss found
                       }
                   }
              }

              setStats({
                  totalGames,
                  winRate,
                  streak,
                  totalEarnings
              });

          } catch (e) {
              console.error("Failed to load profile stats", e);
          }
      };
      fetchData();
  }, [user.id]);

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
  };

  const togglePref = (key: keyof typeof preferences) => {
      const newVal = !preferences[key];
      setPreferences(prev => ({ ...prev, [key]: newVal }));
      
      if (key === 'sound') {
          setSoundEnabled(newVal as boolean);
          showToast(newVal ? 'Sound Effects Enabled' : 'Sound Effects Disabled');
      } else if (key === 'notifications') {
          showToast(newVal ? 'Push Notifications Enabled' : 'Push Notifications Disabled');
      } else if (key === 'marketing') {
          showToast(newVal ? 'Marketing Emails Subscribed' : 'Marketing Emails Unsubscribed');
      } else {
          playSFX('click');
      }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const lang = e.target.value as 'en' | 'fr';
      setLanguage(lang);
      playSFX('click');
      showToast(`Language changed to ${lang === 'en' ? 'English' : 'Français'}`);
  };

  // --- ACCOUNT HANDLERS ---

  const handlePasswordReset = async () => {
      if (!currentEmail) return alert("No email associated with this account.");
      playSFX('click');
      try {
          await triggerPasswordReset(currentEmail);
          showToast("Password reset email sent!");
      } catch (e: any) {
          showToast("Error: " + e.message);
      }
  };

  const handleChangeEmail = async () => {
      if (!newEmailInput.includes('@')) {
          alert("Please enter a valid email address.");
          return;
      }
      playSFX('click');
      try {
          await updateUserEmail(newEmailInput);
          setCurrentEmail(newEmailInput);
          setIsEditingEmail(false);
          showToast("Email updated successfully!");
      } catch (e: any) {
          console.error(e);
          showToast("Failed to update email. Re-login required.");
      }
  };

  const handleDeleteAccount = async () => {
      playSFX('click');
      if (!window.confirm("Are you sure? This action is permanent and cannot be undone. All funds and data will be lost.")) return;
      
      try {
          await deleteAccount();
          onLogout(); // Redirect to landing
      } catch (e: any) {
          console.error(e);
          showToast("Deletion failed: " + e.message);
      }
  };

  // ------------------------

  const handleSaveProfile = () => {
      playSFX('click');
      if (!tempName.trim()) {
          alert("Name cannot be empty");
          return;
      }
      onUpdateProfile({ name: tempName, avatar: tempAvatar });
      setIsEditing(false);
      showToast("Profile Updated Successfully");
  };

  const handleCancelEdit = () => {
      playSFX('click');
      setTempName(user.name);
      setTempAvatar(user.avatar);
      setIsEditing(false);
  };

  const getRankColor = (tier: string) => {
      switch(tier) {
          case 'Diamond': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
          case 'Gold': return 'text-gold-400 bg-gold-400/10 border-gold-400/20';
          case 'Silver': return 'text-slate-300 bg-slate-300/10 border-slate-300/20';
          default: return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      }
  };

  const formatEarnings = (amount: number) => {
      if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
      if (amount >= 1000) return (amount / 1000).toFixed(1) + 'k';
      return amount.toLocaleString();
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
    <div className="p-6 max-w-7xl mx-auto min-h-screen pb-24 md:pb-6 relative text-white">
       
       {/* TOAST NOTIFICATION */}
       <AnimatePresence>
           {toastMessage && (
               <motion.div 
                   initial={{ y: -100, x: '-50%', opacity: 0 }}
                   animate={{ y: 20, x: '-50%', opacity: 1 }}
                   exit={{ y: -100, x: '-50%', opacity: 0 }}
                   className="fixed top-0 left-1/2 z-50 bg-royal-800 border border-gold-500/50 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 min-w-max"
               >
                   <CheckCircle size={20} className="text-gold-400" />
                   <span className="font-bold text-sm">{toastMessage}</span>
               </motion.div>
           )}
       </AnimatePresence>

       {/* Profile Header */}
       <header className="relative mb-8 pt-10">
           {/* Banner/Cover */}
           <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-royal-800 via-royal-700 to-royal-800 rounded-2xl opacity-50 -z-10 overflow-hidden">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30"></div>
           </div>
           
           <div className="flex flex-col md:flex-row items-end md:items-center justify-between px-4 pb-4">
               <div className="flex flex-col md:flex-row items-center md:items-end gap-6 w-full">
                   
                   {/* Avatar Section */}
                   <div className="relative group">
                       <motion.div layout className="w-28 h-28 rounded-full border-4 border-royal-950 p-1 bg-royal-800 relative z-10 shadow-2xl overflow-hidden">
                           <img src={isEditing ? tempAvatar : user.avatar} alt="Profile" className="w-full h-full rounded-full object-cover" />
                           {isEditing && (
                               <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                   <Camera size={24} className="text-white opacity-80" />
                               </div>
                           )}
                       </motion.div>
                   </div>
                   
                   <div className="text-center md:text-left mb-2 flex-1 w-full md:w-auto">
                       {isEditing ? (
                           <div className="flex flex-col items-center md:items-start gap-2">
                               <input 
                                  value={tempName}
                                  onChange={(e) => setTempName(e.target.value)}
                                  className="text-3xl font-display font-bold text-white bg-black/30 border border-white/20 rounded-lg px-2 py-1 focus:border-gold-500 outline-none w-full max-w-[300px] text-center md:text-left"
                                  placeholder="Enter Name"
                               />
                               <div className="text-xs text-slate-400">ID: {user.id.toUpperCase()}</div>
                           </div>
                       ) : (
                           <>
                               <h1 className="text-3xl font-display font-bold text-white mb-1 flex items-center justify-center md:justify-start gap-2">
                                   {user.name}
                                   <Shield size={18} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                               </h1>
                               <div className="flex items-center justify-center md:justify-start gap-3 text-sm">
                                   <span className={`px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${getRankColor(user.rankTier)}`}>
                                       {user.rankTier} Tier
                                   </span>
                                   <span className="text-slate-400 font-mono flex items-center gap-1">
                                       ID: <span className="text-slate-200">{user.id.substring(0, 12)}...</span>
                                   </span>
                               </div>
                           </>
                       )}
                   </div>

                   <div className="flex gap-3 mt-4 md:mt-0 w-full md:w-auto">
                       {isEditing ? (
                           <>
                                <button onClick={handleSaveProfile} className="flex-1 md:flex-none px-6 py-3 bg-green-500 hover:bg-green-600 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg">
                                    <Check size={18} /> {t('save')}
                                </button>
                                <button onClick={handleCancelEdit} className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all flex items-center justify-center">
                                    <X size={20} />
                                </button>
                           </>
                       ) : (
                           <>
                                <button onClick={() => { setIsEditing(true); playSFX('click'); }} className="flex-1 md:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium transition-all text-sm flex items-center justify-center gap-2">
                                    <Edit2 size={16} /> {t('edit_profile')}
                                </button>
                                <button onClick={onLogout} className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl border border-red-500/20 transition-all flex items-center justify-center">
                                    <LogOut size={20} />
                                </button>
                           </>
                       )}
                   </div>
               </div>
           </div>

           {/* Avatar Picker Drawer */}
           <AnimatePresence>
               {isEditing && (
                   <motion.div 
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: 'auto', opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     className="overflow-hidden"
                   >
                       <div className="mt-6 p-4 bg-black/20 rounded-xl border border-white/5">
                           <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Choose Avatar</p>
                           <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                               {PRESET_AVATARS.map((avatar, i) => (
                                   <button 
                                      key={i}
                                      onClick={() => { setTempAvatar(avatar); playSFX('click'); }}
                                      className={`w-14 h-14 flex-shrink-0 rounded-full border-2 transition-all overflow-hidden relative ${
                                          tempAvatar === avatar ? 'border-gold-500 scale-110 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                                      }`}
                                   >
                                       <img src={avatar} className="w-full h-full object-cover" />
                                       {tempAvatar === avatar && (
                                           <div className="absolute inset-0 bg-gold-500/20 flex items-center justify-center">
                                               <Check size={16} className="text-white drop-shadow-md" />
                                           </div>
                                       )}
                                   </button>
                               ))}
                           </div>
                       </div>
                   </motion.div>
               )}
           </AnimatePresence>
       </header>

       {/* Navigation Tabs */}
       <div className="flex items-center gap-8 border-b border-white/10 mb-8 overflow-x-auto">
           {tabs.map((tab) => (
               <button 
                  key={tab}
                  onClick={() => { setActiveTab(tab); playSFX('click'); }}
                  className={`pb-4 text-sm font-bold capitalize transition-colors relative whitespace-nowrap px-2 ${
                      activeTab === tab ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
               >
                   {tab === 'overview' && t('recent_activity')}
                   {tab === 'history' && t('history')}
                   {tab === 'settings' && t('settings')}
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
                                  { label: t('total_games'), value: stats.totalGames.toString(), icon: Trophy, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
                                  { label: t('win_rate'), value: `${stats.winRate}%`, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
                                  { label: t('current_streak'), value: `${stats.streak} 🔥`, icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                                  { label: t('total_earnings'), value: formatEarnings(stats.totalEarnings), icon: Wallet, color: 'text-gold-400', bg: 'bg-gold-500/10', border: 'border-gold-500/20' },
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
                                  <h3 className="text-lg font-bold text-white">{t('performance_analytics')}</h3>
                                  <select className="bg-black/30 text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 outline-none">
                                      <option>Last 7 Days</option>
                                      <option>Last 30 Days</option>
                                  </select>
                              </div>
                              <div className="h-48 flex items-end justify-between gap-3 relative z-10 px-2">
                                  {/* Dummy Chart Data for Visual */}
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
                                      <p className="text-sm text-slate-400">{t('balance_label')}</p>
                                      <div className="p-2 bg-gold-500/10 rounded-lg">
                                          <Shield size={16} className="text-gold-400"/>
                                      </div>
                                  </div>
                                  <h2 className="text-4xl font-display font-bold text-white mb-6">
                                      {user.balance.toLocaleString()} <span className="text-lg text-gold-400">FCFA</span>
                                  </h2>
                                  <div className="space-y-3">
                                      <button 
                                        onClick={() => { onNavigate('finance'); playSFX('click'); }}
                                        className="w-full py-3.5 bg-gold-500 text-black font-bold rounded-xl hover:bg-gold-400 transition-all shadow-[0_0_20px_rgba(251,191,36,0.2)] hover:shadow-[0_0_30px_rgba(251,191,36,0.4)] active:scale-95 flex items-center justify-center gap-2"
                                      >
                                          <Wallet size={18} /> {t('deposit')}
                                      </button>
                                      <button 
                                        onClick={() => { onNavigate('finance'); playSFX('click'); }}
                                        className="w-full py-3.5 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-colors border border-white/10 flex items-center justify-center gap-2"
                                      >
                                          <CreditCard size={18} /> {t('withdraw')}
                                      </button>
                                  </div>
                              </div>
                          </div>
                          
                          <div className="p-5 rounded-2xl border border-dashed border-white/10 text-center bg-royal-900/30">
                              <p className="text-sm text-slate-400 mb-2 font-medium">{t('referral_code')}</p>
                              <div className="bg-black/40 p-3 rounded-xl font-mono text-gold-400 font-bold text-lg mb-3 tracking-widest border border-white/5 select-all">
                                  {user.name.toUpperCase().substring(0,5)}-2024
                              </div>
                              <p className="text-xs text-slate-500">{t('share_earn')} <span className="text-white font-bold">500 FCFA</span> {t('per_friend')}</p>
                          </div>
                      </motion.div>
                   </>
               )}

               {/* HISTORY TAB */}
               {activeTab === 'history' && (
                   <motion.div variants={itemVariants} className="md:col-span-3">
                       <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
                           <div className="p-4 border-b border-white/5 flex justify-between items-center bg-royal-900/50">
                               <h3 className="font-bold text-white">{t('transaction_type')}</h3>
                               <button className="text-xs text-gold-400 font-bold uppercase hover:text-white">Export CSV</button>
                           </div>
                           <div className="overflow-x-auto">
                               {transactions.length > 0 ? (
                                   <table className="w-full text-left whitespace-nowrap">
                                       <thead className="bg-royal-950/50 text-xs uppercase text-slate-500 font-medium">
                                           <tr>
                                               <th className="p-4">{t('transaction_type')}</th>
                                               <th className="p-4">Reference ID</th>
                                               <th className="p-4">{t('date_time')}</th>
                                               <th className="p-4">{t('status')}</th>
                                               <th className="p-4 text-right">{t('amount')}</th>
                                           </tr>
                                       </thead>
                                       <tbody className="divide-y divide-white/5">
                                           {transactions.map((tx) => (
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
                               ) : (
                                   <div className="p-12 text-center text-slate-500 text-sm">
                                       No transactions found. Start playing to build your history!
                                   </div>
                               )}
                           </div>
                       </div>
                   </motion.div>
               )}
               
               {/* SETTINGS TAB */}
               {activeTab === 'settings' && (
                   <>
                       <motion.div variants={itemVariants} className="md:col-span-2 space-y-6">
                           
                           {/* Security Section (MODIFIED) */}
                           <section className="glass-panel p-6 rounded-2xl border border-white/5">
                               <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                   <Shield className="text-gold-400" size={20} /> {t('security_access')}
                               </h3>
                               
                               <div className="space-y-4">
                                   {/* Email Address */}
                                   <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5 gap-4">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Mail size={20}/></div>
                                           <div className="w-full">
                                               <div className="font-bold text-white text-sm">{t('email_label')}</div>
                                               {isEditingEmail ? (
                                                   <input 
                                                      value={newEmailInput}
                                                      onChange={(e) => setNewEmailInput(e.target.value)}
                                                      className="mt-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-gold-500 w-full"
                                                      placeholder="new@email.com"
                                                   />
                                               ) : (
                                                   <div className="text-xs text-slate-500 truncate max-w-[200px]">{currentEmail}</div>
                                               )}
                                           </div>
                                       </div>
                                       {isEditingEmail ? (
                                           <div className="flex gap-2">
                                               <button onClick={handleChangeEmail} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 transition-colors">{t('save')}</button>
                                               <button onClick={() => { setIsEditingEmail(false); setNewEmailInput(''); }} className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs font-bold hover:bg-white/20 transition-colors">{t('cancel')}</button>
                                           </div>
                                       ) : (
                                           <button onClick={() => { setIsEditingEmail(true); setNewEmailInput(currentEmail); }} className="text-xs font-bold text-gold-400 hover:text-white px-3 py-1.5 bg-gold-500/10 hover:bg-gold-500/20 rounded-lg transition-colors whitespace-nowrap">
                                               Change Email
                                           </button>
                                       )}
                                   </div>

                                   {/* Password Reset */}
                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Key size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">{t('pass_label')}</div>
                                               <div className="text-xs text-slate-500">Secure your account</div>
                                           </div>
                                       </div>
                                       <button onClick={handlePasswordReset} className="text-xs font-bold text-white hover:text-gold-400 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                                           Reset via Email
                                       </button>
                                   </div>

                                   {/* Delete Account */}
                                   <div className="flex items-center justify-between p-4 bg-red-500/5 rounded-xl border border-red-500/20">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-red-500/10 rounded-lg text-red-500"><Trash2 size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">Delete Account</div>
                                               <div className="text-xs text-slate-500">Permanent action</div>
                                           </div>
                                       </div>
                                       <button onClick={handleDeleteAccount} className="text-xs font-bold text-red-400 hover:text-white px-3 py-1.5 bg-red-500/10 hover:bg-red-500 rounded-lg transition-colors border border-red-500/20">
                                           Delete
                                       </button>
                                   </div>
                               </div>
                           </section>

                           {/* App Preferences */}
                           <section className="glass-panel p-6 rounded-2xl border border-white/5">
                               <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                   <Settings className="text-purple-400" size={20} /> {t('app_preferences')}
                               </h3>
                               
                               <div className="space-y-4">
                                   {/* Theme Toggle */}
                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400">
                                              {theme === 'dark' ? <Moon size={20}/> : <Sun size={20}/>}
                                           </div>
                                           <div>
                                               <div className="font-bold text-white text-sm">Appearance</div>
                                               <div className="text-xs text-slate-500">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</div>
                                           </div>
                                       </div>
                                       <button 
                                          onClick={() => { toggleTheme(); playSFX('click'); }}
                                          className={`w-12 h-6 rounded-full transition-colors relative ${theme === 'light' ? 'bg-gold-500' : 'bg-royal-800'}`}
                                       >
                                           <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${theme === 'light' ? 'translate-x-6' : 'translate-x-0'}`} />
                                       </button>
                                   </div>

                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Globe size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">{t('language')}</div>
                                               <div className="text-xs text-slate-500">App interface language</div>
                                           </div>
                                       </div>
                                       <select 
                                          value={language}
                                          onChange={handleLanguageChange}
                                          className="bg-royal-950 text-xs font-bold text-white border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-gold-500 transition-colors"
                                       >
                                           <option value="en">English</option>
                                           <option value="fr">Français</option>
                                       </select>
                                   </div>

                                   <div className="flex items-center justify-between p-4 bg-royal-900/50 rounded-xl border border-white/5">
                                       <div className="flex items-center gap-3">
                                           <div className="p-2 bg-royal-800 rounded-lg text-slate-400"><Volume2 size={20}/></div>
                                           <div>
                                               <div className="font-bold text-white text-sm">{t('sound_effects')}</div>
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
                                   <Bell className="text-red-400" size={20} /> {t('notifications')}
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
                                       <span className="text-sm text-slate-300">{t('marketing_emails')}</span>
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
                                   <HelpCircle className="text-blue-400" size={20} /> {t('support')}
                               </h3>
                               <div className="space-y-2">
                                   <button 
                                     onClick={() => { onNavigate('help-center'); playSFX('click'); }}
                                     className="w-full text-left px-4 py-3 rounded-xl bg-royal-900/50 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors flex justify-between items-center"
                                   >
                                       {t('help_center')} <ChevronRight size={16} />
                                   </button>
                                   <button 
                                     onClick={() => { onNavigate('report-bug'); playSFX('click'); }}
                                     className="w-full text-left px-4 py-3 rounded-xl bg-royal-900/50 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors flex justify-between items-center"
                                   >
                                       {t('report_bug')} <ChevronRight size={16} />
                                   </button>
                                   <button 
                                     onClick={() => { onNavigate('terms'); playSFX('click'); }}
                                     className="w-full text-left px-4 py-3 rounded-xl bg-royal-900/50 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors flex justify-between items-center"
                                   >
                                       {t('terms')} <ChevronRight size={16} />
                                   </button>
                               </div>
                           </section>

                           {/* Version Info */}
                           <div className="text-center text-xs text-slate-600 font-mono">
                               Vantage App v1.4.3 (Build 20240320)
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