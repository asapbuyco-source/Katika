import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, AlertTriangle, Clock, Target, Zap, WifiOff, Loader2 } from 'lucide-react';
import { Table, User } from '../types';
import { useAppState } from '../services/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { playSFX, playPoolSound } from '../services/sound';
import { Socket } from 'socket.io-client';
import { SocketGameState } from '../types';

interface PoolGameProps {
    table: Table; 
    user: User;
    onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
    socket?: Socket | null; 
    socketGame?: SocketGameState | null;
}

// ──────────────── Physics Constants ──────────────────────────────────────────────────────────
const TW = 900, TH = 450, BR = 13, RAIL = 20;
const PR = 26;          // Visual pocket radius
const PD = PR + 5;      // Pocket detection radius
const FRICTION = 0.988, WALL_REST = 0.72, BALL_REST = 0.93, VEL_THRESH = 0.08, SUB = 8;
const TURN_TIME = 45;   // Faster turns for mobile tournaments

const POCKETS = [
    { x: PR * 0.6, y: PR * 0.6 },           // TL
    { x: TW / 2, y: 4 },                    // T-side
    { x: TW - PR * 0.6, y: PR * 0.6 },       // TR
    { x: PR * 0.6, y: TH - PR * 0.6 },      // BL
    { x: TW / 2, y: TH - 4 },                 // B-side
    { x: TW - PR * 0.6, y: TH - PR * 0.6 },  // BR
];

const BALL_COLORS: Record<number, string> = {
    0: '#F5F5EA', 1: '#E8B820', 2: '#1A5CE5', 3: '#E5231A', 4: '#6A1DB5',
    5: '#F08020', 6: '#1A8C3B', 7: '#8B1A1A', 8: '#111111',
    9: '#E8B820', 10: '#1A5CE5', 11: '#E5231A', 12: '#6A1DB5',
    13: '#F08020', 14: '#1A8C3B', 15: '#8B1A1A',
};

interface Ball { id: number; x: number; y: number; vx: number; vy: number; pocketed: boolean; rot?: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number; color: string; }

function buildRack(): Ball[] {
    const balls: Ball[] = [];
    const cx = TW * 0.66, cy = TH / 2, dx = BR * 2.05, dy = BR * 1.18;
    [[1], [9, 2], [10, 8, 3], [11, 4, 12, 5], [13, 6, 14, 7, 15]].forEach((row, ri) =>
        row.forEach((id, ci) => balls.push({ id, x: cx + ri * dx, y: cy + (ci - (row.length - 1) / 2) * dy * 2, vx: 0, vy: 0, pocketed: false }))
    );
    balls.push({ id: 0, x: TW * 0.22, y: cy, vx: 0, vy: 0, pocketed: false });
    return balls;
}

// ──────────────── Physics Engine (Optimized) ──────────────────────────────────────────────
function stepPhysics(
    balls: Ball[], sparks: Spark[],
    pottedCb: (id: number) => void, firstHitCb: (id: number) => void, shakeCb: (n: number) => void
): boolean {
    let moving = false;
    const cue = balls.find(b => b.id === 0 && !b.pocketed);

    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vx *= 0.93; s.vy *= 0.93; s.life--;
        if (s.life <= 0) sparks.splice(i, 1);
    }

    for (let step = 0; step < SUB; step++) {
        const active = balls.filter(b => !b.pocketed);
        for (const b of active) {
            b.x += b.vx / SUB; b.y += b.vy / SUB;
            let f = 0, bounced = false;
            const gapC = 37, gapM = 30;
            if (b.y < RAIL + BR) {
                if (!(b.x < gapC || (b.x > TW / 2 - gapM && b.x < TW / 2 + gapM) || b.x > TW - gapC)) {
                    b.y = RAIL + BR; f = Math.abs(b.vy); b.vy = f * WALL_REST; bounced = true;
                }
            }
            if (b.y > TH - RAIL - BR) {
                if (!(b.x < gapC || (b.x > TW / 2 - gapM && b.x < TW / 2 + gapM) || b.x > TW - gapC)) {
                    b.y = TH - RAIL - BR; f = Math.abs(b.vy); b.vy = -f * WALL_REST; bounced = true;
                }
            }
            if (b.x < RAIL + BR) {
                if (!(b.y < gapC || b.y > TH - gapC)) {
                    b.x = RAIL + BR; f = Math.abs(b.vx); b.vx = f * WALL_REST; bounced = true;
                }
            }
            if (b.x > TW - RAIL - BR) {
                if (!(b.y < gapC || b.y > TH - gapC)) {
                    b.x = TW - RAIL - BR; f = Math.abs(b.vx); b.vx = -f * WALL_REST; bounced = true;
                }
            }
            if (bounced && step === 0 && f > 2) { 
                playPoolSound('cushion', Math.min(1, f / 14)); 
                if (f > 10) shakeCb(f * 0.1); 
            }
        }
        for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
            const a = active[i], b = active[j];
            const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = BR * 2.02;
            if (d2 < min * min && d2 > 0.001) {
                const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (min - d) / 2;
                a.x -= ov * nx; a.y -= ov * ny; b.x += ov * nx; b.y += ov * ny;
                const dvx = a.vx - b.vx, dvy = a.vy - b.vy, dot = dvx * nx + dvy * ny;
                if (dot > 0) {
                    const imp = dot * BALL_REST;
                    a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
                    if (step === 0 && dot > 1) { 
                        playPoolSound('ball-hit', Math.min(1, dot / 18)); 
                        if (dot > 12) shakeCb(dot * 0.12); 
                    }
                    if (step === 0 && dot > 14) {
                        const cx = a.x + nx * BR, cy = a.y + ny * BR;
                        for (let k = 0; k < 5; k++) sparks.push({ x: cx, y: cy, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, life: 14, maxLife: 14, r: 1.5, color: '#fff' });
                    }
                    if (cue) { if (a.id === 0 && b.id !== 0) firstHitCb(b.id); if (b.id === 0 && a.id !== 0) firstHitCb(a.id); }
                }
            }
        }
        for (const b of active) {
            for (const p of POCKETS) {
                if (Math.hypot(b.x - p.x, b.y - p.y) < PD) {
                    b.pocketed = true; b.vx = 0; b.vy = 0; pottedCb(b.id); playPoolSound('pocket');
                    const ballCol = BALL_COLORS[b.id] || '#fff';
                    const cols = [ballCol, '#ffffff', '#ffffaa', '#ffd700', ballCol];
                    for (let k = 0; k < 35; k++) {
                        const spd = 2 + Math.random() * 8, ang = Math.random() * Math.PI * 2;
                        sparks.push({ x: p.x, y: p.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 30 + Math.random() * 20, maxLife: 50, r: 1 + Math.random() * 2.5, color: cols[Math.floor(Math.random() * cols.length)] });
                    }
                    for (let k = 0; k < 8; k++) {
                        const ang = (k / 8) * Math.PI * 2;
                        sparks.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 3.5, vy: Math.sin(ang) * 3.5, life: 40, maxLife: 40, r: 3, color: '#ffd700' });
                    }
                    break;
                }
            }
        }
    }
    for (const b of balls) {
        if (b.pocketed) continue;
        b.vx *= FRICTION; b.vy *= FRICTION;
        if (Math.abs(b.vx) < VEL_THRESH) b.vx = 0; if (Math.abs(b.vy) < VEL_THRESH) b.vy = 0;
        if (b.vx || b.vy) { moving = true; b.rot = ((b.rot || 0) + Math.hypot(b.vx, b.vy) * 0.045) % (Math.PI * 2); }
    }
    return moving || sparks.length > 0;
}

