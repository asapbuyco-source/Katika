import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Crown, Shield } from 'lucide-react';
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
type Piece = { type: PieceType; color: Color } | null;
type Board = Piece[][];
type Square = string; // e.g. "e4"

const INITIAL_BOARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Simple FEN parser for board visual
const parseFEN = (fen: string): Board => {
    const rows = fen.split(' ')[0].split('/');
    const board: Board = [];
    
    rows.forEach(row => {
        const boardRow: Piece[] = [];
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (/\d/.test(char)) {
                for (let j = 0; j < parseInt(char); j++) boardRow.push(null);
            } else {
                const color = char === char.toUpperCase() ? 'w' : 'b';
                boardRow.push({ type: char.toLowerCase() as PieceType, color });
            }
        }
        board.push(boardRow);
    });
    return board;
};

// Helper to get square name from coords (0,0 is a8, 7,7 is h1 in array logic usually, but let's standardise)
// Board array: row 0 = rank 8, row 7 = rank 1. col 0 = a, col 7 = h.
const getSquareName = (row: number, col: number): Square => {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    return `${files[col]}${ranks[row]}`;
};

const getCoords = (square: Square): {r: number, c: number} => {
    const col = square.charCodeAt(0) - 97; // a=97 -> 0
    const row = 8 - parseInt(square[1]);
    return { r: row, c: col };
};

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
  const [fen, setFen] = useState(INITIAL_BOARD_FEN);
  const [board, setBoard] = useState<Board>(parseFEN(INITIAL_BOARD_FEN));
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [turn, setTurn] = useState<Color>('w');
  const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  
  // P2P State
  const isP2P = !!socket && !!socketGame;
  const myColor: Color = isP2P && socketGame.players[1] === user.id ? 'b' : 'w'; // Host is White
  const isMyTurn = turn === myColor;

  useEffect(() => {
      setBoard(parseFEN(fen));
      const turnChar = fen.split(' ')[1] as Color;
      setTurn(turnChar);
  }, [fen]);

  // Sync P2P
  useEffect(() => {
      if (isP2P && socketGame) {
          if (socketGame.gameState && socketGame.gameState.fen) {
              setFen(socketGame.gameState.fen);
          }
          if (socketGame.winner) {
              onGameEnd(socketGame.winner === user.id ? 'win' : 'loss');
          }
      }
  }, [socketGame, user.id, isP2P]);

  const handleSquareClick = (square: Square) => {
      if (isP2P && !isMyTurn) return;

      const { r, c } = getCoords(square);
      const piece = board[r][c];

      // Select
      if (!selectedSquare) {
          if (piece && piece.color === turn) {
              setSelectedSquare(square);
              playSFX('click');
          }
      } 
      // Move or Deselect
      else {
          if (selectedSquare === square) {
              setSelectedSquare(null); // Deselect
          } else if (piece && piece.color === turn) {
              setSelectedSquare(square); // Switch selection
              playSFX('click');
          } else {
              // Attempt Move
              // NOTE: Full validation omitted for brevity in this fix, implementing basic move
              makeMove(selectedSquare, square);
          }
      }
  };

  const makeMove = (from: Square, to: Square) => {
      // Simplified move logic: Just update board array and FEN locally for visual
      // In a real app, use chess.js .move({ from, to }) to generate valid FEN
      
      // Update Board State manually for demonstration
      const newBoard = [...board.map(row => [...row])];
      const f = getCoords(from);
      const t = getCoords(to);
      
      const movingPiece = newBoard[f.r][f.c];
      if (!movingPiece) return;

      // Capture?
      if (newBoard[t.r][t.c]) playSFX('capture');
      else playSFX('move');

      newBoard[t.r][t.c] = movingPiece;
      newBoard[f.r][f.c] = null;

      // Convert back to FEN (Simplified approximation)
      // For proper chess, we'd need full FEN generation.
      // Here we assume the socket server or a library would handle it ideally.
      // Since we can't add libraries, we'll rely on local state update for now.
      setBoard(newBoard);
      setSelectedSquare(null);
      const nextTurn = turn === 'w' ? 'b' : 'w';
      setTurn(nextTurn);

      if (isP2P && socket) {
          // Send move to server (Server should ideally validate or broadcast)
          // We send the 'move' object and let the other client/server handle state
          // For this mock, we just broadcast the new simplified FEN or board
          socket.emit('game_action', {
              roomId: socketGame.roomId,
              action: {
                  type: 'MOVE',
                  newState: {
                      // We can pass a custom board object if FEN gen is hard manually
                      fen: generateSimpleFEN(newBoard, nextTurn), 
                      turn: socketGame.players.find((id: string) => id !== user.id) // Switch turn ID
                  }
              }
          });
      }
  };

  // Helper to generate simple FEN from board array
  const generateSimpleFEN = (b: Board, nextTurn: Color): string => {
      let fen = "";
      for (let r = 0; r < 8; r++) {
          let empty = 0;
          for (let c = 0; c < 8; c++) {
              const p = b[r][c];
              if (!p) {
                  empty++;
              } else {
                  if (empty > 0) { fen += empty; empty = 0; }
                  fen += p.color === 'w' ? p.type.toUpperCase() : p.type;
              }
          }
          if (empty > 0) fen += empty;
          if (r < 7) fen += "/";
      }
      fen += ` ${nextTurn} KQkq - 0 1`; // Dummy castling/enpassant rights
      return fen;
  };

  const getPieceComponent = (piece: Piece) => {
      if (!piece) return null;
      const isWhite = piece.color === 'w';
      const symbols: Record<string, string> = {
          p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' // Using filled black symbols for shape, coloring via CSS
      };
      
      return (
          <motion.div
              layoutId={`piece-${piece.type}-${piece.color}`}
              className={`text-4xl md:text-5xl select-none ${isWhite ? 'text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]' : 'text-black drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]'}`}
          >
              {symbols[piece.type]}
          </motion.div>
      );
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center p-4">
        {/* Header */}
        <div className="w-full max-w-lg flex justify-between items-center mb-6 mt-2">
            <button onClick={() => setShowForfeitModal(true)} className="flex items-center gap-2 text-slate-400 hover:text-white">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10"><ArrowLeft size={18} /></div>
            </button>
            <div className="flex flex-col items-center">
                 <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                 <div className="text-xl font-display font-bold text-white">{(table.stake * 2).toLocaleString()} FCFA</div>
            </div>
            <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
       </div>

       {/* Turn Indicator */}
       <div className="mb-6 flex items-center justify-center gap-4">
           <div className={`px-4 py-1.5 rounded-full border text-sm font-bold ${turn === 'w' ? 'bg-white text-black border-white' : 'bg-transparent text-slate-500 border-slate-700'}`}>White</div>
           <div className={`px-4 py-1.5 rounded-full border text-sm font-bold ${turn === 'b' ? 'bg-black text-white border-white' : 'bg-transparent text-slate-500 border-slate-700'}`}>Black</div>
       </div>

       {/* Board */}
       <div className="relative w-full max-w-[400px] aspect-square border-4 border-royal-800 rounded-lg shadow-2xl bg-[#393445]">
            <div className={`w-full h-full grid grid-cols-8 grid-rows-8`}>
                {board.map((row, rowIndex) => 
                    row.map((piece, colIndex) => {
                        // Rotate board if playing as Black
                        const actualRow = myColor === 'w' ? rowIndex : 7 - rowIndex;
                        const actualCol = myColor === 'w' ? colIndex : 7 - colIndex;
                        const visualPiece = board[actualRow][actualCol]; 
                        const square = getSquareName(actualRow, actualCol);
                        const isDark = (actualRow + actualCol) % 2 === 1;
                        const isSelected = selectedSquare === square;

                        return (
                            <div 
                                key={square}
                                onClick={() => handleSquareClick(square)}
                                className={`
                                    relative flex items-center justify-center 
                                    ${isDark ? 'bg-royal-900/60' : 'bg-slate-300/10'}
                                    ${isSelected ? 'ring-inset ring-4 ring-gold-500/50 bg-gold-500/20' : ''}
                                    cursor-pointer
                                `}
                            >
                                {visualPiece && getPieceComponent(visualPiece)}
                                
                                {/* Coords Overlay */}
                                {(actualCol === 0 && myColor === 'w') || (actualCol === 7 && myColor === 'b') ? (
                                    <span className="absolute top-0.5 left-0.5 text-[8px] text-slate-500 font-mono select-none">{8 - actualRow}</span>
                                ) : null}
                                {(actualRow === 7 && myColor === 'w') || (actualRow === 0 && myColor === 'b') ? (
                                    <span className="absolute bottom-0.5 right-0.5 text-[8px] text-slate-500 font-mono select-none">{String.fromCharCode(97 + actualCol)}</span>
                                ) : null}
                            </div>
                        );
                    })
                )}
            </div>
       </div>

       <div className="mt-8 text-center text-slate-400 text-sm">
           {isMyTurn ? "Select a piece to move" : "Waiting for opponent..."}
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
