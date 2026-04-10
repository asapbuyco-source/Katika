import React, { useEffect, useRef, useState } from 'react';

interface BalanceCounterProps {
    value: number;
    className?: string;
    prefix?: string;
    suffix?: string;
    duration?: number; // ms
}

export const BalanceCounter: React.FC<BalanceCounterProps> = ({
    value, className = '', prefix = '', suffix = '', duration = 800
}) => {
    const [display, setDisplay] = useState(value);
    const prevRef = useRef(value);
    const frameRef = useRef<number | null>(null);
    const [flash, setFlash] = useState<'up' | 'down' | null>(null);

    useEffect(() => {
        const from = prevRef.current;
        const to = value;
        if (from === to) return;

        setFlash(to > from ? 'up' : 'down');
        const timeout = setTimeout(() => setFlash(null), 900);

        const startTime = performance.now();
        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(from + (to - from) * eased));
            if (progress < 1) frameRef.current = requestAnimationFrame(animate);
            else prevRef.current = to;
        };
        frameRef.current = requestAnimationFrame(animate);
        return () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            clearTimeout(timeout);
        };
    }, [value, duration]);

    const flashClass = flash === 'up'
        ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]'
        : flash === 'down'
            ? 'text-red-400'
            : '';

    return (
        <span className={`tabular-nums transition-all duration-300 ${flashClass} ${className}`}>
            {prefix}{display.toLocaleString()}{suffix}
        </span>
    );
};
