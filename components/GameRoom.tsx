import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from 'lucide-react';
import { Table, User } from '../types';
import { useAppState } from '../services/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { playSFX } from '../services/sound';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';

interface GameRoomProps {
    table: Table;
    user: User;
    onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
    socket?: Socket | null;
    socketGame?: any;
}

// ─── Board Constants ──────────────────────────────────────────────────────────
// Standard 15×15 Ludo, 2-player variant (Red = bottom-right, Blue = top-left)
// Track: 52 cells (clockwise for Red), Home stretch: 6 cells each

// Main track — 52 positions [row, col]. Position 0 = Red's start just outside home.
const MAIN_TRACK: [number, number][] = [
    // 0-4: Up right column of bottom arm
    [13,8],[12,8],[11,8],[10,8],[9,8],
    // 5-10: Right across right arm (row 8, cols 9→14)
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
    // 11-12: Down right side of right arm to row 6
    [7,14],[6,14],
    // 13-17: Left across top of right arm (row 6, cols 13→9)
    [6,13],[6,12],[6,11],[6,10],[6,9],
    // 18-23: Up right column of top arm (col 8, rows 5→0)
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
    // 24-25: Left across top
    [0,7],[0,6],
    // 26-30: Down left column of top arm (col 6, rows 1→5)
    [1,6],[2,6],[3,6],[4,6],[5,6],
    // 31-36: Left across left arm (row 6, cols 5→0)
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    // 37-38: Down left side of left arm
    [7,0],[8,0],
    // 39-43: Right across bottom of left arm (row 8, cols 1→5)
    [8,1],[8,2],[8,3],[8,4],[8,5],
    // 44-49: Down left column of bottom arm (col 6, rows 9→14)
    [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
    // 50-51: Right across bottom
    [14,7],[14,8],
];

// Red home stretch: after pos 51, enters col 7 going UP toward center
const RED_HOME_STRETCH: [number, number][] = [
    [13,7],[12,7],[11,7],[10,7],[9,7],[8,7]
];
// Blue home stretch: after pos 25 (Blue's "51"), enters col 7 going DOWN
const BLUE_HOME_STRETCH: [number, number][] = [
    [1,7],[2,7],[3,7],[4,7],[5,7],[6,7]
];

// Safe squares (main track indices)
const SAFE_POSITIONS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Total steps to reach goal: 52 (main) + 6 (home stretch) = 58 → index 57 = finished
const GOAL_STEP = 57;

type PieceColor = 'Red' | 'Blue';

interface Piece {
    id: number;       // 0-3 = Red pieces, 4-7 = Blue pieces
    color: PieceColor;
    step: number;     // -1 = at home base, 0-51 = main track position (for this player), 52-57 = home stretch
    finished: boolean;
}

// Convert a piece's step to a board [row, col]
function getBoardPosition(piece: Piece): [number, number] | null {
    if (piece.step === -1) return null; // in home base, rendered separately
    if (piece.finished) return null;

    const trackOffset = piece.color === 'Blue' ? 26 : 0;

    if (piece.step <= 51) {
        const trackIdx = (piece.step + trackOffset) % 52;
        return MAIN_TRACK[trackIdx];
    }
    // Home stretch
    const hsIdx = piece.step - 52;
    if (piece.color === 'Red') return RED_HOME_STRETCH[hsIdx] ?? null;
    return BLUE_HOME_STRETCH[hsIdx] ?? null;
}

// Starting home-base positions on the board (visual placeholders)
const RED_BASE_POSITIONS: [number, number][] = [
    [10,10],[10,12],[12,10],[12,12]
];
const BLUE_BASE_POSITIONS: [number, number][] = [
    [2,2],[2,4],[4,2],[4,4]
];

// Build initial pieces
function buildPieces(): Piece[] {
    return [
        ...([0,1,2,3] as const).map(i => ({ id: i, color: 'Red' as PieceColor, step: -1, finished: false })),
        ...([4,5,6,7] as const).map(i => ({ id: i, color: 'Blue' as PieceColor, step: -1, finished: false })),
    ];
}

// ─── Dice icon component ───────────────────────────────────────────────────
const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const AnimatedDice: React.FC<{ value: number | null; rolling: boolean }> = ({ value, rolling }) => {
    const Icon = value ? DICE_ICONS[value - 1] : Dice1;
    return (
        <motion.div
            animate={rolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.2, 0.9, 1.1, 1] } : {}}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex items-center justify-center"
        >
            <Icon
                size={56}
                className={rolling ? 'text-gold-300' : value === 6 ? 'text-gold-400' : 'text-white'}
                strokeWidth={1.5}
            />
        </motion.div>
    );
};

