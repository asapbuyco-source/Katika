import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Clock, BookOpen, X, AlertTriangle, RefreshCw, Cpu, ExternalLink, ChevronLeft, ChevronRight, List, Undo2 } from 'lucide-react';
import { Table, User, AIRefereeLog } from '../types';
import { AIReferee } from './AIReferee';
import { playSFX } from '../services/sound';
import { useAppState } from '../services/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { GameChat } from './GameChat';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

interface ChessGameProps {
    table: Table;
    user: User;
    onGameEnd: (result: 'win' | 'loss' | 'quit' | 'draw') => void;
    socket?: Socket | null;
    socketGame?: any;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- Optimized Square Component ---
const ChessSquare = React.memo(({
    square,
    isDark,
    isSelected,
    isLastMove,
    isKingInCheck,
    piece,
    moveOption,
    onClick,
    onDragStart,
    onDrop,
    isDragging,
    rankLabel,
    fileLabel
}: any) => {

    // Map piece type to lichess cburnett SVG piece images
    const pieceTypeUpper: Record<string, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
    const pieceSrc = piece ? `https://lichess1.org/assets/piece/cburnett/${piece.color}${pieceTypeUpper[piece.type]}.svg` : null;

    const handleClick = () => {
        onClick(square);
    };

    const handleDragStart = (e: React.DragEvent) => {
        if (piece && onDragStart) {
            e.dataTransfer.setData('text/plain', square);
            onDragStart(square, piece);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (onDrop) {
            onDrop(square);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    return (
        <div
            onClick={handleClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
            draggable={!!piece}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
            tabIndex={0}
            role="button"
            aria-label={piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${piece.type} on ${square}` : `Empty square ${square}`}
            className={`
                relative flex items-center justify-center w-full h-full
                ${isSelected ? 'ring-inset ring-4 ring-[#829769]' : ''}
                ${isKingInCheck ? 'animate-pulse' : ''}
                ${isDragging ? 'opacity-50' : ''}
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#829769] focus-visible:ring-offset-2 focus-visible:ring-offset-[#302e2b]
                cursor-pointer
            `}
            style={{
                backgroundColor: isKingInCheck
                    ? '#e74c3c'
                    : isLastMove
                        ? (isDark ? '#aaa23a' : '#f6f669')
                        : isSelected
                            ? (isDark ? '#829769' : '#f4f78b')
                            : (isDark ? '#779952' : '#ebecd0'),
            }}
        >
            {/* Move Hint / Option */}
            {moveOption && (
                <div
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{ background: moveOption.background }}
                />
            )}

            {/* Piece Render — SVG image from lichess cburnett set */}
            {piece && pieceSrc && (
                <motion.div
                    layoutId={`piece-${square}`}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="w-[88%] h-[88%] relative z-20 flex items-center justify-center"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <img
                        src={pieceSrc}
                        alt={`${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}`}
                        className="w-full h-full object-contain select-none"
                        draggable={false}
                    />
                </motion.div>
            )}

            {/* Labels */}
            {rankLabel && (
                <span className="absolute top-0.5 left-0.5 text-[8px] text-slate-500 font-mono select-none">{rankLabel}</span>
            )}
            {fileLabel && (
                <span className="absolute bottom-0.5 right-0.5 text-[8px] text-slate-500 font-mono select-none">{fileLabel}</span>
            )}
        </div>
    );
}, (prev, next) => {
    // Custom Comparison for Performance
    if (prev.square !== next.square) return false;
    if (prev.isDark !== next.isDark) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isLastMove !== next.isLastMove) return false;
    if (prev.isKingInCheck !== next.isKingInCheck) return false;
    if (prev.isDragging !== next.isDragging) return false;

    // Deep check piece
    const p1 = prev.piece;
    const p2 = next.piece;
    if (p1 !== p2) {
        if (!p1 || !p2) return false;
        if (p1.type !== p2.type || p1.color !== p2.color) return false;
    }

    // Check move option style
    const m1 = prev.moveOption;
    const m2 = next.moveOption;
    if (m1 !== m2) {
        if (!m1 || !m2) return false;
        if (m1.background !== m2.background) return false;
    }

    return true;
});

const getBestMove = (game: Chess, difficulty: string): { from: string, to: string, promotion?: string } | null => {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    // Medium: Greedy (Best immediate capture)
    if (difficulty === 'medium') {
        // Sort moves by capture value
        moves.sort((a, b) => {
            const valA = a.captured ? (PIECE_VALUES[a.captured] || 0) : 0;
            const valB = b.captured ? (PIECE_VALUES[b.captured] || 0) : 0;
            return valB - valA; // Descending
        });
        // Add some randomness if no captures to avoid repetitive play
        const bestValue = moves[0].captured ? (PIECE_VALUES[moves[0].captured] || 0) : 0;
        const candidates = moves.filter(m => (m.captured ? PIECE_VALUES[m.captured] : 0) === bestValue);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Hard: Depth 2 (Minimize opponent's max response)
    if (difficulty === 'hard') {
        let bestScore = -Infinity;
        let bestMoves: any[] = [];

        // Simplified evaluation: Material Balance.
        // We want to Maximize (My Material - Opponent Material).

        for (const move of moves) {
            game.move(move);

            // Opponent's turn now. Find their best response (Minimizing our gain)
            const oppMoves = game.moves({ verbose: true });
            let maxOppResponse = -Infinity;

            // Heuristic: Opponent will capture best piece available
            for (const oppMove of oppMoves) {
                const val = oppMove.captured ? (PIECE_VALUES[oppMove.captured] || 0) : 0;
                if (val > maxOppResponse) maxOppResponse = val;
            }
            // If no captures, response is 0 loss.
            if (oppMoves.length === 0 || maxOppResponse === -Infinity) maxOppResponse = 0;

            const myGain = move.captured ? (PIECE_VALUES[move.captured] || 0) : 0;
            const netScore = myGain - maxOppResponse; // Simple material trade calc

            game.undo();

            if (netScore > bestScore) {
                bestScore = netScore;
                bestMoves = [move];
            } else if (netScore === bestScore) {
                bestMoves.push(move);
            }
        }
        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    return moves[Math.floor(Math.random() * moves.length)];
};

export const ChessGame: React.FC<ChessGameProps> = ({ table, user, onGameEnd, socket, socketGame }) => {
    const { state } = useAppState();
    useEffect(() => { window.scrollTo(0, 0); }, []);
    const [game, setGame] = useState(new Chess());
    const [viewIndex, setViewIndex] = useState<number>(-1);
    // BUG 5a FIX: initialize to null until server confirms our color.
    // Prevents the wrong player's clock from ticking before color is known.
    const [myColor, setMyColor] = useState<'w' | 'b' | null>(null);
    const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
    const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
    const [showForfeitModal, setShowForfeitModal] = useState(false);
    const [showRulesModal, setShowRulesModal] = useState(false);
    const [refereeLog, setRefereeLog] = useState<AIRefereeLog | null>(null);

    const [isGameOver, setIsGameOver] = useState(false);
    const [pendingPromotion, setPendingPromotion] = useState<{ from: Square, to: Square } | null>(null);
    const [showMovesPanel, setShowMovesPanel] = useState(false);
    const [draggedSquare, setDraggedSquare] = useState<Square | null>(null);
    // BUG 4 FIX: Track whether all 12 piece SVGs have been preloaded from CDN.
    const [boardReady, setBoardReady] = useState(false);

    const isP2P = !!socket && !!socketGame;
    // BUG 5a FIX: For bot games, we are always White. Resolve immediately so the
    // board doesn't need to wait for a socketGame event.
    const isBotGame = !isP2P && (table.guest?.id === 'bot' || !table.guest);

    // BUG 4 FIX: Preload all 12 piece SVGs before showing the board.
    // Once all images have loaded (or after 2s timeout), set boardReady = true.
    useEffect(() => {
        if (isBotGame && myColor === null) setMyColor('w');

        const pieces = ['P', 'N', 'B', 'R', 'Q', 'K'];
        const colors = ['w', 'b'];
        const srcs = colors.flatMap(c => pieces.map(p =>
            `https://lichess1.org/assets/piece/cburnett/${c}${p}.svg`
        ));
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            setBoardReady(true);
        };
        // Timeout fallback: don't block the board forever on slow connections
        const timeout = setTimeout(settle, 2500);
        let loaded = 0;
        srcs.forEach(src => {
            const img = new Image();
            img.onload = img.onerror = () => {
                loaded++;
                if (loaded === srcs.length) settle();
            };
            img.src = src;
        });
        return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // BUG 3 FIX: Read time control from table (tournament can specify custom limits)
    // Fallback: 10 min base, +3s increment (standard rapid)
    const baseTime: number = (table as any).timeControl?.base ?? 600;
    const TIMER_INCREMENT: number = (table as any).timeControl?.increment ?? 3;

    // Initialise timer from table's time control (handles tournament custom time limits)
    const [timeRemaining, setTimeRemaining] = useState({ w: baseTime, b: baseTime });

    // Re-init timer if table.timeControl changes (e.g. navigating between games)
    useEffect(() => {
        setTimeRemaining({ w: baseTime, b: baseTime });
    }, [baseTime]);
    const moveHistory = game.history();
    const displayGame = useMemo(() => {
        if (viewIndex === moveHistory.length - 1 || viewIndex === -1) return game;
        const tempGame = new Chess();
        for (let i = 0; i <= viewIndex; i++) {
            tempGame.move(moveHistory[i]);
        }
        return tempGame;
    }, [game, viewIndex, moveHistory.length]); // Optimized dep array

    const board = displayGame.board();

    // State Ref to allow stable callbacks
    const stateRef = useRef({
        game,
        viewIndex,
        myColor,
        selectedSquare,
        optionSquares,
        isGameOver,
        socket,
        socketGame,
        timeRemaining,
        isP2P,
        opponentDisconnected: state.opponentDisconnected
    });

    useEffect(() => {
        stateRef.current = {
            game,
            viewIndex,
            myColor,
            selectedSquare,
            optionSquares,
            isGameOver,
            socket,
            socketGame,
            timeRemaining,
            isP2P,
            opponentDisconnected: state.opponentDisconnected
        };
    }, [game, viewIndex, myColor, selectedSquare, optionSquares, isGameOver, socket, socketGame, timeRemaining, isP2P, state.opponentDisconnected]);

    // Undo last move - for practice/bot games only
    const undoLastMove = useCallback(() => {
        if (isP2P || isGameOver || game.history().length === 0) return;
        
        const history = game.history({ verbose: true });
        const lastMove = history[history.length - 1];
        
        if (lastMove) {
            game.undo();
            const newGame = new Chess();
            newGame.loadPgn(game.pgn());
            setGame(newGame);
            setViewIndex(newGame.history().length - 1);
            setSelectedSquare(null);
            setOptionSquares({});
            playSFX('click');
        }
    }, [game, isP2P, isGameOver]);

    // Socket State Sync
    useEffect(() => {
        if (isP2P && socketGame) {
            if (socketGame.players && socketGame.players[0]) {
                const isPlayer1 = socketGame.players[0] === user.id;
                setMyColor(isPlayer1 ? 'w' : 'b');
            }

            const newGame = new Chess();
            if (socketGame.gameState && socketGame.gameState.pgn) {
                try { newGame.loadPgn(socketGame.gameState.pgn); } catch (e) { }
            }

            const wasLatest = viewIndex === game.history().length - 1;
            setGame(newGame);
            if (wasLatest || viewIndex === -1) setViewIndex(newGame.history().length - 1);
            checkGameOver(newGame);

            // BUG 5b/5c FIX: Map timer values by USER ID (not player index / color).
            // The server stores timers as { [userId]: seconds }, so we read them
            // directly by user ID to avoid the color-inversion when players[0]
            // is not guaranteed to be White.
            if (socketGame.gameState && socketGame.gameState.timers && socketGame.players) {
                const myId = user.id;
                const oppId = socketGame.players.find((id: string) => id !== user.id) || '';
                const derivedMyColor = socketGame.players[0] === user.id ? 'w' : 'b';
                const derivedOppColor = derivedMyColor === 'w' ? 'b' : 'w';
                setTimeRemaining({
                    [derivedMyColor]: socketGame.gameState.timers[myId] ?? baseTime,
                    [derivedOppColor]: socketGame.gameState.timers[oppId] ?? baseTime,
                } as { w: number; b: number });
            }

            // Bug B fix: condition was inverted — in P2P games (!isP2P === false)
            // so the winner was NEVER declared through this path. Fixed to `isP2P`.
            if (socketGame.winner) {
                setIsGameOver(true);
                // BUG 2 FIX: was `!isP2P` which meant this block NEVER ran for P2P games.
                // Changed to `isP2P` so P2P winner is correctly resolved.
                if (isP2P) {
                    if (socketGame.winner === user.id) onGameEnd('win');
                    else if (socketGame.winner === null) onGameEnd('draw');
                    else onGameEnd('loss');
                }
            }
        }
    }, [socketGame, user.id, isP2P]);

    // --- SOCKET GAME_OVER LISTENER ---
    useEffect(() => {
        if (!isP2P || !socket) return;
        
        const handleGameOver = (data: any) => {
            setIsGameOver(true);
            // SocketContext handles global SET_GAME_RESULT for P2P
        };

        socket.on('game_over', handleGameOver);
        return () => {
            socket.off('game_over', handleGameOver);
        };
    }, [isP2P, socket, user.id, onGameEnd]);

    useEffect(() => {
        // BUG 5a FIX: Don't run the timer until myColor is resolved.
        if (isGameOver || viewIndex !== -1 || myColor === null) return;
        
        const interval = setInterval(() => {
            if (stateRef.current.opponentDisconnected) return;
            setTimeRemaining(prev => {
                const liveGame = stateRef.current.game;
                const turnColor = liveGame.turn();
                const liveMyColor = stateRef.current.myColor;
                if (liveMyColor === null) return prev;
                
                if (turnColor === liveMyColor) {
                    if (prev[liveMyColor] <= 1) {
                        clearInterval(interval);
                        const { isP2P: liveP2P, socket: liveSock, socketGame: liveSG } = stateRef.current;
                        if (liveP2P && liveSock) liveSock.emit('game_action', { roomId: liveSG.roomId, action: { type: 'FORFEIT' } });
                        if (!liveP2P) onGameEnd('loss');
                        return { ...prev, [liveMyColor]: 0 };
                    }
                    return { ...prev, [liveMyColor]: Math.max(0, prev[liveMyColor] - 1) };
                } else {
                    const oppColor = turnColor as 'w' | 'b';
                    if (prev[oppColor] <= 1) {
                        clearInterval(interval);
                        const { isP2P: liveP2P, socket: liveSock, socketGame: liveSG } = stateRef.current;
                        if (liveP2P && liveSock) liveSock.emit('game_action', { roomId: liveSG.roomId, action: { type: 'TIMEOUT_CLAIM' } });
                        if (!liveP2P) onGameEnd('win');
                        return { ...prev, [oppColor]: 0 };
                    }
                    return { ...prev, [oppColor]: Math.max(0, prev[oppColor] - 1) };
                }
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isGameOver, viewIndex, myColor]); // added myColor dep — timer must not start until color is resolved

    const checkGameOver = useCallback((currentGamState: Chess) => {
        // Bug A fix: read from stateRef so this callback never captures a stale
        // myColor / isP2P value (it is called from inside executeMove which has
        // an empty dependency array).
        const { myColor: currentColor, isP2P: currentIsP2P } = stateRef.current;
        if (currentGamState.isGameOver()) {
            setIsGameOver(true);
            if (currentGamState.isCheckmate()) {
                const winnerColor = currentGamState.turn() === 'w' ? 'b' : 'w';
                const isWinner = winnerColor === currentColor;
                playSFX(isWinner ? 'win' : 'loss');
                if (!currentIsP2P) onGameEnd(isWinner ? 'win' : 'loss');
            } else {
                // BUG 1 FIX: draw conditions (stalemate, insufficient material, etc.)
                // must use 'draw', NOT 'quit' which triggers a forfeit/loss in GameRoom
                if (!currentIsP2P) onGameEnd('draw');
            }
        }
    }, [onGameEnd]);

    // Stable Move Execution
    const executeMove = useCallback(async (from: Square, to: Square, promotion?: string) => {
        const { game: currentGame, isP2P, socket, socketGame, timeRemaining } = stateRef.current;

        try {
            // Bug 4 fix: clone the game before mutating so the shared stateRef is
            // never left in a partially-moved state if the move attempt throws.
            const game = new Chess();
            game.loadPgn(currentGame.pgn());
            const moveAttempt = { from, to, promotion: promotion || 'q' };
            const move = game.move(moveAttempt);

            if (move) {
                const newGame = new Chess();
                newGame.loadPgn(game.pgn());

                setGame(newGame);
                setViewIndex(newGame.history().length - 1);
                setSelectedSquare(null);
                setOptionSquares({});

                if (move.captured) playSFX('capture'); else playSFX('move');
                checkGameOver(newGame);

                // Add time increment after each move (chess.com style)
                setTimeRemaining(prev => {
                    const moverColor = move.color;
                    const newTime = { ...prev };
                    newTime[moverColor] = Math.min(prev[moverColor] + TIMER_INCREMENT, 1800); // cap at 30 mins
                    return newTime;
                });

                if (isP2P && socket && socketGame) {
                    const moverColor = move.color;
                    const incrementedTime = Math.min(timeRemaining[moverColor] + TIMER_INCREMENT, 1800);
                    const nextUserId = socketGame.players[newGame.turn() === 'w' ? 0 : 1];
                    const updatedTimers = {
                        [socketGame.players[0]]: moverColor === 'w' ? incrementedTime : timeRemaining.w,
                        [socketGame.players[1]]: moverColor === 'b' ? incrementedTime : timeRemaining.b
                    };
                    socket.emit('game_action', {
                        roomId: socketGame.roomId,
                        action: {
                            type: 'MOVE',
                            newState: {
                                fen: newGame.fen(),
                                pgn: newGame.pgn(),
                                turn: nextUserId,
                                timers: updatedTimers
                            }
                        }
                    });
                }
            }
        } catch (e) {
            setSelectedSquare(null);
            setOptionSquares({});
        }
    }, []);

    // Local Bot AI Logic
    useEffect(() => {
        // BUG 5a FIX: don't trigger bot until myColor is resolved
        if (isBotGame && !isGameOver && myColor !== null && game.turn() !== myColor) {
            const timer = setTimeout(() => {
                const difficulty = socketGame?.gameState?.difficulty || 'medium';
                const move = getBestMove(game, difficulty);

                if (move) {
                    executeMove(move.from as Square, move.to as Square, move.promotion);
                }
            }, 1000); // 1 second think time
            return () => clearTimeout(timer);
        }
    }, [game, isBotGame, isGameOver, myColor, executeMove, socketGame]);

    const onSquareClick = useCallback((square: Square) => {
        const {
            game, viewIndex, myColor, selectedSquare, optionSquares,
            isGameOver
        } = stateRef.current;

        const moveHistory = game.history();
        const isViewingLatest = viewIndex === moveHistory.length - 1 || viewIndex === -1;

        if (isGameOver) return;
        if (!isViewingLatest) { setViewIndex(moveHistory.length - 1); return; }

        if (selectedSquare === square) { setSelectedSquare(null); setOptionSquares({}); return; }

        // Execute Move if option clicked
        if (selectedSquare && optionSquares[square]) {
            const piece = game.get(selectedSquare);
            if (piece && piece.type === 'p') {
                const isLastRank = (piece.color === 'w' && square[1] === '8') || (piece.color === 'b' && square[1] === '1');
                if (isLastRank) {
                    setPendingPromotion({ from: selectedSquare, to: square });
                    return;
                }
            }
            executeMove(selectedSquare, square);
            return;
        }

        // Select Piece
        const clickedPiece = game.get(square);
        if (clickedPiece) {
            if (clickedPiece.color !== myColor) return;
            if (game.turn() !== myColor) return;

            setSelectedSquare(square);

            // Calculate Options Inline to avoid state thrashing
            const moves = game.moves({ square, verbose: true });
            const newSquares: any = {};
            if (moves.length > 0) {
                moves.forEach((move: any) => {
                    newSquares[move.to] = {
                        background: 'rgba(0, 0, 0, 0.15)',
                    };
                });
                newSquares[square] = { background: 'rgba(130, 151, 105, 0.5)' };
            }
            setOptionSquares(newSquares);
            playSFX('click');
        } else {
            setSelectedSquare(null);
            setOptionSquares({});
        }
    }, [executeMove]); // Stable handler

    const onDragStart = useCallback((square: Square, piece: any) => {
        const { game, viewIndex, myColor, isGameOver } = stateRef.current;
        if (isGameOver) return;
        
        const moveHistory = game.history();
        const isViewingLatest = viewIndex === moveHistory.length - 1 || viewIndex === -1;
        if (!isViewingLatest) return;
        
        if (piece && piece.color === myColor && game.turn() === myColor) {
            setDraggedSquare(square);
            const moves = game.moves({ square, verbose: true });
            const newSquares: any = {};
            if (moves.length > 0) {
                moves.forEach((move: any) => {
                    newSquares[move.to] = {
                        background: 'rgba(0, 0, 0, 0.15)',
                    };
                });
                newSquares[square] = { background: 'rgba(130, 151, 105, 0.5)' };
            }
            setOptionSquares(newSquares);
            setSelectedSquare(square);
        }
    }, []);

    const onDrop = useCallback((targetSquare: Square) => {
        setDraggedSquare(null);
        if (draggedSquare) {
            onSquareClick(draggedSquare);
            if (optionSquares[targetSquare]) {
                const piece = stateRef.current.game.get(draggedSquare);
                if (piece && piece.type === 'p') {
                    const isLastRank = (piece.color === 'w' && targetSquare[1] === '8') || (piece.color === 'b' && targetSquare[1] === '1');
                    if (isLastRank) {
                        setPendingPromotion({ from: draggedSquare, to: targetSquare });
                        return;
                    }
                }
                executeMove(draggedSquare, targetSquare);
            }
        }
        setDraggedSquare(null);
        setSelectedSquare(null);
        setOptionSquares({});
    }, [draggedSquare, onSquareClick, optionSquares, executeMove]);

    const handleQuit = () => {
        if (isP2P && socket) {
            socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
        }
        onGameEnd('quit');
    };

    const opponentColor = myColor === 'w' ? 'b' : myColor === 'b' ? 'w' : 'b';
    const opponent = !isP2P ? { name: "Vantage AI", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=chess" }
        : (socketGame?.profiles ? socketGame.profiles[socketGame.players.find((id: string) => id !== user.id)] : { name: "Opponent", avatar: "https://i.pravatar.cc/150?u=opp" });

    // BUG 4 FIX: Show a skeleton board while piece SVGs are loading.
    // This prevents the blank/empty board flash on first render.
    if (!boardReady || myColor === null) {
        return (
            <div className="h-[100dvh] overflow-y-auto bg-royal-950 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-[600px] aspect-square bg-[#302e2b] rounded-xl shadow-2xl p-1 md:p-2 border-4 border-[#302e2b] relative overflow-hidden">
                    {/* Skeleton board — proper chess colours, no pieces */}
                    <div className="w-full h-full grid grid-cols-8 grid-rows-8">
                        {Array.from({ length: 64 }).map((_, i) => {
                            const row = Math.floor(i / 8);
                            const col = i % 8;
                            const isDark = (row + col) % 2 === 1;
                            return (
                                <div
                                    key={i}
                                    className="w-full h-full"
                                    style={{ backgroundColor: isDark ? '#779952' : '#ebecd0' }}
                                />
                            );
                        })}
                    </div>
                    {/* Overlay spinner */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-xl gap-3">
                        <RefreshCw size={32} className="text-gold-400 animate-spin" />
                        <span className="text-white font-bold text-sm uppercase tracking-widest">Loading Board...</span>
                    </div>
                </div>
            </div>
        );
    }

    // Get SVG src for promotion modal piece
    const getPieceSrc = (type: string, color: 'w' | 'b') => {
        const upper: Record<string, string> = { p: 'P', r: 'R', n: 'N', b: 'B', q: 'Q', k: 'K' };
        return `https://lichess1.org/assets/piece/cburnett/${color}${upper[type]}.svg`;
    };

    return (
        <div className="h-[100dvh] overflow-y-auto bg-royal-950 flex flex-col items-center p-4">
            {/* Promotion Modal */}
            <AnimatePresence>
                {pendingPromotion && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-royal-900 border-2 border-gold-500 rounded-2xl p-6 shadow-2xl relative"
                        >
                            <h3 className="text-white font-bold text-center mb-4 uppercase tracking-widest">Promote Pawn</h3>
                            <div className="flex gap-4">
                                {['q', 'r', 'b', 'n'].map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => { executeMove(pendingPromotion.from, pendingPromotion.to, type); setPendingPromotion(null); }}
                                        className="w-16 h-16 bg-white/10 hover:bg-gold-500/20 border border-white/20 hover:border-gold-500 rounded-xl flex items-center justify-center p-2 transition-all"
                                    >
                                        <img
                                            src={getPieceSrc(type, myColor)}
                                            alt={type}
                                            className="w-full h-full object-contain"
                                            draggable={false}
                                        />
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Rules Modal - Added missing component */}
            <AnimatePresence>
                {showRulesModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowRulesModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="relative bg-royal-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
                        >
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <BookOpen size={20} className="text-gold-400" /> Chess Rules
                                </h2>
                                <button onClick={() => setShowRulesModal(false)} className="text-slate-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="overflow-y-auto space-y-4 text-sm text-slate-300 pr-2 custom-scrollbar">
                                <section>
                                    <h3 className="text-white font-bold mb-1">Objective</h3>
                                    <p>Checkmate the opponent's King. The game ends when the King is under attack and cannot escape.</p>
                                </section>
                                <section>
                                    <h3 className="text-white font-bold mb-1">Standard Movement</h3>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><strong>King:</strong> One square in any direction.</li>
                                        <li><strong>Queen:</strong> Any number of squares in any direction.</li>
                                        <li><strong>Rook:</strong> Horizontally or vertically.</li>
                                        <li><strong>Bishop:</strong> Diagonally.</li>
                                        <li><strong>Knight:</strong> L-shape (2 squares one way, 1 square perpendicular). Jumps over pieces.</li>
                                        <li><strong>Pawn:</strong> Moves forward 1 (or 2 on first move). Captures diagonally.</li>
                                    </ul>
                                </section>
                                <section>
                                    <h3 className="text-white font-bold mb-1">Special Moves</h3>
                                    <p><strong className="text-gold-400">Promotion:</strong> When a pawn reaches the opposite end, it must be exchanged for a Queen, Rook, Bishop, or Knight.</p>
                                    <p><strong className="text-gold-400">Castling:</strong> Moving the King two squares towards a Rook, and the Rook jumping over the King. Allowed if neither piece has moved and the path is clear/safe.</p>
                                    <p><strong className="text-gold-400">En Passant:</strong> Capturing a pawn that has just moved two squares as if it had only moved one.</p>
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
                    <button onClick={() => setShowMovesPanel(true)} className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white">
                        <List size={18} />
                    </button>
                    <button 
                        onClick={undoLastMove} 
                        disabled={game.history().length === 0 || isP2P || isGameOver}
                        className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-gold-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Undo last move"
                    >
                        <Undo2 size={18} />
                    </button>
                </div>
                <div className="flex flex-col items-center">
                    <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>
                    <div className="text-xl font-display font-bold text-white">{Math.max(0, table.stake) > 0 ? (table.stake * 2).toLocaleString() + ' FCFA' : 'Practice'}</div>
                </div>
                <div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>
            </div>

            {/* Turn Indicator */}
            <div className="mb-2 flex flex-col items-center justify-center">
                <motion.div
                    key={game.turn()}
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className={`px-6 py-2 rounded-full font-bold text-sm uppercase tracking-widest shadow-lg border transition-colors duration-300 ${game.turn() === myColor
                        ? 'bg-gold-500 text-royal-950 border-gold-400'
                        : 'bg-royal-800 text-slate-400 border-white/10'
                        }`}
                >
                    {game.turn() === myColor ? "Your Turn" : "Opponent's Turn"}
                </motion.div>
            </div>

            {/* OPPONENT BAR */}
            <div className="w-full max-w-[600px] flex justify-between items-end mb-2 px-2">
                <div className="flex items-center gap-3">
                    <img src={opponent.avatar} className="w-10 h-10 rounded-full border border-white/20" alt="Opponent" />
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{opponent.name}</span>
                        <span className="text-[10px] font-bold flex items-center gap-1 text-slate-300">
                            <img
                                src={`https://lichess1.org/assets/piece/cburnett/${opponentColor}P.svg`}
                                alt={opponentColor === 'w' ? 'White' : 'Black'}
                                className="w-4 h-4 object-contain"
                            />
                            {opponentColor === 'w' ? 'White' : 'Black'}
                        </span>
                    </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${game.turn() === opponentColor ? 'bg-red-500/20 border-red-500 text-white animate-pulse' : 'bg-black/30 border-white/10 text-slate-400'}`}>
                    <Clock size={16} />
                    <span className="font-mono font-bold text-lg">{formatTime(timeRemaining[opponentColor])}</span>
                </div>
            </div>

            {/* Board */}
            <div className={`relative w-full max-w-[600px] aspect-square bg-[#302e2b] rounded-xl shadow-2xl p-1 md:p-2 border-4 border-[#302e2b] transition-colors duration-300`}>
                {/* Board Grid */}
                <div className={`w-full h-full grid grid-cols-8 grid-rows-8 border border-white/10`}>
                    {board.map((row: any[], rowIndex: number) =>
                        row.map((piece: any, colIndex: number) => {
                            const actualRow = myColor === 'w' ? rowIndex : 7 - rowIndex;
                            const actualCol = myColor === 'w' ? colIndex : 7 - colIndex;
                            const visualPiece = board[actualRow]?.[actualCol];

                            const file = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][actualCol];
                            const rank = 8 - actualRow;
                            const square = `${file}${rank}` as Square;

                            const isDark = (actualRow + actualCol) % 2 === 1;
                            const option = optionSquares[square];
                            const isKingInCheck = visualPiece?.type === 'k' && visualPiece.color === displayGame.turn() && displayGame.inCheck();

                            let isLastMove = false;
                            if ((viewIndex === -1 && moveHistory.length > 0) || (viewIndex >= 0 && moveHistory?.[viewIndex])) {
                                const hist = displayGame.history({ verbose: true });
                                const idx = viewIndex === -1 ? hist.length - 1 : viewIndex;
                                const lastMoveDetails = hist?.[idx];
                                if (lastMoveDetails && (lastMoveDetails.to === square || lastMoveDetails.from === square)) {
                                    isLastMove = true;
                                }
                            }

                            return (
                                <ChessSquare
                                    key={square}
                                    square={square}
                                    isDark={isDark}
                                    isSelected={selectedSquare === square}
                                    isLastMove={isLastMove}
                                    isKingInCheck={isKingInCheck}
                                    piece={visualPiece}
                                    moveOption={option}
                                    onClick={onSquareClick}
                                    onDragStart={onDragStart}
                                    onDrop={onDrop}
                                    isDragging={draggedSquare === square}
                                    rankLabel={(actualCol === 0 && myColor === 'w') || (actualCol === 7 && myColor === 'b') ? rank : null}
                                    fileLabel={(actualRow === 7 && myColor === 'w') || (actualRow === 0 && myColor === 'b') ? file : null}
                                />
                            );
                        })
                    )}
                </div>
            </div>

            {/* PLAYER BAR (ME) */}
            <div className="w-full max-w-[600px] flex justify-between items-start mt-2 mb-4 px-2">
                <div className="flex items-center gap-3">
                    <img src={user.avatar} className="w-10 h-10 rounded-full border border-white/20" alt="Me" />
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">You</span>
                        <span className="text-[10px] font-bold flex items-center gap-1 text-slate-300">
                            <img
                                src={`https://lichess1.org/assets/piece/cburnett/${myColor}P.svg`}
                                alt={myColor === 'w' ? 'White' : 'Black'}
                                className="w-4 h-4 object-contain"
                            />
                            {myColor === 'w' ? 'White' : 'Black'}
                        </span>
                    </div>
                    {/* Captured pieces display */}
                    <div className="flex items-center gap-0.5 ml-2 h-6">
                        {(() => {
                            const verboseHistory = game.history({ verbose: true });
                            // m.color = who moved; m.captured = type of piece taken (always lowercase)
                            const opponentCaptures: string[] = []; // pieces I captured (opponent lost)
                            const myLosses: string[] = [];         // pieces opponent captured (I lost)
                            verboseHistory.forEach((m: any) => {
                                if (!m.captured) return;
                                if (m.color === myColor) opponentCaptures.push(m.captured);
                                else myLosses.push(m.captured);
                            });
                            const oppPieceColor = myColor === 'w' ? 'b' : 'w';
                            const upper: Record<string,string> = { p:'P',n:'N',b:'B',r:'R',q:'Q',k:'K' };
                            return (
                                <>
                                    {opponentCaptures.map((c, i) => (
                                        <img key={`cap-${i}`}
                                            src={`https://lichess1.org/assets/piece/cburnett/${oppPieceColor}${upper[c]}.svg`}
                                            className="w-4 h-4 object-contain opacity-80"
                                            alt={c} draggable={false}
                                        />
                                    ))}
                                    {myLosses.map((c, i) => (
                                        <img key={`lost-${i}`}
                                            src={`https://lichess1.org/assets/piece/cburnett/${myColor}${upper[c]}.svg`}
                                            className="w-4 h-4 object-contain opacity-40"
                                            alt={c} draggable={false}
                                        />
                                    ))}
                                </>
                            );
                        })()}
                    </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${game.turn() === myColor ? 'bg-gold-500/20 border-gold-500 text-white animate-pulse' : 'bg-black/30 border-white/10 text-slate-400'}`}>
                    <Clock size={16} />
                    <span className="font-mono font-bold text-lg">{formatTime(timeRemaining[myColor])}</span>
                </div>
            </div>

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

            {/* Moves History Panel */}
            <AnimatePresence>
                {showMovesPanel && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowMovesPanel(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 w-full max-w-md max-h-[80vh] shadow-2xl flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <List size={18} className="text-gold-400" /> Move History
                                </h2>
                                <button onClick={() => setShowMovesPanel(false)} className="text-slate-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex justify-center gap-4 mb-4">
                                <button onClick={() => setViewIndex(-1)} disabled={viewIndex === -1} className="p-2 bg-white/5 rounded-lg disabled:opacity-30">
                                    <ChevronRight size={18} className="rotate-180 text-white" />
                                </button>
                                <span className="text-sm text-slate-400">
                                    {game.turn() === 'w' ? `White to move (${game.history().length})` : `Black to move (${game.history().length})`}
                                </span>
                                <button onClick={() => setViewIndex(Math.max(0, game.history().length - 1))} disabled={viewIndex === game.history().length - 1 || viewIndex === -1} className="p-2 bg-white/5 rounded-lg disabled:opacity-30">
                                    <ChevronRight size={18} className="text-white" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {(() => {
                                    const verboseHistory = game.history({ verbose: true });
                                    const moves: JSX.Element[] = [];
                                    for (let i = 0; i < verboseHistory.length; i++) {
                                        const move = verboseHistory[i];
                                        const moveNum = Math.floor(i / 2) + 1;
                                        const isWhite = i % 2 === 0;
                                        if (isWhite) {
                                            moves.push(
                                                <div key={i} className="flex items-center gap-2 py-1">
                                                    <span className="text-xs text-slate-500 w-6">{moveNum}.</span>
                                                    <button 
                                                        onClick={() => setViewIndex(i)}
                                                        className={`flex-1 text-left px-2 py-1 rounded ${viewIndex === i ? 'bg-gold-500/30 text-gold-400' : 'text-white hover:bg-white/5'}`}
                                                    >
                                                        {move.san}
                                                    </button>
                                                </div>
                                            );
                                        } else {
                                            moves.push(
                                                <div key={i} className="flex items-center gap-2 py-1">
                                                    <span className="w-6" />
                                                    <button 
                                                        onClick={() => setViewIndex(i)}
                                                        className={`flex-1 text-left px-2 py-1 rounded ${viewIndex === i ? 'bg-gold-500/30 text-gold-400' : 'text-white hover:bg-white/5'}`}
                                                    >
                                                        {move.san}
                                                    </button>
                                                </div>
                                            );
                                        }
                                    }
                                    return moves.length > 0 ? moves : <div className="text-center text-slate-500 py-8">No moves yet</div>;
                                })()}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
