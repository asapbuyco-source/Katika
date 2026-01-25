
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Dice5, Crown, Shield, Star } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';

type PlayerColor = 'Red' | 'Yellow';
interface Piece { id: number; color: PlayerColor; step: number; owner?: string; }

// Safe Zones on the 0-51 track (Absolute indices)
const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];

// Board Waypoints for visual interpolation
// We map the 0-51 track steps to visual percentages (top%, left%)
// The board is a grid. 0 is Red Start.
const getSmartPosition = (color: PlayerColor, step: number, pieceIndex: number) => {
    // 1. Home Base Positions
    if (step === -1) {
        if (color === 'Red') {
            // Top Left Quadrant
            const positions = [{x: 12, y: 12}, {x: 28, y: 12}, {x: 12, y: 28}, {x: 28, y: 28}]; 
            return positions[pieceIndex % 4];
        } else {
            // Bottom Right Quadrant
            const positions = [{x: 72, y: 72}, {x: 88, y: 72}, {x: 72, y: 88}, {x: 88, y: 88}]; 
            return positions[pieceIndex % 4];
        }
    }
    
    // 2. Victory Road (Steps > 50)
    // For Red, home entrance is at index 50 -> 51..56
    // For Yellow, home entrance is at index 24 (relative) -> wait, normalized steps.
    // Let's assume step is RELATIVE to the player's start. 0 = Start, 50 = End of loop, 51+ = Home Straight.
    if (step >= 51) {
        const depth = step - 51; 
        const offset = 10 + (depth * 6.5);
        if (color === 'Red') return { x: offset, y: 50 }; // Left to Center
        else return { x: 100 - offset, y: 50 }; // Right to Center
    }

    // 3. Main Track (0-50)
    // We normalize to a 52-step loop starting from Red's start (Top-Left, moving Clockwise).
    // Red Start = 0.
    // Yellow Start = 26.
    let pos = step;
    if (color === 'Yellow') pos = (step + 26) % 52;

    // Define visual path coordinates (approximate for 15x15 grid)
    // 0-5: Red Home Straight Out (Horizontal Top-Left)
    if (pos <= 5) return { x: 8 + (pos * 6.6), y: 40 }; 
    // 6-11: Top Vertical Up
    if (pos <= 11) return { x: 42, y: 38 - ((pos - 6) * 6.6) };
    // 12: Top Middle Turn
    if (pos === 12) return { x: 50, y: 5 };
    // 13-18: Top Vertical Down
    if (pos <= 18) return { x: 58, y: 8 + ((pos - 13) * 6.6) };
    // 19-24: Right Horizontal Out
    if (pos <= 24) return { x: 62 + ((pos - 19) * 6.6), y: 40 };
    // 25: Right Middle Turn
    if (pos === 25) return { x: 95, y: 50 };
    // 26-31: Right Horizontal In
    if (pos <= 31) return { x: 92 - ((pos - 26) * 6.6), y: 60 };
    // 32-37: Bottom Vertical Down
    if (pos <= 37) return { x: 58, y: 62 + ((pos - 32) * 6.6) };
    // 38: Bottom Middle Turn
    if (pos === 38) return { x: 50, y: 95 };
    // 39-44: Bottom Vertical Up
    if (pos <= 44) return { x: 42, y: 92 - ((pos - 39) * 6.6) };
    // 45-50: Left Horizontal In
    if (pos <= 50) return { x: 38 - ((pos - 45) * 6.6), y: 60 };
    // 51: Left Middle Turn
    return { x: 5, y: 50 };
};

interface GameRoomProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