// ─── Cell type definitions ─────────────────────────────────────────────────
type CellType =
    | 'red_home' | 'blue_home' | 'empty_home'          // corner homes
    | 'track' | 'safe'                                   // main path
    | 'red_stretch' | 'blue_stretch'                     // home runs
    | 'center'                                           // goal
    | 'border';                                          // border/decoration

function getCellType(r: number, c: number): CellType {
    // Home areas (6×6 corners)
    if (r <= 5 && c <= 5) return 'blue_home';
    if (r <= 5 && c >= 9) return 'empty_home';
    if (r >= 9 && c <= 5) return 'empty_home';
    if (r >= 9 && c >= 9) return 'red_home';

    // Center
    if (r === 7 && c === 7) return 'center';

    // Home stretches
    if (c === 7 && r >= 1 && r <= 6) return 'blue_stretch';
    if (c === 7 && r >= 8 && r <= 13) return 'red_stretch';

    // Track cells — everything in cross arms
    const inBottomArm = r >= 9 && r <= 14 && c >= 6 && c <= 8;
    const inTopArm    = r >= 0 && r <= 5  && c >= 6 && c <= 8;
    const inLeftArm   = r >= 6 && r <= 8  && c >= 0 && c <= 5;
    const inRightArm  = r >= 6 && r <= 8  && c >= 9 && c <= 14;
    const inCenter    = r >= 6 && r <= 8  && c >= 6 && c <= 8;

    if (inBottomArm || inTopArm || inLeftArm || inRightArm || inCenter) {
        // Check if this is a safe square
        for (const idx of SAFE_POSITIONS) {
            if (r === MAIN_TRACK[idx][0] && c === MAIN_TRACK[idx][1]) return 'safe';
        }
        return 'track';
    }

    return 'border';
}

// ─── Cell colors ───────────────────────────────────────────────────────────
function getCellStyle(type: CellType): string {
    switch (type) {
        case 'red_home':     return 'bg-red-950/80 border border-red-800/30';
        case 'blue_home':    return 'bg-blue-950/80 border border-blue-800/30';
        case 'empty_home':   return 'bg-slate-900/60 border border-white/5';
        case 'track':        return 'bg-slate-100/90 border border-slate-300/50';
        case 'safe':         return 'bg-emerald-100 border border-emerald-400/60';
        case 'red_stretch':  return 'bg-red-200 border border-red-300/70';
        case 'blue_stretch': return 'bg-blue-200 border border-blue-300/70';
        case 'center':       return 'bg-gradient-to-br from-gold-400 to-amber-500 border-2 border-gold-300';
        case 'border':       return 'bg-transparent';
        default:             return '';
    }
}

// Inline icon renderers for special cells
function getCellContent(r: number, c: number, type: CellType): React.ReactNode {
    if (type === 'safe') return <span className="text-[8px] select-none opacity-60">⭐</span>;
    if (type === 'center') return <span className="text-base select-none">⭐</span>;
    return null;
}

