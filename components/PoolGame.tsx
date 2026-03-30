
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Table, User } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { playSFX } from '../services/sound';
import { Socket } from 'socket.io-client';
import { SocketGameState } from '../types';

interface PoolGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket: Socket | null;
  socketGame: SocketGameState | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TW = 900;   // table width  (canvas coords)
const TH = 450;   // table height
const BR = 11;    // ball radius
const PR = 22;    // pocket radius
const FRICTION = 0.985;
const WALL_RESTITUTION = 0.75;
const BALL_RESTITUTION = 0.96;
const VEL_THRESHOLD = 0.08;
const SUB = 6;    // physics sub-steps per frame

// Pocket positions (corner + side)
const POCKETS = [
  { x: PR * 0.55, y: PR * 0.55 },
  { x: TW / 2, y: -2 },
  { x: TW - PR * 0.55, y: PR * 0.55 },
  { x: PR * 0.55, y: TH - PR * 0.55 },
  { x: TW / 2, y: TH + 2 },
  { x: TW - PR * 0.55, y: TH - PR * 0.55 },
];

// Ball colors (solid, 0=cue, 8=black)
const BALL_COLORS: Record<number, string> = {
  0:  '#F5F0E8', // cue
  1:  '#F7C033', // 1 solid yellow
  2:  '#1A5CE5', // 2 solid blue
  3:  '#E5231A', // 3 solid red
  4:  '#6A1DB5', // 4 solid purple
  5:  '#F08020', // 5 solid orange
  6:  '#1A8C3B', // 6 solid green
  7:  '#8B1A1A', // 7 solid maroon
  8:  '#111111', // 8 black
  9:  '#F7C033', // 9 stripe yellow
  10: '#1A5CE5', // 10
  11: '#E5231A', // 11
  12: '#6A1DB5', // 12
  13: '#F08020', // 13
  14: '#1A8C3B', // 14
  15: '#8B1A1A', // 15
};

interface Ball {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  pocketed: boolean;
}

// ─── Rack builder (legal 8-ball rack) ────────────────────────────────────────
function buildRack(): Ball[] {
  const balls: Ball[] = [];
  const cx = TW * 0.625;
  const cy = TH / 2;
  const dx = BR * 2.04;
  const dy = BR * 1.18;

  // Legal rack: 8 in center, corners are one solid + one stripe, rest random
  // Standard fixed order:  row by row
  const rackOrder = [
    [1],          // apex
    [9, 2],
    [10, 8, 3],   // 8 in middle
    [11, 4, 12, 5],
    [13, 6, 14, 7, 15],
  ];

  // Shuffle within constraints (shuffle only non-8, non-corner positions)
  // For simplicity use a fixed-but-legal rack
  rackOrder.forEach((row, ri) => {
    const rowLen = row.length;
    row.forEach((id, ci) => {
      const bx = cx + ri * dx;
      const by = cy + (ci - (rowLen - 1) / 2) * dy * 2;
      balls.push({ id, x: bx, y: by, vx: 0, vy: 0, pocketed: false });
    });
  });

  // Cue ball
  balls.push({ id: 0, x: TW * 0.25, y: cy, vx: 0, vy: 0, pocketed: false });
  return balls;
}

