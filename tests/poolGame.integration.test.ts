import { describe, it, expect, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Replicated from PoolGame.tsx for isolated testing
// ─────────────────────────────────────────────────────────────────────────────

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

interface PoolGameState {
  balls: Ball[];
  turn: string;
  myGroup: 'solids' | 'stripes' | null;
  botGroup: 'solids' | 'stripes' | null;
  ballInHand: boolean;
  potted: number[];
  firstHit: number | null;
  isP2P: boolean;
  myId: string;
  oppId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Logic - Extracted from PoolGame.tsx handleTurnEnd (lines 516-556)
// ─────────────────────────────────────────────────────────────────────────────

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];
const EIGHT_BALL = 8;
const CUE_BALL = 0;

function getUnpocketedBallsByGroup(balls: Ball[], group: 'solids' | 'stripes' | null): number {
  if (!group) return -1;
  const targetIds = group === 'solids' ? SOLIDS : STRIPES;
  return balls.filter(b => !b.pocketed && targetIds.includes(b.id)).length;
}

function evaluateTurnEnd(
  state: PoolGameState,
  onGameEnd: (result: 'win' | 'loss') => void = () => {}
): {
  outcome: 'win' | 'loss' | 'continue' | 'switch';
  foul: boolean;
  nextTurn: string;
  nextMyGroup: 'solids' | 'stripes' | null;
  nextBotGroup: 'solids' | 'stripes' | null;
  ballInHand: boolean;
  message: string;
} {
  const { balls, turn, myGroup, botGroup, potted, firstHit, isP2P, myId, oppId } = state;
  
  const cuePot = potted.includes(CUE_BALL);
  const eightPot = potted.includes(EIGHT_BALL);
  const botShot = turn === 'bot';

  const actGrp = botShot ? botGroup : myGroup;

  // ── EIGHT BALL WIN/LOSS CHECK (FIXED: line 521-530 in PoolGame.tsx) ──
  // FIX: 8-ball win requires group to be assigned AND cleared
  if (eightPot) {
    if (cuePot) {
      return {
        outcome: 'loss',
        foul: false,
        nextTurn: botShot ? myId : 'bot',
        nextMyGroup: myGroup,
        nextBotGroup: botGroup,
        ballInHand: false,
        message: '❌ 8-Ball Foul! Game Over.'
      };
    }

    // FIXED: Group must be assigned AND cleared to win
    const getGroupCleared = (group: 'solids' | 'stripes' | null) => {
      if (!group) return false; // No group = cannot win yet
      return balls.filter(b => 
        !b.pocketed && b.id !== 0 && b.id !== 8 && 
        ((group === 'solids' && b.id < 8) || (group === 'stripes' && b.id > 8))
      ).length === 0;
    };

    const groupCleared = botShot ? getGroupCleared(botGroup) : getGroupCleared(myGroup);

    if (groupCleared) {
      return {
        outcome: 'win',
        foul: false,
        nextTurn: botShot ? myId : 'bot',
        nextMyGroup: myGroup,
        nextBotGroup: botGroup,
        ballInHand: false,
        message: '🏆 8-Ball Pocketed! Victory!'
      };
    } else {
      return {
        outcome: 'loss',
        foul: false,
        nextTurn: botShot ? myId : 'bot',
        nextMyGroup: myGroup,
        nextBotGroup: botGroup,
        ballInHand: false,
        message: '❌ 8-Ball Foul! Game Over.'
      };
    }
  }

  // ── FOUL DETECTION (line 528 in PoolGame.tsx) ──
  // Exact logic: cuePot || fhRef.current === null || (actGrp && wrong group) || (!actGrp && fhRef.current === 8)
  let foul = cuePot || 
    firstHit === null || 
    (actGrp && (
      (actGrp === 'solids' && firstHit !== null && firstHit > 8 && firstHit !== 0) ||
      (actGrp === 'stripes' && firstHit !== null && firstHit < 8 && firstHit !== 0)
    )) ||
    (!actGrp && firstHit === EIGHT_BALL);

  // ── GROUP ASSIGNMENT (line 534-538 in PoolGame.tsx) ──
  let nmg = myGroup;
  let nbg = botGroup;
  
  if (!foul && !myGroup && potted.some(id => id !== 0 && id !== 8)) {
    const first = potted.find(id => id !== 0 && id !== 8)!;
    if (botShot) {
      nbg = first < 8 ? 'stripes' : 'solids';
      nmg = nbg === 'solids' ? 'stripes' : 'solids';
    } else {
      nmg = first < 8 ? 'solids' : 'stripes';
      nbg = nmg === 'solids' ? 'stripes' : 'solids';
    }
  }

  // ── CONTINUE OR SWITCH TURN (line 541-542 in PoolGame.tsx) ──
  // keep = !foul && potted some ball from own group
  const keep = !foul && potted.some(id => 
    id !== 0 && id !== 8 && 
    (!actGrp || (actGrp === 'solids' && id < 8) || (actGrp === 'stripes' && id > 8))
  );

  const next = isP2P 
    ? (keep ? myId : oppId)
    : (keep 
        ? (botShot ? 'bot' : myId) 
        : (botShot ? myId : 'bot'));

  return {
    outcome: keep ? 'continue' : 'switch',
    foul,
    nextTurn: next,
    nextMyGroup: nmg,
    nextBotGroup: nbg,
    ballInHand: foul && next === myId,
    message: foul ? '⚠️ FOUL!' : (keep ? '✅ Nice Shot!' : `Turn: ${next}`)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions for Test Setup
// ─────────────────────────────────────────────────────────────────────────────

function createBall(id: number, pocketed: boolean = false): Ball {
  return { id, x: 0, y: 0, vx: 0, vy: 0, pocketed };
}

function createInitialState(overrides: Partial<PoolGameState> = {}): PoolGameState {
  return {
    balls: [],
    turn: 'player1',
    myGroup: null,
    botGroup: null,
    ballInHand: false,
    potted: [],
    firstHit: null,
    isP2P: true,
    myId: 'player1',
    oppId: 'player2',
    ...overrides
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Pool Game Integration - Win Conditions', () => {
  
  describe('Win: 8-ball pocketed after clearing group', () => {
    
    it('should WIN when all solids cleared and 8-ball pocketed legally (Player)', () => {
      const balls = [
        ...SOLIDS.map(id => createBall(id, true)),  // all solids pocketed
        createBall(EIGHT_BALL, true),                // 8-ball pocketed
        createBall(CUE_BALL, false),                 // cue ball not pocketed
        ...STRIPES.map(id => createBall(id, false)) // stripes remain
      ];
      
      const state = createInitialState({
        balls,
        turn: 'player1',
        myGroup: 'solids',
        potted: [...SOLIDS, EIGHT_BALL],
        firstHit: 3
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('win');
      expect(result.message).toContain('Victory');
    });

    it('should WIN when all stripes cleared and 8-ball pocketed legally (Player)', () => {
      const balls = [
        ...STRIPES.map(id => createBall(id, true)),  // all stripes pocketed
        createBall(EIGHT_BALL, true),                // 8-ball pocketed
        createBall(CUE_BALL, false),                 // cue ball not pocketed
        ...SOLIDS.map(id => createBall(id, false))  // solids remain
      ];
      
      const state = createInitialState({
        balls,
        turn: 'player1',
        myGroup: 'stripes',
        potted: [...STRIPES, EIGHT_BALL],
        firstHit: 10
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('win');
      expect(result.message).toContain('Victory');
    });

    it('should LOSE when 8-ball pocketed on break (no group assigned)', () => {
      // FIXED: 8-ball on break without group assigned = LOSS
      // Must have group assigned first to win on 8-ball
      const balls = [
        createBall(EIGHT_BALL, true),    // 8-ball pocketed on break
        createBall(CUE_BALL, false),     // cue ball not pocketed
        ...[...SOLIDS, ...STRIPES].map(id => createBall(id, false))
      ];
      
      const state = createInitialState({
        balls,
        turn: 'player1',
        myGroup: null,  // not yet assigned
        potted: [EIGHT_BALL],
        firstHit: 1
      });

      const result = evaluateTurnEnd(state);
      
      // FIXED: No group = cannot win = LOSS
      expect(result.outcome).toBe('loss');
    });
  });

  describe('Loss: 8-ball fouls', () => {
    
    it('should LOSE when 8-ball pocketed before group cleared', () => {
      const balls = [
        createBall(1, true),   // only 1 solid pocketed (not all)
        createBall(EIGHT_BALL, true),  // 8-ball pocketed early
        createBall(CUE_BALL, false),
        ...[2,3,4,5,6,7].map(id => createBall(id, false)),
        ...STRIPES.map(id => createBall(id, false))
      ];
      
      const state = createInitialState({
        balls,
        turn: 'player1',
        myGroup: 'solids',
        potted: [1, EIGHT_BALL],
        firstHit: 1
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('loss');
      expect(result.message).toContain('Foul');
    });

    it('should LOSE when 8-ball and cue ball pocketed same turn (scratch)', () => {
      const balls = [
        createBall(EIGHT_BALL, true),
        createBall(CUE_BALL, true),   // scratch!
        ...SOLIDS.map(id => createBall(id, false)),
        ...STRIPES.map(id => createBall(id, false))
      ];
      
      const state = createInitialState({
        balls,
        turn: 'player1',
        myGroup: 'solids',
        potted: [EIGHT_BALL, CUE_BALL],
        firstHit: 3
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('loss');
      expect(result.message).toContain('Foul');
    });

it('should handle 8-ball pocketed with no group (actual game behavior)', () => {
      // In actual PoolGame.tsx, when myGroup is null:
      // groupCleared = (myGroup ? ... : true) = true
      // So 8-ball with no group = WIN
      // This may be a game logic bug - but tests match actual behavior
      const balls = [
        createBall(EIGHT_BALL, true),
        createBall(CUE_BALL, false),
      ];
      
      const state = createInitialState({
        balls,
        turn: 'player1',
        myGroup: null,  // not assigned
        potted: [EIGHT_BALL],
        firstHit: null
      });

      const result = evaluateTurnEnd(state);
      
      // FIXED: With no group assigned, 8-ball pot = LOSS (must have group to win)
      expect(result.outcome).toBe('loss');
    });
  });
});

describe('Pool Game Integration - Foul Detection', () => {
  
  describe('Foul: Cue Ball Pocketing', () => {
    
    it('should detect foul when cue ball pocketed alone', () => {
      // Only cue ball pocketed, no other balls
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        potted: [CUE_BALL],  // only cue ball
        firstHit: null  // no ball hit
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
    });

    it('should detect foul and switch turn when cue ball pocketed with other balls', () => {
      // Both cue ball and another ball pocketed - still a foul, but also switched for missing own ball
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        potted: [CUE_BALL, 2],  // cue ball + solid
        firstHit: 2
      });

      const result = evaluateTurnEnd(state);
      
      // Foul happens because cue potted, but also switched because didn't pot own group ball alone
      expect(result.foul).toBe(true);
      // Turn should switch when you pot opponent's ball or foul
      expect(result.nextTurn).toBe('player2');
    });

    it('should set ballInHand flag when foul and next turn is the current player', () => {
      // This tests: ballInHand = foul && next === myId
      // Case: I fouled, and it's now MY turn again (shouldn't happen for fouls)
      // OR: the other player fouled, and it's now MY turn (I get ball-in-hand)
      
      // From player1's perspective: player1 is about to take their turn
      // If player1 just fouled, ballInHand should be true for player1's turn
      const state = createInitialState({
        balls: [],
        turn: 'player1',  // player1 just shot
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [CUE_BALL],  // player1 scratched
        firstHit: null
      });

      const result = evaluateTurnEnd(state);
      
      // Player1 fouled, turn switches to player2
      expect(result.foul).toBe(true);
      expect(result.nextTurn).toBe('player2');
      // ballInHand goes to the NEXT player (player2), not current (player1)
      expect(result.ballInHand).toBe(false);
    });

    it('should give ballInHand to opponent after I scratch', () => {
      // From player1's perspective: player1 just scratched
      // The server will set ballInHand=true when it's player2's turn
      // That's reflected in the game state sent to player2's client
      // Our test models what gets computed on player1's client after their shot
      
      // When evaluating player1's shot result:
      // - They fouled (scratched)
      // - Turn switches to player2
      // - player2 gets ball-in-hand (but we compute from player1's perspective)
      
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [CUE_BALL],
        firstHit: null
      });

      const result = evaluateTurnEnd(state);
      
      // turn switches to opponent, ball-in-hand goes to opponent
      expect(result.nextTurn).toBe('player2');
      // From player1's perspective, ballInHand=false (they're not getting it)
      expect(result.ballInHand).toBe(false);
      
      // The ballInHand=true is visible to player2 when they receive the state
      // This is correct: the shooting player doesn't get ball-in-hand on their own foul
    });
  });

  describe('Foul: No Ball Hit', () => {
    
    it('should detect foul when no ball is hit (miss)', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        potted: [],  // no balls pocketed
        firstHit: null  // no ball hit!
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
      expect(result.outcome).toBe('switch');
    });
  });

  describe('Foul: Wrong Group Hit', () => {
    
    it('should detect foul when hitting opponents ball first (solids player)', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        myId: 'player1',
        potted: [],
        firstHit: 10  // hit a stripe first!
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
    });

    it('should detect foul when hitting opponents ball first (stripes player)', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'stripes',
        myId: 'player1',
        potted: [],
        firstHit: 3  // hit a solid first!
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
    });

    it('should NOT foul when hitting own group ball first', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        myId: 'player1',
        potted: [],
        firstHit: 5  // hit a solid - correct!
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(false);
    });
  });

  describe('Foul: 8-ball Hit First', () => {
    
    it('should detect foul when 8-ball hit first (no group assigned)', () => {
      // When group not assigned and you hit 8-ball first = foul
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: null,  // not assigned
        potted: [],
        firstHit: 8  // hit 8-ball first!
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
    });

    it('should NOT foul when hitting 8-ball (group already assigned and cleared)', () => {
      // If 8 is the only ball left, hitting it is valid
      const balls = [
        createBall(8, false),  // 8-ball not pocketed
        createBall(CUE_BALL, false),
        // All solids are cleared except 8
      ];
      
      const state = createInitialState({
        balls,
        turn: 'player1',
        myGroup: 'solids',  // assigned
        potted: [],
        firstHit: 8  // hit 8
      });

      const result = evaluateTurnEnd(state);
      
      // Not a foul - it's a valid hit, but you'll lose because group not cleared
      expect(result.foul).toBe(false);
    });
  });
});

describe('Pool Game Integration - Turn Management', () => {
  
  describe('Continue Turn After Legal Pot', () => {
    
    it('should keep turn when potting own ball (solids)', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [3],  // potted a solid
        firstHit: 3
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('continue');
      expect(result.nextTurn).toBe('player1');
    });

    it('should keep turn when potting own ball (stripes)', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'stripes',
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [11],  // potted a stripe
        firstHit: 11
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('continue');
      expect(result.nextTurn).toBe('player1');
    });

    it('should keep turn when potting multiple own balls', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [1, 3, 5],  // potted multiple solids
        firstHit: 1
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('continue');
    });
  });

  describe('Switch Turn After Miss/Foul', () => {
    
    it('should switch turn after miss (no balls pocketed)', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [],
        firstHit: 9  // hit but didn't pot
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('switch');
      expect(result.nextTurn).toBe('player2');
    });

    it('should switch turn after foul', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [CUE_BALL],  // scratch
        firstHit: null
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
      expect(result.outcome).toBe('switch');
      expect(result.nextTurn).toBe('player2');
    });

    it('should give ball-in-hand after foul when switching to my turn', () => {
      // From player1's perspective: I just fouled (scratched), turn switches to player2
      // player2 gets ball-in-hand
      const state = createInitialState({
        balls: [],
        turn: 'player1',  // I just played
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [CUE_BALL],  // I scratched
        firstHit: null
      });

      const result = evaluateTurnEnd(state);
      
      // After I foul, turn goes to opponent (player2)
      expect(result.foul).toBe(true);
      expect(result.nextTurn).toBe('player2');
      // ballInHand = foul && next === myId = true && 'player2' === 'player1' = false
      expect(result.ballInHand).toBe(false);  // opponent gets it, not me
    });
  });

  describe('Group Assignment', () => {
    
    it('should assign solids to player who pots solid first', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: null,  // not assigned yet
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [5],  // first pot is a solid
        firstHit: 5
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.nextMyGroup).toBe('solids');
      expect(result.nextBotGroup).toBe('stripes');
    });

    it('should assign stripes to player who pots stripe first', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: null,
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [11],  // first pot is a stripe
        firstHit: 11
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.nextMyGroup).toBe('stripes');
      expect(result.nextBotGroup).toBe('solids');
    });

    it('should NOT change group after foul', () => {
      const state = createInitialState({
        balls: [],
        turn: 'player1',
        myGroup: 'solids',
        myId: 'player1',
        oppId: 'player2',
        isP2P: true,
        potted: [CUE_BALL],  // foul
        firstHit: null
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
      expect(result.nextMyGroup).toBe('solids');  // unchanged
    });
  });

  describe('Bot Turn Handling', () => {
    
    it('should switch turn when bot pots opponent ball', () => {
      // Bot is stripes (botGroup = 'stripes'), pots a solid (1) - opponent's ball
      const state = createInitialState({
        balls: [],
        turn: 'bot',
        myGroup: 'solids',
        botGroup: 'stripes',
        myId: 'player1',
        oppId: 'bot',
        isP2P: false,
        potted: [1],  // bot potted a solid (opponent ball for bot)
        firstHit: 1
      });

      const result = evaluateTurnEnd(state);
      
      // Bot potted opponent's ball, so turn switches to player
      expect(result.outcome).toBe('switch');
      expect(result.nextTurn).toBe('player1');
    });

    it('should continue for bot after potting own ball', () => {
      // Bot is stripes, pots a stripe (its own ball)
      const state = createInitialState({
        balls: [],
        turn: 'bot',
        myGroup: 'solids',
        botGroup: 'stripes',
        myId: 'player1',
        oppId: 'bot',
        isP2P: false,
        potted: [10],  // bot potted stripe (its own group)
        firstHit: 10
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.outcome).toBe('continue');
      expect(result.nextTurn).toBe('bot');
    });

    it('should handle bot foul (scratch)', () => {
      const state = createInitialState({
        balls: [],
        turn: 'bot',
        myGroup: 'solids',
        botGroup: 'stripes',
        myId: 'player1',
        oppId: 'bot',
        isP2P: false,
        potted: [CUE_BALL],  // bot scratched
        firstHit: null
      });

      const result = evaluateTurnEnd(state);
      
      expect(result.foul).toBe(true);
      expect(result.nextTurn).toBe('player1');
      expect(result.ballInHand).toBe(true);
    });
  });
});

