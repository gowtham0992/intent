import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import commerceWorker, { PurchaseLease } from "./cloudflare/commerce-worker.mjs";
import { createLocalDurableObjectBinding } from "./lib/local-durable-object-binding.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const localPurchaseLeases = createLocalDurableObjectBinding(PurchaseLease);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function serve(port, base) {
  const baseDir = join(root, base);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    const requested = pathname === "/" ? "/index.html" : pathname;
    const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(baseDir, safePath);

    if (!filePath.startsWith(baseDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mime[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; frame-src 'none'; connect-src 'self' http://127.0.0.1:4312; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
      "Permissions-Policy": "tools=(self)",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    createReadStream(filePath).pipe(response);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Intent ${base || "app"}: http://127.0.0.1:${port}`);
  });
}

serve(4310, ".");

createServer(async (request, response) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 4_096) {
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: { code: "REQUEST_TOO_LARGE", message: "Request is too large." } }));
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const webRequest = new Request(`http://127.0.0.1:4312${request.url}`, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.concat(chunks)
    });
    const result = await commerceWorker.fetch(webRequest, {
      MERCHANT_ORIGIN: "http://127.0.0.1:4310",
      UCP_AGENT_PROFILE_URL: "https://intent-commerce.gowtham0992.workers.dev/.well-known/ucp",
      PURCHASE_LEASES: localPurchaseLeases
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: { code: "LOCAL_SERVER_ERROR", message: "Local commerce request failed." } }));
  }
}).listen(4312, "127.0.0.1", () => console.log("Intent commerce: http://127.0.0.1:4312"));
