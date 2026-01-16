
import React from 'react';
import { Home, LayoutGrid, User, Bell, Wallet, ShieldAlert } from 'lucide-react';
import { ViewState, User as AppUser } from '../types';

interface NavigationProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  user: AppUser;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, setView, user }) => {
  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'lobby', icon: LayoutGrid, label: 'Lobby' },
    { id: 'finance', icon: Wallet, label: 'Wallet' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-royal-900/95 backdrop-blur-xl border-t border-royal-700 p-4 md:static md:w-24 md:h-screen md:flex-col md:border-r md:border-t-0 md:justify-start md:gap-10 z-50 transition-all">
      <div className="hidden md:flex flex-col items-center mt-8 mb-4">
        <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center text-black font-bold text-xl shadow-lg shadow-gold-500/20">V</div>
      </div>
      
      <div className="flex justify-around items-center md:flex-col md:gap-8 w-full">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as ViewState)}
            className={`flex flex-col items-center gap-1 transition-all relative group ${
              currentView === item.id ? 'text-gold-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            <div className={`p-2 rounded-xl transition-all ${currentView === item.id ? 'bg-royal-800' : 'group-hover:bg-royal-800/50'}`}>
                <item.icon size={24} className={currentView === item.id ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : ''} />
            </div>
            <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            {currentView === item.id && (
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-8 bg-gold-500 rounded-l-full hidden md:block" />
            )}
          </button>
        ))}
        
        <button 
            onClick={() => setView('profile')}
            className={`flex flex-col items-center gap-1 transition-all relative group ${
              currentView === 'profile' ? 'text-gold-400' : 'text-slate-400 hover:text-white'
            }`}
        >
          <div className={`p-2 rounded-xl transition-all ${currentView === 'profile' ? 'bg-royal-800' : 'group-hover:bg-royal-800/50'}`}>
             <User size={24} className={currentView === 'profile' ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : ''} />
          </div>
          <span className="text-[10px] font-medium tracking-wide">Profile</span>
          {currentView === 'profile' && (
             <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-8 bg-gold-500 rounded-l-full hidden md:block" />
          )}
        </button>

        {/* ADMIN LINK */}
        {user.isAdmin && (
            <button 
                onClick={() => setView('admin')}
                className={`flex flex-col items-center gap-1 transition-all relative group ${
                currentView === 'admin' ? 'text-red-400' : 'text-slate-500 hover:text-red-300'
                }`}
            >
            <div className={`p-2 rounded-xl transition-all ${currentView === 'admin' ? 'bg-red-500/20' : 'group-hover:bg-red-500/10'}`}>
                <ShieldAlert size={24} className={currentView === 'admin' ? 'drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' : ''} />
            </div>
            <span className="text-[10px] font-bold tracking-wide">Admin</span>
            {currentView === 'admin' && (
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-8 bg-red-500 rounded-l-full hidden md:block" />
            )}
            </button>
        )}
      </div>
    </div>
  );
};
