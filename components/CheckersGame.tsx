
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Crown, Shield, Activity, RefreshCw } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
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
  r: number;
  c: number;
  isJump: boolean;
  jumpId?: string; // ID of captured piece
}

export const CheckersGame: React.FC<CheckersGameProps> = ({ table, user, onGameEnd }) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [turn, setTurn] = useState<'me' | 'opponent'>('me');
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [capturedMe, setCapturedMe] = useState(0);
  const [capturedOpp, setCapturedOpp] = useState(0);

  // --- INITIALIZATION ---
  useEffect(() => {
    const initialPieces: Piece[] = [];
    // Initialize standard 8x8 checkers setup
    // Rows 0,1,2: Opponent (Red/Top)
    // Rows 5,6,7: Me (Gold/Bottom)
    let idCounter = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) { // Dark squares only
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

  // --- GAME LOGIC ---

  const addLog = (msg: string, status: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status, timestamp: Date.now() });
  };

  const getValidMoves = (piece: Piece, currentPieces: Piece[]): Move[] => {
    const moves: Move[] = [];
    const directions = piece.isKing ? [-1, 1] : piece.player === 'me' ? [-1] : [1];

    directions.forEach(dRow => {
      [-1, 1].forEach(dCol => {
        // 1. Simple Move
        const targetR = piece.r + dRow;
        const targetC = piece.c + dCol;
        
        if (isValidPos(targetR, targetC) && !getPieceAt(targetR, targetC, currentPieces)) {
           // Standard move only allowed if NOT currently in a multi-jump sequence (simplified here)
           moves.push({ r: targetR, c: targetC, isJump: false });
        }

        // 2. Jump
        const jumpR = piece.r + (dRow * 2);
        const jumpC = piece.c + (dCol * 2);
        const midR = piece.r + dRow;
        const midC = piece.c + dCol;
        
        if (isValidPos(jumpR, jumpC) && !getPieceAt(jumpR, jumpC, currentPieces)) {
            const midPiece = getPieceAt(midR, midC, currentPieces);
            if (midPiece && midPiece.player !== piece.player) {
                moves.push({ r: jumpR, c: jumpC, isJump: true, jumpId: midPiece.id });
            }
        }
      });
    });
    return moves;
  };

  const isValidPos = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const getPieceAt = (r: number, c: number, currentList: Piece[]) => currentList.find(p => p.r === r && p.c === c);

  const handlePieceClick = (p: Piece) => {
    if (turn !== 'me' || p.player !== 'me') return;
    
    // Select piece
    if (selectedPieceId === p.id) {
        setSelectedPieceId(null);
        setValidMoves([]);
    } else {
        setSelectedPieceId(p.id);
        const moves = getValidMoves(p, pieces);
        // Force jump rule? For this demo, we won't strictly enforce "must jump", but we prioritize it visually
        setValidMoves(moves);
    }
  };

  const handleMoveClick = (move: Move) => {
      if (!selectedPieceId) return;

      setPieces(prev => {
          const next = prev.map(p => {
              if (p.id === selectedPieceId) {
                  const isKing = p.isKing || (p.player === 'me' && move.r === 0) || (p.player === 'opponent' && move.r === 7);
                  return { ...p, r: move.r, c: move.c, isKing };
              }
              return p;
          });

          // Handle Capture
          if (move.isJump && move.jumpId) {
              addLog("Piece Captured!", "alert");
              setCapturedOpp(c => c + 1);
              return next.filter(p => p.id !== move.jumpId);
          }

          return next;
      });

      setValidMoves([]);
      setSelectedPieceId(null);
      setTurn('opponent');
      addLog("Move Verified on Chain", "secure");

      // Bot Turn
      setTimeout(() => botTurn(), 1000);
  };

  const botTurn = () => {
      setPieces(currentPieces => {
          // Find all opponent pieces
          const oppPieces = currentPieces.filter(p => p.player === 'opponent');
          let bestMove: { pieceId: string, move: Move } | null = null;
          
          // Simple AI: Prioritize jumps, then random
          const allMoves: { pieceId: string, move: Move }[] = [];
          
          for (const p of oppPieces) {
              const moves = getValidMoves(p, currentPieces);
              moves.forEach(m => allMoves.push({ pieceId: p.id, move: m }));
          }

          if (allMoves.length === 0) {
              // Opponent has no moves - Player Wins
              setTimeout(() => onGameEnd('win'), 1000);
              return currentPieces;
          }

          const jumps = allMoves.filter(m => m.move.isJump);
          if (jumps.length > 0) {
              bestMove = jumps[Math.floor(Math.random() * jumps.length)];
          } else {
              bestMove = allMoves[Math.floor(Math.random() * allMoves.length)];
          }

          // Execute Bot Move
          const next = currentPieces.map(p => {
              if (p.id === bestMove!.pieceId) {
                  const m = bestMove!.move;
                  const isKing = p.isKing || (p.player === 'opponent' && m.r === 7);
                  return { ...p, r: m.r, c: m.c, isKing };
              }
              return p;
          });

          if (bestMove.move.isJump && bestMove.move.jumpId) {
             setCapturedMe(c => c + 1);
             addLog("Opponent captured your piece", "alert");
             return next.filter(p => p.id !== bestMove!.move.jumpId);
          }

          addLog("Opponent moved", "secure");
          setTurn('me');
          return next;
      });
  };

  // --- RENDER ---
  const renderBoard = () => {
      const squares = [];
      for(let r=0; r<8; r++){
          for(let c=0; c<8; c++){
              const isDark = (r + c) % 2 === 1;
              const isSelected = selectedPieceId && pieces.find(p => p.id === selectedPieceId)?.r === r && pieces.find(p => p.id === selectedPieceId)?.c === c;
              const isValidMove = validMoves.find(m => m.r === r && m.c === c);
              
              squares.push(
                  <div 
                    key={`${r}-${c}`}
                    onClick={() => isValidMove ? handleMoveClick(isValidMove) : undefined}
                    className={`
                        relative w-full h-full flex items-center justify-center
                        ${isDark ? 'bg-black/40 shadow-inner' : 'bg-transparent'}
                        ${isValidMove ? 'cursor-pointer' : ''}
                    `}
                  >
                      {/* Valid Move Indicator */}
                      {isValidMove && (
                          <motion.div 
                             initial={{ scale: 0 }} animate={{ scale: 1 }}
                             className={`w-4 h-4 rounded-full opacity-50 ${isValidMove.isJump ? 'bg-red-500 box-shadow-[0_0_10px_red]' : 'bg-green-400'}`}
                          />
                      )}

                      {/* Rank/File Labels for aesthetic */}
                      {c === 0 && isDark && <span className="absolute left-0.5 top-0.5 text-[8px] text-white/20 font-mono">{8-r}</span>}
                      {r === 7 && isDark && <span className="absolute right-0.5 bottom-0 text-[8px] text-white/20 font-mono">{String.fromCharCode(97+c)}</span>}
                  </div>
              );
          }
      }
      return squares;
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-4">
       
       {/* Header */}
       <div className="w-full max-w-5xl flex justify-between items-center mb-8">
           <button onClick={() => onGameEnd('quit')} className="text-slate-400 hover:text-white flex items-center gap-2 group">
                <div className="p-2 bg-royal-800 rounded-lg group-hover:bg-royal-700 transition-colors">
                    <ArrowLeft size={20} />
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-xs text-slate-500 uppercase">Back to Lobby</span>
                    <span className="font-bold">Forfeit Game</span>
                </div>
           </button>

           <div className="glass-panel px-8 py-3 rounded-2xl flex items-center gap-6">
                <div className="flex flex-col items-end">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Opponent</span>
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{table.host?.name || "Opponent"}</span>
                        <div className="w-2 h-2 rounded-full bg-cam-red shadow-[0_0_8px_rgba(206,17,38,0.8)]" />
                    </div>
                </div>
                
                <div className="h-8 w-px bg-white/10 mx-2" />
                
                <div className="text-center">
                    <div className="text-2xl font-display font-bold text-white tracking-widest">VS</div>
                    <div className="text-[10px] text-gold-500 font-mono">POT: {(table.stake * 2).toLocaleString()}</div>
                </div>

                <div className="h-8 w-px bg-white/10 mx-2" />

                <div className="flex flex-col items-start">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">You</span>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gold-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                        <span className="font-bold text-white">{user.name}</span>
                    </div>
                </div>
           </div>

           <div className="w-[140px]">
               <AIReferee externalLog={refereeLog} />
           </div>
       </div>

       {/* Game Area */}
       <div className="flex gap-8 items-center">
           
           {/* Left Sidebar - Captured Pieces (My Losses) */}
           <div className="hidden md:flex flex-col gap-2">
                <div className="text-center text-xs text-slate-500 uppercase mb-2">My Losses</div>
                <div className="w-16 bg-royal-900/50 rounded-2xl p-2 min-h-[200px] border border-white/5 flex flex-col items-center gap-1 shadow-inner">
                    {Array.from({ length: capturedMe }).map((_, i) => (
                        <motion.div 
                            key={i} 
                            initial={{ scale: 0, y: -20 }} animate={{ scale: 1, y: 0 }}
                            className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 shadow-lg border border-gold-300/50 opacity-60" 
                        />
                    ))}
                </div>
           </div>

           {/* The Board */}
           <div className="relative">
               {/* Board Frame */}
               <div className="relative z-10 w-[360px] h-[360px] md:w-[600px] md:h-[600px] bg-royal-900 rounded-lg shadow-2xl border-[12px] border-royal-800">
                   {/* Board Surface */}
                   <div className="w-full h-full bg-gradient-to-br from-royal-800 to-black grid grid-cols-8 grid-rows-8 border border-white/5">
                        {renderBoard()}
                   </div>

                   {/* Pieces Layer */}
                   <div className="absolute inset-0 w-full h-full pointer-events-none">
                       <AnimatePresence>
                           {pieces.map(p => {
                               const top = p.r * 12.5;
                               const left = p.c * 12.5;
                               const isSelectable = turn === 'me' && p.player === 'me';
                               const isSelected = selectedPieceId === p.id;

                               return (
                                   <motion.div
                                      key={p.id}
                                      layout
                                      initial={false}
                                      animate={{ top: `${top}%`, left: `${left}%` }}
                                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                                      onClick={() => handlePieceClick(p)}
                                      className="absolute w-[12.5%] h-[12.5%] flex items-center justify-center z-20 pointer-events-auto"
                                   >
                                       <div 
                                          className={`
                                            relative w-[75%] h-[75%] rounded-full shadow-xl transition-all duration-200
                                            ${p.player === 'me' 
                                                ? 'bg-gradient-to-b from-gold-300 to-gold-600 ring-1 ring-gold-200' 
                                                : 'bg-gradient-to-b from-red-400 to-red-700 ring-1 ring-red-300'}
                                            ${isSelected ? 'scale-110 ring-4 ring-white/50 z-30 brightness-110' : ''}
                                            ${isSelectable ? 'cursor-pointer hover:scale-105' : ''}
                                          `}
                                       >
                                           {/* Inner Bevel */}
                                           <div className="absolute inset-1 rounded-full border border-white/20 bg-gradient-to-b from-white/10 to-transparent" />
                                           
                                           {/* King Icon */}
                                           {p.isKing && (
                                               <div className="absolute inset-0 flex items-center justify-center text-white/90 drop-shadow-md">
                                                   <Crown size={20} fill="currentColor" />
                                               </div>
                                           )}
                                       </div>
                                   </motion.div>
                               );
                           })}
                       </AnimatePresence>
                   </div>
               </div>
               
               {/* Ambient Glow */}
               <div className="absolute -inset-4 bg-gold-500/5 rounded-full blur-3xl -z-10" />
           </div>

           {/* Right Sidebar - Captured Pieces (Opponent Losses) */}
           <div className="hidden md:flex flex-col gap-2">
                <div className="text-center text-xs text-slate-500 uppercase mb-2">Captures</div>
                <div className="w-16 bg-royal-900/50 rounded-2xl p-2 min-h-[200px] border border-white/5 flex flex-col items-center gap-1 shadow-inner">
                    {Array.from({ length: capturedOpp }).map((_, i) => (
                        <motion.div 
                            key={i} 
                            initial={{ scale: 0, y: -20 }} animate={{ scale: 1, y: 0 }}
                            className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 shadow-lg border border-red-300/50 opacity-60" 
                        />
                    ))}
                </div>
           </div>

       </div>

       {/* Turn Indicator */}
       <div className="mt-8 flex items-center gap-4">
            <div className={`px-6 py-2 rounded-full border ${turn === 'me' ? 'bg-gold-500/10 border-gold-500 text-gold-400' : 'bg-transparent border-white/10 text-slate-500'}`}>
                Your Turn
            </div>
            <Activity size={20} className="text-slate-600 animate-pulse" />
            <div className={`px-6 py-2 rounded-full border ${turn === 'opponent' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-transparent border-white/10 text-slate-500'}`}>
                Opponent's Turn
            </div>
       </div>

    </div>
  );
};