// ─── Main component ────────────────────────────────────────────────────────
export const GameRoom: React.FC<GameRoomProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
    const { state } = useAppState();
    useEffect(() => { window.scrollTo(0, 0); }, []);
    const [pieces, setPieces] = useState<Piece[]>(buildPieces());
    const [turn, setTurn] = useState<PieceColor>('Red');
    const [diceValue, setDiceValue] = useState<number | null>(null);
    const [diceRolled, setDiceRolled] = useState(false);
    const [rolling, setRolling] = useState(false);
    const [message, setMessage] = useState('');
    const [timeLeft, setTimeLeft] = useState(60);
    const [showQuitModal, setShowQuitModal] = useState(false);

    const isP2P = !!socket && !!socketGame;
    const myColor: PieceColor = isP2P && socketGame?.players?.[0] === user.id ? 'Red' : 'Blue';

    // ── P2P Sync ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isP2P || !socketGame) return;
        if (socketGame.gameState?.pieces?.length > 0) setPieces(socketGame.gameState.pieces);
        if (socketGame.gameState?.diceValue != null) setDiceValue(socketGame.gameState.diceValue);
        if (socketGame.gameState) setDiceRolled(!!socketGame.gameState.diceRolled);
        if (socketGame.turn) setTurn(socketGame.turn === socketGame.players[0] ? 'Red' : 'Blue');
    }, [socketGame]);

    // ── Turn Timer ────────────────────────────────────────────────────────
    useEffect(() => {
        if (socketGame?.winner) return;
        setTimeLeft(60);
        const timer = setInterval(() => {
            if (state.opponentDisconnected) return;
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // Use ref so we always call the latest version (avoids stale closure)
                    handleTimeoutRef.current();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [turn, diceRolled, socketGame?.winner, state.opponentDisconnected]);

    // Stale-closure fix: keep a ref so the setInterval below always calls the
    // latest version of handleTimeout rather than the one from first render.
    const handleTimeoutRef = useRef<() => void>(() => {});

    const handleTimeout = useCallback(() => {
        if (!isP2P || !socket || !socketGame) return;
        playSFX('error');
        if (turn === myColor) {
            socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
            onGameEnd('loss');
        } else {
            socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'TIMEOUT_CLAIM' } });
        }
    }, [isP2P, socket, socketGame, turn, myColor, onGameEnd]);

    handleTimeoutRef.current = handleTimeout;

    // S8 Fix: Ludo bot auto-play for solo games
    useEffect(() => {
        if (isP2P || state.opponentDisconnected) return;
        // Run bot move only when it's NOT the player's turn (i.e., bot's turn) and dice is ready
        if (turn === myColor || diceRolled || !diceValue) return;

        const timer = setTimeout(() => {
            // ... existing bot move logic
            const oppColor: PieceColor = myColor === 'Red' ? 'Blue' : 'Red';
            const botPiecesAll = pieces.filter(p => p.color === oppColor && !p.finished);
            const validPieces = botPiecesAll.filter(p => {
                if (p.step === -1) return diceValue === 6;
                return p.step + diceValue! <= GOAL_STEP;
            });
            if (validPieces.length > 0) {
                const piece = validPieces[Math.floor(Math.random() * validPieces.length)];
                const nextStep = piece.step === -1 ? 0 : piece.step + diceValue!;
                const newPieces = pieces.map(p => p.id === piece.id
                    ? { ...p, step: nextStep, finished: nextStep === GOAL_STEP }
                    : p
                );
                const captured = checkCaptures(newPieces, piece, nextStep);
                if (captured) playSFX('capture');
                const bonusTurn = diceValue === 6 || captured || nextStep === GOAL_STEP;
                // Bot finished 4 pieces = player lost
                const oppCol: PieceColor = myColor === 'Red' ? 'Blue' : 'Red';
                const botFin = newPieces.filter(p => p.color === oppColor && p.finished).length;
                if (botFin === 4) { setPieces(newPieces); onGameEnd('loss'); return; }
                // Player finished 4 pieces = player won
                const myFin = newPieces.filter(p => p.color === myColor && p.finished).length;
                if (myFin === 4) { setPieces(newPieces); onGameEnd('win'); return; }
                setPieces(newPieces);
                setDiceRolled(false);
                setDiceValue(null);
                playSFX('move');
                if (!bonusTurn) setTurn(myColor);
            }
        }, 1200);
        return () => clearTimeout(timer);
    }, [turn, diceRolled, diceValue, isP2P, state.opponentDisconnected]);

    // Bot roll: when it's opponent's turn and dice not rolled in solo mode
    useEffect(() => {
        if (isP2P || state.opponentDisconnected) return;
        // Run bot roll only when it's NOT the player's turn (i.e., bot's turn)
        if (turn === myColor || diceRolled) return;
        const timer = setTimeout(() => {
            if (isP2P || turn === myColor || diceRolled) return;
            const arr = new Uint8Array(1);
            crypto.getRandomValues(arr);
            const val = (arr[0] % 6) + 1;
            setDiceValue(val);
            setDiceRolled(true);
            playSFX('dice');

            // Check if bot has any valid moves, otherwise pass turn
            const oppColor: PieceColor = myColor === 'Red' ? 'Blue' : 'Red';
            const botPieces = pieces.filter(p => p.color === oppColor && !p.finished);
            const canMove = botPieces.some(p => {
                if (p.step === -1 && val === 6) return true;
                if (p.step === -1) return false;
                return p.step + val <= GOAL_STEP;
            });
            if (!canMove) {
                setTimeout(() => {
                    setDiceRolled(false);
                    setDiceValue(null);
                    setTurn(myColor);
                }, 1500);
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [turn, diceRolled, isP2P, state.opponentDisconnected]);

    // ── Roll Dice ─────────────────────────────────────────────────────────
    const handleRoll = () => {
        if (turn !== myColor || diceRolled) return;
        playSFX('dice');
        setRolling(true);
        if (isP2P && socket) {
            socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } });
            setTimeout(() => setRolling(false), 700);
        } else {
            setTimeout(() => {
                // Fix C2 (local): use crypto.getRandomValues for bot games too
                const arr = new Uint8Array(1);
                crypto.getRandomValues(arr);
                const val = (arr[0] % 6) + 1;
                setDiceValue(val);
                setDiceRolled(true);
                setRolling(false);
                const myPieces = pieces.filter(p => p.color === myColor && !p.finished);
                const canMove = myPieces.some(p => {
                    if (p.step === -1 && val === 6) return true;
                    if (p.step === -1) return false;
                    return p.step + val <= GOAL_STEP;
                });
                if (!canMove) {
                    setMessage('No valid moves! Passing turn...');
                    setTimeout(() => {
                        setDiceRolled(false);
                        setDiceValue(null);
                        setMessage('');
                        setTurn(t => t === 'Red' ? 'Blue' : 'Red');
                    }, 1500);
                }
            }, 600);
        }
    };

    // ── Move Piece ──────────────────────────────────────────────────────
    const handlePieceClick = (piece: Piece) => {
        if (turn !== myColor || !diceRolled || !diceValue) return;
        if (piece.color !== myColor || piece.finished) return;

        // entering board from base requires a 6
        if (piece.step === -1 && diceValue !== 6) {
            playSFX('error');
            setMessage('Need a 6 to enter!');
            setTimeout(() => setMessage(''), 1200);
            return;
        }

        // overshoot guard
        const nextStep = piece.step === -1 ? 0 : piece.step + diceValue;
        if (nextStep > GOAL_STEP) {
            playSFX('error');
            setMessage("Can't move — would overshoot home!");
            setTimeout(() => setMessage(''), 1200);
            return;
        }

        if (isP2P && socket) {
            const newPieces = pieces.map(p => p.id === piece.id ? { ...p, step: nextStep, finished: nextStep === GOAL_STEP } : p);
            const captured = checkCaptures(newPieces, piece, nextStep);
            const bonusTurn = diceValue === 6 || captured || nextStep === GOAL_STEP;
            socket.emit('game_action', {
                roomId: socketGame.roomId,
                action: { type: 'MOVE_PIECE', pieces: newPieces, bonusTurn }
            });
            return;
        }

        // Local / bot game
        let newPieces = pieces.map(p => p.id === piece.id
            ? { ...p, step: nextStep, finished: nextStep === GOAL_STEP }
            : p
        );

        const captured = checkCaptures(newPieces, piece, nextStep);
        if (captured) { playSFX('capture'); }

        const bonusTurn = diceValue === 6 || captured || nextStep === GOAL_STEP;

        // win check
        const myFinished = newPieces.filter(p => p.color === myColor && p.finished).length;
        if (myFinished === 4) { setPieces(newPieces); onGameEnd('win'); return; }
        const oppColor: PieceColor = myColor === 'Red' ? 'Blue' : 'Red';
        const oppFinished = newPieces.filter(p => p.color === oppColor && p.finished).length;
        if (oppFinished === 4) { setPieces(newPieces); onGameEnd('loss'); return; }

        setPieces(newPieces);
        setDiceRolled(false);
        setDiceValue(null);
        setMessage('');
        playSFX('move');
        if (!bonusTurn) setTurn(t => t === 'Red' ? 'Blue' : 'Red');
        else setMessage(nextStep === GOAL_STEP ? '🎉 Piece home! Bonus turn!' : '🎲 Bonus turn!');
    };

    // Capture logic: if a piece lands on an occupied non-safe track cell, send opponents home
    function checkCaptures(newPieces: Piece[], movedPiece: Piece, nextStep: number): boolean {
        if (nextStep <= -1 || nextStep > 51) return false; // can't capture in home stretch or base
        const trackOffset = movedPiece.color === 'Blue' ? 26 : 0;
        const myBoardIdx = (nextStep + trackOffset) % 52;
        const myCell = MAIN_TRACK[myBoardIdx];
        if (!myCell) return false;
        if (SAFE_POSITIONS.has(myBoardIdx)) return false;

        let captured = false;
        const oppColor: PieceColor = movedPiece.color === 'Red' ? 'Blue' : 'Red';
        newPieces.forEach(p => {
            if (p.color !== oppColor || p.step <= -1 || p.step > 51 || p.finished) return;
            const oppOffset = p.color === 'Blue' ? 26 : 0;
            const oppBoardIdx = (p.step + oppOffset) % 52;
            const oppCell = MAIN_TRACK[oppBoardIdx];
            if (oppCell && oppCell[0] === myCell[0] && oppCell[1] === myCell[1]) {
                p.step = -1; captured = true;
            }
        });
        return captured;
    }

    // ── Board Rendering ───────────────────────────────────────────────────
    // Collect which pieces are on each cell for multi-piece stacking
    const cellPieces: Map<string, Piece[]> = new Map();
    pieces.forEach(p => {
        if (p.step === -1 || p.finished) return;
        const pos = getBoardPosition(p);
        if (!pos) return;
        const key = `${pos[0]},${pos[1]}`;
        if (!cellPieces.has(key)) cellPieces.set(key, []);
        cellPieces.get(key)!.push(p);
    });

    const isMyTurn = turn === myColor;
    const oppId = isP2P ? socketGame?.players?.find((id: string) => id !== user.id) : null;
    const oppName = isP2P ? (socketGame?.profiles?.[oppId]?.name || 'Opponent') : 'Bot 🤖';
    const oppAvatar = isP2P ? (socketGame?.profiles?.[oppId]?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${oppId}`) : `https://api.dicebear.com/7.x/bottts/svg?seed=bot`;
    const myFinished = pieces.filter(p => p.color === myColor && p.finished).length;
    const oppFinished = pieces.filter(p => p.color !== myColor && p.finished).length;

    return (
        <div className="h-[100dvh] overflow-y-auto bg-gradient-to-b from-[#08081a] via-[#0d0d22] to-[#06060f] flex flex-col items-center select-none">

            {/* ── Quit Modal ── */}
            <AnimatePresence>
                {showQuitModal && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowQuitModal(false)}
                            className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
                            className="relative bg-[#12122a] border border-red-500/40 rounded-3xl p-8 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.8)] shadow-red-950/50 z-10">
                            <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                                <ArrowLeft size={26} className="text-red-400" />
                            </div>
                            <h2 className="text-white font-bold text-xl mb-2 text-center">Forfeit Match?</h2>
                            <p className="text-slate-400 text-sm text-center mb-6">Leaving now counts as an <span className="text-red-400 font-bold">immediate loss</span> and stake is forfeited.</p>
                            <div className="flex gap-3">
                                <button onClick={() => setShowQuitModal(false)} className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/10 transition-colors">Stay</button>
                                <button onClick={() => { if (isP2P && socket) socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } }); onGameEnd('quit'); }} className="flex-1 py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl shadow-[0_4px_15px_rgba(220,38,38,0.3)] transition-colors">Forfeit</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Header ── */}
            <div className="w-full max-w-[500px] flex items-center justify-between px-4 pt-3 pb-2">
                <button onClick={() => setShowQuitModal(true)} className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors active:scale-95">
                    <ArrowLeft size={18} className="text-slate-400" />
                </button>
                <div className="flex flex-col items-center">
                    <div className="text-[10px] text-gold-500/70 uppercase tracking-widest font-bold">Prize Pool</div>
                    <div className="text-gold-400 font-black text-xl drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]">{Math.max(0, table.stake) > 0 ? `💰 ${(table.stake * 2).toLocaleString()} FCFA` : '💰 Practice'}</div>
                </div>
                <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    timeLeft <= 10 ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-white/5 border-white/10 text-slate-400'
                }`}>
                    <span className="text-[9px] opacity-70 uppercase">Time</span>
                    <span className="font-mono text-base">{timeLeft}s</span>
                </div>
            </div>

            {/* ── Player Cards ── */}
            <div className="w-full max-w-[500px] flex justify-between px-4 mb-2 gap-3">
                {/* My card */}
                <div className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-all duration-300 ${
                    isMyTurn
                        ? myColor === 'Red'
                            ? 'bg-red-500/15 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                            : 'bg-blue-500/15 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                        : 'bg-white/3 border-white/8'
                }`}>
                    <div className="relative">
                        <img src={user.avatar} className="w-8 h-8 rounded-full border-2" style={{ borderColor: myColor === 'Red' ? '#ef4444' : '#3b82f6' }} alt="me" />
                        {isMyTurn && <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-green-400 border border-[#0d0d22] animate-pulse" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{user.name}</p>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ background: myColor === 'Red' ? '#ef4444' : '#3b82f6' }} />
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest">{myColor}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[9px] text-slate-500">Home</div>
                        <div className="text-sm font-black" style={{ color: myColor === 'Red' ? '#f87171' : '#60a5fa' }}>{myFinished}/4</div>
                    </div>
                </div>
                {/* VS */}
                <div className="flex items-center text-slate-700 font-black text-xs">VS</div>
                {/* Opp card */}
                <div className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-all duration-300 ${
                    !isMyTurn
                        ? turn === 'Red'
                            ? 'bg-red-500/15 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                            : 'bg-blue-500/15 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                        : 'bg-white/3 border-white/8'
                }`}>
                    <div className="relative">
                        <img src={oppAvatar} className="w-8 h-8 rounded-full border-2" style={{ borderColor: myColor === 'Red' ? '#3b82f6' : '#ef4444' }} alt="opp" />
                        {!isMyTurn && <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-green-400 border border-[#0d0d22] animate-pulse" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{oppName}</p>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ background: myColor === 'Red' ? '#3b82f6' : '#ef4444' }} />
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest">{myColor === 'Red' ? 'Blue' : 'Red'}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[9px] text-slate-500">Home</div>
                        <div className="text-sm font-black" style={{ color: myColor === 'Red' ? '#60a5fa' : '#f87171' }}>{oppFinished}/4</div>
                    </div>
                </div>
            </div>

            {/* ── Turn Banner ── */}
            <div className={`w-full max-w-[520px] mb-3 py-2 rounded-xl text-center text-sm font-bold tracking-wide transition-all duration-300 ${isMyTurn
                ? 'bg-gold-500/20 border border-gold-500/50 text-gold-300'
                : 'bg-white/4 border border-white/10 text-slate-500'}`}>
                {isMyTurn ? `✨ Your Turn (${myColor})` : `Opponent's Turn (${turn})...`}
            </div>

            {/* ── Player Labels ── */}
            <div className="w-full max-w-[520px] flex justify-between mb-2 px-1">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${turn === 'Blue' ? 'bg-blue-500/20 border-blue-500/60 text-blue-300' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                    <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    {isP2P && socketGame ? (socketGame.profiles?.[socketGame.players?.[1]]?.name || 'Blue') : 'Blue'}
                    {pieces.filter(p => p.color === 'Blue' && p.finished).length > 0 && (
                        <span className="text-blue-400">🏠{pieces.filter(p => p.color === 'Blue' && p.finished).length}</span>
                    )}
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${turn === 'Red' ? 'bg-red-500/20 border-red-500/60 text-red-300' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                    {pieces.filter(p => p.color === 'Red' && p.finished).length > 0 && (
                        <span className="text-red-400">🏠{pieces.filter(p => p.color === 'Red' && p.finished).length}</span>
                    )}
                    {isP2P && socketGame ? (socketGame.profiles?.[socketGame.players?.[0]]?.name || 'Red') : 'Red'}
                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                </div>
            </div>

            {/* ── Board Container ── */}
            <div className="relative flex-shrink-0 px-2" style={{ width: 'min(96vw, 510px)', aspectRatio: '1' }}>
                {/* Subtle glow ring behind board */}
                <div className="absolute -inset-2 rounded-3xl" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(251,191,36,0.05) 0%, transparent 70%)' }} />
                <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-[0_4px_60px_rgba(0,0,0,0.8)] border border-white/8">
                {/* 15×15 CSS grid */}
                <div className="absolute inset-0 grid grid-cols-15 grid-rows-15"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)' }}>
                    {Array.from({ length: 15 }, (_, r) =>
                        Array.from({ length: 15 }, (_, c) => {
                            const type = getCellType(r, c);
                            return (
                                <div
                                    key={`${r}-${c}`}
                                    className={`relative flex items-center justify-center ${getCellStyle(type)}`}
                                    style={{ fontSize: '0.45rem' }}
                                >
                                    {getCellContent(r, c, type)}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* ── Home base circles (in-corner visuals) ── */}
                {/* Blue home base */}
                <div className="absolute top-[2%] left-[2%] w-[38%] h-[38%] flex items-center justify-center">
                    <div className="w-[85%] h-[85%] rounded-2xl border-2 border-blue-500/60 bg-blue-900/40 flex flex-wrap gap-2 items-center justify-center p-3">
                        {BLUE_BASE_POSITIONS.map((_, idx) => {
                            const piece = pieces.find(p => p.color === 'Blue' && p.id === idx + 4 && p.step === -1 && !p.finished);
                            return (
                                <div key={idx}
                                    className={`w-[38%] aspect-square rounded-full border-2 transition-all duration-200 ${piece
                                        ? (turn === 'Blue' && diceValue === 6
                                            ? 'bg-gradient-to-br from-blue-400 to-blue-600 border-white shadow-[0_0_16px_rgba(59,130,246,0.8)] scale-110 cursor-pointer animate-pulse'
                                            : 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-300/50 cursor-pointer hover:scale-105')
                                        : 'bg-blue-950 border-blue-800/30 opacity-30'}`}
                                    onClick={() => piece && handlePieceClick(piece)}
                                >
                                    {piece && <div className="w-full h-full rounded-full flex items-center justify-center">
                                        <div className="w-1/2 h-1/2 rounded-full bg-white/20" />
                                    </div>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Red home base */}
                <div className="absolute bottom-[2%] right-[2%] w-[38%] h-[38%] flex items-center justify-center">
                    <div className="w-[85%] h-[85%] rounded-2xl border-2 border-red-500/60 bg-red-900/40 flex flex-wrap gap-2 items-center justify-center p-3">
                        {RED_BASE_POSITIONS.map((_, idx) => {
                            const piece = pieces.find(p => p.color === 'Red' && p.id === idx && p.step === -1 && !p.finished);
                            return (
                                <div key={idx}
                                    className={`w-[38%] aspect-square rounded-full border-2 transition-all duration-200 ${piece
                                        ? (turn === 'Red' && diceValue === 6
                                            ? 'bg-gradient-to-br from-red-400 to-red-600 border-white shadow-[0_0_16px_rgba(239,68,68,0.8)] scale-110 cursor-pointer animate-pulse'
                                            : 'bg-gradient-to-br from-red-500 to-red-700 border-red-300/50 cursor-pointer hover:scale-105')
                                        : 'bg-red-950 border-red-800/30 opacity-30'}`}
                                    onClick={() => piece && handlePieceClick(piece)}
                                >
                                    {piece && <div className="w-full h-full rounded-full flex items-center justify-center">
                                        <div className="w-1/2 h-1/2 rounded-full bg-white/20" />
                                    </div>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                    {/* ── Inactive corners ── */}
                    <div className="absolute top-[2%] right-[2%] w-[38%] h-[38%] rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/80 border border-white/4 flex items-center justify-center">
                        <div className="text-slate-800/60 font-black text-3xl select-none">🙈</div>
                    </div>
                    <div className="absolute bottom-[2%] left-[2%] w-[38%] h-[38%] rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/80 border border-white/4 flex items-center justify-center">
                        <div className="text-slate-800/60 font-black text-3xl select-none">🙉</div>
                    </div>

                {/* ── Track pieces ── */}
                <AnimatePresence>
                    {pieces.map(piece => {
                        if (piece.step === -1 || piece.finished) return null;
                        const pos = getBoardPosition(piece);
                        if (!pos) return null;
                        const [row, col] = pos;

                        // How many pieces share this cell (for stacking offset)
                        const cellKey = `${row},${col}`;
                        const stack = cellPieces.get(cellKey) || [];
                        const stackIdx = stack.findIndex(p => p.id === piece.id);
                        const offsetX = stackIdx * 4;
                        const offsetY = stackIdx * 4;

                        const isMovable = turn === myColor && turn === piece.color && diceRolled && diceValue !== null &&
                            !(piece.step === -1 && diceValue !== 6) &&
                            piece.step + (diceValue || 0) <= GOAL_STEP;

                        const cellSize = 100 / 15; // % per cell
                        const top = row * cellSize + cellSize / 2;
                        const left = col * cellSize + cellSize / 2;

                        return (
                            <motion.div
                                key={piece.id}
                                layoutId={`piece-${piece.id}`}
                                animate={{
                                    top: `${top}%`,
                                    left: `${left}%`,
                                    x: `-50%`,
                                    y: `-50%`,
                                    scale: isMovable ? 1.15 : 1,
                                }}
                                style={{ position: 'absolute', marginLeft: offsetX, marginTop: offsetY }}
                                transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                                onClick={() => handlePieceClick(piece)}
                                className={`
                                    w-[5.5%] aspect-square rounded-full border-2
                                    flex items-center justify-center
                                    cursor-pointer z-30 shadow-md
                                    ${piece.color === 'Red'
                                        ? 'bg-gradient-to-br from-red-400 to-red-700 border-red-200'
                                        : 'bg-gradient-to-br from-blue-400 to-blue-700 border-blue-200'
                                    }
                                    ${isMovable ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-transparent animate-pulse' : ''}
                                `}
                            >
                                <div className="w-2/5 h-2/5 rounded-full bg-white/30" />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                </div>
            </div>

            {/* ── Controls ── */}
            <div className="w-full max-w-[500px] mt-4 px-4 flex flex-col items-center gap-3">
                {/* Turn label */}
                <div className={`w-full py-2 rounded-xl text-center text-xs font-bold tracking-widest uppercase border transition-all duration-300 ${
                    isMyTurn ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'bg-white/3 border-white/8 text-slate-500'
                }`}>
                    {isMyTurn ? `🎲 Your Turn — ${myColor}` : `Waiting for ${oppName}...`}
                </div>

                {/* Informational message */}
                <AnimatePresence>
                    {message && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="text-gold-400 text-sm font-bold bg-gold-500/10 border border-gold-500/30 px-4 py-2 rounded-xl">
                            {message}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Dice + Roll button row */}
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                        <AnimatedDice value={diceValue} rolling={rolling} />
                        {!diceValue && <span className="text-slate-600 text-xs mt-1">Roll to play</span>}
                    </div>

                    {isMyTurn && !diceRolled && !rolling && (
                        <motion.button
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            whileTap={{ scale: 0.93 }}
                            onClick={handleRoll}
                            className="bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 text-royal-950 font-black px-10 py-3.5 rounded-2xl shadow-[0_0_24px_rgba(251,191,36,0.35)] text-base transition-all"
                        >
                            🎲 ROLL
                        </motion.button>
                    )}

                    {isMyTurn && diceRolled && (
                        <div className="text-gold-400 text-sm font-bold animate-bounce">
                            Pick a piece ↙
                        </div>
                    )}

                    {!isMyTurn && (
                        <div className="text-slate-600 text-sm font-mono animate-pulse">
                            Opponent rolling...
                        </div>
                    )}
                </div>

                {/* Finished pieces tally */}
                <div className="flex gap-8 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-blue-400 font-bold">
                            {pieces.filter(p => p.color === 'Blue' && p.finished).length}/4 home
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-red-400 font-bold">
                            {pieces.filter(p => p.color === 'Red' && p.finished).length}/4 home
                        </span>
                    </div>
                </div>
            </div>

            {/* ── P2P Chat ── */}
            {isP2P && socketGame && (
                <GameChat
                    messages={socketGame.chat || []}
                    onSendMessage={(msg: string) => socket?.emit('game_action', { roomId: socketGame.roomId, action: { type: 'CHAT', message: msg } })}
                    currentUserId={user.id}
                    profiles={socketGame.profiles || {}}
                />
            )}
        </div>
    );
};
