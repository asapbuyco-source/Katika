import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Ball, createBall, stepPhysics, isMoving } from '../game-graphics/physics';
import { rackBalls, placeCueBall } from '../game-graphics/setup';
import { drawTable, drawBall, drawCue, drawAimLine } from '../game-graphics/renderer';
import {
    MAX_POWER, BALL_RADIUS, BALL_COLORS, BALL_IS_STRIPE,
    FIELD_LEFT, FIELD_TOP, FIELD_RIGHT, FIELD_BOTTOM,
    TABLE_WIDTH, TABLE_HEIGHT, CUSHION_THICKNESS,
} from '../game-graphics/constants';
import { Table, User } from '../types';
import { Socket } from 'socket.io-client';
import { playSFX, playPoolSound } from '../services/sound';

type GamePhase = 'aiming' | 'shooting' | 'place_cue' | 'game_over' | 'opponent_shooting';
type PlayerGroup = 'solids' | 'stripes' | null;

interface PlayerState {
    name: string;
    group: PlayerGroup;
    ballsPocketed: number[];
    id: string;
    elo: number;
    avatar: string;
}

interface PoolGameProps {
    table: Table;
    user: User;
    onGameEnd: (result: 'win' | 'loss' | 'quit' | 'draw') => void;
    socket?: Socket | null;
    isBotMode?: boolean;
    botDifficulty?: 'easy' | 'medium' | 'hard';
}

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];
const EIGHT_BALL = 8;
const CUE_BALL = 0;
const WOOD = 22;

function getGroup(id: number): PlayerGroup {
    if (id === 0 || id === 8) return null;
    return id <= 7 ? 'solids' : 'stripes';
}

function getGroupCleared(balls: Ball[], group: PlayerGroup): boolean {
    if (!group) return false;
    return balls.filter(b =>
        !b.pocketed && b.id !== 0 && b.id !== 8 &&
        ((group === 'solids' && b.id < 8) || (group === 'stripes' && b.id > 8))
    ).length === 0;
}

// Full game state for P2P sync (S3 fix)
interface FullGameState {
    balls: Ball[];
    turn: 0 | 1;
    players: [PlayerState, PlayerState];
    phase: GamePhase;
    shotCount: number;
    firstHit: number | null;
    foul: boolean;
    winner: string | null;
}

