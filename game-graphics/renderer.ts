import { Ball } from './physics';
import {
    TABLE_WIDTH, TABLE_HEIGHT, CUSHION_THICKNESS, RAIL_WIDTH,
    FELT_COLOR, FELT_COLOR_2, CUSHION_COLOR, CUSHION_HIGHLIGHT,
    WOOD_COLOR, WOOD_COLOR_2, POCKET_COLOR,
    BALL_RADIUS, BALL_COLORS, BALL_IS_STRIPE,
    CUE_LENGTH, CUE_WIDTH_BACK, CUE_WIDTH_TIP,
    POCKETS, FIELD_LEFT, FIELD_RIGHT, FIELD_TOP, FIELD_BOTTOM,
    CORNER_POCKET_RADIUS, SIDE_POCKET_RADIUS,
} from './constants';

const TOTAL_W = TABLE_WIDTH  + CUSHION_THICKNESS * 2;
const TOTAL_H = TABLE_HEIGHT + CUSHION_THICKNESS * 2;
const WOOD_FRAME = 22;

let feltSeed = 42;
const seededRand = () => { feltSeed = (feltSeed * 1664525 + 1013904223) & 0xffffffff; return ((feltSeed >>> 0) / 0xffffffff); };

export function drawTable(ctx: CanvasRenderingContext2D) {
    const W = TOTAL_W + 44;
    const H = TOTAL_H + 44;

    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, W, H);

    const ambGrad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.65);
    ambGrad.addColorStop(0, 'rgba(40,70,50,0.35)');
    ambGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambGrad;
    ctx.fillRect(0, 0, W, H);

    // ── 3D Outer frame (wood with depth) ──────────────────────────────────────
    // Bottom edge shadow (3D depth)
    ctx.fillStyle = '#1a0f06';
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(W - 6, 6);
    ctx.lineTo(W + 2, H + 2);
    ctx.lineTo(-2, H + 2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(-2, H + 2);
    ctx.lineTo(W + 2, H + 2);
    ctx.lineTo(W - 6, 6);
    ctx.closePath();
    ctx.fill();

    // Main wood frame
    ctx.beginPath();
    _roundRect(ctx, 0, 0, W, H, 12);
    const frameGrad = ctx.createLinearGradient(0, 0, 0, H);
    frameGrad.addColorStop(0, '#6b4528');
    frameGrad.addColorStop(0.3, WOOD_COLOR);
    frameGrad.addColorStop(0.7, '#5a3a20');
    frameGrad.addColorStop(1, WOOD_COLOR_2);
    ctx.fillStyle = frameGrad;
    ctx.fill();

    // Top bevel highlight (3D effect)
    ctx.beginPath();
    _roundRect(ctx, 2, 2, W - 4, H / 3, 11);
    const topBevel = ctx.createLinearGradient(0, 2, 0, H / 3);
    topBevel.addColorStop(0, 'rgba(255,255,255,0.15)');
    topBevel.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = topBevel;
    ctx.fill();

    ctx.strokeStyle = '#1a0f06';
    ctx.lineWidth = 2;
    ctx.beginPath();
    _roundRect(ctx, 0, 0, W, H, 12);
    ctx.stroke();

    // Inner frame highlight
    ctx.beginPath();
    _roundRect(ctx, 4, 4, W - 8, H - 8, 10);
    ctx.strokeStyle = 'rgba(120,90,50,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── 3D Rail area (inner wood, with depth) ──────────────────────────────────
    const railL = WOOD_FRAME, railT = WOOD_FRAME;
    const railW2 = TOTAL_W, railH2 = TOTAL_H;

    // Rail inner shadow (3D depth - rail sits above felt)
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(railL + 3, railT + 3, railW2, railH2);

    const railGrad = ctx.createLinearGradient(railL, railT - 10, railL, railT + railH2 + 10);
    railGrad.addColorStop(0, '#8a5e38');
    railGrad.addColorStop(0.15, '#9a6e45');
    railGrad.addColorStop(0.5, '#7a5030');
    railGrad.addColorStop(0.85, '#6b4528');
    railGrad.addColorStop(1, '#5c3a20');
    ctx.beginPath();
    _roundRect(ctx, railL, railT, railW2, railH2, 6);
    ctx.fillStyle = railGrad;
    ctx.fill();

    // ── Felt surface ────────────────────────────────────────────────────────
    const feltX = WOOD_FRAME + CUSHION_THICKNESS;
    const feltY = WOOD_FRAME + CUSHION_THICKNESS;
    const feltCX = feltX + TABLE_WIDTH / 2;
    const feltCY = feltY + TABLE_HEIGHT / 2;

    const feltGrad = ctx.createRadialGradient(feltCX, feltCY, 30, feltCX, feltCY, TABLE_WIDTH * 0.6);
    feltGrad.addColorStop(0, '#12854a');
    feltGrad.addColorStop(0.5, FELT_COLOR);
    feltGrad.addColorStop(1, FELT_COLOR_2);
    ctx.fillStyle = feltGrad;
    ctx.fillRect(feltX, feltY, TABLE_WIDTH, TABLE_HEIGHT);

    // Deterministic felt texture
    feltSeed = 42;
    for (let i = 0; i < 3000; i++) {
        const px = feltX + seededRand() * TABLE_WIDTH;
        const py = feltY + seededRand() * TABLE_HEIGHT;
        ctx.fillStyle = seededRand() > 0.5 ? 'rgba(255,255,255,0.008)' : 'rgba(0,0,0,0.012)';
        ctx.fillRect(px, py, 1, 1.5);
    }

    // Head string (break line)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(feltX + TABLE_WIDTH * 0.25, feltY + 1);
    ctx.lineTo(feltX + TABLE_WIDTH * 0.25, feltY + TABLE_HEIGHT - 1);
    ctx.stroke();
    ctx.setLineDash([]);

    // Foot spot
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(feltX + TABLE_WIDTH * 0.72, feltCY, 3, 0, Math.PI * 2);
    ctx.fill();

    // ── 3D Cushion segments ─────────────────────────────────────────────────
    const cf = { x: WOOD_FRAME + CUSHION_THICKNESS, y: WOOD_FRAME + CUSHION_THICKNESS };
    const pcrC = CORNER_POCKET_RADIUS, pcrS = SIDE_POCKET_RADIUS;
    const cg = 6;

    // Top cushion segments (with 3D bevel)
    _drawCushion3D(ctx, cf.x + pcrC + cg, cf.y,
        cf.x + TABLE_WIDTH / 2 - pcrS - cg, cf.y, 8, CUSHION_COLOR, CUSHION_HIGHLIGHT, 'top');
    _drawCushion3D(ctx, cf.x + TABLE_WIDTH / 2 + pcrS + cg, cf.y,
        cf.x + TABLE_WIDTH - pcrC - cg, cf.y, 8, CUSHION_COLOR, CUSHION_HIGHLIGHT, 'top');
    _drawCushion3D(ctx, cf.x + pcrC + cg, cf.y + TABLE_HEIGHT,
        cf.x + TABLE_WIDTH / 2 - pcrS - cg, cf.y + TABLE_HEIGHT, 8, CUSHION_COLOR, CUSHION_HIGHLIGHT, 'bottom');
    _drawCushion3D(ctx, cf.x + TABLE_WIDTH / 2 + pcrS + cg, cf.y + TABLE_HEIGHT,
        cf.x + TABLE_WIDTH - pcrC - cg, cf.y + TABLE_HEIGHT, 8, CUSHION_COLOR, CUSHION_HIGHLIGHT, 'bottom');
    _drawCushion3D(ctx, cf.x, cf.y + pcrC + cg,
        cf.x, cf.y + TABLE_HEIGHT - pcrC - cg, 8, CUSHION_COLOR, CUSHION_HIGHLIGHT, 'left');
    _drawCushion3D(ctx, cf.x + TABLE_WIDTH, cf.y + pcrC + cg,
        cf.x + TABLE_WIDTH, cf.y + TABLE_HEIGHT - pcrC - cg, 8, CUSHION_COLOR, CUSHION_HIGHLIGHT, 'right');

    // ── 3D Pockets ──────────────────────────────────────────────────────────
    for (let i = 0; i < POCKETS.length; i++) {
        const px = POCKETS[i].x + WOOD_FRAME;
        const py = POCKETS[i].y + WOOD_FRAME;
        const pr = POCKETS[i].r;

        // Deep outer shadow (3D depth)
        const shadowGrad = ctx.createRadialGradient(px, py - 2, pr * 0.5, px, py + 3, pr + 12);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.9)');
        shadowGrad.addColorStop(0.4, 'rgba(0,0,0,0.7)');
        shadowGrad.addColorStop(0.7, 'rgba(0,0,0,0.3)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(px, py, pr + 12, 0, Math.PI * 2);
        ctx.fill();

        // Inner hole (dark gradient for depth)
        const holeGrad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        holeGrad.addColorStop(0, '#000000');
        holeGrad.addColorStop(0.6, '#050505');
        holeGrad.addColorStop(0.85, '#111111');
        holeGrad.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = holeGrad;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();

        // Metallic rim
        ctx.strokeStyle = '#604830';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, pr + 1, 0, Math.PI * 2);
        ctx.stroke();

        // Rim highlight (top arc for 3D)
        ctx.strokeStyle = 'rgba(200,170,100,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, pr + 2, Math.PI * 0.8, Math.PI * 0.2);
        ctx.stroke();
    }

    // ── Diamond markers (3D raised) ──────────────────────────────────────────
    const diamSize = 4;
    for (let side = 0; side < 2; side++) {
        const sX = side === 0 ? cf.x : cf.x + TABLE_WIDTH / 2;
        const eX = side === 0 ? cf.x + TABLE_WIDTH / 2 : cf.x + TABLE_WIDTH;
        for (let i = 1; i <= 3; i++) {
            _drawDiamond3D(ctx, sX + (eX - sX) * i / 4, cf.y - RAIL_WIDTH / 2, diamSize);
        }
    }
    for (let side = 0; side < 2; side++) {
        const sX = side === 0 ? cf.x : cf.x + TABLE_WIDTH / 2;
        const eX = side === 0 ? cf.x + TABLE_WIDTH / 2 : cf.x + TABLE_WIDTH;
        for (let i = 1; i <= 3; i++) {
            _drawDiamond3D(ctx, sX + (eX - sX) * i / 4, cf.y + TABLE_HEIGHT + RAIL_WIDTH / 2, diamSize);
        }
    }
    for (let i = 1; i <= 3; i++) {
        _drawDiamond3D(ctx, cf.x - RAIL_WIDTH / 2, cf.y + TABLE_HEIGHT * i / 4, diamSize);
    }
    for (let i = 1; i <= 3; i++) {
        _drawDiamond3D(ctx, cf.x + TABLE_WIDTH + RAIL_WIDTH / 2, cf.y + TABLE_HEIGHT * i / 4, diamSize);
    }

    // Spotlight overlay on felt
    const spotGrad = ctx.createRadialGradient(feltCX, feltCY - 40, 40, feltCX, feltCY, TABLE_WIDTH * 0.55);
    spotGrad.addColorStop(0, 'rgba(255,255,230,0.03)');
    spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spotGrad;
    ctx.fillRect(feltX, feltY, TABLE_WIDTH, TABLE_HEIGHT);

    // Overhead light hot-spot (3D table lamp effect)
    const lampGrad = ctx.createRadialGradient(feltCX, feltCY - 20, 10, feltCX, feltCY, TABLE_WIDTH * 0.45);
    lampGrad.addColorStop(0, 'rgba(255,255,240,0.04)');
    lampGrad.addColorStop(0.5, 'rgba(255,255,200,0.015)');
    lampGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lampGrad;
    ctx.fillRect(feltX, feltY, TABLE_WIDTH, TABLE_HEIGHT);
}

