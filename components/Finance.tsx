import React, { useState, useEffect } from 'react';
import { User, Transaction } from '../types';
import { getUserTransactions, addUserTransaction } from '../services/firebase';
import { initiateFapshiPayment } from '../services/fapshi';
import { ArrowUpRight, ArrowDownLeft, Wallet, History, CreditCard, ChevronRight, Smartphone, Building, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../services/i18n';

interface FinanceProps {
  user: User;
  onTopUp: () => void;
}

export const Finance: React.FC<FinanceProps> = ({ user, onTopUp }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<'mtn' | 'orange'>('mtn');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Real Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Fetch Transactions on Mount
  useEffect(() => {
      const fetchHistory = async () => {
          if (user.id.startsWith('guest-')) return;
          const history = await getUserTransactions(user.id);
          setTransactions(history);
      };
      fetchHistory();
  }, [user.id, activeTab]);

  const handleDeposit = async () => {
      if(!amount) return;
      const depositAmount = parseInt(amount);
      if(depositAmount < 100) {
          alert("Minimum deposit is 100 FCFA");
          return;
      }

      setIsLoading(true);
      
      const response = await initiateFapshiPayment(depositAmount, user);
      
      setIsLoading(false);
      
      if (response && response.link) {
          setPaymentLink(response.link);
          window.open(response.link, '_blank');
          
          // --- SIMULATE PAYMENT CONFIRMATION ---
          // This is for demonstration to show the user the flow works without real money
          setTimeout(async () => {
              if (!user.id.startsWith('guest-')) {
                  await addUserTransaction(user.id, {
                      type: 'deposit',
                      amount: depositAmount,
                      status: 'completed',
                      date: new Date().toISOString()
                  });
              }
              onTopUp(); // Refresh balance in parent
              setShowSuccess(true);
              setPaymentLink(null);
              setAmount('');
              
              // Refresh local history
              const history = await getUserTransactions(user.id);
              setTransactions(history);
              
              // Hide success message after 3s
              setTimeout(() => setShowSuccess(false), 3000);
          }, 3000); 
      } else {
          alert("Failed to initiate payment. Please try again.");
      }
  };

  const handleWithdraw = async () => {
      if(!amount || !phone) return;
      if (Number(amount) > user.balance) return;

      setIsLoading(true);
      
      // Simulate API Call
      setTimeout(async () => {
          setIsLoading(false);
          if (!user.id.startsWith('guest-')) {
              await addUserTransaction(user.id, {
                  type: 'withdrawal',
                  amount: -Number(amount),
                  status: 'completed',
                  date: new Date().toISOString()
              });
          }
          alert('Withdrawal processed successfully! Funds sent to ' + phone);
          setAmount('');
          // Refresh transactions
          const history = await getUserTransactions(user.id);
          setTransactions(history);
      }, 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto min-h-screen pb-24 md:pb-6 relative">
       
       {/* SUCCESS TOAST */}
       <AnimatePresence>
           {showSuccess && (
               <motion.div 
                   initial={{ y: -50, opacity: 0 }}
                   animate={{ y: 20, opacity: 1 }}
                   exit={{ y: -50, opacity: 0 }}
                   className="fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-royal-950 px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2"
               >
                   <CheckCircle size={20} />
                   Deposit Successful! Balance Updated.
               </motion.div>
           )}
       </AnimatePresence>

       <header className="mb-8">
           <h1 className="text-3xl font-display font-bold text-white mb-2">{t('nav_wallet')}</h1>
           <p className="text-slate-400">{t('manage_funds')}</p>
       </header>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* LEFT COLUMN: WALLET CARD & ACTIONS */}
           <div className="lg:col-span-2 space-y-6">
               
               {/* Digital Card */}
               <div className="relative h-56 rounded-3xl overflow-hidden shadow-2xl transition-transform hover:scale-[1.01]">
                   <div className="absolute inset-0 bg-gradient-to-br from-royal-800 to-black z-0"></div>
                   <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 z-0"></div>
                   {/* Gold sheen */}
                   <div className="absolute -top-24 -right-24 w-64 h-64 bg-gold-500/20 rounded-full blur-3xl"></div>
                   
                   <div className="relative z-10 p-8 flex flex-col justify-between h-full">
                       <div className="flex justify-between items-start">
                           <div>
                               <div className="text-xs text-gold-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                                   <Wallet size={14} /> {t('vantage_vault')}
                               </div>
                               <div className="text-slate-400 text-sm font-mono tracking-wider">**** **** **** 8842</div>
                           </div>
                           <div className="text-right">
                               <div className="font-display font-black text-xl text-white italic">VISA</div>
                               <div className="text-[10px] text-slate-500">Virtual Debit</div>
                           </div>
                       </div>

                       <div>
                           <div className="text-slate-400 text-xs mb-1">{t('balance_label')}</div>
                           <div className="text-4xl font-display font-bold text-white tracking-tight">
                               {user.balance.toLocaleString()} <span className="text-lg text-gold-500 font-sans">FCFA</span>
                           </div>
                       </div>
                   </div>
               </div>

               {/* Action Tabs */}
               <div className="bg-royal-900/50 border border-white/5 rounded-2xl p-1 flex">
                   {['deposit', 'withdraw', 'history'].map(tab => (
                       <button
                           key={tab}
                           onClick={() => { setActiveTab(tab as any); setPaymentLink(null); }}
                           className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all capitalize ${
                               activeTab === tab 
                               ? 'bg-royal-800 text-white shadow-lg' 
                               : 'text-slate-500 hover:text-slate-300'
                           }`}
                       >
                           {tab === 'deposit' && t('deposit')}
                           {tab === 'withdraw' && t('withdraw')}
                           {tab === 'history' && t('history')}
                       </button>
                   ))}
               </div>

               {/* TAB CONTENT */}
               <div className="glass-panel p-6 rounded-2xl min-h-[400px]">
                   <AnimatePresence mode="wait">
                       
                       {/* DEPOSIT FORM */}
                       {activeTab === 'deposit' && (
                           <motion.div 
                               key="deposit"
                               initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                               className="space-y-6"
                           >
                               <div className="flex items-center gap-4 mb-6">
                                   <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                                       <ArrowDownLeft size={24} />
                                   </div>
                                   <div>
                                       <h3 className="text-lg font-bold text-white">{t('deposit_funds')}</h3>
                                       <p className="text-sm text-slate-400">Secured by Fapshi Payment Gateway</p>
                                   </div>
                               </div>

                               {!paymentLink ? (
                                   <>
                                       <div className="grid grid-cols-2 gap-4">
                                           <button 
                                               onClick={() => setProvider('mtn')}
                                               className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                                                   provider === 'mtn' ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/5 hover:bg-white/5'
                                               }`}
                                           >
                                               <div className="w-8 h-8 rounded-full bg-[#ffcc00] flex items-center justify-center text-black font-black text-xs">MTN</div>
                                               <span className={`text-sm font-bold ${provider === 'mtn' ? 'text-yellow-400' : 'text-slate-400'}`}>MTN MoMo</span>
                                           </button>
                                           <button 
                                               onClick={() => setProvider('orange')}
                                               className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                                                   provider === 'orange' ? 'border-orange-500 bg-orange-500/10' : 'border-white/5 hover:bg-white/5'
                                               }`}
                                           >
                                               <div className="w-8 h-8 rounded-full bg-[#ff6600] flex items-center justify-center text-white font-black text-xs">OM</div>
                                               <span className={`text-sm font-bold ${provider === 'orange' ? 'text-orange-500' : 'text-slate-400'}`}>Orange Money</span>
                                           </button>
                                       </div>

                                       <div className="space-y-4">
                                           <div>
                                               <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('amount')} (FCFA)</label>
                                               <div className="relative">
                                                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">FCFA</span>
                                                   <input 
                                                       type="number" 
                                                       value={amount}
                                                       onChange={e => setAmount(e.target.value)}
                                                       className="w-full bg-royal-950 border border-white/10 rounded-xl py-4 pl-16 pr-4 text-white font-mono font-bold focus:outline-none focus:border-gold-500 transition-colors"
                                                       placeholder="5,000"
                                                   />
                                               </div>
                                               <div className="flex gap-2 mt-2">
                                                   {[1000, 5000, 10000, 25000].map(val => (
                                                       <button 
                                                           key={val}
                                                           onClick={() => setAmount(val.toString())}
                                                           className="px-3 py-1 rounded-lg bg-white/5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                                                       >
                                                           +{val.toLocaleString()}
                                                       </button>
                                                   ))}
                                               </div>
                                           </div>

                                           <button 
                                               onClick={handleDeposit}
                                               disabled={isLoading || !amount}
                                               className="w-full py-4 bg-green-500 hover:bg-green-400 text-royal-900 font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                           >
                                               {isLoading ? <RefreshCw className="animate-spin" /> : <ArrowDownLeft />}
                                               {isLoading ? t('processing') : t('proceed_payment')}
                                           </button>
                                       </div>
                                   </>
                               ) : (
                                   <div className="text-center py-8">
                                       <div className="w-16 h-16 bg-gold-500/20 text-gold-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                           <Smartphone size={32} />
                                       </div>
                                       <h3 className="text-xl font-bold text-white mb-2">{t('payment_initiated')}</h3>
                                       <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
                                           Confirm the prompt on your phone. <br/>
                                           <span className="text-xs text-slate-500">(Simulation: Wait 3 seconds)</span>
                                       </p>
                                       <div className="flex flex-col gap-3">
                                            <a 
                                                href={paymentLink} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="w-full py-3 bg-gold-500 text-royal-900 font-bold rounded-xl hover:bg-gold-400 flex items-center justify-center gap-2"
                                            >
                                                <ExternalLink size={18} /> {t('open_payment')}
                                            </a>
                                            <button 
                                                onClick={() => setPaymentLink(null)}
                                                className="text-slate-400 text-sm hover:text-white"
                                            >
                                                {t('cancel_pay')}
                                            </button>
                                       </div>
                                   </div>
                               )}
                           </motion.div>
                       )}

                       {/* WITHDRAW FORM */}
                       {activeTab === 'withdraw' && (
                           <motion.div 
                               key="withdraw"
                               initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                               className="space-y-6"
                           >
                               <div className="flex items-center gap-4 mb-6">
                                   <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
                                       <ArrowUpRight size={24} />
                                   </div>
                                   <div>
                                       <h3 className="text-lg font-bold text-white">{t('withdraw_funds')}</h3>
                                       <p className="text-sm text-slate-400">Cash out to your mobile wallet</p>
                                   </div>
                               </div>

                               <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl mb-6 flex gap-3">
                                   <Building className="text-yellow-500 flex-shrink-0" size={20} />
                                   <p className="text-xs text-yellow-200/80 leading-relaxed">
                                       Withdrawals are processed instantly. A standard carrier fee of 1.5% applies to all transactions.
                                   </p>
                               </div>

                               <div className="space-y-4">
                                   <div>
                                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('amount')} (FCFA)</label>
                                       <div className="relative">
                                           <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">FCFA</span>
                                           <input 
                                               type="number" 
                                               value={amount}
                                               onChange={e => setAmount(e.target.value)}
                                               className="w-full bg-royal-950 border border-white/10 rounded-xl py-4 pl-16 pr-4 text-white font-mono font-bold focus:outline-none focus:border-gold-500 transition-colors"
                                               placeholder="0"
                                           />
                                       </div>
                                       <div className="flex justify-between mt-2 text-xs">
                                           <span className="text-slate-500">Available: {user.balance.toLocaleString()} FCFA</span>
                                           <button onClick={() => setAmount(user.balance.toString())} className="text-gold-400 font-bold uppercase">Max</button>
                                       </div>
                                   </div>

                                   <div>
                                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('send_to')}</label>
                                       <div className="relative">
                                           <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                           <input 
                                               type="tel" 
                                               value={phone}
                                               onChange={e => setPhone(e.target.value)}
                                               className="w-full bg-royal-950 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white font-mono focus:outline-none focus:border-gold-500 transition-colors"
                                               placeholder="6XX XXX XXX"
                                           />
                                       </div>
                                   </div>

                                   <button 
                                       onClick={handleWithdraw}
                                       disabled={isLoading || !amount || !phone || Number(amount) > user.balance}
                                       className="w-full py-4 bg-white text-royal-900 font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                   >
                                       {isLoading ? <RefreshCw className="animate-spin" /> : <ArrowUpRight />}
                                       {isLoading ? t('processing') : t('withdraw_cash')}
                                   </button>
                               </div>
                           </motion.div>
                       )}

                        {/* HISTORY TAB */}
                        {activeTab === 'history' && (
                           <motion.div 
                               key="history"
                               initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                           >
                               <h3 className="text-lg font-bold text-white mb-4">{t('recent_transactions')}</h3>
                               {transactions.length > 0 ? (
                                   <div className="space-y-3">
                                       {transactions.map((tx) => (
                                           <div key={tx.id} className="flex justify-between items-center p-4 bg-royal-950/50 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2.5 rounded-full ${
                                                        tx.type === 'deposit' || tx.type === 'winnings' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                                    }`}>
                                                        {tx.type === 'deposit' ? <ArrowDownLeft size={16} /> : 
                                                         tx.type === 'withdrawal' ? <ArrowUpRight size={16} /> :
                                                         tx.type === 'winnings' ? <Wallet size={16} /> : <CreditCard size={16} />}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-white capitalize">{tx.type}</div>
                                                        <div className="text-xs text-slate-500">{tx.date}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`font-mono font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                                                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                                    </div>
                                                    <div className={`text-[10px] uppercase font-bold ${
                                                        tx.status === 'completed' ? 'text-green-600' : 'text-yellow-600'
                                                    }`}>{tx.status}</div>
                                                </div>
                                           </div>
                                       ))}
                                   </div>
                               ) : (
                                   <div className="p-8 text-center text-slate-500 text-sm">
                                       No transactions found.
                                   </div>
                               )}
                           </motion.div>
                       )}

                   </AnimatePresence>
               </div>
           </div>

           {/* RIGHT COLUMN: INFO */}
           <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-gradient-to-b from-royal-800 to-royal-900 border border-white/5">
                    <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                        <History size={18} className="text-gold-400" /> {t('quick_stats')}
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center pb-4 border-b border-white/5">
                            <span className="text-sm text-slate-400">{t('total_deposited')}</span>
                            <span className="font-mono text-white">
                                {transactions.filter(t => t.type === 'deposit').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()} FCFA
                            </span>
                        </div>
                        <div className="flex justify-between items-center pb-4 border-b border-white/5">
                            <span className="text-sm text-slate-400">{t('total_withdrawn')}</span>
                            <span className="font-mono text-white">
                                {Math.abs(transactions.filter(t => t.type === 'withdrawal').reduce((acc, curr) => acc + curr.amount, 0)).toLocaleString()} FCFA
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-400">{t('net_profit')}</span>
                            <span className="font-mono text-green-400">
                                {transactions.filter(t => t.type === 'winnings').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()} FCFA
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-2xl bg-royal-950/50 border border-dashed border-slate-700">
                    <h4 className="font-bold text-slate-300 text-sm mb-2">{t('need_help')}</h4>
                    <p className="text-xs text-slate-500 mb-4">Issues with a deposit or withdrawal? Our support team is available 24/7.</p>
                    <button 
                        onClick={() => window.open('https://wa.me/237657960690', '_blank')}
                        className="w-full py-2 bg-royal-800 hover:bg-royal-700 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                        {t('contact_support')}
                    </button>
                </div>
           </div>

       </div>
    </div>
  );
};