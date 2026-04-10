import { Server } from "socket.io";

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    },
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
