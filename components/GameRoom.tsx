
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Dice5, Shield, AlertTriangle, RotateCcw, Crown, Star } from 'lucide-react';
import { Table, AIRefereeLog, User } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { subscribeToGame, updateGameState, setGameResult } from '../services/firebase';

interface GameRoomProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

// --- TYPES ---
type PlayerColor = 'Red' | 'Yellow'; // Simplified to 2 players for clearer logic
interface Piece {
  id: number;
  color: PlayerColor;
  step: number; // -1: Base, 0-50: Track, 51-55: Home Path, 56: Goal
}

interface LudoGameState {
    pieces: Piece[];
    currentTurn: PlayerColor;
    diceValue: number | null;
    diceRolled: boolean;
    consecutiveSixes: number; // To prevent infinite turns (optional rule, usually 3 sixes = forfeit turn)
    winner: string | null;
}

// --- BOARD COORDINATES (15x15 Grid, 0-indexed) ---
// The main track is a loop of 52 squares.
// We define the path starting from Red's start square (index 0) and going clockwise.
const TRACK_PATH = [
    {x:1, y:6}, {x:2, y:6}, {x:3, y:6}, {x:4, y:6}, {x:5, y:6}, // 0-4
    {x:6, y:5}, {x:6, y:4}, {x:6, y:3}, {x:6, y:2}, {x:6, y:1}, {x:6, y:0}, // 5-10
    {x:7, y:0}, {x:8, y:0}, // 11-12 (Top Turn)
    {x:8, y:1}, {x:8, y:2}, {x:8, y:3}, {x:8, y:4}, {x:8, y:5}, {x:8, y:6}, // 13-18
    {x:9, y:6}, {x:10,y:6}, {x:11,y:6}, {x:12,y:6}, {x:13,y:6}, {x:14,y:6}, // 19-24
    {x:14,y:7}, {x:14,y:8}, // 25-26 (Right Turn - Yellow Start is 26)
    {x:13,y:8}, {x:12,y:8}, {x:11,y:8}, {x:10,y:8}, {x:9, y:8}, {x:8, y:8}, // 27-32
    {x:8, y:9}, {x:8, y:10}, {x:8, y:11}, {x:8, y:12}, {x:8, y:13}, {x:8, y:14}, // 33-38
    {x:7, y:14}, {x:6, y:14}, // 39-40 (Bottom Turn)
    {x:6, y:13}, {x:6, y:12}, {x:6, y:11}, {x:6, y:10}, {x:6, y:9}, {x:6, y:8}, // 41-46
    {x:5, y:8}, {x:4, y:8}, {x:3, y:8}, {x:2, y:8}, {x:1, y:8}, {x:0, y:8}, // 47-52
    {x:0, y:7} // 51 (Last step before Red Home) -- Wait, index 51 is (0,7). 
    // Correction: Path loop closes.
];
// Fix loop: 52 steps. Red Start=0. Yellow Start=26.
const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47]; // Global indices on the track

const HOME_PATHS = {
    Red:    [{x:1, y:7}, {x:2, y:7}, {x:3, y:7}, {x:4, y:7}, {x:5, y:7}, {x:6, y:7}], // 51 -> 52-56 -> Goal
    Yellow: [{x:13,y:7}, {x:12,y:7}, {x:11,y:7}, {x:10,y:7}, {x:9,y:7}, {x:8,y:7}], // 25 -> 52-56 -> Goal
};

// Start Offsets on the Track
const START_OFFSETS: Record<PlayerColor, number> = {
    Red: 0,
    Yellow: 26
};

// --- LOGIC HELPERS ---

const getTrackPosition = (color: PlayerColor, step: number) => {
    if (step === -1) return null; // Base
    if (step >= 51 && step <= 55) { // Home Straight (steps 51-55 relative to player)
        // Adjust for array index 0-5
        const index = step - 51;
        return HOME_PATHS[color][index];
    }
    if (step >= 56) return { x: 7, y: 7 }; // Goal Center

    // Main Track
    const offset = START_OFFSETS[color];
    const trackIndex = (offset + step) % 52;
    return TRACK_PATH[trackIndex];
};

