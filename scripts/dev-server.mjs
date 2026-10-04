import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredPort = process.env.PORT;
const port = configuredPort === undefined ? 4173 : Number(configuredPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT نامعتبر است.");
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".txt", "text/plain; charset=utf-8"],
]);

function sendSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'");
}

const server = createServer(async (request, response) => {
  sendSecurityHeaders(response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    response.end("روش درخواست پشتیبانی نمی‌شود.");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("درخواست نامعتبر است.");
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const isIndex = relativePath === "index.html";
  const isAppModule = segments[0] === "src" || segments[0] === "data";
  const filePath = isIndex || isAppModule
    ? path.resolve(root, relativePath)
    : path.resolve(root, "public", relativePath);
  const allowedRoot = isIndex
    ? root
    : isAppModule
      ? path.resolve(root, segments[0])
      : path.resolve(root, "public");
  if (filePath !== allowedRoot && !filePath.startsWith(`${allowedRoot}${path.sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("دسترسی مجاز نیست.");
    return;
  }

  try {
    await access(filePath);
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("صفحه یا فایل پیدا نشد.");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Flight Connection Risk Checker آماده است: http://0.0.0.0:${server.address().port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
