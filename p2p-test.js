import { io } from 'socket.io-client';
import { spawn } from 'child_process';
import path from 'path';

const PORT = 8080;
const SERVER_URL = `http://localhost:${PORT}`;

console.log("Starting Vantage Game Server for P2P test...");
const serverProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: PORT.toString(), FIREBASE_SERVICE_ACCOUNT: '' } // Disable Firebase for pure socket testing
});

let serverReady = false;

serverProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('running on port')) {
        serverReady = true;
        runTest();
    }
});

serverProcess.stderr.on('data', (data) => {
    // Ignore firebase warnings
});

const runTest = () => {
    console.log("Server is ready. Connecting Player A and Player B...");

    const pA = io(SERVER_URL, { transports: ['websocket'] });
    const pB = io(SERVER_URL, { transports: ['websocket'] });

    const timeout = setTimeout(() => {
        console.error("❌ Test timed out. P2P flow did not complete.");
        cleanup(1);
    }, 10000);

    let roomId = null;
    let turn = null;

    pA.on('connect', () => {
        console.log("Player A connected. Joining queue...");
        pA.emit('join_game', {
            gameType: 'TicTacToe',
            stake: 0,
            userProfile: { id: 'u1', name: 'Alice', elo: 1200 }
        });
    });

    pB.on('connect', () => {
        console.log("Player B connected. Joining queue...");
        pB.emit('join_game', {
            gameType: 'TicTacToe',
            stake: 0,
            userProfile: { id: 'u2', name: 'Bob', elo: 1200 }
        });
    });

    let playersMatched = 0;

    const handleMatchFound = (player, data) => {
        console.log(`${player} matched! Room: ${data.roomId}`);
        roomId = data.roomId;
        playersMatched++;
        
        if (playersMatched === 2) {
            console.log("Both players matched successfully. Making a move...");
            turn = data.turn;
            
            setTimeout(() => {
                if (turn === 'u1') {
                    console.log("Player A makes a move at index 0");
                    pA.emit('game_action', { roomId, action: { type: 'MOVE', index: 0, player: 'u1' } });
                } else {
                    console.log("Player B makes a move at index 0");
                    pB.emit('game_action', { roomId, action: { type: 'MOVE', index: 0, player: 'u2' } });
                }
            }, 500);
        }
    };

    pA.on('match_found', (data) => handleMatchFound('Player A', data));
    pB.on('match_found', (data) => handleMatchFound('Player B', data));

    let boardsReceived = 0;

    pA.on('game_update', (data) => {
        if (data.gameState && data.gameState.board[0]) {
            console.log("Player A received game update. Square 0 is occupied.");
            checkWin(data);
        }
    });

    pB.on('game_update', (data) => {
        if (data.gameState && data.gameState.board[0]) {
            console.log("Player B received game update. Sync complete.");
            boardsReceived++;
            if (boardsReceived === 2) {
                console.log("✅ P2P Test Passed: Queue, matching, and move synchronization all work perfectly.");
                clearTimeout(timeout);
                cleanup(0);
            }
        }
    });

    function checkWin(data) {
        boardsReceived++;
        if (boardsReceived === 2) {
            console.log("✅ P2P Test Passed: Queue, matching, and move synchronization all work perfectly.");
            clearTimeout(timeout);
            cleanup(0);
        }
    }

    function cleanup(code) {
        pA.disconnect();
        pB.disconnect();
        serverProcess.kill();
        process.exit(code);
    }
};

process.on('SIGINT', () => {
    serverProcess.kill();
    process.exit();
});
