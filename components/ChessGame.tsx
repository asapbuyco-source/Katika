import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Shield, Trophy, AlertTriangle, Crown, Brain, Clock } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';

interface ChessGameProps {
  table: Table;
  user: User;
  onGameEnd: (result: 'win' | 'loss' | 'quit') => void;
  socket?: Socket | null;
  socketGame?: any;
}

type Color = 'w' | 'b';
type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
interface Piece { type: PieceType; color: Color; moved: boolean }
type Board = (Piece | null)[][];
interface Position { r: number; c: number }
interface Move { from: Position; to: Position; }

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

const getInitialBoard = (): Board => {
    return INITIAL_BOARD_LAYOUT.map((row, r) => 
      row.map((type) => {
        if (!type) return null;
        return { type, color: r < 2 ? 'b' : 'w', moved: false };
      })
    );
};

// --- LOGIC HELPERS ---
const isValidPos = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const cloneBoard = (b: Board): Board => b.map(row => row.map(p => (p ? { ...p } : null)));

const getMovesForPiece = (b: Board, p: Piece, r: number, c: number): Move[] => {
    const moves: Move[] = [];
    const color = p.color;
    const opponent = color === 'w' ? 'b' : 'w';
    
    // Pawn
    if (p.type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        
        // Forward 1
        if (isValidPos(r + dir, c) && b[r + dir][c] === null) {
            moves.push({ from: { r, c }, to: { r: r + dir, c } });
            // Forward 2
            if (r === startRow && isValidPos(r + 2 * dir, c) && b[r + 2 * dir][c] === null) {
                moves.push({ from: { r, c }, to: { r: r + 2 * dir, c } });
            }
        }
        // Captures
        [[r + dir, c - 1], [r + dir, c + 1]].forEach(([tr, tc]) => {
            if (isValidPos(tr, tc)) {
                const target = b[tr][tc];
                if (target && target.color === opponent) {
                    moves.push({ from: { r, c }, to: { r: tr, c: tc } });
                }
            }
        });
    }
    
    // Knight
    else if (p.type === 'n') {
        const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        offsets.forEach(([dr, dc]) => {
            const tr = r + dr, tc = c + dc;
            if (isValidPos(tr, tc)) {
                const target = b[tr][tc];
                if (!target || target.color === opponent) {
                    moves.push({ from: { r, c }, to: { r: tr, c: tc } });
                }
            }
        });
    }
    
    // King
    else if (p.type === 'k') {
        const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        offsets.forEach(([dr, dc]) => {
            const tr = r + dr, tc = c + dc;
            if (isValidPos(tr, tc)) {
                const target = b[tr][tc];
                if (!target || target.color === opponent) {
                    moves.push({ from: { r, c }, to: { r: tr, c: tc } });
                }
            }
        });
    }
    
    // Sliding Pieces (Rook, Bishop, Queen)
    else {
        const directions = [];
        if (p.type === 'r' || p.type === 'q') directions.push([0, 1], [0, -1], [1, 0], [-1, 0]);
        if (p.type === 'b' || p.type === 'q') directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        
        directions.forEach(([dr, dc]) => {
            let tr = r + dr;
            let tc = c + dc;
            while (isValidPos(tr, tc)) {
                const target = b[tr][tc];
                if (target) {
                    if (target.color === opponent) {
                        moves.push({ from: { r, c }, to: { r: tr, c: tc } });
                    }
                    break; // Blocked
                }
                moves.push({ from: { r, c }, to: { r: tr, c: tc } });
                tr += dr;
                tc += dc;
            }
        });
    }
    
    return moves;
};

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [board, setBoard] = useState<Board>(getInitialBoard);
  const [turn, setTurn] = useState<Color>('w');
  const [myColor, setMyColor] = useState<Color>('w');
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [isBotGame, setIsBotGame] = useState(false);
  
  const isP2P = !!socket && !!socketGame;

  // --- INIT ---
  useEffect(() => {
      // Local Bot Game Setup
      if (!isP2P && table.guest?.id === 'bot') {
          setIsBotGame(true);
          setMyColor('w');
      }

      if (isP2P && socketGame) {
          // Determine color: Player 0 is White, Player 1 is Black
          const isPlayer1 = socketGame.players[0] === user.id;
          setMyColor(isPlayer1 ? 'w' : 'b');

          // Sync Board if valid
          if (socketGame.board && Array.isArray(socketGame.board)) {
              setBoard(socketGame.board);
          }
          
          // Sync Turn
          if (socketGame.turn) {
              const isWhiteTurn = socketGame.turn === socketGame.players[0];
              setTurn(isWhiteTurn ? 'w' : 'b');
          }

          // Handle Win/Loss
          if (socketGame.winner) {
              if (socketGame.winner === user.id) onGameEnd('win');
              else onGameEnd('loss');
          }
      }
  }, [socketGame, user.id, isP2P, table]);

  const executeMove = (m: Move) => {
      const nextBoard = cloneBoard(board);
      const movingPiece = nextBoard[m.from.r][m.from.c]!;
      const targetPiece = nextBoard[m.to.r][m.to.c];
      
      // Execute
      nextBoard[m.to.r][m.to.c] = movingPiece;
      nextBoard[m.from.r][m.from.c] = null;
      movingPiece.moved = true;

      // Promotion (Auto Queen for simplicity)
      if (movingPiece.type === 'p' && (m.to.r === 0 || m.to.r === 7)) {
          movingPiece.type = 'q';
      }

      setBoard(nextBoard);
      setLastMove(m);
      setValidMoves([]);
      setSelectedPos(null);
      
      // Sound
      if (targetPiece) playSFX('capture');
      else playSFX('move');

      // Win Check (King Capture - simplified)
      if (targetPiece && targetPiece.type === 'k') {
          playSFX('win');
          onGameEnd('win'); // Logic for P2P will handle sending win state
          return;
      }

      const nextTurn = turn === 'w' ? 'b' : 'w';
      
      // P2P Sync
      if (isP2P && socket) {
          const nextUserId = socketGame.players[nextTurn === 'w' ? 0 : 1];
          // Check if I won locally to send winner
          const winnerId = (targetPiece && targetPiece.type === 'k') ? user.id : null;

          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: {
                  type: 'MOVE',
                  newState: {
                      board: nextBoard,
                      turn: nextUserId,
                      winner: winnerId
                  }
              }
          });
      } else {
          setTurn(nextTurn);
          if (isBotGame && nextTurn !== myColor) {
              setTimeout(() => makeBotMove(nextBoard), 500);
          }
      }
  };

  const handleSquareClick = (r: number, c: number) => {
      // Allow move if it's my turn
      if (turn !== myColor) return;

      // Deselect if clicking same
      if (selectedPos?.r === r && selectedPos?.c === c) {
          setSelectedPos(null); 
          setValidMoves([]); 
          return;
      }

      // Check if clicking a valid move destination
      const move = validMoves.find(m => m.to.r === r && m.to.c === c);
      if (move) {
          executeMove(move);
          return;
      }

      // Select Piece
      const piece = board[r][c];
      if (piece && piece.color === myColor) {
          setSelectedPos({ r, c });
          const moves = getMovesForPiece(board, piece, r, c);
          setValidMoves(moves);
          playSFX('click');
      } else {
          setSelectedPos(null); 
          setValidMoves([]);
      }
  };

  // --- BOT ---
  const makeBotMove = (currentBoard: Board) => {
      const opponentColor = myColor === 'w' ? 'b' : 'w';
      const allMoves: Move[] = [];
      
      // Collect all moves
      currentBoard.forEach((row, r) => {
          row.forEach((p, c) => {
              if (p && p.color === opponentColor) {
                  allMoves.push(...getMovesForPiece(currentBoard, p, r, c));
              }
          });
      });

      if (allMoves.length > 0) {
          // Prioritize captures
          const captures = allMoves.filter(m => currentBoard[m.to.r][m.to.c] !== null);
          const move = captures.length > 0 ? captures[Math.floor(Math.random() * captures.length)] : allMoves[Math.floor(Math.random() * allMoves.length)];
          
          // Execute locally for bot
          const nextBoard = cloneBoard(currentBoard);
          const p = nextBoard[move.from.r][move.from.c]!;
          const target = nextBoard[move.to.r][move.to.c];
          nextBoard[move.to.r][move.to.c] = p;
          nextBoard[move.from.r][move.from.c] = null;
          
          setBoard(nextBoard);
          setLastMove(move);
          setTurn(myColor);
          
          if (target) playSFX('capture'); else playSFX('move');
          if (target?.type === 'k') onGameEnd('loss');
      }
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Header */}
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

       {/* Status Indicator */}
       <div className="mb-6 flex items-center gap-3">
           <div className={`px-4 py-1.5 rounded-full border text-sm font-bold flex items-center gap-2 ${
               turn === myColor ? 'bg-gold-500/10 border-gold-500 text-gold-400' : 'bg-white/5 border-white/10 text-slate-400'
           }`}>
               {turn === myColor ? <Brain size={14} className="animate-pulse" /> : <Clock size={14} />}
               {turn === myColor ? "Your Move" : "Opponent's Move"}
           </div>
       </div>

       {/* Board */}
       <div className="relative w-full max-w-[600px] aspect-square bg-[#1a103c] rounded-xl shadow-2xl p-1 md:p-2 border-4 border-royal-800 transition-transform duration-700">
            <div className={`w-full h-full grid grid-cols-8 grid-rows-8 border border-white/10 ${myColor === 'b' ? 'rotate-180' : ''}`}>
                {board.map((row, r) => row.map((piece, c) => {
                    const isSelected = selectedPos?.r === r && selectedPos?.c === c;
                    const isValidMove = validMoves.some(m => m.to.r === r && m.to.c === c);
                    const isLastFrom = lastMove?.from.r === r && lastMove?.from.c === c;
                    const isLastTo = lastMove?.to.r === r && lastMove?.to.c === c;
                    
                    return (
                        <div 
                            key={`${r}-${c}`}
                            onClick={() => handleSquareClick(r, c)}
                            className={`
                                relative flex items-center justify-center 
                                ${(r+c)%2===1 ? 'bg-royal-900/60' : 'bg-slate-300/10'}
                                ${isSelected ? 'ring-inset ring-4 ring-gold-500/50' : ''}
                                ${(isLastFrom || isLastTo) ? 'bg-purple-500/20' : ''}
                                ${isValidMove ? 'cursor-pointer' : ''}
                                ${myColor === 'b' ? 'rotate-180' : ''} // Counter-rotate pieces if board is flipped
                            `}
                        >
                            {/* Move Indicator */}
                            {isValidMove && (
                                <div className={`absolute w-3 h-3 rounded-full z-10 ${piece ? 'bg-red-500 ring-4 ring-red-500/30' : 'bg-green-500/50'}`} />
                            )}

                            {piece && (
                                <motion.span 
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className={`text-3xl md:text-5xl select-none relative z-20 ${piece.color === 'w' ? 'text-[#e2e8f0] drop-shadow-md' : 'text-[#a855f7] drop-shadow-md'}`}
                                    style={{ 
                                        textShadow: piece.color === 'w' ? '0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.8)' 
                                    }}
                                >
                                    {piece.type === 'p' ? '♟' : piece.type === 'r' ? '♜' : piece.type === 'n' ? '♞' : piece.type === 'b' ? '♝' : piece.type === 'q' ? '♛' : '♚'}
                                </motion.span>
                            )}
                        </div>
                    );
                }))}
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