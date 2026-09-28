// Freezer Full companion page — the up-to-date farm list for the book.
// Self-contained: all data comes from ./data/freezer-full.js.
import { useState, useMemo } from "react";
import {
  FREEZER_FULL_UPDATED, FREEZER_FULL_CHANGES, FREEZER_FULL_GROUPS,
  FREEZER_FULL_FARMS, FREEZER_FULL_MORE, FREEZER_FULL_PROCESSORS, FREEZER_FULL_DEER,
} from "./data/freezer-full.js";

const P = { navy: "#1C3A5E", gold: "#C4862D", surface: "#F5F6F0", text: "#1A2B3C", muted: "#5C7A8A", border: "#D8DBCF" };
const serif = "'Libre Baskerville', Georgia, serif";

function matches(f, q, sharesOnly) {
  if (sharesOnly && !f.shares) return false;
  if (!q) return true;
  const hay = [f.name, f.town, f.county, f.desc, f.shares, f.phone].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function FarmItem({ f }) {
  return (
    <li style={{ padding: "12px 0", borderBottom: `1px solid ${P.border}`, listStyle: "none" }}>
      <div style={{ fontWeight: 700, color: P.navy }}>
        {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: P.navy }}>{f.name}</a> : f.name}
        {f.town ? <span style={{ fontWeight: 400, color: P.muted }}> · {f.town}</span> : null}
        {f.phone ? <span style={{ fontWeight: 400, color: P.muted }}> · <a href={`tel:${f.phone.replace(/[^0-9+]/g, "")}`} style={{ color: P.muted }}>{f.phone}</a></span> : null}
      </div>
      <div style={{ color: P.text, marginTop: 4, lineHeight: 1.5 }}>{f.desc}</div>
      {f.shares ? <div style={{ marginTop: 4 }}><strong style={{ color: P.gold }}>Sells shares:</strong> {f.shares}</div> : null}
      {f.confirm ? <div style={{ marginTop: 4, fontStyle: "italic", color: P.muted }}>Couldn't be fully confirmed. Call first.</div> : null}
    </li>
  );
}

export default function FreezerFullContent({ siteName, bookTitle }) {
  const [q, setQ] = useState("");
  const [sharesOnly, setSharesOnly] = useState(false);
  const all = useMemo(() => [...FREEZER_FULL_FARMS, ...FREEZER_FULL_MORE], []);
  const book = FREEZER_FULL_FARMS.filter((f) => matches(f, q, sharesOnly));
  const more = FREEZER_FULL_MORE.filter((f) => matches(f, q, sharesOnly));
  const shown = book.length + more.length;
  const moreCounties = [...new Set(more.map((f) => f.county))].sort();

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px 48px", color: P.text }}>
      <div style={{ textTransform: "uppercase", letterSpacing: 2, fontSize: 12, color: P.muted }}>{siteName} · Book companion</div>
      <h1 style={{ fontFamily: serif, color: P.navy, fontSize: 32, margin: "8px 0" }}>Freezer Full: the farm list</h1>
      <p style={{ lineHeight: 1.6 }}>
        This is the up-to-date list of farms, processors, and butchers from <em>{bookTitle}</em>, plus more farms from
        the {siteName} that sell meat direct. Farms sell out and change how they sell, so call or check a farm's website
        before you drive. No one paid to be listed. Last updated {FREEZER_FULL_UPDATED}.
      </p>

      {FREEZER_FULL_CHANGES.length > 0 && (
        <div style={{ background: P.surface, border: `1px solid ${P.border}`, padding: 16, margin: "16px 0" }}>
          <strong>Changes since the book</strong>
          <ul style={{ margin: "8px 0 0 18px" }}>{FREEZER_FULL_CHANGES.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "20px 0", position: "sticky", top: 0, background: "#EFF0E8", padding: "10px 0", zIndex: 2 }}>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search farms, towns, or meats (lamb, goat, Wagyu…)"
          aria-label="Search the farm list"
          style={{ flex: "1 1 260px", padding: "10px 12px", border: `2px solid ${P.navy}`, fontSize: 16 }}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={sharesOnly} onChange={(e) => setSharesOnly(e.target.checked)} />
          Only farms that sell shares
        </label>
        <span style={{ color: P.muted, fontSize: 14 }}>{shown} of {all.length} farms</span>
      </div>

      {FREEZER_FULL_GROUPS.map((g) => {
        const list = book.filter((f) => f.county === g);
        if (!list.length) return null;
        return (
          <section key={g}>
            <h2 style={{ fontFamily: serif, color: P.navy, fontSize: 22, marginTop: 28 }}>{g === "Fish" ? "Fish" : g.includes("&") || g.includes(",") || g.includes("Other") ? g : `${g} County`}</h2>
            <ul style={{ padding: 0, margin: 0 }}>{list.map((f) => <FarmItem key={f.name + f.town} f={f} />)}</ul>
          </section>
        );
      })}

      {more.length > 0 && (
        <>
          <h2 style={{ fontFamily: serif, color: P.navy, fontSize: 24, marginTop: 40 }}>More farms from the {siteName}</h2>
          <p style={{ color: P.muted }}>These farms aren't in the printed book. They come from the Almanac's listings; tap a name for details.</p>
          {moreCounties.map((c) => (
            <section key={c}>
              <h3 style={{ fontFamily: serif, color: P.navy, fontSize: 18, marginTop: 20 }}>{c} County</h3>
              <ul style={{ padding: 0, margin: 0 }}>{more.filter((f) => f.county === c).map((f) => <FarmItem key={f.name + f.town} f={f} />)}</ul>
            </section>
          ))}
        </>
      )}

      {shown === 0 && <p style={{ fontStyle: "italic", color: P.muted, marginTop: 24 }}>No farms match that search.</p>}

      {!q && !sharesOnly && (
        <>
          <h2 style={{ fontFamily: serif, color: P.navy, fontSize: 24, marginTop: 40 }}>Processors and butchers</h2>
          <p style={{ color: P.muted }}>Processors mostly work with farmers and hunters. If you're buying a share, the farm usually books the processing. Always call ahead.</p>
          <ul style={{ padding: 0, margin: 0 }}>{FREEZER_FULL_PROCESSORS.map((f) => <FarmItem key={f.name} f={f} />)}</ul>

          <h2 style={{ fontFamily: serif, color: P.navy, fontSize: 24, marginTop: 40 }}>Deer processors</h2>
          <p style={{ color: P.muted }}>From the NYS DEC's 2026 list of deer and bear processors. "Donation" means the processor accepts deer for the Venison Donation Program. The full statewide list is at dec.ny.gov (search "deer processors").</p>
          <ul style={{ paddingLeft: 18 }}>{FREEZER_FULL_DEER.map((d) => <li key={d.county} style={{ margin: "6px 0" }}><strong>{d.county}:</strong> {d.list}</li>)}</ul>
        </>
      )}
    </div>
  );
}
