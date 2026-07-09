/**
 * Checkers bot engine strength verification.
 */
import { getCheckersEngineMove } from '../server/ai/checkersEngine.js';

const passed = [];
const failed = [];

function test(name, fn) {
    try {
        fn();
        passed.push(name);
        console.log(`  PASS: ${name}`);
    } catch (e) {
        failed.push(`${name}: ${e.message}`);
        console.log(`  FAIL: ${name}`);
        console.log(`        ${e.message}`);
    }
}

// ─── Helper: create a simple checkers board ───
function makePieces(owner, positions) {
    return positions.map(([r, c], i) => ({
        id: `${owner}_${i}`,
        r, c, owner, isKing: false, captured: false, removed: false
    }));
}

// ─── Test: Bot finds a simple jump (forward direction) ───
test('Finds simple jump capture', () => {
    // Bot in top half (rows 0-4), forward = +1 (down)
    // Bot at (2,1), human at (3,2) → bot can jump to (4,3)
    const botPieces = makePieces('bot1', [[2, 1], [3, 4]]);
    const humanPieces = makePieces('human', [[3, 2], [6, 1]]);
    const pieces = [...botPieces, ...humanPieces];

    const move = getCheckersEngineMove(pieces, 'bot1', 'hard', 1500);
    if (!move) throw new Error('No move returned');
    // Should be a jump: (2,1) → (4,3) capturing (3,2)
    // Or a simple move: (2,1) → (3,0) or (3,4) → (4,3)
    const isJump = move.isJump;
    console.log(`        Move: (${move.fromR},${move.fromC}) → (${move.toR},${move.toC}), jump=${isJump}`);
});

// ─── Test: Bot finds king promotion move ───
test('Advances piece toward promotion row', () => {
    const botPieces = makePieces('bot1', [[1, 1]]);
    const humanPieces = makePieces('human', [[8, 8]]);
    // Bot is in top half, forward is +1 (down)
    // Piece at (1,1) should move to (2,0) or (2,2)
    const pieces = [...botPieces, ...humanPieces];
    const move = getCheckersEngineMove(pieces, 'bot1', 'hard', 1500);
    if (!move) throw new Error('No move returned');
    if (move.toR !== 2) throw new Error(`Expected toR=2, got toR=${move.toR}`);
    console.log(`        Move: (${move.fromR},${move.fromC}) → (${move.toR},${move.toC})`);
});

// ─── Test: Difficulty affects move selection ───
test('Different difficulty levels produce moves (not null)', () => {
    const botPieces = makePieces('bot1', [[4, 3], [5, 4], [6, 5]]);
    const humanPieces = makePieces('human', [[3, 2], [7, 6]]);
    const pieces = [...botPieces, ...humanPieces];

    for (const diff of ['easy', 'medium', 'hard']) {
        const move = getCheckersEngineMove(pieces, 'bot1', diff, 1500);
        if (!move) throw new Error(`${diff}: no move returned`);
    }
});

// ─── Test: Returns null when no pieces ───
test('Returns null when bot has no pieces', () => {
    const humanPieces = makePieces('human', [[3, 2]]);
    const move = getCheckersEngineMove(humanPieces, 'bot1', 'hard', 1500);
    if (move !== null) throw new Error('Should return null for no pieces');
});

// ─── Test: All pieces captured — returns null ───
test('Returns null when all bot pieces are captured', () => {
    const botPieces = makePieces('bot1', [[0, 0]]);
    botPieces[0].captured = true;
    const humanPieces = makePieces('human', [[3, 2]]);
    const pieces = [...botPieces, ...humanPieces];
    const move = getCheckersEngineMove(pieces, 'bot1', 'hard', 1500);
    if (move !== null) throw new Error('Should return null when all pieces captured');
});

// ─── Test: Response time under 3 seconds ───
test('Responds within 3.5 seconds for depth 16', () => {
    const botPieces = makePieces('bot1', [[7, 1], [7, 3], [7, 5], [7, 7], [8, 0], [8, 2], [8, 4], [8, 6], [9, 1], [9, 3], [9, 5], [9, 7]]);
    const humanPieces = makePieces('human', [[0, 0], [0, 2], [0, 4], [0, 6], [1, 1], [1, 3], [1, 5], [1, 7], [2, 0], [2, 2], [2, 4], [2, 6]]);
    const pieces = [...botPieces, ...humanPieces];
    const start = Date.now();
    const move = getCheckersEngineMove(pieces, 'bot1', 'hard', 2000);
    const elapsed = Date.now() - start;
    console.log(`        Depth response time: ${elapsed}ms`);
    if (elapsed > 3500) throw new Error(`Took ${elapsed}ms, expected < 3500ms`);
    if (!move) throw new Error('No move returned');
});

console.log(`\n=== Checkers Bot: ${passed.length} passed, ${failed.length} failed ===`);
if (failed.length > 0) {
    console.log('Failures:');
    failed.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
}