function shade(hex: string, p: number) {
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.min(255, Math.trunc(r * (100 + p) / 100)));
    g = Math.max(0, Math.min(255, Math.trunc(g * (100 + p) / 100)));
    b = Math.max(0, Math.min(255, Math.trunc(b * (100 + p) / 100)));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ──────────────── Visual Rendering ──────────────────────────────────────────────────────────
function drawScene(
    ctx: CanvasRenderingContext2D, balls: Ball[], sparks: Spark[],
    angle: number, power: number, showAim: boolean, bih: boolean,
    ghost: { x: number; y: number } | null, strikeOff: number, shake: number,
    targetBallIds?: number[]
) {
    ctx.save();
    if (shake > 0) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); }
    ctx.clearRect(-10, -10, TW + 20, TH + 20);

    // Felt
    const felt = ctx.createRadialGradient(TW / 2, TH / 2, 0, TW / 2, TH / 2, Math.max(TW, TH) * 0.9);
    felt.addColorStop(0, '#2c8cc4'); felt.addColorStop(0.6, '#175a80'); felt.addColorStop(1, '#0c3650');
    ctx.fillStyle = felt; ctx.fillRect(0, 0, TW, TH);

    // Felt grain
    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    for (let i = 0; i < 800; i++) { ctx.fillRect(Math.random() * TW, Math.random() * TH, 1.2, 1.2); }

    // Table Lines
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TW * .25, 14); ctx.lineTo(TW * .25, TH - 14); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    [[TW * .65, TH / 2], [TW * .25, TH / 2]].forEach(([sx, sy]) => { ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill(); });

    // Rails
    const railColor = '#104462';
    const C = 35, M = 28;
    const poly = (pts: number[][]) => {
        ctx.fillStyle = railColor; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5; ctx.stroke();
    };
    poly([[C, 0], [TW / 2 - M, 0], [TW / 2 - M + RAIL, RAIL], [C + RAIL, RAIL]]);
    poly([[TW / 2 + M, 0], [TW - C, 0], [TW - C - RAIL, RAIL], [TW / 2 + M - RAIL, RAIL]]);
    poly([[C, TH], [TW / 2 - M, TH], [TW / 2 - M + RAIL, TH - RAIL], [C + RAIL, TH - RAIL]]);
    poly([[TW / 2 + M, TH], [TW - C, TH], [TW - C - RAIL, TH - RAIL], [TW / 2 + M - RAIL, TH - RAIL]]);
    poly([[0, C], [0, TH - C], [RAIL, TH - C - RAIL], [RAIL, C + RAIL]]);
    poly([[TW, C], [TW, TH - C], [TW - RAIL, TH - C - RAIL], [TW - RAIL, C + RAIL]]);

    // Pockets
    POCKETS.forEach(p => {
        const outer = ctx.createRadialGradient(p.x, p.y, PR * 0.5, p.x, p.y, PR + 8);
        outer.addColorStop(0, 'rgba(0,0,0,1)'); outer.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = outer; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#180a01'; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 4, 0, Math.PI * 2); ctx.fill();
        const tunnel = ctx.createRadialGradient(p.x - PR * .3, p.y - PR * .3, 1, p.x, p.y, PR + 3);
        tunnel.addColorStop(0, 'rgba(90,50,10,0.5)'); tunnel.addColorStop(0.5, 'rgba(0,0,0,0.92)'); tunnel.addColorStop(1, '#000');
        ctx.fillStyle = tunnel; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 3, 0, Math.PI * 2); ctx.fill();
        const rim = ctx.createLinearGradient(p.x - PR, p.y - PR, p.x + PR, p.y + PR);
        rim.addColorStop(0, 'rgba(210,165,70,0.9)'); rim.addColorStop(0.45, 'rgba(50,30,5,0.7)'); rim.addColorStop(1, 'rgba(110,75,20,0.5)');
        ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 1, 0, Math.PI * 2); ctx.stroke();
    });

    // Cue Ghost
    const cueBall = balls.find(b => b.id === 0 && !b.pocketed);
    if (bih && ghost) {
        ctx.globalAlpha = 0.45; ctx.fillStyle = BALL_COLORS[0]; ctx.beginPath(); ctx.arc(ghost.x, ghost.y, BR, 0, Math.PI * 2); ctx.fill();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ghost.x, ghost.y, BR + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    // Aim Guide
    if (showAim && !bih && cueBall && strikeOff === 0) {
        const sdx = Math.cos(angle + Math.PI), sdy = Math.sin(angle + Math.PI);
        let lx = cueBall.x, ly = cueBall.y, len = 0, hitGhost: { x: number, y: number } | null = null;
        const st = 2, mx = (TW + TH) / st;
        for (let s = 0; s < mx; s++) {
            lx += sdx * st; ly += sdy * st;
            if (lx < RAIL + BR || lx > TW - RAIL - BR || ly < RAIL + BR || ly > TH - RAIL - BR) { len = s * st; break; }
            const hit = balls.find(b => !b.pocketed && b.id !== 0 && Math.hypot(b.x - lx, b.y - ly) < BR * 2);
            if (hit) { len = s * st; hitGhost = { x: lx - sdx * st, y: ly - sdy * st }; break; }
            len = s * st;
        }
        ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(cueBall.x + sdx * len, cueBall.y + sdy * len); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(cueBall.x + sdx * len, cueBall.y + sdy * len); ctx.stroke();
        ctx.setLineDash([]);
        if (hitGhost) {
            ctx.globalAlpha = 0.3; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hitGhost.x, hitGhost.y, BR, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
        }
    }

    // Sparks
    sparks.forEach(s => {
        const t = s.life / s.maxLife;
        ctx.globalAlpha = t * 0.35; ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = t * 0.95; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Balls
    balls.forEach(b => {
        if (b.pocketed) return;
        const col = BALL_COLORS[b.id] || '#888', stripe = b.id >= 9;
        const rot = b.rot || 0;
        const sox = -BR * .33 - Math.cos(rot) * BR * .16, soy = -BR * .33 - Math.sin(rot) * BR * .16;
        ctx.save(); ctx.translate(b.x, b.y);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, BR * 0.65, BR * 0.88, BR * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, BR, 0, Math.PI * 2); ctx.clip();
        if (stripe) {
            ctx.fillStyle = '#F4F2EC'; ctx.fillRect(-BR, -BR, BR * 2, BR * 2);
            ctx.save(); ctx.rotate(rot); ctx.fillStyle = col; ctx.fillRect(-BR, -BR * 0.52, BR * 2, BR * 1.04); ctx.restore();
            const shd = ctx.createRadialGradient(-BR * .35, -BR * .35, 0, 0, 0, BR * 1.15); shd.addColorStop(0, 'rgba(255,255,255,0.06)'); shd.addColorStop(0.5, 'rgba(0,0,0,0.18)'); shd.addColorStop(1, 'rgba(0,0,0,0.72)');
            ctx.fillStyle = shd; ctx.fillRect(-BR, -BR, BR * 2, BR * 2);
        } else {
            const bg = ctx.createRadialGradient(-BR * .38, -BR * .38, 0, 0, 0, BR); bg.addColorStop(0, shade(col, 40)); bg.addColorStop(0.5, shade(col, 8)); bg.addColorStop(0.85, col); bg.addColorStop(1, '#000');
            ctx.fillStyle = bg; ctx.fillRect(-BR, -BR, BR * 2, BR * 2);
        }
        if (b.id !== 0) {
            const nr = stripe ? BR * 0.46 : BR * 0.42;
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(0, 0, nr, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = stripe ? col : '#111'; ctx.font = `bold ${BR * 0.7}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.id), 0, 0.6);
        }
        ctx.globalAlpha = 0.7;
        const sp = ctx.createRadialGradient(sox, soy, 0.4, sox, soy, BR * .62); sp.addColorStop(0, 'rgba(255,255,255,0.95)'); sp.addColorStop(0.5, 'rgba(255,255,255,0.18)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(0, 0, BR, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.4; const rim2 = ctx.createRadialGradient(0, 0, BR * .6, 0, 0, BR); rim2.addColorStop(0, 'rgba(0,0,0,0)'); rim2.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = rim2; ctx.fillRect(-BR, -BR, BR * 2, BR * 2);
        ctx.globalAlpha = 1; ctx.restore();

        if (targetBallIds && targetBallIds.includes(b.id)) {
            ctx.save(); ctx.translate(b.x, b.y);
            const pulse = 1 + (Math.sin(Date.now() / 200) * 0.1);
            ctx.scale(pulse, pulse); ctx.beginPath(); ctx.arc(0, 0, BR + 6, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${0.3 + Math.sin(Date.now() / 200) * 0.2})`; ctx.lineWidth = 2; ctx.stroke();
            const glow = ctx.createRadialGradient(0, 0, BR, 0, 0, BR + 8); glow.addColorStop(0, 'rgba(255,255,255,0.15)'); glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow; ctx.fill(); ctx.restore();
        }
    });

    // Cue Stick
    if (showAim && !bih && cueBall) {
        const pb = (28 + power * 0.42) - strikeOff;
        ctx.save(); ctx.translate(cueBall.x, cueBall.y); ctx.rotate(angle);
        const tx = BR + pb, bx = tx + 360;
        const g = ctx.createLinearGradient(tx, 0, bx, 0);
        g.addColorStop(0, '#4a90e2'); g.addColorStop(0.01, '#d4b06a'); g.addColorStop(0.4, '#e8ca80'); g.addColorStop(0.6, '#1a1a1a'); g.addColorStop(1, '#3e1a08');
        ctx.beginPath(); ctx.moveTo(tx, -1.5); ctx.lineTo(tx + 55, -3.2); ctx.lineTo(bx, -5); ctx.lineTo(bx, 5); ctx.lineTo(tx + 55, 3.2); ctx.lineTo(tx, 1.5); ctx.closePath();
        ctx.fillStyle = g; ctx.fill(); ctx.restore();
    }
    ctx.restore();
}

// ──────────────── Shot Finding Logic (Bot) ──────────────────────────────────────────────────────────
function findBotShot(balls: Ball[], grp: 'solids' | 'stripes' | null) {
    const cue = balls.find(b => b.id === 0 && !b.pocketed); if (!cue) return null;
    const targets = grp
        ? balls.filter(b => !b.pocketed && ((grp === 'solids' && b.id >= 1 && b.id <= 7) || (grp === 'stripes' && b.id >= 9 && b.id <= 15)))
        : balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8);
    const myTargets = targets.length > 0 ? targets : (grp && targets.length === 0 ? balls.filter(b => b.id === 8 && !b.pocketed) : balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8));
    if (!myTargets.length) return null;

    let best: { angle: number; power: number; score: number } | null = null;
    for (const target of myTargets) {
        for (const pocket of POCKETS) {
            const tpd = Math.hypot(pocket.x - target.x, pocket.y - target.y); if (tpd < 1) continue;
            const tpnx = (pocket.x - target.x) / tpd, tpny = (pocket.y - target.y) / tpd;
            const ghostX = target.x - tpnx * (BR * 2.02), ghostY = target.y - tpny * (BR * 2.02);
            const cgd = Math.hypot(ghostX - cue.x, ghostY - cue.y); if (cgd < 1) continue;
            const angle = Math.atan2(ghostY - cue.y, ghostX - cue.x);
            const cutAngle = Math.abs(Math.atan2(tpny, tpnx) - angle);
            let normCut = cutAngle % (Math.PI * 2); if (normCut > Math.PI) normCut = Math.PI * 2 - normCut;
            if (normCut > Math.PI / 2.2) continue;

            const isBlocked = (start: { x: number, y: number }, end: { x: number, y: number }, dirDist: number, ignoreIds: number[]) => {
                return balls.some(b => {
                    if (b.pocketed || ignoreIds.includes(b.id)) return false;
                    const t2 = (b.x - start.x) * (end.x - start.x) + (b.y - start.y) * (end.y - start.y);
                    const t = t2 / (dirDist * dirDist);
                    if (t < 0 || t > 1.02) return false;
                    const px = start.x + t * (end.x - start.x), py = start.y + t * (end.y - start.y);
                    return Math.hypot(b.x - px, b.y - py) < BR * 2.05;
                });
            };
            if (isBlocked(cue, { x: ghostX, y: ghostY }, cgd, [0, target.id]) || isBlocked(target, pocket, tpd, [target.id])) continue;

            let score = 2000 - cgd * 0.4 - tpd * 0.5 - Math.pow(normCut * 310, 1.2);
            if (!best || score > best.score) {
                best = { angle, power: Math.min(95, 30 + cgd * 0.04 + tpd * 0.06 + normCut * 20), score };
            }
        }
    }
    if (!best) return { angle: Math.random() * Math.PI * 2, power: 25 };
    return { angle: best.angle + (Math.random() - .5) * 0.015, power: best.power };
}

