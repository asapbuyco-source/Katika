
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Target, Shield, AlertTriangle, Disc, MousePointer2, Construction } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { motion, AnimatePresence } from 'framer-motion';

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

// Table Constants (Percentage based for responsiveness)
const TABLE_WIDTH = 800; 
const TABLE_HEIGHT = 400;
const BALL_RADIUS = 10;
const POCKET_RADIUS = 18;
const FRICTION = 0.985;
const VELOCITY_THRESHOLD = 0.05;

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
  const [gameStatus, setGameStatus] = useState<'playing' | 'foul' | 'won' | 'lost'>('playing');
  const [message, setMessage] = useState("Your Break!");
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [ballInHand, setBallInHand] = useState(false);

  // Refs for physics loop
  const ballsRef = useRef<Ball[]>([]);
  const animationRef = useRef<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    if (user.isAdmin) {
        resetRack();
    }
  }, [user.isAdmin]);

  const resetRack = () => {
    const newBalls: Ball[] = [];
    
    // Cue Ball
    newBalls.push({ id: 0, x: 200, y: 200, vx: 0, vy: 0, isPotted: false });

    // Rack (Triangle formation starting at x=600)
    let startX = 550;
    let startY = 200;
    // Standard Rack Pattern (Approximate for visual)
    // Row 1
    newBalls.push({ id: 1, x: startX, y: startY, vx: 0, vy: 0, isPotted: false });
    // Row 2
    newBalls.push({ id: 10, x: startX + 18, y: startY - 11, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 2, x: startX + 18, y: startY + 11, vx: 0, vy: 0, isPotted: false });
    // Row 3 (8 Ball in center)
    newBalls.push({ id: 9, x: startX + 36, y: startY - 22, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 8, x: startX + 36, y: startY, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 3, x: startX + 36, y: startY + 22, vx: 0, vy: 0, isPotted: false });
    // Row 4
    newBalls.push({ id: 11, x: startX + 54, y: startY - 33, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 7, x: startX + 54, y: startY - 11, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 14, x: startX + 54, y: startY + 11, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 4, x: startX + 54, y: startY + 33, vx: 0, vy: 0, isPotted: false });
    // Row 5
    newBalls.push({ id: 5, x: startX + 72, y: startY - 44, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 12, x: startX + 72, y: startY - 22, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 15, x: startX + 72, y: startY, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 6, x: startX + 72, y: startY + 22, vx: 0, vy: 0, isPotted: false });
    newBalls.push({ id: 13, x: startX + 72, y: startY + 44, vx: 0, vy: 0, isPotted: false });

    ballsRef.current = newBalls;
    setBalls(newBalls);
  };

  // --- PHYSICS LOOP ---
  const updatePhysics = useCallback(() => {
    let moving = false;
    let pottedThisFrame: number[] = [];

    const updatedBalls = ballsRef.current.map(ball => {
        if (ball.isPotted) return ball;

        // Apply Velocity
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Friction
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;

        // Stop if slow
        if (Math.abs(ball.vx) < VELOCITY_THRESHOLD) ball.vx = 0;
        if (Math.abs(ball.vy) < VELOCITY_THRESHOLD) ball.vy = 0;

        if (ball.vx !== 0 || ball.vy !== 0) moving = true;

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
                pottedThisFrame.push(ball.id);
            }
        }

        return ball;
    });

    // Ball-to-Ball Collisions
    for (let i = 0; i < updatedBalls.length; i++) {
        for (let j = i + 1; j < updatedBalls.length; j++) {
            const b1 = updatedBalls[i];
            const b2 = updatedBalls[j];
            if (b1.isPotted || b2.isPotted) continue;

            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < BALL_RADIUS * 2) {
                // Collision Normal
                const nx = dx / dist;
                const ny = dy / dist;

                // Relative Velocity
                const dvx = b1.vx - b2.vx;
                const dvy = b1.vy - b2.vy;
                const dot = dvx * nx + dvy * ny;

                if (dot > 0) {
                    // Impulse
                    b1.vx -= dot * nx;
                    b1.vy -= dot * ny;
                    b2.vx += dot * nx;
                    b2.vy += dot * ny;

                    // Separate to prevent sticking
                    const overlap = BALL_RADIUS * 2 - dist;
                    b1.x -= overlap * nx * 0.5;
                    b1.y -= overlap * ny * 0.5;
                    b2.x += overlap * nx * 0.5;
                    b2.y += overlap * ny * 0.5;
                }
            }
        }
    }

    ballsRef.current = updatedBalls;
    setBalls([...updatedBalls]);

    return { moving, pottedThisFrame };
  }, []);

  // --- GAME LOOP & TURN LOGIC ---
  const pottedInTurnRef = useRef<number[]>([]);

  useEffect(() => {
    if (isMoving) {
        animationRef.current = requestAnimationFrame(() => {
            const { moving, pottedThisFrame } = updatePhysics();
            
            if (pottedThisFrame.length > 0) {
                pottedInTurnRef.current.push(...pottedThisFrame);
            }

            if (!moving) {
                setIsMoving(false);
                handleTurnEnd();
            } else {
                // Keep loop going
                // Force re-render handled by setBalls in loop
            }
        });
    }
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isMoving, updatePhysics]);

  const handleTurnEnd = () => {
      const potted = pottedInTurnRef.current;
      const cuePotted = potted.includes(0);
      const eightPotted = potted.includes(8);
      
      let nextTurn = turn;
      let foul = false;

      // Handle Cue Ball Pot (Scratch)
      if (cuePotted) {
          foul = true;
          setBallInHand(true);
          // Respawn Cue Ball
          ballsRef.current[0].isPotted = false;
          ballsRef.current[0].x = 200;
          ballsRef.current[0].y = 200;
          ballsRef.current[0].vx = 0;
          ballsRef.current[0].vy = 0;
          setBalls([...ballsRef.current]);
          addLog("Scratch! Ball in Hand", "alert");
      }

      // Handle 8 Ball
      if (eightPotted) {
          if (cuePotted) {
              // Scratch on 8 ball = Loss
              setGameStatus('lost');
              onGameEnd('loss');
              return;
          }
          
          // Check if group cleared
          const myBalls = ballsRef.current.filter(b => 
              !b.isPotted && b.id !== 0 && b.id !== 8 && 
              ((myGroup === 'solids' && b.id < 8) || (myGroup === 'stripes' && b.id > 8))
          );
          
          if (myBalls.length === 0 && myGroup) {
               setGameStatus('won');
               onGameEnd('win');
               return;
          } else {
              // Early 8 ball = Loss
              setGameStatus('lost');
              onGameEnd('loss');
              return;
          }
      }

      // Assign Groups
      if (!myGroup && potted.length > 0 && !foul) {
          const firstId = potted.find(id => id !== 0 && id !== 8);
          if (firstId) {
              const isSolid = firstId < 8;
              if (turn === 'me') {
                  setMyGroup(isSolid ? 'solids' : 'stripes');
                  setMessage(`You are ${isSolid ? 'Solids' : 'Stripes'}`);
              } else {
                  setMyGroup(isSolid ? 'stripes' : 'solids');
              }
          }
      }

      // Turn Switching Logic
      if (foul) {
          nextTurn = turn === 'me' ? 'opponent' : 'me';
          setMessage("Foul! Opponent's Turn");
      } else if (potted.length === 0) {
          nextTurn = turn === 'me' ? 'opponent' : 'me';
          setMessage(nextTurn === 'me' ? "Your Turn" : "Opponent's Turn");
      } else {
          // Potted legal ball?
          // Simplified: If you pot anything except cue, go again
          // Real rules: Must pot YOUR group.
          const validPot = potted.some(id => 
              id !== 0 && 
              (!myGroup || (myGroup === 'solids' && id < 8) || (myGroup === 'stripes' && id > 8))
          );
          
          if (validPot) {
             setMessage("Good Shot! Go Again.");
          } else {
             nextTurn = turn === 'me' ? 'opponent' : 'me'; 
             setMessage("Wrong Ball! Turn Over.");
          }
      }

      setTurn(nextTurn);
      pottedInTurnRef.current = [];

      // If Bot turn, simulate shot
      if (nextTurn === 'opponent') {
          setTimeout(playBotShot, 1500);
      }
  };

  const playBotShot = () => {
      addLog("Bot calculating trajectory...", "scanning");
      setTimeout(() => {
          if (ballsRef.current.length === 0) return;
          const cue = ballsRef.current[0];
          // Random shot towards center or a random ball
          const angle = Math.random() * Math.PI * 2;
          const pwr = 15 + Math.random() * 15;
          
          cue.vx = Math.cos(angle) * pwr;
          cue.vy = Math.sin(angle) * pwr;
          
          setIsMoving(true);
          setBalls([...ballsRef.current]);
          addLog("Bot shot taken", "secure");
      }, 1000);
  };

  // --- INPUT HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (turn !== 'me' || isMoving || gameStatus !== 'playing') return;
      
      if (ballInHand) {
          // Place ball logic could go here, simplified to click-to-place
          const rect = tableRef.current?.getBoundingClientRect();
          if (rect && ballsRef.current.length > 0) {
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              // Check bounds
              if (x > BALL_RADIUS && x < TABLE_WIDTH - BALL_RADIUS && y > BALL_RADIUS && y < TABLE_HEIGHT - BALL_RADIUS) {
                   ballsRef.current[0].x = x;
                   ballsRef.current[0].y = y;
                   setBalls([...ballsRef.current]);
                   setBallInHand(false);
                   addLog("Cue ball placed", "secure");
              }
          }
          return;
      }

      setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (turn !== 'me') return;
      if (balls.length === 0) return;
      
      const rect = tableRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const cueBall = balls[0];
      if (!cueBall) return;

      const dx = mouseX - cueBall.x;
      const dy = mouseY - cueBall.y;
      const angle = Math.atan2(dy, dx);
      setCueAngle(angle);

      if (isDragging) {
          // Calculate power based on distance
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
      if (power < 5) return; // Too weak cancellation
      if (ballsRef.current.length === 0) return;
      
      const velocity = (power / 100) * 25; // Max velocity 25
      // Shoot AWAY from cursor, so invert angle
      const shootAngle = cueAngle + Math.PI; 
      
      ballsRef.current[0].vx = Math.cos(shootAngle) * velocity;
      ballsRef.current[0].vy = Math.sin(shootAngle) * velocity;
      
      setIsMoving(true);
      setBalls([...ballsRef.current]);
      addLog("Shot taken", "secure");
  };

  const getBallColor = (id: number) => {
      if (id === 0) return 'bg-slate-100'; // Cue
      if (id === 8) return 'bg-black';
      if (id < 8) return ['bg-yellow-500', 'bg-blue-600', 'bg-red-600', 'bg-purple-600', 'bg-orange-600', 'bg-green-600', 'bg-red-800'][id-1];
      return ['bg-yellow-300', 'bg-blue-400', 'bg-red-400', 'bg-purple-400', 'bg-orange-400', 'bg-green-400', 'bg-red-900'][id-9];
  };

  // --- RESTRICTED ACCESS ---
  if (!user.isAdmin) {
      return (
        <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="glass-panel p-8 rounded-3xl border border-white/10 max-w-md w-full relative overflow-hidden">
             {/* Background Effects */}
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500"></div>
             
             <div className="mb-6 flex justify-center relative">
                 <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full animate-pulse"></div>
                 <div className="w-24 h-24 bg-royal-900 rounded-full flex items-center justify-center border-2 border-blue-500/50 shadow-xl relative z-10">
                     <Construction size={40} className="text-blue-400" />
                 </div>
             </div>
             
             <h2 className="text-3xl font-display font-bold text-white mb-3">Coming Soon</h2>
             <p className="text-slate-400 mb-8 leading-relaxed">
                 <span className="text-blue-400 font-bold">8-Ball Pool</span> is currently in beta. Our developers are fine-tuning the physics engine for the ultimate experience.
             </p>
             
             <div className="p-4 bg-royal-800/50 rounded-xl border border-white/5 mb-8">
                 <div className="flex items-center justify-between mb-2">
                     <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Access Status</span>
                     <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30 font-bold uppercase">Restricted</span>
                 </div>
                 <div className="flex items-center gap-3">
                     <Shield size={16} className="text-gold-400" />
                     <p className="text-xs text-slate-300 text-left">Only <span className="text-white font-bold">Vantage Admins</span> have early access to this prototype.</p>
                 </div>
             </div>
    
             <button 
                onClick={() => onGameEnd('quit')}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-2"
             >
                 <ArrowLeft size={18} /> Return to Lobby
             </button>
          </div>
        </div>
      );
  }

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
                              Your staked funds will be transferred to the opponent.
                          </p>
                      </div>
                      <div className="flex gap-3">
                          <button 
                            onClick={() => setShowForfeitModal(false)}
                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors"
                          >
                              Stay in Game
                          </button>
                          <button 
                            onClick={() => onGameEnd('quit')}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors"
                          >
                              Yes, Forfeit
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
                <span className="font-bold text-sm hidden md:inline">Forfeit</span>
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
        <div className="relative w-[800px] h-[400px] max-w-full aspect-[2/1] bg-[#1a472a] rounded-xl border-[16px] border-[#3e2723] shadow-2xl overflow-hidden select-none"
             ref={tableRef}
             onMouseDown={handleMouseDown}
             onMouseMove={handleMouseMove}
             onMouseUp={handleMouseUp}
             onTouchStart={() => handleMouseDown({ clientX: 0, clientY: 0 } as any)} // Basic touch prevention for dragging error
        >
            {/* Felt Texture */}
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] pointer-events-none"></div>
            
            {/* Pockets */}
            {POCKETS.map((p, i) => (
                <div key={i} className="absolute w-12 h-12 bg-black rounded-full shadow-inner border border-[#3e2723]" style={{ left: p.x - 24, top: p.y - 24 }}></div>
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
                    {/* Stripe Graphic */}
                    {b.id > 8 && (
                        <div className="absolute inset-x-0 top-1 bottom-1 bg-white transform -skew-x-12 opacity-80"></div>
                    )}
                    {/* Ball Number */}
                    {b.id !== 0 && (
                        <div className="relative z-10 w-3 h-3 bg-white rounded-full flex items-center justify-center text-[8px] font-bold text-black">
                            {b.id}
                        </div>
                    )}
                    {/* Shine */}
                    <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 bg-white rounded-full opacity-60"></div>
                </div>
            ))}

            {/* Cue Stick */}
            {turn === 'me' && !isMoving && !ballInHand && balls.length > 0 && (
                <div 
                    className="absolute h-2 bg-[#d2b48c] origin-left shadow-lg pointer-events-none"
                    style={{
                        width: '300px',
                        left: balls[0].x,
                        top: balls[0].y,
                        transform: `rotate(${cueAngle}rad) translate(${BALL_RADIUS + 10 + (isDragging ? power : 0)}px, -50%)`,
                    }}
                >
                    {/* Tip */}
                    <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400"></div>
                    {/* Handle */}
                    <div className="absolute right-0 top-0 bottom-0 w-20 bg-[#3e2723]"></div>
                </div>
            )}
            
            {/* Aim Guide (Simplified) */}
            {turn === 'me' && !isMoving && isDragging && balls.length > 0 && (
                <div 
                    className="absolute h-0.5 bg-white/30 origin-left pointer-events-none"
                    style={{
                         width: '100px',
                         left: balls[0].x,
                         top: balls[0].y,
                         transform: `rotate(${cueAngle + Math.PI}rad)`,
                    }}
                />
            )}

            {/* Ball In Hand Indicator */}
            {ballInHand && turn === 'me' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 text-white px-4 py-2 rounded-xl backdrop-blur-sm animate-pulse">
                        <MousePointer2 className="inline mr-2" size={16} />
                        Tap to place Cue Ball
                    </div>
                </div>
            )}
        </div>

        {/* HUD */}
        <div className="w-full max-w-4xl mt-6 grid grid-cols-3 gap-4">
             {/* Player 1 */}
            <div className={`glass-panel p-4 rounded-xl border ${turn === 'me' ? 'border-gold-500/50 bg-royal-800' : 'border-white/5'}`}>
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
                <div className="text-gold-400 font-bold uppercase tracking-wider text-xs mb-1">Match Status</div>
                <div className="text-white font-display font-bold text-lg text-center leading-tight">{message}</div>
                {turn === 'me' && isDragging && (
                    <div className="w-full h-2 bg-royal-900 rounded-full mt-2 overflow-hidden border border-white/10">
                        <div className="h-full bg-gradient-to-r from-green-500 to-red-500" style={{ width: `${power}%` }}></div>
                    </div>
                )}
            </div>

             {/* Opponent */}
             <div className={`glass-panel p-4 rounded-xl border ${turn === 'opponent' ? 'border-red-500/50 bg-royal-800' : 'border-white/5'}`}>
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
