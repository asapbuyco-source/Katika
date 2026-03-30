
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { Table, User } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { playSFX } from '../services/sound';
import { Socket } from 'socket.io-client';
import { SocketGameState } from '../types';

interface PoolGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: SocketGameState | null;
}

// ─── Physics constants ────────────────────────────────────────────────────────
const TW = 900;
const TH = 450;
const BR = 11;
const PR = 22;
const FRICTION = 0.984;
const WALL_REST = 0.73;
const BALL_REST = 0.95;
const VEL_THRESH = 0.09;
const SUB = 8;

const POCKETS = [
  { x: PR * 0.5,       y: PR * 0.5       },
  { x: TW / 2,         y: -3             },
  { x: TW - PR * 0.5,  y: PR * 0.5       },
  { x: PR * 0.5,       y: TH - PR * 0.5  },
  { x: TW / 2,         y: TH + 3         },
  { x: TW - PR * 0.5,  y: TH - PR * 0.5  },
];

const BALL_COLORS: Record<number, string> = {
  0: '#F5F0E8',
  1: '#F7C033', 2: '#1A5CE5', 3: '#E5231A', 4: '#6A1DB5',
  5: '#F08020', 6: '#1A8C3B', 7: '#8B1A1A', 8: '#111111',
  9: '#F7C033', 10: '#1A5CE5', 11: '#E5231A', 12: '#6A1DB5',
  13: '#F08020', 14: '#1A8C3B', 15: '#8B1A1A',
};

interface Ball {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  pocketed: boolean;
}

// ─── Rack builder ─────────────────────────────────────────────────────────────
function buildRack(): Ball[] {
  const balls: Ball[] = [];
  const cx = TW * 0.625, cy = TH / 2;
  const dx = BR * 2.05, dy = BR * 1.19;
  // Standard legal rack
  const rows = [[1],[9,2],[10,8,3],[11,4,12,5],[13,6,14,7,15]];
  rows.forEach((row, ri) => {
    row.forEach((id, ci) => {
      balls.push({ id, x: cx + ri * dx, y: cy + (ci - (row.length-1)/2) * dy * 2, vx:0, vy:0, pocketed:false });
    });
  });
  balls.push({ id: 0, x: TW * 0.25, y: cy, vx:0, vy:0, pocketed:false });
  return balls;
}

