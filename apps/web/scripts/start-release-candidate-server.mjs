import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createReleaseCandidateChildEnv } from "./release-candidate-env.mjs";

const viteBin = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

const child = spawn(
  process.execPath,
  [
    viteBin,
    "--config",
    "vite.release-candidate.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "5186",
    "--strictPort",
  ],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: createReleaseCandidateChildEnv(),
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(`[release-candidate-server] ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