export const PoolGame: React.FC<PoolGameProps> = ({ table, user, onGameEnd, socket, isBotMode, botDifficulty = 'medium' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ballsRef = useRef<Ball[]>(rackBalls());
    const tableGfxRef = useRef<HTMLCanvasElement | null>(null);
    const frameRef = useRef<number>(0);
    const runningRef = useRef(false);

    // S2 fix: store my player index
    const myIdxRef = useRef<number>(0);

    // All mutable game state in refs to avoid stale closures (S1 + C1 fix)
    const turnRef = useRef<0 | 1>(0);
    const playersRef = useRef<[PlayerState, PlayerState]>([
        { name: 'Player 1', group: null, ballsPocketed: [], id: '', elo: 0, avatar: '' },
        { name: 'Player 2', group: null, ballsPocketed: [], id: '', elo: 0, avatar: '' },
    ]);
    const shotCountRef = useRef(0);
    const isMyTurnRef = useRef(false);
    const phaseRef = useRef<GamePhase>('aiming');
    const messageRef = useRef('Your turn');

    const pocketedThisTurnRef = useRef<Set<number>>(new Set());
    const firstHitRef = useRef<number | null>(null);
    const railHitRef = useRef(false);
    const breakDoneRef = useRef(false);
    const gameOverCalledRef = useRef(false); // Z3 fix
    const foulRef = useRef(false);
    const winnerRef = useRef<string | null>(null);

    // S1 fix: refs for values that were stale in shoot()
    const aimAngleRef = useRef(0);
    const spinRef = useRef(0);
    const sidespinRef = useRef(0);
    const powerRef = useRef(0.5);
    const pullbackRef = useRef(0);
    const showAimRef = useRef(true);

    // React state for rendering
    const [balls, setBalls] = useState<Ball[]>(ballsRef.current);
    const [phase, setPhase] = useState<GamePhase>('aiming');
    const [turn, setTurn] = useState<0 | 1>(0);
    const [players, setPlayers] = useState<[PlayerState, PlayerState]>(playersRef.current);
    const [winner, setWinner] = useState<string | null>(null);
    const [message, setMessage] = useState<string>('Your turn');
    const [shotCount, setShotCount] = useState(0);
    const [aimAngle, setAimAngle] = useState(0);
    const [power, setPower] = useState(0.5);
    const [spin, setSpin] = useState(0);
    const [sidespin, setSidespin] = useState(0);
    const [pullback, setPullback] = useState(0);
    const [showAim, setShowAim] = useState(true);
    const [isMyTurnState, setIsMyTurnState] = useState(false);

    const mousePos = useRef({ x: 0, y: 0 });
    const isDown = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const scaleRef = useRef(1);
    const offsetRef = useRef({ x: 0, y: 0 });

    // S4 fix: remote shot interpolation
    const remoteTargetBalls = useRef<Ball[] | null>(null);
    const remoteAnimStart = useRef(0);
    const REMOTE_ANIM_MS = 1200;

    // ── Bot mode initialization ─────────────────────────────────────────────
    useEffect(() => {
        if (!isBotMode) return;
        myIdxRef.current = 0;
        isMyTurnRef.current = true;
        setIsMyTurnState(true);
        turnRef.current = 0;
        setTurn(0);
        phaseRef.current = 'aiming';
        setPhase('aiming');
        breakDoneRef.current = false;
        gameOverCalledRef.current = false;
        ballsRef.current = rackBalls();
        setBalls(ballsRef.current.slice());
        playersRef.current = [
            { name: user?.name || 'You', group: null, ballsPocketed: [], id: user?.id || 'player1', elo: user?.elo || 0, avatar: user?.avatar || '' },
            { name: 'CPU', group: null, ballsPocketed: [], id: 'bot', elo: 1000, avatar: '' },
        ];
        setPlayers(playersRef.current);
        pocketedThisTurnRef.current = new Set();
        firstHitRef.current = null;
    }, [isBotMode, user]);

    // ── Bot AI ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isBotMode) return;
        if (turnRef.current === myIdxRef.current) return; // human's turn
        if (phaseRef.current === 'game_over') return;

        const botTimer = setTimeout(() => {
            if (phaseRef.current === 'place_cue') {
                // Bot places cue ball behind head string (break) or center (regular)
                const isBreakScratch = shotCountRef.current === 0;
                const safeX = isBreakScratch ? FIELD_LEFT + TABLE_WIDTH * 0.15 : FIELD_LEFT + TABLE_WIDTH * 0.5;
                const safeY = FIELD_TOP + TABLE_HEIGHT / 2 + (Math.random() - 0.5) * 60;
                const nx = Math.max(FIELD_LEFT + BALL_RADIUS + 2, Math.min(FIELD_RIGHT - BALL_RADIUS - 2, safeX));
                const ny = Math.max(FIELD_TOP + BALL_RADIUS + 2, Math.min(FIELD_BOTTOM - BALL_RADIUS - 2, safeY));
                // Ensure no overlap
                const valid = ballsRef.current.filter(b => b.id !== 0 && !b.pocketed).every(b => {
                    const dx = nx - b.x, dy = ny - b.y;
                    return Math.sqrt(dx * dx + dy * dy) > BALL_RADIUS * 2 + 2;
                });
                if (valid) {
                    ballsRef.current = placeCueBall(ballsRef.current, nx, ny);
                    setBalls(ballsRef.current.slice());
                }
                phaseRef.current = 'aiming';
                setPhase('aiming');
                turnRef.current = myIdxRef.current as 0 | 1;
                setTurn(myIdxRef.current as 0 | 1);
                isMyTurnRef.current = true;
                setIsMyTurnState(true);
                messageRef.current = 'Your turn';
                setMessage(messageRef.current);
                return;
            }

            if (phaseRef.current !== 'aiming') return;

            // Bot shooting logic
            const cueBall = ballsRef.current.find(b => b.id === 0);
            if (!cueBall || cueBall.pocketed) return;

            const botPlayer = playersRef.current[turnRef.current];
            let targets = ballsRef.current.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8);

            // If group assigned, prefer own group; else any ball
            if (botPlayer.group) {
                const ownTargets = targets.filter(b => getGroup(b.id) === botPlayer.group);
                if (ownTargets.length > 0) targets = ownTargets;
            }

            if (targets.length === 0) {
                // Only 8-ball left
                const eightBall = ballsRef.current.find(b => b.id === 8 && !b.pocketed);
                if (eightBall) targets = [eightBall];
            }

            if (targets.length === 0) return;

            const target = targets[Math.floor(Math.random() * targets.length)];
            let angle = Math.atan2(target.y - cueBall.y, target.x - cueBall.x);

            // Add random error based on difficulty
            const errorMap = { easy: 0.12, medium: 0.06, hard: 0.025 };
            const error = errorMap[botDifficulty] * (Math.random() - 0.5) * 2;
            angle += error;

            aimAngleRef.current = angle + Math.PI;
            setAimAngle(aimAngleRef.current);

            const powerMap = { easy: 0.45, medium: 0.65, hard: 0.8 };
            const pw = powerMap[botDifficulty] + (Math.random() - 0.5) * 0.15;
            const clampedPw = Math.max(0.2, Math.min(1, pw));

            shoot(clampedPw);
        }, 1500 + Math.random() * 1500);

        return () => clearTimeout(botTimer);
    }, [isBotMode, turn, phase, botDifficulty]);

    // Sync refs from state
    useEffect(() => { aimAngleRef.current = aimAngle; }, [aimAngle]);
    useEffect(() => { spinRef.current = spin; }, [spin]);
    useEffect(() => { sidespinRef.current = sidespin; }, [sidespin]);
    useEffect(() => { powerRef.current = power; }, [power]);
    useEffect(() => { pullbackRef.current = pullback; }, [pullback]);
    useEffect(() => { showAimRef.current = showAim; }, [showAim]);

    // ── Socket setup (S3 fix: full state sync) ────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        socket.on('connect', () => setMessage('Connected!'));
        socket.on('match_found', (room: any) => {
            const myIdx = Math.max(0, room.players.indexOf(user?.id)) as 0 | 1;
            myIdxRef.current = myIdx;
            isMyTurnRef.current = myIdx === 0;
            setIsMyTurnState(myIdx === 0);
            turnRef.current = myIdx;
            setTurn(myIdx);
            phaseRef.current = 'aiming';
            setPhase('aiming');
            messageRef.current = isMyTurnRef.current ? 'Your turn - Break!' : "Opponent's turn";
            setMessage(messageRef.current);
            breakDoneRef.current = false;
            gameOverCalledRef.current = false;
            if (room.gameState?.balls) {
                ballsRef.current = room.gameState.balls;
                setBalls(room.gameState.balls.slice());
            }
            const p1: PlayerState = {
                name: room.profiles?.[room.players[0]]?.name || 'Player 1',
                group: room.gameState?.players?.[0]?.group ?? null,
                ballsPocketed: room.gameState?.players?.[0]?.ballsPocketed ?? [],
                id: room.players[0],
                elo: room.profiles?.[room.players[0]]?.elo ?? 0,
                avatar: room.profiles?.[room.players[0]]?.avatar ?? '',
            };
            const p2: PlayerState = {
                name: room.profiles?.[room.players[1]]?.name || 'Player 2',
                group: room.gameState?.players?.[1]?.group ?? null,
                ballsPocketed: room.gameState?.players?.[1]?.ballsPocketed ?? [],
                id: room.players[1],
                elo: room.profiles?.[room.players[1]]?.elo ?? 0,
                avatar: room.profiles?.[room.players[1]]?.avatar ?? '',
            };
            playersRef.current = [p1, p2];
            setPlayers([p1, p2]);
            pocketedThisTurnRef.current = new Set();
            firstHitRef.current = null;
        });

        socket.on('game_update', (room: any) => {
            // S3 + C4 fix: sync full game state
            if (room.gameState) {
                const gs = room.gameState;
                if (gs.balls) {
                    // S4: animate remote shots
                    if (!isMyTurnRef.current && gs.phase === 'shooting') {
                        remoteTargetBalls.current = gs.balls;
                        remoteAnimStart.current = performance.now();
                    } else {
                        ballsRef.current = gs.balls;
                        setBalls(gs.balls.slice());
                    }
                    runningRef.current = false;
                    if (frameRef.current) cancelAnimationFrame(frameRef.current);
                }
                if (gs.players) {
                    playersRef.current = gs.players as [PlayerState, PlayerState];
                    setPlayers(gs.players);
                }
                if (gs.phase) {
                    phaseRef.current = gs.phase;
                    setPhase(gs.phase);
                }
                if (gs.firstHit !== undefined) {
                    firstHitRef.current = gs.firstHit;
                }
            }
            if (room.turn) {
                const newTurn = room.players.indexOf(room.turn) as 0 | 1;
                turnRef.current = newTurn;
                setTurn(newTurn);
                isMyTurnRef.current = newTurn === myIdxRef.current;
                setIsMyTurnState(isMyTurnRef.current);
                messageRef.current = isMyTurnRef.current ? 'Your turn' : "Opponent's turn";
                setMessage(messageRef.current);
            }
        });

        socket.on('game_over', (data: any) => {
            phaseRef.current = 'game_over';
            setPhase('game_over');
            const won = data.winner === user?.id;
            setWinner(won ? 'You' : 'Opponent');
            winnerRef.current = data.winner;
            messageRef.current = won ? 'You Win!' : 'You Lose';
            setMessage(messageRef.current);
            playSFX(won ? 'win' : 'loss');
            if (!gameOverCalledRef.current) {
                gameOverCalledRef.current = true;
                onGameEnd(won ? 'win' : 'loss');
            }
        });

        return () => {
            socket.off('connect');
            socket.off('match_found');
            socket.off('game_update');
            socket.off('game_over');
        };
    }, [socket, user, table.id, onGameEnd]);

    // ── Remote shot animation render loop (S4 fix) ───────────────────────────
    useEffect(() => {
        let animFrame: number;
        const animate = () => {
            if (remoteTargetBalls.current) {
                const elapsed = performance.now() - remoteAnimStart.current;
                const t = Math.min(1, elapsed / REMOTE_ANIM_MS);
                const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                ballsRef.current = ballsRef.current.map((b, i) => {
                    const target = remoteTargetBalls.current![i];
                    if (!target) return b;
                    return { ...b, x: b.x + (target.x - b.x) * eased, y: b.y + (target.y - b.y) * eased, pocketed: target.pocketed };
                });
                setBalls(ballsRef.current.slice());
                if (t >= 1) {
                    ballsRef.current = remoteTargetBalls.current;
                    setBalls(ballsRef.current.slice());
                    remoteTargetBalls.current = null;
                }
            }
            animFrame = requestAnimationFrame(animate);
        };
        animFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animFrame);
    }, []);

    // ── Offscreen table canvas (C1 fix: +44 for wood frame) ────────────────
    useEffect(() => {
        const offscreen = document.createElement('canvas');
        offscreen.width = TABLE_WIDTH + CUSHION_THICKNESS * 2 + 44;
        offscreen.height = TABLE_HEIGHT + CUSHION_THICKNESS * 2 + 44;
        const octx = offscreen.getContext('2d')!;
        drawTable(octx);
        tableGfxRef.current = offscreen;
    }, []);

    // ── Render ──────────────────────────────────────────────────────────────
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !tableGfxRef.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(0, 0, W, H);

        const tableW = TABLE_WIDTH + CUSHION_THICKNESS * 2 + 44;
        const tableH = TABLE_HEIGHT + CUSHION_THICKNESS * 2 + 44;
        const scale = Math.min(W / tableW, H / tableH);
        scaleRef.current = scale;
        const ox = (W - (TABLE_WIDTH + CUSHION_THICKNESS * 2) * scale) / 2;
        const oy = (H - (TABLE_HEIGHT + CUSHION_THICKNESS * 2) * scale) / 2;
        offsetRef.current = { x: ox, y: oy };

        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(scale, scale);
        ctx.drawImage(tableGfxRef.current, 0, 0);
        ctx.translate(WOOD + CUSHION_THICKNESS, WOOD + CUSHION_THICKNESS);

        const cueBall = ballsRef.current.find(b => b.id === 0);
        const currentAimAngle = aimAngleRef.current;
        const currentShowAim = showAimRef.current;
        const currentPower = powerRef.current;
        const currentPullback = pullbackRef.current;

        if (phaseRef.current === 'aiming' && cueBall && !cueBall.pocketed && currentShowAim && isMyTurnRef.current) {
            drawAimLine(ctx, cueBall.x, cueBall.y, currentAimAngle, ballsRef.current);
        }
        if (phaseRef.current === 'aiming' && cueBall && !cueBall.pocketed && isMyTurnRef.current) {
            drawCue(ctx, cueBall.x, cueBall.y, currentAimAngle + Math.PI, currentPower, currentPullback);
        }

        const activeBalls = ballsRef.current.filter(b => !b.pocketed);
        for (const b of activeBalls) {
            drawBall(ctx, b);
        }

        // Ghost cue ball in place_cue
        if (phaseRef.current === 'place_cue' && isMyTurnRef.current && mousePos.current) {
            ctx.beginPath();
            ctx.arc(mousePos.current.x, mousePos.current.y, BALL_RADIUS, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }, []);

    // ── Physics loop (C2 fix: collision callbacks) ──────────────────────────────
    const handleTurnEnd = useCallback(() => {
        const pocketed = Array.from(pocketedThisTurnRef.current)
            .map(id => ballsRef.current.find(b => b.id === id))
            .filter(Boolean) as Ball[];

        const cueScratch = pocketed.some(b => b.id === CUE_BALL);
        const eightPocketed = pocketed.some(b => b.id === EIGHT_BALL);
        const turn = turnRef.current;
        const currentPlayer = playersRef.current[turn];

        // C4: 8-ball win/loss
        if (eightPocketed) {
            phaseRef.current = 'game_over';
            setPhase('game_over');

            const groupCleared = getGroupCleared(ballsRef.current, currentPlayer.group);

            if (cueScratch) {
                setWinner('Opponent');
                winnerRef.current = playersRef.current[turn === 0 ? 1 : 0].id;
                messageRef.current = 'Scratched on 8-ball! You Lose';
                setMessage(messageRef.current);
                playSFX('loss');
                if (!gameOverCalledRef.current) { gameOverCalledRef.current = true; onGameEnd('loss'); }
                emitGameOver(false);
                return;
            }

            if (currentPlayer.group && groupCleared) {
                setWinner('You');
                winnerRef.current = currentPlayer.id;
                messageRef.current = '8-Ball Pocketed! Victory!';
                setMessage(messageRef.current);
                playSFX('win');
                if (!gameOverCalledRef.current) { gameOverCalledRef.current = true; onGameEnd('win'); }
                emitGameOver(true);
            } else {
                setWinner('Opponent');
                winnerRef.current = playersRef.current[turn === 0 ? 1 : 0].id;
                messageRef.current = '8-Ball Foul! You Lose';
                setMessage(messageRef.current);
                playSFX('loss');
                if (!gameOverCalledRef.current) { gameOverCalledRef.current = true; onGameEnd('loss'); }
                emitGameOver(false);
            }
            return;
        }

        if (cueScratch) {
            const cueBall = ballsRef.current.find(b => b.id === CUE_BALL);
            if (cueBall) {
                cueBall.pocketed = false;
                cueBall.x = FIELD_LEFT + TABLE_WIDTH * 0.25;
                cueBall.y = FIELD_TOP + TABLE_HEIGHT / 2;
                cueBall.vx = 0;
                cueBall.vy = 0;
            }
            const nextTurn = turn === 0 ? 1 : 0;
            turnRef.current = nextTurn;
            setTurn(nextTurn);
            isMyTurnRef.current = nextTurn === myIdxRef.current;
            setIsMyTurnState(isMyTurnRef.current);
            messageRef.current = isMyTurnRef.current ? 'Ball in hand! Place cue ball' : 'Opponent placing cue ball...';
            setMessage(messageRef.current);
            phaseRef.current = 'place_cue';
            setPhase('place_cue');
            pocketedThisTurnRef.current = new Set();
            firstHitRef.current = null;
            setBalls(ballsRef.current.slice());
            emitState();
            return;
        }

        // C3: Foul detection
        let foul = false;
        if (firstHitRef.current === null) {
            foul = true;
        } else if (firstHitRef.current === EIGHT_BALL && !currentPlayer.group) {
            foul = true;
        } else if (currentPlayer.group) {
            const myGroup = currentPlayer.group;
            const wrongGroup = (myGroup === 'solids' && firstHitRef.current > 8) ||
                               (myGroup === 'stripes' && firstHitRef.current < 8);
            if (wrongGroup) foul = true;
        }
        foulRef.current = foul;

        // Group assignment
        const turnPlayer = playersRef.current[turn];
        let nextPlayers: [PlayerState, PlayerState] = [
            { ...playersRef.current[0], ballsPocketed: [...playersRef.current[0].ballsPocketed] },
            { ...playersRef.current[1], ballsPocketed: [...playersRef.current[1].ballsPocketed] },
        ];

        if (!foul && !turnPlayer.group && pocketed.length > 0) {
            const firstPotted = pocketed.find(b => b.id !== CUE_BALL && b.id !== EIGHT_BALL);
            if (firstPotted) {
                const assigned = getGroup(firstPotted.id);
                if (assigned) {
                    nextPlayers[turn].group = assigned;
                    nextPlayers[turn === 0 ? 1 : 0].group = assigned === 'solids' ? 'stripes' : 'solids';
                }
            }
        }

        for (const b of pocketed) {
            if (b.id === CUE_BALL || b.id === EIGHT_BALL) continue;
            const grp = getGroup(b.id);
            if (grp) {
                for (let p = 0; p < 2; p++) {
                    if (nextPlayers[p].group === grp && !nextPlayers[p].ballsPocketed.includes(b.id)) {
                        nextPlayers[p].ballsPocketed.push(b.id);
                    }
                }
            }
        }
        playersRef.current = nextPlayers;
        setPlayers(nextPlayers);

        if (foul) {
            const nextTurn = turn === 0 ? 1 : 0;
            turnRef.current = nextTurn;
            setTurn(nextTurn);
            isMyTurnRef.current = nextTurn === myIdxRef.current;
            setIsMyTurnState(isMyTurnRef.current);
            messageRef.current = foul ? 'Foul! Turn switches' : "Opponent's turn";
            setMessage(messageRef.current);
            phaseRef.current = 'aiming';
            setPhase('aiming');
            pocketedThisTurnRef.current = new Set();
            firstHitRef.current = null;
            emitState();
            return;
        }

        const ownPocketed = pocketed.filter(b => {
            const g = getGroup(b.id);
            return g && g === turnPlayer.group;
        });

        if (ownPocketed.length > 0) {
            messageRef.current = 'Nice shot!';
            setMessage(messageRef.current);
        } else {
            const nextTurn = (turn === 0 ? 1 : 0) as 0 | 1;
            turnRef.current = nextTurn;
            setTurn(nextTurn);
            isMyTurnRef.current = nextTurn === myIdxRef.current;
            setIsMyTurnState(isMyTurnRef.current);
            messageRef.current = isMyTurnRef.current ? 'Your turn' : "Opponent's turn";
            setMessage(messageRef.current);
        }
        phaseRef.current = 'aiming';
        setPhase('aiming');
        pocketedThisTurnRef.current = new Set();
        firstHitRef.current = null;
        railHitRef.current = false;
        if (shotCountRef.current === 1) breakDoneRef.current = true;
        emitState();
    }, []);

    const gameLoop = useCallback(() => {
        if (!runningRef.current) return;

        const prevBalls = ballsRef.current.map(b => ({ ...b }));

        let ballHitThisFrame = false;
        let cushionHitThisFrame = false;

        const { newBalls, pocketedThisStep } = stepPhysics(ballsRef.current, 1, {
            onBallBallCollision: (id1, id2, intensity) => {
                ballHitThisFrame = true;
                playPoolSound('ball-hit', intensity);
                if (firstHitRef.current === null && (id1 === 0 || id2 === 0)) {
                    firstHitRef.current = id1 === 0 ? id2 : id1;
                }
            },
            onCushionBounce: (id, intensity) => {
                cushionHitThisFrame = true;
                playPoolSound('cushion', intensity);
            },
            onPocket: (id) => {
                const t = ballHitThisFrame ? 0 : 80;
                setTimeout(() => playPoolSound('pocket', id === 8 ? 1 : 0.6), t);
            },
        });

        ballsRef.current = newBalls;
        setBalls(ballsRef.current.slice());

        for (const id of pocketedThisStep) {
            pocketedThisTurnRef.current.add(id);
        }

        if (!isMoving(ballsRef.current)) {
            runningRef.current = false;
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            handleTurnEnd();
        } else {
            frameRef.current = requestAnimationFrame(gameLoop);
        }
    }, [handleTurnEnd]);

    const startLoop = useCallback(() => {
        runningRef.current = true;
        phaseRef.current = 'shooting';
        setPhase('shooting');
        frameRef.current = requestAnimationFrame(gameLoop);
    }, [gameLoop]);

    const emitState = useCallback(() => {
        if (!socket && !isBotMode) return;
        const gs: FullGameState = {
            balls: ballsRef.current,
            turn: turnRef.current,
            players: playersRef.current,
            phase: phaseRef.current as GamePhase,
            shotCount: shotCountRef.current,
            firstHit: firstHitRef.current,
            foul: foulRef.current,
            winner: winnerRef.current,
        };
        if (socket) {
            socket.emit('game_action', {
                roomId: table.id,
                newState: gs,
                lastMoveTime: Date.now(),
            });
        }
    }, [socket, table.id, isBotMode]);

    const emitGameOver = useCallback((won: boolean) => {
        if (isBotMode) return; // bot mode has no socket
        if (!socket) return;
        socket.emit('game_action', {
            roomId: table.id,
            gameOver: true,
            winner: user?.id,
            won,
        });
    }, [socket, table.id, user, isBotMode]);

    // ── Coordinate conversion ───────────────────────────────────────────────
    const canvasToTable = useCallback((cx: number, cy: number) => {
        const { x: ox, y: oy } = offsetRef.current;
        const scale = scaleRef.current;
        return {
            x: (cx - ox) / scale - (WOOD + CUSHION_THICKNESS),
            y: (cy - oy) / scale - (WOOD + CUSHION_THICKNESS),
        };
    }, []);

    // ── Unified pointer helpers (S5 fix) ──────────────────────────────────────
    const getPointerPos = useCallback((e: MouseEvent | TouchEvent): { cx: number; cy: number; clientX: number; clientY: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        let clientX: number, clientY: number;
        if ('touches' in e) {
            if (e.touches.length === 0) return null;
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        const dpr = window.devicePixelRatio || 1;
        const cx = (clientX - rect.left) * dpr;
        const cy = (clientY - rect.top) * dpr;
        return { cx, cy, clientX, clientY };
    }, []);

    const handlePointerMove = useCallback((cx: number, cy: number, clientY: number, canvasRect: DOMRect) => {
        const { x: tx, y: ty } = canvasToTable(cx, cy);
        mousePos.current = { x: tx, y: ty };

        if (phaseRef.current === 'aiming' && isMyTurnRef.current) {
            const cueBall = ballsRef.current.find(b => b.id === 0);
            if (cueBall) {
                const newAngle = Math.atan2(ty - cueBall.y, tx - cueBall.x) + Math.PI;
                aimAngleRef.current = newAngle;
                setAimAngle(newAngle);
                if (isDown.current) {
                    const dpr = window.devicePixelRatio || 1;
                    const currentY = (clientY - canvasRect.top) * dpr;
                    const startY = dragStart.current.y;
                    const delta = currentY - startY;
                    const newPullback = Math.max(0, Math.min(1, delta / 80));
                    pullbackRef.current = newPullback;
                    setPullback(newPullback);
                    powerRef.current = newPullback;
                    setPower(newPullback);
                }
            }
        }
        render();
    }, [canvasToTable, render]);

    const handlePointerDown = useCallback((cx: number, cy: number, clientX: number, clientY: number, canvasRect: DOMRect) => {
        isDown.current = true;
        const dpr = window.devicePixelRatio || 1;
        dragStart.current = {
            x: (clientX - canvasRect.left) * dpr,
            y: (clientY - canvasRect.top) * dpr,
        };
    }, []);

    const handlePointerUp = useCallback((cx: number, cy: number) => {
        if (!isDown.current) return;
        isDown.current = false;

        if (phaseRef.current === 'aiming' && isMyTurnRef.current && pullbackRef.current > 0.02) {
            shoot(pullbackRef.current);
        } else if (phaseRef.current === 'place_cue' && isMyTurnRef.current) {
            const { x: tx, y: ty } = canvasToTable(cx, cy);
            const nx = Math.max(FIELD_LEFT + BALL_RADIUS + 2, Math.min(FIELD_RIGHT - BALL_RADIUS - 2, tx));
            const ny = Math.max(FIELD_TOP + BALL_RADIUS + 2, Math.min(FIELD_BOTTOM - BALL_RADIUS - 2, ty));
            const valid = ballsRef.current.filter(b => b.id !== 0 && !b.pocketed).every(b => {
                const dx = nx - b.x, dy = ny - b.y;
                return Math.sqrt(dx * dx + dy * dy) > BALL_RADIUS * 2 + 2;
            });
            if (valid) {
                ballsRef.current = placeCueBall(ballsRef.current, nx, ny);
                setBalls(ballsRef.current.slice());
                phaseRef.current = 'aiming';
                setPhase('aiming');
                messageRef.current = isMyTurnRef.current ? 'Your turn' : "Opponent's turn";
                setMessage(messageRef.current);
                emitState();
            }
        }
    }, [canvasToTable, emitState]);

    const onMouseMove = useCallback((e: MouseEvent) => {
        const pos = getPointerPos(e);
        if (!pos) return;
        const canvas = canvasRef.current!;
        handlePointerMove(pos.cx, pos.cy, pos.clientY, canvas.getBoundingClientRect());
    }, [getPointerPos, handlePointerMove]);

    const onMouseDown = useCallback((e: MouseEvent) => {
        const pos = getPointerPos(e);
        if (!pos) return;
        const canvas = canvasRef.current!;
        handlePointerDown(pos.cx, pos.cy, pos.clientX, pos.clientY, canvas.getBoundingClientRect());
    }, [getPointerPos, handlePointerDown]);

    const onMouseUp = useCallback((e: MouseEvent) => {
        const pos = getPointerPos(e);
        if (!pos) return;
        handlePointerUp(pos.cx, pos.cy);
    }, [getPointerPos, handlePointerUp]);

    const onTouchStart = useCallback((e: TouchEvent) => {
        e.preventDefault();
        const pos = getPointerPos(e);
        if (!pos) return;
        const canvas = canvasRef.current!;
        handlePointerDown(pos.cx, pos.cy, pos.clientX, pos.clientY, canvas.getBoundingClientRect());
    }, [getPointerPos, handlePointerDown]);

    const onTouchMove = useCallback((e: TouchEvent) => {
        e.preventDefault();
        const pos = getPointerPos(e);
        if (!pos) return;
        const canvas = canvasRef.current!;
        handlePointerMove(pos.cx, pos.cy, pos.clientY, canvas.getBoundingClientRect());
    }, [getPointerPos, handlePointerMove]);

    const onTouchEnd = useCallback((e: TouchEvent) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cx = (touch.clientX - rect.left) * dpr;
        const cy = (touch.clientY - rect.top) * dpr;
        handlePointerUp(cx, cy);
    }, [handlePointerUp]);

    const shoot = useCallback((pw: number) => {
        if (!isMyTurnRef.current || phaseRef.current !== 'aiming') return;
        const cueIdx = ballsRef.current.findIndex(b => b.id === 0);
        if (cueIdx === -1) return;

        playPoolSound('cue-hit', pw);

        const angle = aimAngleRef.current;
        const currentSpin = spinRef.current;
        const currentSidespin = sidespinRef.current;
        const shotPower = pw * MAX_POWER;

        ballsRef.current[cueIdx].vx = Math.cos(angle + Math.PI) * shotPower;
        ballsRef.current[cueIdx].vy = Math.sin(angle + Math.PI) * shotPower;
        ballsRef.current[cueIdx].spin = currentSpin * 3;
        ballsRef.current[cueIdx].sidespin = currentSidespin * 3;

        shotCountRef.current += 1;
        setShotCount(shotCountRef.current);
        pocketedThisTurnRef.current = new Set();
        firstHitRef.current = null;
        railHitRef.current = false;
        foulRef.current = false;

        phaseRef.current = 'shooting';
        setPhase('shooting');
        powerRef.current = 0.5;
        setPower(0.5);
        pullbackRef.current = 0;
        setPullback(0);
        playSFX('shoot');
        startLoop();
    }, [startLoop]);

    // ── Keyboard controls ──────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!isMyTurnRef.current || phaseRef.current !== 'aiming') return;
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    aimAngleRef.current -= 0.04;
                    setAimAngle(aimAngleRef.current);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    aimAngleRef.current += 0.04;
                    setAimAngle(aimAngleRef.current);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    powerRef.current = Math.min(1, powerRef.current + 0.05);
                    setPower(powerRef.current);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    powerRef.current = Math.max(0, powerRef.current - 0.05);
                    setPower(powerRef.current);
                    break;
                case ' ':
                    e.preventDefault();
                    if (powerRef.current > 0.02) shoot(powerRef.current);
                    break;
                case 'g':
                case 'G':
                    showAimRef.current = !showAimRef.current;
                    setShowAim(showAimRef.current);
                    break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shoot]);

    // ── Canvas setup with DPI ─────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onResize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvas.offsetWidth * dpr;
            canvas.height = canvas.offsetHeight * dpr;
            render();
        };
        window.addEventListener('resize', onResize);
        onResize();
        return () => {
            window.removeEventListener('resize', onResize);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [render]);

    // ── Event wiring ──────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        return () => {
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        };
    }, [onMouseMove, onMouseDown, onMouseUp, onTouchStart, onTouchMove, onTouchEnd]);

    useEffect(() => { render(); }, [render, phase, aimAngle, pullback, showAim, turn, message, isMyTurnState]);

    const powerPct = Math.round(power * 100);
    const isMyTurnActive = isMyTurnState && phase !== 'game_over';
    const potDisplay = table.stake > 0 ? `${(table.stake * 2).toLocaleString()} FCFA` : 'Practice';

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white select-none overflow-hidden" role="region" aria-label="8-Ball Pool Game">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800" aria-live="polite">
                <div className="flex items-center gap-3">
                    <div className="text-2xl" aria-hidden="true">🎱</div>
                    <div>
                        <h1 className="text-lg font-bold text-yellow-400">8-Ball Pool</h1>
                        <p className="text-xs text-gray-400">{potDisplay} · P2P</p>
                    </div>
                </div>
                <div className="flex-1 text-center">
                    <span className="text-sm font-semibold text-white">{message}</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-400">Shot #{shotCount}</div>
                    <button onClick={() => { if (!gameOverCalledRef.current) { gameOverCalledRef.current = true; onGameEnd('quit'); } }} className="text-xs text-gray-500 hover:text-gray-300 underline" aria-label="Forfeit and leave">Forfeit</button>
                </div>
            </div>

            {/* Main: Player 1 | Canvas | Player 2 */}
            <div className="flex-1 flex relative bg-gray-950 min-h-0">
                <div className="w-36 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col justify-center p-3 gap-2">
                    <PlayerPanelCompact player={players[0]} isActive={phase !== 'game_over' && turn === 0} balls={balls} label="Player 1" />
                </div>
                <div className="flex-1 relative min-w-0">
                    <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" aria-label="Pool table" />
                    {phase === 'aiming' && isMyTurnActive && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/70 backdrop-blur rounded-xl px-5 py-2.5 border border-gray-600" role="toolbar" aria-label="Shot controls">
                            <button onClick={() => { showAimRef.current = !showAimRef.current; setShowAim(showAimRef.current); }} className={`text-xs px-3 py-1 rounded-lg ${showAim ? 'bg-yellow-500/80 text-gray-900' : 'bg-gray-700'}`} aria-pressed={showAim}>Guide {showAim ? 'ON' : 'OFF'}</button>
                            <div className="flex items-center gap-2" role="group" aria-label="Power">
                                <span className="text-xs text-gray-400">Power</span>
                                <div className="flex gap-0.5">
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <div key={i} onClick={() => { powerRef.current = (i + 1) / 10; setPower(powerRef.current); pullbackRef.current = powerRef.current; setPullback(powerRef.current); }} className="w-3 h-5 rounded-sm cursor-pointer hover:ring-1 ring-white/40" style={{ background: i < Math.round(power * 10) ? i < 4 ? '#22c55e' : i < 7 ? '#eab308' : '#ef4444' : 'rgba(255,255,255,0.1)' }} role="button" aria-label={`Set power to ${(i + 1) * 10}%`} />
                                    ))}
                                </div>
                                <span className="text-xs font-bold w-8">{powerPct}%</span>
                            </div>
                            <SpinControl spin={spin} setSpin={setSpin} sidespin={sidespin} setSidespin={setSidespin} />
                            <button onClick={() => shoot(powerRef.current)} className="bg-red-600 hover:bg-red-500 px-5 py-1.5 rounded-lg font-bold text-sm" aria-label="Shoot">SHOOT</button>
                        </div>
                    )}
                    {phase === 'shooting' && <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 border border-gray-600 rounded-xl px-6 py-2 text-sm">⏳ Balls rolling...</div>}
                    {!isMyTurnState && phase === 'aiming' && <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-900/80 border border-blue-500 rounded-xl px-6 py-2 text-sm">{isBotMode ? "CPU thinking..." : "Opponent's turn"}</div>}
                    {phase === 'place_cue' && isMyTurnState && <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-900/80 border border-amber-500 rounded-xl px-6 py-2 text-sm animate-pulse">👆 Click to place cue ball</div>}
                    {phase === 'place_cue' && !isMyTurnState && <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-900/80 border border-blue-500 rounded-xl px-6 py-2 text-sm">Opponent placing cue ball...</div>}
                    {phase === 'game_over' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70" role="dialog" aria-label="Game Over">
                            <div className="bg-gray-900 border-2 border-yellow-500 rounded-2xl p-10 text-center">
                                <div className="text-6xl mb-4" aria-hidden="true">🏆</div>
                                <h2 className="text-3xl font-black text-yellow-400 mb-2">{winner} Wins!</h2>
                                <button onClick={() => { if (!gameOverCalledRef.current) { gameOverCalledRef.current = true; onGameEnd(winner === 'You' ? 'win' : 'loss'); } }} className="bg-yellow-500 text-gray-900 font-black px-8 py-3 rounded-xl mt-4">Back to Lobby</button>
                            </div>
                        </div>
                    )}
                </div>
                <div className="w-36 shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col justify-center p-3 gap-2">
                    <PlayerPanelCompact player={players[1]} isActive={phase !== 'game_over' && turn === 1} balls={balls} label="Player 2" />
                </div>
            </div>
            <div className="flex items-center justify-center gap-6 px-4 py-1.5 bg-gray-900 border-t border-gray-800 text-xs text-gray-500">
                <span>← → Aim</span><span>↑ ↓ Power</span><span>Space Shoot</span><span>G Guide</span>
            </div>
        </div>
    );
};

function PlayerPanelCompact({ player, isActive, balls, label }: { player: PlayerState; isActive: boolean; balls: Ball[]; label: string }) {
    const myIds = player.group === 'solids' ? SOLIDS : player.group === 'stripes' ? STRIPES : [];
    const remaining = myIds.filter(id => !balls.find(b => b.id === id && b.pocketed));
    const pocketed = myIds.filter(id => balls.find(b => b.id === id && b.pocketed));
    return (
        <div className={`flex flex-col gap-2 ${isActive ? 'opacity-100' : 'opacity-60'} transition-opacity`}>
            <div className="flex items-center gap-2">
                {isActive && <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />}
                <span className={`font-bold text-sm truncate ${isActive ? 'text-yellow-300' : 'text-gray-400'}`}>{player.name || label}</span>
            </div>
            <div className="text-xs text-gray-500">{player.group ?? '—'}</div>
            <div className="flex flex-wrap gap-1">{remaining.map(id => <BallIcon key={id} id={id} small />)}</div>
            <div className="text-center"><span className="text-lg font-black">{pocketed.length}</span><span className="text-gray-500 text-xs">/7</span></div>
        </div>
    );
}

function SpinControl({ spin, setSpin, sidespin, setSidespin }: { spin: number; setSpin: (v: number) => void; sidespin: number; setSidespin: (v: number) => void }) {
    const size = 52;
    const half = size / 2;
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = (e.clientX - rect.left - half) / half;
        const dy = (e.clientY - rect.top - half) / half;
        setSidespin(Math.max(-1, Math.min(1, dx)));
        setSpin(Math.max(-1, Math.min(1, dy)));
    };
    return (
        <div className="relative cursor-pointer select-none" style={{ width: size, height: size }} onClick={handleClick} role="slider" aria-label="Spin control" tabIndex={0}>
            <div className="absolute inset-0 rounded-full border border-gray-500 bg-gray-800/80" style={{ width: size, height: size }} />
            <div className="absolute left-1/2 top-0 w-px h-full bg-gray-600/50" />
            <div className="absolute top-1/2 left-0 h-px w-full bg-gray-600/50" />
            <div className="absolute w-2.5 h-2.5 rounded-full bg-white border border-gray-400 shadow" style={{ left: half + sidespin * (half - 5) - 5, top: half + spin * (half - 5) - 5 }} />
        </div>
    );
}

function BallIcon({ id, small = false }: { id: number; small?: boolean }) {
    const color = BALL_COLORS[id] ?? '#888';
    const isStripe = BALL_IS_STRIPE[id] ?? false;
    const r = small ? 8 : 12;
    return (
        <svg width={r * 2} height={r * 2} viewBox={`0 0 ${r * 2} ${r * 2}`}>
            <circle cx={r} cy={r} r={r} fill={isStripe ? 'white' : color} stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
            {isStripe && <rect x={0} y={r - r * 0.42} width={r * 2} height={r * 0.84} fill={color} clipPath={`circle(${r}px at ${r}px ${r}px)`} />}
            {id !== 0 && <><circle cx={r} cy={r} r={r * 0.38} fill="white" /><text x={r} y={r + 1} textAnchor="middle" dominantBaseline="middle" fontSize={r * 0.52} fontWeight="bold" fill="#111">{id}</text></>}
            {id === 0 && <circle cx={r} cy={r} r={r} fill="#f0f0f0" />}
        </svg>
    );
}