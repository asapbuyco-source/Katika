import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Club, Diamond, Heart, Spade, Layers, AlertTriangle, HelpCircle, X as XIcon, Zap, ShieldAlert, Hand, Crown } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';

interface CardGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

// ... existing Card types and CardView component ...
// (Assume CardView component and types Card, Suit, Rank are defined as before)
type Suit = 'H' | 'D' | 'C' | 'S';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A';
interface Card { id: string; suit: Suit; rank: Rank; }

const CardView = ({ card, isFaceDown, isPlayable, onClick, style }: any) => {
    // ... simplified view logic ...
    return (
        <motion.div 
            layoutId={card?.id} 
            onClick={onClick} 
            style={style}
            className={`relative w-24 h-36 rounded-xl shadow-2xl border border-black/10 select-none ${isFaceDown ? 'bg-royal-800' : 'bg-white'} ${isPlayable ? 'cursor-pointer ring-4 ring-green-400' : ''}`}
        >
            {/* Render card content or back */}
            {!isFaceDown && card && <div className="text-black font-bold p-2">{card.rank}{card.suit}</div>}
        </motion.div>
    );
};

export const CardGame: React.FC<CardGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [oppHandCount, setOppHandCount] = useState(0);
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [activeSuit, setActiveSuit] = useState<Suit | null>(null); 
  const [turn, setTurn] = useState<'me' | 'opp'>('me');
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [showSuitSelector, setShowSuitSelector] = useState(false);

  const isP2P = !!socket && !!socketGame;

  // Sync State
  useEffect(() => {
      if (isP2P && socketGame) {
          if (socketGame.hands && socketGame.hands[user.id]) {
              setMyHand(socketGame.hands[user.id]);
              
              // Count opponent cards
              const oppId = socketGame.players.find((id: string) => id !== user.id);
              if (socketGame.hands[oppId]) setOppHandCount(socketGame.hands[oppId].length);
          }
          if (socketGame.discardPile) setDiscardPile(socketGame.discardPile);
          if (socketGame.activeSuit) setActiveSuit(socketGame.activeSuit);
          if (socketGame.turn) setTurn(socketGame.turn === user.id ? 'me' : 'opp');
          
          if (socketGame.winner) {
              onGameEnd(socketGame.winner === user.id ? 'win' : 'loss');
          }
      }
  }, [socketGame, user.id, isP2P]);

  const playCard = (card: Card) => {
      if (turn !== 'me') return;
      // Validation Logic
      const top = discardPile[discardPile.length - 1];
      const valid = card.rank === 'J' || card.suit === activeSuit || (top && card.rank === top.rank);
      
      if (!valid) { playSFX('error'); return; }

      if (card.rank === 'J') {
          // Show selector, hold emit until selection
          setShowSuitSelector(true);
          // Assuming implementation stores pending card
      } else {
          // Emit Move
          if (isP2P && socket) {
              socket.emit('game_action', {
                  roomId: socketGame.roomId,
                  action: { type: 'PLAY', card: card }
              });
          }
          playSFX('move');
      }
  };

  const drawCard = () => {
      if (turn !== 'me') return;
      if (isP2P && socket) {
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: { type: 'DRAW', passTurn: true }
          });
      }
      playSFX('move');
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Simple Layout for brevity */}
        <div className="text-white text-center mt-4">
            <h2 className="text-xl font-bold">Opponent: {oppHandCount} Cards</h2>
        </div>
        
        <div className="flex-1 flex items-center justify-center gap-8">
            <div className="bg-royal-800 p-4 rounded-xl border border-white/10" onClick={drawCard}>
                Deck
            </div>
            <div className="relative">
                {discardPile.slice(-1).map(c => <CardView key={c.id} card={c} />)}
            </div>
        </div>

        <div className="w-full flex justify-center gap-2 overflow-x-auto pb-4">
            {myHand.map(c => (
                <CardView key={c.id} card={c} isPlayable={turn === 'me'} onClick={() => playCard(c)} />
            ))}
        </div>
        <div className="text-center text-white font-bold mb-4">
            {turn === 'me' ? "Your Turn" : "Opponent's Turn"}
        </div>
    </div>
  );
};