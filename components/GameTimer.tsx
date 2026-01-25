
import React from 'react';
import { Clock } from 'lucide-react';

interface GameTimerProps {
  seconds: number;
  isActive?: boolean;
  label?: string;
  variant?: 'default' | 'warning';
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const GameTimer: React.FC<GameTimerProps> = ({ seconds, isActive = false, label, variant = 'default' }) => {
  const isWarning = variant === 'warning' || (seconds <= 10 && isActive);
  
  return (
    <div className={`px-3 py-1 rounded-lg flex items-center gap-2 border transition-all duration-300 ${
        isActive 
        ? (isWarning ? 'bg-red-500/20 text-red-200 border-red-500/50' : 'bg-black/40 text-white border-white/20 shadow-sm') 
        : 'bg-transparent text-slate-500 border-transparent'
    }`}>
        <Clock size={14} className={isActive ? (isWarning ? 'text-red-400 animate-pulse' : 'text-gold-400') : 'text-slate-600'} />
        <span className="font-mono font-bold text-sm tabular-nums">{formatTime(seconds)}</span>
        {label && <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 ml-1 hidden md:inline">{label}</span>}
    </div>
  );
};
