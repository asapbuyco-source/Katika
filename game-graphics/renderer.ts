import { Ball } from './physics';
import {
    TABLE_WIDTH, TABLE_HEIGHT, CUSHION_THICKNESS, WOOD_COLOR, WOOD_COLOR_2,
    FELT_COLOR, FELT_COLOR_2, CUSHION_COLOR, POCKET_COLOR,
    BALL_RADIUS, BALL_COLORS, BALL_IS_STRIPE, CUE_LENGTH,
    CUE_WIDTH_BACK, CUE_WIDTH_TIP, POCKETS,
} from './constants';

export function drawTable(ctx: CanvasRenderingContext2D) {
    const W = TABLE_WIDTH + CUSHION_THICKNESS * 2;
    const H = TABLE_HEIGHT + CUSHION_THICKNESS * 2;
    const CW = CUSHION_THICKNESS;
    
    ctx.fillStyle = WOOD_COLOR;
    ctx.fillRect(0, 0, W, H);
    
    ctx.strokeStyle = WOOD_COLOR_2;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    
    ctx.fillStyle = FELT_COLOR;
    ctx.fillRect(CW, CW, TABLE_WIDTH, TABLE_HEIGHT);
    
    ctx.fillStyle = FELT_COLOR_2;
    for (let y = 0; y < TABLE_HEIGHT; y += 8) {
        ctx.fillRect(CW, CW + y, TABLE_WIDTH, 4);
    }
    
    ctx.fillStyle = CUSHION_COLOR;
    const gap = 4;
    
    ctx.fillRect(CW + 32, CW - 8, (TABLE_WIDTH - 64) / 2 - gap, 8);
    ctx.fillRect(CW + TABLE_WIDTH / 2 + gap, CW - 8, (TABLE_WIDTH - 64) / 2 - gap, 8);
    
    ctx.fillRect(CW + 32, CW + TABLE_HEIGHT, (TABLE_WIDTH - 64) / 2 - gap, 8);
    ctx.fillRect(CW + TABLE_WIDTH / 2 + gap, CW + TABLE_HEIGHT, (TABLE_WIDTH - 64) / 2 - gap, 8);
    
    ctx.fillRect(CW - 8, CW + 32, 8, TABLE_HEIGHT - 64);
    ctx.fillRect(CW + TABLE_WIDTH, CW + 32, 8, TABLE_HEIGHT - 64);
    
    ctx.fillStyle = POCKET_COLOR;
    for (const p of POCKETS) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(CW + TABLE_WIDTH * 0.25, CW);
    ctx.lineTo(CW + TABLE_WIDTH * 0.25, CW + TABLE_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);
}

export function drawBall(ctx: CanvasRenderingContext2D, ball: Ball) {
    if (ball.pocketed) return;
    
    const R = BALL_RADIUS;
    const color = BALL_COLORS[ball.id] || '#888';
    const isStripe = BALL_IS_STRIPE[ball.id] || false;
    
    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
    ctx.fillStyle = isStripe ? 'white' : color;
    ctx.fill();
    ctx.restore();

    // Stripe band (rendered BEFORE number circle so number stays on top)
    if (isStripe) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = color;
        ctx.fillRect(ball.x - R, ball.y - R * 0.3, R * 2, R * 0.6);
        ctx.restore();
    }
    
    // Highlight
    ctx.beginPath();
    ctx.arc(ball.x - R * 0.3, ball.y - R * 0.3, R * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
    
    // Number circle (always on top)
    if (ball.id !== 0) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
        
        ctx.font = `${R * 0.7}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#222';
        ctx.fillText(String(ball.id), ball.x, ball.y + 1);
    }
    
    // Outline
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
}

export function drawCue(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, power: number, pullback: number) {
    const len = CUE_LENGTH;
    const tipDist = 30 + pullback * 20;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    const grad = ctx.createLinearGradient(tipDist, 0, tipDist + len, 0);
    grad.addColorStop(0, '#f5deb3');
    grad.addColorStop(0.03, '#8b4513');
    grad.addColorStop(0.97, '#4a2810');
    grad.addColorStop(1, '#2a1808');
    
    ctx.beginPath();
    ctx.moveTo(tipDist, -CUE_WIDTH_TIP);
    ctx.lineTo(tipDist + len - 80, -CUE_WIDTH_BACK);
    ctx.lineTo(tipDist + len, -8);
    ctx.lineTo(tipDist + len, 8);
    ctx.lineTo(tipDist + len - 80, CUE_WIDTH_BACK);
    ctx.lineTo(tipDist, CUE_WIDTH_TIP);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(tipDist, 0, CUE_WIDTH_TIP, 0, Math.PI * 2);
    ctx.fillStyle = '#87CEEB';
    ctx.fill();
    
    ctx.restore();
}

export function drawAimLine(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, balls: Ball[]) {
    const len = 200;
    const endX = x + Math.cos(angle) * len;
    const endY = y + Math.sin(angle) * len;
    
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * 35, y + Math.sin(angle) * 35);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    const ghostDist = 50;
    const gx = x + Math.cos(angle) * ghostDist;
    const gy = y + Math.sin(angle) * ghostDist;
    
    const nearbyBall = balls.find(b => {
        if (b.pocketed || b.id === 0) return false;
        const dx = b.x - gx, dy = b.y - gy;
        return Math.sqrt(dx * dx + dy * dy) < BALL_RADIUS * 2.2;
    });
    
    if (nearbyBall) {
        ctx.beginPath();
        ctx.arc(gx, gy, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,0,0,0.3)';
        ctx.fill();
    }
    
    ctx.restore();
}