export const GameRoom: React.FC<GameRoomProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [currentTurn, setCurrentTurn] = useState<PlayerColor>('Red');
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceRolled, setDiceRolled] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [lastMovedPieceId, setLastMovedPieceId] = useState<number | null>(null);

  const isP2P = !!socket && !!socketGame;
  // Determine my color based on player order in socketGame. P1 = Red, P2 = Yellow.
  const myColor: PlayerColor = socketGame && socketGame.players[0] === user.id ? 'Red' : 'Yellow';

  // Initialize Pieces (Local Fallback)
  useEffect(() => {
      if ((!isP2P || (isP2P && !socketGame?.gameState?.pieces)) && pieces.length === 0) {
          const initPieces: Piece[] = [];
          for(let i=0; i<4; i++) initPieces.push({ id: i, color: 'Red', step: -1 });
          for(let i=0; i<4; i++) initPieces.push({ id: i+4, color: 'Yellow', step: -1 });
          setPieces(initPieces);
      }
  }, [isP2P, socketGame]);

  // --- SYNC ---
  useEffect(() => {
      if (isP2P && socketGame) {
          const gs = socketGame.gameState;
          if (gs) {
              if (gs.pieces && gs.pieces.length > 0) setPieces(gs.pieces);
              if (gs.diceValue !== undefined) setDiceValue(gs.diceValue);
              if (gs.diceRolled !== undefined) setDiceRolled(gs.diceRolled);
          }
          if (socketGame.turn) setCurrentTurn(socketGame.turn === socketGame.players[0] ? 'Red' : 'Yellow');
          
          if (socketGame.winner) {
              onGameEnd(socketGame.winner === user.id ? 'win' : 'loss');
          }
      }
  }, [socketGame, user.id, isP2P]);

  const handleQuit = () => {
      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      onGameEnd('quit');
  };

  const handleRoll = () => {
      if (currentTurn !== myColor || diceRolled) return;
      
      playSFX('dice');
      
      if (socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } });
      } else {
          // Local Mode Logic
          setTimeout(() => {
              const val = Math.ceil(Math.random() * 6);
              setDiceValue(val);
              setDiceRolled(true);
              
              // Check if any move is possible
              const myPieces = pieces.filter(p => p.color === myColor);
              const canMove = myPieces.some(p => p.step !== -1 || val === 6);
              if (!canMove) {
                  // Auto skip after delay
                  setTimeout(() => {
                      setDiceRolled(false);
                      setDiceValue(null);
                      setCurrentTurn(currentTurn === 'Red' ? 'Yellow' : 'Red');
                  }, 1500);
              }
          }, 500);
      }
  };

  const handlePieceClick = (p: Piece) => {
      if (currentTurn !== myColor || !diceRolled || !diceValue) return;
      if (p.color !== myColor) return;
      
      // P2P: Send intention to server
      if (socket) {
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: { 
                  type: 'MOVE_PIECE', 
                  pieceId: p.id
              } 
          });
          setLastMovedPieceId(p.id);
          playSFX('move');
          return;
      }

      // Local Logic (Offline/Bot)
      if (p.step === -1 && diceValue !== 6) {
          playSFX('error');
          return;
      }

      const nextStep = p.step === -1 ? 0 : p.step + diceValue;
      if (nextStep > 56) {
          playSFX('error'); // Overshoot
          return; 
      }

      let newPieces = pieces.map(piece => piece.id === p.id ? { ...piece, step: nextStep } : piece);
      let captured = false;

      // Check Collision (Only on main track 0-50)
      if (nextStep >= 0 && nextStep <= 50) {
          const myNormalized = p.color === 'Red' ? nextStep : (nextStep + 26) % 52;
          
          newPieces = newPieces.map(other => {
              if (other.id === p.id) return other; // Skip self
              if (other.color === p.color) return other; // Skip friendly
              if (other.step === -1 || other.step > 50) return other; // Skip home/base

              const otherNormalized = other.color === 'Red' ? other.step : (other.step + 26) % 52;

              if (myNormalized === otherNormalized) {
                  if (SAFE_ZONES.includes(myNormalized)) {
                      return other; // Safe zone, stack
                  } else {
                      playSFX('capture');
                      captured = true;
                      return { ...other, step: -1 }; // Send home
                  }
              }
              return other;
          });
      }

      setLastMovedPieceId(p.id);
      
      const bonusTurn = diceValue === 6 || captured;
      setPieces(newPieces);
      setDiceRolled(false);
      setDiceValue(null);
      if (!bonusTurn) {
          setCurrentTurn(currentTurn === 'Red' ? 'Yellow' : 'Red');
      }
      playSFX('move');
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Header */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-6 mt-2">
            <button onClick={handleQuit} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
            </button>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

        <div className="text-white text-center mb-4">
            <h2 className={`text-2xl font-bold ${currentTurn === myColor ? 'text-gold-400' : 'text-slate-500'}`}>
                {currentTurn === myColor ? "YOUR TURN" : "OPPONENT'S TURN"}
            </h2>
        </div>

        <div className="relative w-full max-w-[600px] aspect-square bg-royal-900 rounded-xl shadow-2xl overflow-hidden border-8 border-royal-800">
            {/* Ludo Board Art */}
            <div className="absolute inset-0 grid grid-cols-15 grid-rows-15 bg-[#e0f2fe]">
                
                {/* Red Base (Top Left) */}
                <div className="absolute top-0 left-0 w-[40%] h-[40%] bg-white border-r-4 border-b-4 border-royal-800 p-4">
                    <div className="w-full h-full bg-red-100 rounded-3xl border-4 border-red-500 flex items-center justify-center relative">
                        <Crown className="text-red-500 relative z-10 w-12 h-12" />
                    </div>
                </div>

                {/* Yellow Base (Bottom Right) */}
                <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-white border-l-4 border-t-4 border-royal-800 p-4">
                    <div className="w-full h-full bg-yellow-100 rounded-3xl border-4 border-yellow-500 flex items-center justify-center relative">
                        <Crown className="text-yellow-500 relative z-10 w-12 h-12" />
                    </div>
                </div>

                {/* Home Run Tracks (Visual) */}
                <div className="absolute top-[40%] left-0 w-[40%] h-[20%] flex items-center bg-red-100/30"></div>
                <div className="absolute top-[40%] right-0 w-[40%] h-[20%] flex items-center bg-yellow-100/30"></div>
                
                {/* Center */}
                <div className="absolute top-[40%] left-[40%] w-[20%] h-[20%] bg-gradient-to-br from-royal-800 to-royal-950 flex items-center justify-center border-4 border-white shadow-inner z-10">
                    <div className="text-center">
                        <div className="text-white font-black text-xs">VANTAGE</div>
                        <Star className="text-gold-400 w-6 h-6 mx-auto mt-1 animate-pulse" fill="currentColor" />
                    </div>
                </div>
            </div>

            {/* Pieces Layer */}
            <AnimatePresence>
            {pieces.map((p, i) => {
                const pos = getSmartPosition(p.color, p.step, i);
                
                // Stack handling for pieces on same spot
                const stackIndex = pieces.filter((other, idx) => idx < i && other.step === p.step && other.color === p.color && p.step !== -1).length;
                const offset = stackIndex * 4;

                const isMyPiece = p.color === myColor;
                const canMove = isMyPiece && diceRolled && currentTurn === myColor && (p.step !== -1 || diceValue === 6);

                return (
                    <motion.div 
                        key={p.id}
                        layoutId={`p-${p.id}`}
                        initial={{ scale: 0 }}
                        animate={{ 
                            top: `${pos.y}%`, 
                            left: `${pos.x}%`, 
                            marginLeft: `${offset}px`,
                            marginTop: `${offset}px`,
                            scale: 1,
                            zIndex: 20 + stackIndex
                        }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        onClick={() => handlePieceClick(p)}
                        className={`
                            absolute w-6 h-6 md:w-8 md:h-8 -ml-3 -mt-3 md:-ml-4 md:-mt-4 rounded-full border-2 border-white shadow-[0_4px_6px_rgba(0,0,0,0.4)]
                            ${p.color === 'Red' ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-yellow-400 to-yellow-600'}
                            ${canMove ? 'cursor-pointer ring-4 ring-white/50 animate-pulse' : 'cursor-default'}
                            ${lastMovedPieceId === p.id ? 'z-50' : ''}
                        `}
                    >
                        <div className="absolute inset-2 rounded-full bg-white/20"></div>
                    </motion.div>
                )
            })}
            </AnimatePresence>
        </div>

        <div className="mt-8 flex flex-col items-center h-32 justify-end pb-4">
            {currentTurn === myColor && !diceRolled && (
                <motion.button 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRoll} 
                    className="bg-gold-500 hover:bg-gold-400 text-royal-950 font-black px-12 py-4 rounded-2xl shadow-[0_0_20px_rgba(251,191,36,0.4)] flex items-center gap-3 transition-transform"
                >
                    <Dice5 size={24} className="animate-spin-slow" /> ROLL DICE
                </motion.button>
            )}
            {diceRolled && (
                <div className="flex flex-col items-center">
                    <motion.div 
                        initial={{ scale: 0, rotate: 180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        className="bg-white text-royal-950 font-black text-5xl w-20 h-20 flex items-center justify-center rounded-2xl shadow-xl mb-4 border-4 border-gold-500"
                    >
                        {diceValue}
                    </motion.div>
                    {currentTurn === myColor && <p className="text-gold-400 text-sm font-bold animate-bounce">Select a piece to move</p>}
                </div>
            )}
            {currentTurn !== myColor && (
                <div className="text-slate-500 text-sm font-mono animate-pulse">Waiting for opponent...</div>
            )}
        </div>

        {isP2P && socketGame && (
            <GameChat 
                messages={socketGame.chat || []}
                onSendMessage={(msg) => socket?.emit('game_action', { roomId: socketGame.roomId, action: { type: 'CHAT', message: msg } })}
                currentUserId={user.id}
                profiles={socketGame.profiles || {}}
            />
        )}
    </div>
  );
};
