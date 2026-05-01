import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Ball, createBall, stepPhysics, isMoving } from '../game-graphics/physics';
import { rackBalls, placeCueBall } from '../game-graphics/setup';
import { drawTable, drawBall, drawCue, drawAimLine } from '../game-graphics/renderer';
import {
    MAX_POWER, BALL_RADIUS, BALL_COLORS,
    FIELD_LEFT, FIELD_TOP, FIELD_RIGHT, FIELD_BOTTOM, TABLE_WIDTH, TABLE_HEIGHT, CUSHION_THICKNESS,
} from '../game-graphics/constants';
import { Table, User } from '../types';
import { Socket } from 'socket.io-client';
import { playSFX } from '../services/sound';

type GamePhase = 'aiming' | 'shooting' | 'place_cue' | 'game_over';
type PlayerGroup = 'solids' | 'stripes' | null;

interface PlayerState {
    name: string;
    group: PlayerGroup;
    ballsPocketed: number[];
    id: string;
}

interface PoolGameProps {
    table: Table;
    user: User;
    onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
    socket?: Socket | null;
    socketGame?: any;
}

function getGroup(id: number): PlayerGroup {
    if (id === 0 || id === 8) return null;
    return id <= 7 ? 'solids' : 'stripes';
}

export const PoolGame: React.FC<PoolGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ballsRef = useRef<Ball[]>(rackBalls());
    const tableGfxRef = useRef<HTMLCanvasElement | null>(null);
    const frameRef = useRef<number>(0);
    const runningRef = useRef(false);

    const [balls, setBalls] = useState<Ball[]>(ballsRef.current);
    const [phase, setPhase] = useState<GamePhase>('aiming');
    const [turn, setTurn] = useState<0 | 1>(0);
    const [players, setPlayers] = useState<[PlayerState, PlayerState]>([
        { name: 'Player 1', group: null, ballsPocketed: [], id: '' },
        { name: 'Player 2', group: null, ballsPocketed: [], id: '' },
    ]);
    const [winner, setWinner] = useState<string | null>(null);
    const [message, setMessage] = useState<string>('Your turn');
    const [shotCount, setShotCount] = useState(0);
    const [myGroupP1, setMyGroupP1] = useState<PlayerGroup>(null);

    const [aimAngle, setAimAngle] = useState(0);
    const [power, setPower] = useState(0.5);
    const [spin, setSpin] = useState(0);
    const [sidespin, setSidespin] = useState(0);
    const [pullback, setPullback] = useState(0);
    const [showAim, setShowAim] = useState(true);

    const mousePos = useRef({ x: 0, y: 0 });
    const isDown = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const scaleRef = useRef(1);
    const offsetRef = useRef({ x: 0, y: 0 });
    const isMyTurn = useRef(false);

    useEffect(() => {
        if (!socket) return;
        socket.on('connect', () => setMessage('Connected!'));
        socket.on('match_found', (room: any) => {
            const myIdx = room.players.indexOf(user?.id);
            isMyTurn.current = myIdx === 0;
            setTurn(myIdx as 0 | 1);
            setPhase('aiming');
            setMessage(isMyTurn.current ? 'Your turn - Break!' : 'Opponent\'s turn');
            if (room.gameState?.balls) {
                ballsRef.current = room.gameState.balls;
                setBalls(room.gameState.balls);
            }
            setPlayers([
                { name: room.profiles[room.players[0]]?.name || 'Player 1', group: null, ballsPocketed: [], id: room.players[0] },
                { name: room.profiles[room.players[1]]?.name || 'Player 2', group: null, ballsPocketed: [], id: room.players[1] },
            ]);
        });
        socket.on('game_update', (room: any) => {
            if (room.gameState?.balls) {
                ballsRef.current = room.gameState.balls;
                setBalls(room.gameState.balls);
                runningRef.current = false;
                if (frameRef.current) cancelAnimationFrame(frameRef.current);
            }
            if (room.turn) {
                const newTurn = room.players.indexOf(room.turn);
                setTurn(newTurn as 0 | 1);
                isMyTurn.current = room.turn === user?.id;
                setMessage(isMyTurn.current ? 'Your turn' : 'Opponent\'s turn');
            }
            // Handle turn end logic
            const justPocketed = ballsRef.current.filter(b => b.justPocketed);
            const cueScratch = justPocketed.some(b => b.id === 0);
            const eightPocketed = justPocketed.some(b => b.id === 8);
            
            if (eightPocketed) {
                setPhase('game_over');
                const myIdx = room.players.indexOf(user?.id);
                const won = myIdx === room.winner;
                setWinner(won ? 'You' : 'Opponent');
                setMessage(won ? 'You Win!' : 'You Lose');
                playSFX(won ? 'win' : 'loss');
                onGameEnd(won ? 'win' : 'loss');
            } else if (cueScratch) {
                setPhase('place_cue');
                setMessage('Scratch! Place cue ball');
            } else {
                setPhase('aiming');
            }
        });
        socket.on('game_over', (data: any) => {
            setPhase('game_over');
            const won = data.winner === user?.id;
            setWinner(won ? 'You' : 'Opponent');
            setMessage(won ? 'You Win!' : 'You Lose');
            playSFX(won ? 'win' : 'loss');
            onGameEnd(won ? 'win' : 'loss');
        });
        return () => {
            socket.off('connect');
            socket.off('match_found');
            socket.off('game_update');
            socket.off('game_over');
        };
    }, [socket, user, table.id, onGameEnd]);

    useEffect(() => {
        const offscreen = document.createElement('canvas');
        offscreen.width = TABLE_WIDTH + CUSHION_THICKNESS * 2;
        offscreen.height = TABLE_HEIGHT + CUSHION_THICKNESS * 2;
        const octx = offscreen.getContext('2d')!;
        drawTable(octx);
        tableGfxRef.current = offscreen;
    }, []);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !tableGfxRef.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = '#1a1205';
        ctx.fillRect(0, 0, W, H);

        const tableW = TABLE_WIDTH + CUSHION_THICKNESS * 2;
        const tableH = TABLE_HEIGHT + CUSHION_THICKNESS * 2;
        const scale = Math.min(W / (tableW + 40), H / (tableH + 40));
        scaleRef.current = scale;
        const ox = (W - tableW * scale) / 2;
        const oy = (H - tableH * scale) / 2;
        offsetRef.current = { x: ox, y: oy };

        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(scale, scale);
        ctx.drawImage(tableGfxRef.current, 0, 0);

        // Offset to physics coordinate space (past wood frame + cushion)
        const WOOD = 22;
        ctx.translate(WOOD + CUSHION_THICKNESS, WOOD + CUSHION_THICKNESS);

        const cueBall = ballsRef.current.find(b => b.id === 0);
        if (phase === 'aiming' && cueBall && !cueBall.pocketed && showAim && isMyTurn.current) {
            drawAimLine(ctx, cueBall.x, cueBall.y, aimAngle, ballsRef.current);
        }
        if (phase === 'aiming' && cueBall && !cueBall.pocketed && isMyTurn.current) {
            drawCue(ctx, cueBall.x, cueBall.y, aimAngle + Math.PI, power, pullback);
        }

        const activeBalls = ballsRef.current.filter(b => !b.pocketed);
        for (const b of activeBalls) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.ellipse(b.x + 4, b.y + 6, BALL_RADIUS * 0.9, BALL_RADIUS * 0.45, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fill();
            ctx.restore();
        }
        for (const b of activeBalls) {
            drawBall(ctx, b);
        }
        ctx.restore();
    }, [phase, aimAngle, power, pullback, showAim]);

    const gameLoop = useCallback(() => {
        if (!runningRef.current) return;

        const { newBalls, pocketedThisStep } = stepPhysics(ballsRef.current, 1);
        ballsRef.current = newBalls;
        setBalls(ballsRef.current.slice());

        if (!isMoving(ballsRef.current)) {
            runningRef.current = false;
            if (frameRef.current) cancelAnimationFrame(frameRef.current);

            const justPocketed = ballsRef.current.filter(ball => ball.justPocketed);
            const cueScratch = justPocketed.some(ball => ball.id === 0);
            const eightPocketed = justPocketed.some(ball => ball.id === 8);

            // If justPocketed flags were reset (multi-frame settle), use accumulated IDs
            const reallyPocketed = justPocketed.length > 0 ? justPocketed
                : pocketedThisStep.length > 0 ? pocketedThisStep.map(id => ballsRef.current.find(b => b.id === id)).filter(Boolean)
                : [];

            const hasScratch = reallyPocketed.some((ball: any) => ball.id === 0 || (ball as Ball).id === 0);
            const hasEightBall = reallyPocketed.some((ball: any) => ball.id === 8 || (ball as Ball).id === 8);

            handleTurnEnd(reallyPocketed as Ball[], hasScratch, hasEightBall);
            
            // Emit move to server
            if (socket) {
                socket.emit('game_action', {
                    roomId: table.id,
                    newState: {
                        balls: ballsRef.current,
                        shotCount: shotCount + 1,
                        lastMoveTime: Date.now()
                    }
                });
                setShotCount(c => c + 1);
            }
        } else {
            frameRef.current = requestAnimationFrame(gameLoop);
        }
    }, [socket, table.id, shotCount]);

    const startLoop = useCallback(() => {
        runningRef.current = true;
        setPhase('shooting');
        gameLoop();
    }, [gameLoop]);

    const handleTurnEnd = useCallback((justPocketed: Ball[], cueScratch: boolean, eightPocketed: boolean) => {
        setPlayers(prev => {
            const next: [PlayerState, PlayerState] = [
                { ...prev[0], ballsPocketed: [...prev[0].ballsPocketed] },
                { ...prev[1], ballsPocketed: [...prev[1].ballsPocketed] }
            ];

            const solids = justPocketed.filter(b => getGroup(b.id) === 'solids').length;
            const stripes = justPocketed.filter(b => getGroup(b.id) === 'stripes').length;

            if (next[turn].group === null && (solids > 0 || stripes > 0)) {
                const other = turn === 0 ? 1 : 0;
                if (solids >= stripes) {
                    next[turn].group = 'solids';
                    next[other].group = 'stripes';
                } else {
                    next[turn].group = 'stripes';
                    next[other].group = 'solids';
                }
                if (isMyTurn.current) setMyGroupP1(next[turn].group);
            }

            for (const b of justPocketed) {
                if (b.id === 0 || b.id === 8) continue;
                const grp = getGroup(b.id);
                if (grp) {
                    for (let p = 0; p < 2; p++) {
                        if (next[p].group === grp) next[p].ballsPocketed.push(b.id);
                    }
                }
            }
            return next;
        });

        if (eightPocketed) {
            setPhase('game_over');
            return;
        }

        if (cueScratch) {
            setMessage('Scratch!');
            setPhase('place_cue');
            setTurn(t => t === 0 ? 1 : 0);
            return;
        }

        const solidIds = [1, 2, 3, 4, 5, 6, 7];
        const pocketedOwn = justPocketed.filter(b => {
            const g = getGroup(b.id);
            return g && g === players[turn].group;
        }).length;

        const keepTurn = pocketedOwn > 0;

        if (keepTurn) {
            setMessage('Nice shot!');
            setPhase('aiming');
        } else {
            const next = (turn === 0 ? 1 : 0) as 0 | 1;
            setTurn(next);
            isMyTurn.current = next === 0;
            setMessage(isMyTurn.current ? 'Your turn' : 'Opponent\'s turn');
            setPhase('aiming');
        }
    }, [turn, players]);

    const canvasToTable = useCallback((cx: number, cy: number) => {
        const { x: ox, y: oy } = offsetRef.current;
        const scale = scaleRef.current;
        const WOOD = 22;
        // Mouse is in screen space; convert to physics space
        // Physics space = (screen - offset) / scale - (WOOD + CUSHION)
        return {
            x: (cx - ox) / scale - (WOOD + CUSHION_THICKNESS),
            y: (cy - oy) / scale - (WOOD + CUSHION_THICKNESS),
        };
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const { x: tx, y: ty } = canvasToTable(cx, cy);
        mousePos.current = { x: tx, y: ty };

        if (phase === 'aiming' && isMyTurn.current) {
            const cueBall = ballsRef.current.find(b => b.id === 0);
            if (cueBall) {
                setAimAngle(Math.atan2(ty - cueBall.y, tx - cueBall.x) + Math.PI);
                if (isDown.current) {
                    const newPullback = Math.max(0, Math.min(1, (e.clientY - dragStart.current.y) / 80));
                    setPullback(newPullback);
                    setPower(newPullback);
                }
            }
        }
        render();
    }, [phase, canvasToTable, render]);

    const handleMouseDown = useCallback((e: MouseEvent) => {
        isDown.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (!isDown.current) return;
        isDown.current = false;

        if (phase === 'aiming' && isMyTurn.current && pullback > 0.02) {
            shoot(pullback);
        } else if (phase === 'place_cue') {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
            const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
            const { x: tx, y: ty } = canvasToTable(cx, cy);

            const nx = Math.max(FIELD_LEFT + BALL_RADIUS + 2, Math.min(FIELD_RIGHT - BALL_RADIUS - 2, tx));
            const ny = Math.max(FIELD_TOP + BALL_RADIUS + 2, Math.min(FIELD_BOTTOM - BALL_RADIUS - 2, ty));
            const valid = ballsRef.current.filter(b => b.id !== 0 && !b.pocketed).every(b => {
                const dx = nx - b.x, dy = ny - b.y;
                return Math.sqrt(dx * dx + dy * dy) > BALL_RADIUS * 2 + 2;
            });

            if (valid && socket) {
                ballsRef.current = placeCueBall(ballsRef.current, nx, ny);
                setBalls(ballsRef.current.slice());
                setPhase('aiming');
                setMessage('Your turn');
                socket.emit('game_action', { roomId: table.id, newState: { balls: ballsRef.current, ballInHand: false, lastMoveTime: Date.now() } });
            }
        }
    }, [phase, pullback, canvasToTable, socket, table.id, startLoop]);

    const shoot = useCallback((pw: number) => {
        if (!isMyTurn.current || phase !== 'aiming') return;
        const cueIdx = ballsRef.current.findIndex(b => b.id === 0);
        if (cueIdx === -1) return;

        const shotPower = pw * MAX_POWER;
        ballsRef.current[cueIdx].vx = Math.cos(aimAngle + Math.PI) * shotPower;
        ballsRef.current[cueIdx].vy = Math.sin(aimAngle + Math.PI) * shotPower;
        ballsRef.current[cueIdx].spin = spin * 3;
        ballsRef.current[cueIdx].sidespin = sidespin * 3;

        setPhase('shooting');
        setPower(0.5);
        setPullback(0);
        playSFX('shoot');
        startLoop();
    }, [phase, aimAngle, spin, sidespin, startLoop]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onResize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            render();
        };
        window.addEventListener('resize', onResize);
        onResize();
        return () => {
            window.removeEventListener('resize', onResize);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [render]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);
        return () => {
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseDown, handleMouseUp]);

    useEffect(() => {
        render();
    }, [render, phase, aimAngle, pullback, showAim, turn, message]);

    const powerPct = Math.round(power * 100);
    const isMyTurnActive = isMyTurn.current && phase !== 'game_over';

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white select-none overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="text-2xl">🎱</div>
                    <div>
                        <h1 className="text-lg font-bold text-yellow-400">8-Ball Pool</h1>
                        <p className="text-xs text-gray-400">P2P Battle</p>
                    </div>
                </div>
                <div className="flex-1 text-center">
                    <span className="text-sm font-semibold text-white">{message}</span>
                </div>
                <div className="text-sm text-gray-400">Shot #{shotCount}</div>
            </div>

            <div className="flex-1 relative bg-gray-950">
                <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />

                {phase === 'aiming' && isMyTurnActive && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur rounded-xl px-5 py-2.5 border border-gray-700">
                        <button onClick={() => setShowAim(s => !s)} className={`text-xs px-3 py-1 rounded-lg ${showAim ? 'bg-yellow-500/80 text-gray-900' : 'bg-gray-700'}`}>
                            Guide {showAim ? 'ON' : 'OFF'}
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Power</span>
                            <div className="flex gap-0.5">
                                {Array.from({ length: 10 }, (_, i) => (
                                    <div key={i} onClick={() => setPower((i + 1) / 10)} className="w-3 h-5 rounded-sm cursor-pointer" style={{
                                        background: i < Math.round(power * 10) ? i < 4 ? '#22c55e' : i < 7 ? '#eab308' : '#ef4444' : 'rgba(255,255,255,0.1)',
                                    }} />
                                ))}
                            </div>
                            <span className="text-xs font-bold">{powerPct}%</span>
                        </div>
                        <button onClick={() => shoot(power)} className="bg-red-600 hover:bg-red-500 px-5 py-1.5 rounded-lg font-bold">SHOOT</button>
                    </div>
                )}

                {phase === 'shooting' && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 border border-gray-600 rounded-xl px-6 py-2">⏳ Balls rolling...</div>
                )}

                {!isMyTurn.current && phase === 'aiming' && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-900/80 border border-blue-500 rounded-xl px-6 py-2">Opponent's turn</div>
                )}

                {phase === 'game_over' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                        <div className="bg-gray-900 border-2 border-yellow-500 rounded-2xl p-10 text-center">
                            <div className="text-6xl mb-4">🏆</div>
                            <h2 className="text-3xl font-black text-yellow-400 mb-2">{winner} Wins!</h2>
                            <button onClick={() => onGameEnd('quit')} className="bg-yellow-500 text-gray-900 font-black px-8 py-3 rounded-xl mt-4">Back to Lobby</button>
                        </div>
                    </div>
                )}
            </div>

            <PlayerPanel player={players[turn]} isActive={phase !== 'game_over'} balls={balls} />
        </div>
    );
};

