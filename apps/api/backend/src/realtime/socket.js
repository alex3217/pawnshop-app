import { Server } from "socket.io";
import { createCorsOptions, loadCorsPolicy } from "../config/cors.js";

let io;

export function initSocket(httpServer) {
  const cors = createCorsOptions(loadCorsPolicy(process.env));
  io = new Server(httpServer, {
    path: "/socket.io",
    cors,
  });

  io.on("connection", (socket) => {
    socket.on("auction:join", (auctionId) => {
      socket.join(`auction:${auctionId}`);
    });

    socket.on("auction:leave", (auctionId) => {
      socket.leave(`auction:${auctionId}`);
    });
  });

  return io;
}

export function getIo() {
  return io;
}
