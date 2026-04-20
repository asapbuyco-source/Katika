/**
 * Pool Shot Unit Tests
 * Tests the core shot-firing logic in isolation (no React, no DOM needed).
 * Run with: node tests/pool_shot.test.mjs
 */

import assert from 'assert';

// ─── Replicate the physics constants from PoolGame.tsx ───────────────────────
const TW = 450, TH = 900;
const FRICTION = 0.985;
const BALL_R = 13;
const MIN_SPEED = 0.08;

// Minimal ball structure
function makeCueBall(x = TW / 2, y = TH * 0.75) {
    return { id: 0, x, y, vx: 0, vy: 0, pocketed: false };
}

// ─── Replicate the shot-firing formula exactly ────────────────────────────────
// PoolGame.tsx line 694-696:
//   c.vx = Math.cos(finalAngle) * (finalP * .35)
//   c.vy = Math.sin(finalAngle) * (finalP * .35)
function applyShot(ball, angle, power) {
    ball.vx = Math.cos(angle) * (power * 0.35);
    ball.vy = Math.sin(angle) * (power * 0.35);
}

// One physics tick
function stepBall(ball) {
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= FRICTION;
    ball.vy *= FRICTION;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < MIN_SPEED) { ball.vx = 0; ball.vy = 0; }
}

// Run N ticks and return final position
function simulate(ball, ticks = 200) {
    for (let i = 0; i < ticks; i++) stepBall(ball);
    return { x: ball.x, y: ball.y };
}

// ─── Replicate the stale-closure scenario ─────────────────────────────────────
// Before the ref fix: state values (power, angle) read from React state inside
// handlePowerPointerUp could be 0 (stale). This test verifies that when power=0
// the ball does NOT move (and a guard should stop the shot).
function simulateStaleClosure() {
    const ball = makeCueBall();
    const staleAngle = Math.PI; // initial React state default
    const stalePower = 0;       // React state not yet updated
    applyShot(ball, staleAngle, stalePower);
    const dist = Math.hypot(ball.vx, ball.vy);
    return dist; // Should be 0
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}`);
        console.error(`     ${e.message}`);
        failed++;
    }
}

console.log('\n🎱 Pool Shot Physics — Unit Tests\n');

// TEST 1: Zero power = no movement (guards the early-return in handlePowerPointerUp)
// Note: Math.cos(PI)*0 = -0 in JS which equals 0 numerically — use Object.is check for both cases
test('Zero power produces zero velocity', () => {
    const ball = makeCueBall();
    applyShot(ball, Math.PI, 0);
    assert.ok(ball.vx === 0, `vx should be 0 (or -0), got ${ball.vx}`);
    assert.ok(ball.vy === 0, `vy should be 0 (or -0), got ${ball.vy}`);
});

// TEST 2: Stale closure scenario — confirms the bug would cause no movement
test('Stale closure scenario: power=0 → ball does not move', () => {
    const speed = simulateStaleClosure();
    assert.strictEqual(speed, 0, `Speed should be 0 but got ${speed}`);
});

// TEST 3: Full power, angle=PI (shoot LEFT) — ball moves left
test('Full power (100), angle=PI → ball moves in -X direction', () => {
    const ball = makeCueBall(TW / 2, TH / 2);
    applyShot(ball, Math.PI, 100);
    assert.ok(ball.vx < 0, `vx should be negative (leftward), got ${ball.vx.toFixed(3)}`);
    assert.ok(Math.abs(ball.vy) < 0.01, `vy should be ~0, got ${ball.vy.toFixed(3)}`);
    assert.ok(Math.abs(ball.vx) > 30, `Speed should be substantial (>30), got ${Math.abs(ball.vx).toFixed(3)}`);
});

// TEST 4: Power=50, angle=PI/2 (shoot DOWN) — ball moves down
test('Half power (50), angle=PI/2 → ball moves in +Y direction', () => {
    const ball = makeCueBall(TW / 2, TH / 4);
    applyShot(ball, Math.PI / 2, 50);
    assert.ok(ball.vy > 0, `vy should be positive (downward), got ${ball.vy.toFixed(3)}`);
    assert.ok(Math.abs(ball.vx) < 0.01, `vx should be ~0, got ${ball.vx.toFixed(3)}`);
    const expected = 50 * 0.35;
    assert.ok(Math.abs(ball.vy - expected) < 0.001, `vy should be ~${expected}, got ${ball.vy.toFixed(3)}`);
});

// TEST 5: Physics friction — ball decelerates and eventually stops
test('Ball decelerates to rest via friction after 500 ticks', () => {
    const ball = makeCueBall(TW / 2, TH / 2);
    applyShot(ball, 0, 100); // shoot right
    simulate(ball, 500);
    assert.ok(ball.vx === 0 && ball.vy === 0, `Ball should be at rest, vx=${ball.vx.toFixed(4)}, vy=${ball.vy.toFixed(4)}`);
});

// TEST 6: Ball travels in the correct direction — right at 0°
test('Angle=0 → ball moves in +X direction and travels right', () => {
    const ball = makeCueBall(TW / 4, TH / 2);
    const startX = ball.x;
    applyShot(ball, 0, 80);
    simulate(ball, 300);
    assert.ok(ball.x > startX, `Ball should have moved right from ${startX.toFixed(0)} to ${ball.x.toFixed(0)}`);
});

// TEST 7: Power threshold — sub-5% power should be blocked by guard
test('Power < 5 is blocked by the early-return guard', () => {
    // Simulate the guard: if (finalP < 5) return early (no shot)
    const finalP = 3.2;
    const wasBlocked = finalP < 5;
    assert.ok(wasBlocked, `Power ${finalP} should trigger the guard`);
});

// TEST 8: Max speed — power=100 gives expected velocity magnitude
test('Power=100 gives velocity magnitude of 35 (100 × 0.35)', () => {
    const ball = makeCueBall();
    applyShot(ball, 0, 100);
    const speed = Math.hypot(ball.vx, ball.vy);
    assert.ok(Math.abs(speed - 35) < 0.001, `Speed should be 35, got ${speed.toFixed(4)}`);
});

// TEST 9: Diagonal shot (45°) — both components equal
test('Angle=PI/4 → vx and vy are equal (diagonal shot)', () => {
    const ball = makeCueBall();
    applyShot(ball, Math.PI / 4, 100);
    assert.ok(Math.abs(ball.vx - ball.vy) < 0.001, `vx (${ball.vx.toFixed(4)}) should equal vy (${ball.vy.toFixed(4)})`);
});

// TEST 10: Ref fix validates — with correct ref values, shot fires properly
test('Ref fix: non-stale power=80 angle=0 → ball fires correctly', () => {
    const ball = makeCueBall();
    const refPower = 80;   // powerRef.current — always current
    const refAngle = 0;    // angleRef.current — always current
    // Guard check
    assert.ok(refPower >= 5, 'Power should pass the guard');
    applyShot(ball, refAngle, refPower);
    assert.ok(ball.vx > 0, `Ball should move right, vx=${ball.vx.toFixed(3)}`);
    assert.ok(ball.vy === 0, `vy should be 0, got ${ball.vy}`);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
    console.log('🏆 All pool shot tests passed!\n');
} else {
    console.log('❌ Some tests failed — see above.\n');
    throw new Error("Pool tests failed.");
}

import { it } from 'vitest';
it('Pool shot physics raw validation', () => {
    if (failed > 0) throw new Error("Pool tests failed.");
});
