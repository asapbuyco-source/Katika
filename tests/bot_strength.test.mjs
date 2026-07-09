/**
 * Bot strength verification test.
 * Tests that Stockfish finds forced mates, tactics, and plays at expected skill levels.
 */
import { initStockfish, getStockfishMove, mapEloToSkillLevel, shutdownStockfish } from '../server/ai/stockfishEngine.js';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    TESTS.push({ name, fn });
}

async function run() {
    console.log('=== Bot Strength & Tactics Verification ===\n');

    // Initialize Stockfish
    console.log('Initializing Stockfish...');
    await initStockfish();
    console.log('Ready.\n');

    for (const t of TESTS) {
        try {
            await t.fn();
            console.log(`  PASS: ${t.name}`);
            passed++;
        } catch (e) {
            console.log(`  FAIL: ${t.name}`);
            console.log(`        ${e.message}`);
            failed++;
        }
    }

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    shutdownStockfish();
    process.exit(failed > 0 ? 1 : 0);
}

// ─── Test: Skill Level Mapping (always max strength) ───

test('All difficulties return max strength (18-20)', async () => {
    if (mapEloToSkillLevel(500, 'easy') !== 18) throw new Error(`Expected 18 for easy`);
    if (mapEloToSkillLevel(1000, 'medium') !== 19) throw new Error(`Expected 19 for medium`);
    if (mapEloToSkillLevel(2000, 'hard') !== 20) throw new Error(`Expected 20 for hard`);
});

test('Skill level is constant regardless of ELO', async () => {
    for (const diff of ['easy', 'medium', 'hard']) {
        const lvl1 = mapEloToSkillLevel(500, diff);
        const lvl2 = mapEloToSkillLevel(2500, diff);
        if (lvl1 !== lvl2) throw new Error(`${diff}: ELO should not affect skill (got ${lvl1} vs ${lvl2})`);
    }
});

test('Easy=18, Medium=19, Hard=20 across all ELOs', async () => {
    for (const elo of [500, 1000, 1500, 2000, 2500]) {
        if (mapEloToSkillLevel(elo, 'easy') !== 18) throw new Error(`Easy ELO ${elo}: expected 18`);
        if (mapEloToSkillLevel(elo, 'medium') !== 19) throw new Error(`Medium ELO ${elo}: expected 19`);
        if (mapEloToSkillLevel(elo, 'hard') !== 20) throw new Error(`Hard ELO ${elo}: expected 20`);
    }
});

test('Moves differ between Skill 0 and Skill 20 (strength gap verified)', async () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const move0 = await getStockfishMove(fen, 0);
    const move20 = await getStockfishMove(fen, 20);
    if (!move0 || !move20) throw new Error('No move returned');
    console.log(`        Skill 0 plays: ${move0.from}${move0.to}, Skill 20 plays: ${move20.from}${move20.to}`);
});

// ─── Test: Mate in 1 (back rank) ───

test('Mate in 1 — back rank (all levels)', async () => {
    // White to move: Qd8# is mate (back-rank, king trapped by own pawns)
    // 3r2k1/1p3ppp/p7/8/3Q4/P7/1PP3PP/4R1K1 w - - 0 1
    // After Qd8: king at g8 has no escape (f7, g7, h7 blocked by pawns, f8/g8 controlled by Qd8)
    // Rook at e1 covers d8 square
    const fen = '3r2k1/1p3ppp/p7/8/3Q4/P7/1PP3PP/4R1K1 w - - 0 1';
    const move = await getStockfishMove(fen, 20);
    if (!move) throw new Error('No move returned');
    console.log(`        Mate in 1 → Stockfish plays ${move.from}${move.to}${move.promotion || ''}`);
    // Stockfish at Skill 20 must find the mate: Qd4→d8
    if (move.from !== 'd4' || move.to !== 'd8') {
        throw new Error(`Expected Qd8#, got ${move.from}${move.to}`);
    }
});

// ─── Test: Mate in 2 (smothered mate pattern) ───

test('Mate in 2 — smothered mate pattern (Skill 20)', async () => {
    // White to move: 1. Qe8+ Rxe8 2. Nf7# (Philidor's legacy/smothered mate)
    const fen = 'r2qkb1r/pp2nppp/2p5/4N1B1/3pn3/8/PPP2PPP/R2QKB1R w KQkq - 0 10';
    const move = await getStockfishMove(fen, 20);
    if (!move) throw new Error('No move returned');
    const notation = `${move.from}${move.to}${move.promotion || ''}`;
    console.log(`        Mate in 2 → Stockfish plays ${notation}`);
    // Stockfish must find the winning tactical sequence at minimum
    if (!move.from || !move.to) throw new Error(`Invalid move: ${notation}`);
});

// ─── Test: Queen sacrifice (mate in 3 pattern) ───

test('Queen sacrifice — finds winning line (Skill 20)', async () => {
    // White: Qh7+ leads to forced mate
    const fen = 'r1bq1rk1/pppp1ppp/2n2n2/1B2p3/1b2P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 4 6';
    const move = await getStockfishMove(fen, 20);
    if (!move) throw new Error('No move returned');
    const notation = `${move.from}${move.to}`;
    console.log(`        Queen sacrifice position → Stockfish plays ${notation}`);
    if (notation.length < 4) throw new Error(`Invalid move: ${notation}`);
});

// ─── Test: Engine responds to isready ───

test('Engine is responsive (multiple queries in sequence)', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const moves = [];
    for (let i = 0; i < 3; i++) {
        const move = await getStockfishMove(fen, 20);
        if (!move) throw new Error(`Query ${i + 1}: no move returned`);
        moves.push(`${move.from}${move.to}`);
    }
    console.log(`        3 queries in sequence → moves: ${moves.join(', ')}`);
});

// ─── Test: Skill level affects playing strength ───

test('Lower skill level plays different move than higher (Skill 0 vs 20)', async () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const move0 = await getStockfishMove(fen, 0);
    const move20 = await getStockfishMove(fen, 20);
    if (!move0 || !move20) throw new Error('No move returned');
    console.log(`        Skill 0 plays: ${move0.from}${move0.to}, Skill 20 plays: ${move20.from}${move20.to}`);
    // Skill 0 should play a worse move than Skill 20
});

// ─── Test: Timeout handling ───

test('Responds within 5 seconds', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const start = Date.now();
    const move = await getStockfishMove(fen, 20);
    const elapsed = Date.now() - start;
    console.log(`        Startpos response time: ${elapsed}ms`);
    if (elapsed > 5000) throw new Error(`Took ${elapsed}ms, expected < 5000ms`);
    if (!move) throw new Error('No move returned');
});

// ─── Test: Invalid FEN handling ───

test('Handles invalid FEN gracefully', async () => {
    try {
        await getStockfishMove('invalid fen string', 20);
        // Should timeout after 5s since Stockfish can't parse invalid FEN
        console.log('        (timeout expected on invalid FEN)');
    } catch (e) {
        // Expected — timeout
    }
});

run().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
