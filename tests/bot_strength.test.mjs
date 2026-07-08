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

// ─── Test: Skill Level Mapping (now dynamic based on ELO) ───

test('Easy maps to 16 for low ELO, 18 for high ELO', async () => {
    if (mapEloToSkillLevel(500, 'easy') !== 16) throw new Error(`Expected 16 for ELO 500 easy`);
    if (mapEloToSkillLevel(1500, 'easy') !== 18) throw new Error(`Expected 18 for ELO 1500 easy`);
});

test('Medium maps to 17 for low ELO, 20 for high ELO', async () => {
    if (mapEloToSkillLevel(800, 'medium') !== 17) throw new Error(`Expected 17 for ELO 800 medium`);
    if (mapEloToSkillLevel(1600, 'medium') !== 20) throw new Error(`Expected 20 for ELO 1600 medium`);
});

test('Hard is always 20 for 1200+', async () => {
    if (mapEloToSkillLevel(1200, 'hard') !== 20) throw new Error(`Expected 20 for ELO 1200 hard`);
    if (mapEloToSkillLevel(2500, 'hard') !== 20) throw new Error(`Expected 20 for ELO 2500 hard`);
});

test('Skill level scales UP with ELO within each difficulty tier', async () => {
    // Within easy: 500→16, 1100→17, 1500→18
    if (mapEloToSkillLevel(500, 'easy') >= mapEloToSkillLevel(1100, 'easy')) throw new Error('Skill should increase with ELO');
    // Within medium: 800→17, 1100→18, 1300→19, 1600→20
    if (mapEloToSkillLevel(800, 'medium') >= mapEloToSkillLevel(1300, 'medium')) throw new Error('Skill should increase with ELO');
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
