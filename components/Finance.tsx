
import React, { useState, useEffect, useRef } from 'react';
import { User, Transaction } from '../types';
import { getUserTransactions, creditDepositIdempotent, auth } from '../services/firebase';
import { initiateFapshiPayment, checkPaymentStatus } from '../services/fapshi';
import { useSocket } from '../services/SocketContext';
import { ArrowUpRight, ArrowDownLeft, Wallet, History, CreditCard, ChevronRight, Smartphone, Building, RefreshCw, ExternalLink, CheckCircle, Info, ArrowRight, Shield } from 'lucide-react';
import { motion as originalMotion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../services/i18n';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

interface FinanceProps {
    user: User;
    onTopUp: (newBalance?: number) => void;
}

export const Finance: React.FC<FinanceProps> = ({ user, onTopUp }) => {
    const { t } = useLanguage();
    const { socket } = useSocket();
    const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
    const [amount, setAmount] = useState('');
    const [provider, setProvider] = useState<'mtn' | 'orange'>('mtn');
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [paymentLink, setPaymentLink] = useState<string | null>(null);
    const [transId, setTransId] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const pollIntervalRef = useRef<number | null>(null);
    // Track which transIds have already been credited (to avoid double-credit between
    // the server webhook path and the client polling path).
    const creditedTransIds = useRef<Set<string>>(new Set());
    // Task 20 Fix: Ref guard to prevent withdrawal spam
    const withdrawingRef = useRef(false);

    // Real Data State
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    // ── Fetch Transactions on Mount / tab change ─────────────────────────────
    useEffect(() => {
        const fetchHistory = async () => {
            if (user.id.startsWith('guest-')) return;
            const history = await getUserTransactions(user.id);
            setTransactions(history);
        };
        fetchHistory();
    }, [user.id, activeTab]);

    // ── Cleanup polling on unmount ───────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    // ── Server-push: listen for payment_confirmed socket event ───────────────
    // This fires when the Fapshi webhook hits the server, crediting the balance
    // server-side. The client just needs to refresh its UI — no Firestore write.
    useEffect(() => {
        if (!socket) return;

        const handlePaymentConfirmed = async ({ transId: confirmedTransId, amount: confirmedAmount }: { transId: string; amount: number }) => {
            // Mark as credited so the poller doesn't attempt a second credit
            creditedTransIds.current.add(confirmedTransId);

            // Stop the poller if it was running for this transId
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }

            // Trigger balance refresh via the Firestore listener in App.tsx
            onTopUp();

            // Show confirmation toast
            setShowSuccess(true);
            setPaymentLink(null);
            setTransId(null);
            setAmount('');
            setTimeout(() => setShowSuccess(false), 4000);

            // Refresh local history
            if (!user.id.startsWith('guest-')) {
                const history = await getUserTransactions(user.id);
                setTransactions(history);
            }
        };

        socket.on('payment_confirmed', handlePaymentConfirmed);
        return () => { socket.off('payment_confirmed', handlePaymentConfirmed); };
    }, [socket, user.id, onTopUp]);

    // Auto-detect MTN vs Orange from phone prefix (Cameroon prefixes)
    // MTN: 650-659, 670-679, 680-689 → starts with 65x or 67x or 68x
    // Orange: 690-699 → starts with 69x
    const detectCarrier = (phone: string): 'mtn' | 'orange' | null => {
        const cleaned = phone.replace(/\s/g, '');
        if (/^6[578]/.test(cleaned)) return 'mtn';
        if (/^69/.test(cleaned)) return 'orange';
        return null;
    };

    const handleDeposit = async () => {
        if (!amount) return;
        const depositAmount = parseInt(amount);
        if (depositAmount < 100) {
            setErrorMsg('Minimum deposit is 100 FCFA.');
            return;
        }

        // Calculate Fee (3%)
        const fee = Math.ceil(depositAmount * 0.03);
        const totalToPay = depositAmount + fee;

        setIsLoading(true);
        setErrorMsg(null);

        const response = await initiateFapshiPayment(totalToPay, user);

        setIsLoading(false);

        if (response && response.link) {
            setPaymentLink(response.link);
            setTransId(response.transId);
            window.open(response.link, '_blank');

            // Start Polling for Real Payment Status
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

            pollIntervalRef.current = window.setInterval(async () => {
                if (!response.transId) return;

                const status = await checkPaymentStatus(response.transId);

                if (status === 'SUCCESSFUL') {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;

                    if (!user.id.startsWith('guest-')) {
                        // Only credit client-side if the webhook hasn't already done it.
                        // creditDepositIdempotent uses a Firestore sentinel so even if both
                        // paths fire, only one credit is written.
                        if (!creditedTransIds.current.has(response.transId)) {
                            creditedTransIds.current.add(response.transId);
                            await creditDepositIdempotent(user.id, response.transId, depositAmount);
                        }
                    }

                    // Let the live subscribeToUser listener in App.tsx pick up the
                    // real Firestore balance automatically (Bug C2 fix — no stale value).
                    onTopUp();
                    setShowSuccess(true);
                    setPaymentLink(null);
                    setTransId(null);
                    setAmount('');

                    // Refresh local history
                    const history = await getUserTransactions(user.id);
                    setTransactions(history);

                    setTimeout(() => setShowSuccess(false), 4000);
                } else if (status === 'FAILED' || status === 'EXPIRED') {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                    setErrorMsg('Payment failed or expired. Please try again.');
                    setPaymentLink(null);
                    setTransId(null);
                }
            }, 5000); // Check every 5 seconds

            // Stop polling after 5 minutes
            setTimeout(() => {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            }, 300000);

        } else {
            setErrorMsg('Failed to initiate payment. Please check your connection.');
        }
    };

const handleWithdraw = async () => {
        // Task 20 Fix: Prevent spam clicks
        if (withdrawingRef.current) return;
        withdrawingRef.current = true;

        if (!amount || !phone) { setErrorMsg('Please fill in the amount and phone number.'); withdrawingRef.current = false; return; }
        const withdrawAmount = parseInt(amount);
        if (isNaN(withdrawAmount) || withdrawAmount < 1000) {
            setErrorMsg('Minimum withdrawal is 1,000FCFA.');
            withdrawingRef.current = false;
            return;
        }
        if (withdrawAmount > user.balance) { setErrorMsg('Insufficient balance for this withdrawal.'); withdrawingRef.current = false; return; }
        if (!/^6\d{8}$/.test(phone.replace(/\s/g, ''))) {
            setErrorMsg('Invalid phone number. Must start with 6 and be 9 digits.');
            withdrawingRef.current = false;
            return;
        }

        setIsLoading(true);
        setErrorMsg(null);

        try {
            const token = await auth.currentUser?.getIdToken();
            const rawUrl = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '');
            const PROXY_BASE = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
            const response = await fetch(`${PROXY_BASE}/api/pay/disburse`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ amount: withdrawAmount, phone: phone.replace(/\s/g, ''), userId: user.id })
            });
            const data = await response.json();

            if (!response.ok) {
                setErrorMsg(data.error || 'Withdrawal failed. Please try again.');
            } else {
                setShowSuccess(true);
                setAmount('');
                setPhone('');
                setTimeout(() => setShowSuccess(false), 4000);
                // Refresh transaction history
                const history = await getUserTransactions(user.id);
                setTransactions(history);
                onTopUp(); // triggers subscribeToUser to refresh balance
            }
        } catch (err) {
            setErrorMsg('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
            withdrawingRef.current = false;
        }
    };

    const cancelPayment = () => {
        setPaymentLink(null);
        setTransId(null);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };

    // Helper values for UI
    const inputAmount = parseInt(amount || '0');
    const fee = Math.ceil(inputAmount * 0.03);
    const total = inputAmount + fee;

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
                        {activeTab === 'deposit' ? '✅ Deposit Confirmed! Balance Updated.' : '✅ Withdrawal Submitted!'}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ERROR BANNER (L2 fix: replaces native alert()) */}
            <AnimatePresence>
                {errorMsg && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 20, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2 cursor-pointer"
                        onClick={() => setErrorMsg(null)}
                    >
                        <Info size={20} />
                        {errorMsg}
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

                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-slate-400 text-xs mb-1">{t('balance_label')} (Withdrawable)</div>
                                    <div className="text-4xl font-display font-bold text-white tracking-tight">
                                        {user.balance.toLocaleString()} <span className="text-lg text-gold-500 font-sans">FCFA</span>
                                    </div>
                                </div>
                                
                                {user.promoBalance !== undefined && user.promoBalance > 0 && (
                                    <div className="text-right">
                                        <div className="text-purple-300 text-xs mb-1 font-bold tracking-wider uppercase">Promo Balance</div>
                                        <div className="text-2xl font-display font-bold text-white tracking-tight">
                                            {user.promoBalance.toLocaleString()} <span className="text-sm text-purple-400 font-sans">FCFA</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {user.promoBalance !== undefined && user.promoBalance > 0 && (
                        <div className="bg-purple-900/30 border border-purple-500/20 rounded-xl p-4 flex gap-3 items-start">
                            <Info size={20} className="text-purple-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-purple-200 leading-relaxed">
                                <span className="font-bold text-purple-400">Promo Balance</span> cannot be withdrawn directly. You must wager it in games. When you win, all returns become real withdrawable cash!
                            </p>
                        </div>
                    )}

                    {/* Action Tabs */}
                    <div className="bg-royal-900/50 border border-white/5 rounded-2xl p-1 flex">
                        {['deposit', 'withdraw', 'history'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => { setActiveTab(tab as any); cancelPayment(); }}
                                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all capitalize ${activeTab === tab
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
                        {user.id.startsWith('guest-') && activeTab !== 'history' ? (
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center text-center h-[350px] space-y-4"
                            >
                                <div className="p-5 bg-orange-500/10 rounded-full text-orange-400 mb-2">
                                    <Shield size={48} />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Full Account Required</h2>
                                <p className="text-slate-400 max-w-sm text-sm">
                                    Guest accounts cannot perform real-money operations. Please register a permanent account to deposit and withdraw funds.
                                </p>
                                <button 
                                    onClick={() => { auth.signOut(); window.location.reload(); }}
                                    className="px-6 py-3 mt-4 bg-gold-500 text-royal-950 font-bold rounded-xl hover:bg-gold-400 transition-colors shadow-lg"
                                >
                                    Create Free Account
                                </button>
                            </motion.div>
                        ) : (
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
                                                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${provider === 'mtn' ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/5 hover:bg-white/5'
                                                        }`}
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-[#ffcc00] flex items-center justify-center text-black font-black text-xs">MTN</div>
                                                    <span className={`text-sm font-bold ${provider === 'mtn' ? 'text-yellow-400' : 'text-slate-400'}`}>MTN Mobile Money</span>
                                                </button>
                                                <button
                                                    onClick={() => setProvider('orange')}
                                                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${provider === 'orange' ? 'border-orange-500 bg-orange-500/10' : 'border-white/5 hover:bg-white/5'
                                                        }`}
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-[#ff6600] flex items-center justify-center text-white font-black text-xs">OM</div>
                                                    <span className={`text-sm font-bold ${provider === 'orange' ? 'text-orange-500' : 'text-slate-400'}`}>Orange Money</span>
                                                </button>
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">{t('amount')} (FCFA)</label>
                                                <input
                                                    type="number"
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    className="w-full bg-royal-950 border border-white/10 rounded-xl py-4 pl-4 text-white font-mono font-bold text-xl focus:border-gold-500 transition-colors"
                                                    placeholder="500"
                                                />
                                                <div className="flex gap-2 mt-2 flex-wrap">
                                                    {[
                                                        { amt: 100, label: t('starter') },
                                                        { amt: 500, label: t('popular') },
                                                        { amt: 1000, label: t('best_value'), highlight: true },
                                                        { amt: 2000, label: '' },
                                                        { amt: 5000, label: '' },
                                                    ].map(({ amt, label, highlight }) => (
                                                        <button key={amt} onClick={() => setAmount(amt.toString())}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex flex-col items-center gap-0.5 ${
                                                                highlight
                                                                    ? 'bg-gold-500/20 hover:bg-gold-500/30 text-gold-400 border border-gold-500/30'
                                                                    : 'bg-white/5 hover:bg-white/10 text-slate-400'
                                                            }`}>
                                                            <span className="font-bold">{amt.toLocaleString()}</span>
                                                            {label && <span className="text-[9px] uppercase tracking-wider opacity-70">{label}</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="p-4 bg-royal-950/50 rounded-xl border border-white/5 space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-400">{t('amount')}</span>
                                                    <span className="text-white font-mono">{inputAmount.toLocaleString()} FCFA</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-400">Fee (3%)</span>
                                                    <span className="text-white font-mono">{fee.toLocaleString()} FCFA</span>
                                                </div>
                                                <div className="border-t border-white/10 my-2"></div>
                                                <div className="flex justify-between font-bold">
                                                    <span className="text-white">Total</span>
                                                    <span className="text-gold-400 font-mono">{total.toLocaleString()} FCFA</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleDeposit}
                                                disabled={isLoading || !amount}
                                                className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-royal-950 font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {isLoading ? <RefreshCw className="animate-spin" /> : t('proceed_payment')} <ArrowRight size={18} />
                                            </button>
                                        </>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                            className="text-center py-8"
                                        >
                                            <div className="w-16 h-16 bg-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                                <Smartphone size={32} />
                                            </div>
                                            <h3 className="text-xl font-bold text-white mb-2">{t('payment_initiated')}</h3>
                                            <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
                                                Please verify the transaction on your phone. <br />
                                                <span className="text-xs text-yellow-400 font-bold">
                                                    {provider === 'mtn' ? t('ussd_hint_mtn') : t('ussd_hint_orange')}
                                                </span>
                                            </p>

                                            <div className="flex flex-col gap-3">
                                                <button onClick={() => window.open(paymentLink, '_blank')} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                                                    <ExternalLink size={18} /> {t('open_payment')}
                                                </button>
                                                <button onClick={cancelPayment} className="w-full py-3 text-red-400 font-bold hover:bg-red-500/10 rounded-xl transition-colors">
                                                    {t('cancel_pay')}
                                                </button>
                                            </div>
                                        </motion.div>
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
                                            <p className="text-sm text-slate-400">Transfer to Mobile Wallet</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">{t('amount')} (FCFA)</label>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full bg-royal-950 border border-white/10 rounded-xl py-4 pl-4 text-white font-mono font-bold text-xl focus:border-red-500 transition-colors"
                                            placeholder="Min 1000"
                                        />
                                        <div className="text-right mt-1">
                                            <button onClick={() => setAmount(user.balance.toString())} className="text-xs text-gold-400 hover:text-white font-bold uppercase">Max: {user.balance}</button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">{t('send_to')}</label>
                                        <div className="relative">
                                            <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="w-full bg-royal-950 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white font-mono focus:border-red-500 transition-colors"
                                                placeholder="6XX XXX XXX"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3 items-start">
                                        <Info className="text-yellow-500 shrink-0 mt-0.5" size={16} />
                                        <p className="text-xs text-yellow-200/80 leading-relaxed">
                                            {t('withdrawal_info')}. Ensure your number matches your Mobile Money account.
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleWithdraw}
                                        disabled={isLoading || !amount || !phone}
                                        className="w-full py-4 bg-white hover:bg-slate-200 text-royal-950 font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" /> : t('withdraw_cash')} <ArrowUpRight size={18} />
                                    </button>
                                </motion.div>
                            )}

                            {/* HISTORY */}
                            {activeTab === 'history' && (
                                <motion.div
                                    key="history"
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-white text-sm">{t('recent_transactions')}</h3>
                                        <button className="text-xs text-gold-400 uppercase font-bold hover:text-white">Export</button>
                                    </div>

                                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                        {transactions.length === 0 ? (
                                            <div className="text-center py-8 text-slate-500 text-sm">No transaction history.</div>
                                        ) : (
                                            transactions.map((tx, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-royal-900/30 border border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${tx.type === 'deposit' || tx.type === 'winnings' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                                            }`}>
                                                            {tx.type === 'deposit' ? <ArrowDownLeft size={16} /> :
                                                                tx.type === 'withdrawal' ? <ArrowUpRight size={16} /> : <History size={16} />}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-white text-sm capitalize">{tx.type}</div>
                                                            <div className="text-[10px] text-slate-500">{new Date(tx.date).toLocaleDateString()}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`font-mono font-bold text-sm ${tx.amount > 0 ? 'text-green-400' : 'text-slate-200'
                                                            }`}>
                                                            {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                                        </div>
                                                        <div className={`text-[10px] font-bold uppercase ${tx.status === 'completed' ? 'text-green-500' : tx.status === 'pending' ? 'text-yellow-500' : 'text-red-500'
                                                            }`}>{tx.status}</div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </motion.div>
                            )}

                        </AnimatePresence>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: STATS & HELP */}
                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-2xl border border-white/5">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                            <Building size={18} className="text-blue-400" /> {t('quick_stats')}
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-3 bg-royal-900/50 rounded-xl">
                                <span className="text-xs text-slate-400">{t('total_deposited')}</span>
                                <span className="font-mono font-bold text-white">
                                    {transactions.filter(t => t.type === 'deposit' && t.status === 'completed').reduce((acc, t) => acc + t.amount, 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-royal-900/50 rounded-xl">
                                <span className="text-xs text-slate-400">{t('total_withdrawn')}</span>
                                <span className="font-mono font-bold text-white">
                                    {Math.abs(transactions.filter(t => t.type === 'withdrawal' && t.status === 'completed').reduce((acc, t) => acc + t.amount, 0)).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-royal-900/50 rounded-xl border border-green-500/20">
                                <span className="text-xs text-green-400 font-bold uppercase">{t('net_profit')}</span>
                                <span className="font-mono font-bold text-green-400">
                                    {transactions.filter(t => t.type === 'winnings').reduce((acc, t) => acc + t.amount, 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-gradient-to-br from-royal-800 to-royal-900 rounded-2xl border border-white/10 text-center">
                        <h3 className="font-bold text-white mb-2">{t('need_help')}</h3>
                        <p className="text-xs text-slate-400 mb-4">Issues with a transaction? Our support team is here 24/7.</p>
                        <button className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-sm transition-colors">
                            {t('contact_support')}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
