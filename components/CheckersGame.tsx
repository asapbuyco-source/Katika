
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Crown } from 'lucide-react';
import { Table, User as AppUser, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';

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

// Pure helper
const isValidPos = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const CheckersCell = React.memo(({ r, c, isDark, piece, isSelected, isHighlighted, validMove, isLastFrom, isLastTo, onPieceClick, onMoveClick, isMeTurn, rotate }: any) => {
  const isMe = piece?.player === 'me';
  
  const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Prioritize move if valid (empty square usually), else select piece
      if (validMove) {
          onMoveClick(validMove);
      } else if (piece && isMe) {
          onPieceClick(piece);
      }
  };

  const isClickable = (isMeTurn && isMe) || !!validMove;

  return (
    <div 
       onClick={handleClick}
       className={`relative w-full h-full flex items-center justify-center ${isDark ? 'bg-royal-900/60' : 'bg-white/5'} ${isClickable ? 'cursor-pointer' : ''}`}
       style={{ transform: rotate ? 'rotate(180deg)' : 'none' }} 
    >
        {isDark && <div className="absolute inset-0 bg-black/20 shadow-inner pointer-events-none" />}
        {(isLastFrom || isLastTo) && <div className="absolute inset-0 bg-gold-400/10 border border-gold-400/20 pointer-events-none" />}
        
        {validMove && (
           <motion.div 
             initial={{ scale: 0, opacity: 0 }} 
             animate={{ scale: 1, opacity: 1 }} 
             className={`absolute w-6 h-6 rounded-full z-10 ${validMove.isJump ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-green-500/50 hover:bg-green-400/80'} border-2 border-white/20`}
           />
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
  const [isGameOver, setIsGameOver] = useState(false);
  const [forwardDir, setForwardDir] = useState(-1);

  const isP2P = !!socket && !!socketGame;
  const isBotGame = !isP2P && (table.guest?.id === 'bot' || table.host?.id === 'bot');

  // --- LOGIC HELPERS ---
  const getGlobalValidMoves = useCallback((player: 'me' | 'opponent', currentPieces: Piece[], specificId?: string | null) => {
      let allMoves: Move[] = [];
      const myPieces = currentPieces.filter(p => p.player === player);
      const toCheck = specificId ? myPieces.filter(p => p.id === specificId) : myPieces;
      const pieceMap = new Map(currentPieces.map(cp => [`${cp.r},${cp.c}`, cp]));

      toCheck.forEach(p => {
          // Determine "forward" for this piece. 
          const moveDir = p.player === 'me' ? forwardDir : -forwardDir;
          const directions = p.isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[moveDir, -1], [moveDir, 1]];
          
          // Check Jumps First
          directions.forEach(([dr, dc]) => {
             const mr = p.r + dr, mc = p.c + dc; 
             const jr = p.r + dr*2, jc = p.c + dc*2; 
             
             if (isValidPos(jr, jc) && !pieceMap.has(`${jr},${jc}`)) {
                 const mid = pieceMap.get(`${mr},${mc}`);
                 if (mid && mid.player !== player) {
                     allMoves.push({ fromR: p.r, fromC: p.c, r: jr, c: jc, isJump: true, jumpId: mid.id });
                 }
             }
          });

          // Check Regular Moves (Only allowed if not forced to jump elsewhere - logic handled by filter below)
          if (!specificId) {
              directions.forEach(([dr, dc]) => {
                 const tr = p.r + dr, tc = p.c + dc;
                 if (isValidPos(tr, tc) && !pieceMap.has(`${tr},${tc}`)) {
                     allMoves.push({ fromR: p.r, fromC: p.c, r: tr, c: tc, isJump: false });
                 }
              });
          }
      });

      const hasJump = allMoves.some(m => m.isJump);
      // Forced Jump Rule
      const moves = hasJump ? allMoves.filter(m => m.isJump) : allMoves;
      return { moves, hasJump };
  }, [forwardDir]);

  // --- ACTIONS ---
  const executeMove = useCallback((move: Move) => {
      const pieceId = pieces.find(p => p.r === move.fromR && p.c === move.fromC)?.id;
      if (!pieceId) return;

      // P2P Logic
      if (isP2P && socket && socketGame) {
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: {
                  type: 'MOVE',
                  move: {
                      fromR: move.fromR, fromC: move.fromC,
                      toR: move.r, toC: move.c
                  }
              }
          });
          setSelectedPieceId(null);
          setValidMoves([]);
          return;
      }

      // Local/Bot Execution
      const currentPiece = pieces.find(p => p.id === pieceId);
      if (!currentPiece) return;

      const nextPieces = pieces.filter(p => p.id !== move.jumpId).map(p => {
          if (p.id === pieceId) {
              // Promotion
              const promoRow = p.player === 'me' ? (forwardDir === -1 ? 0 : 7) : (forwardDir === -1 ? 7 : 0);
              const isKing = p.isKing || move.r === promoRow;
              if (isKing && !p.isKing) playSFX('king');
              return { ...p, r: move.r, c: move.c, isKing };
          }
          return p;
      });

      setPieces(nextPieces);
      setValidMoves([]);
      setLastMove({ from: `${move.fromR},${move.fromC}`, to: `${move.r},${move.c}` });
      if (move.isJump) playSFX('capture'); else playSFX('move');

      // Win Check
      const oppPlayer = currentPiece.player === 'me' ? 'opponent' : 'me';
      if (nextPieces.filter(p => p.player === oppPlayer).length === 0) {
          setIsGameOver(true);
          onGameEnd(currentPiece.player === 'me' ? 'win' : 'loss');
          return;
      }

      // Turn Management
      let nextTurn = turn === 'me' ? 'opponent' : 'me';
      let nextMustJump: string | null = null;

      if (move.isJump) {
          const movedPiece = nextPieces.find(p => p.id === pieceId)!;
          // Check for multi-jump
          const { moves: moreJumps } = getGlobalValidMoves(movedPiece.player, nextPieces, movedPiece.id);
          if (moreJumps.length > 0 && moreJumps[0].isJump) {
              nextTurn = movedPiece.player;
              nextMustJump = movedPiece.id;
          }
      }
      setMustJumpFrom(nextMustJump);
      
      if (nextTurn === turn) { 
          if (nextTurn === 'me') {
              setSelectedPieceId(nextMustJump);
              const { moves } = getGlobalValidMoves('me', nextPieces, nextMustJump);
              setValidMoves(moves);
          }
      } else {
          setTurn(nextTurn as any);
          setSelectedPieceId(null);
      }
  }, [pieces, turn, isP2P, socket, socketGame, forwardDir, getGlobalValidMoves, onGameEnd]);

  // --- BOT ---
  const makeBotMove = useCallback(() => {
      const { moves } = getGlobalValidMoves('opponent', pieces, mustJumpFrom);
      
      if (moves.length === 0) {
          setIsGameOver(true);
          onGameEnd('win');
          return;
      }

      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      executeMove(randomMove);
  }, [pieces, mustJumpFrom, getGlobalValidMoves, executeMove, onGameEnd]);

  // --- EFFECT: BOT TURN ---
  useEffect(() => {
      if (isBotGame && turn === 'opponent' && !isGameOver) {
          const timer = setTimeout(() => {
              makeBotMove();
          }, 1000);
          return () => clearTimeout(timer);
      }
  }, [turn, isBotGame, isGameOver, makeBotMove]); // Depend on makeBotMove which depends on pieces

  // --- HANDLERS ---
  const handlePieceClick = useCallback((p: Piece) => {
    if (turn !== 'me' || p.player !== 'me' || isGameOver) return;
    if (mustJumpFrom && mustJumpFrom !== p.id) { 
        playSFX('error'); 
        return; 
    }
    
    const { moves, hasJump } = getGlobalValidMoves('me', pieces, mustJumpFrom);
    const pieceMoves = moves.filter(m => m.fromR === p.r && m.fromC === p.c);
    const canThisPieceJump = pieceMoves.some(m => m.isJump);
    
    // Forced Jump Check
    if (hasJump && !canThisPieceJump) {
        playSFX('error');
        const jumpingPieces = [...new Set(moves.filter(m => m.isJump).map(m => pieces.find(pi => pi.r === m.fromR && pi.c === m.fromC)?.id || ''))];
        setHighlightedPieces(jumpingPieces);
        setTimeout(() => setHighlightedPieces(mustJumpFrom ? [mustJumpFrom] : []), 1000);
        return; 
    }
    
    if (selectedPieceId === p.id && !mustJumpFrom) {
        setSelectedPieceId(null); 
        setValidMoves([]);
    } else {
        setSelectedPieceId(p.id);
        setValidMoves(pieceMoves);
        playSFX('click');
    }
  }, [turn, pieces, mustJumpFrom, selectedPieceId, isGameOver, getGlobalValidMoves]);

  const handleMoveClick = useCallback((move: Move) => {
      if (isGameOver) return;
      executeMove(move);
  }, [isGameOver, executeMove]);

  // --- INIT & SYNC ---
  useEffect(() => {
    if (isP2P && socketGame) {
        // ... (P2P State Sync - Same as before)
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
        if (socketGame.players && socketGame.players.length > 0) {
            const isPlayer1 = socketGame.players[0] === user.id;
            setForwardDir(isPlayer1 ? -1 : 1);
        }
        if (socketGame.winner) {
            setIsGameOver(true);
            onGameEnd(socketGame.winner === user.id ? 'win' : 'loss');
        }
    } else {
        // Init Local Game
        if (pieces.length === 0) {
            setForwardDir(-1);
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
    }
  }, [socketGame, isP2P, user.id, pieces.length, onGameEnd]);

  const handleQuit = () => {
      if (isP2P && socket) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      onGameEnd('quit');
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
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

        <div className="mb-4">
             <div className={`px-6 py-2 rounded-full font-bold text-sm uppercase tracking-widest shadow-lg transition-all ${turn === 'me' ? 'bg-gold-500 text-royal-950 scale-105' : 'bg-royal-800 text-slate-500'}`}>
                 {turn === 'me' ? "Your Turn" : "Opponent's Turn"}
             </div>
        </div>

        <div className="relative w-full max-w-[600px] aspect-square bg-royal-900 rounded-xl shadow-2xl p-2 border-8 border-royal-800">
            <div className="w-full h-full grid grid-cols-8 grid-rows-8 bg-[#f0d9b5] border-4 border-[#b58863]">
                {Array.from({ length: 8 }).map((_, rowIndex) => {
                    const r = forwardDir === -1 ? rowIndex : 7 - rowIndex;
                    return Array.from({ length: 8 }).map((_, colIndex) => {
                        const c = forwardDir === -1 ? colIndex : 7 - colIndex;
                        const isDark = (r + c) % 2 === 1;
                        const piece = pieces.find(p => p.r === r && p.c === c);
                        const move = validMoves.find(m => m.r === r && m.c === c);
                        const isSelected = selectedPieceId === piece?.id;
                        const isHighlighted = highlightedPieces.includes(piece?.id || '');

                        return (
                            <div key={`${r}-${c}`} className="w-full h-full">
                                <CheckersCell 
                                    r={r} c={c} 
                                    isDark={isDark}
                                    piece={piece}
                                    isSelected={isSelected}
                                    isHighlighted={isHighlighted}
                                    validMove={move}
                                    onPieceClick={handlePieceClick}
                                    onMoveClick={handleMoveClick}
                                    isMeTurn={turn === 'me'}
                                />
                            </div>
                        );
                    })
                })}
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
