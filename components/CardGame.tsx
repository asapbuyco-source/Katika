import React, { useState, useEffect } from 'react';
import { ArrowLeft, Club, Diamond, Heart, Spade, Layers, Zap, X, Check } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';

interface CardGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

type Suit = 'H' | 'D' | 'C' | 'S';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A';
interface Card { id: string; suit: Suit; rank: Rank; }

const SuitIcon = ({ suit, size = 16 }: { suit: Suit, size?: number }) => {
    switch(suit) {
        case 'H': return <Heart size={size} className="text-red-500" fill="currentColor" />;
        case 'D': return <Diamond size={size} className="text-red-500" fill="currentColor" />;
        case 'C': return <Club size={size} className="text-black" fill="currentColor" />;
        case 'S': return <Spade size={size} className="text-black" fill="currentColor" />;
    }
};

const CardView = ({ card, isFaceDown, isPlayable, onClick, style }: any) => {
    return (
        <motion.div 
            layoutId={card?.id} 
            onClick={onClick} 
            style={style}
            whileHover={isPlayable ? { y: -10 } : {}}
            className={`
                relative w-20 h-32 md:w-24 md:h-36 rounded-xl shadow-lg border border-black/10 select-none flex items-center justify-center overflow-hidden transition-transform
                ${isFaceDown ? 'bg-royal-800 border-royal-700' : 'bg-white'} 
                ${isPlayable ? 'cursor-pointer ring-2 ring-gold-400' : ''}
            `}
        >
            {isFaceDown ? (
                <div className="absolute inset-2 border-2 border-white/10 rounded-lg flex items-center justify-center opacity-50">
                    <Layers className="text-white" />
                </div>
            ) : (
                card && (
                    <>
                        <div className="absolute top-1 left-1 flex flex-col items-center">
                            <span className={`font-bold text-lg leading-none ${(card.suit === 'H' || card.suit === 'D') ? 'text-red-500' : 'text-black'}`}>{card.rank}</span>
                            <SuitIcon suit={card.suit} size={12} />
                        </div>
                        <SuitIcon suit={card.suit} size={32} />
                        <div className="absolute bottom-1 right-1 flex flex-col items-center rotate-180">
                            <span className={`font-bold text-lg leading-none ${(card.suit === 'H' || card.suit === 'D') ? 'text-red-500' : 'text-black'}`}>{card.rank}</span>
                            <SuitIcon suit={card.suit} size={12} />
                        </div>
                    </>
                )
            )}
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
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [deckSize, setDeckSize] = useState(0);

  const isP2P = !!socket && !!socketGame;

  // Sync State
  useEffect(() => {
      if (isP2P && socketGame) {
          if (socketGame.gameState && socketGame.gameState.hands && socketGame.gameState.hands[user.id]) {
              setMyHand(socketGame.gameState.hands[user.id]);
              
              // Count opponent cards
              const oppId = socketGame.players.find((id: string) => id !== user.id);
              if (socketGame.gameState.hands[oppId]) setOppHandCount(socketGame.gameState.hands[oppId].length);
          }
          if (socketGame.gameState && socketGame.gameState.discardPile) setDiscardPile(socketGame.gameState.discardPile);
          if (socketGame.gameState && socketGame.gameState.activeSuit) setActiveSuit(socketGame.gameState.activeSuit);
          if (socketGame.turn) setTurn(socketGame.turn === user.id ? 'me' : 'opp');
          if (socketGame.gameState && socketGame.gameState.deck) setDeckSize(socketGame.gameState.deck.length);
          
          if (socketGame.winner) {
              onGameEnd(socketGame.winner === user.id ? 'win' : 'loss');
          }
      }
  }, [socketGame, user.id, isP2P]);

  const playCard = (card: Card) => {
      if (turn !== 'me') return;
      
      const top = discardPile[discardPile.length - 1];
      const isJack = card.rank === 'J';
      const matchesSuit = card.suit === activeSuit;
      const matchesRank = top && card.rank === top.rank;
      
      if (!isJack && !matchesSuit && !matchesRank) { 
          playSFX('error'); 
          return; 
      }

      if (isJack) {
          setPendingCard(card);
          setShowSuitSelector(true);
      } else {
          emitMove(card);
      }
  };

  const emitMove = (card: Card, overrideSuit?: Suit) => {
      if (isP2P && socket) {
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: { type: 'PLAY', card: card, suit: overrideSuit || card.suit }
          });
      }
      playSFX('move');
      setShowSuitSelector(false);
      setPendingCard(null);
  };

  const handleSuitSelect = (suit: Suit) => {
      if (pendingCard) emitMove(pendingCard, suit);
  };

  const handleCancelSuitSelect = () => {
      setShowSuitSelector(false);
      setPendingCard(null);
  };

  const drawCard = () => {
      if (turn !== 'me') return;
      
      if (deckSize === 0) {
          playSFX('error'); // Cannot draw if deck empty
          return;
      }

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
        
        {/* SUIT SELECTOR MODAL */}
        <AnimatePresence>
            {showSuitSelector && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-royal-900 border border-gold-500 rounded-2xl p-6 shadow-2xl relative"
                    >
                        <button onClick={handleCancelSuitSelect} className="absolute top-2 right-2 text-slate-400 hover:text-white">
                            <X size={20} />
                        </button>
                        <h3 className="text-white font-bold text-center mb-4">Select a Suit</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {['H', 'D', 'C', 'S'].map((s) => (
                                <button 
                                    key={s}
                                    onClick={() => handleSuitSelect(s as Suit)}
                                    className="w-20 h-20 rounded-xl bg-white flex items-center justify-center hover:scale-105 transition-transform"
                                >
                                    <SuitIcon suit={s as Suit} size={40} />
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Header */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-6 mt-4">
             <button onClick={() => onGameEnd('quit')} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
             </button>
             <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
             </div>
             <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
        </div>

        {/* Opponent Hand */}
        <div className="flex justify-center -space-x-4 mb-8">
            {Array.from({ length: Math.min(oppHandCount, 5) }).map((_, i) => (
                <CardView key={`opp-${i}`} isFaceDown={true} style={{ transform: `rotate(${(i - 2) * 5}deg)` }} />
            ))}
            {oppHandCount > 5 && (
                <div className="w-20 h-32 md:w-24 md:h-36 rounded-xl bg-royal-800 border border-white/10 flex items-center justify-center text-white font-bold">
                    +{oppHandCount - 5}
                </div>
            )}
        </div>
        
        {/* Game Center */}
        <div className="flex-1 flex items-center justify-center gap-12">
            
            {/* Draw Deck */}
            <div className="relative cursor-pointer group" onClick={drawCard}>
                <div className="absolute top-1 left-1 w-24 h-36 bg-royal-800 rounded-xl border border-white/5"></div>
                <div className="relative w-24 h-36 bg-royal-800 rounded-xl border-2 border-white/20 flex items-center justify-center group-hover:-translate-y-2 transition-transform overflow-hidden">
                    {deckSize === 0 ? (
                        <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Empty</span>
                    ) : (
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Draw ({deckSize})</span>
                    )}
                </div>
            </div>

            {/* Discard Pile */}
            <div className="relative">
                {discardPile.slice(-2).map((c, i) => (
                    <div key={c.id} className="absolute top-0 left-0" style={{ transform: `rotate(${i * 5}deg)` }}>
                        <CardView card={c} />
                    </div>
                ))}
                {/* Active Suit Indicator */}
                {activeSuit && (
                    <div className="absolute -right-16 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-gold-500 animate-pulse">
                        <SuitIcon suit={activeSuit} size={20} />
                    </div>
                )}
            </div>
        </div>

        {/* Player Hand */}
        <div className="w-full max-w-4xl mt-8">
            <div className="text-center text-white font-bold mb-4 flex justify-center items-center gap-2">
                {turn === 'me' ? (
                    <span className="text-gold-400 flex items-center gap-2"><Zap size={16} /> Your Turn</span>
                ) : (
                    <span className="text-slate-500">Opponent's Turn...</span>
                )}
            </div>
            
            <div className="flex justify-center -space-x-8 md:-space-x-6 overflow-x-auto pb-8 pt-4 px-4 min-h-[160px]">
                {myHand.map((c, i) => {
                    const top = discardPile[discardPile.length - 1];
                    const playable = turn === 'me' && (c.rank === 'J' || c.suit === activeSuit || (top && c.rank === top.rank));
                    
                    return (
                        <div key={c.id} className="transition-all hover:-translate-y-6 hover:z-10">
                            <CardView 
                                card={c} 
                                isPlayable={playable} 
                                onClick={() => playCard(c)} 
                            />
                        </div>
                    );
                })}
            </div>
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