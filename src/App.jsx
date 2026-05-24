import { useState, useEffect } from "react";
import { Routes, Route, Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";

const categories = [
  { id: "feed", label: "Feed & Supply", icon: "🌾" },
  { id: "animals", label: "Animals & Livestock", icon: "🐓" },
  { id: "makers", label: "Food & Drink Makers", icon: "🧀" },
  { id: "land", label: "Land & Property Services", icon: "🪵" },
  { id: "food", label: "Food & Preservation", icon: "🫙" },
  { id: "water", label: "Water & Utilities", icon: "💧" },
  { id: "seeds", label: "Seeds & Plants", icon: "🌱" },
  { id: "learn", label: "Learn & Community", icon: "📖" },
  { id: "equipment", label: "Equipment & Repair", icon: "🔧" },
  { id: "hearth", label: "Home & Hearth", icon: "🔥" },
  { id: "farmservices", label: "Farm Services", icon: "🐄" },
  { id: "health", label: "Health & Wellness", icon: "🌿" },
  { id: "fiber", label: "Fiber & Textile", icon: "🧶" },
  { id: "maple", label: "Maple & Honey", icon: "🍯" },
  { id: "trades", label: "Building & Trades", icon: "🪚" },
  { id: "markets", label: "Markets & Events", icon: "📅" },
  { id: "legal", label: "Land & Legal", icon: "📋" },
  { id: "outdoor", label: "Outdoor & Recreation", icon: "🏕️" },
  { id: "apothecary", label: "Soap, Candles & Apothecary", icon: "🕯️" },
  { id: "forage", label: "Mushroom & Forage", icon: "🍄" },
  { id: "artisan", label: "Artisan & Craft", icon: "🏺" },
  { id: "cannabis", label: "Craft Cannabis", icon: "🍃" },
];

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "listing";
}

const TOPBAR_TEXT = "Montgomery · Fulton · Herkimer · Oneida · Madison · Schoharie · Otsego · Schenectady Counties";
const FOOTER_COUNTIES = "Serving Montgomery, Fulton, Herkimer, Oneida, Madison, Schoharie, Otsego and Schenectady Counties";
const CONTACT_EMAIL = "hello@mohawkvalleyalmanac.com";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/listing/:slug" element={<ListingPage />} />
    </Routes>
  );
}

const sharedStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .topbar { background: #1C3A5E; color: rgba(239,240,232,0.75); font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-align: center; padding: 8px; text-transform: uppercase; }
  .hero { background: #EFF0E8; border-bottom: 3px double #1C3A5E; padding: 48px 24px 40px; text-align: center; }
  .masthead-title { font-family: 'Libre Baskerville', serif; font-size: clamp(32px, 6vw, 64px); font-weight: 700; line-height: 1.05; color: #1A2B3C; margin-bottom: 8px; }
  .masthead-title em { font-style: italic; color: #1C3A5E; }
  .masthead-sub { font-family: 'Lora', serif; font-size: 17px; color: #5C7A8A; font-style: italic; margin: 10px 0 32px; }
  .ornament { color: #C4862D; font-size: 20px; letter-spacing: 8px; margin: 8px 0; display: block; }
  .search-row { display: flex; gap: 10px; max-width: 700px; margin: 0 auto; flex-wrap: wrap; justify-content: center; }
  .search-input { flex: 1; min-width: 220px; padding: 11px 16px; font-family: 'Lora', serif; font-size: 15px; border: 1.5px solid #1C3A5E; background: #F5F6F0; color: #1A2B3C; outline: none; transition: border-color 0.2s; }
  .search-input:focus { border-color: #C4862D; }
  .search-input::placeholder { color: #8AA0AE; font-style: italic; }
  .town-select { padding: 11px 14px; font-family: 'Lora', serif; font-size: 15px; border: 1.5px solid #1C3A5E; background: #F5F6F0; color: #1A2B3C; outline: none; cursor: pointer; min-width: 150px; }
  .cat-nav { background: #1C3A5E; overflow-x: auto; white-space: nowrap; scrollbar-width: none; border-bottom: 3px solid #C4862D; }
  .cat-nav::-webkit-scrollbar { display: none; }
  .cat-nav-inner { display: inline-flex; padding: 0 16px; }
  .cat-btn { background: none; border: none; color: rgba(239,240,232,0.65); font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 14px 18px; cursor: pointer; transition: color 0.2s; white-space: nowrap; border-bottom: 3px solid transparent; margin-bottom: -3px; }
  .cat-btn:hover { color: #EFF0E8; }
  .cat-btn.active { color: #EFF0E8; border-bottom-color: #C4862D; }
  .main { max-width: 1140px; margin: 0 auto; padding: 40px 24px; display: grid; grid-template-columns: 260px 1fr; gap: 40px; align-items: start; }
  @media (max-width: 760px) { .main { grid-template-columns: 1fr; } .sidebar { display: none; } }
  .sidebar-box { border: 1.5px solid #1C3A5E; background: #F5F6F0; margin-bottom: 20px; overflow: hidden; }
  .sidebar-box-header { background: #1C3A5E; color: #EFF0E8; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; padding: 10px 16px; }
  .sidebar-box-body { padding: 16px; }
  .sidebar-cat-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(28,58,94,0.1); cursor: pointer; font-size: 14px; color: #1A2B3C; transition: color 0.15s; }
  .sidebar-cat-item:last-child { border-bottom: none; }
  .sidebar-cat-item:hover, .sidebar-cat-item.active { color: #C4862D; font-weight: 600; }
  .sidebar-count { margin-left: auto; font-family: 'DM Mono', monospace; font-size: 11px; color: #8AA0AE; }
  .listings-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 8px; border-bottom: 2px solid #1C3A5E; padding-bottom: 12px; }
  .listings-title { font-family: 'Libre Baskerville', serif; font-size: 22px; font-weight: 700; color: #1A2B3C; }
  .result-count { font-family: 'DM Mono', monospace; font-size: 11px; color: #5C7A8A; letter-spacing: 0.08em; }
  .listing-card { background: #F5F6F0; border: 1.5px solid rgba(28,58,94,0.2); padding: 22px 24px; margin-bottom: 12px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s; text-decoration: none; color: inherit; display: block; }
  .listing-card:hover { border-color: #1C3A5E; box-shadow: 3px 3px 0 #1C3A5E; transform: translate(-1px,-1px); }
  .listing-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  .listing-name { font-family: 'Libre Baskerville', serif; font-size: 20px; font-weight: 700; color: #1A2B3C; margin-bottom: 3px; line-height: 1.2; }
  .listing-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: #5C7A8A; letter-spacing: 0.06em; margin-bottom: 10px; }
  .listing-desc { font-size: 15px; line-height: 1.65; color: #1A2B3C; margin-bottom: 12px; }
  .tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em; padding: 3px 8px; background: rgba(28,58,94,0.1); color: #1C3A5E; text-transform: uppercase; border: 1px solid rgba(28,58,94,0.2); }
  .hours-line { font-family: 'DM Mono', monospace; font-size: 11px; color: #5C7A8A; margin-top: 8px; }
  .no-results { text-align: center; padding: 60px 0; font-style: italic; color: #5C7A8A; font-size: 18px; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(26,43,60,0.8); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(2px); }
  .modal { background: #F5F6F0; max-width: 660px; width: 100%; max-height: 88vh; overflow-y: auto; border: 2px solid #1C3A5E; box-shadow: 8px 8px 0 #1C3A5E; }
  .modal-header { background: #1C3A5E; padding: 28px 28px 24px; position: sticky; top: 0; }
  .modal-close { float: right; background: none; border: none; color: rgba(239,240,232,0.6); font-size: 20px; cursor: pointer; }
  .modal-close:hover { color: #EFF0E8; }
  .modal-body { padding: 28px; }
  .modal-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid rgba(28,58,94,0.2); }
  .modal-field label { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #5C7A8A; display: block; margin-bottom: 3px; }
  .modal-field span { font-size: 15px; color: #1A2B3C; }
  .modal-field a { font-size: 15px; color: #C4862D; text-decoration: none; }
  .modal-field a:hover { text-decoration: underline; }
  .modal-desc { font-size: 17px; line-height: 1.7; color: #1A2B3C; margin-bottom: 24px; font-style: italic; border-left: 3px solid #C4862D; padding-left: 16px; }
  .claim-box { background: rgba(28,58,94,0.07); border: 1.5px solid #1C3A5E; padding: 20px; text-align: center; }
  .claim-box p { font-size: 14px; color: #1A2B3C; margin-bottom: 12px; font-style: italic; }
  .btn-primary { background: #1C3A5E; color: #EFF0E8; border: none; padding: 11px 28px; font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: background 0.2s; }
  .btn-primary:hover { background: #14304F; }
  .submit-form input, .submit-form select, .submit-form textarea { width: 100%; padding: 10px 14px; font-family: 'Lora', serif; font-size: 15px; border: 1.5px solid rgba(28,58,94,0.3); background: #F5F6F0; color: #1A2B3C; outline: none; margin-bottom: 14px; }
  .submit-form input:focus, .submit-form textarea:focus { border-color: #C4862D; }
  .submit-form label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #5C7A8A; display: block; margin-bottom: 4px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 500px) { .form-row { grid-template-columns: 1fr; } .modal-info-grid { grid-template-columns: 1fr; } }
  .loading { text-align: center; padding: 60px; }
  .spinner { width: 40px; height: 40px; border: 3px solid rgba(28,58,94,0.2); border-top-color: #1C3A5E; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 14px; }
  .loading-text { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #5C7A8A; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .mobile-category-toggle { display: none; }
  @media (max-width: 760px) {
    .mobile-category-toggle { display: inline-block; margin: 18px auto 0; padding: 11px 24px; background: #1C3A5E; color: #EFF0E8; border: none; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; }
  }
  .mobile-drawer-overlay { position: fixed; inset: 0; background: rgba(26,43,60,0.8); z-index: 300; display: flex; align-items: flex-start; justify-content: center; padding: 20px; backdrop-filter: blur(2px); }
  .mobile-drawer { background: #F5F6F0; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; border: 2px solid #1C3A5E; box-shadow: 6px 6px 0 #1C3A5E; }
  .mobile-drawer-header { background: #1C3A5E; color: #EFF0E8; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; position: sticky; top: 0; }
  .mobile-drawer-close { background: none; border: none; color: rgba(239,240,232,0.7); font-size: 18px; cursor: pointer; padding: 0 4px; }
  .mobile-drawer-close:hover { color: #EFF0E8; }
  .mobile-drawer-body { padding: 12px 18px 18px; }
  .share-btn { background: transparent; color: #1C3A5E; border: 1.5px solid #1C3A5E; padding: 8px 18px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: background 0.2s, color 0.2s; }
  .share-btn:hover { background: #1C3A5E; color: #EFF0E8; }
  .listing-page-wrap { font-family: 'Lora', Georgia, serif; background: #EFF0E8; min-height: 100vh; color: #1A2B3C; }
  .listing-page-nav { max-width: 760px; margin: 0 auto; padding: 24px 24px 0; }
  .back-link { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #1C3A5E; text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.15s; }
  .back-link:hover { border-bottom-color: #C4862D; color: #C4862D; }
  .listing-page-article { max-width: 760px; margin: 0 auto; padding: 24px 24px 80px; }
  .listing-page-masthead { background: #1C3A5E; padding: 32px 32px 28px; border: 2px solid #1C3A5E; }
  .listing-page-eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #C4862D; margin-bottom: 10px; }
  .listing-page-title { font-family: 'Libre Baskerville', serif; font-size: clamp(26px, 4vw, 36px); font-weight: 700; color: #EFF0E8; line-height: 1.15; margin-bottom: 8px; }
  .listing-page-sub { font-family: 'DM Mono', monospace; font-size: 12px; color: rgba(239,240,232,0.6); letter-spacing: 0.08em; }
  .listing-page-body { background: #F5F6F0; border: 2px solid #1C3A5E; border-top: none; padding: 32px; }
`;

function HomePage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const activeCategory = searchParams.get("category") || "all";
  const countyFilter = searchParams.get("county") || "All";
  const townFilter = searchParams.get("town") || "All";
  const [showSubmit, setShowSubmit] = useState(false);
  const [showMobileCats, setShowMobileCats] = useState(false);

  function setParam(key, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function setCounty(value) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "All") next.delete("county");
    else next.set("county", value);
    next.delete("town");
    setSearchParams(next, { replace: true });
  }

  useEffect(() => { fetchListings(); }, []);

  async function fetchListings() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("listings").select("*").eq("status", "published").order("name", { ascending: true }).limit(2000);
      if (error) throw error;
      setListings(data || []);
    } catch (err) {
      console.error("DB error:", err);
    } finally { setLoading(false); }
  }

  const allCounties = [...new Set(listings.map((d) => d.county))].filter(Boolean).sort();
  const allTowns = [...new Set(listings.filter((d) => countyFilter === "All" || d.county === countyFilter).map((d) => d.town))].filter(Boolean).sort();
  const filtered = listings.filter((d) => {
    const matchCat = activeCategory === "all" || d.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = search === "" || d.name?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q) || (d.tags || []).some((t) => t.toLowerCase().includes(q)) || d.town?.toLowerCase().includes(q) || d.county?.toLowerCase().includes(q);
    const matchTown = townFilter === "All" || d.town === townFilter;
    const matchCounty = countyFilter === "All" || d.county === countyFilter;
    return matchCat && matchSearch && matchTown && matchCounty;
  });

  return (
    <div style={{ fontFamily: "'Lora', Georgia, serif", background: "#EFF0E8", minHeight: "100vh", color: "#1A2B3C" }}>
      <style>{sharedStyles}</style>

      <div className="topbar">{TOPBAR_TEXT}</div>

      <div className="hero">
        <h1 className="masthead-title">Mohawk Valley<br /><em>Almanac</em></h1>
        <span className="ornament">✦ ✦ ✦</span>
        <p className="masthead-sub">The Mohawk Valley's homesteading & rural living guide</p>
        <div className="search-row">
          <input className="search-input" placeholder="Search by resource, specialty, town, or county" value={search} onChange={(e) => setParam("q", e.target.value, "")} />
          <select className="town-select" value={countyFilter} onChange={(e) => setCounty(e.target.value)}>
            <option value="All">All Counties</option>
            {allCounties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="town-select" value={townFilter} onChange={(e) => setParam("town", e.target.value, "All")}>
            <option value="All">All Towns</option>
            {allTowns.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button className="mobile-category-toggle" onClick={() => setShowMobileCats(true)}>Browse Categories</button>
      </div>

      <div className="cat-nav">
        <div className="cat-nav-inner">
          <button className={"cat-btn " + (activeCategory === "all" ? "active" : "")} onClick={() => setParam("category", "all", "all")}>All Resources</button>
          {categories.map((c) => (
            <button key={c.id} className={"cat-btn " + (activeCategory === c.id ? "active" : "")} onClick={() => setParam("category", c.id, "all")}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="main">
        <div className="sidebar">
          <div className="sidebar-box">
            <div className="sidebar-box-header">Browse by Category</div>
            <div className="sidebar-box-body">
              <div className={"sidebar-cat-item " + (activeCategory === "all" ? "active" : "")} onClick={() => setParam("category", "all", "all")}>
                <span>All Resources</span><span className="sidebar-count">{listings.length}</span>
              </div>
              {categories.map((c) => {
                const count = listings.filter((d) => d.category === c.id).length;
                return (
                  <div key={c.id} className={"sidebar-cat-item " + (activeCategory === c.id ? "active" : "")} onClick={() => setParam("category", c.id, "all")}>
                    <span>{c.icon} {c.label}</span><span className="sidebar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sidebar-box">
            <div className="sidebar-box-header">Are You Listed?</div>
            <div className="sidebar-box-body">
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "#1A2B3C", marginBottom: 14, fontStyle: "italic" }}>Local homestead-related businesses can request a free basic listing.</p>
              <button className="btn-primary" style={{ width: "100%" }} onClick={() => setShowSubmit(true)}>Request a Listing</button>
            </div>
          </div>
        </div>

        <div>
          <div className="listings-header">
            <div className="listings-title">{activeCategory === "all" ? "All Resources" : (categories.find((c) => c.id === activeCategory) || {}).label}</div>
            <div className="result-count">{filtered.length} {filtered.length === 1 ? "resource" : "resources"}</div>
          </div>

          {loading ? (
            <div className="loading"><div className="spinner" /><div className="loading-text">Loading resources</div></div>
          ) : filtered.length === 0 ? (
            <div className="no-results">Nothing found. Try a different search or category.</div>
          ) : (
            filtered.map((d) => {
              const cat = categories.find((c) => c.id === d.category);
              return (
                <Link key={d.id} to={`/listing/${d.slug}`} className="listing-card">
                  <div className="listing-card-top">
                    <div>
                      <div className="listing-name">{d.name}</div>
                      <div className="listing-meta">{cat ? cat.icon : ""} {cat ? cat.label : ""} - {d.town}, {d.county} Co.{d.established ? " - Est. " + d.established : ""}</div>
                    </div>
                  </div>
                  <p className="listing-desc">{d.description}</p>
                  <div className="tag-row">{(d.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}</div>
                  <div className="hours-line">{d.hours}</div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {showSubmit && <SubmitForm onClose={() => setShowSubmit(false)} />}

      {showMobileCats && (
        <div className="mobile-drawer-overlay" onClick={() => setShowMobileCats(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <span>Browse by Category</span>
              <button className="mobile-drawer-close" onClick={() => setShowMobileCats(false)}>X</button>
            </div>
            <div className="mobile-drawer-body">
              <div className={"sidebar-cat-item " + (activeCategory === "all" ? "active" : "")} onClick={() => { setParam("category", "all", "all"); setShowMobileCats(false); }}>
                <span>All Resources</span><span className="sidebar-count">{listings.length}</span>
              </div>
              {categories.map((c) => {
                const count = listings.filter((d) => d.category === c.id).length;
                return (
                  <div key={c.id} className={"sidebar-cat-item " + (activeCategory === c.id ? "active" : "")} onClick={() => { setParam("category", c.id, "all"); setShowMobileCats(false); }}>
                    <span>{c.icon} {c.label}</span><span className="sidebar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{backgroundColor:"#EFF0E8",borderTop:"2px solid #D4D8C8",padding:"48px 24px",textAlign:"center",marginTop:"48px"}}>
        <div style={{maxWidth:"560px",margin:"0 auto"}}>
          <h2 style={{fontSize:"1.8rem",color:"#1A2B3C",marginBottom:"12px",fontFamily:"'Libre Baskerville',serif"}}>Get Listed on Mohawk Valley Almanac</h2>
          <p style={{color:"#5C7A8A",fontSize:"1rem",marginBottom:"24px"}}>Are you a local farm, maker, or service provider in the Mohawk Valley? Listings are completely free. Submit your business and we will add you within 48 hours.</p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Add My Business to Mohawk Valley Almanac`} style={{display:"inline-block",backgroundColor:"#1C3A5E",color:"#EFF0E8",padding:"14px 32px",borderRadius:"8px",textDecoration:"none",fontWeight:"600",fontSize:"1rem",marginBottom:"12px"}}>Submit Your Business</a>
          <p style={{color:"#8AA0AE",fontSize:"0.85rem",marginTop:"8px"}}>Already listed? Email us to update your info or report an error.</p>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer style={{backgroundColor:"#0F2640",color:"#A8B8C4",padding:"40px 24px",textAlign:"center"}}>
      <div style={{maxWidth:"800px",margin:"0 auto"}}>
        <h3 style={{color:"#EFF0E8",fontSize:"1.4rem",marginBottom:"6px",fontFamily:"'Libre Baskerville',serif"}}>Mohawk Valley Almanac</h3>
        <p style={{fontSize:"0.85rem",color:"#7A92A4",marginBottom:"24px"}}>The Mohawk Valley's homesteading & rural living guide.</p>
        <div style={{display:"flex",justifyContent:"center",gap:"24px",flexWrap:"wrap",marginBottom:"24px"}}>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{color:"#A8B8C4",textDecoration:"none",fontSize:"0.9rem"}}>Contact Us</a>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Add My Business to Mohawk Valley Almanac`} style={{color:"#A8B8C4",textDecoration:"none",fontSize:"0.9rem"}}>Submit a Listing</a>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Report an Error - Mohawk Valley Almanac`} style={{color:"#A8B8C4",textDecoration:"none",fontSize:"0.9rem"}}>Report an Error</a>
        </div>
        <p style={{fontSize:"0.78rem",color:"#5C7A8A",marginBottom:"24px",lineHeight:"1.6"}}>{FOOTER_COUNTIES}</p>
        <div style={{borderTop:"1px solid #1C3A5E",paddingTop:"20px"}}>
          <p style={{fontSize:"0.78rem",color:"#5C7A8A",margin:0}}>Copyright {new Date().getFullYear()} Mohawk Valley Almanac. Built with care in the Mohawk Valley of New York State.</p>
        </div>
      </div>
    </footer>
  );
}

function ListingPage() {
  const { slug } = useParams();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchListing() {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setListing(null);
      } else {
        setListing(data);
      }
      setLoading(false);
    }
    fetchListing();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (listing) {
      document.title = `${listing.name} - Mohawk Valley Almanac`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta && listing.description) {
        meta.setAttribute("content", listing.description.slice(0, 160));
      }
    }
    return () => { document.title = "Mohawk Valley Almanac"; };
  }, [listing]);

  const cat = listing ? categories.find((c) => c.id === listing.category) : null;

  async function handleShare() {
    if (!listing) return;
    const shareData = { title: listing.name, text: listing.description || "", url: window.location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard");
    } catch {
      alert(window.location.href);
    }
  }

  return (
    <div className="listing-page-wrap">
      <style>{sharedStyles}</style>
      <div className="topbar">{TOPBAR_TEXT}</div>
      <div className="listing-page-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link to="/" className="back-link">← Back to all resources</Link>
        {listing && <button className="share-btn" onClick={handleShare}>Share</button>}
      </div>
      <div className="listing-page-article">
        {loading ? (
          <div className="loading"><div className="spinner" /><div className="loading-text">Loading listing</div></div>
        ) : notFound || !listing ? (
          <div style={{ background: "#F5F6F0", border: "2px solid #1C3A5E", padding: 40, textAlign: "center" }}>
            <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Listing not found</div>
            <p style={{ color: "#5C7A8A", fontStyle: "italic", marginBottom: 24 }}>We couldn't find a resource at this address.</p>
            <Link to="/" className="btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>Browse all resources</Link>
          </div>
        ) : (
          <>
            <div className="listing-page-masthead">
              <h1 className="listing-page-title">{listing.name}</h1>
              <div className="listing-page-sub">
                {cat ? `${cat.icon} ${cat.label} - ` : ""}
                {listing.town}{listing.county ? `, ${listing.county} County` : ""}
                {listing.established ? ` - Est. ${listing.established}` : ""}
              </div>
              {(listing.tags || []).length > 0 && (
                <div className="tag-row" style={{ marginTop: 14 }}>
                  {(listing.tags || []).map((t) => (
                    <span key={t} style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, padding: "3px 7px", border: "1px solid rgba(196,134,45,0.5)", color: "#C4862D", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="listing-page-body">
              {listing.description && <p className="modal-desc">{listing.description}</p>}
              <div className="modal-info-grid">
                {listing.address && <div className="modal-field"><label>Address</label><span><a href={"https://maps.google.com/?q=" + encodeURIComponent(listing.address)} target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"none"}}>{listing.address}</a></span></div>}
                {listing.phone && (
                  <div className="modal-field">
                    <label>Phone</label>
                    <span>
                      <a href={`tel:${listing.phone.replace(/[^\d+]/g, '')}`} style={{color: "#C4862D", textDecoration: "none", fontFamily: "'DM Mono', monospace", fontSize: 11}}>
                        {listing.phone}
                      </a>
                    </span>
                  </div>
                )}
                {listing.hours && <div className="modal-field"><label>Hours</label><span>{listing.hours}</span></div>}
                {cat && <div className="modal-field"><label>Category</label><span>{cat.label}</span></div>}
                {listing.website && (
                  <div className="modal-field" style={{ gridColumn: "1 / -1" }}>
                    <label>Website</label>
                    <a href={listing.website.startsWith("http") ? listing.website : "https://" + listing.website} target="_blank" rel="noreferrer">
                      {listing.website}
                    </a>
                  </div>
                )}
              </div>
              <div className="claim-box">
                <p>Own or manage <strong>{listing.name}</strong>? Email us to update your hours, description, phone, or any other details. Updates are made within 24 hours.</p>
                <a href={`mailto:${CONTACT_EMAIL}?subject=Update My Listing - ${listing.name}`} className="btn-primary" style={{display:"inline-block",textDecoration:"none"}}>Update My Listing</a>
              </div>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}

function SubmitForm({ onClose }) {
  const [form, setForm] = useState({ name: "", category: "", town: "", county: "", description: "", tags: "", phone: "", hours: "", address: "", website: "", established: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!form.name || !form.category || !form.town) return alert("Please fill in name, category, and town.");
    setSubmitting(true);
    try {
      const baseSlug = slugify(form.name);
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const { error } = await supabase.from("listings").insert([{ ...form, slug, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), established: parseInt(form.established) || null, status: "pending", featured: false }]);
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      alert("Submission failed. Please try again.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" onClick={onClose}>X</button>
          <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 22, fontWeight: 700, color: "#EFF0E8" }}>Request a Free Listing</div>
          <div style={{ fontSize: 13, color: "rgba(239,240,232,0.6)", marginTop: 6 }}>Submissions are reviewed before publishing. Usually within 48 hours.</div>
        </div>
        <div className="modal-body">
          {submitted ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 16, color: "#C4862D" }}>✦</div>
              <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 22, marginBottom: 12 }}>Thank you</div>
              <p style={{ color: "#5C7A8A", fontStyle: "italic" }}>Your listing has been submitted for review. We will be in touch within 48 hours.</p>
              <button className="btn-primary" style={{ marginTop: 24 }} onClick={onClose}>Close</button>
            </div>
          ) : (
            <div className="submit-form">
              <label>Business Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your business name" />
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Select a category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <div className="form-row">
                <div><label>Town</label><input value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} placeholder="e.g. Cooperstown" /></div>
                <div><label>County</label><input value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} placeholder="e.g. Otsego" /></div>
              </div>
              <label>Description</label>
              <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tell people what you offer" />
              <label>Tags (comma separated)</label>
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. Bulk Grain, Chick Days, Fencing" />
              <div className="form-row">
                <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(315) 555-0000" /></div>
                <div><label>Year Established</label><input value={form.established} onChange={(e) => setForm({ ...form, established: e.target.value })} placeholder="e.g. 1987" /></div>
              </div>
              <label>Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
              <label>Website</label>
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" />
              <label>Hours</label>
              <input value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="e.g. Mon-Sat 8am-6pm" />
              <button className="btn-primary" style={{ width: "100%", padding: "14px", fontSize: 13, marginTop: 8 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting" : "Submit Listing for Review"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [listings, setListings] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(false);

  async function login() {
    if (pw === import.meta.env.VITE_ADMIN_PASSWORD) { setAuthed(true); fetchAll(); }
    else alert("Incorrect password.");
  }

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase.from("listings").select("*").order("created_at", { ascending: false });
    setListings(data || []);
    setLoading(false);
  }

  async function approve(id) { await supabase.from("listings").update({ status: "published" }).eq("id", id); fetchAll(); }
  async function reject(id) { await supabase.from("listings").delete().eq("id", id); fetchAll(); }

  const pending = listings.filter((l) => l.status === "pending");
  const published = listings.filter((l) => l.status === "published");
  const shown = tab === "pending" ? pending : published;

  if (!authed) return (
    <div style={{ fontFamily: "'Lora',serif", background: "#EFF0E8", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#F5F6F0", border: "2px solid #1C3A5E", padding: 40, maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#1A2B3C" }}>Admin Access</div>
        <div style={{ fontSize: 13, color: "#5C7A8A", fontStyle: "italic", marginBottom: 24 }}>Mohawk Valley Almanac</div>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="Enter password" style={{ width: "100%", padding: "10px 14px", fontFamily: "'Lora',serif", fontSize: 15, border: "1.5px solid #1C3A5E", background: "#EFF0E8", outline: "none", marginBottom: 14, color: "#1A2B3C" }} />
        <button onClick={login} style={{ width: "100%", background: "#1C3A5E", color: "#EFF0E8", border: "none", padding: "12px", fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Enter</button>
        <Link to="/" style={{ display: "block", marginTop: 16, fontSize: 12, color: "#5C7A8A" }}>Back to site</Link>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Lora',serif", background: "#EFF0E8", minHeight: "100vh" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: "#1C3A5E", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Libre Baskerville',serif", color: "#EFF0E8", fontSize: 18, fontWeight: 700 }}>Mohawk Valley Almanac - Admin</div>
        <Link to="/" style={{ color: "rgba(239,240,232,0.6)", fontSize: 12, fontFamily: "'DM Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>View Site</Link>
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
          {["pending", "published"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", background: tab === t ? "#1C3A5E" : "#F5F6F0", color: tab === t ? "#EFF0E8" : "#1C3A5E", border: "1.5px solid #1C3A5E", fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
              {t} ({t === "pending" ? pending.length : published.length})
            </button>
          ))}
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#5C7A8A", fontStyle: "italic" }}>Loading</div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#5C7A8A", fontStyle: "italic" }}>No {tab} listings.</div>
        ) : shown.map((l) => (
          <div key={l.id} style={{ background: "#F5F6F0", border: "1.5px solid rgba(28,58,94,0.2)", padding: "20px 24px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#1A2B3C" }}>{l.name}</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#5C7A8A", marginBottom: 8 }}>
                  {l.category} - {l.town}, {l.county}
                  {l.phone && (
                    <> - <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} style={{color: "#C4862D", textDecoration: "none", fontFamily: "'DM Mono', monospace", fontSize: 11}}>{l.phone}</a></>
                  )}
                </div>
                <div style={{ fontSize: 14, color: "#1A2B3C", lineHeight: 1.6 }}>{l.description}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
                {tab === "pending" && (
                  <button onClick={() => approve(l.id)} style={{ background: "#1C3A5E", color: "#EFF0E8", border: "none", padding: "8px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>Approve</button>
                )}
                <button onClick={() => reject(l.id)} style={{ background: "#F5F6F0", color: "#C4862D", border: "1.5px solid #C4862D", padding: "8px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>{tab === "pending" ? "Reject" : "Delete"}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