// ── 3D Ball Rendering ────────────────────────────────────────────────────────

export function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, glowing = false) {
    if (ball.pocketed) return;
    const x = ball.x;
    const y = ball.y;
    const r = BALL_RADIUS;
    const color = BALL_COLORS[ball.id] ?? '#888';
    const isStripe = BALL_IS_STRIPE[ball.id] ?? false;

    // ── 3D Drop shadow (longer, angled for overhead light) ──
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
    const shadowGrad = ctx.createRadialGradient(x + 3, y + 5, 0, x + 3, y + 5, r * 0.9);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.45)');
    shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fill();
    ctx.restore();

    if (ball.id === 0) {
        // ── Cue ball (pearlescent 3D) ──
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        const cueGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x + r * 0.1, y + r * 0.1, r);
        cueGrad.addColorStop(0, '#ffffff');
        cueGrad.addColorStop(0.3, '#f8f8f8');
        cueGrad.addColorStop(0.7, '#e8e8e8');
        cueGrad.addColorStop(1, '#c0c0c0');
        ctx.fillStyle = cueGrad;
        ctx.fill();
        if (glowing) {
            ctx.beginPath();
            ctx.arc(x, y, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,200,0.35)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    } else if (isStripe) {
        // ── Stripe ball (3D) ──
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#f8f8f8';
        ctx.fill();
        // Color stripe band (3D curved)
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        const stripeGrad = ctx.createLinearGradient(x, y - r * 0.42, x, y + r * 0.42);
        stripeGrad.addColorStop(0, color);
        stripeGrad.addColorStop(0.15, color);
        stripeGrad.addColorStop(0.5, _lighten(color, 30));
        stripeGrad.addColorStop(0.85, color);
        stripeGrad.addColorStop(1, color);
        ctx.fillStyle = stripeGrad;
        ctx.fillRect(x - r, y - r * 0.42, r * 2, r * 0.84);
        ctx.restore();
        // Number circle
        ctx.beginPath();
        ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    } else {
        // ── Solid ball (3D with gradient) ──
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        const solidGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x + r * 0.1, y + r * 0.15, r);
        solidGrad.addColorStop(0, _lighten(color, 60));
        solidGrad.addColorStop(0.35, _lighten(color, 25));
        solidGrad.addColorStop(0.7, color);
        solidGrad.addColorStop(1, _darken(color, 40));
        ctx.fillStyle = solidGrad;
        ctx.fill();
        // Number circle
        ctx.beginPath();
        ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    // Number label
    if (ball.id !== 0) {
        ctx.fillStyle = '#111111';
        ctx.font = `bold ${Math.round(r * 0.52)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ball.id.toString(), x, y + 0.5);
    }

    // 3D sphere gradient overlay
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x + r * 0.15, y + r * 0.2, r);
    g.addColorStop(0,    'rgba(255,255,255,0.35)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(0.8,  'rgba(0,0,0,0.08)');
    g.addColorStop(1,    'rgba(0,0,0,0.35)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Rim edge
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Specular highlight (3D bright spot from overhead lamp)
    ctx.beginPath();
    ctx.arc(x - r * 0.22, y - r * 0.32, r * 0.18, 0, Math.PI * 2);
    const specGrad = ctx.createRadialGradient(x - r * 0.22, y - r * 0.32, 0, x - r * 0.22, y - r * 0.32, r * 0.18);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
    specGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.fill();

    // Secondary ambient light (bottom-right rim light)
    ctx.beginPath();
    ctx.arc(x + r * 0.4, y + r * 0.35, r * 0.12, 0, Math.PI * 2);
    const rimGrad = ctx.createRadialGradient(x + r * 0.4, y + r * 0.35, 0, x + r * 0.4, y + r * 0.35, r * 0.12);
    rimGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
    rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rimGrad;
    ctx.fill();
}

// ── 3D Cue Stick ─────────────────────────────────────────────────────────────

export function drawCue(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    angle: number,
    _power: number,
    pullback: number,
) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const perpX = -sin;
    const perpY =  cos;

    const tipOffset = BALL_RADIUS + 5 + pullback * 28;
    const len = CUE_LENGTH;

    const segs = [
        { d: tipOffset,              w: CUE_WIDTH_TIP },
        { d: tipOffset + 6,          w: 2 },
        { d: tipOffset + len * 0.45, w: 3.5 },
        { d: tipOffset + len * 0.55, w: CUE_WIDTH_BACK * 0.8 },
        { d: tipOffset + len,        w: CUE_WIDTH_BACK },
    ];

    // Cue shadow (3D)
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    for (let i = 0; i < segs.length; i++) {
        const { d, w } = segs[i];
        const px = cx - cos * d + perpX * w + 3;
        const py = cy - sin * d + perpY * w + 5;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    for (let i = segs.length - 1; i >= 0; i--) {
        const { d, w } = segs[i];
        ctx.lineTo(cx - cos * d - perpX * w + 3, cy - sin * d - perpY * w + 5);
    }
    ctx.closePath();
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();

    // Cue body
    ctx.beginPath();
    for (let i = 0; i < segs.length; i++) {
        const { d, w } = segs[i];
        const px = cx - cos * d + perpX * w;
        const py = cy - sin * d + perpY * w;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    for (let i = segs.length - 1; i >= 0; i--) {
        const { d, w } = segs[i];
        ctx.lineTo(cx - cos * d - perpX * w, cy - sin * d - perpY * w);
    }
    ctx.closePath();

    const tipX  = cx - cos * tipOffset;
    const tipY  = cy - sin * tipOffset;
    const buttX = cx - cos * (tipOffset + len);
    const buttY = cy - sin * (tipOffset + len);
    const grad  = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
    grad.addColorStop(0,    '#f0ddb8');
    grad.addColorStop(0.03, '#f5f0e8');
    grad.addColorStop(0.05, '#f0ddb8');
    grad.addColorStop(0.25, '#d4b080');
    grad.addColorStop(0.45, '#c9a070');
    grad.addColorStop(0.55, '#3a2510');
    grad.addColorStop(0.65, '#c9a070');
    grad.addColorStop(0.85, '#5a3a20');
    grad.addColorStop(1,    '#2a1508');
    ctx.fillStyle = grad;
    ctx.fill();

    // Top edge highlight (3D)
    ctx.beginPath();
    for (let i = 0; i < segs.length; i++) {
        const { d, w } = segs[i];
        const px = cx - cos * d - perpX * (w - 0.3);
        const py = cy - sin * d - perpY * (w - 0.3);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < segs.length; i++) {
        const { d, w } = segs[i];
        const px = cx - cos * d + perpX * w;
        const py = cy - sin * d + perpY * w;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Blue chalk tip with glow
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.8, 0, Math.PI * 2);
    const tipGrad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 2.8);
    tipGrad.addColorStop(0, '#77bbff');
    tipGrad.addColorStop(0.6, '#5599dd');
    tipGrad.addColorStop(1, '#3377bb');
    ctx.fillStyle = tipGrad;
    ctx.fill();
}

// ── Aim Line with true ray-cast ───────────────────────────────────────────────

export function drawAimLine(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    angle: number,
    balls: Ball[],
) {
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };

    let minT = Infinity;
    let hitBall: Ball | null = null;

    for (const b of balls) {
        if (b.pocketed || b.id === 0) continue;
        const ocx = cx - b.x;
        const ocy = cy - b.y;
        const bq  = 2 * (ocx * dir.x + ocy * dir.y);
        const cq  = ocx * ocx + ocy * ocy - (2 * BALL_RADIUS) * (2 * BALL_RADIUS);
        const disc = bq * bq - 4 * cq;
        if (disc >= 0) {
            const t = (-bq - Math.sqrt(disc)) / 2;
            if (t > BALL_RADIUS * 0.5 && t < minT) {
                minT   = t;
                hitBall = b;
            }
        }
    }

    let wallT = Infinity;
    if (dir.x > 0) wallT = Math.min(wallT, (FIELD_RIGHT  - BALL_RADIUS - cx) / dir.x);
    if (dir.x < 0) wallT = Math.min(wallT, (FIELD_LEFT   + BALL_RADIUS - cx) / dir.x);
    if (dir.y > 0) wallT = Math.min(wallT, (FIELD_BOTTOM - BALL_RADIUS - cy) / dir.y);
    if (dir.y < 0) wallT = Math.min(wallT, (FIELD_TOP    + BALL_RADIUS - cy) / dir.y);
    if (wallT < 0) wallT = Infinity;

    const endT = hitBall && minT < wallT ? minT : wallT;
    const endX = cx + dir.x * endT;
    const endY = cy + dir.y * endT;

    ctx.save();
    // Main aim line — soft glow + dotted
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(cx + dir.x * (BALL_RADIUS + 4), cy + dir.y * (BALL_RADIUS + 4));
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (hitBall && minT < wallT) {
        const ghostX = cx + dir.x * minT;
        const ghostY = cy + dir.y * minT;

        // Ghost ball
        ctx.beginPath();
        ctx.arc(ghostX, ghostY, BALL_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Target direction
        const nx = hitBall.x - ghostX;
        const ny = hitBall.y - ghostY;
        const nl = Math.sqrt(nx * nx + ny * ny);
        if (nl > 0) {
            const nnx = nx / nl;
            const nny = ny / nl;
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = 'rgba(255,200,50,0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(hitBall.x, hitBall.y);
            ctx.lineTo(hitBall.x + nnx * 55, hitBall.y + nny * 55);
            ctx.stroke();

            const dot   = dir.x * nnx + dir.y * nny;
            const deflX = dir.x - dot * nnx;
            const deflY = dir.y - dot * nny;
            const deflL = Math.sqrt(deflX * deflX + deflY * deflY);
            if (deflL > 0.05) {
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.beginPath();
                ctx.moveTo(ghostX, ghostY);
                ctx.lineTo(ghostX + (deflX / deflL) * 38, ghostY + (deflY / deflL) * 38);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }
    }
    ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);        ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
}

function _drawCushion3D(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    h: number,
    color: string, highlight: string,
    side: 'top' | 'bottom' | 'left' | 'right',
) {
    // Main cushion body
    ctx.beginPath();
    if (side === 'top') {
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - 3, y2 + h); ctx.lineTo(x1 + 3, y1 + h);
    } else if (side === 'bottom') {
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - 3, y2 - h); ctx.lineTo(x1 + 3, y1 - h);
    } else if (side === 'left') {
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.lineTo(x2 + h, y2 - 3); ctx.lineTo(x1 + h, y1 + 3);
    } else {
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - h, y2 - 3); ctx.lineTo(x1 - h, y1 + 3);
    }
    ctx.closePath();
    const cGrad = ctx.createLinearGradient(x1, y1, x2, y2);
    cGrad.addColorStop(0, highlight);
    cGrad.addColorStop(1, color);
    ctx.fillStyle = cGrad;
    ctx.fill();

    // Top bevel highlight (3D raised edge)
    ctx.beginPath();
    if (side === 'top') {
        ctx.moveTo(x1 + 3, y1); ctx.lineTo(x2 - 3, y2);
    } else if (side === 'bottom') {
        ctx.moveTo(x1 + 3, y1); ctx.lineTo(x2 - 3, y2);
    } else if (side === 'left') {
        ctx.moveTo(x1, y1 + 3); ctx.lineTo(x2, y2 - 3);
    } else {
        ctx.moveTo(x1, y1 + 3); ctx.lineTo(x2, y2 - 3);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function _drawDiamond3D(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    // Diamond shadow
    ctx.beginPath();
    ctx.moveTo(x + 1, y - s + 1);
    ctx.lineTo(x + s * 0.6 + 1, y + 1);
    ctx.lineTo(x + 1, y + s + 1);
    ctx.lineTo(x - s * 0.6 + 1, y + 1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Diamond face
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.6, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.6, y);
    ctx.closePath();
    const dGrad = ctx.createLinearGradient(x - s * 0.6, y - s, x + s * 0.6, y + s);
    dGrad.addColorStop(0, '#e8d8a8');
    dGrad.addColorStop(0.5, '#c8a860');
    dGrad.addColorStop(1, '#a08040');
    ctx.fillStyle = dGrad;
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.3, y - s * 0.2);
    ctx.lineTo(x, y);
    ctx.lineTo(x - s * 0.3, y - s * 0.2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
}

function _lighten(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
}

function _darken(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return `rgb(${r},${g},${b})`;
}