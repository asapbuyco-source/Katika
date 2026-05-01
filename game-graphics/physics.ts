import {
    BALL_RADIUS, FRICTION, MIN_VELOCITY, CUSHION_RESTITUTION,
    FIELD_LEFT, FIELD_RIGHT, FIELD_TOP, FIELD_BOTTOM,
    POCKETS, BALL_RESTITUTION, SPIN_FRICTION,
} from './constants';

export interface Ball {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    spin: number;
    sidespin: number;
    pocketed: boolean;
    justPocketed: boolean;
}

export function createBall(id: number, x: number, y: number): Ball {
    return { id, x, y, vx: 0, vy: 0, spin: 0, sidespin: 0, pocketed: false, justPocketed: false };
}

export function isMoving(balls: Ball[]): boolean {
    return balls.some(b => !b.pocketed && (Math.abs(b.vx) > MIN_VELOCITY || Math.abs(b.vy) > MIN_VELOCITY));
}

export function stepPhysics(balls: Ball[], dt: number = 1): { newBalls: Ball[], pocketedThisStep: number[] } {
    const result = balls.map(b => ({ ...b, justPocketed: false }));
    const pocketedThisStep: number[] = [];

    for (const ball of result) {
        if (ball.pocketed) continue;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Apply spin effects: topspin accelerates, sidespin curves
        const speed = Math.sqrt(ball.vx ** 2 + ball.vy ** 2);
        if (speed > MIN_VELOCITY && ball.spin !== 0) {
            const dirX = ball.vx / speed;
            const dirY = ball.vy / speed;
            ball.vx += ball.spin * dirX * 0.02;
            ball.vy += ball.spin * dirY * 0.02;
        }
        if (speed > MIN_VELOCITY && ball.sidespin !== 0) {
            const perpX = -ball.vy / speed;
            const perpY = ball.vx / speed;
            ball.vx += ball.sidespin * perpX * 0.015;
            ball.vy += ball.sidespin * perpY * 0.015;
        }

        ball.vx *= FRICTION;
        ball.vy *= FRICTION;
        ball.spin *= SPIN_FRICTION;
        ball.sidespin *= SPIN_FRICTION;

        const speedAfter = Math.sqrt(ball.vx ** 2 + ball.vy ** 2);
        if (speedAfter < MIN_VELOCITY) {
            ball.vx = 0;
            ball.vy = 0;
        }
    }

    for (const ball of result) {
        if (ball.pocketed) continue;
        for (const pocket of POCKETS) {
            const dx = ball.x - pocket.x;
            const dy = ball.y - pocket.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < pocket.r + BALL_RADIUS * 0.4) {
                ball.pocketed = true;
                ball.justPocketed = true;
                ball.vx = 0;
                ball.vy = 0;
                pocketedThisStep.push(ball.id);
                break;
            }
        }
    }

    for (const ball of result) {
        if (ball.pocketed) continue;
        const nearPocket = POCKETS.some(p => {
            const dx = ball.x - p.x;
            const dy = ball.y - p.y;
            return Math.sqrt(dx * dx + dy * dy) < p.r + BALL_RADIUS;
        });

        if (!nearPocket) {
            if (ball.x - BALL_RADIUS < FIELD_LEFT) {
                ball.x = FIELD_LEFT + BALL_RADIUS;
                ball.vx = Math.abs(ball.vx) * CUSHION_RESTITUTION;
            }
            if (ball.x + BALL_RADIUS > FIELD_RIGHT) {
                ball.x = FIELD_RIGHT - BALL_RADIUS;
                ball.vx = -Math.abs(ball.vx) * CUSHION_RESTITUTION;
            }
            if (ball.y - BALL_RADIUS < FIELD_TOP) {
                ball.y = FIELD_TOP + BALL_RADIUS;
                ball.vy = Math.abs(ball.vy) * CUSHION_RESTITUTION;
            }
            if (ball.y + BALL_RADIUS > FIELD_BOTTOM) {
                ball.y = FIELD_BOTTOM - BALL_RADIUS;
                ball.vy = -Math.abs(ball.vy) * CUSHION_RESTITUTION;
            }
        }
    }

    for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
            const a = result[i];
            const b = result[j];
            if (a.pocketed || b.pocketed) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < BALL_RADIUS * 2 && dist > 0.01) {
                const overlap = BALL_RADIUS * 2 - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                a.x -= nx * overlap * 0.5;
                a.y -= ny * overlap * 0.5;
                b.x += nx * overlap * 0.5;
                b.y += ny * overlap * 0.5;

                const dvx = b.vx - a.vx;
                const dvy = b.vy - a.vy;
                const dot = dvx * nx + dvy * ny;

                if (dot < 0) {
                    const impulse = dot * (1 + BALL_RESTITUTION) / 2;
                    a.vx += impulse * nx;
                    a.vy += impulse * ny;
                    b.vx -= impulse * nx;
                    b.vy -= impulse * ny;
                }
            }
        }
    }

    return { newBalls: result, pocketedThisStep };
}

export function applyShot(balls: Ball[], cueBallIdx: number, angle: number, power: number, spin: number, sidespin: number): Ball[] {
    const result = balls.map(b => ({ ...b }));
    const cue = result[cueBallIdx];
    cue.vx = Math.cos(angle) * power;
    cue.vy = Math.sin(angle) * power;
    cue.spin = spin;
    cue.sidespin = sidespin;
    return result;
}