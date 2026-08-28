import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../public/", import.meta.url));
const commerceOrigin = "https://intent-commerce.gowtham0992.workers.dev";

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
