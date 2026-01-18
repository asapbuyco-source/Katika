
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Club, Diamond, Heart, Spade, Layers, AlertTriangle, HelpCircle, X as XIcon, Zap, ShieldAlert, Hand, Crown } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';

interface CardGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

// --- CARD TYPES & UTILS ---
type Suit = 'H' | 'D' | 'C' | 'S';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A';

interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ['H', 'D', 'C', 'S'];
const RANKS: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

const getRankValue = (r: Rank) => {
    if (r === 'A') return 14;
    if (r === 'K') return 13;
    if (r === 'Q') return 12;
    if (r === 'J') return 11;
    return parseInt(r);
};

const createDeck = (): Card[] => {
    const deck: Card[] = [];
    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            deck.push({ id: `${suit}${rank}`, suit, rank });
        });
    });
    // Fisher-Yates Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
};

// --- VISUAL COMPONENTS ---

interface CardViewProps {
    card?: Card;
    isFaceDown?: boolean;
    isPlayable?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
}

const CardView: React.FC<CardViewProps> = ({ card, isFaceDown, isPlayable, onClick, style }) => {
    const getColor = (s: Suit) => (s === 'H' || s === 'D') ? 'text-red-500' : 'text-slate-900';
    const getIcon = (s: Suit) => {
        switch(s) {
            case 'H': return <Heart size={16} fill="currentColor" />;
            case 'D': return <Diamond size={16} fill="currentColor" />;
            case 'C': return <Club size={16} fill="currentColor" />;
            case 'S': return <Spade size={16} fill="currentColor" />;
        }
    };

    return (
        <motion.div
            layoutId={card?.id ? `card-${card.id}` : undefined}
            whileHover={isPlayable ? { y: -45, scale: 1.15, zIndex: 60 } : {}}
            whileTap={isPlayable ? { scale: 0.95 } : {}}
            onClick={onClick}
            style={style}
            className={`
                relative w-24 h-36 rounded-xl shadow-2xl border border-black/10 select-none transition-all duration-300
                ${isFaceDown 
                    ? 'bg-royal-800 border-2 border-white/10' 
                    : 'bg-white'}
                ${isPlayable ? 'cursor-pointer ring-4 ring-green-400 shadow-[0_0_30px_rgba(74,222,128,0.5)] z-10' : ''}
            `}
        >
            {isFaceDown ? (
                <div className="w-full h-full rounded-xl bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-50 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-2 border-gold-500/30 flex items-center justify-center">
                        <span className="text-gold-500 font-bold text-xl">V</span>
                    </div>
                </div>
            ) : card && (
                <div className={`w-full h-full p-2 flex flex-col justify-between ${getColor(card.suit)}`}>
                    <div className="flex flex-col items-center leading-none">
                        <span className="text-2xl font-black font-display">{card.rank}</span>
                        {getIcon(card.suit)}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                        <div className="transform scale-[2.5]">{getIcon(card.suit)}</div>
                    </div>
                    <div className="flex flex-col items-center leading-none rotate-180">
                        <span className="text-2xl font-black font-display">{card.rank}</span>
                        {getIcon(card.suit)}
                    </div>
                    
                    {/* Special Card Indicators */}
                    {['7', 'A', 'J'].includes(card.rank) && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gold-500/40 -rotate-45 border-2 border-gold-500/20 px-1 rounded">
                                {card.rank === '7' ? 'PICK 2' : card.rank === 'A' ? 'SKIP' : 'CMD'}
                            </span>
                        </div>
                    )}

                    {/* Playable Indicator */}
                    {isPlayable && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">
                            <Zap size={12} className="text-white fill-current" />
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

// --- GAME LOGIC ---

export const CardGame: React.FC<CardGameProps> = ({ table, user, onGameEnd }) => {
  const [deck, setDeck] = useState<Card[]>([]);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [oppHandCount, setOppHandCount] = useState(0);
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [activeSuit, setActiveSuit] = useState<Suit | null>(null); 
  const [turn, setTurn] = useState<'me' | 'opp'>('me');
  const [gameStatus, setGameStatus] = useState<'dealing' | 'playing' | 'gameover'>('dealing');
  const [message, setMessage] = useState("Dealing cards...");
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSuitSelector, setShowSuitSelector] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  
  // Bot State Tracking
  const [oppHand, setOppHand] = useState<Card[]>([]);

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
      setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  // 1. Deal
  useEffect(() => {
      startNewGame();
  }, []);

  const startNewGame = () => {
      playSFX('dice'); // Shuffle sound
      const newDeck = createDeck();
      
      // Deal 5 cards each
      const me = newDeck.splice(0, 5);
      const opp = newDeck.splice(0, 5);
      const startCard = newDeck.shift()!;

      setTimeout(() => {
          setDeck(newDeck);
          setMyHand(me);
          setOppHand(opp);
          setOppHandCount(5);
          setDiscardPile([startCard]);
          setActiveSuit(startCard.suit);
          setGameStatus('playing');
          setTurn('me'); 
          setMessage("Your Turn");
          
          if (startCard.rank === '7') {
              addLog("Start card is 7. No penalty on first turn.", "secure");
          }
      }, 1000);
  };

  const isValidMove = (card: Card): boolean => {
      const top = discardPile[discardPile.length - 1];
      if (!top) return true;
      
      // 'J' (Jack) is "Je Commande" - can be played on anything
      if (card.rank === 'J') return true;
      
      // Match active suit
      if (card.suit === activeSuit) return true;
      
      // Match Rank
      if (card.rank === top.rank) return true;
      
      return false;
  };

  // 2. Turn Logic
  const handleCardClick = (card: Card) => {
      // Prevent interaction if game over or if suit selector is open
      if (turn !== 'me' || gameStatus !== 'playing' || showSuitSelector) return;
      
      if (isValidMove(card)) {
          playCard('me', card);
      } else {
          playSFX('error');
          addLog(`Invalid. Match ${activeSuit} or ${discardPile[discardPile.length-1]?.rank}.`, "alert");
      }
  };

  const handleSuitSelect = (suit: Suit) => {
      setActiveSuit(suit);
      setShowSuitSelector(false);
      playSFX('king');
      addLog(`You commanded: ${suit}`, "secure");
      setTurn('opp');
      setMessage("Opponent's Turn");
  };

  const playCard = (player: 'me' | 'opp', card: Card) => {
      playSFX('move');
      
      // Update Hands
      if (player === 'me') {
          setMyHand(prev => prev.filter(c => c.id !== card.id));
      } else {
          setOppHand(prev => prev.filter(c => c.id !== card.id));
          setOppHandCount(prev => prev - 1);
      }

      // Update Pile
      setDiscardPile(prev => [...prev, card]);
      
      // Default: active suit is card's suit, unless 'J' logic overrides
      if (card.rank !== 'J') {
          setActiveSuit(card.suit);
      }

      // Check Win (Check if hand became empty)
      const handSize = player === 'me' ? myHand.length - 1 : oppHandCount - 1;
      
      if (handSize === 0) {
          setGameStatus('gameover');
          if (player === 'me') {
              playSFX('win');
              onGameEnd('win');
          } else {
              playSFX('loss');
              onGameEnd('loss');
          }
          return;
      }

      // Process Effects
      let nextTurn: 'me' | 'opp' = player === 'me' ? 'opp' : 'me';
      let effectMsg = "";

      if (card.rank === 'J') {
          // "Je Commande" Logic
          effectMsg = "Je Commande! Choose Suit.";
          
          if (player === 'me') {
              // Show selector for user
              setShowSuitSelector(true);
              nextTurn = 'me'; // Hold turn until selection
          } else {
              // Bot Logic: Choose best suit
              const suitCounts = { H: 0, D: 0, C: 0, S: 0 };
              oppHand.forEach(c => suitCounts[c.suit]++);
              const bestSuit = (Object.keys(suitCounts) as Suit[]).reduce((a, b) => suitCounts[a] > suitCounts[b] ? a : b);
              
              setActiveSuit(bestSuit);
              effectMsg = `Opponent Commands: ${bestSuit}`;
              playSFX('king');
          }
          
      } else if (card.rank === '7') {
          effectMsg = "Pick 2 & Lose Turn!";
          playSFX('capture');
          handleDraw(nextTurn, 2);
          nextTurn = player; // Opponent loses turn, so current player goes again
      } else if (card.rank === 'A') {
          effectMsg = "Suspension! Play Again.";
          playSFX('capture'); // Sound effect for skip
          nextTurn = player; // Skip next player, play again
      }

      if (effectMsg) {
          setMessage(`${player === 'me' ? 'You' : 'Opponent'}: ${effectMsg}`);
          if (card.rank !== 'J') addLog(effectMsg, "scanning");
      } else {
          setMessage(nextTurn === 'me' ? "Your Turn" : "Opponent's Turn");
      }

      // Only switch turn if not holding for J selection
      if (card.rank !== 'J' || player !== 'me') {
          setTurn(nextTurn);
      }
  };

  const handleDraw = (player: 'me' | 'opp', count: number = 1) => {
      let currentDeck = [...deck];
      if (currentDeck.length < count) {
          addLog("Reshuffling deck...", "scanning");
          const fresh = createDeck();
          currentDeck = [...currentDeck, ...fresh];
      }

      const drawn = currentDeck.splice(0, count);
      setDeck(currentDeck);

      if (player === 'me') {
          setMyHand(prev => [...prev, ...drawn]);
          addLog(`You picked ${count} card(s)`, "alert");
      } else {
          setOppHand(prev => [...prev, ...drawn]);
          setOppHandCount(prev => prev + count);
          addLog(`Opponent picked ${count} card(s)`, "secure");
      }
  };

  const drawCardAction = () => {
      if (turn !== 'me' || showSuitSelector) return;
      
      playSFX('move');
      handleDraw('me', 1);
      setTurn('opp');
      setMessage("Opponent's Turn");
  };

  // Bot Turn Effect
  useEffect(() => {
      if (turn === 'opp' && gameStatus === 'playing') {
          const delay = Math.random() * 1000 + 1000;
          const timer = setTimeout(() => {
              botPlay();
          }, delay);
          return () => clearTimeout(timer);
      }
  }, [turn, gameStatus]);

  const botPlay = () => {
      // Find playable cards in bot's hand
      const playable = oppHand.filter(c => isValidMove(c));
      
      if (playable.length > 0) {
          // Prioritize Power Cards: 7 (Pick 2), A (Skip), J (Wild)
          const powerCard = playable.find(c => ['7', 'A', 'J'].includes(c.rank));
          const cardToPlay = powerCard || playable[Math.floor(Math.random() * playable.length)];
          playCard('opp', cardToPlay);
      } else {
          // Draw
          handleDraw('opp', 1);
          setTurn('me');
          setMessage("Your Turn");
      }
  };

  // Derived state for UI guidance
  const canPlayAny = turn === 'me' && myHand.some(isValidMove);

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4 overflow-hidden relative">
        
        {/* Background Texture */}
        <div className="absolute inset-0 bg-[#064e3b] z-0">
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/felt.png')]"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60"></div>
        </div>

        {/* --- HEADER --- */}
        <div className="w-full max-w-5xl flex justify-between items-center mb-4 mt-2 relative z-10">
             <div className="flex gap-2">
                 <button onClick={() => setShowForfeitModal(true)} className="p-2 bg-black/20 hover:bg-white/10 rounded-xl border border-white/10 text-white">
                    <ArrowLeft size={20} />
                 </button>
                 <button onClick={() => setShowRules(true)} className="p-2 bg-gold-500/20 hover:bg-gold-500/30 rounded-xl border border-gold-500/50 text-gold-400">
                    <HelpCircle size={20} />
                 </button>
             </div>
             <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
             </div>
             <div className="w-32 hidden md:block">
                 <AIReferee externalLog={refereeLog} />
             </div>
        </div>

        {/* --- GAME TABLE --- */}
        <div className="flex-1 w-full max-w-5xl relative z-10 flex flex-col justify-between py-4">
            
            {/* OPPONENT AREA */}
            <div className="flex justify-center relative h-32">
                <div className="absolute top-0 left-4 flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full border-2 border-red-500 overflow-hidden bg-royal-900">
                        <img src={table.host?.id === user.id ? table.guest?.avatar : table.host?.avatar || "https://i.pravatar.cc/150"} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xs font-bold text-white bg-black/40 px-2 py-1 rounded-full border border-white/10">
                        {oppHandCount} Cards
                    </span>
                </div>

                <div className="flex items-center justify-center -space-x-12">
                    {Array.from({ length: oppHandCount }).map((_, i) => (
                        <CardView key={`opp-${i}`} isFaceDown style={{ transform: `translateY(${i%2 * -5}px) rotate(${(i - oppHandCount/2) * 5}deg)` }} />
                    ))}
                </div>
            </div>

            {/* CENTER PILES */}
            <div className="flex items-center justify-center gap-12 my-8">
                
                {/* Draw Deck */}
                <div className="relative group cursor-pointer" onClick={drawCardAction}>
                    {deck.length > 0 && Array.from({length: Math.min(3, deck.length)}).map((_, i) => (
                        <div key={`deck-${i}`} className="absolute top-0 left-0">
                            <CardView isFaceDown style={{ transform: `translate(-${i*2}px, -${i*2}px)` }} />
                        </div>
                    ))}
                    <div className="relative">
                        <CardView isFaceDown />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="font-black text-white/50 text-2xl">DECK</span>
                        </div>
                    </div>
                    {turn === 'me' && !canPlayAny && !showSuitSelector && (
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute -bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-black text-white bg-red-500 px-4 py-2 rounded-full border-2 border-white shadow-lg animate-pulse z-20 flex items-center gap-2"
                        >
                            <Hand size={16} /> TAP TO PICK
                        </motion.div>
                    )}
                </div>

                {/* Discard Pile */}
                <div className="relative">
                    {discardPile.slice(-3, -1).map((c, i) => (
                        <div key={c.id} className="absolute top-0 left-0">
                            <CardView card={c} style={{ transform: `rotate(${(i+1) * 5}deg)` }} />
                        </div>
                    ))}
                    {discardPile.length > 0 && (
                        <CardView card={discardPile[discardPile.length - 1]} />
                    )}
                    {/* Active Suit Indicator */}
                    {activeSuit && (
                        <motion.div 
                            key={activeSuit}
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="absolute -right-24 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
                        >
                            <span className="text-[10px] font-bold text-gold-400 uppercase tracking-wider bg-black/60 px-2 py-1 rounded backdrop-blur-sm border border-white/10">Active Suit</span>
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] border-4 border-gold-500 animate-pulse">
                                {activeSuit === 'H' && <Heart size={36} className="text-red-500" fill="currentColor"/>}
                                {activeSuit === 'D' && <Diamond size={36} className="text-red-500" fill="currentColor"/>}
                                {activeSuit === 'C' && <Club size={36} className="text-slate-900" fill="currentColor"/>}
                                {activeSuit === 'S' && <Spade size={36} className="text-slate-900" fill="currentColor"/>}
                            </div>
                        </motion.div>
                    )}
                </div>

            </div>

            {/* PLAYER AREA */}
            <div className="flex flex-col items-center w-full">
                
                {/* Status Message */}
                <div className="mb-6 h-10 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={message + turn}
                            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
                            className={`px-8 py-3 rounded-full border backdrop-blur-md font-bold text-sm shadow-lg flex items-center gap-2 ${
                                turn === 'me' 
                                    ? canPlayAny 
                                        ? 'bg-green-500 text-white border-green-400'
                                        : 'bg-red-500/80 text-white border-red-400' 
                                    : 'bg-black/60 border-white/10 text-slate-300'
                            }`}
                        >
                            {turn === 'me' && canPlayAny && <Zap size={16} className="fill-current" />}
                            {turn === 'me' && !canPlayAny && <Hand size={16} />}
                            {turn === 'me' 
                                ? (showSuitSelector ? "Choose a Suit!" : canPlayAny ? "Select a Card to Play!" : "No Moves! Pick from Deck.") 
                                : message}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* My Hand */}
                <div className="flex items-end justify-center -space-x-12 hover:-space-x-8 transition-all duration-300 pb-8 overflow-x-auto w-full px-12 pt-10 min-h-[180px]">
                    <AnimatePresence>
                        {myHand.map((card, i) => {
                            const playable = turn === 'me' && isValidMove(card);
                            return (
                                <motion.div
                                    key={card.id}
                                    initial={{ y: 100, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -200, opacity: 0, scale: 0.5, rotate: 180 }}
                                    transition={{ delay: i * 0.05 }}
                                    style={{ zIndex: i }}
                                >
                                    <CardView 
                                        card={card} 
                                        isPlayable={playable} 
                                        onClick={() => handleCardClick(card)}
                                        style={{ 
                                            transformOrigin: 'bottom center',
                                            transform: `rotate(${(i - myHand.length/2) * 5}deg) translateY(${playable ? -60 : 0}px)` 
                                        }}
                                    />
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>

                {/* My Avatar / Stats */}
                <div className="absolute bottom-4 left-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full border-2 border-gold-500 overflow-hidden bg-royal-900 shadow-lg">
                        <img src={user.avatar} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-white">
                        <div className="text-xs font-bold text-gold-400">YOU</div>
                        <div className="text-sm font-bold">{myHand.length} Cards</div>
                    </div>
                </div>

            </div>
        </div>

        {/* SUIT SELECTOR MODAL */}
        <AnimatePresence>
            {showSuitSelector && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="bg-royal-900 border-2 border-gold-500 rounded-3xl p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(251,191,36,0.3)]"
                    >
                        <Crown size={48} className="text-gold-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-black text-white mb-2 uppercase">Je Commande!</h2>
                        <p className="text-slate-400 mb-8">Choose the next suit to be played.</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleSuitSelect('H')} className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group">
                                <Heart size={40} className="text-red-500 group-hover:scale-110 transition-transform" fill="currentColor" />
                                <span className="text-xs font-bold text-white uppercase">Hearts</span>
                            </button>
                            <button onClick={() => handleSuitSelect('D')} className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group">
                                <Diamond size={40} className="text-red-500 group-hover:scale-110 transition-transform" fill="currentColor" />
                                <span className="text-xs font-bold text-white uppercase">Diamonds</span>
                            </button>
                            <button onClick={() => handleSuitSelect('C')} className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group">
                                <Club size={40} className="text-slate-200 group-hover:scale-110 transition-transform" fill="currentColor" />
                                <span className="text-xs font-bold text-white uppercase">Clubs</span>
                            </button>
                            <button onClick={() => handleSuitSelect('S')} className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group">
                                <Spade size={40} className="text-slate-200 group-hover:scale-110 transition-transform" fill="currentColor" />
                                <span className="text-xs font-bold text-white uppercase">Spades</span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

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
                    className="relative bg-royal-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                  >
                      <div className="flex flex-col items-center text-center mb-6">
                          <AlertTriangle className="text-red-500 mb-4" size={32} />
                          <h2 className="text-xl font-bold text-white mb-2">Leave Table?</h2>
                          <p className="text-sm text-slate-400">
                              Forfeiting will result in a loss of your stake.
                          </p>
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => setShowForfeitModal(false)} className="flex-1 py-3 bg-white/5 rounded-xl text-slate-300 font-bold">Cancel</button>
                          <button onClick={() => onGameEnd('quit')} className="flex-1 py-3 bg-red-600 rounded-xl text-white font-bold">Forfeit</button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

       {/* RULES MODAL */}
       <AnimatePresence>
          {showRules && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowRules(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  />
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-royal-900 border border-gold-500/30 rounded-3xl p-0 w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                  >
                      <div className="bg-royal-800 p-4 border-b border-white/10 flex justify-between items-center">
                          <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                              <HelpCircle size={20} className="text-gold-400" /> Kmer Card Rules
                          </h2>
                          <button onClick={() => setShowRules(false)} className="text-slate-400 hover:text-white">
                              <XIcon size={20} />
                          </button>
                      </div>
                      
                      <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                          <div>
                              <h3 className="text-gold-400 font-bold text-sm uppercase tracking-wider mb-2">Objective</h3>
                              <p className="text-slate-300 text-sm leading-relaxed">
                                  Be the first player to empty your hand. Match the top card on the discard pile by <span className="text-white font-bold">Suit (Shape)</span> or <span className="text-white font-bold">Rank (Number)</span>.
                              </p>
                          </div>

                          <div className="space-y-3">
                              <h3 className="text-gold-400 font-bold text-sm uppercase tracking-wider">Power Cards</h3>
                              
                              <div className="flex gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                                  <div className="w-10 h-14 bg-white rounded border border-black/20 flex items-center justify-center text-gold-500 font-black text-lg">J</div>
                                  <div>
                                      <div className="text-white font-bold text-sm">Je Commande (Wild)</div>
                                      <p className="text-slate-400 text-xs">Can be played on <span className="text-green-400">ANY card</span>. Allows you to dictate the next suit to be played.</p>
                                  </div>
                              </div>

                              <div className="flex gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                                  <div className="w-10 h-14 bg-white rounded border border-black/20 flex items-center justify-center text-red-500 font-black text-lg">7</div>
                                  <div>
                                      <div className="text-white font-bold text-sm">Pick Two (Penalty)</div>
                                      <p className="text-slate-400 text-xs">Next player draws 2 cards and <span className="text-red-400">loses their turn</span>.</p>
                                  </div>
                              </div>

                              <div className="flex gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                                  <div className="w-10 h-14 bg-white rounded border border-black/20 flex items-center justify-center text-slate-900 font-black text-lg">A</div>
                                  <div>
                                      <div className="text-white font-bold text-sm">Suspension (Skip)</div>
                                      <p className="text-slate-400 text-xs">Skips the next player's turn. <span className="text-green-400">You play again immediately.</span></p>
                                  </div>
                              </div>
                          </div>

                          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                              <h3 className="text-blue-400 font-bold text-sm mb-1 flex items-center gap-2">
                                  <Zap size={14} /> Street Rules Active
                              </h3>
                              <p className="text-blue-200/80 text-xs">
                                  • Game ends immediately when last card is played.<br/>
                                  • If you can't play, you must pick 1 card.<br/>
                                  • Stacking penalties is disabled for simplicity.
                              </p>
                          </div>
                      </div>

                      <div className="p-4 bg-royal-950/50 border-t border-white/5">
                          <button onClick={() => setShowRules(false)} className="w-full py-3 bg-gold-500 text-royal-950 font-bold rounded-xl hover:bg-gold-400">
                              Got it, Let's Play!
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

    </div>
  );
};
