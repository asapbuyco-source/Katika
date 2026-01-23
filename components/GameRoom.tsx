import React, { useState, useEffect } from 'react';
import { ArrowLeft, Dice5, Crown, Shield, Star } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';

interface GameRoomProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

type PlayerColor = 'Red' | 'Yellow';
interface Piece { id: number; color: PlayerColor; step: number; owner?: string; }

// Safe Zones on the 0-51 track (Absolute indices)
const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];

// Board Waypoints for visual interpolation
// Simplified Rectangular Path mapped to % coordinates on the board
const getPiecePosition = (color: PlayerColor, step: number, pieceIndex: number) => {
    // 1. Base Positions (Home)
    if (step === -1) {
        if (color === 'Red') {
            const positions = [{x: 12, y: 12}, {x: 28, y: 12}, {x: 12, y: 28}, {x: 28, y: 28}]; // Top Left Base
            return positions[pieceIndex % 4];
        } else {
            const positions = [{x: 72, y: 72}, {x: 88, y: 72}, {x: 72, y: 88}, {x: 88, y: 88}]; // Bottom Right Base
            return positions[pieceIndex % 4];
        }
    }

    // 2. Home Straight (Victory Road)
    // Steps 51-56 are the home straight
    if (step >= 51) {
        const homeIndex = step - 51; // 0 to 5
        const progress = 10 + (homeIndex * 6.5); // spacing
        
        if (color === 'Red') return { x: progress, y: 50 }; // Left to Center (Red Home)
        if (color === 'Yellow') return { x: 100 - progress, y: 50 }; // Right to Center (Yellow Home)
    }

    // 3. Main Track (0-50)
    // Red Start Offset: 0. Yellow Start Offset: 26.
    let normalizedIndex = step;
    if (color === 'Yellow') normalizedIndex = (step + 26) % 52;

    // Define the rect path manually for clean visual lines
    // Top-Left corner is around index 11? No, let's map standard Ludo board indices roughly
    // 0 = Red Start (left side of top arm, moving up? No, usually moving Clockwise)
    // Let's assume Clockwise.
    // 0 (Red Start): (10%, 40%) -> Move Up -> Right -> Down -> Left
    
    // We break the 52 steps into 4 sides of 13 steps
    const side = Math.floor(normalizedIndex / 13);
    const localStep = normalizedIndex % 13;

    // RECTANGULAR LOGIC REFINED
    // 0-12: Top Side (Left to Right)
    // 13-25: Right Side (Top to Bottom)
    // 26-38: Bottom Side (Right to Left)
    // 39-51: Left Side (Bottom to Top)
    
    if (normalizedIndex < 13) { // Top
        return { x: 15 + (normalizedIndex * 5.8), y: 10 };
    } else if (normalizedIndex < 26) { // Right
        return { x: 90, y: 15 + ((normalizedIndex - 13) * 5.8) };
    } else if (normalizedIndex < 39) { // Bottom
        return { x: 85 - ((normalizedIndex - 26) * 5.8), y: 90 };
    } else { // Left
        return { x: 10, y: 85 - ((normalizedIndex - 39) * 5.8) };
    }
};

