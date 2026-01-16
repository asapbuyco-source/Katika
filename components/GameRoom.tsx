
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Dice5, Lock, AlertTriangle, User as UserIcon, Star, CheckCircle } from 'lucide-react';
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

// --- CONSTANTS ---
type PlayerColor = 'Red' | 'Yellow'; // 2 Player Mode

interface Piece {
  id: number;
  color: PlayerColor;
  status: 'BASE' | 'ACTIVE' | 'FINISHED';
  stepsMoved: number; // 0 to 57
}

interface LudoGameState {
    pieces: Piece[];
    currentTurn: PlayerColor;
    diceValue: number | null;
    diceRolled: boolean; // Has the player rolled the dice in this turn?
    winner: PlayerColor | null;
}

// Path Offsets for the 52-cell main track
// Red starts at index 0. Yellow starts at index 26.
const START_INDEX = { Red: 0, Yellow: 26 };

// Visual coordinates for the board (Simplified Grid Mapping)
const TRACK_COORDS = [
    // Red Leg (0-5)
    {x:1, y:6}, {x:2, y:6}, {x:3, y:6}, {x:4, y:6}, {x:5, y:6}, {x:6, y:5},
    // Top Leg (6-11) -> Top Turn (12) -> Down (13-18)
    {x:6, y:4}, {x:6, y:3}, {x:6, y:2}, {x:6, y:1}, {x:6, y:0}, {x:7, y:0}, {x:8, y:0},
    {x:8, y:1}, {x:8, y:2}, {x:8, y:3}, {x:8, y:4}, {x:8, y:5}, {x:9, y:6},
    // Right Leg (19-24) -> Right Turn (25) -> Left (26-31)
    {x:10,y:6}, {x:11,y:6}, {x:12,y:6}, {x:13,y:6}, {x:14,y:6}, {x:14,y:7}, {x:14,y:8},
    {x:13,y:8}, {x:12,y:8}, {x:11,y:8}, {x:10,y:8}, {x:8, y:9},
    // Bottom Leg (32-37) -> Bottom Turn (38) -> Up (39-44)
    {x:8, y:10}, {x:8, y:11}, {x:8, y:12}, {x:8, y:13}, {x:8, y:14}, {x:7, y:14}, {x:6, y:14},
    {x:6, y:13}, {x:6, y:12}, {x:6, y:11}, {x:6, y:10}, {x:5, y:8},
    // Left Leg (45-50) -> End (51)
    {x:4, y:8}, {x:3, y:8}, {x:2, y:8}, {x:1, y:8}, {x:0, y:8}, {x:0, y:7}, {x:0, y:6}
];

// Home Run Paths
const HOME_PATHS = {
    Red:    [{x:1, y:7}, {x:2, y:7}, {x:3, y:7}, {x:4, y:7}, {x:5, y:7}, {x:6, y:7}], // Final dest at index 5
    Yellow: [{x:13,y:7}, {x:12,y:7}, {x:11,y:7}, {x:10,y:7}, {x:9,y:7}, {x:8,y:7}]
};

const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47]; // Indices on the main track

