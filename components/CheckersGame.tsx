
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Crown, RefreshCw, AlertCircle, ShieldCheck, Shield, AlertTriangle, Clock } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';

interface CheckersGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

interface Piece {
  id: string;
  player: 'me' | 'opponent';
  isKing: boolean;
  r: number;
  c: number;
}

interface Move {
  fromR: number;
  fromC: number;
  r: number;
  c: number;
  isJump: boolean;
  jumpId?: string; // ID of captured piece
}

// --- HELPER: TIME FORMATTER ---
const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const TimerDisplay = ({ time, isActive, label }: { time: number, isActive: boolean, label?: string }) => (
    <div className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors duration-300
        ${isActive 
            ? time < 60 
                ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' 
                : 'bg-white text-royal-950 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
            : 'bg-black/30 border-white/10 text-slate-500'}
    `}>
        <Clock size={14} className={isActive ? 'animate-pulse' : ''} />
        <span className="font-mono font-bold text-lg leading-none pt-0.5">{formatTime(time)}</span>
    </div>
);

// --- OPTIMIZED CELL COMPONENT ---
const CheckersCell = React.memo(({
  r, c, isDark, piece, isSelected, validMove, isHintSource, isHintDest, isLastFrom, isLastTo, onPieceClick, onMoveClick, isMeTurn
}: {
  r: number, c: number, isDark: boolean, piece?: Piece, isSelected: boolean, validMove?: Move, 
  isHintSource: boolean, isHintDest: boolean, isLastFrom: boolean, isLastTo: boolean,
  onPieceClick: (p: Piece) => void, onMoveClick: (m: Move) => void, isMeTurn: boolean
}) => {
  
  const isMe = piece?.player === 'me';
  // Only clickable if it's my piece during my turn OR it's a valid move destination
  const isClickable = (isMeTurn && isMe) || !!validMove;

  return (
    <div 
       onClick={(e) => {
           e.stopPropagation();
           if (piece && isMe) onPieceClick(piece);
           if (validMove) onMoveClick(validMove);
       }}
       className={`
          relative w-full h-full flex items-center justify-center
          ${isDark ? 'bg-royal-900/60' : 'bg-white/5'}
          ${isClickable ? 'cursor-pointer' : ''}
       `}
    >
        {/* Board Cell Aesthetics */}
        {isDark && (
            <div className="absolute inset-0 bg-black/20 shadow-inner pointer-events-none" />
        )}
        
        {/* Highlights */}
        {(isLastFrom || isLastTo) && (
            <div className="absolute inset-0 bg-gold-400/10 border border-gold-400/20 pointer-events-none" />
        )}
        
        {/* Valid Move Indicator */}
        {validMove && (
           <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`absolute inset-2 rounded-full border-2 border-dashed flex items-center justify-center z-10 ${validMove.isJump ? 'border-red-500 bg-red-500/10' : 'border-green-500 bg-green-500/10'}`}
           >
               <div className={`w-3 h-3 rounded-full ${validMove.isJump ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
           </motion.div>
        )}

        {/* Hint Arrow Overlay */}
        {isHintSource && (
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                <div className="w-full h-full border-4 border-yellow-400 rounded-full animate-ping opacity-50"></div>
            </div>
        )}

        {/* PIECE RENDERING */}
        <AnimatePresence mode="popLayout">
            {piece && (
                <motion.div
                    layoutId={`piece-${piece.id}`}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: isSelected ? 1.1 : 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.8 }}
                    className="relative w-[80%] h-[80%] z-20 pointer-events-none"
                >
                    {/* Shadow Base */}
                    <div className="absolute bottom-[-10%] left-[5%] w-[90%] h-[20%] bg-black/40 blur-sm rounded-full" />
                    
                    {/* The Piece Body - Simplified Design for Speed */}
                    <div className={`
                        w-full h-full rounded-full shadow-md
                        border-2 border-opacity-50 flex items-center justify-center relative overflow-hidden
                        ${isMe 
                          ? 'bg-gradient-to-br from-gold-400 to-yellow-600 border-yellow-200' 
                          : 'bg-gradient-to-br from-red-500 to-red-700 border-red-300'}
                        ${isSelected ? 'ring-4 ring-white/30 brightness-110' : ''}
                    `}>
                        {/* Inner Bevel Ring (Simplified) */}
                        <div className={`absolute inset-[20%] rounded-full border border-black/10 ${isMe ? 'bg-gold-300' : 'bg-red-400'}`}></div>

                        {/* King Crown */}
                        {piece.isKing && (
                            <motion.div 
                              initial={{ scale: 0, rotate: -45 }}
                              animate={{ scale: 1, rotate: 0 }}
                              className="relative z-10"
                            >
                                <Crown size={20} className="text-white drop-shadow-md" fill="currentColor" />
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
}, (prev, next) => {
    // Props check optimization
    return (
        prev.r === next.r && 
        prev.c === next.c &&
        prev.isDark === next.isDark &&
        prev.piece === next.piece &&
        prev.isSelected === next.isSelected &&
        prev.validMove === next.validMove &&
        prev.isHintSource === next.isHintSource &&
        prev.isHintDest === next.isHintDest &&
        prev.isLastFrom === next.isLastFrom &&
        prev.isLastTo === next.isLastTo &&
        prev.isMeTurn === next.isMeTurn
    );
});

