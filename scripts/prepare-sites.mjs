import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../public/", import.meta.url));

function exactOrigin(value) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== value) {
    throw new TypeError("INTENT_COMMERCE_ORIGIN must be an exact HTTP(S) origin.");
  }
  return parsed.origin;
}

const commerceOrigin = exactOrigin(process.env.INTENT_COMMERCE_ORIGIN ?? "https://intent-commerce.gowtham0992.workers.dev");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(`${root}index.html`, `${output}intent.html`);
for (const entry of ["styles.css", "app.js", "assets", "lib", ".well-known"]) {
  await cp(`${root}${entry}`, `${output}${entry}`, { recursive: true });
}
await writeFile(
  `${output}config.js`,
  `window.__INTENT_CONFIG__ = Object.freeze({ commerceOrigin: ${JSON.stringify(commerceOrigin)} });\n`,
  "utf8"
);
// Workers static assets serve files from public/ before the vinext Worker runs,
// so next.config headers() never reaches them; _headers is the supported channel.
await writeFile(
  `${output}_headers`,
  [
    "/*",
    `  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; frame-src 'none'; connect-src 'self' ${commerceOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'self'`,
    "  Referrer-Policy: no-referrer",
    "  X-Content-Type-Options: nosniff",
    "  Permissions-Policy: tools=(self)",
    "  Cache-Control: no-store",
    "",
    "/.well-known/ucp",
    "  ! Cache-Control",
    "  Cache-Control: public, max-age=300",
    "  Access-Control-Allow-Origin: *",
    "",
    "/_next/static/*",
    "  ! Cache-Control",
    "  Cache-Control: public, max-age=31536000, immutable",
    ""
  ].join("\n"),
  "utf8"
);