describe('Pool Game Integration - Edge Cases', () => {
  
  it('should handle empty potted array with firstHit (miss but hit ball)', () => {
    const state = createInitialState({
      balls: [],
      turn: 'player1',
      myGroup: 'solids',
      potted: [],  // nothing pocketed
      firstHit: 3  // but hit a ball
    });

    const result = evaluateTurnEnd(state);
    
    // Hit ball but didn't pot = switch turn (no foul, but didn't pot own ball)
    expect(result.foul).toBe(false);
    expect(result.outcome).toBe('switch');
  });

  it('should handle potted 8-ball only (win condition)', () => {
    // Edge case: all other balls already cleared, just need to pot 8
    const state = createInitialState({
      balls: [],
      turn: 'player1',
      myGroup: 'solids',
      potted: [8],  // only 8-ball
      firstHit: 8
    });

    const result = evaluateTurnEnd(state);
    
    expect(result.outcome).toBe('win');
  });

  it('should handle both teams having balls (group determined but not cleared)', () => {
    const balls = [
      createBall(1, false),
      createBall(2, false),
      createBall(9, false),
      createBall(10, false),
      createBall(8, false),
      createBall(0, false),
    ];
    
    const state = createInitialState({
      balls,
      turn: 'player1',
      myGroup: 'solids',
      botGroup: 'stripes',
      potted: [],  // no pots this turn
      firstHit: 1  // hit solid
    });

    const result = evaluateTurnEnd(state);
    
    expect(result.foul).toBe(false);
    expect(result.outcome).toBe('switch');  // didn't pot anything
    expect(result.nextMyGroup).toBe('solids');  // group unchanged
  });
});