// ──────────────── Main Component ──────────────────────────────────────────────────────────
export const PoolGame: React.FC<PoolGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
    const { state } = useAppState();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ballsRef = useRef<Ball[]>(buildRack());
    const sparksRef = useRef<Spark[]>([]);
    const animRef = useRef<number | null>(null);
    const pottedRef = useRef<number[]>([]);
    const fhRef = useRef<number | null>(null), fhLocked = useRef(false);

    const players = socketGame?.players || [], roomId = (socketGame as any)?.roomId || (socketGame as any)?.id || '';
    const myId = user.id, oppId = players.find(p => p !== myId) || '';
    const isP2P = Boolean(players.length >= 2 && oppId && socket && roomId);
    const iAmP1 = players[0] === myId;
    const initTurn = isP2P ? (players[0] || myId) : myId;

    const [balls, setBalls] = useState<Ball[]>(ballsRef.current);
    const [moving, setMoving] = useState(false);
    const [myGroup, setMyGroup] = useState<'solids' | 'stripes' | null>(null);
    const [botGroup, setBotGroup] = useState<'solids' | 'stripes' | null>(null);
    const [msg, setMsg] = useState('');
    const [bih, setBih] = useState(false);
    const [forfeit, setForfeit] = useState(false);
    const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
    const [turnId, setTurnId] = useState(initTurn);
    const [angle, setAngle] = useState(Math.PI);
    const [power, setPower] = useState(0);
    const [strikeOff, setStrikeOff] = useState(0);
    const [shake, setShake] = useState(0);
    const [countdown, setCountdown] = useState(TURN_TIME);
    const [oppAngle, setOppAngle] = useState(0);
    const [oppPower, setOppPower] = useState(0);
    const [oppGhost, setOppGhost] = useState<{ x: number; y: number } | null>(null);
    const [netStatus, setNetStatus] = useState<'ok' | 'reconnecting' | 'lost'>('ok');
    const lastSync = useRef(0);

    const isMyTurn = turnId === myId, isBot = !isP2P && turnId === 'bot';
    const myGrRef = useRef(myGroup); myGrRef.current = myGroup;
    const bgRef = useRef(botGroup); bgRef.current = botGroup;
    const movRef = useRef(moving); movRef.current = moving;
    const bihRef = useRef(bih); bihRef.current = bih;
    const turnRef = useRef(turnId); turnRef.current = turnId;

    const name2 = (id: string) => isP2P ? ((socketGame as any)?.profiles?.[id]?.name || 'Opponent') : 'Bot 🤖';
    const av2 = (id: string) => isP2P ? ((socketGame as any)?.profiles?.[id]?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`) : `https://api.dicebear.com/7.x/bottts/svg?seed=katika_bot`;

    // ── Orientation & Scale ──
    const [scale, setScale] = useState(1);
    useEffect(() => {
        try {
            if (screen.orientation && screen.orientation.lock) {
                // Attempt to force landscape mode natively on mobile devices
                screen.orientation.lock('landscape').catch(() => {});
            }
        } catch(e) {}
        
        const upd = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            // Left panel: 192px (w-48), Right panel: 96px (w-24)
            const availableW = w - 192 - 96;
            const s = Math.min((availableW - 20) / TW, (h - 20) / TH);
            setScale(s);
        };
        upd(); window.addEventListener('resize', upd); return () => window.removeEventListener('resize', upd);
    }, []);

    // ── Network Reliability ──
    useEffect(() => {
        if (!socket || !isP2P) return;
        const onDisc = () => setNetStatus('reconnecting');
        const onConn = () => setNetStatus('ok');
        const onPong = () => setNetStatus('ok');
        socket.on('disconnect', onDisc);
        socket.on('connect', onConn);
        socket.on('reconnect', onConn);
        socket.on('pool_pong', onPong);
        
        const h = (data: any) => {
            if (data.roomId !== roomId && data.id !== roomId) return;
            const gs = data.gameState; if (!gs) return;
            if (gs.balls) { ballsRef.current = gs.balls; setBalls([...gs.balls]); }
            if (gs.turn) { setTurnId(gs.turn); setCountdown(TURN_TIME); }
            const k = iAmP1 ? 'myGroupP1' : 'myGroupP2'; if (gs[k]) setMyGroup(gs[k]);
            if (gs.ballInHand && gs.turn === myId) setBih(true);
            if (gs.message) setMsg(gs.message);
            // Any authoritative update from server counts as a healthy connection
            setNetStatus('ok');
        };
        socket.on('game_update', h);
        socket.on('aim_sync', (d: any) => {
            if (d.type === 'aim_sync') { setOppAngle(d.angle); setOppPower(d.power); setOppGhost(d.ghost); }
        });
        return () => { 
            socket.off('disconnect', onDisc); 
            socket.off('connect', onConn); 
            socket.off('pool_pong', onPong);
            socket.off('game_update', h); 
        };
    }, [socket, isP2P, roomId, myId, iAmP1]);

    // ── Heartbeat Ping ──
    useEffect(() => {
        if (!isP2P || !socket) return;
        const interval = setInterval(() => {
            if (socket.connected) socket.emit('pool_ping', { roomId });
            else setNetStatus('reconnecting');
        }, 5000);
        return () => clearInterval(interval);
    }, [isP2P, socket, roomId]);

    // ── Timer — reset when turn changes ──
    useEffect(() => { setCountdown(TURN_TIME); }, [turnId]);
    useEffect(() => {
        if (!isP2P || moving || state.opponentDisconnected || netStatus !== 'ok') return;
        if (countdown <= 0) {
            playSFX('error');
            if (isMyTurn) onGameEnd('loss');
            return;
        }
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [isP2P, moving, countdown, isMyTurn, state.opponentDisconnected, netStatus]);

    // ── Physics Control ──
    const shakeRef = useRef(0);
    const handleTurnEndRef = useRef<() => void>(() => {});
    const runPhysics = useCallback(() => {
        const m = stepPhysics(ballsRef.current, sparksRef.current, id => pottedRef.current.push(id), id => { if (!fhLocked.current) { fhRef.current = id; fhLocked.current = true; } }, n => { shakeRef.current = Math.min(7, shakeRef.current + n); });
        shakeRef.current = shakeRef.current > 0.4 ? shakeRef.current * 0.82 : 0;
        if (m) animRef.current = requestAnimationFrame(runPhysics);
        else { setBalls([...ballsRef.current]); setMoving(false); handleTurnEndRef.current(); }
    }, []);

    const startPhysics = useCallback(() => {
        pottedRef.current = []; fhRef.current = null; fhLocked.current = false;
        setMoving(true); animRef.current = requestAnimationFrame(runPhysics);
    }, [runPhysics]);

    const handleTurnEnd = useCallback(() => {
        const pot = pottedRef.current, cuePot = pot.includes(0), eightPot = pot.includes(8);
        const botShot = turnRef.current === 'bot';
        const actGrp = botShot ? bgRef.current : myGrRef.current;

        if (eightPot) {
            const outcome = cuePot ? 'loss' : (((botShot && (bgRef.current ? ballsRef.current.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8 && ((bgRef.current === 'solids' && b.id < 8) || (bgRef.current === 'stripes' && b.id > 8))).length === 0 : true)) || (!botShot && (myGrRef.current ? ballsRef.current.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8 && ((myGrRef.current === 'solids' && b.id < 8) || (myGrRef.current === 'stripes' && b.id > 8))).length === 0 : true))) ? 'win' : 'loss');
            setMsg(outcome === 'win' ? '🏆 8-Ball Pocketed! Victory!' : '❌ 8-Ball Foul! Game Over.');
            setTimeout(() => onGameEnd(outcome as any), 3000);
            return;
        }

        let foul = cuePot || fhRef.current === null || (actGrp && ((actGrp === 'solids' && fhRef.current > 8) || (actGrp === 'stripes' && fhRef.current < 8 && fhRef.current !== 0))) || (!actGrp && fhRef.current === 8);
        if (foul) playSFX('error');

        if (cuePot) { const c = ballsRef.current.find(b => b.id === 0)!; c.pocketed = false; c.x = TW * .25; c.y = TH / 2; c.vx = 0; c.vy = 0; }

        let nmg = myGrRef.current, nbg = bgRef.current;
        if (!foul && !nmg && pot.some(id => id !== 0 && id !== 8)) {
            const first = pot.find(id => id !== 0 && id !== 8)!;
            nmg = (botShot ? (first < 8 ? 'stripes' : 'solids') : (first < 8 ? 'solids' : 'stripes'));
            nbg = nmg === 'solids' ? 'stripes' : 'solids';
            setMyGroup(nmg); setBotGroup(nbg);
        }

        const keep = !foul && pot.some(id => id !== 0 && id !== 8 && (!actGrp || (actGrp === 'solids' && id < 8) || (actGrp === 'stripes' && id > 8)));
        const next = isP2P ? (keep ? myId : oppId) : (keep ? (botShot ? 'bot' : myId) : (botShot ? myId : 'bot'));

        setMsg(foul ? '⚠️ FOUL!' : (keep ? '✅ Nice Shot! Continue...' : `${name2(next)}'s Turn`));
        if (isP2P && socket && roomId) {
            socket.emit('game_action', { roomId, action: { type: 'MOVE', newState: { balls: ballsRef.current, turn: next, ballInHand: foul, myGroupP1: iAmP1 ? nmg : nbg, myGroupP2: iAmP1 ? nbg : nmg } } });
        }
        setTurnId(next);
        if (foul && next === myId) setBih(true);
        if (!isP2P && next === 'bot') setTimeout(() => {
            const c = ballsRef.current.find(b => b.id === 0)!; if (foul) { c.pocketed = false; c.x = TW * .6 + (Math.random() - .5) * 100; c.y = TH / 2 + (Math.random() - .5) * 100; setBalls([...ballsRef.current]); }
            const shot = findBotShot(ballsRef.current, nbg);
            if (shot) { setAngle(shot.angle); setPower(shot.power); animStrike(shot.angle, shot.power); }
        }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isP2P, socket, roomId, myId, oppId, iAmP1, onGameEnd]);
    handleTurnEndRef.current = handleTurnEnd;

    const animStrike = (a: number, p: number) => {
        let f = 0; const tot = 10;
        const iv = setInterval(() => {
            f++; setStrikeOff((p * .4 + 28) * (f / tot));
            if (f >= tot) {
                clearInterval(iv); setStrikeOff(0); setPower(0);
                const c = ballsRef.current.find(b => b.id === 0);
                if (c && !c.pocketed) {
                    c.vx = Math.cos(a + Math.PI) * (p * .35); c.vy = Math.sin(a + Math.PI) * (p * .35);
                    playPoolSound('cue-hit', p / 100); startPhysics();
                }
            }
        }, 16);
    };

    // ── Controls (Drag Aim & Power) ──
    const isAimingRef = useRef(false);
    const updateAim = (e: React.PointerEvent | React.MouseEvent) => {
        const cv = canvasRef.current; if (!cv) return;
        const r = cv.getBoundingClientRect();
        const cue = ballsRef.current.find(b => b.id === 0);
        if (!cue) return;
        const cx = r.left + (cue.x / TW) * r.width;
        const cy = r.top + (cue.y / TH) * r.height;
        const newAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
        setAngle(newAngle);

        if (isP2P && socket && Date.now() - lastSync.current > 60) {
            socket.emit('aim_sync', { roomId, type: 'aim_sync', angle: newAngle, power });
            lastSync.current = Date.now();
        }
    };
    const handleCanvasPointerDown = (e: React.PointerEvent | React.MouseEvent) => {
        if (!isMyTurn || moving) return;
        if (bih) {
            const cv = canvasRef.current; if (!cv) return;
            const r = cv.getBoundingClientRect();
            const tx = (e.clientX - r.left) * (TW / r.width), ty = (e.clientY - r.top) * (TH / r.height);
            if (tx > RAIL + BR && tx < TW - RAIL - BR && ty > RAIL + BR && ty < TH - RAIL - BR) {
                const c = ballsRef.current.find(b => b.id === 0)!; c.pocketed = false; c.x = tx; c.y = ty; c.vx = 0; c.vy = 0;
                setBalls([...ballsRef.current]); setBih(false); playSFX('click');
            }
        } else {
            isAimingRef.current = true;
            if ('setPointerCapture' in e.target) (e.target as HTMLElement).setPointerCapture((e as React.PointerEvent).pointerId);
            updateAim(e);
        }
    };
    const handleCanvasPointerMove = (e: React.PointerEvent | React.MouseEvent) => {
        if (!isAimingRef.current) return;
        updateAim(e);
    };
    const handleCanvasPointerUp = (e: React.PointerEvent | React.MouseEvent) => {
        if (isAimingRef.current) {
            isAimingRef.current = false;
            if ('releasePointerCapture' in e.target) {
                try { (e.target as HTMLElement).releasePointerCapture((e as React.PointerEvent).pointerId); } catch(err) {}
            }
        }
    };

    const isPoweringRef = useRef(false);
    const updatePower = (e: React.PointerEvent | React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const p = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100));
        setPower(p);
        setStrikeOff(p * 0.4 + 10); 

        if (isP2P && socket && Date.now() - lastSync.current > 60) {
            socket.emit('aim_sync', { roomId, type: 'aim_sync', angle, power: p });
            lastSync.current = Date.now();
        }
    };
    const handlePowerPointerDown = (e: React.PointerEvent | React.MouseEvent) => {
        if (!isMyTurn || moving || bih) return;
        isPoweringRef.current = true;
        if ('setPointerCapture' in e.target) (e.target as HTMLElement).setPointerCapture((e as React.PointerEvent).pointerId);
        updatePower(e);
    };
    const handlePowerPointerMove = (e: React.PointerEvent | React.MouseEvent) => {
        if (!isPoweringRef.current) return;
        updatePower(e);
    };
    const handlePowerPointerUp = (e: React.PointerEvent | React.MouseEvent) => {
        if (!isPoweringRef.current) return;
        isPoweringRef.current = false;
        if ('releasePointerCapture' in e.target) {
            try { (e.target as HTMLElement).releasePointerCapture((e as React.PointerEvent).pointerId); } catch(err) {}
        }
        
        if (power < 5) {
            setPower(0);
            setStrikeOff(0);
            return;
        }

        let f = strikeOff;
        const finalP = power;
        setPower(0);
        const iv = setInterval(() => {
            f -= 8;
            setStrikeOff(Math.max(0, f));
            if (f <= 0) {
                clearInterval(iv);
                setStrikeOff(0);
                const c = ballsRef.current.find(b => b.id === 0);
                if (c && !c.pocketed) {
                    c.vx = Math.cos(angle + Math.PI) * (finalP * .35); 
                    c.vy = Math.sin(angle + Math.PI) * (finalP * .35);
                    playPoolSound('cue-hit', finalP / 100); 
                    startPhysics();
                }
            }
        }, 16);
    };

    // ── Persistent Render ──
    useEffect(() => {
        const cv = canvasRef.current, ctx = cv?.getContext('2d'); if (!cv || !ctx) return;
        const updateScale = () => {
            const w = window.innerWidth, h = window.innerHeight;
            const s = Math.min(w / (TW + 300), h / TH);
            setScale(s);
        };
        window.addEventListener('resize', updateScale);
        updateScale();
        const loop = () => {
            const mt = turnRef.current === myId, mv = movRef.current, grp = myGrRef.current;
            const targetIds = (mt && !mv) ? (grp === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : grp === 'stripes' ? [9, 10, 11, 12, 13, 14, 15] : [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]).filter(id => !ballsRef.current.find(b => b.id === id)?.pocketed) : [];
            drawScene(ctx, ballsRef.current, sparksRef.current, mt ? angle : (isBot ? angle : oppAngle), mt ? power : (isBot ? power : oppPower), !mv, bihRef.current, mt ? ghost : oppGhost, strikeOff, shakeRef.current, targetIds.length === 0 && grp ? [8] : targetIds);
            animRef.current = requestAnimationFrame(loop);
        };
        loop(); return () => { window.removeEventListener('resize', updateScale); if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [angle, power, strikeOff, ghost, oppAngle, oppPower, oppGhost, isBot, myId]);

    const myPot = myGroup ? balls.filter(b => b.pocketed && b.id !== 0 && b.id !== 8 && ((myGroup === 'solids' && b.id < 8) || (myGroup === 'stripes' && b.id > 8))).length : 0;
    const oppPot = myGroup ? balls.filter(b => b.pocketed && b.id !== 0 && b.id !== 8 && ((myGroup === 'solids' && b.id > 8) || (myGroup === 'stripes' && b.id < 8))).length : 0;

    return (
        <div className="w-[100dvw] h-[100dvh] flex flex-row bg-[#070c10] overflow-hidden select-none touch-none text-white font-sans">
            <AnimatePresence>
                {netStatus !== 'ok' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4">
                        <WifiOff className="text-red-500 animate-pulse" size={56} />
                        <h2 className="text-2xl font-bold">Connection Lost</h2>
                        <p className="text-slate-400">Reconnecting to game server...</p>
                        <Loader2 className="animate-spin text-gold-400 mt-2" size={32} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Left Panel: Match Info & Players */}
            <div className="w-48 h-full bg-black/60 border-r border-white/5 flex flex-col justify-between shrink-0 safe-left z-10 shadow-2xl relative">
                {/* Player 1 (Top) */}
                <div className={`p-4 border-b transition-all shadow-[0_4px_20px_rgba(0,0,0,0.5)] ${isMyTurn ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center gap-3 mb-3">
                        <img src={user.avatar} className="w-10 h-10 rounded-full border-2 border-white/20 shadow-lg" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate text-white drop-shadow-md">{user.name}</p>
                            <p className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">{myGroup || 'Open'}</p>
                        </div>
                    </div>
                    <div className="flex justify-between items-center bg-black/60 rounded-xl px-3 py-2 border border-white/10 shadow-inner">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Pot</span>
                        <span className="text-xl font-black font-mono text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">{myPot}</span>
                    </div>
                </div>

                {/* Center Match Info */}
                <div className="flex-1 flex flex-col items-center justify-center gap-6 relative px-4">
                    <button onClick={() => setForfeit(true)} className="absolute top-4 left-4 p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all shadow-lg active:scale-95">
                        <ArrowLeft size={16} className="text-slate-400" />
                    </button>

                    <div className="text-center bg-black/40 p-4 rounded-2xl border border-white/10 w-full shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                        <span className="text-[10px] text-gold-500 font-black tracking-widest uppercase block mb-1">STAKE</span>
                        <span className="text-lg font-mono font-black text-white drop-shadow-[0_0_10px_rgba(251,191,36,0.4)]">💰{(table.stake * 2).toLocaleString()}</span>
                    </div>

                    <div className="h-16 flex flex-col items-center justify-center">
                        {isP2P && <div className={`flex flex-col items-center text-xs transition-colors ${countdown < 10 ? 'text-red-500 font-black animate-pulse drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'text-slate-300'}`}>
                            <Clock size={18} className="mb-1 opacity-80" />
                            <span className="font-mono text-xl tracking-wider">{countdown}s</span>
                        </div>}
                    </div>
                    
                    <div className={`w-full py-3 rounded-xl text-[10px] font-black tracking-widest uppercase border text-center shadow-lg transition-all ${isMyTurn ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 glow-emerald' : 'bg-slate-800/80 border-white/10 text-slate-400'}`}>
                        {msg || 'WAITING'}
                    </div>
                </div>

                {/* Player 2 (Bottom) */}
                <div className={`p-4 border-t transition-all shadow-[0_-4px_20px_rgba(0,0,0,0.5)] ${!isMyTurn ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex justify-between items-center bg-black/60 rounded-xl px-3 py-2 border border-white/10 shadow-inner mb-3">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Pot</span>
                        <span className="text-xl font-black font-mono text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]">{oppPot}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-row-reverse text-right">
                        <img src={av2(oppId)} className="w-10 h-10 rounded-full border-2 border-white/20 shadow-lg" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate text-white drop-shadow-md">{name2(oppId)}</p>
                            <p className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">{myGroup ? (myGroup === 'solids' ? 'stripes' : 'solids') : 'Ready'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Center Table Area */}
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-[#070c10] to-[#0d161d] relative overflow-hidden">
                <span className="absolute top-6 left-1/2 -translate-x-1/2 text-xs text-slate-500/50 uppercase tracking-[0.5em] font-black pointer-events-none hidden md:block mix-blend-screen select-none">
                    KATIKA CHAMPIONSHIP
                </span>

                <div style={{ width: TW, height: TH, transform: `scale(${scale})`, transformOrigin: 'center', position: 'relative' }} className="shrink-0 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#7a3e10] via-[#3a1a07] to-[#7a3e10] border-4 border-[#1a0d04] shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden">
                        <div className="absolute inset-[16px] rounded-lg shadow-[inset_0_0_50px_rgba(0,0,0,0.9)] overflow-hidden">
                            <canvas 
                                ref={canvasRef} 
                                width={TW} height={TH} 
                                onPointerDown={handleCanvasPointerDown}
                                onPointerMove={handleCanvasPointerMove}
                                onPointerUp={handleCanvasPointerUp}
                                onPointerOut={handleCanvasPointerUp}
                                onPointerCancel={handleCanvasPointerUp}
                                className="w-full h-full block cursor-crosshair touch-none" 
                            />
                        </div>
                        {/* Decorative Diamonds */}
                        {[25, 50, 75].map(pct => <div key={`t${pct}`} className="absolute w-2 h-2 bg-white/20 rounded-full shadow-sm" style={{ top: '4px', left: `${pct}%` }} />)}
                        {[25, 50, 75].map(pct => <div key={`b${pct}`} className="absolute w-2 h-2 bg-white/20 rounded-full shadow-sm" style={{ bottom: '4px', left: `${pct}%` }} />)}
                        {[25, 50, 75].map(pct => <div key={`l${pct}`} className="absolute w-2 h-2 bg-white/20 rounded-full shadow-sm" style={{ left: '4px', top: `${pct}%` }} />)}
                        {[25, 50, 75].map(pct => <div key={`r${pct}`} className="absolute w-2 h-2 bg-white/20 rounded-full shadow-sm" style={{ right: '4px', top: `${pct}%` }} />)}
                    </div>
                </div>

                <AnimatePresence>
                    {bih && isMyTurn && (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 px-8 py-3 bg-blue-500/90 rounded-full border-2 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.5)] flex items-center gap-3 backdrop-blur-md">
                            <Target size={20} className="animate-pulse drop-shadow-md text-white" />
                            <span className="text-sm font-black uppercase tracking-widest text-white drop-shadow-md">Ball in Hand - Tap Board</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Right Panel: Power Slider */}
            <div className="w-24 h-full bg-black/60 border-l border-white/5 flex flex-col items-center justify-center py-8 safe-right shrink-0 z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] relative">
                <span className="absolute top-[10%] text-[10px] text-slate-500 uppercase tracking-[0.3em] font-black rotate-[-90deg] origin-center whitespace-nowrap opacity-60">
                    PULL TO SHOOT
                </span>

                <div 
                    className="relative w-12 h-[60%] max-h-72 bg-black/40 rounded-full border-2 border-white/10 overflow-hidden touch-none shadow-[inset_0_2px_15px_rgba(0,0,0,0.8)] my-8 cursor-ns-resize" 
                    onPointerDown={handlePowerPointerDown}
                    onPointerMove={handlePowerPointerMove}
                    onPointerUp={handlePowerPointerUp}
                    onPointerOut={handlePowerPointerUp}
                    onPointerCancel={handlePowerPointerUp}
                >
                    <div className="absolute top-0 left-0 right-0 transition-all duration-75" style={{ height: `${power}%`, background: `linear-gradient(to bottom, #10b981 0%, #f59e0b 50%, #dc2626 100%)`, boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }} />
                    <div className="absolute inset-0 flex flex-col justify-between py-6 pointer-events-none">
                        {[0, 25, 50, 75, 100].map(v => (
                            <div key={v} className="w-full flex justify-center items-center opacity-30">
                                <div className="w-4 h-[3px] bg-white rounded-full shadow-sm" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-12 h-12 rounded-full border-2 border-white/10 flex items-center justify-center bg-white/5 shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)]">
                    <Zap size={20} className={`transition-colors duration-300 ${power > 5 ? 'text-gold-400 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'text-slate-600'}`} />
                </div>
            </div>

            <style>{`
                .safe-left { padding-left: max(0rem, env(safe-area-inset-left)); }
                .safe-right { padding-right: max(0rem, env(safe-area-inset-right)); }
                .glow-emerald { box-shadow: 0 0 20px rgba(16, 185, 129, 0.2); }
            `}</style>

            {/* Forfeit Modal */}
            {forfeit && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#1c2a35] border border-red-500/30 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl">
                        <AlertTriangle className="text-red-500 mx-auto mb-4 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" size={48} />
                        <h2 className="text-2xl font-bold mb-2">Forfeit Match?</h2>
                        <p className="text-slate-400 mb-8 text-sm leading-relaxed">Leaving will result in an immediate loss and loss of your stake. Tournament progress will be lost permanently.</p>
                        <div className="flex gap-4">
                            <button onClick={() => setForfeit(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold border border-white/10 transition-colors">Stay</button>
                            <button onClick={() => { if (isP2P && socket) socket.emit('game_action', { roomId, action: { type: 'FORFEIT' } }); onGameEnd('quit'); }} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-[0_4px_15px_rgba(220,38,38,0.3)] transition-colors">Forfeit</button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};
