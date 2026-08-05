import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { io as createClient } from "socket.io-client";

import { initSocket } from "../src/realtime/socket.js";

const previewOrigin = "https://branch-preview.pawnloop-frontend.pages.dev";

async function handshake({ origin, appEnv = "staging", enabled = "true", origins = "https://exact.example" }) {
  Object.assign(process.env, {
    APP_ENV: appEnv,
    CORS_ALLOW_PAWNLOOP_PREVIEWS: enabled,
    CORS_ORIGINS: origins,
    CORS_ORIGIN: "",
    FRONTEND_URL: "",
    WEB_URL: "",
  });
  const server = http.createServer();
  const socketServer = initSocket(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const client = createClient(`http://127.0.0.1:${address.port}`, {
    autoConnect: false,
    transports: ["polling"],
    extraHeaders: { Origin: origin },
    timeout: 1500,
    reconnection: false,
  });

  try {
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ connected: false, message: "timeout" }), 2500);
      client.once("connect", () => { clearTimeout(timer); resolve({ connected: true }); });
      client.once("connect_error", (error) => { clearTimeout(timer); resolve({ connected: false, message: error.message }); });
      client.connect();
    });
    return result;
  } finally {
    client.close();
    await new Promise((resolve) => socketServer.close(resolve));
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

test("configured exact and enabled staging Preview origins complete Socket.IO handshakes", async () => {
  assert.equal((await handshake({ origin: "https://exact.example" })).connected, true);
  assert.equal((await handshake({ origin: previewOrigin })).connected, true);
});

for (const [name, options] of [
  ["disabled Preview support", { origin: previewOrigin, enabled: "false" }],
  ["Production accidental Preview flag", { origin: previewOrigin, appEnv: "production", enabled: "true" }],
  ["malformed origin", { origin: "not an origin" }],
  ["deceptive suffix", { origin: "https://branch-preview.pawnloop-frontend.pages.dev.evil.example" }],
  ["unrelated project", { origin: "https://branch-preview.other.pages.dev" }],
  ["HTTP Preview", { origin: "http://branch-preview.pawnloop-frontend.pages.dev" }],
]) test(`${name} rejects the Socket.IO handshake`, async () => {
  assert.equal((await handshake(options)).connected, false);
});
