
import React from 'react';
import { Plus, Wallet, Trophy, Play, History, Shield } from 'lucide-react';
import { User, ViewState } from '../types';

interface DashboardProps {
  user: User;
  setView: (view: ViewState) => void;
  onTopUp: () => void;
  onQuickMatch: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, setView, onTopUp, onQuickMatch }) => {
  
  // Helper to get color based on rank
  const getRankColor = (tier: string) => {
      switch(tier) {
          case 'Diamond': return 'text-cyan-400 border-cyan-400';
          case 'Gold': return 'text-yellow-400 border-yellow-400';
          case 'Silver': return 'text-slate-300 border-slate-300';
          default: return 'text-orange-400 border-orange-400';
      }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">
            Bonjour, <span className="text-gold-400">{user.name}</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
             <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getRankColor(user.rankTier)} bg-black/20`}>
                {user.rankTier} Tier
             </span>
             <span className="text-slate-400 text-sm font-mono">{user.elo} ELO</span>
          </div>
        </div>
        <div className="relative">
          <img
            src={user.avatar}
            alt="Profile"
            className="w-12 h-12 rounded-full border-2 border-gold-400 object-cover"
          />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-cam-green rounded-full border-2 border-royal-900"></div>
        </div>
      </header>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Money-First Wallet Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group border-gold-500/20 bg-gradient-to-br from-royal-800 to-royal-900 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Wallet size={140} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-gold-400 text-xs font-bold uppercase tracking-widest mb-1">
                <Shield size={12} fill="currentColor" /> 
                <span>Secure Wallet</span>
            </div>
            <h2 className="text-4xl font-display font-bold text-white mt-1">
              {user.balance.toLocaleString()} <span className="text-slate-400 text-2xl font-sans font-normal">FCFA</span>
            </h2>
          </div>
          <div className="flex gap-3 mt-8">
            <button 
                onClick={onTopUp}
                className="flex-1 bg-gold-500 hover:bg-gold-400 text-black font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(251,191,36,0.2)] active:scale-95"
            >
              <Plus size={18} /> 
              <span>DEPOSIT</span>
            </button>
            <div className="flex gap-2">
                <button 
                    onClick={onTopUp} 
                    className="w-12 h-full bg-[#ffcc00] rounded-xl flex items-center justify-center text-[10px] font-black text-black hover:scale-105 transition-transform shadow-lg shadow-yellow-500/10" 
                    title="MTN Mobile Money"
                >
                    MTN
                </button>
                <button 
                    onClick={onTopUp} 
                    className="w-12 h-full bg-[#ff6600] rounded-xl flex items-center justify-center text-[10px] font-black text-white hover:scale-105 transition-transform shadow-lg shadow-orange-500/10" 
                    title="Orange Money"
                >
                    OM
                </button>
            </div>
          </div>
        </div>

        {/* Quick Action - Ranked Match */}
        <div 
          onClick={onQuickMatch}
          className="glass-panel p-6 rounded-2xl md:col-span-2 flex items-center justify-between cursor-pointer hover:bg-royal-800/50 transition-colors border-l-4 border-l-cam-green group relative overflow-hidden"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
                <h3 className="text-2xl font-display font-bold text-white group-hover:text-cam-green transition-colors">Ranked Match</h3>
                <span className="bg-cam-green text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(0,122,94,0.4)]">RECOMMENDED</span>
            </div>
            <p className="text-slate-400 mb-2">Find a player near <span className="text-white font-bold">{user.elo} ELO</span> instantly.</p>
            <div className="flex items-center gap-2 text-xs font-medium text-cam-green">
                <span className="w-2 h-2 rounded-full bg-cam-green animate-pulse" />
                <span>1,240 Players Online</span>
            </div>
          </div>
          
          <div className="absolute right-6 top-1/2 -translate-y-1/2 w-20 h-20 bg-cam-green/10 rounded-full flex items-center justify-center text-cam-green group-hover:scale-110 transition-transform">
            <div className="absolute inset-0 rounded-full bg-cam-green/20 animate-ping opacity-50"></div>
            <Play size={32} fill="currentColor" className="relative z-10 ml-1" />
          </div>
        </div>

        {/* Stats Card */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 border-l-4 border-l-cam-red">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="text-cam-red" size={24} />
            <h3 className="text-lg font-bold text-white">Season Rank</h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Current Tier</span>
              <span className={`font-bold ${getRankColor(user.rankTier).split(' ')[0]}`}>{user.rankTier}</span>
            </div>
            <div className="w-full bg-royal-900 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-cam-red to-orange-500 h-2 rounded-full w-[68%] shadow-[0_0_10px_rgba(206,17,38,0.5)]"></div>
            </div>
            <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">To Next Rank</span>
                <span className="text-white font-mono">45 pts</span>
            </div>
          </div>
        </div>

        {/* Recent History */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <History className="text-slate-400" size={20} />
              <h3 className="text-lg font-bold text-white">Recent Activity</h3>
            </div>
            <button className="text-xs text-gold-400 hover:text-white font-bold uppercase tracking-wide">View All</button>
          </div>
          <div className="space-y-3">
            {[
              { game: 'Ludo Classic', result: 'Won', amount: '+900', time: '2 mins ago', color: 'text-cam-green' },
              { game: 'Dice Roll', result: 'Lost', amount: '-500', time: '1 hour ago', color: 'text-cam-red' },
              { game: 'Ludo 4-Player', result: 'Won', amount: '+2,700', time: '3 hours ago', color: 'text-cam-green' },
            ].map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-royal-900/50 rounded-xl hover:bg-royal-900 transition-colors border border-transparent hover:border-white/5">
                <div className="flex flex-col">
                  <span className="font-medium text-white">{item.game}</span>
                  <span className="text-xs text-slate-500">{item.time}</span>
                </div>
                <div className={`font-mono font-bold ${item.color}`}>
                  {item.amount} FCFA
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
