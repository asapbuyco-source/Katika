
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Target, Shield, AlertTriangle, MousePointer2, RefreshCw } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { motion, AnimatePresence } from 'framer-motion';
import { playSFX } from '../services/sound';

interface PoolGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

interface Ball {
  id: number; // 0 = Cue Ball, 8 = 8Ball, 1-7 Solids, 9-15 Stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  isPotted: boolean;
}

// Table Constants
const TABLE_WIDTH = 800; 
const TABLE_HEIGHT = 400;
const BALL_RADIUS = 10;
const POCKET_RADIUS = 20; // Slightly larger for better gameplay feel
const FRICTION = 0.99; // Lower friction for smoother rolls
const VELOCITY_THRESHOLD = 0.02;
const SUB_STEPS = 8; // Physics steps per frame for collision accuracy

// Pockets: TL, TM, TR, BL, BM, BR
const POCKETS = [
    { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: 0 }, { x: TABLE_WIDTH, y: 0 },
    { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, { x: TABLE_WIDTH, y: TABLE_HEIGHT }
];

export const PoolGame: React.FC<PoolGameProps> = ({ table, user, onGameEnd }) => {
  // --- STATE ---
  const [balls, setBalls] = useState<Ball[]>([]);
  const [cueAngle, setCueAngle] = useState(0);
  const [power, setPower] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [turn, setTurn] = useState<'me' | 'opponent'>('me');
  const [myGroup, setMyGroup] = useState<'solids' | 'stripes' | null>(null);
  const [message, setMessage] = useState("Your Break!");
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [ballInHand, setBallInHand] = useState(false); // Can place cue ball anywhere

  // Game Logic Refs
  const ballsRef = useRef<Ball[]>([]);
  const animationRef = useRef<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const turnAnalysis = useRef({
      firstContactId: null as number | null,
      pottedInTurn: [] as number[],
      railHit: false
  });

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    resetRack();
  }, []);

  const resetRack = () => {
    const newBalls: Ball[] = [];
    
    // Cue Ball
    newBalls.push({ id: 0, x: 200, y: 200, vx: 0, vy: 0, isPotted: false });

    // Rack (Triangle formation starting at x=550)
    // We strictly alternate the corners of the 5th row for fairness
    let startX = 550;
    let startY = 200;
    const radius = BALL_RADIUS;
    const rowOffset = Math.sqrt(3) * radius + 1; // Slight gap

    // Standard 8-Ball Rack Pattern
    // Row 1 (1 ball)
    newBalls.push({ id: 1, x: startX, y: startY, vx: 0, vy: 0, isPotted: false });
    
    // Row 2 (2 balls)
    newBalls.push({ id: 9, x: startX + rowOffset, y: startY - radius - 1, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 2, x: startX + rowOffset, y: startY + radius + 1, vx: 0, vy: 0, isPotted: false });
    
    // Row 3 (3 balls, 8 in middle)
    newBalls.push({ id: 10, x: startX + rowOffset * 2, y: startY - (radius * 2) - 2, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 8, x: startX + rowOffset * 2, y: startY, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 3, x: startX + rowOffset * 2, y: startY + (radius * 2) + 2, vx: 0, vy: 0, isPotted: false });
    
    // Row 4 (4 balls)
    newBalls.push({ id: 11, x: startX + rowOffset * 3, y: startY - (radius * 3) - 3, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 7, x: startX + rowOffset * 3, y: startY - radius - 1, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 14, x: startX + rowOffset * 3, y: startY + radius + 1, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 4, x: startX + rowOffset * 3, y: startY + (radius * 3) + 3, vx: 0, vy: 0, isPotted: false });
    
    // Row 5 (5 balls, corners different suits)
    newBalls.push({ id: 5, x: startX + rowOffset * 4, y: startY - (radius * 4) - 4, vx: 0, vy: 0, isPotted: false }); // Solid
    newBalls.push({ id: 13, x: startX + rowOffset * 4, y: startY - (radius * 2) - 2, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 15, x: startX + rowOffset * 4, y: startY, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 6, x: startX + rowOffset * 4, y: startY + (radius * 2) + 2, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 12, x: startX + rowOffset * 4, y: startY + (radius * 4) + 4, vx: 0, vy: 0, isPotted: false }); // Stripe

    ballsRef.current = newBalls;
    setBalls(newBalls);
  };

  // --- PHYSICS ENGINE (SUB-STEPPING) ---
  const updatePhysics = useCallback(() => {
    let moving = false;
    const currentBalls = ballsRef.current;

    // Run physics in sub-steps for precision
    for (let step = 0; step < SUB_STEPS; step++) {
        
        currentBalls.forEach(ball => {
            if (ball.isPotted) return;

            // Apply Velocity (scaled by sub-steps)
            ball.x += ball.vx / SUB_STEPS;
            ball.y += ball.vy / SUB_STEPS;

            // Friction (Applied once per frame effectively, so scale it)
            // We apply slight friction each sub-step or just maintain velocity logic
            // To keep it simple, we degrade velocity at end of frame, here we just move.
            
            // Wall Collisions
            if (ball.x < BALL_RADIUS) { ball.x = BALL_RADIUS; ball.vx *= -0.9; }
            if (ball.x > TABLE_WIDTH - BALL_RADIUS) { ball.x = TABLE_WIDTH - BALL_RADIUS; ball.vx *= -0.9; }
            if (ball.y < BALL_RADIUS) { ball.y = BALL_RADIUS; ball.vy *= -0.9; }
            if (ball.y > TABLE_HEIGHT - BALL_RADIUS) { ball.y = TABLE_HEIGHT - BALL_RADIUS; ball.vy *= -0.9; }

            // Pocket Check
            for (const pocket of POCKETS) {
                const dx = ball.x - pocket.x;
                const dy = ball.y - pocket.y;
                if (Math.sqrt(dx * dx + dy * dy) < POCKET_RADIUS) {
                    ball.isPotted = true;
                    ball.vx = 0;
                    ball.vy = 0;
                    turnAnalysis.current.pottedInTurn.push(ball.id);
                    playSFX('capture');
                }
            }
        });

        // Ball-to-Ball Collisions
        for (let i = 0; i < currentBalls.length; i++) {
            for (let j = i + 1; j < currentBalls.length; j++) {
                const b1 = currentBalls[i];
                const b2 = currentBalls[j];
                if (b1.isPotted || b2.isPotted) continue;

                const dx = b2.x - b1.x;
                const dy = b2.y - b1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < BALL_RADIUS * 2) {
                    // Overlap Resolution (prevent sticking)
                    const overlap = BALL_RADIUS * 2 - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    
                    b1.x -= overlap * nx * 0.5;
                    b1.y -= overlap * ny * 0.5;
                    b2.x += overlap * nx * 0.5;
                    b2.y += overlap * ny * 0.5;

                    // Elastic Collision
                    const dvx = b1.vx - b2.vx;
                    const dvy = b1.vy - b2.vy;
                    const dot = dvx * nx + dvy * ny;

                    if (dot > 0) {
                        // Sound
                        if (step === 0 && Math.abs(dot) > 1) playSFX('move');

                        b1.vx -= dot * nx;
                        b1.vy -= dot * ny;
                        b2.vx += dot * nx;
                        b2.vy += dot * ny;

                        // Track First Contact for Rule Enforcement
                        if (turnAnalysis.current.firstContactId === null) {
                            if (b1.id === 0) turnAnalysis.current.firstContactId = b2.id;
                            else if (b2.id === 0) turnAnalysis.current.firstContactId = b1.id;
                        }
                    }
                }
            }
        }
    }

    // Apply Friction and Check Movement Status at end of frame
    currentBalls.forEach(ball => {
        if (!ball.isPotted) {
            ball.vx *= FRICTION;
            ball.vy *= FRICTION;
            if (Math.abs(ball.vx) < VELOCITY_THRESHOLD) ball.vx = 0;
            if (Math.abs(ball.vy) < VELOCITY_THRESHOLD) ball.vy = 0;
            if (ball.vx !== 0 || ball.vy !== 0) moving = true;
        }
    });

    ballsRef.current = currentBalls;
    setBalls([...currentBalls]); // Trigger Render
    return moving;
  }, []);

  // --- GAME LOOP & TURN ARBITER ---
  useEffect(() => {
    if (isMoving) {
        animationRef.current = requestAnimationFrame(() => {
            const stillMoving = updatePhysics();
            if (!stillMoving) {
                setIsMoving(false);
                handleTurnEnd();
            }
        });
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isMoving, updatePhysics]);

  const handleTurnEnd = () => {
      const { pottedInTurn, firstContactId } = turnAnalysis.current;
      const cuePotted = pottedInTurn.includes(0);
      const eightPotted = pottedInTurn.includes(8);
      
      let nextTurn = turn;
      let foul = false;
      let foulReason = "";

      // 1. Analyze 8-Ball
      if (eightPotted) {
          if (cuePotted) {
              endGame('loss', "You scratched on the 8-ball!");
              return;
          }
          // Check if group cleared
          const myBalls = ballsRef.current.filter(b => 
              !b.isPotted && b.id !== 0 && b.id !== 8 && 
              ((myGroup === 'solids' && b.id < 8) || (myGroup === 'stripes' && b.id > 8))
          );
          
          // Win Condition: Group cleared AND 8-ball potted legally (assuming call pocket not enforced for simplicity)
          if (myBalls.length === 0 && myGroup) {
               endGame('win', "You sank the 8-ball!");
               return;
          } else {
              endGame('loss', "You sank the 8-ball early!");
              return;
          }
      }

      // 2. Analyze Fouls
      if (cuePotted) {
          foul = true;
          foulReason = "Scratch!";
          // Respawn Cue Logic handled in state update
      } else if (firstContactId === null) {
          foul = true;
          foulReason = "No ball hit!";
      } else {
          // Legal Hit Check
          if (myGroup) {
              const isSolidHit = firstContactId < 8;
              if (myGroup === 'solids' && !isSolidHit) { foul = true; foulReason = "Hit opponent's ball first!"; }
              if (myGroup === 'stripes' && isSolidHit && firstContactId !== 8) { foul = true; foulReason = "Hit opponent's ball first!"; }
              if (firstContactId === 8) {
                  // Only legal to hit 8 if it's the last ball
                  const remaining = ballsRef.current.filter(b => !b.isPotted && b.id !== 0 && b.id !== 8 && 
                      ((myGroup === 'solids' && b.id < 8) || (myGroup === 'stripes' && b.id > 8))
                  );
                  if (remaining.length > 0) { foul = true; foulReason = "Hit 8-ball too early!"; }
              }
          } else {
              // Open Table: Cannot hit 8 first
              if (firstContactId === 8) { foul = true; foulReason = "Hit 8-ball first on open table!"; }
          }
      }

      // 3. Assign Groups (if open)
      if (!myGroup && pottedInTurn.length > 0 && !foul) {
          const firstId = pottedInTurn.find(id => id !== 0 && id !== 8);
          if (firstId) {
              const isSolid = firstId < 8;
              if (turn === 'me') {
                  setMyGroup(isSolid ? 'solids' : 'stripes');
                  setMessage(`You are ${isSolid ? 'Solids' : 'Stripes'}`);
              } else {
                  setMyGroup(isSolid ? 'stripes' : 'solids'); // Bot assigned
              }
          }
      }

      // 4. Determine Next State
      if (foul) {
          nextTurn = turn === 'me' ? 'opponent' : 'me';
          setMessage(`FOUL: ${foulReason} Ball in Hand.`);
          addLog(foulReason, "alert");
          
          // Handle Scratch Respawn
          if (cuePotted) {
              const cue = ballsRef.current.find(b => b.id === 0)!;
              cue.isPotted = false;
              cue.x = 200; cue.y = 200; cue.vx = 0; cue.vy = 0;
          }
          
          setBallInHand(true); // Grant ball in hand to next player
      } else if (pottedInTurn.length === 0) {
          nextTurn = turn === 'me' ? 'opponent' : 'me';
          setMessage(nextTurn === 'me' ? "Your Turn" : "Opponent's Turn");
      } else {
          // Potted a ball - check if it was legal
          // Simplified: If not foul, and potted *something* valid, keep turn
          const validPot = pottedInTurn.some(id => 
              id !== 0 && 
              (!myGroup || (myGroup === 'solids' && id < 8) || (myGroup === 'stripes' && id > 8))
          );
          
          if (validPot) {
             setMessage("Good Shot! Continue.");
             nextTurn = turn; // Keep turn
          } else {
             nextTurn = turn === 'me' ? 'opponent' : 'me'; 
             setMessage("Turn Over.");
          }
      }

      setTurn(nextTurn);
      
      // AI Turn Trigger
      if (nextTurn === 'opponent') {
          setTimeout(() => executeBotTurn(ballInHand || foul), 1500);
      }
  };

  const endGame = (result: 'win' | 'loss', msg: string) => {
      setMessage(msg);
      addLog("Match Ended: " + msg, result === 'win' ? 'secure' : 'alert');
      setTimeout(() => onGameEnd(result), 2000);
  };

  // --- BOT INTELLIGENCE ---
  const executeBotTurn = (hasBallInHand: boolean) => {
      addLog("Bot analyzing table...", "scanning");
      
      const botGroup = myGroup ? (myGroup === 'solids' ? 'stripes' : 'solids') : null;
      const balls = ballsRef.current;
      const cue = balls.find(b => b.id === 0);
      if (!cue) return;

      // 1. Placement (if ball in hand)
      if (hasBallInHand) {
          // Simple heuristic: Place near center if unsure, or find a clear shot
          cue.x = TABLE_WIDTH / 3;
          cue.y = TABLE_HEIGHT / 2;
          cue.vx = 0; cue.vy = 0;
          setBallInHand(false); // Consume ball in hand
      }

      // 2. Target Selection
      // Find easiest ball to hit (closest legal ball)
      let targetBall: Ball | null = null;
      let minDist = Infinity;

      const legalTargets = balls.filter(b => 
          !b.isPotted && b.id !== 0 && 
          (botGroup ? ((botGroup === 'solids' && b.id < 8) || (botGroup === 'stripes' && b.id > 8) || b.id === 8) : b.id !== 8)
      );

      // If only 8 left
      const groupRemaining = balls.filter(b => !b.isPotted && botGroup && ((botGroup === 'solids' && b.id < 8) || (botGroup === 'stripes' && b.id > 8)));
      if (botGroup && groupRemaining.length === 0) {
          targetBall = balls.find(b => b.id === 8) || null;
      } else {
          legalTargets.forEach(b => {
              if (b.id === 8 && groupRemaining.length > 0) return; // Skip 8 if not ready
              const dist = Math.sqrt(Math.pow(b.x - cue.x, 2) + Math.pow(b.y - cue.y, 2));
              if (dist < minDist) {
                  minDist = dist;
                  targetBall = b;
              }
          });
      }

      // 3. Execution
      if (targetBall) {
          const dx = targetBall.x - cue.x;
          const dy = targetBall.y - cue.y;
          const angle = Math.atan2(dy, dx);
          
          // Add slight randomness to simulate human error
          const error = (Math.random() - 0.5) * 0.05;
          const power = 15 + Math.random() * 10;

          cue.vx = Math.cos(angle + error) * power;
          cue.vy = Math.sin(angle + error) * power;
      } else {
          // Break shot or random
          cue.vx = 20;
          cue.vy = (Math.random() - 0.5) * 2;
      }

      // Reset Analysis for turn
      turnAnalysis.current = { firstContactId: null, pottedInTurn: [], railHit: false };
      setIsMoving(true);
      playSFX('dice'); // Reusing a sound for hit
  };

  // --- INPUT HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (turn !== 'me' || isMoving) return;
      
      if (ballInHand) {
          // Placement Logic
          const rect = tableRef.current?.getBoundingClientRect();
          if (rect) {
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              // Check bounds
              if (x > BALL_RADIUS && x < TABLE_WIDTH - BALL_RADIUS && y > BALL_RADIUS && y < TABLE_HEIGHT - BALL_RADIUS) {
                   // Ensure no overlap with existing balls
                   const overlap = ballsRef.current.some(b => b.id !== 0 && !b.isPotted && Math.sqrt(Math.pow(b.x - x, 2) + Math.pow(b.y - y, 2)) < BALL_RADIUS * 2);
                   if (!overlap) {
                       ballsRef.current[0].x = x;
                       ballsRef.current[0].y = y;
                       setBalls([...ballsRef.current]);
                       setBallInHand(false);
                       addLog("Cue ball placed", "secure");
                   } else {
                       addLog("Invalid Placement", "alert");
                   }
              }
          }
          return;
      }

      setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (turn !== 'me' || balls.length === 0) return;
      
      const rect = tableRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const cueBall = balls[0];
      if (!cueBall || cueBall.isPotted) return;

      if (ballInHand && !isMoving) {
          // Ghost ball preview logic could go here
          return;
      }

      const dx = mouseX - cueBall.x;
      const dy = mouseY - cueBall.y;
      const angle = Math.atan2(dy, dx);
      setCueAngle(angle);

      if (isDragging) {
          const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 200);
          setPower((dist / 200) * 100);
      }
  };

  const handleMouseUp = () => {
      if (isDragging) {
          shoot();
      }
      setIsDragging(false);
      setPower(0);
  };

  const shoot = () => {
      if (power < 5 || ballsRef.current.length === 0) return;
      
      const velocity = (power / 100) * 28; // Max power
      const shootAngle = cueAngle + Math.PI; 
      
      ballsRef.current[0].vx = Math.cos(shootAngle) * velocity;
      ballsRef.current[0].vy = Math.sin(shootAngle) * velocity;
      
      // Reset Analysis
      turnAnalysis.current = { firstContactId: null, pottedInTurn: [], railHit: false };
      
      setIsMoving(true);
      playSFX('dice'); // Hit sound
      addLog("Shot taken", "secure");
  };

  const getBallColor = (id: number) => {
      if (id === 0) return 'bg-slate-100'; // Cue
      if (id === 8) return 'bg-black';
      if (id < 8) return ['bg-yellow-500', 'bg-blue-600', 'bg-red-600', 'bg-purple-600', 'bg-orange-600', 'bg-green-600', 'bg-red-800'][id-1];
      return ['bg-yellow-300', 'bg-blue-400', 'bg-red-400', 'bg-purple-400', 'bg-orange-400', 'bg-green-400', 'bg-red-900'][id-9];
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* FORFEIT MODAL */}
        <AnimatePresence>
          {showForfeitModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowForfeitModal(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-royal-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl overflow-hidden"
                  >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>
                      <div className="flex flex-col items-center text-center mb-6">
                          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                              <AlertTriangle className="text-red-500" size={32} />
                          </div>
                          <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                          <p className="text-sm text-slate-400">
                              Leaving now will result in an <span className="text-red-400 font-bold">immediate loss</span>.
                          </p>
                      </div>
                      <div className="flex gap-3">
                          <button 
                            onClick={() => setShowForfeitModal(false)}
                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors"
                          >
                              Stay
                          </button>
                          <button 
                            onClick={() => onGameEnd('quit')}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors"
                          >
                              Forfeit
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

        {/* Header */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-6 mt-4">
             <button onClick={() => setShowForfeitModal(true)} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
             </button>
             <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
             </div>
             <div className="w-40 hidden md:block">
                 <AIReferee externalLog={refereeLog} />
             </div>
        </div>

        {/* Game Area */}
        <div className="relative w-[800px] h-[400px] max-w-full aspect-[2/1] bg-[#1a472a] rounded-xl border-[16px] border-[#3e2723] shadow-2xl overflow-hidden select-none cursor-crosshair"
             ref={tableRef}
             onMouseDown={handleMouseDown}
             onMouseMove={handleMouseMove}
             onMouseUp={handleMouseUp}
             onTouchStart={() => handleMouseDown({ clientX: 0, clientY: 0 } as any)} 
        >
            {/* Felt Texture */}
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] pointer-events-none"></div>
            
            {/* Pockets */}
            {POCKETS.map((p, i) => (
                <div key={i} className="absolute w-12 h-12 bg-black rounded-full shadow-inner border border-[#2d1b18]" style={{ left: p.x - 24, top: p.y - 24 }}></div>
            ))}

            {/* Balls */}
            {balls.map(b => !b.isPotted && (
                <div 
                    key={b.id}
                    className={`absolute rounded-full shadow-[2px_2px_4px_rgba(0,0,0,0.5)] flex items-center justify-center ${getBallColor(b.id)}`}
                    style={{ 
                        left: b.x - BALL_RADIUS, 
                        top: b.y - BALL_RADIUS, 
                        width: BALL_RADIUS * 2, 
                        height: BALL_RADIUS * 2 
                    }}
                >
                    {b.id > 8 && (
                        <div className="absolute inset-x-0 top-1 bottom-1 bg-white transform -skew-x-12 opacity-90"></div>
                    )}
                    {b.id !== 0 && (
                        <div className="relative z-10 w-3 h-3 bg-white rounded-full flex items-center justify-center text-[8px] font-bold text-black">
                            {b.id}
                        </div>
                    )}
                    <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 bg-white rounded-full opacity-60"></div>
                </div>
            ))}

            {/* Cue Stick */}
            {turn === 'me' && !isMoving && !ballInHand && balls.length > 0 && !balls[0].isPotted && (
                <div 
                    className="absolute h-2 bg-[#d2b48c] origin-left shadow-lg pointer-events-none"
                    style={{
                        width: '300px',
                        left: balls[0].x,
                        top: balls[0].y,
                        transform: `rotate(${cueAngle}rad) translate(${BALL_RADIUS + 15 + (isDragging ? power : 0)}px, -50%)`,
                    }}
                >
                    <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400"></div>
                    <div className="absolute right-0 top-0 bottom-0 w-20 bg-[#3e2723]"></div>
                </div>
            )}
            
            {/* Guide Line */}
            {turn === 'me' && !isMoving && isDragging && balls.length > 0 && !balls[0].isPotted && (
                <div 
                    className="absolute h-0.5 bg-white/40 origin-left pointer-events-none"
                    style={{
                         width: '120px',
                         left: balls[0].x,
                         top: balls[0].y,
                         transform: `rotate(${cueAngle + Math.PI}rad)`,
                    }}
                />
            )}

            {/* Ball In Hand Indicator */}
            {ballInHand && turn === 'me' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 text-white px-4 py-2 rounded-xl backdrop-blur-sm animate-pulse border border-white/20">
                        <MousePointer2 className="inline mr-2" size={16} />
                        Place Cue Ball
                    </div>
                </div>
            )}
        </div>

        {/* HUD */}
        <div className="w-full max-w-4xl mt-6 grid grid-cols-3 gap-4">
             {/* Player 1 */}
            <div className={`glass-panel p-4 rounded-xl border transition-colors ${turn === 'me' ? 'border-gold-500/50 bg-royal-800' : 'border-white/5'}`}>
                <div className="flex items-center gap-3 mb-2">
                    <img src={user.avatar} className="w-10 h-10 rounded-full border border-gold-400" />
                    <div>
                        <div className="font-bold text-white text-sm">You</div>
                        <div className="text-xs text-slate-400">{myGroup ? myGroup.toUpperCase() : 'OPEN'}</div>
                    </div>
                </div>
                {/* Balls Potted */}
                <div className="flex gap-1 h-4">
                    {balls.filter(b => b.isPotted && b.id !== 0 && b.id !== 8 && ((myGroup === 'solids' && b.id < 8) || (myGroup === 'stripes' && b.id > 8))).map(b => (
                        <div key={b.id} className={`w-4 h-4 rounded-full ${getBallColor(b.id)}`}></div>
                    ))}
                </div>
            </div>

            {/* Status */}
            <div className="flex flex-col items-center justify-center">
                <div className="text-gold-400 font-bold uppercase tracking-wider text-xs mb-1">Status</div>
                <div className="text-white font-display font-bold text-lg text-center leading-tight">{message}</div>
                {turn === 'me' && isDragging && (
                    <div className="w-full h-2 bg-royal-900 rounded-full mt-2 overflow-hidden border border-white/10">
                        <div className="h-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-75" style={{ width: `${power}%` }}></div>
                    </div>
                )}
            </div>

             {/* Opponent */}
             <div className={`glass-panel p-4 rounded-xl border transition-colors ${turn === 'opponent' ? 'border-red-500/50 bg-royal-800' : 'border-white/5'}`}>
                <div className="flex items-center justify-end gap-3 mb-2">
                    <div className="text-right">
                        <div className="font-bold text-white text-sm">{table.host?.name || "Opponent"}</div>
                        <div className="text-xs text-slate-400">{myGroup ? (myGroup === 'solids' ? 'STRIPES' : 'SOLIDS') : 'OPEN'}</div>
                    </div>
                    <img src={table.host?.avatar || "https://i.pravatar.cc/150"} className="w-10 h-10 rounded-full border border-red-400" />
                </div>
                 {/* Balls Potted (Opponent) */}
                 <div className="flex gap-1 h-4 justify-end">
                    {balls.filter(b => b.isPotted && b.id !== 0 && b.id !== 8 && ((myGroup === 'solids' && b.id > 8) || (myGroup === 'stripes' && b.id < 8))).map(b => (
                        <div key={b.id} className={`w-4 h-4 rounded-full ${getBallColor(b.id)}`}></div>
                    ))}
                </div>
            </div>
        </div>

    </div>
  );
};
