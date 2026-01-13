import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app.js";
import { initSocket } from "./realtime/socket.js";

const PORT = Number(process.env.PORT || process.env.PAWN_PORT || 6002);

const app = createApp();
const server = createServer(app);

// enable sockets
initSocket(server);

server.listen(PORT, () => {
  console.log(`✅ API running: http://localhost:${PORT}`);
});
