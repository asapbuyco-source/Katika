
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Crown, Clock, BookOpen, X, AlertTriangle, RefreshCw, Cpu, ExternalLink } from 'lucide-react';
import { Table, User as AppUser, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion as originalMotion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';
import { createLidraughtsGame, fetchLidraughtsState, makeLidraughtsMove, toCoords, toNotation } from '../services/lidraughts';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

interface CheckersGameProps {
  table: Table;
  user: AppUser;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
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
  jumpId?: string; 
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const CheckersCell = React.memo(({ r, c, isDark, piece, isSelected, isHighlighted, validMove, isLastFrom, isLastTo, onPieceClick, onMoveClick, isMeTurn, rotate }: any) => {
  const isMe = piece?.player === 'me';
  const isClickable = (isMeTurn && isMe) || !!validMove;

  // Handler wrappers to ensure we pass the specific object needed without inline arrow functions in render
  const handlePieceClick = () => { if (piece && isMe) onPieceClick(piece); };
  const handleMoveClick = () => { if (validMove) onMoveClick(validMove); };

  return (
    <div 
       onClick={(e) => { e.stopPropagation(); handlePieceClick(); handleMoveClick(); }}
       className={`relative w-full h-full flex items-center justify-center ${isDark ? 'bg-royal-900/60' : 'bg-white/5'} ${isClickable ? 'cursor-pointer' : ''}`}
       style={{ transform: rotate ? 'rotate(180deg)' : 'none' }} 
    >
        {isDark && <div className="absolute inset-0 bg-black/20 shadow-inner pointer-events-none" />}
        {(isLastFrom || isLastTo) && <div className="absolute inset-0 bg-gold-400/10 border border-gold-400/20 pointer-events-none" />}
        
        {validMove && (
           <motion.div 
             initial={{ scale: 0, opacity: 0 }} 
             animate={{ scale: 1, opacity: 1 }} 
             className={`absolute w-4 h-4 rounded-full z-10 ${validMove.isJump ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-green-500/50'}`}
           />
        )}

        <AnimatePresence mode="popLayout">
            {piece && (
                <motion.div
                    layoutId={`piece-${piece.id}`}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: isSelected ? 1.1 : 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="relative w-[80%] h-[80%] z-20 pointer-events-none"
                >
                    <div className={`
                        w-full h-full rounded-full shadow-[0_4px_6px_rgba(0,0,0,0.5)] border-2 flex items-center justify-center relative overflow-hidden transition-all duration-300
                        ${isMe ? 'bg-gradient-to-br from-gold-400 to-yellow-600 border-yellow-200' : 'bg-gradient-to-br from-red-500 to-red-700 border-red-300'} 
                        ${isSelected ? 'ring-4 ring-white/30 brightness-110' : ''}
                        ${isHighlighted ? 'ring-4 ring-red-500 animate-pulse shadow-[0_0_20px_red]' : ''}
                    `}>
                        <div className={`absolute inset-[20%] rounded-full border border-black/10 ${isMe ? 'bg-gold-300' : 'bg-red-400'}`}></div>
                        {piece.isKing && (
                            <motion.div 
                                initial={{ scale: 0, rotate: -45 }} 
                                animate={{ scale: 1, rotate: 0 }}
                                className="relative z-10"
                            >
                                <Crown size={24} className="text-white drop-shadow-md" fill="currentColor" />
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
}, (prev, next) => {
    // Custom comparison for performance
    if (prev.piece !== next.piece) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isHighlighted !== next.isHighlighted) return false;
    if (prev.validMove !== next.validMove) return false;
    if (prev.isLastFrom !== next.isLastFrom) return false;
    if (prev.isLastTo !== next.isLastTo) return false;
    if (prev.isMeTurn !== next.isMeTurn) return false;
    if (prev.rotate !== next.rotate) return false;
    return true;
});

export const CheckersGame: React.FC<CheckersGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [turn, setTurn] = useState<'me' | 'opponent'>('me');
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<{from: string, to: string} | null>(null);
  const [highlightedPieces, setHighlightedPieces] = useState<string[]>([]);
  
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [mustJumpFrom, setMustJumpFrom] = useState<string | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState({ me: 600, opponent: 600 });
  const [isGameOver, setIsGameOver] = useState(false);
  
  // Lidraughts state
  const [lidraughtsId, setLidraughtsId] = useState<string | null>(null);
  const [isLidraughtsLoading, setIsLidraughtsLoading] = useState(false);
  const lastFen = useRef<string>('');
  
  const [forwardDir, setForwardDir] = useState(-1);

  const isP2P = !!socket && !!socketGame;
  const isBotGame = !isP2P && (table.guest?.id === 'bot' || !table.guest); 

  // Refs for stable callbacks
  const stateRef = useRef({
      pieces,
      turn,
      selectedPieceId,
      validMoves,
      mustJumpFrom,
      isGameOver,
      isLidraughtsLoading,
      forwardDir,
      timeRemaining,
      lidraughtsId
  });

  useEffect(() => {
      stateRef.current = {
          pieces,
          turn,
          selectedPieceId,
          validMoves,
          mustJumpFrom,
          isGameOver,
          isLidraughtsLoading,
          forwardDir,
          timeRemaining,
          lidraughtsId
      };
  }, [pieces, turn, selectedPieceId, validMoves, mustJumpFrom, isGameOver, isLidraughtsLoading, forwardDir, timeRemaining, lidraughtsId]);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (isP2P && socketGame) {
        if (socketGame.gameState && socketGame.gameState.pieces) {
            const mappedPieces = socketGame.gameState.pieces.map((p: any) => ({
                ...p,
                player: p.owner === user.id ? 'me' : 'opponent'
            }));
            setPieces(mappedPieces);
        }
        if (socketGame.gameState && socketGame.gameState.turn) {
            setTurn(socketGame.gameState.turn === user.id ? 'me' : 'opponent');
        }
        if (socketGame.winner) {
            setIsGameOver(true);
            if (socketGame.winner === user.id) onGameEnd('win');
            else onGameEnd('loss');
        }
        if (socketGame.players && socketGame.players.length > 0) {
            const isPlayer1 = socketGame.players[0] === user.id;
            setForwardDir(isPlayer1 ? -1 : 1);
        }
    } else {
        setForwardDir(-1);
        
        // Initialize board locally regardless of AI connection success
        if (pieces.length === 0) {
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

            if (!lidraughtsId && !isLidraughtsLoading) {
                setIsLidraughtsLoading(true);
                createLidraughtsGame(1).then(data => {
                    if (data && data.id) {
                        setLidraughtsId(data.id);
                    }
                    setIsLidraughtsLoading(false);
                }).catch(() => {
                    console.warn("Lidraughts API failed, falling back to local bot.");
                    setIsLidraughtsLoading(false);
                });
            }
        }
    }
  }, [socketGame, user.id, isP2P, isBotGame]);

  // --- LIDRAUGHTS SYNC ---
  useEffect(() => {
      if (lidraughtsId && !isGameOver) {
          const interval = setInterval(async () => {
              const data = await fetchLidraughtsState(lidraughtsId);
              if (data && data.fen && data.fen !== lastFen.current) {
                  lastFen.current = data.fen;
                  parseFen(data.fen);
                  
                  const turnColor = data.fen.split(':')[0]; 
                  setTurn(turnColor === 'W' ? 'me' : 'opponent');
                  
                  if (data.status === 'mate' || data.status === 'resign' || data.status === 'draw') {
                      setIsGameOver(true);
                      const winner = data.winner; 
                      if (winner === 'white') onGameEnd('win');
                      else if (winner === 'black') onGameEnd('loss');
                      else onGameEnd('quit');
                  }
              }
          }, 1500);
          return () => clearInterval(interval);
      }
  }, [lidraughtsId, isGameOver]);

  const parseFen = (fen: string) => {
      try {
          const parts = fen.split(':');
          if (parts.length < 3) return;
          
          const newPieces: Piece[] = [];
          
          const parseSection = (section: string, player: 'me' | 'opponent') => {
              const clean = section.substring(1); 
              if (!clean) return;
              
              const items = clean.split(',');
              items.forEach(item => {
                  let isKing = false;
                  let numStr = item;
                  if (item.startsWith('K')) {
                      isKing = true;
                      numStr = item.substring(1);
                  }
                  const sq = parseInt(numStr);
                  if (!isNaN(sq)) {
                      const { r, c } = toCoords(sq);
                      newPieces.push({
                          id: `${player}-${sq}`,
                          player,
                          isKing,
                          r,
                          c
                      });
                  }
              });
          };

          parseSection(parts[1], 'me'); 
          parseSection(parts[2], 'opponent'); 
          
          setPieces(newPieces);
          playSFX('move');
      } catch (e) {
          console.error("FEN Parse Error", e);
      }
  };

  useEffect(() => {
      if (isP2P && socketGame?.gameState?.timers) {
          const oppId = socketGame.players.find((id: string) => id !== user.id);
          setTimeRemaining({
              me: socketGame.gameState.timers[user.id] || 600,
              opponent: socketGame.gameState.timers[oppId] || 600
          });
      }
  }, [socketGame?.gameState?.timers, user.id, isP2P]);

  const capturedCount = useMemo(() => {
      const meCount = pieces.filter(p => p.player === 'me').length;
      const oppCount = pieces.filter(p => p.player === 'opponent').length;
      return { me: 12 - oppCount, opponent: 12 - meCount };
  }, [pieces]);

  useEffect(() => {
      if (isGameOver) return;
      const interval = setInterval(() => {
          if (turn === 'me') {
              setTimeRemaining(prev => {
                  if (prev.me <= 0) {
                      clearInterval(interval);
                      if (isP2P && socket) socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'TIMEOUT_CLAIM' } }); 
                      onGameEnd('loss');
                      return prev;
                  }
                  return { ...prev, me: prev.me - 1 };
              });
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [turn, isGameOver, isP2P, socket, socketGame]);

  const handleQuit = () => {
      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      onGameEnd('quit');
  };

  const isValidPos = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
  
  const getGlobalValidMoves = (player: 'me' | 'opponent', currentPieces: Piece[], specificId?: string | null) => {
      const dir = stateRef.current.forwardDir;
      
      let allMoves: Move[] = [];
      const myPieces = currentPieces.filter(p => p.player === player);
      const toCheck = specificId ? myPieces.filter(p => p.id === specificId) : myPieces;

      const pieceMap = new Map(currentPieces.map(cp => [`${cp.r},${cp.c}`, cp]));

      toCheck.forEach(p => {
          const moveDir = p.player === 'me' ? dir : -dir;
          const dirs = p.isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[moveDir, -1], [moveDir, 1]];
          
          dirs.forEach(([dr, dc]) => {
             const mr = p.r + dr, mc = p.c + dc; 
             const jr = p.r + dr*2, jc = p.c + dc*2; 
             
             if (isValidPos(jr, jc) && !pieceMap.has(`${jr},${jc}`)) {
                 const mid = pieceMap.get(`${mr},${mc}`);
                 if (mid && mid.player !== player) {
                     allMoves.push({ fromR: p.r, fromC: p.c, r: jr, c: jc, isJump: true, jumpId: mid.id });
                 }
             }
          });
          
          dirs.forEach(([dr, dc]) => {
             const tr = p.r + dr, tc = p.c + dc;
             if (isValidPos(tr, tc) && !pieceMap.has(`${tr},${tc}`)) {
                 allMoves.push({ fromR: p.r, fromC: p.c, r: tr, c: tc, isJump: false });
             }
          });
      });

      const jumps = allMoves.filter(m => m.isJump);
      const finalMoves = jumps.length > 0 ? jumps : allMoves;
      
      return { moves: finalMoves, hasJump: jumps.length > 0 };
  };

  const executeMove = useCallback((move: Move) => {
      const { pieces, forwardDir, turn, timeRemaining, lidraughtsId, isGameOver } = stateRef.current;
      if (isGameOver) return;

      const pieceId = pieces.find(p => p.r === move.fromR && p.c === move.fromC)?.id;
      if (!pieceId) return;

      const nextPieces = pieces.filter(p => p.id !== move.jumpId).map(p => {
          if (p.id === pieceId) {
              const kingRow = p.player === 'me' ? (forwardDir === -1 ? 0 : 7) : (forwardDir === -1 ? 7 : 0);
              const isKing = p.isKing || move.r === kingRow;
              if (isKing && !p.isKing) playSFX('king');
              return { ...p, r: move.r, c: move.c, isKing };
          }
          return p;
      });

      setPieces(nextPieces);
      setValidMoves([]);
      setLastMove({ from: `${move.fromR},${move.fromC}`, to: `${move.r},${move.c}` });
      
      if (move.isJump) playSFX('capture'); else playSFX('move');

      if (lidraughtsId && !isP2P && turn === 'me') {
          const fromSq = toNotation(move.fromR, move.fromC);
          const toSq = toNotation(move.r, move.c);
          const moveStr = move.isJump ? `${fromSq}x${toSq}` : `${fromSq}-${toSq}`;
          makeLidraughtsMove(lidraughtsId, moveStr);
          setSelectedPieceId(null);
          return;
      }

      let nextTurn: 'me' | 'opponent' = turn === 'me' ? 'opponent' : 'me';
      let nextMustJump: string | null = null;

      if (move.isJump) {
          const movedPiece = nextPieces.find(p => p.id === pieceId)!;
          const { moves: moreJumps } = getGlobalValidMoves(movedPiece.player, nextPieces, movedPiece.id);
          const canContinueJump = moreJumps.some(m => m.isJump && m.fromR === movedPiece.r && m.fromC === movedPiece.c);
          
          if (canContinueJump) {
              nextTurn = movedPiece.player;
              nextMustJump = movedPiece.id;
          }
      }

      setMustJumpFrom(nextMustJump);
      
      const { moves: oppMoves } = getGlobalValidMoves(nextTurn, nextPieces);
      const oppPieces = nextPieces.filter(p => p.player === nextTurn);
      
      let winner = null;
      if (oppPieces.length === 0 || oppMoves.length === 0) {
          winner = turn === 'me' ? user.id : 'bot'; 
          setIsGameOver(true);
          onGameEnd(winner === user.id ? 'win' : 'loss');
      }

      if (isP2P && socket && socketGame) {
          const opponentId = socketGame.players.find((uid: string) => uid !== user.id) || 'unknown_opponent';
          const serverPieces = nextPieces.map(p => ({
              ...p,
              owner: p.player === 'me' ? user.id : opponentId
          }));
          const updatedTimers = {
              [user.id]: timeRemaining.me,
              [opponentId]: timeRemaining.opponent
          };

          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: {
                  type: 'MOVE',
                  newState: {
                      pieces: serverPieces,
                      turn: nextTurn === 'me' ? user.id : opponentId,
                      winner: winner,
                      timers: updatedTimers
                  }
              }
          });
      }

      if (nextTurn === 'me' && nextMustJump) {
          setSelectedPieceId(nextMustJump);
          const { moves } = getGlobalValidMoves('me', nextPieces, nextMustJump);
          setValidMoves(moves);
      } else {
          setTurn(nextTurn);
          setSelectedPieceId(null);
      }
  }, [isP2P, socket, socketGame, user.id]);

  // Handle UI move clicks
  const handleMoveClick = useCallback((move: Move) => {
      const { selectedPieceId, isGameOver } = stateRef.current;
      if (!selectedPieceId || isGameOver) return;
      executeMove(move);
  }, [executeMove]);

  // Stable handlers using refs to prevent board re-renders
  const handlePieceClick = useCallback((p: Piece) => {
    const { turn, pieces, mustJumpFrom, selectedPieceId, isGameOver, isLidraughtsLoading } = stateRef.current;

    if (turn !== 'me' || p.player !== 'me' || isGameOver || isLidraughtsLoading) return;
    
    const { moves, hasJump } = getGlobalValidMoves('me', pieces, mustJumpFrom);

    if (mustJumpFrom && mustJumpFrom !== p.id) {
        playSFX('error');
        setHighlightedPieces([mustJumpFrom]);
        setTimeout(() => setHighlightedPieces([]), 1500);
        return;
    }
    
    const canThisPieceJump = moves.some(m => m.fromR === p.r && m.fromC === p.c && m.isJump);
    if (hasJump && !canThisPieceJump) {
        playSFX('error');
        const mandatoryPieces = [...new Set(moves.filter(m => m.isJump).map(m => {
            const piece = pieces.find(pi => pi.r === m.fromR && pi.c === m.fromC);
            return piece ? piece.id : '';
        }))].filter(id => id !== '');
        
        setHighlightedPieces(mandatoryPieces);
        setTimeout(() => setHighlightedPieces([]), 1500);
        return; 
    }
    
    if (selectedPieceId === p.id && !mustJumpFrom) {
        setSelectedPieceId(null); 
        setValidMoves([]);
    } else {
        const pieceMoves = moves.filter(m => m.fromR === p.r && m.fromC === p.c);
        if (pieceMoves.length > 0) {
            setSelectedPieceId(p.id);
            setValidMoves(pieceMoves);
            playSFX('click');
        }
    }
  }, []);

  // Local Bot Fallback (When API fails or is not used)
  useEffect(() => {
      const { isGameOver, lidraughtsId, isLidraughtsLoading } = stateRef.current;
      
      if (isBotGame && !lidraughtsId && !isGameOver && turn === 'opponent' && !isLidraughtsLoading) {
          const timer = setTimeout(() => {
              // Recalculate based on current state (via refs or fresh access)
              const { pieces } = stateRef.current;
              const { moves } = getGlobalValidMoves('opponent', pieces);
              
              if (moves.length > 0) {
                  // Prioritize jumps for basic smarts
                  const jumps = moves.filter(m => m.isJump);
                  const candidates = jumps.length > 0 ? jumps : moves;
                  const randomMove = candidates[Math.floor(Math.random() * candidates.length)];
                  executeMove(randomMove);
              } else {
                  // No moves available for bot -> Player Wins
                  setIsGameOver(true);
                  onGameEnd('win');
              }
          }, 1000);
          return () => clearTimeout(timer);
      }
  }, [turn, isBotGame, pieces]);

  const pieceMap = useMemo(() => new Map(pieces.map(p => [`${p.r},${p.c}`, p])), [pieces]);
  const validMoveMap = useMemo(() => new Map(validMoves.map(m => [`${m.r},${m.c}`, m])), [validMoves]);

  const getOpponentProfile = () => {
      if (!isP2P) return { name: lidraughtsId ? "Lidraughts AI" : "Vantage Bot", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=checkers" };
      if (socketGame?.profiles) {
          const oppId = socketGame.players.find((id: string) => id !== user.id);
          return socketGame.profiles[oppId] || { name: "Opponent", avatar: "https://i.pravatar.cc/150?u=opp" };
      }
      return { name: "Opponent", avatar: "https://i.pravatar.cc/150?u=opp" };
  };
  const opponent = getOpponentProfile();

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Forfeit Modal */}
        <AnimatePresence>
          {showForfeitModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForfeitModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                  <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-[#1a1a1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                      <div className="flex flex-col items-center text-center mb-6">
                          <AlertTriangle className="text-red-500 mb-4" size={32} />
                          <h2 className="text-xl font-bold text-white mb-2">Forfeit Match?</h2>
                          <p className="text-sm text-slate-400">
                              Leaving now will result in an <span className="text-red-400 font-bold">immediate loss</span>.
                          </p>
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => setShowForfeitModal(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10">Resume</button>
                          <button onClick={handleQuit} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl">Forfeit</button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

       {/* Rules Modal */}
       <AnimatePresence>
          {showRulesModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowRulesModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                  <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-royal-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
                      <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
                          <h2 className="text-xl font-bold text-white flex items-center gap-2"><BookOpen size={20} className="text-gold-400"/> Checkers Rules</h2>
                          <button onClick={() => setShowRulesModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                      </div>
                      <div className="overflow-y-auto space-y-4 text-sm text-slate-300 pr-2 custom-scrollbar">
                          <section>
                              <h3 className="text-white font-bold mb-1">Objective</h3>
                              <p>Capture all of your opponent's pieces or block them so they cannot move. If a player has no pieces left or no valid moves, they lose.</p>
                          </section>
                          <section>
                              <h3 className="text-white font-bold mb-1">Movement</h3>
                              <p>Pieces move forward diagonally to an adjacent unoccupied square. Kings can move forward and backward diagonally.</p>
                          </section>
                          <section>
                              <h3 className="text-white font-bold mb-1">Capturing</h3>
                              <p>If an adjacent square contains an opponent's piece, and the square immediately beyond it is empty, you must jump over it to capture. <strong className="text-red-400">Jumps are mandatory!</strong></p>
                          </section>
                          <section>
                              <h3 className="text-white font-bold mb-1">King Promotion</h3>
                              <p>When a piece reaches the farthest row on the opposite side, it becomes a King.</p>
                          </section>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

        {/* Header */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-4 mt-2">
            <div className="flex items-center gap-2">
                <button onClick={() => setShowForfeitModal(true)} className="flex items-center gap-2 text-slate-400 hover:text-white">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
                </button>
                <button onClick={() => setShowRulesModal(true)} className="p-2 bg-white/5 rounded-xl border border-white/10 text-gold-400 hover:text-white">
                    <BookOpen size={18} />
                </button>
            </div>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

        {/* Turn Indicator */}
        <div className="mb-2 flex flex-col items-center justify-center">
            {isLidraughtsLoading ? (
                <div className="px-6 py-2 rounded-full bg-royal-800 text-gold-400 border border-gold-500/30 flex items-center gap-2">
                    <RefreshCw className="animate-spin" size={16} /> Starting Engine...
                </div>
            ) : (
                <motion.div 
                    key={turn}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`px-8 py-2 rounded-full font-black text-sm uppercase tracking-widest shadow-lg transition-all duration-300 ${
                        turn === 'me' 
                        ? 'bg-gold-500 text-royal-950 scale-110 shadow-gold-500/20' 
                        : 'bg-royal-800 text-slate-400 border border-white/10'
                    }`}
                >
                    {turn === 'me' ? "Your Turn" : "Opponent's Turn"}
                </motion.div>
            )}
        </div>

        {/* OPPONENT BAR */}
        <div className="w-full max-w-[500px] flex justify-between items-end mb-2 px-2">
            <div className="flex items-center gap-3">
                <img src={opponent.avatar} className="w-10 h-10 rounded-full border border-red-500" alt="Opponent" />
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">{opponent.name}</span>
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                        Captured: <span className="text-white">{capturedCount.opponent}</span>
                    </span>
                </div>
                {lidraughtsId && <a href={`https://lidraughts.org/${lidraughtsId}`} target="_blank" className="text-xs text-blue-400 flex items-center gap-1"><ExternalLink size={10}/> View</a>}
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${turn === 'opponent' ? 'bg-red-500/20 border-red-500 text-white animate-pulse' : 'bg-black/30 border-white/10 text-slate-400'}`}>
                <Clock size={16} />
                <span className="font-mono font-bold text-lg">{formatTime(timeRemaining.opponent)}</span>
            </div>
       </div>

       {/* BOARD */}
       <div className={`relative w-full max-w-[500px] aspect-square bg-[#1a103c] rounded-xl shadow-2xl p-1 md:p-2 border-4 ${turn === 'me' ? 'border-gold-500/50' : 'border-royal-800'} transition-colors duration-300`}>
           <div className={`w-full h-full grid grid-cols-8 grid-rows-8 border border-white/10 overflow-hidden rounded-lg transition-all duration-700 ${forwardDir === 1 ? 'rotate-180' : ''}`}>
               {Array.from({length: 8}).map((_, r) => Array.from({length: 8}).map((_, c) => {
                   const key = `${r},${c}`;
                   return <CheckersCell 
                            key={key} 
                            r={r} 
                            c={c} 
                            isDark={(r+c)%2===1} 
                            piece={pieceMap.get(key)} 
                            isSelected={selectedPieceId === pieceMap.get(key)?.id} 
                            isHighlighted={highlightedPieces.includes(pieceMap.get(key)?.id || '')}
                            validMove={validMoveMap.get(key)} 
                            isLastFrom={lastMove?.from === key} 
                            isLastTo={lastMove?.to === key} 
                            onPieceClick={handlePieceClick} 
                            onMoveClick={handleMoveClick} 
                            isMeTurn={turn === 'me'}
                            rotate={forwardDir === 1} 
                          />;
               }))}
           </div>
       </div>

       {/* PLAYER BAR (ME) */}
       <div className="w-full max-w-[500px] flex justify-between items-start mt-2 mb-4 px-2">
            <div className="flex items-center gap-3">
                <img src={user.avatar} className="w-10 h-10 rounded-full border border-gold-500" alt="Me" />
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">You</span>
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                        Captured: <span className="text-white">{capturedCount.me}</span>
                    </span>
                </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${turn === 'me' ? 'bg-gold-500/20 border-gold-500 text-white animate-pulse' : 'bg-black/30 border-white/10 text-slate-400'}`}>
                <Clock size={16} />
                <span className="font-mono font-bold text-lg">{formatTime(timeRemaining.me)}</span>
            </div>
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
