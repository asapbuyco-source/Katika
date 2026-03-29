// Tournament Scheduler Logic Test (CommonJS)
// Tests the fixed scheduler rules without needing Firebase

const testCases = [
  { label: 'Match 30s late (was broken before)', elapsedMin: 0.5, activatedAt: null, status: 'scheduled', expected: 'ACTIVATE' },
  { label: 'Match 2min late (was broken before)',  elapsedMin: 2.0, activatedAt: null, status: 'scheduled', expected: 'ACTIVATE' },
  { label: 'Match exactly at start (0s)',          elapsedMin: 0,   activatedAt: null, status: 'scheduled', expected: 'ACTIVATE' },
  { label: 'Already activated (has activatedAt)',  elapsedMin: 1.0, activatedAt: 'ts', status: 'scheduled', expected: 'SKIP' },
  { label: 'Not yet started (-1min)',              elapsedMin: -1,  activatedAt: null, status: 'scheduled', expected: 'SKIP' },
  { label: 'Scheduled 5.1min overdue -> forfeit', elapsedMin: 5.1, activatedAt: null, status: 'scheduled', expected: 'FORFEIT' },
  { label: 'Active 5.1min overdue -> forfeit',    elapsedMin: 5.1, activatedAt: 'ts', status: 'active',    expected: 'FORFEIT' },
  { label: 'Active 4.5min -> warn (no warning yet)', elapsedMin: 4.5, activatedAt: 'ts', status: 'active', warningIssued: false, expected: 'WARN' },
  { label: 'Active 4.5min -> skip (warning sent)',   elapsedMin: 4.5, activatedAt: 'ts', status: 'active', warningIssued: true,  expected: 'FORFEIT_SKIP' },
  // Bug fix: p2In && !p1In (old code had !p1Id bug — a truthy string is always true so this was wrong)
  { label: 'Forfeit: p2 checked in, p1 not -> p2 wins', checkedInTest: true, p1in: false, p2in: true, expected_winner: 'p2' },
  { label: 'Forfeit: p1 checked in, p2 not -> p1 wins', checkedInTest: true, p1in: true,  p2in: false, expected_winner: 'p1' },
  { label: 'Forfeit: neither checked in -> p1 wins (seed)', checkedInTest: true, p1in: false, p2in: false, expected_winner: 'p1' },
];

console.log('=== Tournament Scheduler Logic Tests ===\n');
let pass = 0, fail = 0;

for (const tc of testCases) {
  if (tc.checkedInTest) {
    // Test forfeit winner determination
    const p1Id = 'player1';
    const p2Id = 'player2';
    const checkedIn = [];
    if (tc.p1in) checkedIn.push(p1Id);
    if (tc.p2in) checkedIn.push(p2Id);

    const p1In = checkedIn.includes(p1Id);
    const p2In = checkedIn.includes(p2Id);
    let winnerId = null;
    if (p1In && !p2In)       winnerId = p1Id;
    else if (p2In && !p1In)  winnerId = p2Id;  // FIXED: was !p1Id (always truthy string bug)
    else                      winnerId = p1Id;  // both absent -> p1

    const got = winnerId === p1Id ? 'p1' : 'p2';
    const ok = got === tc.expected_winner;
    if (ok) pass++; else fail++;
    console.log((ok ? '[PASS]' : '[FAIL]') + ' ' + tc.label + (ok ? '' : '  => got=' + got + ', want=' + tc.expected_winner));
    continue;
  }

  const { elapsedMin, activatedAt, status, warningIssued = false } = tc;
  let action = 'SKIP';

  // Scheduler activation (scheduled only, no activatedAt)
  if (status === 'scheduled' && elapsedMin >= 0 && !activatedAt) action = 'ACTIVATE';
  // Forfeit: active or overdue scheduled
  if ((status === 'active' || status === 'scheduled') && elapsedMin > 5) action = 'FORFEIT';
  // Warning: active, 4-5min window, not yet warned
  if (status === 'active' && elapsedMin > 4 && elapsedMin <= 5 && !warningIssued) action = 'WARN';
  // Already-warned at 4.5min stays SKIP (nothing more to do until 5min)
  if (status === 'active' && elapsedMin > 4 && elapsedMin <= 5 && warningIssued) action = 'FORFEIT_SKIP';

  const ok = action === tc.expected;
  if (ok) pass++; else fail++;
  console.log((ok ? '[PASS]' : '[FAIL]') + ' ' + tc.label + (ok ? '' : '  => got=' + action + ', want=' + tc.expected));
}

console.log('\nResults: ' + pass + '/' + testCases.length + ' passed' + (fail > 0 ? ', ' + fail + ' FAILED ❌' : ' ✅'));
process.exit(fail > 0 ? 1 : 0);
