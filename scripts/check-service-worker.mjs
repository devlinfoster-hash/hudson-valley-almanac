// Build check, run after the SSG build: dist/sw.js must match VITE_PWA_KILL.
//   VITE_PWA_KILL=1 -> the self-destroying worker (unregisters, clears caches)
//   otherwise       -> the normal worker, with its precache manifest injected
// Reads the flag the same way vite.config.js does (environment + .env files).
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { isPwaKilled } from "../src/pwa/pwa-options.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const killed = isPwaKilled(loadEnv("production", root, "VITE_PWA_"));

let sw;
try {
  sw = await readFile(resolve(root, "dist", "sw.js"), "utf8");
} catch (err) {
  console.error(`[sw-check] ERROR: dist/sw.js is missing (${err.message}).`);
  process.exit(1);
}

const selfDestroying = sw.includes("registration.unregister()") && !sw.includes("assets/");
const normal = !sw.includes("registration.unregister()") && /"url":"assets\//.test(sw);

if (killed && !selfDestroying) {
  console.error("[sw-check] ERROR: VITE_PWA_KILL=1 but dist/sw.js is not the self-destroying worker.");
  process.exit(1);
}
if (!killed && !normal) {
  console.error("[sw-check] ERROR: dist/sw.js is not the normal worker (no precache manifest, or it self-destroys) but VITE_PWA_KILL is not 1.");
  process.exit(1);
}
console.log(`[sw-check] dist/sw.js is the ${killed ? "self-destroying (VITE_PWA_KILL=1)" : "normal"} service worker.`);
