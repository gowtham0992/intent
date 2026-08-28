import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../dist/", import.meta.url));

function exactOrigin(value, label) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== value) {
    throw new TypeError(`${label} must be an exact HTTP(S) origin.`);
  }
  return parsed.origin;
}

const configuredCommerce = process.env.INTENT_COMMERCE_ORIGIN;
if (process.env.VERCEL && !configuredCommerce) {
  throw new Error("INTENT_COMMERCE_ORIGIN is required for Vercel builds.");
}
const commerceOrigin = exactOrigin(configuredCommerce ?? "http://127.0.0.1:4312", "INTENT_COMMERCE_ORIGIN");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of ["index.html", "styles.css", "app.js", "assets", "lib", ".well-known"]) {
  await cp(`${root}${entry}`, `${output}${entry}`, { recursive: true });
}
await writeFile(
  `${output}config.js`,
  `window.__INTENT_CONFIG__ = Object.freeze({ commerceOrigin: ${JSON.stringify(commerceOrigin)} });\n`,
  "utf8"
);