function PlayerPanel({ player, isActive, balls }: { player: PlayerState; isActive: boolean; balls: Ball[] }) {
    const solidIds = [1, 2, 3, 4, 5, 6, 7];
    const stripeIds = [9, 10, 11, 12, 13, 14, 15];
    const myIds = player.group === 'solids' ? solidIds : player.group === 'stripes' ? stripeIds : [];
    const remaining = myIds.filter(id => !balls.find(b => b.id === id && b.pocketed));
    const pocketed = myIds.filter(id => balls.find(b => b.id === id && b.pocketed));

    return (
        <div className={`shrink-0 bg-gray-900 border-t ${isActive ? 'border-yellow-500' : 'border-gray-700'} p-3 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
                {isActive && <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />}
                <span className={`font-bold ${isActive ? 'text-yellow-300' : 'text-gray-400'}`}>{player.name}</span>
                <span className="text-xs text-gray-500">{player.group ?? 'TBD'}</span>
            </div>
            <div className="flex gap-1">
                {remaining.map(id => <BallIcon key={id} id={id} />)}
            </div>
            <div className="text-xl font-black">{pocketed.length}<span className="text-gray-500 text-sm">/7</span></div>
        </div>
    );
}

function BallIcon({ id }: { id: number }) {
    const color = BALL_COLORS[id] ?? '#888';
    return (
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{
            background: color,
            color: id === 8 ? '#fff' : '#222',
        }}>{id}</div>
    );
}