import { Server } from "socket.io";
import { createCorsOriginHandler, parseAllowedOrigins } from "../cors.js";

let io;

export function createSocketCorsOptions(env = process.env) {
  return {
    origin: createCorsOriginHandler(parseAllowedOrigins(env)),
    credentials: true,
  };
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: createSocketCorsOptions(process.env),
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
