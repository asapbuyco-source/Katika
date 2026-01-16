
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Shield, Trophy, RefreshCw, AlertTriangle, Crown, Brain, Clock } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';

interface ChessGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
}

// Types
type Color = 'w' | 'b';
type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
interface Piece { type: PieceType; color: Color; moved: boolean }
type Board = (Piece | null)[][];
interface Position { r: number; c: number }
interface Move { from: Position; to: Position; special?: 'castling' | 'enpassant' | 'promotion' }

const INITIAL_BOARD_LAYOUT: (PieceType | null)[][] = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
];

// Helper to deep copy board
const cloneBoard = (b: Board): Board => b.map(row => row.map(p => (p ? { ...p } : null)));

// Helper for initial state
const getInitialBoard = (): Board => {
    return INITIAL_BOARD_LAYOUT.map((row, r) => 
      row.map((type) => {
        if (!type) return null;
        return { type, color: r < 2 ? 'b' : 'w', moved: false };
      })
    );
};

// --- HELPER: TIME FORMATTER ---
const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const TimerDisplay = ({ time, isActive }: { time: number, isActive: boolean }) => (
    <div className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors duration-300
        ${isActive 
            ? time < 60 
                ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' 
                : 'bg-white text-royal-950 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
            : 'bg-black/30 border-white/10 text-slate-500'}
    `}>
        <Clock size={16} className={isActive ? 'animate-pulse' : ''} />
        <span className="font-mono font-bold text-xl leading-none pt-0.5">{formatTime(time)}</span>
    </div>
);

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd }) => {
  // State
  const [board, setBoard] = useState<Board>(getInitialBoard);
  const [turn, setTurn] = useState<Color>('w'); // 'w' = User (Gold), 'b' = Bot (Purple)
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [captured, setCaptured] = useState<{ w: PieceType[], b: PieceType[] }>({ w: [], b: [] });
  const [status, setStatus] = useState<'playing' | 'check' | 'checkmate' | 'stalemate'>('playing');
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [serverHash, setServerHash] = useState("");

  // Timer State (10 minutes each)
  const [timeRemaining, setTimeRemaining] = useState({ w: 600, b: 600 });
  const [isGameOver, setIsGameOver] = useState(false);

  // Init
  useEffect(() => {
    // Game is already initialized by useState, just set hash
    setServerHash(Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join(''));
  }, []);

  // Timer Effect
  useEffect(() => {
      if (isGameOver || status === 'checkmate' || status === 'stalemate') return;

      const timer = setInterval(() => {
          setTimeRemaining(prev => {
              const newTime = { ...prev };
              if (newTime[turn] > 0) {
                  newTime[turn] -= 1;
              } else {
                  clearInterval(timer);
                  setIsGameOver(true);
                  if (turn === 'w') onGameEnd('loss'); // User ran out of time
                  else onGameEnd('win'); // Bot ran out of time
              }
              return newTime;
          });
      }, 1000);

      return () => clearInterval(timer);
  }, [turn, isGameOver, status, onGameEnd]);

  const addLog = (msg: string, logStatus: 'secure' | 'alert' | 'scanning' = 'secure') => {
    setRefereeLog({ id: Date.now().toString(), message: msg, status: logStatus, timestamp: Date.now() });
  };

  // --- ENGINE LOGIC ---

  const isValidPos = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const getMovesForPiece = (b: Board, p: Piece, r: number, c: number, checkSafety = true): Move[] => {
    const moves: Move[] = [];
    const forward = p.color === 'w' ? -1 : 1;
    const startRow = p.color === 'w' ? 6 : 1;
    const opponent = p.color === 'w' ? 'b' : 'w';

    const addMove = (tr: number, tc: number, special?: Move['special']) => {
       moves.push({ from: { r, c }, to: { r: tr, c: tc }, special });
    };

    if (p.type === 'p') {
        // Forward 1
        if (isValidPos(r + forward, c) && b[r + forward] && !b[r + forward][c]) {
            addMove(r + forward, c, (r + forward === 0 || r + forward === 7) ? 'promotion' : undefined);
            // Forward 2
            if (r === startRow && isValidPos(r + forward * 2, c) && b[r + forward * 2] && !b[r + forward * 2][c]) {
                addMove(r + forward * 2, c);
            }
        }
        // Capture
        [[forward, -1], [forward, 1]].forEach(([dr, dc]) => {
            const tr = r + dr, tc = c + dc;
            if (isValidPos(tr, tc) && b[tr]) {
                if (b[tr][tc]?.color === opponent) {
                     addMove(tr, tc, (tr === 0 || tr === 7) ? 'promotion' : undefined);
                }
                // En Passant (Simplified: Check last move)
                if (!b[tr][tc] && lastMove && 
                    lastMove.to.r === r && lastMove.to.c === tc && 
                    b[r][tc]?.type === 'p' && b[r][tc]?.color === opponent && 
                    Math.abs(lastMove.from.r - lastMove.to.r) === 2) {
                        addMove(tr, tc, 'enpassant');
                }
            }
        });
    }
    
    if (p.type === 'n') {
        [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].forEach(([dr, dc]) => {
            const tr = r + dr, tc = c + dc;
            if (isValidPos(tr, tc) && b[tr] && (!b[tr][tc] || b[tr][tc]?.color === opponent)) addMove(tr, tc);
        });
    }

    if (['r', 'b', 'q'].includes(p.type)) {
        const directions = [];
        if (p.type !== 'b') directions.push([0,1],[0,-1],[1,0],[-1,0]); // Rook
        if (p.type !== 'r') directions.push([1,1],[1,-1],[-1,1],[-1,-1]); // Bishop
        
        directions.forEach(([dr, dc]) => {
            let tr = r + dr, tc = c + dc;
            while (isValidPos(tr, tc) && b[tr]) {
                if (!b[tr][tc]) {
                    addMove(tr, tc);
                } else {
                    if (b[tr][tc]?.color === opponent) addMove(tr, tc);
                    break;
                }
                tr += dr; tc += dc;
            }
        });
    }

    if (p.type === 'k') {
        [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr, dc]) => {
            const tr = r + dr, tc = c + dc;
            if (isValidPos(tr, tc) && b[tr] && (!b[tr][tc] || b[tr][tc]?.color === opponent)) addMove(tr, tc);
        });

        // Castling
        if (!p.moved && checkSafety && !isInCheck(b, p.color)) {
            // Kingside
            if (b[r][7]?.type === 'r' && !b[r][7]?.moved && !b[r][5] && !b[r][6]) {
                if (!isSquareAttacked(b, r, 5, opponent) && !isSquareAttacked(b, r, 6, opponent)) {
                    addMove(r, 6, 'castling');
                }
            }
            // Queenside
            if (b[r][0]?.type === 'r' && !b[r][0]?.moved && !b[r][1] && !b[r][2] && !b[r][3]) {
                if (!isSquareAttacked(b, r, 3, opponent) && !isSquareAttacked(b, r, 2, opponent)) { 
                     addMove(r, 2, 'castling');
                }
            }
        }
    }

    if (checkSafety) {
        // Filter moves that leave king in check
        return moves.filter(m => {
            const simBoard = simulateMove(b, m);
            return !isInCheck(simBoard, p.color);
        });
    }
    return moves;
  };

  const isSquareAttacked = (b: Board, r: number, c: number, attackerColor: Color): boolean => {
      for (let i = 0; i < 8; i++) {
          if (!b[i]) continue;
          for (let j = 0; j < 8; j++) {
              const p = b[i][j];
              if (p && p.color === attackerColor) {
                  const moves = getMovesForPiece(b, p, i, j, false); // Don't recurse safety check
                  if (moves.some(m => m.to.r === r && m.to.c === c)) return true;
              }
          }
      }
      return false;
  };

  const isInCheck = (b: Board, color: Color): boolean => {
      let kPos = { r: -1, c: -1 };
      for (let i = 0; i < 8; i++) {
          if (!b[i]) continue;
          for (let j = 0; j < 8; j++) {
              if (b[i][j]?.type === 'k' && b[i][j]?.color === color) {
                  kPos = { r: i, c: j };
                  break;
              }
          }
      }
      if (kPos.r === -1) return false; // Should not happen
      return isSquareAttacked(b, kPos.r, kPos.c, color === 'w' ? 'b' : 'w');
  };

  const hasLegalMoves = (b: Board, color: Color): boolean => {
      for (let i = 0; i < 8; i++) {
          if (!b[i]) continue;
          for (let j = 0; j < 8; j++) {
              const p = b[i][j];
              if (p && p.color === color) {
                  if (getMovesForPiece(b, p, i, j, true).length > 0) return true;
              }
          }
      }
      return false;
  };

  const simulateMove = (b: Board, m: Move): Board => {
      const nb = cloneBoard(b);
      const p = nb[m.from.r][m.from.c]!;
      
      // Handle Capture logic for En Passant
      if (m.special === 'enpassant') {
          nb[m.from.r][m.to.c] = null; // Remove captured pawn
      }
      
      nb[m.to.r][m.to.c] = p;
      nb[m.from.r][m.from.c] = null;
      p.moved = true;

      // Castling
      if (m.special === 'castling') {
          if (m.to.c === 6) { // Kingside
              const rook = nb[m.from.r][7]!;
              nb[m.from.r][5] = rook;
              nb[m.from.r][7] = null;
              rook.moved = true;
          } else { // Queenside
              const rook = nb[m.from.r][0]!;
              nb[m.from.r][3] = rook;
              nb[m.from.r][0] = null;
              rook.moved = true;
          }
      }

      // Promotion (Auto Queen)
      if (m.special === 'promotion') {
          p.type = 'q';
      }

      return nb;
  };

  // --- ACTIONS ---

  const handleSquareClick = (r: number, c: number) => {
      // Allow moving if playing OR if in check. Only block on mate/stalemate.
      if (turn === 'b' || (status !== 'playing' && status !== 'check') || isGameOver) return; // Bot turn
      if (!board[r]) return;

      const clickedPiece = board[r][c];
      
      // If same piece clicked, deselect
      if (selectedPos?.r === r && selectedPos?.c === c) {
          setSelectedPos(null);
          setValidMoves([]);
          return;
      }

      // If valid move clicked
      const move = validMoves.find(m => m.to.r === r && m.to.c === c);
      if (move) {
          executeMove(move);
          return;
      }

      // Select piece
      if (clickedPiece && clickedPiece.color === 'w') {
          setSelectedPos({ r, c });
          const moves = getMovesForPiece(board, clickedPiece, r, c, true);
          setValidMoves(moves);
          playSFX('click');
      } else {
          // Clicked empty or enemy
          setSelectedPos(null);
          setValidMoves([]);
      }
  };

  const executeMove = (m: Move) => {
      // Capture tracking
      const target = board[m.to.r][m.to.c];
      if (target) {
          setCaptured(prev => ({ ...prev, [turn === 'w' ? 'w' : 'b']: [...prev[turn === 'w' ? 'w' : 'b'], target.type] }));
          playSFX('capture');
      } else if (m.special === 'enpassant') {
          setCaptured(prev => ({ ...prev, [turn === 'w' ? 'w' : 'b']: [...prev[turn === 'w' ? 'w' : 'b'], 'p'] }));
          playSFX('capture');
      } else {
          playSFX('move');
      }

      const nextBoard = simulateMove(board, m);
      setBoard(nextBoard);
      setLastMove(m);
      setValidMoves([]);
      setSelectedPos(null);

      // Check Game Status
      const nextTurn = turn === 'w' ? 'b' : 'w';
      const inCheck = isInCheck(nextBoard, nextTurn);
      const hasMoves = hasLegalMoves(nextBoard, nextTurn);

      if (inCheck && !hasMoves) {
          setStatus('checkmate');
          setIsGameOver(true);
          onGameEnd(turn === 'w' ? 'win' : 'loss');
      } else if (!inCheck && !hasMoves) {
          setStatus('stalemate');
          setIsGameOver(true);
          onGameEnd('quit'); // Draw
      } else if (inCheck) {
          setStatus('check');
          addLog("CHECK!", "alert");
          playSFX('notification');
          setTurn(nextTurn);
      } else {
          setStatus('playing');
          setTurn(nextTurn);
      }
  };

  // Bot Turn
  useEffect(() => {
      if (turn === 'b' && status !== 'checkmate' && status !== 'stalemate' && !isGameOver) {
          const timeout = setTimeout(() => {
              makeBotMove();
          }, 1000);
          return () => clearTimeout(timeout);
      }
  }, [turn, status, board, isGameOver]); 

  const makeBotMove = () => {
      // Collect all moves
      let allMoves: Move[] = [];
      for (let r = 0; r < 8; r++) {
          if (!board[r]) continue;
          for (let c = 0; c < 8; c++) {
              if (board[r][c]?.color === 'b') {
                  allMoves.push(...getMovesForPiece(board, board[r][c]!, r, c, true));
              }
          }
      }

      if (allMoves.length === 0) return; // Should be handled by game state checks

      // Simple AI: Prioritize Captures, then Checks, then Random
      const captureMoves = allMoves.filter(m => board[m.to.r][m.to.c] !== null);
      let selectedMove = captureMoves.length > 0 
          ? captureMoves[Math.floor(Math.random() * captureMoves.length)] 
          : allMoves[Math.floor(Math.random() * allMoves.length)];
      
      addLog("Bot calculating...", "scanning");
      setTimeout(() => {
          executeMove(selectedMove);
          addLog("Bot move executed", "secure");
      }, 500);
  };

  // --- RENDER ---
  const renderSquare = (r: number, c: number) => {
      const isDark = (r + c) % 2 === 1;
      const piece = board[r]?.[c];
      const isSelected = selectedPos?.r === r && selectedPos?.c === c;
      const isValid = validMoves.some(m => m.to.r === r && m.to.c === c);
      const isLastFrom = lastMove?.from.r === r && lastMove?.from.c === c;
      const isLastTo = lastMove?.to.r === r && lastMove?.to.c === c;

      return (
          <div 
             key={`${r}-${c}`}
             onClick={() => handleSquareClick(r, c)}
             className={`
                relative w-full h-full flex items-center justify-center
                ${isDark ? 'bg-royal-900/60' : 'bg-slate-300/10'}
                ${isSelected ? 'bg-gold-500/20' : ''}
                ${(isLastFrom || isLastTo) ? 'bg-purple-500/20' : ''}
             `}
          >
              {/* Highlight Valid Move */}
              {isValid && (
                  <div className={`absolute w-3 h-3 rounded-full ${piece ? 'bg-red-500 ring-4 ring-red-500/20' : 'bg-green-500/50'}`} />
              )}

              {piece && (
                  <div className={`
                     text-3xl md:text-5xl select-none transition-transform duration-200
                     ${piece.color === 'w' ? 'text-gold-400 drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]' : 'text-purple-400 drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]'}
                     ${isSelected ? 'scale-110 drop-shadow-[0_0_10px_gold]' : ''}
                  `}>
                      {getPieceSymbol(piece.type)}
                  </div>
              )}
              
              {/* Rank/File Labels */}
              {c === 0 && <span className="absolute left-0.5 top-0.5 text-[8px] text-slate-500 font-mono">{8 - r}</span>}
              {r === 7 && <span className="absolute right-0.5 bottom-0 text-[8px] text-slate-500 font-mono">{String.fromCharCode(97 + c)}</span>}
          </div>
      );
  };

  const getPieceSymbol = (type: PieceType) => {
      const symbols = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
      return symbols[type];
  };

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
                      <div className="flex flex-col items-center text-center mb-6">
                          <AlertTriangle className="text-red-500 mb-4" size={32} />
                          <h2 className="text-xl font-bold text-white mb-2">Resign Game?</h2>
                          <p className="text-sm text-slate-400">Your stake will be forfeited.</p>
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => { setShowForfeitModal(false); playSFX('click'); }} className="flex-1 py-3 bg-white/5 rounded-xl text-slate-300 font-bold">Cancel</button>
                          <button onClick={() => { onGameEnd('quit'); playSFX('click'); }} className="flex-1 py-3 bg-red-600 rounded-xl text-white font-bold">Resign</button>
                      </div>
                  </motion.div>
              </div>
          )}
       </AnimatePresence>

       {/* Header */}
       <div className="w-full max-w-2xl flex justify-between items-center mb-6 mt-2">
            <button onClick={() => { setShowForfeitModal(true); playSFX('click'); }} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
            </button>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block">
                 <AIReferee externalLog={refereeLog} />
            </div>
       </div>

       {/* Opponent Info */}
       <div className="w-full max-w-xl flex justify-between items-center mb-4 px-4">
           <div className="flex items-center gap-3">
               <div className={`w-12 h-12 rounded-full border-2 ${turn === 'b' ? 'border-purple-500 shadow-[0_0_15px_purple]' : 'border-slate-700'} overflow-hidden`}>
                   <img src={table.host?.avatar || "https://i.pravatar.cc/150"} className="w-full h-full object-cover" />
               </div>
               <div>
                   <div className="text-sm font-bold text-white">{table.host?.name || "Opponent"}</div>
                   <div className="flex gap-1 text-gold-400 text-xs mb-1">{captured.w.map((p, i) => <span key={i}>{getPieceSymbol(p)}</span>)}</div>
               </div>
           </div>
           <TimerDisplay time={timeRemaining.b} isActive={turn === 'b'} />
       </div>

       {/* Chess Board */}
       <div className="relative w-full max-w-[600px] aspect-square bg-[#1a103c] rounded-xl shadow-2xl p-1 md:p-2 border-4 border-royal-800">
            <div className="w-full h-full grid grid-cols-8 grid-rows-8 border border-white/10">
                {Array.from({length: 8}).map((_, r) => 
                    Array.from({length: 8}).map((_, c) => renderSquare(r, c))
                )}
            </div>
            
            {/* Status Overlay */}
            <AnimatePresence>
                {(status === 'checkmate' || status === 'stalemate') && (
                     <motion.div 
                        initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                     >
                         <div className="bg-black/80 backdrop-blur-md px-8 py-4 rounded-2xl border border-gold-500/50 text-center">
                             <div className="text-gold-400 font-black text-4xl mb-1 uppercase tracking-widest drop-shadow-lg">
                                 {status === 'checkmate' ? (turn === 'b' ? 'VICTORY' : 'DEFEAT') : status.toUpperCase()}
                             </div>
                         </div>
                     </motion.div>
                )}
            </AnimatePresence>

            {/* Small Check Alert */}
            <AnimatePresence>
                {status === 'check' && (
                     <motion.div 
                        initial={{ y: -20, opacity: 0 }} 
                        animate={{ y: 0, opacity: 1 }} 
                        exit={{ y: -20, opacity: 0 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-red-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 pointer-events-none border border-red-400"
                     >
                         <AlertTriangle size={16} /> CHECK! Protect your King
                     </motion.div>
                )}
            </AnimatePresence>
       </div>

       {/* Player Info */}
       <div className="w-full max-w-xl flex justify-between items-center mt-4 px-4">
           <div className="flex items-center gap-3">
               <div className={`w-12 h-12 rounded-full border-2 ${turn === 'w' ? 'border-gold-500 shadow-[0_0_15px_gold]' : 'border-slate-700'} overflow-hidden`}>
                   <img src={user.avatar} className="w-full h-full object-cover" />
               </div>
               <div>
                   <div className="text-sm font-bold text-white">You</div>
                   <div className="flex gap-1 text-purple-400 text-xs mb-1">{captured.b.map((p, i) => <span key={i}>{getPieceSymbol(p)}</span>)}</div>
               </div>
           </div>
           <TimerDisplay time={timeRemaining.w} isActive={turn === 'w'} />
       </div>

    </div>
  );
};
