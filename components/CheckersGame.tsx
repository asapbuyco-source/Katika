import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Crown, RefreshCw, AlertCircle, ShieldCheck, Shield, AlertTriangle, Clock } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';

interface CheckersGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

interface Piece {
  id: string;
  player: 'me' | 'opponent';
  owner?: string; // Real User ID
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

// ... existing helpers ...
const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const TimerDisplay = ({ time, isActive }: { time: number, isActive: boolean }) => (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors duration-300 ${isActive ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-black/30 border-white/10 text-slate-500'}`}>
        <Clock size={14} className={isActive ? 'animate-pulse' : ''} />
        <span className="font-mono font-bold text-lg leading-none pt-0.5">{formatTime(time)}</span>
    </div>
);

const CheckersCell = React.memo(({ r, c, isDark, piece, isSelected, validMove, isHintSource, isHintDest, isLastFrom, isLastTo, onPieceClick, onMoveClick, isMeTurn }: any) => {
  const isMe = piece?.player === 'me';
  const isClickable = (isMeTurn && isMe) || !!validMove;

  return (
    <div 
       onClick={(e) => { e.stopPropagation(); if (piece && isMe) onPieceClick(piece); if (validMove) onMoveClick(validMove); }}
       className={`relative w-full h-full flex items-center justify-center ${isDark ? 'bg-royal-900/60' : 'bg-white/5'} ${isClickable ? 'cursor-pointer' : ''}`}
    >
        {isDark && <div className="absolute inset-0 bg-black/20 shadow-inner pointer-events-none" />}
        {(isLastFrom || isLastTo) && <div className="absolute inset-0 bg-gold-400/10 border border-gold-400/20 pointer-events-none" />}
        {validMove && (
           <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`absolute inset-2 rounded-full border-2 border-dashed flex items-center justify-center z-10 ${validMove.isJump ? 'border-red-500 bg-red-500/10' : 'border-green-500 bg-green-500/10'}`}>
               <div className={`w-3 h-3 rounded-full ${validMove.isJump ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
           </motion.div>
        )}
        <AnimatePresence mode="popLayout">
            {piece && (
                <motion.div
                    layoutId={`piece-${piece.id}`}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: isSelected ? 1.1 : 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="relative w-[80%] h-[80%] z-20 pointer-events-none"
                >
                    <div className={`w-full h-full rounded-full shadow-md border-2 border-opacity-50 flex items-center justify-center relative overflow-hidden ${isMe ? 'bg-gradient-to-br from-gold-400 to-yellow-600 border-yellow-200' : 'bg-gradient-to-br from-red-500 to-red-700 border-red-300'} ${isSelected ? 'ring-4 ring-white/30 brightness-110' : ''}`}>
                        <div className={`absolute inset-[20%] rounded-full border border-black/10 ${isMe ? 'bg-gold-300' : 'bg-red-400'}`}></div>
                        {piece.isKing && <Crown size={20} className="text-white drop-shadow-md relative z-10" fill="currentColor" />}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
});

export const CheckersGame: React.FC<CheckersGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
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
  const [timeRemaining, setTimeRemaining] = useState({ me: 600, opponent: 600 });
  const [isGameOver, setIsGameOver] = useState(false);

  const isP2P = !!socket && !!socketGame;

  // --- INIT & SYNC ---
  useEffect(() => {
    if (isP2P && socketGame) {
        if (socketGame.pieces) {
            // Map server pieces (with owner IDs) to 'me'/'opponent'
            const mappedPieces = socketGame.pieces.map((p: any) => ({
                ...p,
                player: p.owner === user.id ? 'me' : 'opponent'
            }));
            setPieces(mappedPieces);
        }
        if (socketGame.turn) {
            setTurn(socketGame.turn === user.id ? 'me' : 'opponent');
        }
        if (socketGame.winner) {
            if (socketGame.winner === user.id) onGameEnd('win');
            else onGameEnd('loss');
        }
    } else {
        // Local Init
        const initialPieces: Piece[] = [];
        let idCounter = 0;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) { 
              if (r < 3) initialPieces.push({ id: `opp-${idCounter++}`, player: 'opponent', isKing: false, r, c });
              else if (r > 4) initialPieces.push({ id: `me-${idCounter++}`, player: 'me', isKing: false, r, c });
            }
          }
        }
        setPieces(initialPieces);
    }
  }, [socketGame, user.id, isP2P]);

  // --- ACTIONS ---
  const handlePieceClick = useCallback((p: Piece) => {
    if (turn !== 'me' || p.player !== 'me' || isGameOver) return;
    const { moves, hasJump } = getGlobalValidMoves('me', pieces, mustJumpFrom);

    if (mustJumpFrom && mustJumpFrom !== p.id) {
        playSFX('error'); return;
    }
    if (hasJump && !moves.some(m => m.fromR === p.r && m.fromC === p.c)) {
        playSFX('error'); return;
    }
    
    if (selectedPieceId === p.id && !mustJumpFrom) {
        setSelectedPieceId(null); setValidMoves([]);
    } else {
        const pieceMoves = moves.filter(m => m.fromR === p.r && m.fromC === p.c);
        if (pieceMoves.length > 0) {
            setSelectedPieceId(p.id);
            setValidMoves(pieceMoves);
            playSFX('click');
        }
    }
  }, [turn, pieces, mustJumpFrom, selectedPieceId, isGameOver]);

  const handleMoveClick = useCallback((move: Move) => {
      if (!selectedPieceId || isGameOver) return;
      
      const nextPieces = pieces.filter(p => p.id !== move.jumpId).map(p => {
          if (p.id === selectedPieceId) {
              const isKing = p.isKing || (p.player === 'me' && move.r === 0) || (p.player === 'opponent' && move.r === 7);
              return { ...p, r: move.r, c: move.c, isKing };
          }
          return p;
      });

      // Update Local State for immediate feedback
      setPieces(nextPieces);
      setValidMoves([]);
      setLastMove({ from: `${move.fromR},${move.fromC}`, to: `${move.r},${move.c}` });
      if (move.isJump) playSFX('capture'); else playSFX('move');

      // Determine Next Turn (Multi-jump logic)
      let nextTurn: 'me' | 'opponent' = 'opponent';
      let nextMustJump: string | null = null;

      if (move.isJump) {
          const movedPiece = nextPieces.find(p => p.id === selectedPieceId)!;
          const { moves: moreJumps } = getGlobalValidMoves('me', nextPieces, movedPiece.id);
          if (moreJumps.length > 0 && moreJumps[0].isJump) {
              nextTurn = 'me';
              nextMustJump = movedPiece.id;
          }
      }

      // Check Game Over
      const { moves: oppMoves } = getGlobalValidMoves('opponent', nextPieces);
      let winner = null;
      if (oppMoves.length === 0 && nextTurn === 'opponent') winner = user.id;

      // Sync with Server
      if (isP2P && socket) {
          // Convert 'me'/'opponent' back to userIds for server
          const serverPieces = nextPieces.map(p => ({
              ...p,
              owner: p.player === 'me' ? user.id : (socketGame.players.find((uid: string) => uid !== user.id))
          }));
          
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: {
                  type: 'MOVE',
                  newState: {
                      pieces: serverPieces,
                      turn: nextTurn === 'me' ? user.id : socketGame.players.find((uid: string) => uid !== user.id),
                      winner: winner
                  }
              }
          });
      }

      setMustJumpFrom(nextMustJump);
      setSelectedPieceId(nextMustJump ? selectedPieceId : null);
      if (nextTurn === 'me' && nextMustJump) {
          // Auto-select for multi-jump
          const { moves } = getGlobalValidMoves('me', nextPieces, nextMustJump);
          setValidMoves(moves);
      } else {
          setTurn(nextTurn);
      }

  }, [selectedPieceId, pieces, isP2P, socket, socketGame, user.id]);

  // --- LOGIC HELPERS ---
  const isValidPos = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const getGlobalValidMoves = (player: 'me' | 'opponent', currentPieces: Piece[], specificId?: string | null) => {
      let allMoves: Move[] = [];
      const myPieces = currentPieces.filter(p => p.player === player);
      const toCheck = specificId ? myPieces.filter(p => p.id === specificId) : myPieces;

      toCheck.forEach(p => {
          const dirs = p.isKing ? [-1, 1] : (p.player === 'me' ? [-1] : [1]);
          const pieceMap = new Map(currentPieces.map(cp => [`${cp.r},${cp.c}`, cp]));
          
          // Jumps
          [-1, 1].forEach(dr => [-1, 1].forEach(dc => { // Check all dirs for jumps if King
             if (!p.isKing && ((player === 'me' && dr === 1) || (player === 'opponent' && dr === -1))) return;
             
             const mr = p.r + dr, mc = p.c + dc, jr = p.r + dr*2, jc = p.c + dc*2;
             if (isValidPos(jr, jc) && !pieceMap.has(`${jr},${jc}`)) {
                 const mid = pieceMap.get(`${mr},${mc}`);
                 if (mid && mid.player !== player) {
                     allMoves.push({ fromR: p.r, fromC: p.c, r: jr, c: jc, isJump: true, jumpId: mid.id });
                 }
             }
          }));
          
          // Simple Moves
          if (!specificId) { // Can't move simply if mid-jump sequence
             dirs.forEach(dr => [-1, 1].forEach(dc => {
                 const tr = p.r + dr, tc = p.c + dc;
                 if (isValidPos(tr, tc) && !pieceMap.has(`${tr},${tc}`)) {
                     allMoves.push({ fromR: p.r, fromC: p.c, r: tr, c: tc, isJump: false });
                 }
             }));
          }
      });

      const jumps = allMoves.filter(m => m.isJump);
      return { moves: jumps.length > 0 ? jumps : allMoves, hasJump: jumps.length > 0 };
  };

  // Maps
  const pieceMap = useMemo(() => new Map(pieces.map(p => [`${p.r},${p.c}`, p])), [pieces]);
  const validMoveMap = useMemo(() => new Map(validMoves.map(m => [`${m.r},${m.c}`, m])), [validMoves]);

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Forfeit Modal & Header omitted for brevity, use same structure as existing files */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-6 mt-2">
            <button onClick={() => setShowForfeitModal(true)} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
            </button>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

       <div className="flex flex-col md:flex-row items-center justify-center gap-8 w-full max-w-5xl">
           {/* Opponent */}
           <div className="order-1 flex md:flex-col items-center gap-4 md:w-32">
               <div className={`relative ${turn === 'opponent' ? 'scale-110' : 'opacity-70'}`}>
                   <img src={table.host?.avatar || "https://i.pravatar.cc/150"} className="w-16 h-16 rounded-2xl border-2 border-red-500 shadow-[0_0_20px_red]" />
                   {turn === 'opponent' && <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">Playing...</div>}
               </div>
               <TimerDisplay time={timeRemaining.opponent} isActive={turn === 'opponent'} />
           </div>

           {/* Board */}
           <div className="order-2 w-full max-w-[500px] aspect-square relative bg-[#1a103c] rounded-xl shadow-2xl border-4 border-royal-800 grid grid-cols-8 grid-rows-8 overflow-hidden">
               {Array.from({length: 8}).map((_, r) => Array.from({length: 8}).map((_, c) => {
                   const key = `${r},${c}`;
                   return <CheckersCell key={key} r={r} c={c} isDark={(r+c)%2===1} piece={pieceMap.get(key)} isSelected={selectedPieceId === pieceMap.get(key)?.id} validMove={validMoveMap.get(key)} isLastFrom={lastMove?.from === key} isLastTo={lastMove?.to === key} onPieceClick={handlePieceClick} onMoveClick={handleMoveClick} isMeTurn={turn === 'me'} />;
               }))}
           </div>

           {/* Player */}
           <div className="order-3 flex md:flex-col items-center gap-4 md:w-32">
               <div className={`relative ${turn === 'me' ? 'scale-110' : 'opacity-70'}`}>
                   <img src={user.avatar} className="w-16 h-16 rounded-2xl border-2 border-gold-500 shadow-[0_0_20px_gold]" />
                   {turn === 'me' && <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gold-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">Your Turn</div>}
               </div>
               <TimerDisplay time={timeRemaining.me} isActive={turn === 'me'} />
           </div>
       </div>
    </div>
  );
};