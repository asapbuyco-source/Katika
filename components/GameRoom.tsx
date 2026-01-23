import React, { useState, useEffect } from 'react';
import { ArrowLeft, Dice5, Crown } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';

// ... (Imports and interfaces unchanged)

interface GameRoomProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

type PlayerColor = 'Red' | 'Yellow';
interface Piece { id: number; color: PlayerColor; step: number; owner?: string; }

// COORDINATE MAPPING FOR LUDO BOARD (Simplified 15x15 grid concept flattened to % coords)
// ... (Coordinate logic unchanged)
const getPiecePosition = (color: PlayerColor, step: number, pieceIndex: number) => {
    // Base Positions (Home)
    if (step === -1) {
        if (color === 'Red') {
            const positions = [{x: 10, y: 10}, {x: 25, y: 10}, {x: 10, y: 25}, {x: 25, y: 25}]; // Top Left Base
            return positions[pieceIndex % 4];
        } else {
            const positions = [{x: 75, y: 75}, {x: 90, y: 75}, {x: 75, y: 90}, {x: 90, y: 90}]; // Bottom Right Base
            return positions[pieceIndex % 4];
        }
    }

    // Main Path Logic (Simplified Visual Path - not exact Ludo but playable loop)
    // We define a set of waypoints for the outer track and interpolate
    // 0-51 is outer track. 52-56 is home straight.
    
    // Normalize step based on color start offset
    // Red starts at 0. Yellow starts at 26 (halfway).
    let normalizedStep = step;
    if (color === 'Yellow') normalizedStep = (step + 26);
    
    // Check if entered home straight
    if (step > 50) {
        // Home Straight
        const homeOffset = step - 51; // 1 to 5
        if (color === 'Red') return { x: 10 + (homeOffset * 6), y: 50 }; // Left to Center
        if (color === 'Yellow') return { x: 90 - (homeOffset * 6), y: 50 }; // Right to Center
    }

    // Outer Loop (0-51)
    // Define corner percentages
    // 0: Start Red (10, 40)
    // 1-5: Move Right
    // ... Simplified rectangular path for MVP
    
    const trackStep = normalizedStep % 52;
    
    // Top-Left to Top-Right
    if (trackStep >= 0 && trackStep < 13) {
        // Moving generally Right/Up arc
        // Simplified: Rectangular perimeter
        if (trackStep < 6) return { x: 40, y: 40 - (trackStep * 6) }; // Up
        if (trackStep === 6) return { x: 50, y: 5 }; // Top Middle
        return { x: 60, y: 10 + ((trackStep-7) * 6) }; // Down to middle
    }
    // Top-Right to Bottom-Right
    if (trackStep >= 13 && trackStep < 26) {
        const local = trackStep - 13;
        if (local < 6) return { x: 60 + (local * 6), y: 40 }; // Right
        if (local === 6) return { x: 95, y: 50 }; // Right Middle
        return { x: 90 - ((local-7) * 6), y: 60 }; // Left to middle
    }
    // Bottom-Right to Bottom-Left
    if (trackStep >= 26 && trackStep < 39) {
        const local = trackStep - 26;
        if (local < 6) return { x: 60, y: 60 + (local * 6) }; // Down
        if (local === 6) return { x: 50, y: 95 }; // Bottom Middle
        return { x: 40, y: 90 - ((local-7) * 6) }; // Up to middle
    }
    // Bottom-Left to Top-Left
    if (trackStep >= 39 && trackStep < 52) {
        const local = trackStep - 39;
        if (local < 6) return { x: 40 - (local * 6), y: 60 }; // Left
        if (local === 6) return { x: 5, y: 50 }; // Left Middle
        return { x: 10 + ((local-7) * 6), y: 40 }; // Right to start
    }

    return { x: 50, y: 50 }; // Center Fallback
};

