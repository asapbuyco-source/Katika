import { io } from 'socket.io-client';
import { spawn } from 'child_process';
import assert from 'assert';

console.log("🚀 Starting End-to-End P2P WebSocket Integration Test...");

// 1. Boot up the server
const serverProcess = spawn('node', ['server.js'], { stdio: 'pipe' });
let serverReady = false;

serverProcess.stdout.on('data', (data) => {
    if (data.toString().includes('Vantage Game Server')) {
        serverReady = true;
    }
});

setTimeout(() => {
    if (!serverReady) {
        console.error("❌ Server failed to start within timeout.");
        serverProcess.kill();
        process.exit(1);
    }

    console.log("✅ Local server booted up. Connecting clients...");

    const clientA = io('http://localhost:8080');
    const clientB = io('http://localhost:8080');

    let roomId = null;

    clientA.on('connect', () => {
        console.log("🟢 Client A connected");
        // Simulate Matchmaking Entry for Client A
        clientA.emit('join_game', { userProfile: { id: 'test_user_A', name: 'Alice', balance: 5000 }, gameType: 'TicTacToe', stake: 500 });
    });

    clientB.on('connect', () => {
        console.log("🟢 Client B connected");
        // Wait a brief moment before B joins matchmaking
        setTimeout(() => {
            clientB.emit('join_game', { userProfile: { id: 'test_user_B', name: 'Bob', balance: 5000 }, gameType: 'TicTacToe', stake: 500 });
        }, 500);
    });

    // Both should receive match_found
    clientA.on('match_found', (data) => {
        console.log("⚔️ Client A matched into Room:", data.roomId);
        roomId = data.roomId;
        // Start playing
        console.log("🎮 Game Started! Client A plays move 0");
        clientA.emit('game_action', { roomId, action: { type: 'MOVE', index: 0 } });
    });

    clientB.on('match_found', (data) => {
        console.log("⚔️ Client B matched into Room:", data.roomId);
    });

    // Wait for the game to start
    let movesPlayed = 0;
    let bMovesPlayed = 0;
    clientB.on('game_update', (gameState) => {
        if (gameState.turn === 'test_user_B' && bMovesPlayed === 0) {
            bMovesPlayed++;
            console.log("   Client B plays move 3");
            clientB.emit('game_action', { roomId, action: { type: 'MOVE', index: 3 } });
        } else if (gameState.turn === 'test_user_B' && bMovesPlayed === 1) {
            bMovesPlayed++;
            console.log("   Client B plays move 4");
            clientB.emit('game_action', { roomId, action: { type: 'MOVE', index: 4 } });
        }
    });

    clientA.on('game_update', (gameState) => {
        // Simple scripted sequence: A=0, B=3, A=1, B=4, A=2 (A wins!)
        if (gameState.turn === 'test_user_A') {
            movesPlayed++;
            if (movesPlayed === 1) {
                console.log("   Client A plays move 1");
                clientA.emit('game_action', { roomId, action: { type: 'MOVE', index: 1 } });
            } else if (movesPlayed === 2) {
                console.log("   Client A plays move 2 (Winning Move!)");
                clientA.emit('game_action', { roomId, action: { type: 'MOVE', index: 2 } });
            }
        }
    });

    // Listen for game over
    let gameOverHandled = false;
    clientB.on('game_over', (data) => {
        console.log("🏆 Game Over received by Client B:");
        console.log(data);
        assert.strictEqual(data.winner, 'test_user_A', "Client A should be the winner");
        assert.strictEqual(data.reason, 'Line Complete', "Reason should be Line Complete");
        gameOverHandled = true;

        console.log("✅ P2P Integration Test Complete and Passed!");
        clientA.disconnect();
        clientB.disconnect();
        serverProcess.kill();
        process.exit(0);
    });

    setTimeout(() => {
        if (!gameOverHandled) {
            console.error("❌ Request timed out before Game Over.");
            clientA.disconnect();
            clientB.disconnect();
            serverProcess.kill();
            process.exit(1);
        }
    }, 5000);

}, 2000);
