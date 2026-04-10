import React from 'react';

// ─── Shimmer Base ────────────────────────────────────────────────────────────
const Shimmer: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] rounded-lg ${className}`}
        style={{ animation: 'shimmer 1.8s infinite', backgroundSize: '200% 100%' }} />
);

// ─── Game Tile Skeleton ────────────────────────────────────────────────────
export const GameTileSkeleton: React.FC = () => (
    <div className="flex flex-col gap-3">
        {[1, 2, 3].map(i => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                <Shimmer className="w-14 h-14 rounded-xl flex-shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                    <Shimmer className="h-4 w-24 rounded" />
                    <Shimmer className="h-3 w-40 rounded" />
                </div>
                <Shimmer className="h-8 w-20 rounded-xl flex-shrink-0" />
            </div>
        ))}
    </div>
);

// ─── User Card Skeleton ──────────────────────────────────────────────────────
export const UserCardSkeleton: React.FC = () => (
    <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
        <Shimmer className="w-12 h-12 rounded-full flex-shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
            <Shimmer className="h-4 w-28 rounded" />
            <Shimmer className="h-3 w-20 rounded" />
        </div>
        <Shimmer className="h-6 w-16 rounded-full" />
    </div>
);

// ─── Transaction Row Skeleton ─────────────────────────────────────────────────
export const TransactionRowSkeleton: React.FC = () => (
    <div className="flex items-center gap-3 py-3 border-b border-white/5">
        <Shimmer className="w-9 h-9 rounded-full flex-shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
            <Shimmer className="h-4 w-32 rounded" />
            <Shimmer className="h-3 w-24 rounded" />
        </div>
        <Shimmer className="h-5 w-20 rounded" />
    </div>
);

// ─── Tournament Card Skeleton ─────────────────────────────────────────────────
export const TournamentCardSkeleton: React.FC = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
            <Shimmer className="w-12 h-12 rounded-xl" />
            <div className="flex-1 flex flex-col gap-2">
                <Shimmer className="h-4 w-36 rounded" />
                <Shimmer className="h-3 w-24 rounded" />
            </div>
        </div>
        <Shimmer className="h-2 w-full rounded-full" />
        <div className="flex gap-2">
            <Shimmer className="h-8 flex-1 rounded-xl" />
            <Shimmer className="h-8 flex-1 rounded-xl" />
        </div>
    </div>
);

// ─── Profile Stat Skeleton ─────────────────────────────────────────────────
export const ProfileStatSkeleton: React.FC = () => (
    <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
            <Shimmer className="w-20 h-20 rounded-full" />
            <div className="flex-1 flex flex-col gap-2">
                <Shimmer className="h-5 w-32 rounded" />
                <Shimmer className="h-4 w-24 rounded" />
                <Shimmer className="h-3 w-20 rounded" />
            </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/5 rounded-xl p-3 flex flex-col gap-2">
                    <Shimmer className="h-6 w-full rounded" />
                    <Shimmer className="h-3 w-3/4 rounded" />
                </div>
            ))}
        </div>
    </div>
);

// ─── Page-level loading skeleton ─────────────────────────────────────────────
export const LobbyPageSkeleton: React.FC = () => (
    <div className="flex flex-col gap-6 p-4 max-w-2xl mx-auto">
        {/* Balance card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex justify-between">
                <Shimmer className="h-4 w-24 rounded" />
                <Shimmer className="h-4 w-16 rounded" />
            </div>
            <Shimmer className="h-10 w-40 rounded" />
            <div className="flex gap-2">
                <Shimmer className="h-9 flex-1 rounded-xl" />
                <Shimmer className="h-9 flex-1 rounded-xl" />
            </div>
        </div>
        {/* Game tiles */}
        <Shimmer className="h-4 w-28 rounded" />
        <GameTileSkeleton />
    </div>
);

// CSS keyframe — inject into document head once on startup
if (typeof document !== 'undefined' && !document.getElementById('shimmer-style')) {
    const style = document.createElement('style');
    style.id = 'shimmer-style';
    style.textContent = `
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}`;
    document.head.appendChild(style);
}
