import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:8080";

async function runTest() {
  console.log("Starting Pool P2P Simulation Test...");
  
  const p1 = io(SERVER_URL);
  const p2 = io(SERVER_URL);

  let p1Matched = false;
  let p2Matched = false;
  let roomId = null;

  const p1Profile = { id: "test_user_1", name: "Alice", avatar: "a1" };
  const p2Profile = { id: "test_user_2", name: "Bob", avatar: "a2" };

  p1.on("connect", () => {
    console.log("P1 Connected", p1.id);
    p1.emit("join_game", { stake: 500, userProfile: p1Profile, gameType: "Pool" });
  });

  p2.on("connect", () => {
    console.log("P2 Connected", p2.id);
    p2.emit("join_game", { stake: 500, userProfile: p2Profile, gameType: "Pool" });
  });

  p1.on("match_found", (data) => {
    console.log("P1 match_found", data.roomId);
    p1Matched = true;
    roomId = data.roomId;
    
    // Simulate a successful break shot from P1
    setTimeout(() => {
        console.log("P1 shooting break...");
        p1.emit("game_action", {
            roomId: data.roomId,
            action: {
                type: "MOVE",
                newState: {
                    balls: [
                        { id: 0, x: 500, y: 225, vx: 0, vy: 0, pocketed: false },
                        { id: 1, x: 800, y: 225, vx: 0, vy: 0, pocketed: true }, // Ball potted!
                        { id: 8, x: 700, y: 225, vx: 0, vy: 0, pocketed: false }
                    ],
                    turn: p1Profile.id, // Keeps turn because they legally potted
                    ballInHand: false,
                    myGroupP1: "solids",
                    message: "Good shot! Continue"
                }
            }
        });
    }, 1000);
  });

  p2.on("match_found", (data) => {
    console.log("P2 match_found", data.roomId);
    p2Matched = true;
  });

  p2.on("game_update", (data) => {
    if (data.gameState && data.gameState.balls) {
        console.log("P2 received game update from server!");
        console.log("P2 Balls count:", data.gameState.balls.length);
        const potted = data.gameState.balls.filter(b => b.pocketed);
        console.log("P2 Potted balls:", potted.map(b => b.id));
        console.log("P2 Current turn:", data.gameState.turn);
        
        if (potted.length === 1 && potted[0].id === 1) {
            console.log("✅ TEST PASSED: State successfully synced to opponent.");
            process.exit(0);
        } else {
            console.error("❌ TEST FAILED: State mismatch");
            process.exit(1);
        }
    }
  });

  setTimeout(() => {
    console.error("Test timeout");
    process.exit(1);
  }, 5000);
}

runTest();
