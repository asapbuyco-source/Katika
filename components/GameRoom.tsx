
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
const getPiecePosition = (color: PlayerColor, step: number, pieceIndex: number) => {
    // 1. Base Positions (Home)
    if (step === -1) {
        if (color === 'Red') {
            const positions = [{x: 12, y: 12}, {x: 28, y: 12}, {x: 12, y: 28}, {x: 28, y: 28}]; 
            return positions[pieceIndex % 4];
        } else {
            const positions = [{x: 72, y: 72}, {x: 88, y: 72}, {x: 72, y: 88}, {x: 88, y: 88}]; 
            return positions[pieceIndex % 4];
        }
    }

    // 2. Home Straight (Victory Road)
    if (step >= 51) {
        const homeIndex = step - 51; 
        const progress = 10 + (homeIndex * 6.5); 
        
        if (color === 'Red') return { x: progress, y: 50 }; 
        if (color === 'Yellow') return { x: 100 - progress, y: 50 }; 
    }

    // 3. Main Track
    // We normalize the visual path so 0 is Red Start, 26 is Yellow Start.
    // The visual loop is 52 steps.
    let visualIndex = step;
    if (color === 'Yellow') {
        // Yellow starts 26 steps ahead of Red visually
        visualIndex = (step + 26) % 52;
    }

    if (visualIndex < 6) { 
        return { x: 10 + (visualIndex * 6.6), y: 40 }; // Top-Left towards Center
    } else if (visualIndex < 12) {
        return { x: 40, y: 10 + ((visualIndex - 6) * 6.6) }; // Top-Vertical Up
    } else if (visualIndex < 14) {
        return { x: 50 + ((visualIndex - 12) * 5), y: 10 }; // Top-Right Corner
    } else if (visualIndex < 20) {
        return { x: 60, y: 10 + ((visualIndex - 14) * 6.6) }; // Top-Vertical Down
    } else if (visualIndex < 26) {
        return { x: 60 + ((visualIndex - 20) * 6.6), y: 40 }; // Right-Horizontal Out
    } else if (visualIndex < 28) {
        return { x: 90, y: 50 + ((visualIndex - 26) * 5) }; // Right-Bottom Corner
    } else if (visualIndex < 34) {
        return { x: 90 - ((visualIndex - 28) * 6.6), y: 60 }; // Right-Horizontal In
    } else if (visualIndex < 40) {
        return { x: 60, y: 60 + ((visualIndex - 34) * 6.6) }; // Bottom-Vertical Down
    } else if (visualIndex < 42) {
        return { x: 50 - ((visualIndex - 40) * 5), y: 90 }; // Bottom-Left Corner
    } else if (visualIndex < 48) {
        return { x: 40, y: 90 - ((visualIndex - 42) * 6.6) }; // Bottom-Vertical Up
    } else {
        return { x: 40 - ((visualIndex - 48) * 6.6), y: 60 }; // Left-Horizontal Out
    }
};

// Simplified path mapper for reliability:
// 0-5: Red Home Straight Out
// 6-11: Top Vertical
// 12: Top Right Corner
// 13-18: Top Right Vertical
// ... better to map specific coordinates for 52 steps if time allows, but let's approximate better
const getSmartPosition = (color: PlayerColor, step: number, pieceIndex: number) => {
    if (step === -1) {
        if (color === 'Red') return [{x: 12, y: 12}, {x: 28, y: 12}, {x: 12, y: 28}, {x: 28, y: 28}][pieceIndex%4];
        else return [{x: 72, y: 72}, {x: 88, y: 72}, {x: 72, y: 88}, {x: 88, y: 88}][pieceIndex%4];
    }
    
    // Victory Road
    if (step >= 51) {
        const offset = (step - 51) * 6;
        if (color === 'Red') return { x: 10 + offset, y: 50 };
        else return { x: 90 - offset, y: 50 };
    }

    // Main Track (0-51)
    let pos = step;
    if (color === 'Yellow') pos = (step + 26) % 52;

    // Define corner waypoints
    // 0 -> 5: (10, 40) -> (40, 40)
    if (pos <= 5) return { x: 8 + (pos * 6), y: 40 };
    // 6 -> 11: (40, 35) -> (40, 5)
    if (pos <= 11) return { x: 42, y: 38 - ((pos-6) * 6) };
    // 12: Top Middle
    if (pos === 12) return { x: 50, y: 5 };
    // 13 -> 18: (55, 5) -> (55, 35)
    if (pos <= 18) return { x: 58, y: 8 + ((pos-13) * 6) };
    // 19 -> 24: (60, 40) -> (90, 40)
    if (pos <= 24) return { x: 62 + ((pos-19) * 6), y: 40 };
    // 25: Right Middle
    if (pos === 25) return { x: 95, y: 50 };
    // 26 -> 31: (90, 55) -> (60, 55)
    if (pos <= 31) return { x: 92 - ((pos-26) * 6), y: 60 };
    // 32 -> 37: (55, 60) -> (55, 90)
    if (pos <= 37) return { x: 58, y: 62 + ((pos-32) * 6) };
    // 38: Bottom Middle
    if (pos === 38) return { x: 50, y: 95 };
    // 39 -> 44: (40, 90) -> (40, 60)
    if (pos <= 44) return { x: 42, y: 92 - ((pos-39) * 6) };
    // 45 -> 50: (40, 55) -> (10, 55)
    if (pos <= 50) return { x: 38 - ((pos-45) * 6), y: 60 };
    // 51: Left Middle
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
  const myColor: PlayerColor = socketGame && socketGame.players[0] === user.id ? 'Red' : 'Yellow';

  // Initialize Pieces
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
      
      if (socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } });
      } else {
          const val = Math.ceil(Math.random() * 6);
          setDiceValue(val);
          setDiceRolled(true);
      }
      playSFX('dice');
  };

  const handlePieceClick = (p: Piece) => {
      if (currentTurn !== myColor || !diceRolled || !diceValue) return;
      if (p.color !== myColor) return;
      
      // Send intention to server
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
          playSFX('error'); 
          return; 
      }

      let newPieces = pieces.map(piece => piece.id === p.id ? { ...piece, step: nextStep } : piece);
      let captured = false;

      if (nextStep >= 0 && nextStep <= 50) {
          const myNormalized = p.color === 'Red' ? nextStep : (nextStep + 26) % 52;
          
          newPieces = newPieces.map(other => {
              if (other.id === p.id) return other; 
              if (other.color === p.color) return other; 
              if (other.step === -1 || other.step > 50) return other; 

              const otherNormalized = other.color === 'Red' ? other.step : (other.step + 26) % 52;

              if (myNormalized === otherNormalized) {
                  if (SAFE_ZONES.includes(myNormalized)) {
                      return other;
                  } else {
                      playSFX('capture');
                      captured = true;
                      return { ...other, step: -1 }; 
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
