
import React from 'react';
import { ArrowLeft, ScrollText } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

export const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-royal-950 p-4 md:p-8 pb-24">
        <div className="max-w-4xl mx-auto">
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-display font-bold text-white">Terms of Service</h1>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-white/10 bg-royal-900/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 bg-gold-500/5 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                    <div className="flex items-center gap-3 text-gold-400 mb-6">
                        <ScrollText size={32} />
                        <span className="font-mono text-xs uppercase tracking-widest">Last Updated: March 15, 2024</span>
                    </div>

                    <h3 className="text-white">1. Introduction</h3>
                    <p>
                        Welcome to Vantage Ludo ("the Platform"), operated by Vantage Gaming Cameroon. By accessing or using our services, you agree to be bound by these Terms of Service and our Fair Play Policy. If you do not agree, please do not use the Platform.
                    </p>

                    <h3 className="text-white">2. Eligibility</h3>
                    <p>
                        You must be at least 18 years of age (or the legal age of majority in your jurisdiction) to access the Platform. Services are currently restricted to residents of Cameroon with valid MTN Mobile Money or Orange Money accounts.
                    </p>

                    <h3 className="text-white">3. P2P Gaming & Escrow</h3>
                    <p>
                        Vantage provides a Peer-to-Peer (P2P) gaming environment. When you enter a match:
                    </p>
                    <ul>
                        <li>An entry stake is deducted from your wallet.</li>
                        <li>Funds are held in a secure Escrow Vault until the match concludes.</li>
                        <li>The winner receives the total pot minus a platform fee (typically 10%).</li>
                        <li>In the event of a draw, stakes are refunded minus a small processing fee.</li>
                    </ul>

                    <h3 className="text-white">4. Fair Play & AI Referee</h3>
                    <p>
                        Our V-Guard AI monitors all matches. Any attempt to manipulate the game client, use automated bots, or intentionally disconnect to avoid a loss will result in:
                    </p>
                    <ul>
                        <li>Immediate forfeiture of the match and stake.</li>
                        <li>Temporary or permanent account suspension.</li>
                        <li>Confiscation of illicitly gained funds.</li>
                    </ul>
                    <p>
                        The AI Referee's decision is final in cases of technical disputes.
                    </p>

                    <h3 className="text-white">5. Deposits & Withdrawals</h3>
                    <p>
                        Deposits are processed via third-party providers (Fapshi). Vantage is not responsible for delays caused by mobile network operators. Withdrawals are subject to verification checks to prevent money laundering and fraud.
                    </p>

                    <h3 className="text-white">6. Limitation of Liability</h3>
                    <p>
                        Vantage Gaming Cameroon is not liable for losses due to user device failure, poor internet connection, or unauthorized account access resulting from user negligence (e.g., sharing PINs).
                    </p>

                    <h3 className="text-white">7. Governing Law</h3>
                    <p>
                        These Terms are governed by the laws of the Republic of Cameroon and OHADA Uniform Acts. Any disputes shall be resolved in the competent courts of Douala.
                    </p>

                    <div className="pt-8 mt-8 border-t border-white/10 text-center text-xs text-slate-500">
                        &copy; 2024 Vantage Gaming Cameroon. All rights reserved.
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