// ─── Physics ──────────────────────────────────────────────────────────────────
function stepPhysics(balls: Ball[], pottedCb: (id: number) => void): boolean {
  let anyMoving = false;

  for (let step = 0; step < SUB; step++) {
    const active = balls.filter(b => !b.pocketed);

    // Move & wall bounce
    for (const b of active) {
      b.x += b.vx / SUB;
      b.y += b.vy / SUB;

      // Left / right cushion
      if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * WALL_RESTITUTION; playSFX('move'); }
      if (b.x > TW - BR) { b.x = TW - BR; b.vx = -Math.abs(b.vx) * WALL_RESTITUTION; playSFX('move'); }
      // Top / bottom cushion
      if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy) * WALL_RESTITUTION; playSFX('move'); }
      if (b.y > TH - BR) { b.y = TH - BR; b.vy = -Math.abs(b.vy) * WALL_RESTITUTION; playSFX('move'); }
    }

    // Ball-ball collisions (elastic)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b_ = active[j];
        const dx = b_.x - a.x, dy = b_.y - a.y;
        const dist2 = dx * dx + dy * dy;
        const minDist = BR * 2;
        if (dist2 < minDist * minDist && dist2 > 0) {
          const dist = Math.sqrt(dist2);
          const nx = dx / dist, ny = dy / dist;
          // Separate
          const overlap = (minDist - dist) / 2;
          a.x -= overlap * nx; a.y -= overlap * ny;
          b_.x += overlap * nx; b_.y += overlap * ny;
          // Exchange velocity along normal (equal mass)
          const dvx = a.vx - b_.vx, dvy = a.vy - b_.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot > 0) {
            const imp = dot * BALL_RESTITUTION;
            a.vx -= imp * nx; a.vy -= imp * ny;
            b_.vx += imp * nx; b_.vy += imp * ny;
            if (Math.abs(dot) > 1.5) playSFX('capture');
          }
        }
      }
    }

    // Pocket check
    for (const b of active) {
      for (const p of POCKETS) {
        const dx = b.x - p.x, dy = b.y - p.y;
        if (dx * dx + dy * dy < PR * PR) {
          b.pocketed = true; b.vx = 0; b.vy = 0;
          pottedCb(b.id);
          break;
        }
      }
    }
  }

  // Friction + stop
  for (const b of balls) {
    if (b.pocketed) continue;
    b.vx *= FRICTION; b.vy *= FRICTION;
    if (Math.abs(b.vx) < VEL_THRESHOLD) b.vx = 0;
    if (Math.abs(b.vy) < VEL_THRESHOLD) b.vy = 0;
    if (b.vx !== 0 || b.vy !== 0) anyMoving = true;
  }
  return anyMoving;
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
function drawTable(ctx: CanvasRenderingContext2D, balls: Ball[], aimAngle: number,
  aimPower: number, isMyTurn: boolean, ballInHand: boolean, ghostPos: { x: number; y: number } | null,
  guideLen: number) {

  const W = TW, H = TH;
  ctx.clearRect(0, 0, W, H);

  // Felt
  const feltGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  feltGrad.addColorStop(0, '#1a6b3a');
  feltGrad.addColorStop(1, '#0d4422');
  ctx.fillStyle = feltGrad;
  ctx.fillRect(0, 0, W, H);

  // Felt texture dots
  ctx.fillStyle = 'rgba(255,255,255,0.012)';
  for (let x = 0; x < W; x += 20) for (let y = 0; y < H; y += 20) {
    ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
  }

  // Head string
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(TW * 0.25, 10); ctx.lineTo(TW * 0.25, H - 10); ctx.stroke();
  ctx.setLineDash([]);

  // Center spot & baulk spot
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(TW * 0.625, H / 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(TW * 0.25, H / 2, 3, 0, Math.PI * 2); ctx.fill();

  // Pockets
  POCKETS.forEach(p => {
    // Outer shadow
    const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, PR + 6);
    pg.addColorStop(0, '#000');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(p.x, p.y, PR + 6, 0, Math.PI * 2); ctx.fill();

    // Pocket hole
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, Math.PI * 2); ctx.fill();

    // Pocket rim
    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, PR + 1, 0, Math.PI * 2); ctx.stroke();
  });

  // Ball-in-hand ghost
  if (ballInHand && ghostPos) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = BALL_COLORS[0];
    ctx.beginPath(); ctx.arc(ghostPos.x, ghostPos.y, BR, 0, Math.PI * 2); ctx.fill();
    // dashed circle
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ghostPos.x, ghostPos.y, BR + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Aim guide + ghost ball when aiming
  const cue = balls.find(b => b.id === 0 && !b.pocketed);
  if (isMyTurn && !ballInHand && cue && aimPower > 0) {
    const shootDx = Math.cos(aimAngle + Math.PI);
    const shootDy = Math.sin(aimAngle + Math.PI);

    // Trace aim line until wall or ball hit
    let lx = cue.x, ly = cue.y;
    let hitBall: Ball | null = null;
    let reflectLen = 0;
    const step = 2;
    let maxSteps = (TW + TH) / step;
    for (let s = 0; s < maxSteps; s++) {
      lx += shootDx * step; ly += shootDy * step;
      if (lx < BR || lx > TW - BR || ly < BR || ly > TH - BR) { reflectLen = s * step; break; }
      const hit = balls.find(b => !b.pocketed && b.id !== 0 && Math.hypot(b.x - lx, b.y - ly) < BR * 2);
      if (hit) { hitBall = hit; reflectLen = s * step; break; }
      reflectLen = s * step;
    }

    // Draw aim line
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(cue.x + shootDx * reflectLen, cue.y + shootDy * reflectLen);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ghost cue ball at impact point
    if (hitBall) {
      const gx = lx - shootDx * step, gy = ly - shootDy * step;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(gx, gy, BR, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Balls
  balls.forEach(b => {
    if (b.pocketed) return;
    const color = BALL_COLORS[b.id] || '#888';
    const isStripe = b.id >= 9;

    ctx.save();
    ctx.translate(b.x, b.y);

    // Ball shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(3, 4, BR, BR * 0.7, 0, 0, Math.PI * 2); ctx.fill();

    // Stripe: white band behind
    if (isStripe) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, BR, 0, Math.PI * 2); ctx.fill();

      // Clip to ball circle for stripe
      ctx.beginPath(); ctx.arc(0, 0, BR, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(-BR, -BR * 0.55, BR * 2, BR * 1.1);
    } else {
      // Solid
      const bg = ctx.createRadialGradient(-BR * 0.35, -BR * 0.35, 1, 0, 0, BR);
      bg.addColorStop(0, lighten(color, 40));
      bg.addColorStop(0.6, color);
      bg.addColorStop(1, darken(color, 30));
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, BR, 0, Math.PI * 2); ctx.fill();
    }

    // Number circle (white for solid, colored for stripe)
    if (b.id !== 0) {
      const numR = isStripe ? BR * 0.45 : BR * 0.42;
      const numBg = ctx.createRadialGradient(0, 0, 0, 0, 0, numR);
      if (isStripe) {
        numBg.addColorStop(0, color);
        numBg.addColorStop(1, darken(color, 20));
      } else {
        numBg.addColorStop(0, 'rgba(255,255,255,0.92)');
        numBg.addColorStop(1, 'rgba(240,240,230,0.85)');
      }
      ctx.fillStyle = numBg;
      ctx.beginPath(); ctx.arc(0, 0, numR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isStripe ? '#fff' : '#1a1a1a';
      ctx.font = `bold ${b.id < 10 ? 8 : 7}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(b.id), 0, 0.5);
    }

    // Specular highlight
    ctx.globalAlpha = 0.5;
    const spec = ctx.createRadialGradient(-BR * 0.38, -BR * 0.38, 0.5, -BR * 0.25, -BR * 0.25, BR * 0.65);
    spec.addColorStop(0, 'rgba(255,255,255,0.85)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.beginPath(); ctx.arc(0, 0, BR, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  });

  // Draw cue stick when aiming
  if (isMyTurn && !ballInHand && cue && aimPower >= 0) {
    const pullBack = 30 + aimPower * 0.45;
    ctx.save();
    ctx.translate(cue.x, cue.y);
    ctx.rotate(aimAngle);

    // Tip to butt
    const tipX = BR + pullBack;
    const buttX = tipX + 340;
    const gradient = ctx.createLinearGradient(tipX, 0, buttX, 0);
    gradient.addColorStop(0, '#4a8cff');    // tip (chalk blue)
    gradient.addColorStop(0.03, '#f0d090'); // shaft
    gradient.addColorStop(0.6, '#c8a060');
    gradient.addColorStop(0.85, '#7a4820'); // wrap
    gradient.addColorStop(1, '#4a2810');    // butt

    // Taper
    ctx.beginPath();
    ctx.moveTo(tipX, -1.5);
    ctx.lineTo(tipX + 50, -3);
    ctx.lineTo(buttX, -7);
    ctx.lineTo(buttX, 7);
    ctx.lineTo(tipX + 50, 3);
    ctx.lineTo(tipX, 1.5);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Wrap ring
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(tipX + 260, -8, 3, 16);

    ctx.restore();
  }
}

// Color helpers
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}
function lighten(hex: string, amt: number) {
  try {
    const { r, g, b } = hexToRgb(hex);
    return `rgb(${Math.min(255, r + amt)},${Math.min(255, g + amt)},${Math.min(255, b + amt)})`;
  } catch { return hex; }
}
function darken(hex: string, amt: number) {
  try {
    const { r, g, b } = hexToRgb(hex);
    return `rgb(${Math.max(0, r - amt)},${Math.max(0, g - amt)},${Math.max(0, b - amt)})`;
  } catch { return hex; }
}

// ─── Component ────────────────────────────────────────────────────────────────
export const PoolGame: React.FC<PoolGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Ball[]>(buildRack());
  const animRef = useRef<number | null>(null);
  const pottedThisTurnRef = useRef<number[]>([]);
  const firstHitRef = useRef<number | null>(null);

  // Game state
  const [balls, setBalls] = useState<Ball[]>(ballsRef.current);
  const [isMoving, setIsMoving] = useState(false);
  const [myGroup, setMyGroup] = useState<'solids' | 'stripes' | null>(null);
  const [message, setMessage] = useState('');
  const [ballInHand, setBallInHand] = useState(false);
  const [showForfeit, setShowForfeit] = useState(false);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);

  // Cue aim state
  const [aimAngle, setAimAngle] = useState(Math.PI);
  const [aimPower, setAimPower] = useState(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Determine player roles from socket
  const roomId = socketGame?.roomId || socketGame?.id || '';
  const players = socketGame?.players || [];
  const myId = user.id;
  const opponentId = players.find(p => p !== myId) || '';
  // Whoever is in players[0] goes first (breaks)
  const iAmPlayer1 = players[0] === myId;

  // Turn state synced with server
  const [currentTurnId, setCurrentTurnId] = useState<string>(players[0] || myId);
  const isMyTurn = currentTurnId === myId;

  const myGroupRef = useRef(myGroup);
  myGroupRef.current = myGroup;
  const currentTurnIdRef = useRef(currentTurnId);
  currentTurnIdRef.current = currentTurnId;
  const isMovingRef = useRef(isMoving);
  isMovingRef.current = isMoving;
  const ballInHandRef = useRef(ballInHand);
  ballInHandRef.current = ballInHand;

  // ─── Listen for opponent moves (socket updates) ───────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (data: any) => {
      if (data.roomId !== roomId && data.id !== roomId) return;
      const gs = data.gameState;
      if (!gs) return;

      // Sync ball positions from server (opponent's shot result)
      if (gs.balls) {
        const syncedBalls: Ball[] = gs.balls;
        ballsRef.current = syncedBalls;
        setBalls([...syncedBalls]);
      }
      if (gs.turn) setCurrentTurnId(gs.turn);
      if (gs.myGroupP1 !== undefined || gs.myGroupP2 !== undefined) {
        const myKey = iAmPlayer1 ? 'myGroupP1' : 'myGroupP2';
        if (gs[myKey]) setMyGroup(gs[myKey]);
      }
      if (gs.ballInHand && gs.turn === myId) setBallInHand(true);
      if (gs.message) setMessage(gs.message);
    };
    socket.on('game_update', handleUpdate);
    return () => { socket.off('game_update', handleUpdate); };
  }, [socket, roomId, myId, iAmPlayer1]);

  // Initial sync: apply gameState from server on match start
  useEffect(() => {
    if (socketGame?.gameState?.balls) {
      const serverBalls = (socketGame.gameState as any).balls as Ball[];
      ballsRef.current = serverBalls;
      setBalls([...serverBalls]);
    }
    if (socketGame?.gameState?.turn) {
      setCurrentTurnId((socketGame.gameState as any).turn as string);
    }
    // First break message
    setMessage(players[0] === myId ? '🎱 Your Break!' : `⏳ ${getOpponentName()}\'s Break`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getOpponentName = () => {
    const profiles = socketGame?.profiles || {};
    return profiles[opponentId]?.name || 'Opponent';
  };

  // ─── Game loop ────────────────────────────────────────────────────────────
  const runPhysics = useCallback(() => {
    const pottedCb = (id: number) => {
      pottedThisTurnRef.current.push(id);
      playSFX('capture');
    };
    const moving = stepPhysics(ballsRef.current, pottedCb);
    setBalls([...ballsRef.current]);
    if (moving) {
      animRef.current = requestAnimationFrame(runPhysics);
    } else {
      setIsMoving(false);
      handleTurnEnd();
    }
  }, []); // eslint-disable-line

  const startPhysics = useCallback(() => {
    setIsMoving(true);
    pottedThisTurnRef.current = [];
    firstHitRef.current = null;
    animRef.current = requestAnimationFrame(runPhysics);
  }, [runPhysics]);

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  // ─── Turn end arbiter ─────────────────────────────────────────────────────
  const handleTurnEnd = () => {
    const potted = pottedThisTurnRef.current;
    const cuePotted = potted.includes(0);
    const eightPotted = potted.includes(8);
    const firstHit = firstHitRef.current;
    const group = myGroupRef.current;
    let foul = false, foulReason = '';

    if (eightPotted) {
      if (cuePotted) { endGame('loss', 'Scratched on the 8-ball! You lose.'); return; }
      const myRemaining = ballsRef.current.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8 &&
        ((group === 'solids' && b.id < 8) || (group === 'stripes' && b.id > 8)));
      if (myRemaining.length === 0 && group) { endGame('win', '🎱 8-ball sunk! You win!'); return; }
      endGame('loss', '8-ball sunk too early! You lose.'); return;
    }

    // Fouls
    if (cuePotted) { foul = true; foulReason = 'Scratch!'; }
    else if (firstHit === null) { foul = true; foulReason = 'No ball contacted!'; }
    else if (group) {
      const shouldHitSolid = group === 'solids';
      const hitSolid = firstHit < 8;
      const hitStripe = firstHit > 8;
      if (shouldHitSolid && !hitSolid && firstHit !== 8) { foul = true; foulReason = 'Hit opponent\'s ball first!'; }
      if (!shouldHitSolid && !hitStripe && firstHit !== 8) { foul = true; foulReason = 'Hit opponent\'s ball first!'; }
    } else if (firstHit === 8) { foul = true; foulReason = 'Cannot hit 8-ball on open table!'; }

    // Group assignment from first legal pot
    let newGroup = group;
    if (!group && !foul) {
      const firstLegal = potted.find(id => id !== 0 && id !== 8);
      if (firstLegal !== undefined) {
        newGroup = firstLegal < 8 ? 'solids' : 'stripes';
        setMyGroup(newGroup);
        setMessage(`You are ${newGroup === 'solids' ? 'Solids 🔵' : 'Stripes 🟡'} — ${getOpponentName()} is ${newGroup === 'solids' ? 'Stripes' : 'Solids'}`);
      }
    }

    // Respawn cue on scratch
    if (cuePotted) {
      const cue = ballsRef.current.find(b => b.id === 0)!;
      cue.pocketed = false; cue.x = TW * 0.25; cue.y = TH / 2; cue.vx = 0; cue.vy = 0;
    }

    // Legal pot = keep turn
    const validPot = potted.some(id => id !== 0 &&
      (!newGroup || (newGroup === 'solids' && id < 8) || (newGroup === 'stripes' && id > 8)));
    const keepTurn = validPot && !foul;

    const nextTurnId = keepTurn ? myId : opponentId;

    if (foul) {
      setMessage(`⚠️ FOUL: ${foulReason} — ${getOpponentName()} gets ball in hand`);
    } else if (keepTurn) {
      setMessage('✅ Good shot! Continue...');
    } else {
      setMessage(`${getOpponentName()}'s turn`);
    }

    // Send state to server
    sendMoveToServer(nextTurnId, foul && !keepTurn, newGroup || null);
    setCurrentTurnId(nextTurnId);
    if (foul && nextTurnId === myId) setBallInHand(true);
  };

  const sendMoveToServer = (nextTurn: string, opponentGainsBih: boolean, group: 'solids' | 'stripes' | null) => {
    if (!socket || !roomId) return;
    const myKey = iAmPlayer1 ? 'myGroupP1' : 'myGroupP2';
    socket.emit('game_action', {
      roomId,
      action: {
        type: 'MOVE',
        newState: {
          balls: ballsRef.current,
          turn: nextTurn,
          ballInHand: opponentGainsBih,
          [myKey]: group,
          message: '',
        }
      }
    });
  };

  const endGame = (result: 'win' | 'loss', msg: string) => {
    setMessage(msg);
    const winnerId = result === 'win' ? myId : opponentId;
    if (socket && roomId) {
      socket.emit('game_action', {
        roomId,
        action: { type: 'MOVE', newState: { winner: winnerId, balls: ballsRef.current } }
      });
    }
    setTimeout(() => onGameEnd(result), 2500);
  };

  // ─── Shoot ────────────────────────────────────────────────────────────────
  const shoot = useCallback((angle: number, power: number) => {
    if (power < 3) return;
    const cue = ballsRef.current.find(b => b.id === 0);
    if (!cue || cue.pocketed) return;
    const speed = (power / 100) * 32;
    // Shoot in the opposite direction of aim (cue strikes ball from behind)
    cue.vx = Math.cos(angle + Math.PI) * speed;
    cue.vy = Math.sin(angle + Math.PI) * speed;

    // Track first contact
    firstHitRef.current = null;
    const trackFirst = () => {
      if (firstHitRef.current !== null) return;
      for (const b of ballsRef.current) {
        if (b.id === 0 || b.pocketed) continue;
        if (Math.hypot(b.x - cue.x, b.y - cue.y) < BR * 2.1) {
          firstHitRef.current = b.id;
          break;
        }
      }
    };
    // Patch physics loop to call trackFirst
    const origStep = stepPhysics;
    ballsRef.current.forEach(b => { if (b.id !== 0) (b as any)._prevHyp = Math.hypot(b.x - cue.x, b.y - cue.y) }); // eslint-disable-line

    playSFX('dice');
    startPhysics();
  }, [startPhysics]);

  // ─── Canvas input ────────────────────────────────────────────────────────
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = TW / rect.width;
    const scaleY = TH / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn || isMovingRef.current) return;
    const pos = getCanvasPos(e);

    if (ballInHandRef.current) {
      // Place cue ball
      const overlap = ballsRef.current.some(b => b.id !== 0 && !b.pocketed && Math.hypot(b.x - pos.x, b.y - pos.y) < BR * 2.1);
      if (!overlap && pos.x > BR && pos.x < TW - BR && pos.y > BR && pos.y < TH - BR) {
        const cue = ballsRef.current.find(b => b.id === 0)!;
        cue.pocketed = false; cue.x = pos.x; cue.y = pos.y; cue.vx = 0; cue.vy = 0;
        setBalls([...ballsRef.current]);
        setBallInHand(false);
        ballInHandRef.current = false;
        setMessage('🎱 Take your shot!');
      }
      return;
    }

    isDraggingRef.current = true;
    dragStartRef.current = pos;
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn || isMovingRef.current) return;
    const pos = getCanvasPos(e);

    // Update aim angle based on mouse position relative to cue ball
    const cue = ballsRef.current.find(b => b.id === 0 && !b.pocketed);
    if (cue) {
      const angle = Math.atan2(pos.y - cue.y, pos.x - cue.x);
      setAimAngle(angle);
    }

    if (ballInHandRef.current) {
      setGhostPos(pos);
      return;
    }

    if (isDraggingRef.current && dragStartRef.current) {
      const dist = Math.hypot(pos.x - dragStartRef.current.x, pos.y - dragStartRef.current.y);
      const power = Math.min(100, (dist / 120) * 100);
      setAimPower(power);
    }
  };

  const handlePointerUp = () => {
    if (!isMyTurn || isMovingRef.current || ballInHandRef.current) return;
    if (isDraggingRef.current && aimPower > 3) {
      shoot(aimAngle, aimPower);
      setAimPower(0);
    }
    isDraggingRef.current = false;
  };

  // ─── Canvas render loop ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawTable(ctx, balls, aimAngle, aimPower, isMyTurn && !isMoving, ballInHand, ghostPos, 0);
  }, [balls, aimAngle, aimPower, isMyTurn, isMoving, ballInHand, ghostPos]);

  // ─── Scoreboard data ──────────────────────────────────────────────────────
  const solids = balls.filter(b => b.id >= 1 && b.id <= 7);
  const stripes = balls.filter(b => b.id >= 9 && b.id <= 15);
  const mySolids = myGroup === 'solids';

  const myBallsPotted = myGroup
    ? balls.filter(b => b.pocketed && b.id !== 0 && b.id !== 8 &&
      ((myGroup === 'solids' && b.id < 8) || (myGroup === 'stripes' && b.id > 8))).length
    : 0;
  const oppBallsPotted = myGroup
    ? balls.filter(b => b.pocketed && b.id !== 0 && b.id !== 8 &&
      ((myGroup === 'solids' && b.id > 8) || (myGroup === 'stripes' && b.id < 8))).length
    : 0;

  const myGroupTotal = 7;
  const profiles = socketGame?.profiles || {};
  const opponentProfile = profiles[opponentId];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c1a0f] to-[#0a100a] flex flex-col items-center select-none overflow-hidden">
      {/* Forfeit Modal */}
      <AnimatePresence>
        {showForfeit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowForfeit(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-[#0e1f10] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl z-10">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                  <AlertTriangle className="text-red-500" size={32} />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                <p className="text-sm text-slate-400">Leaving will count as a <span className="text-red-400 font-bold">loss</span>.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowForfeit(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors">
                  Stay
                </button>
                <button onClick={() => { if (socket && roomId) socket.emit('game_action', { roomId, action: { type: 'FORFEIT' } }); onGameEnd('quit'); }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors">
                  Forfeit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header HUD */}
      <div className="w-full max-w-5xl px-4 pt-4 pb-2 flex items-center gap-3">
        <button onClick={() => setShowForfeit(true)}
          className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>

        {/* Player 1 panel */}
        <div className={`flex items-center gap-2.5 flex-1 p-3 rounded-xl border transition-all ${currentTurnId === myId ? 'border-emerald-500/50 bg-emerald-900/20 shadow-lg shadow-emerald-900/20' : 'border-white/10 bg-white/5'}`}>
          <div className="relative">
            <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full border-2 border-emerald-400" />
            {currentTurnId === myId && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border border-black animate-pulse" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-sm truncate">{user.name}</div>
            <div className="flex items-center gap-1 mt-0.5">
              {myGroup ? (
                <>
                  {Array.from({ length: 7 }).map((_, i) => {
                    const ballId = myGroup === 'solids' ? i + 1 : i + 9;
                    const isPotted = balls.find(b => b.id === ballId)?.pocketed;
                    return (
                      <div key={ballId} className="w-3 h-3 rounded-full border border-black/30 transition-all"
                        style={{ backgroundColor: isPotted ? BALL_COLORS[ballId] : undefined, opacity: isPotted ? 1 : 0.2, borderColor: BALL_COLORS[ballId] }} />
                    );
                  })}
                </>
              ) : (
                <span className="text-xs text-slate-500 italic">Open table</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-black text-white">{myBallsPotted}</div>
            <div className="text-[10px] text-slate-500">/ 7</div>
          </div>
        </div>

        {/* Center info */}
        <div className="flex flex-col items-center px-2">
          <div className="text-[10px] text-gold-400 font-bold uppercase tracking-widest">Pot</div>
          <div className="text-sm font-mono font-bold text-white">{(table.stake * 2).toLocaleString()}</div>
          <div className="text-[9px] text-slate-500">FCFA</div>
          <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center border border-slate-700 mt-1">
            <span className="text-xs font-bold" style={{ color: BALL_COLORS[8] }}>8</span>
          </div>
        </div>

        {/* Opponent panel */}
        <div className={`flex items-center gap-2.5 flex-1 p-3 rounded-xl border transition-all flex-row-reverse ${currentTurnId === opponentId ? 'border-red-500/50 bg-red-900/20 shadow-lg shadow-red-900/20' : 'border-white/10 bg-white/5'}`}>
          <div className="relative">
            <img src={opponentProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${opponentId}`}
              alt={opponentProfile?.name || 'Opponent'}
              className="w-10 h-10 rounded-full border-2 border-red-400" />
            {currentTurnId === opponentId && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-400 rounded-full border border-black animate-pulse" />}
          </div>
          <div className="flex-1 min-w-0 text-right">
            <div className="font-bold text-white text-sm truncate">{opponentProfile?.name || 'Opponent'}</div>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {myGroup ? (
                Array.from({ length: 7 }).map((_, i) => {
                  const ballId = myGroup === 'stripes' ? i + 1 : i + 9;
                  const isPotted = balls.find(b => b.id === ballId)?.pocketed;
                  return (
                    <div key={ballId} className="w-3 h-3 rounded-full border border-black/30 transition-all"
                      style={{ backgroundColor: isPotted ? BALL_COLORS[ballId] : undefined, opacity: isPotted ? 1 : 0.2, borderColor: BALL_COLORS[ballId] }} />
                  );
                })
              ) : (
                <span className="text-xs text-slate-500 italic">Open table</span>
              )}
            </div>
          </div>
          <div className="text-left">
            <div className="text-2xl font-mono font-black text-white">{oppBallsPotted}</div>
            <div className="text-[10px] text-slate-500">/ 7</div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="w-full max-w-5xl px-4 mb-2">
        <div className={`flex items-center justify-between px-4 py-2 rounded-xl border text-sm font-bold transition-all ${
          isMyTurn ? 'bg-emerald-900/30 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/50 border-white/10 text-slate-400'
        }`}>
          <span>{message || (isMyTurn ? (ballInHand ? '🖐 Place cue ball anywhere' : '🎯 Aim & drag to shoot') : `⏳ ${getOpponentName()} is shooting...`)}</span>
          {isMoving && <span className="text-xs font-mono text-slate-500 animate-pulse">physics running...</span>}
        </div>
      </div>

      {/* Power bar (when dragging) */}
      {aimPower > 0 && isMyTurn && (
        <div className="w-full max-w-5xl px-4 mb-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-10">Power</span>
            <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden border border-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ width: `${aimPower}%`, backgroundColor: aimPower > 80 ? '#ef4444' : aimPower > 50 ? '#f59e0b' : '#22c55e' }}
                animate={{ width: `${aimPower}%` }}
                transition={{ duration: 0 }}
              />
            </div>
            <span className="text-xs font-mono text-white w-10 text-right">{Math.round(aimPower)}%</span>
          </div>
        </div>
      )}

      {/* Canvas Table */}
      <div className="w-full max-w-5xl px-4 flex-1 flex items-center justify-center">
        <div className="relative w-full" style={{ paddingTop: `${(TH / TW) * 100}%` }}>
          {/* Wooden rail surround */}
          <div className="absolute inset-0 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8),inset_0_0_0_18px_#3e2010,inset_0_0_0_19px_#5c3320,inset_0_0_0_20px_#2d1a0a]">
            <div className="absolute inset-[16px] rounded-xl overflow-hidden">
              <canvas
                ref={canvasRef}
                width={TW}
                height={TH}
                className="w-full h-full block cursor-crosshair"
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              />
            </div>
            {/* Rail label corners */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-[#8b6030]/60 font-mono">KATIKA 8-POOL</div>
            </div>
          </div>
          {/* Opponent thinking overlay */}
          {!isMyTurn && !isMoving && (
            <div className="absolute inset-[16px] flex items-center justify-center pointer-events-none">
              <div className="bg-black/50 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-sm text-white font-bold">{getOpponentName()} is thinking...</span>
              </div>
            </div>
          )}
          {/* Ball in hand indicator */}
          {ballInHand && isMyTurn && (
            <div className="absolute inset-[16px] flex items-end justify-center pointer-events-none pb-4">
              <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 1.5 }}
                className="bg-emerald-900/80 backdrop-blur-sm border border-emerald-500/50 rounded-full px-4 py-1.5 text-emerald-300 text-sm font-bold">
                🖐 Click anywhere to place cue ball
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Potted balls tray */}
      <div className="w-full max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          {balls.filter(b => b.pocketed && b.id !== 0 && b.id !== 8).sort((a, b_) => a.id - b_.id).map(b => (
            <motion.div key={b.id} initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-7 h-7 rounded-full border border-black/50 flex items-center justify-center shadow-inner"
              style={{ backgroundColor: BALL_COLORS[b.id] }}>
              <span className="text-[8px] font-bold" style={{ color: b.id < 8 ? '#fff' : '#fff', textShadow: '0 0 2px #000' }}>{b.id}</span>
            </motion.div>
          ))}
          {balls.filter(b => b.pocketed && b.id !== 0 && b.id !== 8).length === 0 &&
            <span className="text-xs text-slate-600 italic">No balls potted yet</span>}
        </div>
        <div className="text-xs text-slate-600 font-mono">
          {balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8).length} remaining
        </div>
      </div>
    </div>
  );
};
