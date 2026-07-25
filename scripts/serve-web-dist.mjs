import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, "../apps/web/dist");
const port = Number(process.env.PORT || 10000);
const host = "0.0.0.0";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safePathname(requestUrl) {
  const url = new URL(requestUrl || "/", "http://localhost");
  return decodeURIComponent(url.pathname);
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type":
      mimeTypes[extension] || "application/octet-stream",
    "Cache-Control":
      extension === ".html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });

  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  let pathname;

  try {
    pathname = safePathname(request.url);
  } catch {
    response.writeHead(400);
    response.end("Bad Request");
    return;
  }

  const relativePath =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");

  const requestedPath = path.resolve(distDir, relativePath);

  if (
    requestedPath !== distDir &&
    !requestedPath.startsWith(`${distDir}${path.sep}`)
  ) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(requestedPath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(response, requestedPath);
      return;
    }

    const fallbackPath = path.join(distDir, "index.html");

    fs.stat(fallbackPath, (fallbackError, fallbackStats) => {
      if (fallbackError || !fallbackStats.isFile()) {
        response.writeHead(404);
        response.end("Not Found");
        return;
      }

      sendFile(response, fallbackPath);
    });
  });
});

server.listen(port, host, () => {
  console.log(
    `PawnLoop web server listening on http://${host}:${port}`,
  );
});
