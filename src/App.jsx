import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const ADMIN_PASSWORD = "almanac2024";

const categories = [
  { id: "feed", label: "Feed & Supply", icon: "🌾" },
  { id: "animals", label: "Animals & Livestock", icon: "🐓" },
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
  { id: "makers", label: "Food & Drink Makers", icon: "🧀" },
  { id: "markets", label: "Markets & Events", icon: "📅" },
  { id: "legal", label: "Land & Legal", icon: "📋" },
  { id: "outdoor", label: "Outdoor & Recreation", icon: "🏕️" },
  { id: "apothecary", label: "Soap, Candles & Apothecary", icon: "🕯️" },
  { id: "forage", label: "Mushroom & Forage", icon: "🍄" },
  { id: "artisan", label: "Artisan & Craft", icon: "🏺" },
];

const sampleListings = [
  { name: "Altamont Feed & Farm Supply", category: "feed", town: "Altamont", county: "Albany", description: "Full-service farm and feed store serving the Capital Region since 1962. Chick days every spring. Carries Purina, Dumor, and bulk grain. Fencing, waterers, and small animal supplies.", tags: ["Bulk Grain", "Chick Days", "Fencing", "Small Animal"], phone: "(518) 555-0134", hours: "Mon–Sat 8am–6pm, Sun 9am–3pm", address: "Route 156, Altamont, NY 12009", featured: true, established: 1962, status: "published" },
  { name: "Kinderhook Heritage Meats", category: "animals", town: "Kinderhook", county: "Columbia", description: "USDA-inspected small-scale slaughter and processing facility accepting individual animals. Beef, pork, lamb, and goat. Custom cuts, vacuum sealing, and freezer wrap.", tags: ["USDA Inspected", "Beef", "Pork", "Lamb", "Custom Cuts"], phone: "(518) 555-0247", hours: "By appointment", address: "42 County Route 21, Kinderhook, NY 12106", featured: true, established: 2008, status: "published" },
  { name: "Catskill Mountain Seeds", category: "seeds", town: "Tannersville", county: "Greene", description: "Heirloom and open-pollinated vegetable, herb, and flower seeds adapted for Zone 5b–6a growing conditions. Locally trialed varieties. Seed saving workshops offered every February.", tags: ["Heirloom", "Open-Pollinated", "Zone 5b-6a", "Seed Saving"], phone: "(518) 555-0461", hours: "Online year-round; farm stand May–Oct", address: "Tannersville, NY 12485", featured: true, established: 2014, status: "published" },
  { name: "Greene County Well & Water", category: "water", town: "Catskill", county: "Greene", description: "Residential and agricultural well drilling, pump installation, and water quality testing. Serving Greene, Columbia, and Ulster counties. Licensed and insured. Free estimates.", tags: ["Well Drilling", "Pump Repair", "Water Testing", "Agricultural"], phone: "(518) 555-0358", hours: "Mon–Fri 7am–5pm", address: "Catskill, NY 12414", featured: false, established: 1987, status: "published" },
  { name: "Rensselaer Plateau Farm School", category: "learn", town: "Grafton", county: "Rensselaer", description: "Year-round workshops on small-scale farming, animal husbandry, food preservation, and rural skills. Courses in cheesemaking, butchery, fermentation, timber framing, and draft animal work.", tags: ["Workshops", "Cheesemaking", "Butchery", "Fermentation"], phone: "(518) 555-0683", hours: "See online calendar", address: "Grafton, NY 12082", featured: true, established: 2016, status: "published" },
  { name: "Ulster County Grain Project", category: "food", town: "Stone Ridge", county: "Ulster", description: "Locally grown and stone-milled whole grains, flours, and cornmeal from Hudson Valley farms. Bulk purchasing available. Subscribers receive monthly grain shares.", tags: ["Stone Milled", "Bulk Grain", "Flour", "Cornmeal", "CSA"], phone: "(845) 555-1037", hours: "Pick-up Fridays 2–6pm", address: "Stone Ridge, NY 12484", featured: true, established: 2018, status: "published" },
  { name: "Helderberg Land Clearing", category: "land", town: "Berne", county: "Albany", description: "Land clearing, brush hogging, stump grinding, and small-scale logging for rural properties in the Helderbergs. Firewood cut and split to order. Free on-site estimates.", tags: ["Land Clearing", "Brush Hogging", "Stump Grinding", "Firewood"], phone: "(518) 555-0926", hours: "Mon–Sat 7am–5pm", address: "Berne, NY 12023", featured: false, established: 2003, status: "published" },
  { name: "Ironwood Small Engine Repair", category: "equipment", town: "Voorheesville", county: "Albany", description: "Repair and maintenance for tractors, tillers, chainsaws, generators, wood splitters, and all small engines. Husqvarna and Stihl dealer. Mobile service available.", tags: ["Tractor Repair", "Chainsaw", "Generator", "Husqvarna", "Stihl"], phone: "(518) 555-1362", hours: "Mon–Fri 8am–5pm, Sat 8am–12pm", address: "Voorheesville, NY 12186", featured: false, established: 1995, status: "published" },
  { name: "Schoharie Valley Propane", category: "water", town: "Cobleskill", county: "Schoharie", description: "Residential and agricultural propane delivery, tank installation, and service. Budget billing and will-call options. Emergency service available 24/7.", tags: ["Propane Delivery", "Tank Install", "Agricultural", "24/7 Emergency"], phone: "(518) 555-1148", hours: "Mon–Fri 8am–5pm, 24/7 emergency", address: "Cobleskill, NY 12043", featured: false, established: 1978, status: "published" },
  { name: "Hudson Valley Beekeeping Supply", category: "feed", town: "Red Hook", county: "Dutchess", description: "Everything for the backyard and commercial beekeeper. Nucs and package bees available in spring. Langstroth and top-bar equipment, protective gear, honey extraction rentals.", tags: ["Bees & Nucs", "Equipment", "Extraction Rental", "Raw Honey"], phone: "(845) 555-0572", hours: "Tue–Sat 9am–5pm", address: "7 Mill Rd, Red Hook, NY 12571", featured: false, established: 2010, status: "published" },
];