const RollingDie = ({ value }: { value: number }) => (
    <motion.div
        key={value}
        initial={{ rotateX: 0, rotateY: 0, scale: 0.8 }}
        animate={{ rotateX: 360, rotateY: 360, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-16 h-16 bg-white rounded-2xl shadow-xl border-2 border-slate-200 flex items-center justify-center"
    >
        <div className="text-4xl font-black text-royal-950">{value}</div>
    </motion.div>
);

export const GameRoom: React.FC<GameRoomProps> = ({ table, user, onGameEnd }) => {
  const [gameState, setGameState] = useState<LudoGameState | null>(null);
  const [myColor, setMyColor] = useState<PlayerColor | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  // Check if opponent is a bot
  const isBotGame = (table as any).guest?.id === 'bot' || (table as any).host?.id === 'bot';

  // Initialize & Subscribe
  useEffect(() => {
      // Determine Role
      const isHostUser = table.host?.id === user.id || (table as any).host?.uid === user.id; 
      setIsHost(isHostUser);
      setMyColor(isHostUser ? 'Red' : 'Yellow');

      const unsubscribe = subscribeToGame(table.id, (data) => {
          if (data.gameState && data.gameState.pieces) {
              setGameState(data.gameState as LudoGameState);
          } else if (isHostUser && (!data.gameState || !data.gameState.pieces)) {
              // Initial Setup by Host
              const initialPieces: Piece[] = [
                  { id: 0, color: 'Red', status: 'BASE', stepsMoved: 0 },
                  { id: 1, color: 'Red', status: 'BASE', stepsMoved: 0 },
                  { id: 2, color: 'Red', status: 'BASE', stepsMoved: 0 },
                  { id: 3, color: 'Red', status: 'BASE', stepsMoved: 0 },
                  { id: 4, color: 'Yellow', status: 'BASE', stepsMoved: 0 },
                  { id: 5, color: 'Yellow', status: 'BASE', stepsMoved: 0 },
                  { id: 6, color: 'Yellow', status: 'BASE', stepsMoved: 0 },
                  { id: 7, color: 'Yellow', status: 'BASE', stepsMoved: 0 },
              ];
              const initialState: LudoGameState = {
                  pieces: initialPieces,
                  currentTurn: 'Red',
                  diceValue: null,
                  diceRolled: false,
                  winner: null
              };
              updateGameState(table.id, initialState);
          }

          if (data.status === 'completed' && data.winner) {
               if (data.winner === user.id) onGameEnd('win');
               else onGameEnd('loss');
          }
      });

      return () => unsubscribe();
  }, [table.id, user.id]);

  const addLog = (msg: string, status: 'secure' | 'alert' = 'secure') => {
      setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // --- BOT LOGIC ---
  useEffect(() => {
      if (!isBotGame || !isHost || !gameState) return;

      const botColor = myColor === 'Red' ? 'Yellow' : 'Red';
      
      // If it's Bot's turn
      if (gameState.currentTurn === botColor && !gameState.winner) {
          if (!gameState.diceRolled) {
              // 1. Roll Dice
              setTimeout(() => {
                  const roll = Math.floor(Math.random() * 6) + 1;
                  const newState = { ...gameState, diceValue: roll, diceRolled: true };
                  setGameState(newState);
                  updateGameState(table.id, newState);
                  playSFX('dice');
              }, 1000);
          } else {
              // 2. Move Piece (or Pass)
              setTimeout(() => {
                  executeBotMove(gameState, botColor);
              }, 1500);
          }
      }
  }, [gameState, isBotGame, isHost, myColor]);

  const executeBotMove = async (state: LudoGameState, botColor: PlayerColor) => {
      if (!state.diceValue) return;
      const roll = state.diceValue;
      
      // Find valid moves
      const myPieces = state.pieces.filter(p => p.color === botColor);
      const movablePieces = myPieces.filter(p => canPieceMove(p, roll));

      if (movablePieces.length === 0) {
          // No moves, pass turn
          await passTurn(state);
          return;
      }

      // Simple AI Strategy:
      // 1. Capture if possible
      // 2. Move out of base (Roll 6)
      // 3. Move piece closest to home (simplified)
      // 4. Random valid move
      
      let selectedPiece = movablePieces[0];
      
      // Heuristic: Prefer getting out of base
      const basePiece = movablePieces.find(p => p.status === 'BASE');
      if (basePiece && roll === 6) selectedPiece = basePiece;
      
      // Execute Move logic (reusing simplified handlePieceClick logic but adapted)
      playSFX('move');
      
      // Calculate new position
      let newStatus = selectedPiece.status;
      let newSteps = selectedPiece.stepsMoved;

      if (selectedPiece.status === 'BASE') {
          newStatus = 'ACTIVE';
          newSteps = 0;
      } else {
          newSteps += roll;
          if (newSteps >= 57) { 
             newStatus = 'FINISHED';
             newSteps = 57;
             playSFX('win');
          }
      }

      // Handle Captures (Collision)
      let updatedPieces = state.pieces.map(p => {
          if (p.id === selectedPiece.id) {
              return { ...p, status: newStatus, stepsMoved: newSteps } as Piece;
          }
          return p;
      });

      if (newStatus === 'ACTIVE' && newSteps < 51) {
          const myAbsPos = getAbsolutePosition(botColor, newSteps);
          const isSafe = SAFE_SPOTS.includes(myAbsPos);

          if (!isSafe) {
              updatedPieces = updatedPieces.map(p => {
                  if (p.color !== botColor && p.status === 'ACTIVE') {
                      const oppAbsPos = getAbsolutePosition(p.color, p.stepsMoved);
                      if (oppAbsPos === myAbsPos) {
                          playSFX('capture');
                          addLog("Bot Captured!", "alert");
                          return { ...p, status: 'BASE', stepsMoved: 0 };
                      }
                  }
                  return p;
              });
          }
      }

      // Check Win
      const myFinished = updatedPieces.filter(p => p.color === botColor && p.status === 'FINISHED').length;
      if (myFinished === 4) {
          const finalState = { ...state, pieces: updatedPieces, winner: botColor };
          await updateGameState(table.id, finalState);
          await setGameResult(table.id, 'bot'); // Bot wins
          return;
      }

      // Next Turn
      const bonusTurn = roll === 6;
      const nextTurnState: LudoGameState = {
          ...state,
          pieces: updatedPieces,
          diceRolled: false,
          diceValue: roll,
          currentTurn: (bonusTurn ? botColor : (botColor === 'Red' ? 'Yellow' : 'Red')) as PlayerColor
      };

      setGameState(nextTurnState);
      await updateGameState(table.id, nextTurnState);
  };

  // --- GAME ACTIONS ---

  const handleRollDice = async () => {
      if (!gameState || gameState.currentTurn !== myColor || gameState.diceRolled) return;

      playSFX('dice');
      const roll = Math.floor(Math.random() * 6) + 1;
      
      // Optimistic Update
      const newState = { ...gameState, diceValue: roll, diceRolled: true };
      setGameState(newState);
      await updateGameState(table.id, newState);

      // Check if any moves are possible
      const myPieces = gameState.pieces.filter(p => p.color === myColor);
      const canMove = myPieces.some(p => canPieceMove(p, roll));
      
      if (!canMove) {
          // Auto pass turn after delay
          setTimeout(async () => {
              await passTurn(newState);
          }, 1500);
          addLog("No moves available", "secure");
      }
  };

  const handlePieceClick = async (piece: Piece) => {
      if (!gameState || !myColor) return;
      if (gameState.currentTurn !== myColor) return;
      if (!gameState.diceRolled || !gameState.diceValue) return;
      if (piece.color !== myColor) return;

      if (!canPieceMove(piece, gameState.diceValue)) {
          playSFX('error');
          return;
      }

      playSFX('move');
      
      // Calculate new position
      let newStatus = piece.status;
      let newSteps = piece.stepsMoved;

      if (piece.status === 'BASE') {
          if (gameState.diceValue === 6) {
              newStatus = 'ACTIVE';
              newSteps = 0;
          }
      } else {
          newSteps += gameState.diceValue;
          if (newSteps >= 57) { // 51 track + 6 home
             newStatus = 'FINISHED';
             newSteps = 57;
             playSFX('win'); // mini win sound
          }
      }

      // Handle Captures (Collision)
      let updatedPieces = gameState.pieces.map(p => {
          if (p.id === piece.id) {
              return { ...p, status: newStatus, stepsMoved: newSteps } as Piece;
          }
          return p;
      });

      // Check collision if landed on main track
      if (newStatus === 'ACTIVE' && newSteps < 51) {
          const myAbsPos = getAbsolutePosition(myColor, newSteps);
          // Check against SAFE SPOTS
          const isSafe = SAFE_SPOTS.includes(myAbsPos);

          if (!isSafe) {
              updatedPieces = updatedPieces.map(p => {
                  if (p.color !== myColor && p.status === 'ACTIVE') {
                      const oppAbsPos = getAbsolutePosition(p.color, p.stepsMoved);
                      if (oppAbsPos === myAbsPos) {
                          // CAPTURE!
                          playSFX('capture');
                          addLog("Piece Captured!", "alert");
                          return { ...p, status: 'BASE', stepsMoved: 0 };
                      }
                  }
                  return p;
              });
          }
      }

      // Determine Winner
      const myFinished = updatedPieces.filter(p => p.color === myColor && p.status === 'FINISHED').length;
      if (myFinished === 4) {
          const finalState = { ...gameState, pieces: updatedPieces, winner: myColor };
          await updateGameState(table.id, finalState);
          await setGameResult(table.id, user.id); // Set winner ID in game doc
          return;
      }

      // Determine Next Turn
      // Bonus turn if rolled 6
      const bonusTurn = gameState.diceValue === 6;
      
      const nextTurnState: LudoGameState = {
          ...gameState,
          pieces: updatedPieces,
          diceRolled: false,
          diceValue: gameState.diceValue, // keep for visual until next roll
          currentTurn: (bonusTurn ? myColor : (myColor === 'Red' ? 'Yellow' : 'Red')) as PlayerColor
      };

      if (bonusTurn) addLog("Rolled 6! Bonus Turn", "secure");

      setGameState(nextTurnState);
      await updateGameState(table.id, nextTurnState);
  };

  const passTurn = async (currentState: LudoGameState) => {
       const nextColor = (currentState.currentTurn === 'Red' ? 'Yellow' : 'Red') as PlayerColor;
       const newState = {
           ...currentState,
           diceRolled: false,
           currentTurn: nextColor
       };
       setGameState(newState);
       await updateGameState(table.id, newState);
  };

  // --- HELPER LOGIC ---

  const canPieceMove = (p: Piece, roll: number): boolean => {
      if (p.status === 'FINISHED') return false;
      if (p.status === 'BASE') return roll === 6;
      if (p.stepsMoved + roll > 57) return false; // Exact roll needed for home
      return true;
  };

  const getAbsolutePosition = (color: PlayerColor, steps: number) => {
      const offset = START_INDEX[color];
      return (offset + steps) % 52;
  };

  const getVisualCoordinates = (p: Piece) => {
      if (p.status === 'BASE') return null; // Handled separately in Base UI
      if (p.status === 'FINISHED') return null; // Handled in Center

      if (p.stepsMoved < 51) {
          const absIndex = getAbsolutePosition(p.color, p.stepsMoved);
          const pos = TRACK_COORDS[absIndex];
          // Use CSS grid coordinates (1-15)
          return { gridColumn: pos.x + 1, gridRow: pos.y + 1 };
      } else {
          // Home Run
          const homeIndex = p.stepsMoved - 51; // 0 to 5
          // Clamp
          const idx = Math.min(Math.max(homeIndex, 0), 5);
          const pos = HOME_PATHS[p.color][idx];
          return { gridColumn: pos.x + 1, gridRow: pos.y + 1 };
      }
  };

  if (!gameState) return <div className="flex items-center justify-center h-screen text-gold-500 animate-pulse">Loading Game State...</div>;

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-4">
       
       {/* MODALS */}
       <AnimatePresence>
          {showForfeitModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowForfeitModal(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                    className="relative bg-royal-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                  >
                      <h2 className="text-xl font-bold text-white mb-2 text-center">Forfeit Match?</h2>
                      <div className="flex gap-3 mt-4">
                          <button onClick={() => setShowForfeitModal(false)} className="flex-1 py-3 bg-white/5 rounded-xl text-slate-300 font-bold">Cancel</button>
                          <button onClick={() => onGameEnd('quit')} className="flex-1 py-3 bg-red-600 rounded-xl text-white font-bold">Forfeit</button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

       {/* HEADER */}
       <div className="w-full max-w-2xl flex justify-between items-center mb-4">
           <button onClick={() => setShowForfeitModal(true)} className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-400">
               <ArrowLeft size={20} />
           </button>
           <div className="flex flex-col items-center">
               <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
               <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
           </div>
           <AIReferee externalLog={refereeLog} />
       </div>

       {/* BOARD CONTAINER */}
       <div className="relative w-full max-w-[600px] aspect-square bg-royal-800 rounded-xl border-4 border-royal-700 shadow-2xl overflow-hidden p-2">
           
           {/* CSS GRID BOARD (15x15) */}
           <div className="w-full h-full grid grid-cols-15 grid-rows-15 gap-0.5 bg-royal-900">
               
               {/* --- BASES --- */}
               <div className="col-span-6 row-span-6 bg-red-600 rounded-lg m-1 relative p-4">
                   <div className="w-full h-full bg-white rounded-2xl grid grid-cols-2 gap-4 p-4">
                       {[0,1,2,3].map(id => (
                           <div key={id} className="rounded-full bg-red-100 shadow-inner flex items-center justify-center relative">
                               {gameState.pieces.find(p => p.id === id && p.status === 'BASE') && (
                                   <motion.div 
                                      layoutId={`piece-${id}`} 
                                      onClick={() => handlePieceClick(gameState.pieces.find(p => p.id === id)!)}
                                      className={`w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 border-2 border-white shadow-lg cursor-pointer ${
                                          myColor === 'Red' && gameState.diceRolled && gameState.diceValue === 6 && gameState.currentTurn === 'Red' ? 'animate-bounce' : ''
                                      }`}
                                   />
                               )}
                           </div>
                       ))}
                   </div>
                   <div className="absolute top-2 left-2 text-red-900 font-black opacity-50 text-xl">RED</div>
               </div>

               <div className="col-start-10 col-span-6 row-span-6 bg-yellow-500 rounded-lg m-1 relative p-4">
                   <div className="w-full h-full bg-white rounded-2xl grid grid-cols-2 gap-4 p-4">
                       {[4,5,6,7].map(id => (
                           <div key={id} className="rounded-full bg-yellow-100 shadow-inner flex items-center justify-center relative">
                               {gameState.pieces.find(p => p.id === id && p.status === 'BASE') && (
                                   <motion.div 
                                      layoutId={`piece-${id}`} 
                                      onClick={() => handlePieceClick(gameState.pieces.find(p => p.id === id)!)}
                                      className={`w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 border-2 border-white shadow-lg cursor-pointer ${
                                          myColor === 'Yellow' && gameState.diceRolled && gameState.diceValue === 6 && gameState.currentTurn === 'Yellow' ? 'animate-bounce' : ''
                                      }`}
                                   />
                               )}
                           </div>
                       ))}
                   </div>
                   <div className="absolute top-2 right-2 text-yellow-800 font-black opacity-50 text-xl">YELLOW</div>
               </div>

               {/* --- CENTER --- */}
               <div className="col-start-7 col-span-3 row-start-7 row-span-3 bg-gradient-to-br from-royal-700 to-royal-900 flex relative overflow-hidden">
                   <div className="absolute inset-0 flex items-center justify-center opacity-20">
                       <Star size={40} className="text-white" />
                   </div>
                   {/* Center Triangles */}
                   <div className="w-full h-full relative">
                       <div className="absolute top-0 left-0 w-full h-1/2 bg-red-500/20 clip-path-triangle-top"></div>
                       <div className="absolute right-0 top-0 h-full w-1/2 bg-yellow-500/20 clip-path-triangle-right"></div>
                   </div>
                   {/* Finished Pieces Stack */}
                   <div className="absolute inset-0 flex items-center justify-center gap-1">
                       {gameState.pieces.filter(p => p.status === 'FINISHED').map(p => (
                           <div key={p.id} className={`w-3 h-3 rounded-full ${p.color === 'Red' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                       ))}
                   </div>
               </div>

               {/* --- TRACK CELLS --- */}
               {TRACK_COORDS.map((coord, idx) => {
                   const isSafe = SAFE_SPOTS.includes(idx);
                   const isStartRed = idx === 0;
                   const isStartYellow = idx === 26;
                   
                   let cellClass = "bg-white relative border border-slate-200";
                   if (isStartRed) cellClass = "bg-red-500";
                   else if (isStartYellow) cellClass = "bg-yellow-500";
                   else if (isSafe) cellClass = "bg-slate-200";

                   return (
                       <div 
                           key={idx} 
                           style={{ gridColumn: coord.x + 1, gridRow: coord.y + 1 }}
                           className={cellClass}
                       >
                           {isSafe && !isStartRed && !isStartYellow && (
                               <div className="absolute inset-0 flex items-center justify-center opacity-20">
                                   <Star size={12} />
                               </div>
                           )}
                           {isStartRed && <div className="absolute inset-0 flex items-center justify-center text-white"><ArrowLeft className="rotate-180" size={16}/></div>}
                       </div>
                   );
               })}

               {/* --- HOME RUN CELLS --- */}
               {HOME_PATHS.Red.map((coord, i) => (
                   <div key={`hr-${i}`} style={{ gridColumn: coord.x + 1, gridRow: coord.y + 1 }} className="bg-red-500/80 border border-red-600" />
               ))}
               {HOME_PATHS.Yellow.map((coord, i) => (
                   <div key={`hy-${i}`} style={{ gridColumn: coord.x + 1, gridRow: coord.y + 1 }} className="bg-yellow-500/80 border border-yellow-600" />
               ))}

               {/* --- ACTIVE PIECES RENDER --- */}
               {gameState.pieces.map(piece => {
                   const coords = getVisualCoordinates(piece);
                   if (!coords) return null;

                   return (
                       <motion.div
                           key={piece.id}
                           layoutId={`piece-${piece.id}`}
                           style={coords}
                           className="relative z-20 flex items-center justify-center"
                           onClick={() => handlePieceClick(piece)}
                       >
                           <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full border-2 border-white shadow-lg cursor-pointer transform transition-transform hover:scale-110
                                ${piece.color === 'Red' ? 'bg-red-500' : 'bg-yellow-500'}
                                ${myColor === piece.color && gameState.diceRolled && canPieceMove(piece, gameState.diceValue!) ? 'ring-2 ring-white animate-pulse' : ''}
                           `}>
                               {/* Stack indicator if multiple pieces on same spot could be added here */}
                           </div>
                       </motion.div>
                   );
               })}

           </div>
       </div>

       {/* CONTROLS */}
       <div className="mt-6 w-full max-w-[600px] flex justify-between items-center bg-royal-900/50 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
           
           {/* MY TURN INDICATOR */}
           <div className={`flex items-center gap-3 ${gameState.currentTurn === myColor ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${myColor === 'Red' ? 'bg-red-500 border-red-400' : 'bg-yellow-500 border-yellow-400'}`}>
                    <img src={user.avatar} className="w-full h-full rounded-full opacity-80" />
                </div>
                <div>
                    <div className="text-white font-bold text-sm">YOU</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">{myColor}</div>
                </div>
           </div>

           {/* DICE ACTION */}
           <div className="flex flex-col items-center">
               <AnimatePresence mode='wait'>
                    {gameState.currentTurn === myColor ? (
                        !gameState.diceRolled ? (
                            <motion.button 
                                initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                                onClick={handleRollDice}
                                className="bg-gradient-to-b from-gold-400 to-gold-600 text-royal-950 font-black px-8 py-3 rounded-xl shadow-lg shadow-gold-500/20 flex items-center gap-2 hover:scale-105 transition-transform"
                            >
                                <Dice5 size={20} /> ROLL
                            </motion.button>
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                <RollingDie value={gameState.diceValue!} />
                                <span className="text-xs text-gold-400 font-bold animate-pulse mt-2">Move a Piece</span>
                            </div>
                        )
                    ) : (
                        <div className="text-slate-500 text-sm font-bold flex items-center gap-2">
                             {isBotGame && gameState.currentTurn !== myColor ? "Bot Thinking..." : "Opponent's Turn..."}
                             {gameState.diceRolled && gameState.diceValue && (
                                 <span className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-white font-bold">
                                     {gameState.diceValue}
                                 </span>
                             )}
                        </div>
                    )}
               </AnimatePresence>
           </div>

           {/* OPPONENT INDICATOR */}
           <div className={`flex items-center gap-3 flex-row-reverse ${gameState.currentTurn !== myColor ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${myColor !== 'Red' ? 'bg-red-500 border-red-400' : 'bg-yellow-500 border-yellow-400'}`}>
                    <img src={isBotGame ? (table as any).guest?.avatar || (table as any).host?.avatar : table.host?.avatar || "https://i.pravatar.cc/150"} className="w-full h-full rounded-full opacity-80" />
                </div>
                <div className="text-right">
                    <div className="text-white font-bold text-sm">
                        {isBotGame ? "Vantage AI" : (table.host?.name || "Opponent")}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">{myColor === 'Red' ? 'Yellow' : 'Red'}</div>
                </div>
           </div>

       </div>

    </div>
  );
};
