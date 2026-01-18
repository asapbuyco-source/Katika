
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, ChevronDown, MessageCircle, CreditCard, Shield, Gamepad2, Wifi } from 'lucide-react';
import { playSFX } from '../services/sound';

interface HelpCenterProps {
  onBack: () => void;
}

const FAQS = [
    {
        category: "Payments",
        icon: CreditCard,
        items: [
            { q: "How long do withdrawals take?", a: "Withdrawals to MTN Mobile Money and Orange Money are processed instantly. In rare cases of network congestion, it may take up to 30 minutes." },
            { q: "Is there a deposit fee?", a: "Vantage does not charge deposit fees. However, standard carrier transaction fees from MTN/Orange may apply." },
            { q: "My deposit hasn't appeared yet.", a: "Please wait 5 minutes and refresh your wallet. If it still doesn't appear, ensure you approved the prompt on your phone. Contact support with your Transaction ID." }
        ]
    },
    {
        category: "Gameplay & Fairness",
        icon: Shield,
        items: [
            { q: "How does the AI Referee work?", a: "V-Guard AI monitors every game for impossible moves, bot behavior, and connection manipulation. If cheating is detected, the match is instantly awarded to the innocent player." },
            { q: "What happens if I disconnect?", a: "You have 60 seconds to reconnect. If you fail to return, you forfeit the match and your stake. Ensure you have a stable connection before playing high stakes." },
            { q: "Is the dice roll really random?", a: "Yes. We use a cryptographic SHA-256 hash of a server seed and client seed to generate rolls. You can verify this in the 'Provably Fair' section." }
        ]
    },
    {
        category: "Account",
        icon: Gamepad2,
        items: [
            { q: "Can I change my username?", a: "Usernames are permanent to prevent identity spoofing. You can only change your avatar in the Profile settings." },
            { q: "I forgot my PIN.", a: "For security, PIN resets require a manual review. Please use the 'Report Bug' form or email support@vantage.cm with your ID." }
        ]
    }
];

export const HelpCenter: React.FC<HelpCenterProps> = ({ onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<string | null>(null);

  const toggleItem = (id: string) => {
      setOpenIndex(openIndex === id ? null : id);
      playSFX('click');
  };

  const filteredFaqs = FAQS.map(cat => ({
      ...cat,
      items: cat.items.filter(item => 
          item.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.a.toLowerCase().includes(searchQuery.toLowerCase())
      )
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-royal-950 p-4 md:p-8 pb-24">
        <div className="max-w-3xl mx-auto">
            
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-display font-bold text-white">Help Center</h1>
            </div>

            {/* Search */}
            <div className="relative mb-8">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                    type="text"
                    placeholder="Search for help (e.g. 'Withdrawal', 'Rules')..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-royal-900/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-500 focus:border-gold-500 outline-none transition-colors"
                />
            </div>

            {/* FAQs */}
            <div className="space-y-8">
                {filteredFaqs.length > 0 ? (
                    filteredFaqs.map((cat, catIdx) => (
                        <div key={catIdx}>
                            <h3 className="flex items-center gap-2 text-gold-400 font-bold uppercase tracking-wider text-sm mb-4 px-2">
                                <cat.icon size={16} /> {cat.category}
                            </h3>
                            <div className="space-y-3">
                                {cat.items.map((item, itemIdx) => {
                                    const id = `${catIdx}-${itemIdx}`;
                                    const isOpen = openIndex === id;
                                    return (
                                        <div key={itemIdx} className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
                                            <button 
                                                onClick={() => toggleItem(id)}
                                                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                                            >
                                                <span className="font-bold text-slate-200 text-sm md:text-base">{item.q}</span>
                                                <ChevronDown size={16} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            <AnimatePresence>
                                                {isOpen && (
                                                    <motion.div 
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="p-4 pt-0 text-slate-400 text-sm leading-relaxed border-t border-white/5">
                                                            {item.a}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-12 text-slate-500">
                        <p>No results found for "{searchQuery}"</p>
                    </div>
                )}
            </div>

            {/* Contact Support CTA */}
            <div className="mt-12 bg-gradient-to-r from-royal-800 to-royal-900 rounded-2xl p-6 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h3 className="text-lg font-bold text-white mb-1">Still need help?</h3>
                    <p className="text-sm text-slate-400">Our support team is available 24/7 via WhatsApp or Email.</p>
                </div>
                <button 
                    onClick={() => window.open('https://wa.me/237657960690', '_blank')}
                    className="px-6 py-3 bg-gold-500 hover:bg-gold-400 text-royal-950 font-bold rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95"
                >
                    <MessageCircle size={18} /> Chat with Us
                </button>
            </div>

        </div>
    </div>
  );
};