export default function App() {
  const page = window.location.pathname === "/admin" ? "admin" : "home";

  if (page === "admin") return <AdminPage />;
  return <HomePage />;
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────

function HomePage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [townFilter, setTownFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
        .order("featured", { ascending: false }).limit(1000);

      if (error) throw error;

      if (!data || data.length === 0) {
        await seedDatabase();
        return fetchListings();
      }
      setListings(data);
    } catch (err) {
      console.error("DB error, using sample data:", err);
      setListings(sampleListings.map((l, i) => ({ ...l, id: i + 1 })));
      setDbError(true);
    } finally {
      setLoading(false);
    }
  }

  async function seedDatabase() {
    try {
      await supabase.from("listings").insert(sampleListings);
    } catch (err) {
      console.error("Seed error:", err);
    }
  }

  const allTowns = [...new Set(listings.map((d) => d.town))].sort();

  const filtered = listings.filter((d) => {
    const matchCat = activeCategory === "all" || d.category === activeCategory;
    const matchSearch =
      search === "" ||
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.description?.toLowerCase().includes(search.toLowerCase()) ||
      (d.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
      d.town?.toLowerCase().includes(search.toLowerCase());
    const matchTown = townFilter === "All" || d.town === townFilter;
    return matchCat && matchSearch && matchTown;
  });

  const featured = listings.filter((d) => d.featured);
  const showFiltered = search !== "" || townFilter !== "All" || activeCategory !== "all";

  return (
    <div style={{ fontFamily: "'Lora', Georgia, serif", background: "#F4EFE4", minHeight: "100vh", color: "#2C1F0E" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .topbar { background: #3B4A28; color: rgba(244,239,228,0.7); font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-align: center; padding: 8px; text-transform: uppercase; }
        .hero { background: #F4EFE4; border-bottom: 3px double #3B4A28; padding: 48px 24px 40px; text-align: center; }
        .masthead-eyebrow { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.28em; text-transform: uppercase; color: #7A5C2E; margin-bottom: 14px; }
        .masthead-rule { width: 80px; height: 1px; background: #3B4A28; margin: 0 auto 20px; }
        .masthead-title { font-family: 'Libre Baskerville', serif; font-size: clamp(32px, 6vw, 64px); font-weight: 700; line-height: 1.05; color: #2C1F0E; margin-bottom: 8px; }
        .masthead-title em { font-style: italic; color: #3B4A28; }
        .masthead-sub { font-family: 'Lora', serif; font-size: 17px; color: #7A5C2E; font-style: italic; margin: 10px 0 32px; }
        .ornament { color: #C4622D; font-size: 20px; letter-spacing: 8px; margin: 8px 0; display: block; }
        .search-row { display: flex; gap: 10px; max-width: 700px; margin: 0 auto; flex-wrap: wrap; justify-content: center; }
        .search-input { flex: 1; min-width: 220px; padding: 11px 16px; font-family: 'Lora', serif; font-size: 15px; border: 1.5px solid #3B4A28; background: #FBF8F0; color: #2C1F0E; outline: none; transition: border-color 0.2s; }
        .search-input:focus { border-color: #C4622D; }
        .search-input::placeholder { color: #B8A88A; font-style: italic; }
        .town-select { padding: 11px 14px; font-family: 'Lora', serif; font-size: 15px; border: 1.5px solid #3B4A28; background: #FBF8F0; color: #2C1F0E; outline: none; cursor: pointer; min-width: 150px; }
        .cat-nav { background: #3B4A28; overflow-x: auto; white-space: nowrap; scrollbar-width: none; border-bottom: 3px solid #C4622D; }
        .cat-nav::-webkit-scrollbar { display: none; }
        .cat-nav-inner { display: inline-flex; padding: 0 16px; }
        .cat-btn { background: none; border: none; color: rgba(244,239,228,0.65); font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 14px 18px; cursor: pointer; transition: color 0.2s; white-space: nowrap; border-bottom: 3px solid transparent; margin-bottom: -3px; }
        .cat-btn:hover { color: #F4EFE4; }
        .cat-btn.active { color: #F4EFE4; border-bottom-color: #C4622D; }
        .main { max-width: 1140px; margin: 0 auto; padding: 40px 24px; display: grid; grid-template-columns: 260px 1fr; gap: 40px; align-items: start; }
        @media (max-width: 760px) { .main { grid-template-columns: 1fr; } .sidebar { display: none; } }
        .sidebar-box { border: 1.5px solid #3B4A28; background: #FBF8F0; margin-bottom: 20px; overflow: hidden; }
        .sidebar-box-header { background: #3B4A28; color: #F4EFE4; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; padding: 10px 16px; }
        .sidebar-box-body { padding: 16px; }
        .sidebar-cat-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(59,74,40,0.1); cursor: pointer; font-size: 14px; color: #4A3320; transition: color 0.15s; }
        .sidebar-cat-item:last-child { border-bottom: none; }
        .sidebar-cat-item:hover, .sidebar-cat-item.active { color: #C4622D; font-weight: 600; }
        .sidebar-count { margin-left: auto; font-family: 'DM Mono', monospace; font-size: 11px; color: #B8A88A; }
        .featured-strip { background: #3B4A28; padding: 32px 24px; border-bottom: 3px solid #C4622D; }
        .featured-strip-inner { max-width: 1140px; margin: 0 auto; }
        .featured-strip-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: #C4622D; margin-bottom: 16px; }
        .featured-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1px; background: rgba(196,98,45,0.3); }
        .featured-item { background: #3B4A28; padding: 20px; cursor: pointer; transition: background 0.2s; }
        .featured-item:hover { background: #2e3b1f; }
        .featured-item-icon { font-size: 22px; margin-bottom: 8px; display: block; }
        .featured-item-name { font-family: 'Lora', serif; font-size: 15px; font-weight: 700; color: #F4EFE4; line-height: 1.3; margin-bottom: 4px; }
        .featured-item-loc { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(244,239,228,0.55); letter-spacing: 0.06em; text-transform: uppercase; }
        .listings-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 8px; border-bottom: 2px solid #3B4A28; padding-bottom: 12px; }
        .listings-title { font-family: 'Libre Baskerville', serif; font-size: 22px; font-weight: 700; color: #2C1F0E; }
        .result-count { font-family: 'DM Mono', monospace; font-size: 11px; color: #7A5C2E; letter-spacing: 0.08em; }
        .listing-card { background: #FBF8F0; border: 1.5px solid rgba(59,74,40,0.2); padding: 22px 24px; margin-bottom: 12px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s; }
        .listing-card:hover { border-color: #3B4A28; box-shadow: 3px 3px 0 #3B4A28; transform: translate(-1px,-1px); }
        .listing-card.is-featured { border-color: #C4622D; border-left: 4px solid #C4622D; }
        .listing-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
        .listing-name { font-family: 'Libre Baskerville', serif; font-size: 20px; font-weight: 700; color: #2C1F0E; margin-bottom: 3px; line-height: 1.2; }
        .listing-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: #7A5C2E; letter-spacing: 0.06em; margin-bottom: 10px; }
        .listing-desc { font-size: 15px; line-height: 1.65; color: #4A3320; margin-bottom: 12px; }
        .tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em; padding: 3px 8px; background: rgba(59,74,40,0.1); color: #3B4A28; text-transform: uppercase; border: 1px solid rgba(59,74,40,0.2); }
        .featured-badge { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: #C4622D; border: 1px solid #C4622D; padding: 3px 8px; white-space: nowrap; }
        .hours-line { font-family: 'DM Mono', monospace; font-size: 11px; color: #7A5C2E; margin-top: 8px; }
        .no-results { text-align: center; padding: 60px 0; font-style: italic; color: #7A5C2E; font-size: 18px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(44,31,14,0.8); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(2px); }
        .modal { background: #FBF8F0; max-width: 660px; width: 100%; max-height: 88vh; overflow-y: auto; border: 2px solid #3B4A28; box-shadow: 8px 8px 0 #3B4A28; }
        .modal-header { background: #3B4A28; padding: 28px 28px 24px; position: sticky; top: 0; }
        .modal-close { float: right; background: none; border: none; color: rgba(244,239,228,0.6); font-size: 20px; cursor: pointer; }
        .modal-close:hover { color: #F4EFE4; }
        .modal-body { padding: 28px; }
        .modal-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid rgba(59,74,40,0.2); }
        .modal-field label { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #7A5C2E; display: block; margin-bottom: 3px; }
        .modal-field span { font-size: 15px; color: #2C1F0E; }
        .modal-desc { font-size: 17px; line-height: 1.7; color: #3A2810; margin-bottom: 24px; font-style: italic; border-left: 3px solid #C4622D; padding-left: 16px; }
        .claim-box { background: rgba(59,74,40,0.07); border: 1.5px solid #3B4A28; padding: 20px; text-align: center; }
        .claim-box p { font-size: 14px; color: #4A3320; margin-bottom: 12px; font-style: italic; }
        .btn-primary { background: #3B4A28; color: #F4EFE4; border: none; padding: 11px 28px; font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: background 0.2s; }
        .btn-primary:hover { background: #2e3b1f; }
        .submit-form input, .submit-form select, .submit-form textarea { width: 100%; padding: 10px 14px; font-family: 'Lora', serif; font-size: 15px; border: 1.5px solid rgba(59,74,40,0.3); background: #FBF8F0; color: #2C1F0E; outline: none; margin-bottom: 14px; }
        .submit-form input:focus, .submit-form textarea:focus { border-color: #C4622D; }
        .submit-form label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #7A5C2E; display: block; margin-bottom: 4px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 500px) { .form-row { grid-template-columns: 1fr; } .modal-info-grid { grid-template-columns: 1fr; } }
        footer { background: #2C1F0E; color: rgba(244,239,228,0.45); text-align: center; padding: 28px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.1em; }
        footer strong { color: #C4622D; }
        .loading { text-align: center; padding: 60px; font-style: italic; color: #7A5C2E; }
      `}</style>

      <div className="topbar">Albany · Columbia · Greene · Ulster · Dutchess · Schoharie · Rensselaer Counties</div>

      <div className="hero">
        <div className="masthead-eyebrow">Hudson Valley & Capital Region</div>
        <div className="masthead-rule" />
        <h1 className="masthead-title">Hudson Valley<br /><em>Almanac</em></h1>
        <span className="ornament">✦ ✦ ✦</span>
        <p className="masthead-sub">The homesteading & rural living resource guide for upstate New York</p>
        <div className="search-row">
          <input className="search-input" placeholder="Search by resource, specialty, or town…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="town-select" value={townFilter} onChange={(e) => setTownFilter(e.target.value)}>
            <option value="All">All Towns</option>
            {allTowns.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="cat-nav">
        <div className="cat-nav-inner">
          <button className={`cat-btn ${activeCategory === "all" ? "active" : ""}`} onClick={() => setActiveCategory("all")}>All Resources</button>
          {categories.map((c) => (
            <button key={c.id} className={`cat-btn ${activeCategory === c.id ? "active" : ""}`} onClick={() => setActiveCategory(c.id)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {!showFiltered && featured.length > 0 && (
        <div className="featured-strip">
          <div className="featured-strip-inner">
            <div className="featured-strip-label">★ Featured Resources</div>
            <div className="featured-grid">
              {featured.map((d) => {
                const cat = categories.find((c) => c.id === d.category);
                return (
                  <div key={d.id} className="featured-item" onClick={() => setSelected(d)}>
                    <span className="featured-item-icon">{cat?.icon || "📍"}</span>
                    <div className="featured-item-name">{d.name}</div>
                    <div className="featured-item-loc">{d.town} · {d.county} Co.</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="main">
        <div className="sidebar">
          <div className="sidebar-box">
            <div className="sidebar-box-header">Browse by Category</div>
            <div className="sidebar-box-body">
              <div className={`sidebar-cat-item ${activeCategory === "all" ? "active" : ""}`} onClick={() => setActiveCategory("all")}>
                <span>All Resources</span><span className="sidebar-count">{listings.length}</span>
              </div>
              {categories.map((c) => {
                const count = listings.filter((d) => d.category === c.id).length;
                return (
                  <div key={c.id} className={`sidebar-cat-item ${activeCategory === c.id ? "active" : ""}`} onClick={() => setActiveCategory(c.id)}>
                    <span>{c.icon} {c.label}</span><span className="sidebar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sidebar-box">
            <div className="sidebar-box-header">Are You Listed?</div>
            <div className="sidebar-box-body">
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "#4A3320", marginBottom: 14, fontStyle: "italic" }}>Local homestead-related businesses can claim a free basic listing.</p>
              <button className="btn-primary" style={{ width: "100%" }} onClick={() => setShowSubmit(true)}>Request a Listing</button>
            </div>
          </div>
        </div>

        <div>
          <div className="listings-header">
            <div className="listings-title">{activeCategory === "all" ? "All Resources" : categories.find((c) => c.id === activeCategory)?.label}</div>
            <div className="result-count">{filtered.length} {filtered.length === 1 ? "resource" : "resources"}</div>
          </div>

          {loading ? (
            <div className="loading">Loading resources…</div>
          ) : filtered.length === 0 ? (
            <div className="no-results">Nothing found — try a different search or category.</div>
          ) : (
            filtered.map((d) => {
              const cat = categories.find((c) => c.id === d.category);
              return (
                <div key={d.id} className={`listing-card ${d.featured ? "is-featured" : ""}`} onClick={() => setSelected(d)}>
                  <div className="listing-card-top">
                    <div>
                      <div className="listing-name">{d.name}</div>
                      <div className="listing-meta">{cat?.icon} {cat?.label} · {d.town}, {d.county} Co. · Est. {d.established}</div>
                    </div>
                    {d.featured && <span className="featured-badge">★ Featured</span>}
                  </div>
                  <p className="listing-desc">{d.description}</p>
                  <div className="tag-row">{(d.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}</div>
                  <div className="hours-line">⏱ {d.hours}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
              {selected.featured && <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: "0.2em", color: "#C4622D", textTransform: "uppercase", marginBottom: 8 }}>★ Featured Resource</div>}
              <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, color: "#F4EFE4", lineHeight: 1.2, marginBottom: 6 }}>{selected.name}</div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "rgba(244,239,228,0.6)", letterSpacing: "0.08em" }}>{selected.town}, {selected.county} County · Est. {selected.established}</div>
              <div className="tag-row" style={{ marginTop: 12 }}>
                {(selected.tags || []).map((t) => <span key={t} style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, padding: "3px 7px", border: "1px solid rgba(196,98,45,0.5)", color: "#C4622D", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t}</span>)}
              </div>
            </div>
            <div className="modal-body">
              <p className="modal-desc">{selected.description}</p>
              <div className="modal-info-grid">
                <div className="modal-field"><label>Address</label><span>{selected.address}</span></div>
                <div className="modal-field"><label>Phone</label><span>{selected.phone}</span></div>
                <div className="modal-field"><label>Hours</label><span>{selected.hours}</span></div>
                <div className="modal-field"><label>Category</label><span>{categories.find((c) => c.id === selected.category)?.label}</span></div>
              </div>
              <div className="claim-box">
                <p>Own or manage <strong>{selected.name}</strong>? Claim your listing to add photos, update details, and reach more local homesteaders.</p>
                <button className="btn-primary" onClick={() => { setSelected(null); setShowSubmit(true); }}>Claim This Listing</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubmit && <SubmitForm onClose={() => setShowSubmit(false)} />}

      <footer>
        <strong>Hudson Valley Almanac</strong> · Hudson Valley & Capital Region · © 2024
        <span style={{ marginLeft: 16 }}>
          <a href="/admin" style={{ color: "rgba(244,239,228,0.3)", textDecoration: "none", fontSize: 10 }}>admin</a>
        </span>
      </footer>
    </div>
  );
}

// ─── SUBMIT FORM ──────────────────────────────────────────────────────────────

function SubmitForm({ onClose }) {
  const [form, setForm] = useState({ name: "", category: "", town: "", county: "", description: "", tags: "", phone: "", hours: "", address: "", established: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!form.name || !form.category || !form.town) return alert("Please fill in name, category, and town.");
    setSubmitting(true);
    try {
      const { error } = await supabase.from("listings").insert([{
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        established: parseInt(form.established) || null,
        status: "pending",
        featured: false,
      }]);
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      alert("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" onClick={onClose}>✕</button>
          <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 22, fontWeight: 700, color: "#F4EFE4" }}>Request a Free Listing</div>
          <div style={{ fontSize: 13, color: "rgba(244,239,228,0.6)", marginTop: 6 }}>Submissions are reviewed before publishing — usually within 48 hours.</div>
        </div>
        <div className="modal-body">
          {submitted ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
              <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 22, marginBottom: 12 }}>Thank you!</div>
              <p style={{ color: "#7A5C2E", fontStyle: "italic" }}>Your listing has been submitted for review. We'll be in touch within 48 hours.</p>
              <button className="btn-primary" style={{ marginTop: 24 }} onClick={onClose}>Close</button>
            </div>
          ) : (
            <div className="submit-form">
              <label>Business Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your business name" />
              <label>Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Select a category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <div className="form-row">
                <div><label>Town *</label><input value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} placeholder="e.g. Catskill" /></div>
                <div><label>County</label><input value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} placeholder="e.g. Greene" /></div>
              </div>
              <label>Description</label>
              <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tell people what you offer…" />
              <label>Tags (comma separated)</label>
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. Bulk Grain, Chick Days, Fencing" />
              <div className="form-row">
                <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(518) 555-0000" /></div>
                <div><label>Year Established</label><input value={form.established} onChange={(e) => setForm({ ...form, established: e.target.value })} placeholder="e.g. 1987" /></div>
              </div>
              <label>Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
              <label>Hours</label>
              <input value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="e.g. Mon–Sat 8am–6pm" />
              <button className="btn-primary" style={{ width: "100%", padding: "14px", fontSize: 13, marginTop: 8 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Listing for Review"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN PAGE ───────────────────────────────────────────────────────────────

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [listings, setListings] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(false);

  async function login() {
    if (pw === ADMIN_PASSWORD) { setAuthed(true); fetchAll(); }
    else alert("Incorrect password.");
  }

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase.from("listings").select("*").order("created_at", { ascending: false });
    setListings(data || []);
    setLoading(false);
  }

  async function approve(id) {
    await supabase.from("listings").update({ status: "published" }).eq("id", id);
    fetchAll();
  }

  async function reject(id) {
    await supabase.from("listings").delete().eq("id", id);
    fetchAll();
  }

  async function toggleFeatured(id, current) {
    await supabase.from("listings").update({ featured: !current }).eq("id", id);
    fetchAll();
  }

  const pending = listings.filter((l) => l.status === "pending");
  const published = listings.filter((l) => l.status === "published");
  const shown = tab === "pending" ? pending : published;

  if (!authed) return (
    <div style={{ fontFamily: "'Lora',serif", background: "#F4EFE4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#FBF8F0", border: "2px solid #3B4A28", padding: 40, maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Admin Access</div>
        <div style={{ fontSize: 13, color: "#7A5C2E", fontStyle: "italic", marginBottom: 24 }}>Hudson Valley Almanac</div>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="Enter password" style={{ width: "100%", padding: "10px 14px", fontFamily: "'Lora',serif", fontSize: 15, border: "1.5px solid #3B4A28", background: "#F4EFE4", outline: "none", marginBottom: 14 }} />
        <button onClick={login} style={{ width: "100%", background: "#3B4A28", color: "#F4EFE4", border: "none", padding: "12px", fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Enter</button>
        <a href="/" style={{ display: "block", marginTop: 16, fontSize: 12, color: "#7A5C2E" }}>← Back to site</a>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Lora',serif", background: "#F4EFE4", minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Mono:wght@400;500&family=Libre+Baskerville:wght@400;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: "#3B4A28", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Libre Baskerville',serif", color: "#F4EFE4", fontSize: 18, fontWeight: 700 }}>Hudson Valley Almanac — Admin</div>
        <a href="/" style={{ color: "rgba(244,239,228,0.6)", fontSize: 12, fontFamily: "'DM Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>← View Site</a>
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
          {["pending", "published"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", background: tab === t ? "#3B4A28" : "#FBF8F0", color: tab === t ? "#F4EFE4" : "#3B4A28", border: "1.5px solid #3B4A28", fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
              {t} ({t === "pending" ? pending.length : published.length})
            </button>
          ))}
        </div>
        {loading ? <div style={{ textAlign: "center", padding: 40, color: "#7A5C2E", fontStyle: "italic" }}>Loading…</div> : shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#7A5C2E", fontStyle: "italic" }}>No {tab} listings.</div>
        ) : shown.map((l) => (
          <div key={l.id} style={{ background: "#FBF8F0", border: "1.5px solid rgba(59,74,40,0.2)", padding: "20px 24px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{l.name}</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#7A5C2E", marginBottom: 8 }}>{l.category} · {l.town}, {l.county} · {l.phone}</div>
                <div style={{ fontSize: 14, color: "#4A3320", lineHeight: 1.6 }}>{l.description}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
                {tab === "pending" && (
                  <button onClick={() => approve(l.id)} style={{ background: "#3B4A28", color: "#F4EFE4", border: "none", padding: "8px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>✓ Approve</button>
                )}
                {tab === "published" && (
                  <button onClick={() => toggleFeatured(l.id, l.featured)} style={{ background: l.featured ? "#C4622D" : "#FBF8F0", color: l.featured ? "#F4EFE4" : "#3B4A28", border: "1.5px solid #C4622D", padding: "8px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, cursor: "pointer" }}>
                    {l.featured ? "★ Featured" : "☆ Feature"}
                  </button>
                )}
                <button onClick={() => reject(l.id)} style={{ background: "#FBF8F0", color: "#C4622D", border: "1.5px solid #C4622D", padding: "8px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>✕ {tab === "pending" ? "Reject" : "Delete"}</button>
              </div>
            </div>
          </div>
        ))}
        {/* SUBMIT YOUR BUSINESS SECTION */}
        <div style={{backgroundColor:'#f9f5ef',borderTop:'2px solid #e8dcc8',padding:'48px 24px',textAlign:'center',marginTop:'48px'}}>
          <div style={{maxWidth:'560px',margin:'0 auto'}}>
            <h2 style={{fontSize:'1.8rem',color:'#3d2b1f',marginBottom:'12px'}}>Get Listed on Hudson Valley Almanac</h2>
            <p style={{color:'#6b5344',fontSize:'1rem',marginBottom:'24px'}}>Are you a local farm, maker, or service provider in the Hudson Valley or Capital Region? Listings are completely free. Submit your business and we will add you within 48 hours.</p>
            <a href="mailto:hello@hudsonvalleyalmanac.com?subject=Add My Business to Hudson Valley Almanac" style={{display:'inline-block',backgroundColor:'#6b8f47',color:'white',padding:'14px 32px',borderRadius:'8px',textDecoration:'none',fontWeight:'600',fontSize:'1rem',marginBottom:'12px'}}>Submit Your Business</a>
            <p style={{color:'#9e8070',fontSize:'0.85rem',marginTop:'8px'}}>Already listed? Email us to update your info or report an error.</p>
          </div>
        </div>
        <footer style={{backgroundColor:'#2c1f14',color:'#c9b89a',padding:'40px 24px',textAlign:'center'}}>
          <div style={{maxWidth:'800px',margin:'0 auto'}}>
            <h3 style={{color:'#f0e6d3',fontSize:'1.4rem',marginBottom:'6px'}}>Hudson Valley Almanac</h3>
            <p style={{fontSize:'0.85rem',color:'#9e8070',marginBottom:'24px'}}>The definitive homesteading and rural living directory for the Hudson Valley and Capital Region of New York State.</p>
            <div style={{display:'flex',justifyContent:'center',gap:'24px',flexWrap:'wrap',marginBottom:'24px'}}>
              <a href="mailto:hello@hudsonvalleyalmanac.com" style={{color:'#c9b89a',textDecoration:'none',fontSize:'0.9rem'}}>Contact Us</a>
              <a href="mailto:hello@hudsonvalleyalmanac.com?subject=Add My Business to Hudson Valley Almanac" style={{color:'#c9b89a',textDecoration:'none',fontSize:'0.9rem'}}>Submit a Listing</a>
              <a href="mailto:hello@hudsonvalleyalmanac.com?subject=Report an Error - Hudson Valley Almanac" style={{color:'#c9b89a',textDecoration:'none',fontSize:'0.9rem'}}>Report an Error</a>
            </div>
            <p style={{fontSize:'0.78rem',color:'#7a6555',marginBottom:'24px',lineHeight:'1.6'}}>Serving Albany, Rensselaer, Saratoga, Schenectady, Washington, Columbia, Greene, Delaware, Schoharie, Ulster, Dutchess, Sullivan, Orange, Putnam and Westchester Counties</p>
            <div style={{borderTop:'1px solid #3d2b1f',paddingTop:'20px'}}>
              <p style={{fontSize:'0.78rem',color:'#5a4535',margin:0}}>Copyright {new Date().getFullYear()} Hudson Valley Almanac. Built with care in the Capital Region of New York State.</p>
            </div>
          </div>
        </footer>
      </div>
    );
}

export default App;
