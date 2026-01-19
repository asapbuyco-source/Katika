import React, { useState, useEffect } from 'react';
import { ArrowLeft, Dice5, Crown } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';

interface GameRoomProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

// ... existing Ludo types & logic helpers ...
type PlayerColor = 'Red' | 'Yellow';
interface Piece { id: number; color: PlayerColor; step: number; owner?: string; }

// (Assume board coordinates/path helpers exist as before)

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
          if (socketGame.pieces) setPieces(socketGame.pieces);
          if (socketGame.turn) setCurrentTurn(socketGame.turn === socketGame.players[0] ? 'Red' : 'Yellow');
          if (socketGame.diceValue) setDiceValue(socketGame.diceValue);
          setDiceRolled(socketGame.diceRolled);
          
          if (socketGame.winner) {
              onGameEnd(socketGame.winner === user.id ? 'win' : 'loss');
          }
      }
  }, [socketGame, user.id, isP2P]);

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
      
      // Calculate New State Locally (Optimistic) or just emit intention
      // For simplified P2P, we calculate next state locally and send it
      const nextStep = p.step === -1 ? (diceValue === 6 ? 0 : -1) : p.step + diceValue;
      if (nextStep === p.step && p.step === -1) return; // Can't move out
      if (nextStep > 56) return; // Overshoot

      const newPieces = pieces.map(piece => piece.id === p.id ? { ...piece, step: nextStep } : piece);
      
      // Check captures locally to send final state
      // (Simplified logic: if land on opponent, reset opponent)
      
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
        <div className="text-white text-center mb-8">
            <h2 className="text-2xl font-bold">Ludo Arena</h2>
            <p className="text-sm text-gold-400">{currentTurn === myColor ? "YOUR TURN" : "OPPONENT'S TURN"}</p>
        </div>

        <div className="relative w-full max-w-[400px] aspect-square bg-white rounded-xl shadow-2xl grid grid-cols-11 grid-rows-11">
            {/* Placeholder Grid */}
            {pieces.map(p => (
                <motion.div 
                    key={p.id}
                    layoutId={`p-${p.id}`}
                    onClick={() => handlePieceClick(p)}
                    className={`absolute w-6 h-6 rounded-full border-2 border-white shadow-md z-10 cursor-pointer ${p.color === 'Red' ? 'bg-red-500' : 'bg-yellow-500'}`}
                    // Simplified positioning logic for demo
                    style={{ 
                        top: p.step === -1 ? (p.color === 'Red' ? '10%' : '80%') : '50%', 
                        left: p.step === -1 ? (p.id % 2 === 0 ? '10%' : '20%') : `${(p.step * 10) % 90}%`
                    }}
                />
            ))}
        </div>

        <div className="mt-8">
            {currentTurn === myColor && !diceRolled && (
                <button onClick={handleRoll} className="bg-gold-500 text-black font-bold px-8 py-4 rounded-xl shadow-lg flex items-center gap-2">
                    <Dice5 /> ROLL DICE
                </button>
            )}
            {diceRolled && (
                <div className="bg-white text-black font-black text-4xl p-4 rounded-xl shadow-lg">
                    {diceValue}
                </div>
            )}
        </div>
    </div>
  );
};