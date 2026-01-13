import { io } from "socket.io-client";

const AUCTION_ID = process.argv[2];
if (!AUCTION_ID) {
  console.error("Usage: node scripts/socket-listen.mjs <AUCTION_ID>");
  process.exit(1);
}

const socket = io("http://localhost:6002", {
  path: "/socket.io",
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("✅ connected:", socket.id);
  socket.emit("auction:join", AUCTION_ID);
  console.log("👂 listening in room:", AUCTION_ID);
});

socket.on("auction:bid", (data) => {
  console.log("🔥 auction:bid", data);
});

socket.on("auction:updated", (data) => {
  console.log("📈 auction:updated", data);
});

socket.on("disconnect", () => console.log("❌ disconnected"));