export const GameRoom: React.FC<GameRoomProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [currentTurn, setCurrentTurn] = useState<PlayerColor>('Red');
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceRolled, setDiceRolled] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);

  const isP2P = !!socket && !!socketGame;
  const myColor: PlayerColor = socketGame && socketGame.players[0] === user.id ? 'Red' : 'Yellow';

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
      if (socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } });
          playSFX('dice');
      }
  };

  const handlePieceClick = (p: Piece) => {
      if (currentTurn !== myColor || !diceRolled || !diceValue) return;
      
      // Basic Local Move Validation
      if (p.color !== myColor) return;
      
      // Calculate New State Locally (Optimistic)
      const nextStep = p.step === -1 ? (diceValue === 6 ? 0 : -1) : p.step + diceValue;
      if (nextStep === p.step && p.step === -1) {
          playSFX('error');
          return; // Can't move out
      }
      if (nextStep > 56) {
          playSFX('error');
          return; // Overshoot
      }

      const newPieces = pieces.map(piece => piece.id === p.id ? { ...piece, step: nextStep } : piece);
      
      // Check captures locally (Reset opponent if landed on)
      const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; // Fixed safe zones on board
      const landedPiece = newPieces.find(piece => piece.id === p.id);
      
      if (landedPiece && landedPiece.step !== -1 && !safeZones.includes(landedPiece.step % 52)) {
          // Check collision
          // Note: Logic for collision needs precise coordinate matching or step matching
          // Simplified: If another piece of DIFFERENT color is at same normalized step
          // (Requires complex normalization logic matching the visual path, simplified here)
      }

      if (socket) {
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: { 
                  type: 'MOVE_PIECE', 
                  pieces: newPieces, 
                  bonusTurn: diceValue === 6 
              } 
          });
          playSFX('move');
      }
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Simple Ludo UI */}
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
            <div className="absolute inset-0 grid grid-cols-15 grid-rows-15 bg-[#fff3e0]">
                {/* Red Base */}
                <div className="col-span-6 row-span-6 bg-red-500 border-4 border-white m-4 rounded-3xl flex items-center justify-center">
                    <div className="bg-white p-8 rounded-full"><Crown className="text-red-500" /></div>
                </div>
                {/* Yellow Base */}
                <div className="col-start-10 col-span-6 row-start-10 row-span-6 bg-yellow-400 border-4 border-white m-4 rounded-3xl flex items-center justify-center">
                    <div className="bg-white p-8 rounded-full"><Crown className="text-yellow-400" /></div>
                </div>
                
                {/* Center */}
                <div className="col-start-7 col-span-3 row-start-7 row-span-3 bg-gradient-to-br from-red-500 to-yellow-400 flex items-center justify-center">
                    <div className="text-white font-black text-xs">WIN</div>
                </div>
            </div>

            {/* Pieces Layer */}
            {pieces.map((p, i) => {
                const pos = getPiecePosition(p.color, p.step, i);
                return (
                    <motion.div 
                        key={p.id}
                        layoutId={`p-${p.id}`}
                        initial={{ scale: 0 }}
                        animate={{ 
                            top: `${pos.y}%`, 
                            left: `${pos.x}%`, 
                            scale: 1 
                        }}
                        transition={{ type: "spring", damping: 20, stiffness: 100 }}
                        onClick={() => handlePieceClick(p)}
                        className={`
                            absolute w-6 h-6 md:w-8 md:h-8 -ml-3 -mt-3 md:-ml-4 md:-mt-4 rounded-full border-2 border-white shadow-[0_4px_6px_rgba(0,0,0,0.4)] z-20 cursor-pointer 
                            ${p.color === 'Red' ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-yellow-400 to-yellow-600'}
                            ${currentTurn === myColor && p.color === myColor && diceRolled ? 'ring-4 ring-white/50 animate-pulse' : ''}
                        `}
                    >
                        <div className="absolute inset-2 rounded-full bg-white/20"></div>
                    </motion.div>
                )
            })}
        </div>

        <div className="mt-8 flex flex-col items-center">
            {currentTurn === myColor && !diceRolled && (
                <button onClick={handleRoll} className="bg-gold-500 hover:bg-gold-400 text-royal-950 font-black px-12 py-4 rounded-2xl shadow-[0_0_20px_rgba(251,191,36,0.4)] flex items-center gap-3 transition-transform active:scale-95">
                    <Dice5 size={24} /> ROLL DICE
                </button>
            )}
            {diceRolled && (
                <div className="flex flex-col items-center">
                    <div className="bg-white text-royal-950 font-black text-5xl w-20 h-20 flex items-center justify-center rounded-2xl shadow-xl mb-4 border-4 border-gold-500">
                        {diceValue}
                    </div>
                    {currentTurn === myColor && <p className="text-gold-400 text-sm font-bold animate-bounce">Select a piece to move</p>}
                </div>
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