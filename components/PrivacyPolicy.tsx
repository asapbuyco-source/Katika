import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-royal-950 p-4 md:p-8 pb-24">
        <div className="max-w-4xl mx-auto">
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-display font-bold text-white">Privacy Policy</h1>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-white/10 bg-royal-900/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="text-sm max-w-none text-slate-200 space-y-6">
                    <div className="flex items-center gap-3 text-blue-400 mb-6">
                        <Shield size={32} />
                        <span className="font-mono text-xs uppercase tracking-widest">Effective Date: March 15, 2024</span>
                    </div>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-2">1. Data Collection</h3>
                        <p className="leading-relaxed mb-2">
                            We collect minimal information required to operate the service:
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Account Info: Email address, username, and encrypted password (if applicable).</li>
                            <li>Payment Info: Mobile Money phone numbers are processed securely by our payment partner (Fapshi) and are not stored on our servers.</li>
                            <li>Gameplay Data: Match history, moves, and logs for the purpose of the AI Referee system.</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-2">2. Use of Information</h3>
                        <p className="leading-relaxed mb-2">
                            Your data is used solely to:
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Facilitate matches and process transactions.</li>
                            <li>Detect fraud and cheating via V-Guard AI.</li>
                            <li>Improve platform stability.</li>
                        </ul>
                        <p className="leading-relaxed mt-2">We do not sell your personal data to third parties.</p>
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-2">3. Data Security</h3>
                        <p className="leading-relaxed">
                            We employ industry-standard AES-256 encryption for all data in transit and at rest. Access to user data is restricted to authorized personnel only.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-2">4. Your Rights</h3>
                        <p className="leading-relaxed">
                            You have the right to request the deletion of your account and associated data at any time via the Profile settings or by contacting support.
                        </p>
                    </section>

                    <div className="pt-8 mt-8 border-t border-white/10 text-center text-xs text-slate-500">
                        &copy; 2024 Vantage Gaming Cameroon.
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};