const getGlobalTrackIndex = (color: PlayerColor, step: number) => {
    if (step < 0 || step > 50) return -1; // Not on main track
    return (START_OFFSETS[color] + step) % 52;
};

export const GameRoom: React.FC<GameRoomProps> = ({ table, user, onGameEnd }) => {
  const [gameState, setGameState] = useState<LudoGameState | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  
  // Identify players
  const isHost = table.host?.id === user.id || (table as any).host?.uid === user.id;
  const myColor: PlayerColor = isHost ? 'Red' : 'Yellow';
  const oppColor: PlayerColor = isHost ? 'Yellow' : 'Red';
  const isBotGame = (table as any).guest?.id === 'bot' || (table as any).host?.id === 'bot';

  // --- INIT ---
  useEffect(() => {
      // Subscribe to game state
      const unsubscribe = subscribeToGame(table.id, (data) => {
          if (data.status === 'completed' && data.winner) {
              onGameEnd(data.winner === user.id ? 'win' : 'loss');
              return;
          }

          if (data.gameState && data.gameState.pieces) {
              setGameState(data.gameState as LudoGameState);
          } else if (isHost) {
              // Initial State Setup
              const initialPieces: Piece[] = [];
              ['Red', 'Yellow'].forEach((c, cIdx) => {
                  for (let i = 0; i < 4; i++) {
                      initialPieces.push({ 
                          id: cIdx * 4 + i, 
                          color: c as PlayerColor, 
                          step: -1 
                      });
                  }
              });
              
              const newState: LudoGameState = {
                  pieces: initialPieces,
                  currentTurn: 'Red',
                  diceValue: null,
                  diceRolled: false,
                  consecutiveSixes: 0,
                  winner: null
              };
              updateGameState(table.id, newState);
          }
      });
      return () => unsubscribe();
  }, [table.id, user.id, isHost]);

  const addLog = (msg: string, status: 'secure' | 'alert' = 'secure') => {
      setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // --- GAME LOGIC ---

  const handleRollDice = async () => {
      if (!gameState || gameState.currentTurn !== myColor || gameState.diceRolled) return;
      await performRoll();
  };

  const performRoll = async () => {
      if (!gameState) return;
      playSFX('dice');
      const roll = Math.floor(Math.random() * 6) + 1;
      
      let nextConsecutive = gameState.consecutiveSixes;
      if (roll === 6) nextConsecutive++;
      else nextConsecutive = 0;

      // 3 Sixes Rule: Forfeit turn
      if (nextConsecutive === 3) {
          addLog("Three 6s! Turn forfeited.", "alert");
          const nextState = { ...gameState, diceValue: roll, diceRolled: true, consecutiveSixes: 0 };
          setGameState(nextState);
          await updateGameState(table.id, nextState);
          setTimeout(() => switchTurn(nextState), 1000);
          return;
      }

      const nextState = { ...gameState, diceValue: roll, diceRolled: true, consecutiveSixes: nextConsecutive };
      setGameState(nextState); // Optimistic
      await updateGameState(table.id, nextState);

      // Check for legal moves
      const myPieces = nextState.pieces.filter(p => p.color === nextState.currentTurn);
      const hasMove = myPieces.some(p => canMovePiece(p, roll));

      if (!hasMove) {
          addLog("No legal moves.", "secure");
          setTimeout(() => switchTurn(nextState), 1500);
      } else if (isBotGame && nextState.currentTurn === oppColor) {
          // Bot logic triggers after roll
          setTimeout(() => executeBotMove(nextState, roll), 1000);
      }
  };

  const canMovePiece = (p: Piece, roll: number): boolean => {
      if (p.step === 56) return false; // Already finished
      if (p.step === -1) return roll === 6; // Need 6 to start
      if (p.step + roll > 56) return false; // Overshoot goal
      return true;
  };

  const handlePieceClick = async (p: Piece) => {
      if (!gameState || !gameState.diceRolled || !gameState.diceValue) return;
      if (gameState.currentTurn !== myColor || p.color !== myColor) return;

      await movePiece(p, gameState.diceValue);
  };

  const movePiece = async (p: Piece, roll: number) => {
      if (!gameState) return;
      if (!canMovePiece(p, roll)) {
          if (p.color === myColor) playSFX('error');
          return;
      }

      playSFX('move');
      let newPieces = [...gameState.pieces];
      const pieceIndex = newPieces.findIndex(piece => piece.id === p.id);
      const movingPiece = newPieces[pieceIndex];

      // LOGIC: UPDATE STEP
      if (movingPiece.step === -1) {
          movingPiece.step = 0; // Enter track
          addLog("Piece entered track!", "secure");
      } else {
          movingPiece.step += roll;
      }

      // CHECK FINISH
      let pieceFinished = false;
      if (movingPiece.step === 56) {
          pieceFinished = true;
          playSFX('win');
          addLog(`${movingPiece.color} Piece Finished!`, "secure");
      }

      // CHECK COLLISION (Capture)
      let captured = false;
      if (!pieceFinished && movingPiece.step <= 50) {
          const myGlobalIdx = getGlobalTrackIndex(movingPiece.color, movingPiece.step);
          // Safety Check: Globe/Star spots are safe
          if (!SAFE_SPOTS.includes(myGlobalIdx)) {
              // Find opponent piece on same spot
              const victimIndex = newPieces.findIndex(vp => 
                  vp.color !== movingPiece.color && 
                  vp.step > -1 && vp.step <= 50 &&
                  getGlobalTrackIndex(vp.color, vp.step) === myGlobalIdx
              );

              if (victimIndex !== -1) {
                  // Capture!
                  newPieces[victimIndex].step = -1; // Send to base
                  captured = true;
                  playSFX('capture');
                  addLog("Piece Captured!", "alert");
              }
          }
      }

      // CHECK WIN CONDITION (Game Over)
      const myFinishedCount = newPieces.filter(np => np.color === movingPiece.color && np.step === 56).length;
      if (myFinishedCount === 4) {
          await setGameResult(table.id, user.id); // Or opponent depending on turn, simplified here
          return;
      }

      // DECIDE NEXT TURN
      // Bonus turn if: Rolled 6 OR Captured OR Finished Piece
      const bonusTurn = roll === 6 || captured || pieceFinished;
      
      if (bonusTurn) {
          // Same player rolls again
          const nextState = {
              ...gameState,
              pieces: newPieces,
              diceRolled: false,
              diceValue: null, // Clear dice for next roll
              // Keep consecutive sixes if it was a 6, else reset (capture/finish doesn't count towards 3-six-forfeit limit usually, but simpler to keep)
              consecutiveSixes: roll === 6 ? gameState.consecutiveSixes : 0
          };
          setGameState(nextState);
          await updateGameState(table.id, nextState);
          
          // If bot bonus turn
          if (isBotGame && nextState.currentTurn === oppColor) {
              setTimeout(() => performRoll(), 1000);
          }

      } else {
          // Pass turn
          const tempState = { ...gameState, pieces: newPieces }; // Temp state for switching
          await switchTurn(tempState);
      }
  };

  const switchTurn = async (currentState: LudoGameState) => {
      const nextTurn: PlayerColor = currentState.currentTurn === 'Red' ? 'Yellow' : 'Red';
      const nextState = {
          ...currentState,
          currentTurn: nextTurn,
          diceRolled: false,
          diceValue: null,
          consecutiveSixes: 0
      };
      setGameState(nextState);
      await updateGameState(table.id, nextState);

      // Trigger Bot if needed
      if (isBotGame && nextTurn === oppColor) {
          setTimeout(() => performRoll(), 1500);
      }
  };

  // --- BOT LOGIC ---
  const executeBotMove = (state: LudoGameState, roll: number) => {
      const botPieces = state.pieces.filter(p => p.color === oppColor);
      const movablePieces = botPieces.filter(p => canMovePiece(p, roll));

      if (movablePieces.length === 0) {
          switchTurn(state);
          return;
      }

      // Strategy: Capture > Finish > Escape Base > Advance
      let bestPiece = movablePieces[0];
      let bestScore = -100;

      movablePieces.forEach(p => {
          let score = 0;
          const currentStep = p.step;
          const futureStep = currentStep === -1 ? 0 : currentStep + roll;
          
          // 1. Finishing
          if (futureStep === 56) score += 100;

          // 2. Escaping Base
          if (currentStep === -1 && futureStep === 0) score += 50;

          // 3. Capturing (Simplified prediction)
          if (futureStep <= 50) {
              const globalIdx = getGlobalTrackIndex(oppColor, futureStep);
              const victim = state.pieces.find(vp => vp.color !== oppColor && getGlobalTrackIndex(vp.color, vp.step) === globalIdx);
              if (victim && !SAFE_SPOTS.includes(globalIdx)) score += 80;
          }

          // 4. Safety
          if (futureStep <= 50 && SAFE_SPOTS.includes(getGlobalTrackIndex(oppColor, futureStep))) score += 20;

          if (score > bestScore) {
              bestScore = score;
              bestPiece = p;
          }
      });

      movePiece(bestPiece, roll);
  };

  // --- RENDER HELPERS ---
  const getGridStyle = (p: Piece) => {
      if (p.step === -1) return null; // Handled separately in base
      const coord = getTrackPosition(p.color, p.step);
      if (!coord) return null;
      return { gridColumn: coord.x + 1, gridRow: coord.y + 1 };
  };

  if (!gameState) return <div className="min-h-screen flex items-center justify-center text-gold-500 animate-pulse">Loading Arena...</div>;

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-4 select-none">
       
       {/* HEADER */}
       <div className="w-full max-w-xl flex justify-between items-center mb-6">
           <button onClick={() => setShowForfeitModal(true)} className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white">
               <ArrowLeft size={20} />
           </button>
           <div className="flex flex-col items-center">
               <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
               <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
           </div>
           <AIReferee externalLog={refereeLog} />
       </div>

       {/* BOARD WRAPPER */}
       <div className="relative w-full max-w-[500px] aspect-square bg-white rounded-xl shadow-2xl border-4 border-royal-800 overflow-hidden">
           
           {/* GRID BACKGROUND */}
           <div 
             className="w-full h-full grid"
             style={{ gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)' }}
           >
               {/* BASES */}
               <div className="col-span-6 row-span-6 bg-red-500 border-r-2 border-b-2 border-royal-900 p-4 flex flex-wrap gap-2 items-center justify-center">
                   <div className="bg-white rounded-xl w-full h-full flex items-center justify-center p-2 gap-2 shadow-inner">
                        {gameState.pieces.filter(p => p.color === 'Red' && p.step === -1).map(p => (
                            <motion.button 
                                key={p.id}
                                layoutId={`piece-${p.id}`}
                                onClick={() => handlePieceClick(p)}
                                disabled={gameState.currentTurn !== 'Red' || !gameState.diceRolled || !canMovePiece(p, gameState.diceValue!)}
                                className={`w-8 h-8 rounded-full border-4 border-red-300 bg-red-600 shadow-md ${gameState.currentTurn === 'Red' && gameState.diceValue === 6 ? 'animate-bounce' : ''}`}
                            />
                        ))}
                   </div>
               </div>
               <div className="col-span-3 row-span-6 border-b-2 border-royal-900"></div> {/* Top Spacer */}
               <div className="col-span-6 row-span-6 bg-yellow-400 border-l-2 border-b-2 border-royal-900 p-4 flex flex-wrap gap-2 items-center justify-center">
                   <div className="bg-white rounded-xl w-full h-full flex items-center justify-center p-2 gap-2 shadow-inner">
                        {gameState.pieces.filter(p => p.color === 'Yellow' && p.step === -1).map(p => (
                            <motion.button 
                                key={p.id}
                                layoutId={`piece-${p.id}`}
                                onClick={() => handlePieceClick(p)}
                                disabled={gameState.currentTurn !== 'Yellow' || !gameState.diceRolled || !canMovePiece(p, gameState.diceValue!)}
                                className={`w-8 h-8 rounded-full border-4 border-yellow-200 bg-yellow-500 shadow-md ${gameState.currentTurn === 'Yellow' && gameState.diceValue === 6 ? 'animate-bounce' : ''}`}
                            />
                        ))}
                   </div>
               </div>

               {/* MIDDLE ROWS */}
               <div className="row-span-3 col-span-6 border-r-2 border-royal-900"></div>
               
               {/* CENTER TRIANGLE / GOAL */}
               <div className="col-span-3 row-span-3 bg-royal-900 relative">
                   <div className="absolute inset-0 bg-gradient-to-br from-royal-800 to-black opacity-50"></div>
                   <div className="absolute inset-0 flex items-center justify-center">
                       <Crown className="text-gold-400 drop-shadow-lg" size={32} />
                   </div>
                   {/* Finished Pieces */}
                   <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-1 p-2">
                       {gameState.pieces.filter(p => p.step === 56).map(p => (
                           <div key={p.id} className={`w-3 h-3 rounded-full ${p.color === 'Red' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                       ))}
                   </div>
               </div>

               <div className="row-span-3 col-span-6 border-l-2 border-royal-900"></div>

               {/* BOTTOM ROW */}
               <div className="col-span-6 row-span-6 bg-green-100 border-r-2 border-t-2 border-royal-900 opacity-50"></div> {/* Placeholder */}
               <div className="col-span-3 row-span-6 border-t-2 border-royal-900"></div>
               <div className="col-span-6 row-span-6 bg-blue-100 border-l-2 border-t-2 border-royal-900 opacity-50"></div> {/* Placeholder */}

           </div>

           {/* OVERLAY: ACTUAL TRACK TILES & PIECES */}
           <div 
             className="absolute inset-0 grid pointer-events-none"
             style={{ gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)' }}
           >
               {/* Track Tiles */}
               {TRACK_PATH.map((pos, i) => {
                   const isSafe = SAFE_SPOTS.includes(i);
                   const isRedStart = i === 0;
                   const isYellowStart = i === 26;
                   let bg = 'bg-white';
                   if (isRedStart) bg = 'bg-red-500';
                   if (isYellowStart) bg = 'bg-yellow-400';
                   if (isSafe && !isRedStart && !isYellowStart) bg = 'bg-slate-200';

                   return (
                       <div 
                           key={`track-${i}`}
                           style={{ gridColumn: pos.x + 1, gridRow: pos.y + 1 }}
                           className={`border-[0.5px] border-slate-300 ${bg} flex items-center justify-center relative`}
                       >
                           {isSafe && !isRedStart && !isYellowStart && <Star size={10} className="text-slate-400" />}
                           {(isRedStart || isYellowStart) && <ArrowLeft size={12} className="text-white" />}
                       </div>
                   );
               })}

               {/* Home Paths */}
               {HOME_PATHS.Red.map((pos, i) => (
                   <div key={`rh-${i}`} style={{gridColumn: pos.x+1, gridRow: pos.y+1}} className="bg-red-500 border border-white/20"></div>
               ))}
               {HOME_PATHS.Yellow.map((pos, i) => (
                   <div key={`yh-${i}`} style={{gridColumn: pos.x+1, gridRow: pos.y+1}} className="bg-yellow-400 border border-white/20"></div>
               ))}

               {/* ACTIVE PIECES */}
               <AnimatePresence>
                   {gameState.pieces.filter(p => p.step > -1 && p.step < 56).map(p => {
                       const style = getGridStyle(p);
                       if (!style) return null;
                       
                       // Offset for stacked pieces
                       const stackIdx = gameState.pieces.filter(op => op.step === p.step && op.color === p.color && op.id < p.id).length;
                       
                       return (
                           <motion.div
                               key={p.id}
                               layoutId={`piece-${p.id}`}
                               style={style}
                               className="relative w-full h-full flex items-center justify-center z-10 pointer-events-auto"
                           >
                               <motion.button 
                                   onClick={() => handlePieceClick(p)}
                                   disabled={gameState.currentTurn !== p.color || !gameState.diceRolled}
                                   className={`
                                       w-[80%] h-[80%] rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.4)]
                                       ${p.color === 'Red' ? 'bg-red-600 border-red-300' : 'bg-yellow-500 border-yellow-200'}
                                       border-4
                                       ${gameState.currentTurn === p.color && gameState.diceRolled && canMovePiece(p, gameState.diceValue!) ? 'animate-bounce ring-2 ring-white' : ''}
                                   `}
                                   style={{ transform: `translate(${stackIdx * 3}px, ${stackIdx * -3}px)` }}
                               />
                           </motion.div>
                       );
                   })}
               </AnimatePresence>
           </div>
       </div>

       {/* CONTROLS */}
       <div className="mt-8 w-full max-w-md bg-royal-900/80 p-6 rounded-2xl border border-white/10 backdrop-blur-sm flex justify-between items-center relative">
           
           {/* Player (You) */}
           <div className={`flex flex-col items-center gap-1 ${gameState.currentTurn === myColor ? 'opacity-100 scale-105 transition-all' : 'opacity-50'}`}>
               <div className={`w-14 h-14 rounded-full border-4 ${myColor === 'Red' ? 'border-red-500' : 'border-yellow-400'} overflow-hidden shadow-lg`}>
                   <img src={user.avatar} className="w-full h-full object-cover" />
               </div>
               <span className={`text-xs font-bold uppercase ${myColor === 'Red' ? 'text-red-400' : 'text-yellow-400'}`}>You</span>
           </div>

           {/* Dice Action */}
           <div className="flex flex-col items-center">
               <AnimatePresence mode='wait'>
                   {gameState.currentTurn === myColor && !gameState.diceRolled ? (
                       <motion.button 
                           key="roll-btn"
                           initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                           onClick={handleRollDice}
                           className="bg-gold-500 hover:bg-gold-400 text-royal-950 font-black px-6 py-3 rounded-xl shadow-lg flex items-center gap-2"
                       >
                           <Dice5 size={24} /> ROLL
                       </motion.button>
                   ) : (
                       <div key="dice-display" className="w-16 h-16 bg-white rounded-xl shadow-inner flex items-center justify-center border-2 border-slate-200">
                           {gameState.diceValue ? (
                               <motion.div 
                                   initial={{ rotate: 180, scale: 0.5 }} 
                                   animate={{ rotate: 0, scale: 1 }}
                                   className="text-4xl font-black text-royal-950"
                               >
                                   {gameState.diceValue}
                               </motion.div>
                           ) : (
                               <div className="text-slate-300 text-xs text-center font-bold">Waiting...</div>
                           )}
                       </div>
                   )}
               </AnimatePresence>
               {gameState.currentTurn !== myColor && (
                   <div className="text-xs text-slate-500 mt-2 animate-pulse font-bold">Opponent's Turn</div>
               )}
           </div>

           {/* Opponent */}
           <div className={`flex flex-col items-center gap-1 ${gameState.currentTurn === oppColor ? 'opacity-100 scale-105 transition-all' : 'opacity-50'}`}>
               <div className={`w-14 h-14 rounded-full border-4 ${oppColor === 'Red' ? 'border-red-500' : 'border-yellow-400'} overflow-hidden shadow-lg`}>
                   <img src={table.host?.id === user.id ? (table.guest?.avatar || "https://i.pravatar.cc/150") : (table.host?.avatar || "https://i.pravatar.cc/150")} className="w-full h-full object-cover" />
               </div>
               <span className={`text-xs font-bold uppercase ${oppColor === 'Red' ? 'text-red-400' : 'text-yellow-400'}`}>{table.host?.id === user.id ? (table.guest?.name || "Opponent") : (table.host?.name || "Opponent")}</span>
           </div>

       </div>

       {/* MODALS */}
       {showForfeitModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <div className="bg-royal-900 p-6 rounded-2xl border border-red-500/30 max-w-sm w-full text-center">
                   <h2 className="text-xl font-bold text-white mb-2">Leave Game?</h2>
                   <p className="text-slate-400 text-sm mb-6">You will lose your stake.</p>
                   <div className="flex gap-4">
                       <button onClick={() => setShowForfeitModal(false)} className="flex-1 py-3 bg-white/10 rounded-xl text-white font-bold">Cancel</button>
                       <button onClick={() => onGameEnd('quit')} className="flex-1 py-3 bg-red-600 rounded-xl text-white font-bold">Forfeit</button>
                   </div>
               </div>
           </div>
       )}

    </div>
  );
};
