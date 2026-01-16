
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Dice5, Lock, RotateCcw, Crown, Star, User as UserIcon, Zap, Shield, AlertTriangle } from 'lucide-react';
import { Table, AIRefereeLog, User } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';

interface GameRoomProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

// --- CONSTANTS ---

const COLORS = ['Red', 'Green', 'Yellow', 'Blue'] as const;
type PlayerColor = typeof COLORS[number];

interface Piece {
  id: number;
  color: PlayerColor;
  status: 'BASE' | 'ACTIVE' | 'FINISHED';
  stepsMoved: number; // 0 = Base, 1 = Start Cell, 51 = End of Main Track, 57 = Home
}

// Coordinate mapping for the 52-step main track
// 0,0 is Top Left
const TRACK_PATH: {r: number, c: number}[] = [
    // Red Leg (Left)
    {r:6,c:1}, {r:6,c:2}, {r:6,c:3}, {r:6,c:4}, {r:6,c:5}, 
    // Blue Leg (Top) - going up left side
    {r:5,c:6}, {r:4,c:6}, {r:3,c:6}, {r:2,c:6}, {r:1,c:6}, {r:0,c:6},
    {r:0,c:7}, {r:0,c:8}, // Top Turn
    // Blue Leg (Top) - going down right side
    {r:1,c:8}, {r:2,c:8}, {r:3,c:8}, {r:4,c:8}, {r:5,c:8}, {r:6,c:8},
    // Green Leg (Right)
    {r:6,c:9}, {r:6,c:10}, {r:6,c:11}, {r:6,c:12}, {r:6,c:13}, {r:6,c:14},
    {r:7,c:14}, {r:8,c:14}, // Right Turn
    // Green Leg (Right) - going left bottom side
    {r:8,c:13}, {r:8,c:12}, {r:8,c:11}, {r:8,c:10}, {r:8,c:9}, {r:8,c:8},
    // Yellow Leg (Bottom)
    {r:9,c:8}, {r:10,c:8}, {r:11,c:8}, {r:12,c:8}, {r:13,c:8}, {r:14,c:8},
    {r:14,c:7}, {r:14,c:6}, // Bottom Turn
    // Yellow Leg (Bottom) - going up left side
    {r:13,c:6}, {r:12,c:6}, {r:11,c:6}, {r:10,c:6}, {r:9,c:6}, {r:8,c:6},
    // Red Leg (Left) - going left bottom side
    {r:8,c:5}, {r:8,c:4}, {r:8,c:3}, {r:8,c:2}, {r:8,c:1}, {r:8,c:0},
    {r:7,c:0} // Last step
];

// Start offsets index in TRACK_PATH
const START_OFFSETS: Record<PlayerColor, number> = {
    Red: 0,     // Starts at 6,1
    Green: 13,  // Starts at 1,8
    Yellow: 26, // Starts at 8,13
    Blue: 39    // Starts at 13,6
};

// Home Run Paths (steps 52-57)
const HOME_RUNS: Record<PlayerColor, {r: number, c: number}[]> = {
    Red:    [{r:7,c:1}, {r:7,c:2}, {r:7,c:3}, {r:7,c:4}, {r:7,c:5}, {r:7,c:6}],
    Green:  [{r:1,c:7}, {r:2,c:7}, {r:3,c:7}, {r:4,c:7}, {r:5,c:7}, {r:6,c:7}], 
    Yellow: [{r:7,c:13}, {r:7,c:12}, {r:7,c:11}, {r:7,c:10}, {r:7,c:9}, {r:7,c:8}],
    Blue:   [{r:13,c:7}, {r:12,c:7}, {r:11,c:7}, {r:10,c:7}, {r:9,c:7}, {r:8,c:7}]
};

// Safe Spots (Stars) - Coordinates string "r,c"
const SAFE_SPOTS = new Set([
  "6,1", "2,6", "1,8", "6,12", "8,13", "12,8", "13,6", "8,2"
]);

