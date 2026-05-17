import React from 'react';
import { Home, LayoutGrid, User, Wallet, Trophy, Hexagon, MessageSquare } from 'lucide-react';
import { ViewState, User as AppUser } from '../types';
import { useLanguage } from '../services/i18n';
import { NetworkSignalIndicator } from './NetworkSignalIndicator';
import { motion } from 'framer-motion';
import { cn } from './utils/cn';

interface NavigationProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  user: AppUser;
  hasUnreadMessages?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, setView, hasUnreadMessages }) => {
  const { t } = useLanguage();

  const navItems = [
    { id: 'dashboard', icon: Home, label: t('nav_home') },
    { id: 'lobby', icon: LayoutGrid, label: t('nav_lobby') },
    { id: 'tournaments', icon: Trophy, label: 'Tourney' },
    { id: 'forum', icon: MessageSquare, label: t('nav_forum'), hasBadge: hasUnreadMessages },
    { id: 'profile', icon: User, label: t('nav_profile') },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-royal-950/95 backdrop-blur-xl border-t border-white/5 pb-safe z-50 transition-all md:static md:w-20 md:h-screen md:flex-col md:border-r md:border-t-0 md:justify-start md:gap-8">
      
      {/* Mobile Floating Network Indicator (Above Nav) - Moved to Dashboard/Games */}

      {/* Desktop: logo */}
      <div className="hidden md:flex flex-col items-center mt-6 mb-4 gap-4">
        <div className="w-10 h-10 bg-gradient-to-br from-gold-400 to-amber-600 rounded-xl flex items-center justify-center text-royal-950 border border-white/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
          <Hexagon size={24} className="fill-royal-950" />
        </div>
      </div>

      <div className="flex items-center justify-between md:justify-start md:flex-col md:gap-2 w-full px-4 py-2 md:px-4 md:py-0 mx-auto max-w-md md:max-w-none">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          
          return (
            <motion.button
              key={item.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView(item.id as ViewState)}
              aria-label={item.label}
              className={cn(
                "group relative flex items-center gap-2 px-3.5 py-2.5 md:p-3 transition-all duration-300 rounded-full md:rounded-xl md:w-full md:flex-col outline-none shrink-0",
                isActive 
                  ? "text-gold-400 bg-gold-500/15 md:bg-transparent"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              <div className="relative z-10 flex items-center justify-center">
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              
              {/* Mobile Text (only active) & Desktop Text (always) */}
              {isActive && (
                  <motion.span 
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    className="text-[11px] font-bold tracking-wide md:hidden whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
              )}
              <span className={cn(
                  "text-[10px] font-medium tracking-wide hidden md:block mt-1",
                  isActive ? "font-bold" : ""
              )}>
                {item.label}
              </span>

              {/* Desktop Active Pill */}
              {isActive && (
                <motion.div
                  layoutId="nav-pill-desktop"
                  className="absolute inset-0 rounded-xl hidden md:block bg-gold-500/15"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              
              {/* Desktop Active Edge Indicator */}
              {isActive && (
                <motion.div 
                  layoutId="nav-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full hidden md:block bg-gold-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]" 
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