// ─── Physics step ─────────────────────────────────────────────────────────────
function stepPhysics(
  balls: Ball[],
  pottedCb: (id: number) => void,
  firstHitCb: (id: number) => void
): boolean {
  let anyMoving = false;
  const cueBall = balls.find(b => b.id === 0 && !b.pocketed);

  for (let step = 0; step < SUB; step++) {
    const active = balls.filter(b => !b.pocketed);

    for (const b of active) {
      b.x += b.vx / SUB;
      b.y += b.vy / SUB;
      if (b.x < BR) { b.x = BR; b.vx =  Math.abs(b.vx) * WALL_REST; }
      if (b.x > TW - BR) { b.x = TW - BR; b.vx = -Math.abs(b.vx) * WALL_REST; }
      if (b.y < BR) { b.y = BR; b.vy =  Math.abs(b.vy) * WALL_REST; }
      if (b.y > TH - BR) { b.y = TH - BR; b.vy = -Math.abs(b.vy) * WALL_REST; }
    }

    // Ball-ball collisions
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx*dx + dy*dy, min = BR * 2;
        if (d2 < min * min && d2 > 0.001) {
          const d = Math.sqrt(d2), nx = dx/d, ny = dy/d;
          const overlap = (min - d) / 2;
          a.x -= overlap * nx; a.y -= overlap * ny;
          b.x += overlap * nx; b.y += overlap * ny;
          const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot > 0) {
            const imp = dot * BALL_REST;
            a.vx -= imp * nx; a.vy -= imp * ny;
            b.vx += imp * nx; b.vy += imp * ny;
            // First-hit tracking
            if (cueBall) {
              if (a.id === 0 && b.id !== 0) firstHitCb(b.id);
              if (b.id === 0 && a.id !== 0) firstHitCb(a.id);
            }
          }
        }
      }
    }

    // Pocket check
    for (const b of active) {
      for (const p of POCKETS) {
        const dx = b.x - p.x, dy = b.y - p.y;
        if (dx*dx + dy*dy < PR * PR) {
          b.pocketed = true; b.vx = 0; b.vy = 0;
          pottedCb(b.id);
          break;
        }
      }
    }
  }

  // Friction
  for (const b of balls) {
    if (b.pocketed) continue;
    b.vx *= FRICTION; b.vy *= FRICTION;
    if (Math.abs(b.vx) < VEL_THRESH) b.vx = 0;
    if (Math.abs(b.vy) < VEL_THRESH) b.vy = 0;
    if (b.vx !== 0 || b.vy !== 0) anyMoving = true;
  }
  return anyMoving;
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────
function lighten(hex: string, a: number): string {
  try { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgb(${Math.min(255,r+a)},${Math.min(255,g+a)},${Math.min(255,b+a)})`; } catch { return hex; }
}
function darken(hex: string, a: number): string {
  try { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgb(${Math.max(0,r-a)},${Math.max(0,g-a)},${Math.max(0,b-a)})`; } catch { return hex; }
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  balls: Ball[],
  aimAngle: number,
  aimPower: number,
  showAim: boolean,
  ballInHand: boolean,
  ghostPos: {x:number;y:number}|null
) {
  ctx.clearRect(0, 0, TW, TH);

  // Felt gradient
  const felt = ctx.createRadialGradient(TW/2,TH/2,0,TW/2,TH/2,Math.max(TW,TH)*0.7);
  felt.addColorStop(0, '#1a6b3a'); felt.addColorStop(1, '#0d4422');
  ctx.fillStyle = felt; ctx.fillRect(0, 0, TW, TH);

  // Subtle dot texture
  ctx.fillStyle = 'rgba(255,255,255,0.011)';
  for (let x=0;x<TW;x+=18) for (let y=0;y<TH;y+=18) {
    ctx.beginPath(); ctx.arc(x,y,1,0,Math.PI*2); ctx.fill();
  }

  // Head string
  ctx.setLineDash([5,5]); ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(TW*0.25,8); ctx.lineTo(TW*0.25,TH-8); ctx.stroke();
  ctx.setLineDash([]);

  // Spots
  ctx.fillStyle='rgba(255,255,255,0.16)';
  [[TW*0.625,TH/2],[TW*0.25,TH/2]].forEach(([sx,sy]) => {
    ctx.beginPath(); ctx.arc(sx,sy,3,0,Math.PI*2); ctx.fill();
  });

  // Pockets
  POCKETS.forEach(p => {
    const pg = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,PR+6);
    pg.addColorStop(0,'#000'); pg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(p.x,p.y,PR+6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(p.x,p.y,PR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#3a2010'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(p.x,p.y,PR+1,0,Math.PI*2); ctx.stroke();
  });

  // Ball-in-hand ghost
  const cue = balls.find(b=>b.id===0&&!b.pocketed);
  if (ballInHand && ghostPos) {
    ctx.globalAlpha=0.4; ctx.fillStyle=BALL_COLORS[0];
    ctx.beginPath(); ctx.arc(ghostPos.x,ghostPos.y,BR,0,Math.PI*2); ctx.fill();
    ctx.setLineDash([4,4]); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(ghostPos.x,ghostPos.y,BR+3,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha=1;
  }

  // Aim guide
  if (showAim && !ballInHand && cue && aimPower >= 0) {
    const sdx = Math.cos(aimAngle+Math.PI), sdy = Math.sin(aimAngle+Math.PI);
    let lx=cue.x, ly=cue.y, reflectLen=0;
    const stepSz=2, maxS=(TW+TH)/stepSz;
    for (let s=0;s<maxS;s++) {
      lx+=sdx*stepSz; ly+=sdy*stepSz;
      if (lx<BR||lx>TW-BR||ly<BR||ly>TH-BR) { reflectLen=s*stepSz; break; }
      const hit=balls.find(b=>!b.pocketed&&b.id!==0&&Math.hypot(b.x-lx,b.y-ly)<BR*2);
      if (hit) { reflectLen=s*stepSz;
        // ghost cue at impact
        ctx.globalAlpha=0.22; ctx.fillStyle='#fff';
        ctx.beginPath(); ctx.arc(lx-sdx*stepSz,ly-sdy*stepSz,BR,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1;
        break;
      }
      reflectLen=s*stepSz;
    }
    ctx.save(); ctx.setLineDash([7,5]); ctx.strokeStyle='rgba(255,255,255,0.32)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(cue.x,cue.y); ctx.lineTo(cue.x+sdx*reflectLen,cue.y+sdy*reflectLen); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // Balls
  balls.forEach(b => {
    if (b.pocketed) return;
    const color = BALL_COLORS[b.id]||'#888';
    const isStripe = b.id>=9;
    ctx.save(); ctx.translate(b.x,b.y);
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath();
    ctx.ellipse(3,5,BR,BR*0.65,0,0,Math.PI*2); ctx.fill();

    if (isStripe) {
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,BR,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(0,0,BR,0,Math.PI*2); ctx.clip();
      ctx.fillStyle=color; ctx.fillRect(-BR,-BR*0.52,BR*2,BR*1.04); ctx.restore();
    } else {
      const bg=ctx.createRadialGradient(-BR*0.35,-BR*0.35,1,0,0,BR);
      bg.addColorStop(0,lighten(color,45)); bg.addColorStop(0.6,color); bg.addColorStop(1,darken(color,30));
      ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,BR,0,Math.PI*2); ctx.fill();
    }

    if (b.id!==0) {
      const nr=isStripe?BR*0.44:BR*0.41;
      const nbg=ctx.createRadialGradient(0,0,0,0,0,nr);
      if (isStripe) { nbg.addColorStop(0,color); nbg.addColorStop(1,darken(color,20)); }
      else { nbg.addColorStop(0,'rgba(255,255,255,0.92)'); nbg.addColorStop(1,'rgba(235,235,225,0.85)'); }
      ctx.fillStyle=nbg; ctx.beginPath(); ctx.arc(0,0,nr,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=isStripe?'#fff':'#1a1a1a';
      ctx.font=`bold ${b.id<10?8:7}px Arial`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(b.id),0,0.5);
    }

    // Specular
    ctx.globalAlpha=0.48;
    const sp=ctx.createRadialGradient(-BR*0.38,-BR*0.38,0.5,-BR*0.25,-BR*0.25,BR*0.65);
    sp.addColorStop(0,'rgba(255,255,255,0.85)'); sp.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=sp; ctx.beginPath(); ctx.arc(0,0,BR,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1; ctx.restore();
  });

  // Cue stick
  if (showAim && !ballInHand && cue) {
    const pullBack = 28 + aimPower * 0.42;
    ctx.save(); ctx.translate(cue.x,cue.y); ctx.rotate(aimAngle);
    const tx=BR+pullBack, bx=tx+340;
    const g=ctx.createLinearGradient(tx,0,bx,0);
    g.addColorStop(0,'#4a8cff'); g.addColorStop(0.03,'#f0d090');
    g.addColorStop(0.6,'#c8a060'); g.addColorStop(0.85,'#7a4820'); g.addColorStop(1,'#4a2810');
    ctx.beginPath();
    ctx.moveTo(tx,-1.5); ctx.lineTo(tx+50,-3); ctx.lineTo(bx,-7);
    ctx.lineTo(bx,7); ctx.lineTo(tx+50,3); ctx.lineTo(tx,1.5); ctx.closePath();
    ctx.fillStyle=g; ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(tx+260,-7,3,14);
    ctx.restore();
  }
}

// ─── AI Bot helpers ───────────────────────────────────────────────────────────
function findBestBotShot(balls: Ball[], botGroup: 'solids'|'stripes'|null, myId: string) {
  const cue = balls.find(b => b.id===0 && !b.pocketed);
  if (!cue) return null;

  // Determine legal targets
  const groupRemaining = botGroup
    ? balls.filter(b => !b.pocketed && ((botGroup==='solids'&&b.id>=1&&b.id<=7)||(botGroup==='stripes'&&b.id>=9&&b.id<=15)))
    : balls.filter(b => !b.pocketed && b.id!==0 && b.id!==8);

  let targets: Ball[];
  if (botGroup && groupRemaining.length===0) {
    // Go for 8
    targets = balls.filter(b=>b.id===8&&!b.pocketed);
  } else {
    targets = groupRemaining.length>0 ? groupRemaining : balls.filter(b=>b.id!==0&&b.id!==8&&!b.pocketed);
  }

  if (targets.length===0) return null;

  // Pick closest target
  let best = targets[0];
  let bestDist = Math.hypot(best.x-cue.x, best.y-cue.y);
  for (const t of targets) {
    const d = Math.hypot(t.x-cue.x, t.y-cue.y);
    if (d < bestDist) { best=t; bestDist=d; }
  }

  // Aim straight at it with slight human-like error
  const angle = Math.atan2(best.y-cue.y, best.x-cue.x);
  const err = (Math.random()-0.5)*0.06;
  const power = 45 + Math.random()*40; // 45–85%
  return { angle: angle+err, power };
}

// ─── Component ────────────────────────────────────────────────────────────────
export const PoolGame: React.FC<PoolGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef   = useRef<Ball[]>(buildRack());
  const animRef    = useRef<number|null>(null);
  const pottedRef  = useRef<number[]>([]);
  const firstHitRef= useRef<number|null>(null);
  const firstHitLocked = useRef(false);

  // ── Mode detection ──────────────────────────────────────────────────────────
  // P2P = we have a real opponent from the socket. Otherwise = bot mode.
  const players   = socketGame?.players || [];
  const roomId    = (socketGame as any)?.roomId || (socketGame as any)?.id || '';
  const myId      = user.id;
  const opponentId= players.find(p => p !== myId) || '';
  const isP2P     = Boolean(players.length >= 2 && opponentId && socket && roomId);
  const iAmP1     = players[0] === myId;

  // In bot mode the "human" always goes first
  const initialTurn = isP2P ? (players[0] || myId) : myId;

  // Game state
  const [balls,       setBalls]       = useState<Ball[]>(ballsRef.current);
  const [isMoving,    setIsMoving]    = useState(false);
  const [myGroup,     setMyGroup]     = useState<'solids'|'stripes'|null>(null);
  const [botGroup,    setBotGroup]    = useState<'solids'|'stripes'|null>(null);
  const [message,     setMessage]     = useState('');
  const [ballInHand,  setBallInHand]  = useState(false);
  const [showForfeit, setShowForfeit] = useState(false);
  const [ghostPos,    setGhostPos]    = useState<{x:number;y:number}|null>(null);
  const [currentTurnId, setCurrentTurnId] = useState<string>(initialTurn);

  const [aimAngle, setAimAngle] = useState(Math.PI);
  const [aimPower, setAimPower] = useState(0);
  const isDragging = useRef(false);
  const dragStart  = useRef<{x:number;y:number}|null>(null);

  const isMyTurn    = currentTurnId === myId;
  const isBotTurn   = !isP2P && currentTurnId === 'bot';

  // Stable refs to avoid stale closures
  const myGroupRef = useRef(myGroup);       myGroupRef.current = myGroup;
  const botGroupRef= useRef(botGroup);      botGroupRef.current = botGroup;
  const isMovingRef= useRef(isMoving);      isMovingRef.current = isMoving;
  const ballInHandRef=useRef(ballInHand);   ballInHandRef.current = ballInHand;
  const currentTurnRef=useRef(currentTurnId); currentTurnRef.current=currentTurnId;

  const oppName = () => {
    if (!isP2P) return 'Bot 🤖';
    const pr = (socketGame as any)?.profiles || {};
    return pr[opponentId]?.name || 'Opponent';
  };

  const oppAvatar = () => {
    if (!isP2P) return `https://api.dicebear.com/7.x/bottts/svg?seed=bot8pool`;
    const pr = (socketGame as any)?.profiles || {};
    return pr[opponentId]?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${opponentId}`;
  };

  // ── Initial game message ────────────────────────────────────────────────────
  useEffect(() => {
    if (isP2P && socketGame) {
      // Sync server initial state if provided
      const gs = (socketGame as any).gameState;
      if (gs?.balls) { ballsRef.current = gs.balls; setBalls([...gs.balls]); }
      const serverTurn = gs?.turn || players[0] || myId;
      setCurrentTurnId(serverTurn);
      setMessage(serverTurn === myId ? '🎱 Your Break!' : `⏳ ${oppName()}'s Break`);
    } else {
      // Bot mode: human always breaks
      setMessage('🎱 Your Break! Aim & drag to shoot');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── P2P: listen for opponent moves ─────────────────────────────────────────
  useEffect(() => {
    if (!socket || !isP2P) return;
    const handler = (data: any) => {
      if (data.roomId !== roomId && data.id !== roomId) return;
      const gs = data.gameState;
      if (!gs) return;
      if (gs.balls) { ballsRef.current = gs.balls as Ball[]; setBalls([...gs.balls]); }
      if (gs.turn)  setCurrentTurnId(gs.turn as string);
      const myKey = iAmP1 ? 'myGroupP1' : 'myGroupP2';
      if (gs[myKey]) setMyGroup(gs[myKey] as 'solids'|'stripes');
      if (gs.ballInHand && gs.turn === myId) setBallInHand(true);
      if (gs.message) setMessage(gs.message);
    };
    socket.on('game_update', handler);
    return () => { socket.off('game_update', handler); };
  }, [socket, isP2P, roomId, myId, iAmP1]);

  const sendToServer = (nextTurn: string, grantBih: boolean, mg: 'solids'|'stripes'|null) => {
    if (!socket || !roomId) return;
    socket.emit('game_action', {
      roomId,
      action: {
        type: 'MOVE',
        newState: {
          balls: ballsRef.current,
          turn: nextTurn,
          ballInHand: grantBih,
          [iAmP1 ? 'myGroupP1' : 'myGroupP2']: mg,
        }
      }
    });
  };

  // ── Physics loop ────────────────────────────────────────────────────────────
  const runPhysics = useCallback(() => {
    const pottedCb = (id: number) => { pottedRef.current.push(id); };
    const hitCb    = (id: number) => {
      if (!firstHitLocked.current) { firstHitRef.current = id; firstHitLocked.current = true; }
    };
    const moving = stepPhysics(ballsRef.current, pottedCb, hitCb);
    setBalls([...ballsRef.current]);
    if (moving) {
      animRef.current = requestAnimationFrame(runPhysics);
    } else {
      setIsMoving(false);
      handleTurnEnd();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPhysics = useCallback(() => {
    pottedRef.current = [];
    firstHitRef.current = null;
    firstHitLocked.current = false;
    setIsMoving(true);
    animRef.current = requestAnimationFrame(runPhysics);
  }, [runPhysics]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  // ── Turn arbiter ────────────────────────────────────────────────────────────
  const handleTurnEnd = () => {
    const potted   = pottedRef.current;
    const cuePot   = potted.includes(0);
    const eightPot = potted.includes(8);
    const fhit     = firstHitRef.current;
    const isBotShot= currentTurnRef.current === 'bot';
    const actorGroup = isBotShot ? botGroupRef.current : myGroupRef.current;

    // ── 8-ball result ──
    if (eightPot) {
      if (isBotShot) {
        if (cuePot) { endGame('win',  '🎱 Bot scratched on 8! You win!'); return; }
        const botLeft = ballsRef.current.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8&&
          ((botGroupRef.current==='solids'&&b.id<8)||(botGroupRef.current==='stripes'&&b.id>8)));
        if (botLeft.length===0 && botGroupRef.current) { endGame('loss','⬛ Bot sinks the 8! You lose.'); return; }
        endGame('win','Bot sank 8 too early! You win!'); return;
      } else {
        if (cuePot) { endGame('loss','😬 Scratched on 8-ball! You lose.'); return; }
        const myLeft = ballsRef.current.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8&&
          ((myGroupRef.current==='solids'&&b.id<8)||(myGroupRef.current==='stripes'&&b.id>8)));
        if (myLeft.length===0 && myGroupRef.current) { endGame('win','🎱 8-ball sunk! You win!'); return; }
        endGame('loss','8-ball sunk too early! You lose.'); return;
      }
    }

    // ── Foul detection ──
    let foul=false, foulReason='';
    if (cuePot) { foul=true; foulReason='Scratch!'; }
    else if (fhit===null) { foul=true; foulReason='No ball contacted!'; }
    else if (actorGroup) {
      const shouldHitSolid = actorGroup==='solids';
      if (shouldHitSolid  && fhit>8)             { foul=true; foulReason='Hit opponent\'s ball first!'; }
      if (!shouldHitSolid && fhit<8&&fhit!==0)   { foul=true; foulReason='Hit opponent\'s ball first!'; }
    } else if (fhit===8) { foul=true; foulReason='Cannot hit 8-ball on open table!'; }

    // ── Scratch: respawn cue ──
    if (cuePot) {
      const cue=ballsRef.current.find(b=>b.id===0)!;
      cue.pocketed=false; cue.x=TW*0.25; cue.y=TH/2; cue.vx=0; cue.vy=0;
    }

    // ── Group assignment ──
    let newMyGroup   = myGroupRef.current;
    let newBotGroup  = botGroupRef.current;
    if (!foul && !isBotShot && !newMyGroup) {
      const firstLegal=potted.find(id=>id!==0&&id!==8);
      if (firstLegal!==undefined) {
        newMyGroup  = firstLegal<8?'solids':'stripes';
        newBotGroup = newMyGroup==='solids'?'stripes':'solids';
        setMyGroup(newMyGroup); setBotGroup(newBotGroup);
        setMessage(`You: ${newMyGroup==='solids'?'Solids🔵':'Stripes🟡'} | ${oppName()}: ${newBotGroup==='solids'?'Solids🔵':'Stripes🟡'}`);
      }
    }
    if (!foul && isBotShot && !newBotGroup) {
      const firstLegal=potted.find(id=>id!==0&&id!==8);
      if (firstLegal!==undefined) {
        newBotGroup = firstLegal<8?'solids':'stripes';
        newMyGroup  = newBotGroup==='solids'?'stripes':'solids';
        setBotGroup(newBotGroup); setMyGroup(newMyGroup);
      }
    }

    // ── Legal pot = keep turn ──
    const validPot = potted.some(id => {
      if (id===0||id===8) return false;
      const g = isBotShot ? newBotGroup : newMyGroup;
      return !g || (g==='solids'&&id<8) || (g==='stripes'&&id>8);
    });
    const keepTurn = validPot && !foul;

    const nextTurnForP2P = keepTurn ? myId : opponentId;
    const nextTurnForBot  = keepTurn
      ? (isBotShot ? 'bot' : myId)
      : (isBotShot ? myId : 'bot');

    const nextTurn = isP2P ? nextTurnForP2P : nextTurnForBot;

    // ── Messages ──
    if (foul) {
      setMessage(`⚠️ FOUL: ${foulReason}${isP2P?' — opponent gets ball in hand':' — you get ball in hand'}`);
    } else if (keepTurn) {
      setMessage(isBotShot ? `${oppName()} continues...` : '✅ Good shot! Continue...');
    } else {
      setMessage(nextTurn===myId ? '🎱 Your turn!' : `${oppName()}'s turn`);
    }

    // Grant ball in hand
    const opponentGetsBih = foul && !keepTurn;
    const humanGetsBih    = foul && isBotShot;
    if (!isP2P) {
      if (humanGetsBih) { setBallInHand(true); }
    } else {
      if (opponentGetsBih && nextTurn===myId) setBallInHand(true);
      sendToServer(nextTurn, opponentGetsBih, newMyGroup);
    }

    setCurrentTurnId(nextTurn);

    // ── Trigger bot ──
    if (!isP2P && nextTurn==='bot') {
      const delay = 900 + Math.random()*800;
      setTimeout(() => executeBotShot(humanGetsBih, newBotGroup), delay);
    }
  };

  // ── Bot AI ──────────────────────────────────────────────────────────────────
  const executeBotShot = (hasBih: boolean, bg: 'solids'|'stripes'|null) => {
    const cue = ballsRef.current.find(b=>b.id===0);
    if (!cue) return;

    // Place cue if in hand
    if (hasBih) {
      cue.pocketed=false; cue.x=TW*0.3+Math.random()*TW*0.1; cue.y=TH*0.3+Math.random()*TH*0.4;
      cue.vx=0; cue.vy=0;
      setBalls([...ballsRef.current]);
    }

    const shot = findBestBotShot(ballsRef.current, bg, 'bot');
    if (!shot) {
      // Fallback: hit something hard
      cue.vx = 22; cue.vy = (Math.random()-0.5)*4;
    } else {
      const spd = (shot.power/100)*30;
      // Bot aims FROM mouse position logic: angle+PI = actual direction of travel
      cue.vx = Math.cos(shot.angle)*spd;
      cue.vy = Math.sin(shot.angle)*spd;
    }
    playSFX('dice');
    startPhysics();
  };

  // ── End game ────────────────────────────────────────────────────────────────
  const endGame = (result: 'win'|'loss', msg: string) => {
    setMessage(msg);
    if (isP2P && socket && roomId) {
      const winnerId = result==='win' ? myId : opponentId;
      socket.emit('game_action', { roomId, action:{ type:'MOVE', newState:{ winner:winnerId, balls:ballsRef.current } } });
    }
    setTimeout(()=>onGameEnd(result), 2600);
  };

  // ── Shoot (player) ──────────────────────────────────────────────────────────
  const shoot = useCallback((angle: number, power: number) => {
    if (power<3) return;
    const cue=ballsRef.current.find(b=>b.id===0);
    if (!cue||cue.pocketed) return;
    const spd=(power/100)*30;
    cue.vx=Math.cos(angle+Math.PI)*spd;
    cue.vy=Math.sin(angle+Math.PI)*spd;
    playSFX('dice');
    startPhysics();
  }, [startPhysics]);

  // ── Canvas coordinate mapping ────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent|React.TouchEvent) => {
    const c=canvasRef.current; if(!c) return {x:0,y:0};
    const r=c.getBoundingClientRect();
    const sx=TW/r.width, sy=TH/r.height;
    if ('touches' in e && e.touches.length>0)
      return { x:(e.touches[0].clientX-r.left)*sx, y:(e.touches[0].clientY-r.top)*sy };
    return { x:((e as React.MouseEvent).clientX-r.left)*sx, y:((e as React.MouseEvent).clientY-r.top)*sy };
  };

  // ── Pointer events ───────────────────────────────────────────────────────────
  const onDown = (e: React.MouseEvent|React.TouchEvent) => {
    if (!isMyTurn||isMovingRef.current) return;
    const pos=getPos(e);
    if (ballInHandRef.current) {
      const overlap=ballsRef.current.some(b=>b.id!==0&&!b.pocketed&&Math.hypot(b.x-pos.x,b.y-pos.y)<BR*2.1);
      if (!overlap&&pos.x>BR&&pos.x<TW-BR&&pos.y>BR&&pos.y<TH-BR) {
        const cue=ballsRef.current.find(b=>b.id===0)!;
        cue.pocketed=false; cue.x=pos.x; cue.y=pos.y; cue.vx=0; cue.vy=0;
        setBalls([...ballsRef.current]); setBallInHand(false);
        ballInHandRef.current=false; setMessage('🎱 Take your shot!');
      }
      return;
    }
    isDragging.current=true; dragStart.current=pos;
  };

  const onMove = (e: React.MouseEvent|React.TouchEvent) => {
    if (!isMyTurn||isMovingRef.current) return;
    const pos=getPos(e);
    const cue=ballsRef.current.find(b=>b.id===0&&!b.pocketed);
    if (cue) setAimAngle(Math.atan2(pos.y-cue.y,pos.x-cue.x));
    if (ballInHandRef.current) { setGhostPos(pos); return; }
    if (isDragging.current&&dragStart.current) {
      const dist=Math.hypot(pos.x-dragStart.current.x,pos.y-dragStart.current.y);
      setAimPower(Math.min(100,(dist/130)*100));
    }
  };

  const onUp = () => {
    if (!isMyTurn||isMovingRef.current||ballInHandRef.current) return;
    if (isDragging.current&&aimPower>3) { shoot(aimAngle,aimPower); setAimPower(0); }
    isDragging.current=false;
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d'); if(!ctx) return;
    drawTable(ctx, balls, aimAngle, aimPower, isMyTurn&&!isMoving, ballInHand, ghostPos);
  }, [balls, aimAngle, aimPower, isMyTurn, isMoving, ballInHand, ghostPos]);

  // ── Scoreboard helpers ────────────────────────────────────────────────────────
  const myPotted  = myGroup ? balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8&&((myGroup==='solids'&&b.id<8)||(myGroup==='stripes'&&b.id>8))).length : 0;
  const oppPotted = myGroup ? balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8&&((myGroup==='solids'&&b.id>8)||(myGroup==='stripes'&&b.id<8))).length : 0;
  const remaining = balls.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8).length;

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c1a0f] to-[#090d09] flex flex-col items-center select-none overflow-hidden">

      {/* ── Forfeit modal ── */}
      <AnimatePresence>
        {showForfeit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={()=>setShowForfeit(false)}/>
            <motion.div initial={{scale:0.9,y:20}} animate={{scale:1,y:0}} exit={{scale:0.9,opacity:0}}
              className="relative z-10 bg-[#0e1f10] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mb-3 border border-red-500/20">
                  <AlertTriangle className="text-red-500" size={28}/>
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Forfeit Match?</h2>
                <p className="text-sm text-slate-400">This counts as a <span className="text-red-400 font-bold">loss</span>.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setShowForfeit(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors">Stay</button>
                <button onClick={()=>{ if(isP2P&&socket&&roomId) socket.emit('game_action',{roomId,action:{type:'FORFEIT'}}); onGameEnd('quit'); }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors">Forfeit</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Top HUD ── */}
      <div className="w-full max-w-5xl px-2 pt-2 pb-1 flex items-stretch gap-2">

        {/* Back button */}
        <button onClick={()=>setShowForfeit(true)}
          className="flex-shrink-0 p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors self-center">
          <ArrowLeft size={16}/>
        </button>

        {/* Player (me) */}
        <div className={`flex-1 flex items-center gap-2 p-2 rounded-xl border transition-all min-w-0 ${currentTurnId===myId?'border-emerald-500/50 bg-emerald-900/20':'border-white/10 bg-white/5'}`}>
          <div className="relative flex-shrink-0">
            <img src={user.avatar||`https://api.dicebear.com/7.x/avataaars/svg?seed=${myId}`} alt={user.name}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-emerald-400"/>
            {currentTurnId===myId&&<span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-black animate-pulse"/>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-xs sm:text-sm leading-tight truncate">{user.name}</p>
            <div className="flex gap-0.5 mt-0.5 flex-wrap">
              {myGroup ? Array.from({length:7}).map((_,i)=>{
                const bid=myGroup==='solids'?i+1:i+9;
                const ip=balls.find(b=>b.id===bid)?.pocketed;
                return <div key={bid} className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border border-black/30"
                  style={{backgroundColor:ip?BALL_COLORS[bid]:undefined,opacity:ip?1:0.18,borderColor:BALL_COLORS[bid]}}/>;
              }) : <span className="text-[10px] text-slate-500 italic">Open</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xl sm:text-2xl font-mono font-black text-white leading-none">{myPotted}</div>
            <div className="text-[9px] text-slate-500">/7</div>
          </div>
        </div>

        {/* Center: pot & 8-ball */}
        <div className="flex flex-col items-center justify-center flex-shrink-0 px-1 gap-0.5">
          <div className="text-[8px] text-yellow-400/80 font-bold uppercase tracking-widest leading-none">POT</div>
          <div className="text-xs font-mono font-bold text-white leading-none">{(table.stake*2).toLocaleString()}</div>
          <div className="text-[8px] text-slate-500 leading-none">FCFA</div>
          <div className="w-6 h-6 rounded-full bg-black border border-slate-600 flex items-center justify-center mt-0.5">
            <span className="text-[9px] font-bold text-slate-300">8</span>
          </div>
          {isP2P && (
            <div title={isP2P?'P2P Online':'Bot'}>
              {isP2P ? <Wifi size={10} className="text-emerald-400"/> : <WifiOff size={10} className="text-slate-500"/>}
            </div>
          )}
        </div>

        {/* Opponent / Bot */}
        <div className={`flex-1 flex items-center gap-2 p-2 rounded-xl border transition-all flex-row-reverse min-w-0 ${currentTurnId!==myId&&!isBotTurn?'border-red-500/50 bg-red-900/20':isBotTurn?'border-orange-500/50 bg-orange-900/20':'border-white/10 bg-white/5'}`}>
          <div className="relative flex-shrink-0">
            <img src={oppAvatar()} alt={oppName()}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-red-400"/>
            {(currentTurnId===opponentId||isBotTurn)&&<span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-red-400 rounded-full border border-black animate-pulse"/>}
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="font-bold text-white text-xs sm:text-sm leading-tight truncate">{oppName()}</p>
            <div className="flex gap-0.5 mt-0.5 flex-wrap justify-end">
              {myGroup ? Array.from({length:7}).map((_,i)=>{
                const bid=myGroup==='stripes'?i+1:i+9;
                const ip=balls.find(b=>b.id===bid)?.pocketed;
                return <div key={bid} className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border border-black/30"
                  style={{backgroundColor:ip?BALL_COLORS[bid]:undefined,opacity:ip?1:0.18,borderColor:BALL_COLORS[bid]}}/>;
              }) : <span className="text-[10px] text-slate-500 italic">Open</span>}
            </div>
          </div>
          <div className="text-left flex-shrink-0">
            <div className="text-xl sm:text-2xl font-mono font-black text-white leading-none">{oppPotted}</div>
            <div className="text-[9px] text-slate-500">/7</div>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="w-full max-w-5xl px-2 mb-1">
        <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
          isMyTurn?'bg-emerald-900/30 border-emerald-500/40 text-emerald-300':
          isBotTurn?'bg-orange-900/30 border-orange-500/40 text-orange-300':
          'bg-slate-900/50 border-white/10 text-slate-400'}`}>
          <span className="truncate">{message||( isMyTurn?(ballInHand?'🖐 Tap anywhere to place cue ball':'🎯 Aim & drag to shoot'):`⏳ ${oppName()} is thinking...`)}</span>
          {isMoving&&<span className="text-[10px] font-mono text-slate-500 animate-pulse ml-2 flex-shrink-0">●●●</span>}
        </div>
      </div>

      {/* ── Power bar ── */}
      {aimPower>0&&isMyTurn&&(
        <div className="w-full max-w-5xl px-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 w-8 flex-shrink-0">Power</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden border border-white/10">
              <div className="h-full rounded-full transition-none"
                style={{width:`${aimPower}%`,backgroundColor:aimPower>80?'#ef4444':aimPower>50?'#f59e0b':'#22c55e'}}/>
            </div>
            <span className="text-[10px] font-mono text-white w-8 text-right flex-shrink-0">{Math.round(aimPower)}%</span>
          </div>
        </div>
      )}

      {/* ── Canvas table ── */}
      <div className="w-full max-w-5xl px-2 flex-1 flex items-center justify-center">
        <div className="relative w-full" style={{paddingTop:`${(TH/TW)*100}%`}}>
          {/* Rail */}
          <div className="absolute inset-0 rounded-xl sm:rounded-2xl overflow-hidden"
            style={{boxShadow:'0 0 40px rgba(0,0,0,0.8),inset 0 0 0 14px #3e2010,inset 0 0 0 15px #5c3320,inset 0 0 0 16px #2d1a0a'}}>
            <div className="absolute inset-[12px] sm:inset-[14px] rounded-lg sm:rounded-xl overflow-hidden">
              <canvas ref={canvasRef} width={TW} height={TH}
                className="w-full h-full block touch-none cursor-crosshair"
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
            </div>
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[7px] text-[#8b6030]/50 font-mono pointer-events-none">KATIKA 8-POOL</div>
          </div>

          {/* Opponent thinking overlay */}
          {(!isMyTurn&&!isBotTurn&&!isMoving&&isP2P)&&(
            <div className="absolute inset-[14px] flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{animationDelay:'0ms'}}/>
                <div className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{animationDelay:'150ms'}}/>
                <div className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{animationDelay:'300ms'}}/>
                <span className="text-sm text-white font-bold">{oppName()} is thinking...</span>
              </div>
            </div>
          )}

          {/* Bot thinking overlay */}
          {isBotTurn&&!isMoving&&(
            <div className="absolute inset-[14px] flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{animationDelay:'0ms'}}/>
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{animationDelay:'150ms'}}/>
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{animationDelay:'300ms'}}/>
                <span className="text-sm text-white font-bold">🤖 Bot planning shot...</span>
              </div>
            </div>
          )}

          {/* Ball in hand */}
          {ballInHand&&isMyTurn&&(
            <div className="absolute inset-[14px] flex items-end justify-center pointer-events-none pb-3">
              <motion.div animate={{opacity:[0.6,1,0.6]}} transition={{repeat:Infinity,duration:1.5}}
                className="bg-emerald-900/85 backdrop-blur-sm border border-emerald-500/50 rounded-full px-4 py-1.5 text-emerald-300 text-xs sm:text-sm font-bold">
                🖐 Tap/click anywhere to place cue ball
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* ── Potted tray ── */}
      <div className="w-full max-w-5xl px-2 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          {balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8).sort((a,b)=>a.id-b.id).map(b=>(
            <motion.div key={b.id} initial={{scale:0}} animate={{scale:1}}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-black/50 flex items-center justify-center"
              style={{backgroundColor:BALL_COLORS[b.id]}}>
              <span className="text-[7px] font-bold text-white">{b.id}</span>
            </motion.div>
          ))}
          {balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8).length===0&&
            <span className="text-[10px] text-slate-600 italic">No balls potted</span>}
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{remaining} left</span>
      </div>
    </div>
  );
};