const RollingDie = () => (
    <motion.div
        animate={{ 
            rotateX: [0, 360, 720, 1080], 
            rotateY: [0, 360, 720, 1080],
            scale: [1, 0.8, 1.1, 1] 
        }}
        transition={{ duration: 1, ease: "easeInOut" }}
        className="w-10 h-10 md:w-14 md:h-14 bg-white rounded-lg md:rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.5)] border-2 border-slate-200 flex items-center justify-center overflow-hidden"
    >
        <div className="grid grid-cols-2 gap-1 md:gap-2 p-1">
             <div className="w-2 h-2 md:w-3 md:h-3 bg-black rounded-full" />
             <div className="w-2 h-2 md:w-3 md:h-3 bg-black rounded-full" />
             <div className="w-2 h-2 md:w-3 md:h-3 bg-black rounded-full" />
             <div className="w-2 h-2 md:w-3 md:h-3 bg-black rounded-full" />
        </div>
    </motion.div>
);

export const GameRoom: React.FC<GameRoomProps> = ({ table, user, onGameEnd }) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [turn, setTurn] = useState<PlayerColor>('Red');
  const [dice, setDice] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [winner, setWinner] = useState<PlayerColor | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  // Initialize Pieces
  useEffect(() => {
    const initial: Piece[] = [];
    COLORS.forEach(c => {
        for(let i=0; i<4; i++) initial.push({ id: initial.length, color: c, status: 'BASE', stepsMoved: 0 });
    });
    setPieces(initial);
  }, []);

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // --- LOGIC ---

  const getCoordinates = (p: Piece) => {
      // 1. Base
      if (p.status === 'BASE') {
          // Visual positioning within the 6x6 base squares
          const baseOffsets: Record<PlayerColor, {r:number, c:number}> = {
              Red: {r:1, c:1}, Green: {r:1, c:10}, Yellow: {r:10, c:10}, Blue: {r:10, c:1}
          };
          const base = baseOffsets[p.color];
          // Distribute 4 pieces in 2x2 grid inside the base
          const rOff = Math.floor((p.id % 4) / 2) * 3; // 0 or 3 spacing
          const cOff = ((p.id % 4) % 2) * 3;
          return { r: base.r + (rOff === 0 ? 0.5 : 2.5), c: base.c + (cOff === 0 ? 0.5 : 2.5) }; 
          // Note: The base render logic handles the visual container, we just need coordinates for the piece animation if we use absolute positioning. 
          // For the grid approach, we render pieces IN the cells.
          // BUT, Base pieces are special. We will render them absolutely over the board for smoother animation.
      }
      
      // 2. Finished
      if (p.status === 'FINISHED') return { r: 7, c: 7 };

      // 3. Home Run
      if (p.stepsMoved > 51) {
          const idx = Math.min(p.stepsMoved - 52, 5);
          return HOME_RUNS[p.color][idx];
      }

      // 4. Track
      const trackIdx = (START_OFFSETS[p.color] + p.stepsMoved - 1) % 52;
      return TRACK_PATH[trackIdx];
  };

  const handleRoll = () => {
      if (rolling || dice || winner) return;
      setRolling(true);
      playSFX('dice');
      
      setTimeout(() => {
          const val = Math.floor(Math.random() * 6) + 1;
          setDice(val);
          setRolling(false);
          
          // Check for valid moves
          const hasMove = pieces.some(p => p.color === turn && canMove(p, val));
          if (!hasMove) {
              addLog(`${turn} rolled ${val} - No Move`, 'alert');
              setTimeout(() => nextTurn(val === 6), 1000);
          } else {
              addLog(`${turn} rolled ${val}`, 'secure');
          }
      }, 1000); // 1 Second Rolling Animation
  };

  const canMove = (p: Piece, roll: number) => {
      if (p.color !== turn) return false;
      if (p.status === 'FINISHED') return false;
      if (p.status === 'BASE') return roll === 6;
      if (p.stepsMoved + roll > 57) return false;
      return true;
  };

  const movePiece = (p: Piece) => {
      if (!dice || !canMove(p, dice)) return;
      
      let newStatus = p.status;
      let newSteps = p.stepsMoved;

      if (p.status === 'BASE') {
          newStatus = 'ACTIVE';
          newSteps = 1;
          playSFX('move');
      } else {
          newSteps += dice;
          if (newSteps === 57) {
              newStatus = 'FINISHED';
              playSFX('win'); // Mini celebration for finishing a piece
          } else {
              playSFX('move');
          }
      }

      setPieces(prev => {
          const next = prev.map(item => item.id === p.id ? { ...item, status: newStatus as any, stepsMoved: newSteps } : item);
          
          // Capture Logic
          if (newStatus !== 'FINISHED' && newStatus !== 'BASE') {
              const myCoords = getCoordinates({ ...p, status: newStatus as any, stepsMoved: newSteps });
              const isSafe = SAFE_SPOTS.has(`${myCoords.r},${myCoords.c}`);
              
              if (!isSafe) {
                  const enemies = next.filter(e => 
                      e.color !== turn && e.status === 'ACTIVE'
                  );
                  
                  enemies.forEach(e => {
                      const eCoords = getCoordinates(e);
                      if (eCoords.r === myCoords.r && eCoords.c === myCoords.c) {
                          e.status = 'BASE';
                          e.stepsMoved = 0;
                          addLog(`Captured ${e.color}!`, 'alert');
                          playSFX('capture');
                      }
                  });
              }
          }
          return next;
      });

      // Win Check
      // We check outside after state update usually, but for sim:
      // ...

      setTimeout(() => nextTurn(dice === 6), 600);
  };

  const nextTurn = (extra: boolean) => {
      setDice(null);
      if (!extra) {
          const idx = COLORS.indexOf(turn);
          setTurn(COLORS[(idx + 1) % 4]);
          playSFX('turn');
      }
  };

  // --- RENDER HELPERS ---

  // We render the board as a single 15x15 grid with gap-px for lines
  // The 'Bases' and 'Center' will be absolutely positioned overlays or spanned cells
  const renderGrid = () => {
      const cells = [];
      for (let r = 0; r < 15; r++) {
          for (let c = 0; c < 15; c++) {
              let bg = "bg-white";
              let content = null;

              // BASE ZONES (Skip rendering individual cells, handled by overlays)
              if ((r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c < 6) || (r > 8 && c > 8)) {
                  bg = "bg-transparent"; 
                  // actually we need to render them as empty or handle in overlay
                  // Let's make them transparent placeholders
                  if ((r===0&&c===0) || (r===0&&c===9) || (r===9&&c===0) || (r===9&&c===9)) {
                      // These act as anchors for the bases if we used grid areas, 
                      // but simpler to just leave them empty in the grid flow
                  }
              }
              // CENTER ZONE
              else if (r > 5 && r < 9 && c > 5 && c < 9) {
                  bg = "bg-transparent"; 
              }
              // TRACKS
              else {
                  // Colored Home Runs
                  if (r===7 && c>0 && c<6) bg = "bg-cam-red";
                  if (c===7 && r>0 && r<6) bg = "bg-cam-green";
                  if (r===7 && c>8 && c<14) bg = "bg-cam-yellow";
                  if (c===7 && r>8 && r<14) bg = "bg-[#2563eb]"; // Blue

                  // Start Squares
                  if (r===6 && c===1) bg = "bg-cam-red";
                  if (r===1 && c===8) bg = "bg-cam-green";
                  if (r===8 && c===13) bg = "bg-cam-yellow";
                  if (r===13 && c===6) bg = "bg-[#2563eb]";

                  // Stars
                  if (SAFE_SPOTS.has(`${r},${c}`)) {
                      // Don't draw star on colored home runs
                      const isColored = (r===7&&c>0&&c<6) || (c===7&&r>0&&r<6) || (r===7&&c>8&&c<14) || (c===7&&r>8&&r<14);
                      if (!isColored) {
                          content = <Star size={10} className="text-slate-300 w-2 h-2 md:w-3 md:h-3" fill="currentColor" />;
                      }
                  }
              }

              cells.push(
                  <div key={`${r}-${c}`} className={`${bg} relative flex items-center justify-center`} onClick={() => {}}>
                      {content}
                  </div>
              );
          }
      }
      return cells;
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-start md:justify-center p-4 pb-24 md:pb-4 pt-8 md:pt-4">
      
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
                      {/* Red Glow */}
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
                            onClick={() => { setShowForfeitModal(false); playSFX('click'); }}
                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors"
                          >
                              Stay in Game
                          </button>
                          <button 
                            onClick={() => { onGameEnd('quit'); playSFX('click'); }}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors"
                          >
                              Yes, Forfeit
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* HEADER */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-4 md:mb-6">
         <button onClick={() => { setShowForfeitModal(true); playSFX('click'); }} className="text-slate-400 hover:text-white flex items-center gap-2 flex-shrink-0">
            <ArrowLeft size={20} /> <span className="hidden md:inline">Leave Table</span>
         </button>
         <div className="flex flex-col items-center">
             <div className="text-gold-400 font-display font-bold text-lg md:text-xl flex items-center gap-2">
                 <Lock size={16} /> <span className="hidden md:inline">POT:</span> {(table.stake * 2).toLocaleString()}
             </div>
             <div className="text-[8px] md:text-[10px] text-slate-500 font-mono tracking-widest uppercase">
                 PROVABLY FAIR
             </div>
         </div>
         <div className="flex items-center gap-3">
             <div className="text-right hidden md:block">
                 <div className="text-xs text-slate-400">Current Turn</div>
                 <div className={`font-bold ${turn === 'Red' ? 'text-cam-red' : turn === 'Green' ? 'text-cam-green' : turn === 'Yellow' ? 'text-cam-yellow' : 'text-blue-500'}`}>
                     {turn.toUpperCase()}
                 </div>
             </div>
             <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full animate-pulse ${turn === 'Red' ? 'bg-cam-red' : turn === 'Green' ? 'bg-cam-green' : turn === 'Yellow' ? 'bg-cam-yellow' : 'bg-blue-500'}`} />
         </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-center w-full justify-center flex-1">
          
          {/* --- THE BOARD --- */}
          <div className="relative w-full max-w-[600px] aspect-square bg-royal-900 rounded-xl shadow-2xl p-1 md:p-2 border-4 border-royal-800">
              
              {/* THE GRID CONTAINER */}
              <div className="w-full h-full bg-slate-300 grid grid-cols-15 grid-rows-15 gap-px border border-slate-300">
                  {renderGrid()}
              </div>

              {/* OVERLAYS: BASES */}
              {/* TL: Red */}
              <div className="absolute top-[2%] left-[2%] w-[38%] h-[38%] bg-white p-[2%]">
                  <div className="w-full h-full bg-cam-red rounded-lg md:rounded-xl border-4 md:border-[6px] border-cam-red flex items-center justify-center relative shadow-inner">
                      <div className="w-full h-full bg-white rounded-md md:rounded-lg grid grid-cols-2 grid-rows-2 place-items-center">
                          {[0,1,2,3].map(i => <div key={i} className="w-3 h-3 md:w-8 md:h-8 rounded-full bg-cam-red/20 shadow-inner" />)}
                      </div>
                  </div>
              </div>
               {/* TR: Green */}
               <div className="absolute top-[2%] right-[2%] w-[38%] h-[38%] bg-white p-[2%]">
                  <div className="w-full h-full bg-cam-green rounded-lg md:rounded-xl border-4 md:border-[6px] border-cam-green flex items-center justify-center relative shadow-inner">
                      <div className="w-full h-full bg-white rounded-md md:rounded-lg grid grid-cols-2 grid-rows-2 place-items-center">
                          {[0,1,2,3].map(i => <div key={i} className="w-3 h-3 md:w-8 md:h-8 rounded-full bg-cam-green/20 shadow-inner" />)}
                      </div>
                  </div>
              </div>
               {/* BL: Blue */}
               <div className="absolute bottom-[2%] left-[2%] w-[38%] h-[38%] bg-white p-[2%]">
                  <div className="w-full h-full bg-[#2563eb] rounded-lg md:rounded-xl border-4 md:border-[6px] border-[#2563eb] flex items-center justify-center relative shadow-inner">
                      <div className="w-full h-full bg-white rounded-md md:rounded-lg grid grid-cols-2 grid-rows-2 place-items-center">
                          {[0,1,2,3].map(i => <div key={i} className="w-3 h-3 md:w-8 md:h-8 rounded-full bg-[#2563eb]/20 shadow-inner" />)}
                      </div>
                  </div>
              </div>
               {/* BR: Yellow */}
               <div className="absolute bottom-[2%] right-[2%] w-[38%] h-[38%] bg-white p-[2%]">
                  <div className="w-full h-full bg-cam-yellow rounded-lg md:rounded-xl border-4 md:border-[6px] border-cam-yellow flex items-center justify-center relative shadow-inner">
                      <div className="w-full h-full bg-white rounded-md md:rounded-lg grid grid-cols-2 grid-rows-2 place-items-center">
                          {[0,1,2,3].map(i => <div key={i} className="w-3 h-3 md:w-8 md:h-8 rounded-full bg-cam-yellow/20 shadow-inner" />)}
                      </div>
                  </div>
              </div>

              {/* OVERLAY: CENTER */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20%] h-[20%] bg-white">
                  <div className="w-full h-full relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-full bg-cam-red" style={{clipPath: 'polygon(0 0, 50% 50%, 0 100%)'}} />
                      <div className="absolute top-0 left-0 w-full h-full bg-cam-green" style={{clipPath: 'polygon(0 0, 100% 0, 50% 50%)'}} />
                      <div className="absolute top-0 left-0 w-full h-full bg-cam-yellow" style={{clipPath: 'polygon(100% 0, 100% 100%, 50% 50%)'}} />
                      <div className="absolute top-0 left-0 w-full h-full bg-[#2563eb]" style={{clipPath: 'polygon(100% 100%, 0 100%, 50% 50%)'}} />
                  </div>
              </div>

              {/* --- PIECES --- */}
              <div className="absolute inset-0 w-full h-full pointer-events-none">
                  {pieces.map(p => {
                      // Calculate position based on 15x15 grid
                      let {r, c} = getCoordinates(p);
                      
                      // Convert grid coord to %
                      // Board is 15x15.
                      const step = 100 / 15;
                      const top = r * step;
                      const left = c * step;

                      const isMovable = turn === p.color && dice !== null && canMove(p, dice);

                      return (
                          <motion.div
                              key={p.id}
                              layout
                              initial={false}
                              animate={{ top: `${top}%`, left: `${left}%` }}
                              transition={{ type: "spring", stiffness: 300, damping: 25 }}
                              className="absolute w-[6.66%] h-[6.66%] flex items-center justify-center pointer-events-auto z-20"
                              onClick={() => movePiece(p)}
                          >
                              <div className={`
                                  w-[80%] h-[80%] rounded-full shadow-md border-2 border-white relative
                                  ${p.color === 'Red' ? 'bg-cam-red' : p.color === 'Green' ? 'bg-cam-green' : p.color === 'Yellow' ? 'bg-cam-yellow' : 'bg-[#2563eb]'}
                                  ${isMovable ? 'cursor-pointer ring-2 md:ring-4 ring-gold-400 animate-pulse' : ''}
                                  ${p.status === 'FINISHED' ? 'opacity-0' : 'opacity-100'}
                              `}>
                                  {/* Gloss */}
                                  <div className="absolute top-1 left-1 w-1/3 h-1/3 bg-white rounded-full opacity-40" />
                              </div>
                          </motion.div>
                      );
                  })}
              </div>

          </div>

          {/* --- CONTROLS --- */}
          <div className="w-full max-w-[360px] md:max-w-xs space-y-4">
              <div className="hidden md:block">
                   <AIReferee externalLog={refereeLog} />
              </div>
              
              <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-row md:flex-col items-center justify-between md:justify-center gap-4">
                  <div className="flex flex-col items-start md:items-center">
                        <span className="text-xs text-slate-400">Status</span>
                        <div className="text-gold-400 font-bold uppercase text-sm md:text-base">
                            {dice ? "Move Piece" : rolling ? "Rolling..." : `${turn}'s Turn`}
                        </div>
                  </div>

                  <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleRoll}
                      disabled={rolling || (dice !== null)}
                      className={`w-16 h-16 md:w-24 md:h-24 rounded-2xl flex items-center justify-center transition-all shadow-xl
                          ${turn === 'Red' ? 'bg-gradient-to-br from-cam-red to-red-800 text-white' : 'bg-royal-800 text-slate-500 opacity-50'}
                      `}
                  >
                      {rolling ? (
                          <RollingDie />
                      ) : dice ? (
                          <motion.span 
                            initial={{ scale: 0, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-3xl md:text-5xl font-display font-bold"
                          >
                              {dice}
                          </motion.span>
                      ) : (
                          <div className="flex flex-col items-center gap-1">
                              <Dice5 size={24} className="md:w-8 md:h-8" />
                              <span className="text-[8px] md:text-[10px] font-bold uppercase">Roll</span>
                          </div>
                      )}
                  </motion.button>
              </div>

              {/* Player List */}
              <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                  {COLORS.map(c => {
                      // Determine who plays this color
                      let playerInfo = null;
                      if (c === 'Red') playerInfo = user;
                      else if (c === 'Green') playerInfo = table.host;
                      
                      return (
                      <div key={c} className={`flex items-center justify-between p-2 rounded-xl border transition-all ${turn === c ? 'bg-white/10 border-white/20 shadow-lg' : 'border-transparent opacity-60'}`}>
                          <div className="flex items-center gap-2 md:gap-3">
                              <div className="relative">
                                  <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-royal-800 border border-white/10 overflow-hidden flex items-center justify-center">
                                      {playerInfo ? (
                                          <img src={playerInfo.avatar} alt={playerInfo.name} className="w-full h-full object-cover" />
                                      ) : (
                                          <UserIcon size={12} className="text-slate-600 md:w-4 md:h-4" />
                                      )}
                                  </div>
                                  <div className={`absolute -bottom-1 -right-1 w-2 h-2 md:w-3 md:h-3 rounded-full border-2 border-royal-950 ${c === 'Red' ? 'bg-cam-red' : c === 'Green' ? 'bg-cam-green' : c === 'Yellow' ? 'bg-cam-yellow' : 'bg-[#2563eb]'}`} />
                              </div>
                              <div className="overflow-hidden">
                                  <div className="text-[10px] md:text-xs font-bold text-white leading-tight flex items-center gap-1 truncate">
                                    {c}
                                    {c === 'Red' && <span className="text-[8px] bg-gold-500/20 text-gold-400 px-1 rounded uppercase tracking-wider">You</span>}
                                  </div>
                                  <div className="text-[8px] md:text-[10px] text-slate-400 font-medium truncate max-w-[80px] md:max-w-none">
                                      {playerInfo ? playerInfo.name : 'Bot'}
                                  </div>
                              </div>
                          </div>
                      </div>
                  )})}
              </div>
          </div>

      </div>
    </div>
  );
};
