// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheRuleFor } from "./cache-rules.js";

const ORIGIN = "https://www.hudsonvalleyalmanac.com";
const get = (url, mode = "cors") => ({ url, method: "GET", mode });

test("map tiles are never cached, from any tile provider", () => {
  for (const url of [
    "https://tiles.stadiamaps.com/tiles/stamen_terrain/12/1205/1530@2x.png",
    "https://tiles.stadiamaps.com/tiles/alidade_smooth/9/150/190.png?api_key=x",
    "https://tile.openstreetmap.org/12/1205/1530.png",
    "https://a.basemaps.cartocdn.com/light_all/12/1205/1530.png",
  ]) {
    assert.equal(cacheRuleFor(get(url, "no-cors"), ORIGIN), null, url);
  }
});

test("Supabase API calls are never cached", () => {
  for (const url of [
    "https://cntafkasuhnpdlhdwajm.supabase.co/rest/v1/listings?select=id&slug=eq.x",
    "https://cntafkasuhnpdlhdwajm.supabase.co/auth/v1/token?grant_type=password",
    "https://cntafkasuhnpdlhdwajm.supabase.co/storage/v1/object/public/x.png",
  ]) {
    assert.equal(cacheRuleFor(get(url), ORIGIN), null, url);
  }
});

test("nothing under /admin is cached, page or not", () => {
  assert.equal(cacheRuleFor(get(`${ORIGIN}/admin`, "navigate"), ORIGIN), null);
  assert.equal(cacheRuleFor(get(`${ORIGIN}/admin/`, "navigate"), ORIGIN), null);
  assert.equal(cacheRuleFor(get(`${ORIGIN}/admin/listings?x=1`, "navigate"), ORIGIN), null);
  assert.equal(cacheRuleFor(get(`${ORIGIN}/admin/data.json`), ORIGIN), null);
  // A page that merely starts with "admin" is still a normal page.
  assert.equal(cacheRuleFor(get(`${ORIGIN}/administrator-guide`, "navigate"), ORIGIN), "page");
});

test("mailto/tel links and external sites are never cached", () => {
  assert.equal(cacheRuleFor(get("mailto:hello@hudsonvalleyalmanac.com", "navigate"), ORIGIN), null);
  assert.equal(cacheRuleFor(get("tel:+18455551234", "navigate"), ORIGIN), null);
  assert.equal(cacheRuleFor(get("https://www.buymeacoffee.com/almanac", "navigate"), ORIGIN), null);
  assert.equal(cacheRuleFor(get("https://www.googletagmanager.com/gtag/js?id=G-1"), ORIGIN), null);
  assert.equal(cacheRuleFor(get("https://fonts.gstatic.com/s/lora/v1/x.woff2"), ORIGIN), null);
});

test("the /api, sitemap, loader data and service worker are not runtime-cached", () => {
  for (const path of ["/api/nightly-rebuild", "/sitemap.xml", "/static-loader-data-manifest-abc.json", "/static-loader-data/listing/x.abc.json", "/sw.js"]) {
    assert.equal(cacheRuleFor(get(`${ORIGIN}${path}`), ORIGIN), null, path);
  }
});

test("the map data JSON is stale-while-revalidate", () => {
  assert.equal(cacheRuleFor(get(`${ORIGIN}/assets/listings-map-B4x_9kQz.json`), ORIGIN), "map-data");
  // Another origin serving the same path is still external.
  assert.equal(cacheRuleFor(get("https://evil.example/assets/listings-map-B4x_9kQz.json"), ORIGIN), null);
});

test("page navigations are network-first; other requests and non-GETs are left alone", () => {
  assert.equal(cacheRuleFor(get(`${ORIGIN}/`, "navigate"), ORIGIN), "page");
  assert.equal(cacheRuleFor(get(`${ORIGIN}/listing/apple-barn`, "navigate"), ORIGIN), "page");
  assert.equal(cacheRuleFor(get(`${ORIGIN}/map?q=cider`, "navigate"), ORIGIN), "page");
  assert.equal(cacheRuleFor(get(`${ORIGIN}/book-covers/x.jpg`, "no-cors"), ORIGIN), null);
  assert.equal(cacheRuleFor({ url: `${ORIGIN}/`, method: "POST", mode: "navigate" }, ORIGIN), null);
  assert.equal(cacheRuleFor({ url: "not a url", method: "GET" }, ORIGIN), null);
  assert.equal(cacheRuleFor(null, ORIGIN), null);
});
