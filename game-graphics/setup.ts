import { Ball, createBall } from './physics';
import { TABLE_WIDTH, TABLE_HEIGHT, RACK_X, RACK_Y, BREAK_X, BREAK_Y, BALL_RADIUS } from './constants';

export function rackBalls(): Ball[] {
    const balls: Ball[] = [];
    const cx = RACK_X;
    const cy = RACK_Y;
    const dx = BALL_RADIUS * 1.732;
    const dy = BALL_RADIUS * 1.05;

    const rackPattern = [
        [1],
        [9, 2],
        [10, 8, 3],
        [11, 4, 12, 5],
        [13, 6, 14, 7, 15]
    ];

    rackPattern.forEach((row, ri) => {
        row.forEach((id, ci) => {
            const x = cx + ri * dx;
            const y = cy + (ci - (row.length - 1) / 2) * dy * 2;
            balls.push(createBall(id, x, y));
        });
    });

    balls.push(createBall(0, BREAK_X, BREAK_Y));
    return balls;
}

export function placeCueBall(balls: Ball[], x: number, y: number): Ball[] {
    return balls.map(b => {
        if (b.id === 0) {
            return { ...b, x, y, vx: 0, vy: 0, pocketed: false };
        }
        return b;
    });
}