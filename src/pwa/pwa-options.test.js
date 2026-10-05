// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPwaKilled, pwaOptions, isOurCache } from "./pwa-options.js";

test("VITE_PWA_KILL=1 selects the self-destroying service worker", () => {
  assert.equal(pwaOptions({ VITE_PWA_KILL: "1" }).selfDestroying, true);
  assert.equal(pwaOptions({ VITE_PWA_KILL: " 1 " }).selfDestroying, true);
  assert.equal(isPwaKilled({ VITE_PWA_KILL: "1" }), true);
});

test("without the flag (or any other value) the normal worker is built", () => {
  for (const env of [{}, undefined, { VITE_PWA_KILL: "" }, { VITE_PWA_KILL: "0" }, { VITE_PWA_KILL: "true" }, { VITE_PWA_KILL: "yes" }]) {
    assert.equal(pwaOptions(env).selfDestroying, false, JSON.stringify(env));
    assert.equal(isPwaKilled(env), false);
  }
});

test("the rest of the options are the same in both modes", () => {
  const { selfDestroying: a, ...on } = pwaOptions({});
  const { selfDestroying: b, ...off } = pwaOptions({ VITE_PWA_KILL: "1" });
  assert.deepEqual(on, off);
  assert.equal(on.strategies, "injectManifest");
  assert.equal(on.manifest.short_name, "HV Almanac");
});

test("only the site's own caches are cleared in kill mode", () => {
  assert.equal(isOurCache("hva-pages"), true);
  assert.equal(isOurCache("hva-map-data"), true);
  assert.equal(isOurCache("workbox-precache-v2-https://www.hudsonvalleyalmanac.com/"), true);
  assert.equal(isOurCache("some-other-cache"), false);
});
