
import React, { useEffect, useState } from 'react';
import { Shield, Activity, Wifi, Eye } from 'lucide-react';
import { AIRefereeLog } from '../types';
import { motion as originalMotion, AnimatePresence } from 'framer-motion';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

interface AIRefereeProps {
    externalLog?: AIRefereeLog | null;
}

export const AIReferee: React.FC<AIRefereeProps> = ({ externalLog }) => {
  const [logs, setLogs] = useState<AIRefereeLog[]>([]);

  // Effect for background monitoring simulation
  useEffect(() => {
    const messages = [
      { msg: "Monitoring network latency...", status: 'scanning' },
      { msg: "Checking for bot patterns...", status: 'scanning' },
      { msg: "Connection stable. Ping: 45ms", status: 'active' },
    ];

    let i = 0;
    const interval = setInterval(() => {
      // Only add random logs if we haven't received an important external one recently
      const msg = messages[i % messages.length];
      const newLog: AIRefereeLog = {
        id: `sys-${Date.now()}`,
        message: msg.msg,
        status: msg.status as any,
        timestamp: Date.now(),
      };
      setLogs(prev => [newLog, ...prev].slice(0, 3));
      i++;
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Effect to handle critical game events passed from GameRoom
  useEffect(() => {
    if (externalLog) {
        setLogs(prev => [externalLog, ...prev].slice(0, 3));
    }
  }, [externalLog]);

  return (
    <div className="glass-panel rounded-xl border-l-4 border-l-purple-500 overflow-hidden">
      <div className="bg-royal-900/80 p-3 flex justify-between items-center border-b border-white/5">
        <div className="flex items-center gap-2">
            <div className="relative">
                <Shield size={18} className="text-purple-400" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </span>
            </div>
            <h4 className="font-display font-bold text-sm text-purple-200">Vantage AI Referee</h4>
        </div>
        <div className="flex gap-2">
            <Activity size={14} className="text-slate-500" />
            <Wifi size={14} className="text-green-500" />
        </div>
      </div>
      
      <div className="p-3 bg-black/20 min-h-[100px] flex flex-col justify-end">
        <AnimatePresence>
            {logs.map((log) => (
                <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 mb-2 last:mb-0"
                >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        log.status === 'secure' ? 'bg-green-500' : 
                        log.status === 'alert' ? 'bg-red-500' : 'bg-purple-500'
                    }`}></span>
                    <p className="text-xs font-mono text-slate-300">{log.message}</p>
                </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