export const GameRoom: React.FC<GameRoomProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [currentTurn, setCurrentTurn] = useState<PlayerColor>('Red');
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceRolled, setDiceRolled] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [lastMovedPieceId, setLastMovedPieceId] = useState<number | null>(null);

  const isP2P = !!socket && !!socketGame;
  const myColor: PlayerColor = socketGame && socketGame.players[0] === user.id ? 'Red' : 'Yellow';

  // Initialize Pieces locally if not P2P (or fallback)
  useEffect(() => {
      if (!isP2P && pieces.length === 0) {
          const initPieces: Piece[] = [];
          for(let i=0; i<4; i++) initPieces.push({ id: i, color: 'Red', step: -1 });
          for(let i=0; i<4; i++) initPieces.push({ id: i+4, color: 'Yellow', step: -1 });
          setPieces(initPieces);
      }
  }, [isP2P]);

  // --- SYNC ---
  useEffect(() => {
      if (isP2P && socketGame) {
          if (socketGame.gameState && socketGame.gameState.pieces) setPieces(socketGame.gameState.pieces);
          if (socketGame.gameState && socketGame.gameState.diceValue) setDiceValue(socketGame.gameState.diceValue);
          if (socketGame.gameState) setDiceRolled(socketGame.gameState.diceRolled);
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
      
      // Local or P2P logic
      if (socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } });
      } else {
          // Offline Logic
          const val = Math.ceil(Math.random() * 6);
          setDiceValue(val);
          setDiceRolled(true);
      }
      playSFX('dice');
  };

  const handlePieceClick = (p: Piece) => {
      if (currentTurn !== myColor || !diceRolled || !diceValue) return;
      if (p.color !== myColor) return;
      
      // 1. Validate Move (Can move out of base?)
      if (p.step === -1 && diceValue !== 6) {
          playSFX('error');
          return;
      }

      // 2. Calculate New Step
      const nextStep = p.step === -1 ? 0 : p.step + diceValue;
      if (nextStep > 56) {
          playSFX('error'); // Overshoot
          return; 
      }

      let newPieces = pieces.map(piece => piece.id === p.id ? { ...piece, step: nextStep } : piece);
      let captured = false;

      // 3. Collision / Capture Logic
      // Only check if landing on main track (0-50)
      if (nextStep >= 0 && nextStep <= 50) {
          // Calculate Normalized Index for the moving piece
          const myNormalized = p.color === 'Red' ? nextStep : (nextStep + 26) % 52;
          
          // Check against ALL other pieces
          newPieces = newPieces.map(other => {
              if (other.id === p.id) return other; // Skip self
              if (other.color === p.color) return other; // Skip teammates (stacking allowed visually)
              if (other.step === -1 || other.step > 50) return other; // Skip base/home pieces

              // Calculate opponent's normalized index
              const otherNormalized = other.color === 'Red' ? other.step : (other.step + 26) % 52;

              if (myNormalized === otherNormalized) {
                  // LANDED ON OPPONENT!
                  if (SAFE_ZONES.includes(myNormalized)) {
                      // Safe Zone: No capture, just coexist
                      return other;
                  } else {
                      // CAPTURE!
                      playSFX('capture');
                      captured = true;
                      return { ...other, step: -1 }; // Send home
                  }
              }
              return other;
          });
      }

      // 4. Update State / Emit
      setLastMovedPieceId(p.id);
      
      // Determine if bonus turn (6 rolled or capture made)
      const bonusTurn = diceValue === 6 || captured;

      if (socket) {
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: { 
                  type: 'MOVE_PIECE', 
                  pieces: newPieces, 
                  bonusTurn: bonusTurn 
              } 
          });
      } else {
          // Local Update
          setPieces(newPieces);
          setDiceRolled(false);
          setDiceValue(null);
          if (!bonusTurn) {
              setCurrentTurn(currentTurn === 'Red' ? 'Yellow' : 'Red');
              // Trigger Bot if offline (omitted for brevity)
          }
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
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 p-4 gap-4">
                            {[0,1,2,3].map(i => <div key={i} className="bg-red-200 rounded-full border-2 border-red-400 opacity-50"></div>)}
                        </div>
                        <Crown className="text-red-500 relative z-10 w-12 h-12" />
                    </div>
                </div>

                {/* Yellow Base (Bottom Right) */}
                <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-white border-l-4 border-t-4 border-royal-800 p-4">
                    <div className="w-full h-full bg-yellow-100 rounded-3xl border-4 border-yellow-500 flex items-center justify-center relative">
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 p-4 gap-4">
                            {[0,1,2,3].map(i => <div key={i} className="bg-yellow-200 rounded-full border-2 border-yellow-400 opacity-50"></div>)}
                        </div>
                        <Crown className="text-yellow-500 relative z-10 w-12 h-12" />
                    </div>
                </div>

                {/* Home Run Tracks */}
                {/* Red Home (Left) */}
                <div className="absolute top-[40%] left-0 w-[40%] h-[20%] flex items-center p-2">
                    <div className="w-full h-8 bg-red-100 rounded-full flex items-center px-2 space-x-1 border border-red-300">
                        {[1,2,3,4,5].map(i => <div key={i} className="h-6 w-full bg-red-500 rounded-sm opacity-20"></div>)}
                    </div>
                </div>
                {/* Yellow Home (Right) */}
                <div className="absolute top-[40%] right-0 w-[40%] h-[20%] flex items-center p-2">
                    <div className="w-full h-8 bg-yellow-100 rounded-full flex items-center px-2 space-x-1 border border-yellow-300">
                        {[1,2,3,4,5].map(i => <div key={i} className="h-6 w-full bg-yellow-500 rounded-sm opacity-20"></div>)}
                    </div>
                </div>
                
                {/* Center */}
                <div className="absolute top-[40%] left-[40%] w-[20%] h-[20%] bg-gradient-to-br from-royal-800 to-royal-950 flex items-center justify-center border-4 border-white shadow-inner z-10">
                    <div className="text-center">
                        <div className="text-white font-black text-xs">VANTAGE</div>
                        <Star className="text-gold-400 w-6 h-6 mx-auto mt-1 animate-pulse" fill="currentColor" />
                    </div>
                </div>

                {/* Safe Zones (Visual) */}
                {/* Simplified visual markers for safe zones */}
                <div className="absolute top-[10%] left-[40%] w-[20%] h-[5%] bg-slate-300/30 flex justify-center"><Shield size={12} className="text-slate-400 opacity-50" /></div>
            </div>

            {/* Pieces Layer */}
            <AnimatePresence>
            {pieces.map((p, i) => {
                const pos = getPiecePosition(p.color, p.step, i);
                // Check if multiple pieces on same spot to offset slightly
                const stackIndex = pieces.filter((other, idx) => idx < i && other.step === p.step && other.color === p.color && p.step !== -1).length;
                const offset = stackIndex * 4;

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
                            absolute w-6 h-6 md:w-8 md:h-8 -ml-3 -mt-3 md:-ml-4 md:-mt-4 rounded-full border-2 border-white shadow-[0_4px_6px_rgba(0,0,0,0.4)] cursor-pointer 
                            ${p.color === 'Red' ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-yellow-400 to-yellow-600'}
                            ${currentTurn === myColor && p.color === myColor && diceRolled ? 'ring-4 ring-white/50 animate-pulse' : ''}
                            ${lastMovedPieceId === p.id ? 'z-50' : ''}
                        `}
                    >
                        <div className="absolute inset-2 rounded-full bg-white/20"></div>
                        {/* Star for safe */}
                        {p.step !== -1 && SAFE_ZONES.includes(p.color === 'Red' ? p.step : (p.step + 26) % 52) && (
                            <div className="absolute -top-2 -right-2 text-gold-400 drop-shadow-md"><Shield size={10} fill="currentColor" /></div>
                        )}
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

        {/* P2P Chat */}
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