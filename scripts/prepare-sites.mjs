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
for (const entry of ["styles.css", "app.js", "assets", "lib"]) {
  await cp(`${root}${entry}`, `${output}${entry}`, { recursive: true });
}
await writeFile(
  `${output}config.js`,
  `window.__INTENT_CONFIG__ = Object.freeze({ commerceOrigin: ${JSON.stringify(commerceOrigin)} });\n`,
  "utf8"
);
