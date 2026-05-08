
import React, { useState } from 'react';
import { useSocket } from '../services/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────
type SignalLevel = 0 | 1 | 2 | 3 | 4;

interface SignalConfig {
    color: string;         // bar fill colour
    glow: string;          // glow class
    label: string;         // text label
    labelColor: string;    // label text colour
}

const SIGNAL_CONFIG: Record<SignalLevel, SignalConfig> = {
    0: { color: '#ef4444', glow: 'shadow-red-500/60',    label: 'Offline',   labelColor: 'text-red-400' },
    1: { color: '#f97316', glow: 'shadow-orange-500/60', label: 'Poor',      labelColor: 'text-orange-400' },
    2: { color: '#eab308', glow: 'shadow-yellow-500/60', label: 'Fair',      labelColor: 'text-yellow-400' },
    3: { color: '#22c55e', glow: 'shadow-green-500/60',  label: 'Good',      labelColor: 'text-green-400' },
    4: { color: '#10b981', glow: 'shadow-emerald-500/60',label: 'Excellent', labelColor: 'text-emerald-400' },
};

// Heights of the 4 bars (shortest → tallest), in pixels
const BAR_HEIGHTS = [6, 10, 14, 18];

// ─── Component ────────────────────────────────────────────────────────────────
interface NetworkSignalIndicatorProps {
    /** 'sidebar' = compact vertical layout for the desktop nav sidebar
     *  'bottombar' = compact horizontal layout for the mobile bottom nav */
    variant?: 'sidebar' | 'bottombar';
}

export const NetworkSignalIndicator: React.FC<NetworkSignalIndicatorProps> = ({
    variant = 'bottombar',
}) => {
    const { isConnected, signalStrength, pingMs, bypassConnection } = useSocket();
    const [showTooltip, setShowTooltip] = useState(false);

    const level = bypassConnection ? 0 : signalStrength as SignalLevel;
    const cfg = SIGNAL_CONFIG[level];

    // ── Bars ─────────────────────────────────────────────────────────────────
    const Bars = () => (
        <div className="flex items-end gap-[2.5px]" aria-hidden="true">
            {BAR_HEIGHTS.map((h, i) => {
                const active = level > i; // bar i is lit when signal > i
                return (
                    <motion.div
                        key={i}
                        animate={{
                            backgroundColor: active ? cfg.color : '#334155',
                            opacity: active ? 1 : 0.35,
                            scaleY: active && level === 0 ? [1, 0.6, 1] : 1,
                        }}
                        transition={{
                            backgroundColor: { duration: 0.4 },
                            opacity: { duration: 0.4 },
                            scaleY: { repeat: Infinity, duration: 1.2, ease: 'easeInOut', delay: i * 0.2 },
                        }}
                        style={{
                            width: 4,
                            height: h,
                            borderRadius: 2,
                            backgroundColor: active ? cfg.color : '#334155',
                            boxShadow: active ? `0 0 6px ${cfg.color}99` : 'none',
                            transformOrigin: 'bottom',
                        }}
                    />
                );
            })}
        </div>
    );

    // ── Tooltip ───────────────────────────────────────────────────────────────
    const Tooltip = () => (
        <AnimatePresence>
            {showTooltip && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: variant === 'sidebar' ? 0 : -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.15 }}
                    className={`
                        absolute z-[300] pointer-events-none
                        bg-royal-900 border border-white/10 rounded-xl px-3 py-2
                        shadow-xl backdrop-blur-md whitespace-nowrap
                        ${variant === 'sidebar'
                            ? 'left-full ml-3 top-1/2 -translate-y-1/2'
                            : 'bottom-full mb-2 left-1/2 -translate-x-1/2'}
                    `}
                >
                    <div className="flex items-center gap-2">
                        {/* Live signal dot */}
                        <motion.div
                            animate={{ opacity: isConnected ? [1, 0.3, 1] : 1 }}
                            transition={{ repeat: Infinity, duration: 1.4 }}
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cfg.color }}
                        />
                        <div>
                            <p className={`text-xs font-bold ${cfg.labelColor}`}>
                                {bypassConnection ? 'Offline Mode' : cfg.label}
                            </p>
                            {isConnected && pingMs !== null && (
                                <p className="text-[10px] text-slate-400 font-mono">
                                    {pingMs} ms
                                </p>
                            )}
                            {!isConnected && !bypassConnection && (
                                <p className="text-[10px] text-slate-400">Reconnecting…</p>
                            )}
                        </div>
                    </div>
                    {/* Arrow */}
                    {variant === 'sidebar' && (
                        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-0 h-0
                            border-t-[5px] border-t-transparent
                            border-b-[5px] border-b-transparent
                            border-r-[6px] border-r-royal-900/90" />
                    )}
                    {variant === 'bottombar' && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
                            border-l-[5px] border-l-transparent
                            border-r-[5px] border-r-transparent
                            border-t-[6px] border-t-royal-900/90" />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );

    // ── Sidebar variant (desktop, vertical) ───────────────────────────────────
    if (variant === 'sidebar') {
        return (
            <div
                className="relative flex flex-col items-center gap-1 cursor-default select-none"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                aria-label={`Network: ${cfg.label}${pingMs ? ` ${pingMs}ms` : ''}`}
            >
                <Bars />
                <span className={`text-[8px] font-bold tracking-wide uppercase ${cfg.labelColor}`}>
                    {bypassConnection ? 'OFF' : cfg.label.slice(0, 4)}
                </span>
                <Tooltip />
            </div>
        );
    }

    // ── Bottom-bar variant (mobile, horizontal) ────────────────────────────────
    return (
        <div
            className="relative flex flex-col items-center gap-1 cursor-default select-none flex-1 md:flex-none"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onTouchStart={() => setShowTooltip(v => !v)}
            aria-label={`Network: ${cfg.label}${pingMs ? ` ${pingMs}ms` : ''}`}
        >
            <div className="p-2 rounded-xl">
                <Bars />
            </div>
            <span className={`text-[9px] md:text-[10px] font-medium tracking-wide ${cfg.labelColor}`}>
                {bypassConnection ? 'Offline' : cfg.label.slice(0, 4)}
            </span>
            <Tooltip />
        </div>
    );
};