export const CheckersGame: React.FC<CheckersGameProps> = ({ table, user, onGameEnd }) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [turn, setTurn] = useState<'me' | 'opponent'>('me');
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<{from: string, to: string} | null>(null);
  
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [capturedMe, setCapturedMe] = useState(0);
  const [capturedOpp, setCapturedOpp] = useState(0);
  
  const [mustJumpFrom, setMustJumpFrom] = useState<string | null>(null);
  const [hintMoves, setHintMoves] = useState<Move[]>([]);
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  // Timer State (10 minutes per player = 600 seconds)
  const [timeRemaining, setTimeRemaining] = useState({ me: 600, opponent: 600 });
  const [isGameOver, setIsGameOver] = useState(false);

  // Initialize
  useEffect(() => {
    const initialPieces: Piece[] = [];
    let idCounter = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) { 
          if (r < 3) {
            initialPieces.push({ id: `opp-${idCounter++}`, player: 'opponent', isKing: false, r, c });
          } else if (r > 4) {
            initialPieces.push({ id: `me-${idCounter++}`, player: 'me', isKing: false, r, c });
          }
        }
      }
    }
    setPieces(initialPieces);
  }, []);

  // Timer Effect
  useEffect(() => {
      if (isGameOver) return;

      const timer = setInterval(() => {
          setTimeRemaining(prev => {
              const newTime = { ...prev };
              if (newTime[turn] > 0) {
                  newTime[turn] -= 1;
              } else {
                  // Time ran out
                  clearInterval(timer);
                  setIsGameOver(true);
                  if (turn === 'me') {
                      onGameEnd('loss');
                  } else {
                      onGameEnd('win');
                  }
              }
              return newTime;
          });
      }, 1000);

      return () => clearInterval(timer);
  }, [turn, isGameOver, onGameEnd]);

  const addLog = useCallback((msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  }, []);

  const triggerHints = useCallback((moves: Move[]) => {
      setHintMoves(moves);
      setTimeout(() => setHintMoves([]), 2000);
  }, []);

  // --- LOGIC ENGINE ---
  const isValidPos = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const getPotentialMoves = useCallback((piece: Piece, currentPieces: Piece[]): Move[] => {
      const moves: Move[] = [];
      const isMe = piece.player === 'me';
      const forwardDirs = isMe ? [-1] : [1];
      const allDirs = [-1, 1];
      const moveDirs = piece.isKing ? allDirs : forwardDirs;
      const captureDirs = allDirs; 
      
      const pieceMap = new Map<string, Piece>();
      currentPieces.forEach(p => pieceMap.set(`${p.r},${p.c}`, p));
      const getP = (r: number, c: number) => pieceMap.get(`${r},${c}`);

      // Simple Moves
      moveDirs.forEach(dRow => {
          [-1, 1].forEach(dCol => {
              const targetR = piece.r + dRow;
              const targetC = piece.c + dCol;
              if (isValidPos(targetR, targetC) && !getP(targetR, targetC)) {
                  moves.push({ fromR: piece.r, fromC: piece.c, r: targetR, c: targetC, isJump: false });
              }
          });
      });

      // Jumps
      captureDirs.forEach(dRow => {
          [-1, 1].forEach(dCol => {
              const midR = piece.r + dRow;
              const midC = piece.c + dCol;
              const jumpR = piece.r + (dRow * 2);
              const jumpC = piece.c + (dCol * 2);

              if (isValidPos(jumpR, jumpC) && !getP(jumpR, jumpC)) {
                  const midPiece = getP(midR, midC);
                  if (midPiece && midPiece.player !== piece.player) {
                      moves.push({ fromR: piece.r, fromC: piece.c, r: jumpR, c: jumpC, isJump: true, jumpId: midPiece.id });
                  }
              }
          });
      });
      return moves;
  }, []);

  const getGlobalValidMoves = useCallback((player: 'me' | 'opponent', currentPieces: Piece[], specificPieceId?: string | null): { moves: Move[], hasJump: boolean } => {
      let allMoves: Move[] = [];
      const playerPieces = currentPieces.filter(p => p.player === player);
      const piecesToCheck = specificPieceId ? playerPieces.filter(p => p.id === specificPieceId) : playerPieces;

      piecesToCheck.forEach(p => {
          const pMoves = getPotentialMoves(p, currentPieces);
          if (specificPieceId) {
             allMoves.push(...pMoves.filter(m => m.isJump));
          } else {
             allMoves.push(...pMoves);
          }
      });

      const jumps = allMoves.filter(m => m.isJump);
      if (jumps.length > 0) return { moves: jumps, hasJump: true };
      return { moves: allMoves, hasJump: false };
  }, [getPotentialMoves]);

  // --- BOT LOGIC ---
  const performBotUpdate = useCallback((move: Move, currentBoard: Piece[]) => {
      const pId = currentBoard.find(p => p.r === move.fromR && p.c === move.fromC)?.id;
      if (!pId) return;

      const isPromotion = !currentBoard.find(p => p.id === pId)?.isKing && move.r === 7;
      const nextPieces = currentBoard
        .filter(p => p.id !== move.jumpId)
        .map(p => {
            if (p.id === pId) return { ...p, r: move.r, c: move.c, isKing: p.isKing || isPromotion };
            return p;
        });
      
      setPieces(nextPieces);
      setLastMove({ from: `${move.fromR},${move.fromC}`, to: `${move.r},${move.c}` });

      if (move.isJump) {
          playSFX('capture');
          setCapturedMe(c => c + 1);
          addLog("Opponent captured your piece!", "alert");
          const movedPiece = nextPieces.find(p => p.id === pId)!;
          const { moves: moreJumps } = getGlobalValidMoves('opponent', nextPieces, movedPiece.id);
          
          if (moreJumps.length > 0 && moreJumps[0].isJump) {
               setTimeout(() => executeBotMoveRef.current?.(nextPieces, movedPiece.id), 400); // Faster reaction
               return;
          }
      } else {
          playSFX('move');
      }

      if (isPromotion) playSFX('king');

      const { moves: playerMoves } = getGlobalValidMoves('me', nextPieces);
      if (playerMoves.length === 0) {
          setIsGameOver(true);
          onGameEnd('loss');
          return;
      }
      setTurn('me');
      setMustJumpFrom(null);
      setSelectedPieceId(null);
  }, [getGlobalValidMoves, addLog, onGameEnd]);

  // Fix: Explicitly type the ref to allow mutation
  const executeBotMoveRef = useRef<((currentBoard: Piece[], multiJumpPieceId?: string | null) => void) | null>(null);

  const executeBotMove = (currentBoard: Piece[], multiJumpPieceId: string | null = null) => {
      if (isGameOver) return;
      const { moves } = getGlobalValidMoves('opponent', currentBoard, multiJumpPieceId);
      if (moves.length === 0) {
          setIsGameOver(true);
          onGameEnd('win');
          return;
      }
      const move = moves[Math.floor(Math.random() * moves.length)];
      setSelectedPieceId(currentBoard.find(p => p.r === move.fromR && p.c === move.fromC)?.id || null);
      setTimeout(() => performBotUpdate(move, currentBoard), 300); // Faster execution
  };
  executeBotMoveRef.current = executeBotMove;

  // --- USER INTERACTION ---
  const handlePieceClick = useCallback((p: Piece) => {
    if (turn !== 'me' || p.player !== 'me' || isGameOver) return;
    const { moves, hasJump } = getGlobalValidMoves('me', pieces, mustJumpFrom);

    if (mustJumpFrom && mustJumpFrom !== p.id) {
        addLog("Finish your jump sequence!", "alert");
        triggerHints(moves); 
        playSFX('error');
        return;
    }
    if (hasJump) {
        const canThisPieceJump = moves.some(m => m.fromR === p.r && m.fromC === p.c);
        if (!canThisPieceJump) {
            addLog("Capture is mandatory!", "alert");
            triggerHints(moves);
            playSFX('error');
            return;
        }
    }
    if (selectedPieceId === p.id) {
        if (!mustJumpFrom) {
            setSelectedPieceId(null);
            setValidMoves([]);
            setHintMoves([]);
        }
    } else {
        const pieceMoves = moves.filter(m => m.fromR === p.r && m.fromC === p.c);
        if (pieceMoves.length > 0) {
            setSelectedPieceId(p.id);
            setValidMoves(pieceMoves);
            setHintMoves([]);
            playSFX('click');
        }
    }
  }, [turn, pieces, mustJumpFrom, getGlobalValidMoves, selectedPieceId, addLog, triggerHints, isGameOver]);

  const handleMoveClick = useCallback((move: Move) => {
      if (!selectedPieceId || isGameOver) return;
      const movingPiece = pieces.find(p => p.id === selectedPieceId);
      if (!movingPiece) return;

      const isPromotion = !movingPiece.isKing && ((movingPiece.player === 'me' && move.r === 0) || (movingPiece.player === 'opponent' && move.r === 7));

      const nextPieces = pieces
        .filter(p => p.id !== move.jumpId)
        .map(p => {
            if (p.id === selectedPieceId) {
                return { ...p, r: move.r, c: move.c, isKing: p.isKing || isPromotion };
            }
            return p;
        });
      
      setPieces(nextPieces);
      setValidMoves([]);
      setHintMoves([]);
      setLastMove({ from: `${move.fromR},${move.fromC}`, to: `${move.r},${move.c}` });

      if (move.isJump) {
          playSFX('capture');
          addLog("Piece Captured!", "alert");
          if (turn === 'me') setCapturedOpp(c => c + 1);
          else setCapturedMe(c => c + 1);

          const movedPiece = nextPieces.find(p => p.id === selectedPieceId)!;
          const { moves: moreJumps } = getGlobalValidMoves(turn, nextPieces, movedPiece.id);
          
          if (moreJumps.length > 0 && moreJumps[0].isJump) {
              setMustJumpFrom(movedPiece.id);
              setSelectedPieceId(movedPiece.id);
              
              if(turn === 'me') {
                  setValidMoves(moreJumps);
                  addLog("Double Jump Available!", "scanning");
              } else {
                  setTimeout(() => executeBotMoveRef.current?.(nextPieces, movedPiece.id), 600); // Faster double jump
              }
              return; 
          }
      } else {
          playSFX('move');
      }

      if (isPromotion) playSFX('king');

      setMustJumpFrom(null);
      setSelectedPieceId(null);
      
      const nextTurn = turn === 'me' ? 'opponent' : 'me';
      const { moves: nextPlayerMoves } = getGlobalValidMoves(nextTurn, nextPieces);
      if (nextPlayerMoves.length === 0) {
          setIsGameOver(true);
          onGameEnd(turn === 'me' ? 'win' : 'loss');
          return;
      }

      setTurn(nextTurn);
      if (nextTurn === 'opponent') {
          setTimeout(() => executeBotMoveRef.current?.(nextPieces), 600); // Faster turn switch
      }
  }, [selectedPieceId, pieces, turn, getGlobalValidMoves, addLog, onGameEnd, isGameOver]);


  // Prepare lookup maps for rendering
  const pieceMap = useMemo(() => {
    const map = new Map<string, Piece>();
    pieces.forEach(p => map.set(`${p.r},${p.c}`, p));
    return map;
  }, [pieces]);

  const validMoveMap = useMemo(() => {
    const map = new Map<string, Move>();
    validMoves.forEach(m => map.set(`${m.r},${m.c}`, m));
    return map;
  }, [validMoves]);

  const hintMoveMap = useMemo(() => {
      const map = new Set<string>();
      hintMoves.forEach(m => {
          map.add(`s:${m.fromR},${m.fromC}`);
          map.add(`d:${m.r},${m.c}`);
      });
      return map;
  }, [hintMoves]);

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
       
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
                    className="relative bg-royal-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl overflow-hidden"
                  >
                      {/* Red Glow */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>

                      <div className="flex flex-col items-center text-center mb-6">
                          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                              <AlertTriangle className="text-red-500" size={32} />
                          </div>
                          <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                          <p className="text-sm text-slate-400">
                              Leaving now will result in an <span className="text-red-400 font-bold">immediate loss</span>. 
                              Your staked funds will be transferred to the opponent.
                          </p>
                      </div>

                      <div className="flex gap-3">
                          <button 
                            onClick={() => { setShowForfeitModal(false); playSFX('click'); }}
                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl border border-white/10 transition-colors"
                          >
                              Stay in Game
                          </button>
                          <button 
                            onClick={() => { onGameEnd('quit'); playSFX('click'); }}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors"
                          >
                              Yes, Forfeit
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

       {/* GAME HEADER */}
       <div className="w-full max-w-4xl flex items-center justify-between mb-8 mt-4">
           <button onClick={() => { setShowForfeitModal(true); playSFX('click'); }} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
               <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
               <span className="font-bold text-sm">Forfeit</span>
           </button>
           
           <div className="flex flex-col items-center">
               <div className="text-xs text-gold-500 font-bold uppercase tracking-widest mb-1">Pot Size</div>
               <div className="text-2xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} <span className="text-sm text-slate-500">FCFA</span></div>
           </div>

           <div className="flex items-center gap-3">
               {user.isAdmin && (
                   <button 
                       onClick={() => onGameEnd('win')}
                       className="p-2 bg-green-500/10 text-green-400 rounded-xl hover:bg-green-500/20 border border-green-500/20 transition-colors"
                       title="Force Win (Admin)"
                   >
                       <ShieldCheck size={20} />
                   </button>
               )}
               <div className="w-10 md:w-40 flex-shrink-0">
                    <div className="hidden md:block">
                        <AIReferee externalLog={refereeLog} />
                    </div>
                    <div className="md:hidden w-10 h-10 bg-royal-800 rounded-lg flex items-center justify-center border border-white/10 text-purple-400">
                        <Shield size={20} />
                    </div>
               </div>
           </div>
       </div>

       {/* MAIN CONTENT ROW */}
       <div className="flex flex-col md:flex-row items-center justify-center gap-8 w-full max-w-5xl">
           
           {/* LEFT: OPPONENT STATS */}
           <div className="order-1 md:order-1 flex md:flex-col items-center gap-4 md:w-32">
               <div className={`relative ${turn === 'opponent' ? 'scale-110' : 'opacity-70'}`}>
                   <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-red-900 to-black border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] overflow-hidden">
                       <img src={table.host?.avatar || "https://i.pravatar.cc/150"} className="w-full h-full object-cover" />
                   </div>
                   {turn === 'opponent' && (
                       <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap animate-pulse">
                           Thinking...
                       </div>
                   )}
               </div>
               <div className="text-center">
                   <div className="text-white font-bold text-sm md:text-base">{table.host?.name || "Opponent"}</div>
                   <div className="text-red-400 text-xs font-mono mb-2">{capturedOpp} Captured</div>
                   <TimerDisplay time={timeRemaining.opponent} isActive={turn === 'opponent'} />
               </div>
               <div className="flex flex-wrap gap-1 justify-center max-w-[80px]">
                   {Array.from({length: capturedOpp}).map((_, i) => (
                       <div key={i} className="w-3 h-3 rounded-full bg-red-500 border border-white/20 shadow-sm" />
                   ))}
               </div>
           </div>

           {/* CENTER: BOARD */}
           <div className="order-2 w-full max-w-[500px] aspect-square relative">
               <div className="absolute -inset-3 md:-inset-5 bg-gradient-to-br from-[#2d1b69] to-[#0f0a1f] rounded-xl shadow-2xl border border-white/10"></div>
               <div className="absolute inset-0 bg-[#1a103c] rounded-lg shadow-inner overflow-hidden border-4 border-royal-800 grid grid-cols-8 grid-rows-8">
                   {Array.from({length: 8}).map((_, r) => (
                       Array.from({length: 8}).map((_, c) => {
                           const key = `${r},${c}`;
                           return (
                               <CheckersCell 
                                   key={key}
                                   r={r} c={c}
                                   isDark={(r + c) % 2 === 1}
                                   piece={pieceMap.get(key)}
                                   isSelected={selectedPieceId === pieceMap.get(key)?.id}
                                   validMove={validMoveMap.get(key)}
                                   isHintSource={hintMoveMap.has(`s:${key}`)}
                                   isHintDest={hintMoveMap.has(`d:${key}`)}
                                   isLastFrom={lastMove?.from === key}
                                   isLastTo={lastMove?.to === key}
                                   onPieceClick={handlePieceClick}
                                   onMoveClick={handleMoveClick}
                                   isMeTurn={turn === 'me'}
                               />
                           );
                       })
                   ))}
               </div>
               {/* Labels */}
               <div className="absolute -left-6 top-0 bottom-0 flex flex-col justify-around text-xs text-slate-600 font-mono">
                   {[8,7,6,5,4,3,2,1].map(n => <span key={n}>{n}</span>)}
               </div>
               <div className="absolute -bottom-6 left-0 right-0 flex justify-around text-xs text-slate-600 font-mono">
                   {['a','b','c','d','e','f','g','h'].map(c => <span key={c}>{c}</span>)}
               </div>
           </div>

           {/* RIGHT: PLAYER STATS */}
           <div className="order-3 flex md:flex-col items-center gap-4 md:w-32">
               <div className={`relative ${turn === 'me' ? 'scale-110' : 'opacity-70'}`}>
                   <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-gold-600 to-black border-2 border-gold-500 shadow-[0_0_20px_rgba(251,191,36,0.3)] overflow-hidden">
                       <img src={user.avatar} className="w-full h-full object-cover" />
                   </div>
                   {turn === 'me' && (
                       <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gold-500 text-royal-950 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                           Your Turn
                       </div>
                   )}
               </div>
               <div className="text-center">
                   <div className="text-white font-bold text-sm md:text-base">You</div>
                   <div className="text-gold-400 text-xs font-mono mb-2">{capturedMe} Captured</div>
                   <TimerDisplay time={timeRemaining.me} isActive={turn === 'me'} />
               </div>
               <div className="flex flex-wrap gap-1 justify-center max-w-[80px]">
                   {Array.from({length: capturedMe}).map((_, i) => (
                       <div key={i} className="w-3 h-3 rounded-full bg-gold-500 border border-white/20 shadow-sm" />
                   ))}
               </div>
           </div>
       </div>

       {/* STATUS BAR */}
       <div className="mt-8 h-12">
           <AnimatePresence mode="wait">
               {mustJumpFrom ? (
                   <motion.div 
                     initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
                     className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-full text-red-400 text-sm font-bold"
                   >
                       <AlertCircle size={16} /> Double Jump Available! Select your piece.
                   </motion.div>
               ) : turn === 'me' ? (
                   <motion.div 
                     initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
                     className="flex items-center gap-2 text-slate-400 text-sm"
                   >
                       <span>Select a</span>
                       <div className="w-3 h-3 rounded-full bg-gold-500"></div>
                       <span>piece to move</span>
                   </motion.div>
               ) : (
                   <motion.div 
                     initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
                     className="flex items-center gap-2 text-slate-500 text-sm"
                   >
                       <RefreshCw size={14} className="animate-spin" /> Waiting for opponent...
                   </motion.div>
               )}
           </AnimatePresence>
       </div>
    </div>
  );
};
