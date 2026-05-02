import {
    BALL_RADIUS, FRICTION, MIN_VELOCITY, CUSHION_RESTITUTION,
    FIELD_LEFT, FIELD_RIGHT, FIELD_TOP, FIELD_BOTTOM,
    POCKETS, BALL_RESTITUTION, SPIN_FRICTION, SUBSTEPS,
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

export interface PhysicsCallbacks {
    onBallBallCollision?: (ball1Id: number, ball2Id: number, intensity: number) => void;
    onCushionBounce?: (ballId: number, intensity: number) => void;
    onPocket?: (ballId: number) => void;
}

export function createBall(id: number, x: number, y: number): Ball {
    return { id, x, y, vx: 0, vy: 0, spin: 0, sidespin: 0, pocketed: false, justPocketed: false };
}

export function isMoving(balls: Ball[]): boolean {
    return balls.some(b => !b.pocketed && (Math.abs(b.vx) > MIN_VELOCITY || Math.abs(b.vy) > MIN_VELOCITY));
}

export function stepPhysics(
    balls: Ball[],
    _dt: number = 1,
    callbacks?: PhysicsCallbacks,
): { newBalls: Ball[]; pocketedThisStep: number[] } {
    const result: Ball[] = balls.map(b => ({ ...b, justPocketed: false }));
    const pocketedThisStep: number[] = [];
    const collidedPairs = new Set<string>();
    const cushionedThisFrame = new Set<number>();

    for (let s = 0; s < SUBSTEPS; s++) {
        const inv = 1 / SUBSTEPS;

        for (const ball of result) {
            if (ball.pocketed) continue;
            ball.x += ball.vx * inv;
            ball.y += ball.vy * inv;
        }

        for (let i = 0; i < result.length; i++) {
            if (result[i].pocketed) continue;
            for (let j = i + 1; j < result.length; j++) {
                if (result[j].pocketed) continue;
                const a = result[i];
                const b = result[j];

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = BALL_RADIUS * 2;

                if (dist < minDist && dist > 0.01) {
                    const nx = dx / dist;
                    const ny = dy / dist;

                    const dvx = a.vx - b.vx;
                    const dvy = a.vy - b.vy;
                    const dvn = dvx * nx + dvy * ny;

                    if (dvn > 0) {
                        const impulse = dvn * (1 + BALL_RESTITUTION) / 2;
                        a.vx -= impulse * nx;
                        a.vy -= impulse * ny;
                        b.vx += impulse * nx;
                        b.vy += impulse * ny;

                        const pairKey = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
                        if (!collidedPairs.has(pairKey) && callbacks?.onBallBallCollision) {
                            const intensity = Math.min(1, Math.sqrt(dvn * dvn) / 15);
                            callbacks.onBallBallCollision(a.id, b.id, intensity);
                            collidedPairs.add(pairKey);
                        }
                    }

                    const overlap = (minDist - dist) / 2;
                    a.x -= nx * overlap;
                    a.y -= ny * overlap;
                    b.x += nx * overlap;
                    b.y += ny * overlap;
                }
            }
        }

        for (const ball of result) {
            if (ball.pocketed) continue;

            const nearPocket = POCKETS.some(p => {
                const dx = ball.x - p.x;
                const dy = ball.y - p.y;
                return Math.sqrt(dx * dx + dy * dy) < p.r + BALL_RADIUS * 0.5;
            });
            if (nearPocket) continue;

            let bounced = false;
            const prevVx = ball.vx;
            const prevVy = ball.vy;

            if (ball.x - BALL_RADIUS < FIELD_LEFT) {
                ball.x = FIELD_LEFT + BALL_RADIUS;
                ball.vx = Math.abs(ball.vx) * CUSHION_RESTITUTION;
                bounced = true;
            }
            if (ball.x + BALL_RADIUS > FIELD_RIGHT) {
                ball.x = FIELD_RIGHT - BALL_RADIUS;
                ball.vx = -Math.abs(ball.vx) * CUSHION_RESTITUTION;
                bounced = true;
            }
            if (ball.y - BALL_RADIUS < FIELD_TOP) {
                ball.y = FIELD_TOP + BALL_RADIUS;
                ball.vy = Math.abs(ball.vy) * CUSHION_RESTITUTION;
                bounced = true;
            }
            if (ball.y + BALL_RADIUS > FIELD_BOTTOM) {
                ball.y = FIELD_BOTTOM - BALL_RADIUS;
                ball.vy = -Math.abs(ball.vy) * CUSHION_RESTITUTION;
                bounced = true;
            }

            if (bounced && callbacks?.onCushionBounce && !cushionedThisFrame.has(ball.id)) {
                const speed = Math.sqrt(prevVx * prevVx + prevVy * prevVy);
                const intensity = Math.min(1, speed / 15);
                callbacks.onCushionBounce(ball.id, intensity);
                cushionedThisFrame.add(ball.id);
            }
        }

        for (const ball of result) {
            if (ball.pocketed) continue;
            for (const pocket of POCKETS) {
                const dx = ball.x - pocket.x;
                const dy = ball.y - pocket.y;
                if (Math.sqrt(dx * dx + dy * dy) < pocket.r - 2) {
                    ball.pocketed = true;
                    ball.justPocketed = true;
                    ball.vx = 0;
                    ball.vy = 0;
                    pocketedThisStep.push(ball.id);
                    if (callbacks?.onPocket) {
                        callbacks.onPocket(ball.id);
                    }
                    break;
                }
            }
        }
    }

    for (const ball of result) {
        if (ball.pocketed) continue;

        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed > MIN_VELOCITY) {
            if (ball.spin !== 0) {
                const dirX = ball.vx / speed;
                const dirY = ball.vy / speed;
                ball.vx += ball.spin * dirX * 0.02;
                ball.vy += ball.spin * dirY * 0.02;
            }
            if (ball.sidespin !== 0) {
                const perpX = -ball.vy / speed;
                const perpY =  ball.vx / speed;
                ball.vx += ball.sidespin * perpX * 0.015;
                ball.vy += ball.sidespin * perpY * 0.015;
            }
        }

        ball.vx *= FRICTION;
        ball.vy *= FRICTION;
        ball.spin     *= SPIN_FRICTION;
        ball.sidespin *= SPIN_FRICTION;

        const speedAfter = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speedAfter < MIN_VELOCITY) {
            ball.vx = 0;
            ball.vy = 0;
        }
    }

    return { newBalls: result, pocketedThisStep };
}

export function applyShot(
    balls: Ball[], cueBallIdx: number,
    angle: number, power: number,
    spin: number, sidespin: number,
): Ball[] {
    const result = balls.map(b => ({ ...b }));
    const cue = result[cueBallIdx];
    cue.vx = Math.cos(angle) * power;
    cue.vy = Math.sin(angle) * power;
    cue.spin = spin;
    cue.sidespin = sidespin;
    return result;
}