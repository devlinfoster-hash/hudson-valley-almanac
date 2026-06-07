import { useState, useEffect, useRef, Component } from "react";
import { Link, Outlet, useParams, useSearchParams, useLocation, useLoaderData } from "react-router-dom";
import { Head } from "vite-react-ssg";
import { supabase } from "./supabase";
import { categories, getCategory, getCategoryForKey, categoryKeys, slugify, countySlug, SITE_ORIGIN, NON_GEOGRAPHIC_COUNTIES } from "./catalog";

// ---------------------------------------------------------------------------
// GA4 event helpers (inlined — no external file needed).
// index.html loads gtag.js with send_page_view:false; App() below fires the
// page_view on every route change. These helpers add the directory events.
// Every call no-ops safely if gtag is missing (ad blockers, dev, tag stripped).
// ---------------------------------------------------------------------------
function trackEvent(name, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  window.gtag("event", name, clean);
}

function trackListingView(listing) {
  if (!listing) return;
  trackEvent("listing_view", {
    listing_slug: listing.slug,
    listing_name: listing.name,
    listing_category: listing.category,
    listing_county: listing.county,
    listing_town: listing.town,
  });
}

function trackCategoryView({ category, agOnly, resultCount }) {
  trackEvent("category_view", {
    listing_category: category || "all",
    working_farms_only: !!agOnly,
    result_count: resultCount,
  });
}

function trackSearch(term, resultCount) {
  const q = (term || "").trim();
  if (q.length < 2) return;
  trackEvent("search", { search_term: q, result_count: resultCount });
}

// Key conversion events. These fire on the actual click handler BEFORE the
// browser navigates so they're not lost to page unload — gtag.js ships them via
// navigator.sendBeacon, and the outbound website link opens in a new tab anyway.
// Mark outbound_listing_click, directory_contact_click, and newsletter_signup as
// key events in the GA4 Admin UI (Claude can't set that flag — see report).

// The core "directory did its job" event: a real visit sent to a producer's site.
function trackOutboundListingClick(listing) {
  if (!listing) return;
  trackEvent("outbound_listing_click", {
    listing_slug: listing.slug,
    county: listing.county,
    category: listing.category,
  });
}

// Phone (tel:) or claim/update (mailto:) click on a listing page. type: phone|email
function trackContactClick(listing, type) {
  if (!listing) return;
  trackEvent("directory_contact_click", { listing_slug: listing.slug, type });
}

// Successful newsletter insert (fired from <NewsletterSignup>, on success only).
function trackNewsletterSignup(source) {
  trackEvent("newsletter_signup", { source });
}

// Cross-funnel click toward the MeanderNY ecosystem (e.g. the free 1863 book
// card). placement is where the link lives, e.g. "1863-book".
function trackMeanderNYClick(placement) {
  trackEvent("outbound_meanderny_click", { placement });
}

// Lets a clickable non-button element (role="button" + tabIndex) be activated
// by keyboard the way a real <button> is — Enter and Space.
function handleKeyActivate(e, fn) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
}

function linkifyDescription(text) {
  if (!text) return null;
  const urlRegex = /(?<!@)(https?:\/\/\S+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|edu|gov|io|co|farm|store|shop)(?:\/\S*)?)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const url = match[0];
    const href = url.startsWith("http") ? url : "https://" + url;
    parts.push(
      <a key={key++} href={href} target="_blank" rel="noreferrer" style={{ color: "#C4862D", textDecoration: "underline" }}>
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

const TOPBAR_TEXT = "Albany · Columbia · Greene · Ulster · Dutchess · Schoharie · Rensselaer · Saratoga · Delaware · Washington · Orange · Sullivan · Otsego · Westchester · Warren · Putnam · Rockland · Montgomery · Schenectady Counties";
const FOOTER_COUNTIES = "Serving nineteen counties across the Hudson Valley and the adjacent Catskill highlands";
const CONTACT_EMAIL = "hello@hudsonvalleyalmanac.com";

// Top-level error boundary so an unexpected render error (or a thrown failure
// while building the page) shows a graceful message instead of a blank screen.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("Render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ fontFamily: "'Lora', Georgia, serif", background: "#EFF0E8", minHeight: "100vh", color: "#1A2B3C", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#F5F6F0", border: "2px solid #1C3A5E", padding: 40, maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
            <p style={{ color: "#5C7A8A", fontStyle: "italic", marginBottom: 24 }}>We hit an unexpected error loading this page. Please try reloading.</p>
            <a href="/" style={{ display: "inline-block", background: "#1C3A5E", color: "#EFF0E8", padding: "11px 28px", fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}>Reload the directory</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Root layout: shared <style>, GA4 page_view tracking, and the <Outlet> every
// route renders into. With vite-react-ssg this is the parent route element —
// the page_view effect below runs once per real navigation across all pages.
function Layout() {
  const location = useLocation();

  // SPA page_view tracking: gtag.js only auto-logs the first load, so we send
  // a GA4 page_view on every React Router location change (and the initial
  // mount). Initial auto page_view is disabled via send_page_view:false in
  // index.html, so this is the single source of truth for page_views. The
  // effect runs after hydration, so a fresh prerendered load fires exactly one
  // page_view (not zero, not two).
  //
  // The live search term lives in the ?q= param and is updated on every
  // keystroke, so depending on the full location.search would log a page_view
  // per character typed. We build a navigation key from the pathname plus all
  // search params EXCEPT q, so page_view fires only on real navigations
  // (route, category, county, town, ag) and not while someone is searching.
  const navParams = new URLSearchParams(location.search);
  navParams.delete("q");
  const pageViewKey = location.pathname + "?" + navParams.toString();
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageViewKey]);

  return (
    <ErrorBoundary>
      {/* Injected once here so every page shares a single stylesheet instead of
          each component re-injecting the same <style>. */}
      <style>{sharedStyles}</style>
      <Outlet />
    </ErrorBoundary>
  );
}

// Route table consumed by vite-react-ssg (src/main.jsx). Dynamic routes declare
// getStaticPaths() to enumerate the concrete URLs to prerender and loader() to
// supply each page's data at build time — both pull from the build-only snapshot
// (src/data/build-data.js), which is dynamically imported so it (and the listings
// JSON) never ships to the browser. /admin is excluded from prerendering in
// vite.config.js (ssgOptions.includedRoutes).
export const routes = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, Component: HomePage },
      { path: "fire-towers", Component: FireTowersPage },
      { path: "admin", Component: AdminPage },
      {
        path: "county/:countySlug",
        Component: CountyPage,
        async getStaticPaths() {
          if (!import.meta.env.SSR) return [];
          return (await import("./data/build-data.js")).countyPaths();
        },
        async loader({ params }) {
          if (!import.meta.env.SSR) return null;
          return (await import("./data/build-data.js")).countyLoader(params.countySlug);
        },
      },
      {
        path: "category/:categorySlug",
        Component: CategoryPage,
        async getStaticPaths() {
          if (!import.meta.env.SSR) return [];
          return (await import("./data/build-data.js")).categoryPaths();
        },
        async loader({ params }) {
          if (!import.meta.env.SSR) return null;
          return (await import("./data/build-data.js")).categoryLoader(params.categorySlug);
        },
      },
      {
        path: "county/:countySlug/:categorySlug",
        Component: ComboPage,
        async getStaticPaths() {
          if (!import.meta.env.SSR) return [];
          return (await import("./data/build-data.js")).comboPaths();
        },
        async loader({ params }) {
          if (!import.meta.env.SSR) return null;
          return (await import("./data/build-data.js")).comboLoader(
            params.countySlug,
            params.categorySlug
          );
        },
      },
      {
        path: "listing/:slug",
        Component: ListingPage,
        async getStaticPaths() {
          if (!import.meta.env.SSR) return [];
          return (await import("./data/build-data.js")).listingPaths();
        },
        async loader({ params }) {
          if (!import.meta.env.SSR) return null;
          return (await import("./data/build-data.js")).listingLoader(params.slug);
        },
      },
      // Legacy /listings/:slug alias: kept working for users (canonical points at
      // the singular /listing/:slug), but not prerendered — it renders client-side
      // and falls back to a live Supabase fetch like any non-prerendered slug.
      { path: "listings/:slug", Component: ListingPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
];

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
  .cat-btn { background: none; border: none; color: rgba(239,240,232,0.65); font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 14px 18px; cursor: pointer; transition: color 0.2s; white-space: nowrap; border-bottom: 3px solid transparent; margin-bottom: -3px; text-decoration: none; }
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
  .filter-pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .filter-pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; border-radius: 999px; border: 1.5px solid #1C3A5E; background: transparent; color: #1C3A5E; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .filter-pill:hover { background: rgba(28,58,94,0.08); }
  .filter-pill.active { background: #1C3A5E; color: #EFF0E8; }
  .filter-pill.active:hover { background: #14304F; }
  .listings-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 8px; border-bottom: 2px solid #1C3A5E; padding-bottom: 12px; }
  .listings-title { font-family: 'Libre Baskerville', serif; font-size: 22px; font-weight: 700; color: #1A2B3C; }
  .result-count { font-family: 'DM Mono', monospace; font-size: 11px; color: #5C7A8A; letter-spacing: 0.08em; }
  .listing-card { background: #F5F6F0; border: 1.5px solid rgba(28,58,94,0.2); padding: 22px 24px; margin-bottom: 12px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s; text-decoration: none; color: inherit; display: block; }
  .listing-card:hover { border-color: #1C3A5E; box-shadow: 3px 3px 0 #1C3A5E; transform: translate(-1px,-1px); }
  .listing-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  .listing-name { font-family: 'Libre Baskerville', serif; font-size: 20px; font-weight: 700; color: #1A2B3C; margin-bottom: 3px; line-height: 1.2; }
  .listing-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: #5C7A8A; letter-spacing: 0.06em; margin-bottom: 10px; }
  .listing-desc { font-size: 15px; line-height: 1.65; color: #1A2B3C; margin-bottom: 12px; }
  .listing-desc a { color: #C4862D; text-decoration: underline; }
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
  .modal-field a { font-size: 15px; color: #C4862D; text-decoration: underline; }
  .modal-field a:hover { text-decoration: underline; }
  .modal-desc { font-size: 17px; line-height: 1.7; color: #1A2B3C; margin-bottom: 24px; font-style: italic; border-left: 3px solid #C4862D; padding-left: 16px; }
  .modal-desc a { color: #C4862D; text-decoration: underline; font-style: normal; }
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
  .ft-article { max-width: 1140px; margin: 0 auto; padding: 24px 24px 80px; }
  .ft-masthead { background: #1C3A5E; padding: 32px 32px 28px; border: 2px solid #1C3A5E; margin-bottom: 36px; }
  .ft-title { font-family: 'Libre Baskerville', serif; font-size: clamp(26px, 4vw, 38px); font-weight: 700; color: #EFF0E8; line-height: 1.15; margin: 8px 0; }
  .ft-sub { font-family: 'DM Mono', monospace; font-size: 12px; color: rgba(239,240,232,0.6); letter-spacing: 0.06em; line-height: 1.5; }
  .ft-section { margin-bottom: 52px; }
  .ft-section-title { font-family: 'Libre Baskerville', serif; font-size: 24px; font-weight: 700; color: #1A2B3C; border-bottom: 2px solid #1C3A5E; padding-bottom: 10px; margin-bottom: 12px; }
  .ft-section-intro { font-family: 'Lora', serif; font-size: 16px; font-style: italic; color: #5C7A8A; line-height: 1.6; margin-bottom: 26px; max-width: 680px; }
  .ft-county-group { margin-bottom: 32px; }
  .ft-county { font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #C4862D; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 1px solid rgba(196,134,45,0.4); }
  .ft-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  .ft-card { background: #F5F6F0; border: 1.5px solid rgba(28,58,94,0.2); padding: 22px 24px; display: flex; flex-direction: column; }
  .ft-card-name { font-family: 'Libre Baskerville', serif; font-size: 19px; font-weight: 700; color: #1A2B3C; line-height: 1.2; margin-bottom: 4px; }
  .ft-card-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: #5C7A8A; letter-spacing: 0.06em; margin-bottom: 14px; }
  .ft-stats { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 14px; }
  .ft-stat-label { display: block; font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #5C7A8A; margin-bottom: 2px; }
  .ft-stat-value { font-family: 'Lora', serif; font-size: 16px; color: #1A2B3C; }
  .ft-field { margin-bottom: 14px; }
  .ft-field-label { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #5C7A8A; margin-bottom: 3px; }
  .ft-field-text { font-family: 'Lora', serif; font-size: 14px; line-height: 1.6; color: #1A2B3C; }
  .ft-links { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 14px; }
  .ft-link { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.06em; color: #C4862D; text-decoration: none; border-bottom: 1px solid rgba(196,134,45,0.5); padding-bottom: 1px; }
  .ft-link:hover { border-bottom-color: #C4862D; color: #14304F; }
  .ft-details { margin-top: auto; border-top: 1px solid rgba(28,58,94,0.12); padding-top: 12px; }
  .ft-details summary { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #1C3A5E; cursor: pointer; }
  .ft-details summary:hover { color: #C4862D; }
  .ft-details p { font-family: 'Lora', serif; font-size: 14px; line-height: 1.65; color: #1A2B3C; margin-top: 10px; }
  @media (max-width: 600px) { .ft-grid { grid-template-columns: 1fr; } .ft-masthead { padding: 24px 20px; } .ft-article { padding: 16px 16px 64px; } }
  .landing-wrap { font-family: 'Lora', Georgia, serif; background: #EFF0E8; min-height: 100vh; color: #1A2B3C; }
  .landing-article { max-width: 1140px; margin: 0 auto; padding: 24px 24px 80px; }
  .landing-masthead { background: #1C3A5E; padding: 32px 32px 28px; border: 2px solid #1C3A5E; margin-bottom: 28px; }
  .landing-title { font-family: 'Libre Baskerville', serif; font-size: clamp(26px, 4vw, 38px); font-weight: 700; color: #EFF0E8; line-height: 1.15; margin: 8px 0; }
  .landing-sub { font-family: 'DM Mono', monospace; font-size: 12px; color: rgba(239,240,232,0.7); letter-spacing: 0.06em; line-height: 1.6; }
  .landing-crosslinks { margin-bottom: 28px; }
  .landing-crosslinks-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #5C7A8A; margin-bottom: 10px; }
  .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
  a.chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em; border-radius: 999px; border: 1.5px solid #1C3A5E; background: transparent; color: #1C3A5E; text-decoration: none; transition: background 0.15s, color 0.15s; }
  a.chip:hover { background: #1C3A5E; color: #EFF0E8; }
  a.chip .chip-count { color: #8AA0AE; }
  a.chip:hover .chip-count { color: rgba(239,240,232,0.7); }
  .newsletter-title { font-family: 'Libre Baskerville', serif; font-size: 1.5rem; font-weight: 700; color: #1A2B3C; margin-bottom: 8px; }
  .newsletter-sub { font-family: 'Lora', serif; font-size: 0.95rem; color: #5C7A8A; line-height: 1.6; max-width: 520px; margin: 0 auto 18px; }
  .newsletter-form { display: flex; gap: 10px; max-width: 460px; margin: 0 auto; flex-wrap: wrap; justify-content: center; }
  .newsletter-input { flex: 1; min-width: 200px; padding: 11px 16px; font-family: 'Lora', serif; font-size: 15px; border: 1.5px solid #1C3A5E; background: #F5F6F0; color: #1A2B3C; outline: none; transition: border-color 0.2s; }
  .newsletter-input:focus { border-color: #C4862D; }
  .newsletter-input::placeholder { color: #8AA0AE; font-style: italic; }
  .newsletter-btn { background: #1C3A5E; color: #EFF0E8; border: none; padding: 11px 28px; font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: background 0.2s; }
  .newsletter-btn:hover { background: #14304F; }
  .newsletter-btn:disabled { opacity: 0.6; cursor: default; }
  .newsletter-success { font-family: 'Lora', serif; font-style: italic; color: #C4862D; font-size: 16px; }
  .newsletter-error { font-family: 'DM Mono', monospace; font-size: 12px; color: #9B2C2C; margin-top: 10px; }
  /* Honeypot: kept in the layout but off-screen and out of the tab order. Bots
     fill it; real users never see it. A filled value short-circuits the insert. */
  .newsletter-hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
  .newsletter-inline { background: #F5F6F0; border: 1.5px solid #1C3A5E; padding: 32px 24px; margin: 36px 0; text-align: center; }
  .newsletter-footer { max-width: 600px; margin: 0 auto 28px; padding-bottom: 28px; border-bottom: 1px solid #1C3A5E; text-align: center; }
  .newsletter-footer .newsletter-title { color: #EFF0E8; font-size: 1.3rem; }
  .newsletter-footer .newsletter-sub { color: #7A92A4; }
  .newsletter-footer .newsletter-input { background: #EFF0E8; }
  .newsletter-footer .newsletter-btn { background: #C4862D; color: #0F2640; }
  .newsletter-footer .newsletter-btn:hover { background: #B0762A; }
  .rambles-card { background: #1C3A5E; border: 2px solid #1C3A5E; padding: 24px 28px; margin: 0 0 28px; display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
  .rambles-card-body { flex: 1; min-width: 240px; }
  .rambles-eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #C4862D; margin-bottom: 8px; }
  .rambles-title { font-family: 'Libre Baskerville', serif; font-size: 1.25rem; font-weight: 700; color: #EFF0E8; line-height: 1.25; margin-bottom: 8px; }
  .rambles-desc { font-family: 'Lora', serif; font-size: 0.95rem; color: rgba(239,240,232,0.82); line-height: 1.6; }
  .rambles-cta { display: inline-block; background: #C4862D; color: #0F2640; padding: 12px 24px; font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; text-decoration: none; white-space: nowrap; transition: background 0.2s; }
  .rambles-cta:hover { background: #B0762A; }
`;

// Per-page document head (render-time, via vite-react-ssg's <Head> = react-helmet).
// This lands in the static HTML so crawlers and social scrapers — which don't run
// JS — read page-specific title/description/canonical/OG instead of the generic
// site-level fallback in index.html.
// Clamp a description for the meta/OG/Twitter tags: collapse whitespace and cut
// at a word boundary near `max` chars (with an ellipsis if truncated). Listing
// descriptions can run long; search snippets render ~155 chars, so trimming here
// keeps the plain <meta name="description"> snippet-sized and identical across the
// plain/OG/Twitter tags for a page.
function clampDescription(text, max = 160) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "") + "…";
}

const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
function PageMeta({ title, description, canonical, ogType = "website" }) {
  const desc = (description || "").replace(/\s+/g, " ").trim().slice(0, 300);
  return (
    <Head>
      <title>{title}</title>
      {desc ? <meta name="description" content={desc} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      <meta property="og:title" content={title} />
      {desc ? <meta property="og:description" content={desc} /> : null}
      <meta property="og:type" content={ogType} />
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:image" content={OG_IMAGE} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {desc ? <meta name="twitter:description" content={desc} /> : null}
      <meta name="twitter:image" content={OG_IMAGE} />
    </Head>
  );
}

// A single listing result card, linking to its /listing/:slug page. Shared by the
// homepage and the county/category/combo landing pages so they render identical
// markup from the same shape of data.
function ResultCard({ d }) {
  // d.category is a raw DB value; resolve it to its tile (handles multi-key
  // tiles like agency/professional -> "Agencies & Professional Services").
  const cat = getCategoryForKey(d.category);
  return (
    <Link to={`/listing/${d.slug}`} className="listing-card">
      <div className="listing-card-top">
        <div>
          <div className="listing-name">{d.name}</div>
          <div className="listing-meta">{cat ? cat.icon : ""} {cat ? cat.label : ""} - {d.town}, {d.county} Co.{d.established ? " - Est. " + d.established : ""}</div>
        </div>
      </div>
      <p className="listing-desc">{linkifyDescription(d.description)}</p>
      <div className="tag-row">{(d.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}</div>
      <div className="hours-line">{d.hours}</div>
    </Link>
  );
}

function HomePage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const activeCategory = searchParams.get("category") || "all";
  const countyFilter = searchParams.get("county") || "All";
  const townFilter = searchParams.get("town") || "All";
  const agOnly = searchParams.get("ag") === "1";
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
    setLoadError(false);
    try {
      // Supabase enforces a server-side db-max-rows cap (1000), so a single
      // .range(0, 9999) is silently clipped. Page through until a short page returns.
      const pageSize = 1000;
      const all = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.from("listings").select("*").eq("status", "published").order("name", { ascending: true }).range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }
      setListings(all);
    } catch (err) {
      console.error("DB error:", err);
      setLoadError(true);
    } finally { setLoading(false); }
  }

  function hasAgRegistry(d) {
    const tagList = Array.isArray(d.tags) ? d.tags : [];
    return tagList.some((t) => typeof t === "string" && t.trim().toLowerCase() === "agricultural-registry");
  }

  const allCounties = [...new Set(listings.map((d) => d.county))].filter(Boolean).sort();
  const allTowns = [...new Set(listings.filter((d) => countyFilter === "All" || d.county === countyFilter).map((d) => d.town))].filter(Boolean).sort();
  // A tile may surface several real DB category values (e.g. "Agencies &
  // Professional Services" -> agency + professional), so match on the active
  // tile's key set rather than assuming the slug equals the DB category value.
  const activeCat = getCategory(activeCategory);
  const activeKeys = activeCat ? categoryKeys(activeCat) : null;
  const filtered = listings.filter((d) => {
    const matchCat = activeCategory === "all" || (activeKeys ? activeKeys.includes(d.category) : d.category === activeCategory);
    const q = search.toLowerCase();
    const matchSearch = search === "" || d.name?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q) || (d.tags || []).some((t) => t.toLowerCase().includes(q)) || d.town?.toLowerCase().includes(q) || d.county?.toLowerCase().includes(q);
    const matchTown = townFilter === "All" || d.town === townFilter;
    const matchCounty = countyFilter === "All" || d.county === countyFilter || (d.tags || []).includes(countyFilter);
    const matchAg = !agOnly || activeCategory !== "craftbeverages" || hasAgRegistry(d);
    return matchCat && matchSearch && matchTown && matchCounty && matchAg;
  });

  if (activeCategory === "craftbeverages") {
    filtered.sort((a, b) => {
      const af = a.featured ? 1 : 0;
      const bf = b.featured ? 1 : 0;
      if (af !== bf) return bf - af;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  // GA4: which category / Working-Farms filter is being viewed (once data is in)
  useEffect(() => {
    if (loading) return;
    trackCategoryView({ category: activeCategory, agOnly, resultCount: filtered.length });
  }, [activeCategory, agOnly, loading]);

  // GA4: directory search (debounced — the term lives in the ?q= param)
  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => trackSearch(search, filtered.length), 800);
    return () => clearTimeout(t);
  }, [search]);

  // Close the mobile category drawer on Escape.
  useEffect(() => {
    if (!showMobileCats) return;
    const onKey = (e) => { if (e.key === "Escape") setShowMobileCats(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showMobileCats]);

  // Canonicalize single-filter homepage states to their clean landing-page URL,
  // so ?county=Delaware / ?category=markets don't compete as duplicate content
  // with /county/delaware and /category/markets. Multi-filter, search, and
  // town-only states keep the homepage canonical.
  const hasCounty = countyFilter !== "All" && !NON_GEOGRAPHIC_COUNTIES.has(countyFilter);
  const hasMappedCategory = activeCategory !== "all" && !!getCategory(activeCategory);
  let homeCanonical = `${SITE_ORIGIN}/`;
  if (hasCounty && activeCategory === "all") {
    homeCanonical = `${SITE_ORIGIN}/county/${countySlug(countyFilter)}`;
  } else if (hasMappedCategory && countyFilter === "All") {
    homeCanonical = `${SITE_ORIGIN}/category/${activeCategory}`;
  }

  return (
    <div style={{ fontFamily: "'Lora', Georgia, serif", background: "#EFF0E8", minHeight: "100vh", color: "#1A2B3C" }}>
      <PageMeta
        title="Hudson Valley Almanac — a directory of working farms and makers."
        description="A directory of working farms, makers, and producers across the Hudson Valley. Over 1,200 listings across 24 categories, with a focus on farm-licensed producers who grow what they sell."
        canonical={homeCanonical}
      />
      <div className="topbar">{TOPBAR_TEXT}</div>

      <div className="hero">
        <h1 className="masthead-title">Hudson Valley<br /><em>Almanac</em></h1>
        <p className="masthead-sub">The Hudson Valley's directory of farms, makers, markets & stewards</p>
        <div className="search-row">
          <input className="search-input" aria-label="Search resources by name, specialty, town, or county" placeholder="Search by resource, specialty, town, or county" value={search} onChange={(e) => setParam("q", e.target.value, "")} />
          <select className="town-select" aria-label="Filter by county" value={countyFilter} onChange={(e) => setCounty(e.target.value)}>
            <option value="All">All Counties</option>
            {allCounties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="town-select" aria-label="Filter by town" value={townFilter} onChange={(e) => setParam("town", e.target.value, "All")}>
            <option value="All">All Towns</option>
            {allTowns.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button className="mobile-category-toggle" onClick={() => setShowMobileCats(true)}>Browse Categories</button>
      </div>

      <div className="cat-nav">
        <div className="cat-nav-inner">
          <Link to="/fire-towers" className="cat-btn">🗼 Fire Towers</Link>
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
              <div role="button" tabIndex={0} aria-pressed={activeCategory === "all"} className={"sidebar-cat-item " + (activeCategory === "all" ? "active" : "")} onClick={() => setParam("category", "all", "all")} onKeyDown={(e) => handleKeyActivate(e, () => setParam("category", "all", "all"))}>
                <span>All Resources</span><span className="sidebar-count">{listings.length}</span>
              </div>
              {categories.map((c) => {
                const count = listings.filter((d) => categoryKeys(c).includes(d.category) && (c.id !== "craftbeverages" || !agOnly || hasAgRegistry(d))).length;
                return (
                  <div key={c.id} role="button" tabIndex={0} aria-pressed={activeCategory === c.id} className={"sidebar-cat-item " + (activeCategory === c.id ? "active" : "")} onClick={() => setParam("category", c.id, "all")} onKeyDown={(e) => handleKeyActivate(e, () => setParam("category", c.id, "all"))}>
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

          {activeCategory === "craftbeverages" && (
            <div className="filter-pill-row">
              <button
                type="button"
                className={"filter-pill " + (agOnly ? "active" : "")}
                aria-pressed={agOnly}
                onClick={() => setParam("ag", agOnly ? null : "1", null)}
              >
                Working Farms Only
              </button>
            </div>
          )}

          {loading ? (
            <div className="loading"><div className="spinner" /><div className="loading-text">Loading resources</div></div>
          ) : loadError ? (
            <div className="no-results">
              We couldn't load the directory just now. Please check your connection and{" "}
              <button type="button" onClick={fetchListings} style={{ background: "none", border: "none", color: "#C4862D", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>try again</button>.
            </div>
          ) : filtered.length === 0 ? (
            <div className="no-results">Nothing found. Try a different search or category.</div>
          ) : (
            filtered.map((d) => <ResultCard key={d.id} d={d} />)
          )}
        </div>
      </div>

      {showSubmit && <SubmitForm onClose={() => setShowSubmit(false)} />}

      {showMobileCats && (
        <div className="mobile-drawer-overlay" onClick={() => setShowMobileCats(false)}>
          <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Browse by category" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <span>Browse by Category</span>
              <button className="mobile-drawer-close" aria-label="Close" onClick={() => setShowMobileCats(false)}>X</button>
            </div>
            <div className="mobile-drawer-body">
              <div role="button" tabIndex={0} aria-pressed={activeCategory === "all"} className={"sidebar-cat-item " + (activeCategory === "all" ? "active" : "")} onClick={() => { setParam("category", "all", "all"); setShowMobileCats(false); }} onKeyDown={(e) => handleKeyActivate(e, () => { setParam("category", "all", "all"); setShowMobileCats(false); })}>
                <span>All Resources</span><span className="sidebar-count">{listings.length}</span>
              </div>
              {categories.map((c) => {
                const count = listings.filter((d) => categoryKeys(c).includes(d.category) && (c.id !== "craftbeverages" || !agOnly || hasAgRegistry(d))).length;
                return (
                  <div key={c.id} role="button" tabIndex={0} aria-pressed={activeCategory === c.id} className={"sidebar-cat-item " + (activeCategory === c.id ? "active" : "")} onClick={() => { setParam("category", c.id, "all"); setShowMobileCats(false); }} onKeyDown={(e) => handleKeyActivate(e, () => { setParam("category", c.id, "all"); setShowMobileCats(false); })}>
                    <span>{c.icon} {c.label}</span><span className="sidebar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"760px",margin:"0 auto",padding:"0 24px"}}>
        <NewsletterSignup variant="inline" source="home" />
      </div>

      <div style={{backgroundColor:"#EFF0E8",borderTop:"2px solid #D4D8C8",padding:"48px 24px",textAlign:"center",marginTop:"48px"}}>
        <div style={{maxWidth:"560px",margin:"0 auto"}}>
          <h2 style={{fontSize:"1.8rem",color:"#1A2B3C",marginBottom:"12px",fontFamily:"'Libre Baskerville',serif"}}>Get Listed on Hudson Valley Almanac</h2>
          <p style={{color:"#5C7A8A",fontSize:"1rem",marginBottom:"24px"}}>Are you a local farm, maker, or service provider in the Hudson Valley? Listings are completely free. Submit your business and we will add you within 48 hours.</p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Add My Business to Hudson Valley Almanac`} style={{display:"inline-block",backgroundColor:"#1C3A5E",color:"#EFF0E8",padding:"14px 32px",borderRadius:"8px",textDecoration:"none",fontWeight:"600",fontSize:"1rem",marginBottom:"12px"}}>Submit Your Business</a>
          <p style={{color:"#8AA0AE",fontSize:"0.85rem",marginTop:"8px"}}>Already listed? Email us to update your info or report an error.</p>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// Email capture for the owned audience. Rendered statically (so it lands in the
// prerendered HTML and adds to page content) with the submit handler hydrated on
// the client — the form markup is identical on server and client, so there's no
// hydration mismatch. Inserts into the existing public.hva_signups table
// (anon INSERT-only RLS; no service key, no client read). `source` records where
// it rendered (home, county:<slug>, footer); `county` is optional context.
function NewsletterSignup({ source = "footer", county = null, variant = "inline" }) {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot — see .newsletter-hp
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === "submitting" || status === "success") return;
    // Honeypot tripped: silently show success and skip the insert.
    if (hp.trim()) { setStatus("success"); return; }
    const addr = email.trim();
    // Mirror the table's CHECK (len 3–320, '@' not first char) for a friendly
    // client-side message before the round trip; RLS enforces it server-side too.
    if (addr.length < 3 || addr.length > 320 || addr.indexOf("@") < 1) {
      setStatus("error");
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      const row = { email: addr, source };
      if (county) row.county = county;
      const { error } = await supabase.from("hva_signups").insert([row]);
      if (error) throw error;
      setStatus("success");
      trackNewsletterSignup(source);
    } catch (err) {
      console.error("Newsletter signup failed:", err);
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  const wrapClass = variant === "footer" ? "newsletter-footer" : "newsletter-inline";
  return (
    <section className={wrapClass} aria-label="Newsletter signup">
      <h2 className="newsletter-title">The Almanac, in your inbox.</h2>
      <p className="newsletter-sub">Occasional notes on new farms, seasonal finds, and farm trails across the valley. No spam.</p>
      {status === "success" ? (
        <p className="newsletter-success" role="status">Thank you — you're on the list.</p>
      ) : (
        <form className="newsletter-form" onSubmit={handleSubmit} noValidate>
          <label className="newsletter-hp" aria-hidden="true">
            Leave this field empty
            <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
          </label>
          <input
            className="newsletter-input"
            type="email"
            required
            aria-label="Email address"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="newsletter-btn" type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Joining…" : "Subscribe"}
          </button>
        </form>
      )}
      {status === "error" ? <p className="newsletter-error" role="alert">{errorMsg}</p> : null}
    </section>
  );
}

// The free 1863 "Rambles from the Catskill Mountain House" guidebook, hosted on
// Gumroad. Featured on the fire-towers page and the Catskills county pages below.
// (Points at Gumroad, not meanderny.com — no dependency on the MeanderNY work.)
const RAMBLES_BOOK_URL =
  "https://devlinfoster.gumroad.com/l/rambles-1863?utm_source=hva&utm_medium=cross&utm_campaign=1863-book";
// County slugs where the book is surfaced. Edit this set to add/remove counties.
const RAMBLES_BOOK_COUNTIES = new Set(["greene", "ulster"]);

function RamblesBookCard() {
  return (
    <aside className="rambles-card" aria-label="Free 1863 Catskills guidebook">
      <div className="rambles-card-body">
        <div className="rambles-eyebrow">Free · Restored Local History</div>
        <div className="rambles-title">A Guide to Rambles from the Catskill Mountain House (1863)</div>
        <p className="rambles-desc">A restored 1863 guidebook to the walks, waterfalls, and lookouts around the old Catskill Mountain House — a free piece of Hudson Valley history, yours to read.</p>
      </div>
      <a
        className="rambles-cta"
        href={RAMBLES_BOOK_URL}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackMeanderNYClick("1863-book")}
      >
        Get the free book ↗
      </a>
    </aside>
  );
}

function Footer() {
  return (
    <footer style={{backgroundColor:"#0F2640",color:"#A8B8C4",padding:"40px 24px",textAlign:"center"}}>
      <div style={{maxWidth:"800px",margin:"0 auto"}}>
        <NewsletterSignup variant="footer" source="footer" />
        <h3 style={{color:"#EFF0E8",fontSize:"1.4rem",marginBottom:"6px",fontFamily:"'Libre Baskerville',serif"}}>Hudson Valley Almanac</h3>
        <p style={{fontSize:"0.85rem",color:"#7A92A4",marginBottom:"24px"}}>The Hudson Valley's directory of farms, makers, markets & stewards.</p>
        <div style={{display:"flex",justifyContent:"center",gap:"24px",flexWrap:"wrap",marginBottom:"24px"}}>
          <Link to="/fire-towers" style={{color:"#A8B8C4",textDecoration:"none",fontSize:"0.9rem"}}>Fire Towers</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{color:"#A8B8C4",textDecoration:"none",fontSize:"0.9rem"}}>Contact Us</a>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Add My Business to Hudson Valley Almanac`} style={{color:"#A8B8C4",textDecoration:"none",fontSize:"0.9rem"}}>Submit a Listing</a>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Report an Error - Hudson Valley Almanac`} style={{color:"#A8B8C4",textDecoration:"none",fontSize:"0.9rem"}}>Report an Error</a>
        </div>
        <p style={{fontSize:"0.78rem",color:"#5C7A8A",marginBottom:"24px",lineHeight:"1.6"}}>{FOOTER_COUNTIES}</p>
        <div style={{borderTop:"1px solid #1C3A5E",paddingTop:"20px"}}>
          <p style={{fontSize:"0.78rem",color:"#5C7A8A",margin:0}}>Copyright {new Date().getFullYear()} Hudson Valley Almanac. Built with care in the Hudson Valley of New York State.</p>
        </div>
      </div>
    </footer>
  );
}

// One card for a single fire tower. The fire_towers data is intentionally
// uneven, so every optional field degrades gracefully: a missing value is
// omitted entirely rather than rendered as an empty/"null" stat. numeric
// columns (elevation_ft, round_trip_mi, latitude, longitude) arrive from
// PostgREST as strings, so they're coerced with Number() before display.
function TowerCard({ tower, nameTag = "h3" }) {
  const NameTag = nameTag;
  const elevation = tower.elevation_ft == null ? null : Number(tower.elevation_ft);
  const roundTrip = tower.round_trip_mi == null ? null : Number(tower.round_trip_mi);
  const showElevation = elevation != null && Number.isFinite(elevation);
  const showRoundTrip = roundTrip != null && Number.isFinite(roundTrip);
  // A directions link is only meaningful with real coordinates; when either is
  // missing (intentionally absent) we lean on the trailhead text instead.
  const hasCoords = tower.latitude != null && tower.longitude != null;
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${tower.latitude},${tower.longitude}`
    : null;
  const mapLabel = tower.dec_map_label || "Trail map";

  const place = [tower.town, tower.county ? `${tower.county} County` : null].filter(Boolean).join(", ");
  const subMeta = [tower.mountain, place].filter(Boolean).join(" · ");

  return (
    <article className="ft-card">
      <NameTag className="ft-card-name">{tower.name}</NameTag>
      {subMeta && <div className="ft-card-meta">{subMeta}</div>}

      {(showElevation || showRoundTrip) && (
        <div className="ft-stats">
          {showElevation && (
            <div>
              <span className="ft-stat-label">Elevation</span>
              <span className="ft-stat-value">{elevation.toLocaleString()} ft</span>
            </div>
          )}
          {showRoundTrip && (
            <div>
              <span className="ft-stat-label">Round trip</span>
              <span className="ft-stat-value">{roundTrip} mi</span>
            </div>
          )}
        </div>
      )}

      {tower.difficulty && (
        <div className="ft-field">
          <div className="ft-field-label">Difficulty</div>
          <p className="ft-field-text">{tower.difficulty}</p>
        </div>
      )}

      {tower.trailhead && (
        <div className="ft-field">
          <div className="ft-field-label">Trailhead</div>
          <p className="ft-field-text">{tower.trailhead}</p>
        </div>
      )}

      {(directionsUrl || tower.dec_map_pdf_url) && (
        <div className="ft-links">
          {directionsUrl && (
            <a className="ft-link" href={directionsUrl} target="_blank" rel="noreferrer">
              Get directions <span aria-hidden="true">↗</span>
            </a>
          )}
          {tower.dec_map_pdf_url && (
            <a className="ft-link" href={tower.dec_map_pdf_url} target="_blank" rel="noreferrer">
              {mapLabel} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}

      {tower.access_notes && (
        <details className="ft-details">
          <summary>Access notes</summary>
          <p>{tower.access_notes}</p>
        </details>
      )}
    </article>
  );
}

function FireTowersPage() {
  const [towers, setTowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => { fetchTowers(); }, []);

  // Editorial page marker, separable from the generic page_view so the fire-tower
  // guide's pull can be measured on its own.
  useEffect(() => { trackEvent("fire_towers_view"); }, []);

  async function fetchTowers() {
    setLoading(true);
    setLoadError(false);
    try {
      // One query for every published tower; the page splits challenge vs. bonus
      // in JS so both grids share a single fetch. Ordered county-then-name so the
      // bonus section's county groups come out grouped and alphabetical. The
      // unpublished Sterling row is excluded by published = true. (16 rows total,
      // well under PostgREST's 1000-row cap, so no pagination loop needed here.)
      const { data, error } = await supabase
        .from("fire_towers")
        .select("*")
        .eq("published", true)
        .order("county", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      setTowers(data || []);
    } catch (err) {
      console.error("Fire tower DB error:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const challenge = towers.filter((t) => t.on_challenge);
  const bonus = towers.filter((t) => !t.on_challenge);

  // Group bonus towers by county, preserving the county-then-name order the
  // query already returned them in.
  const bonusByCounty = [];
  for (const t of bonus) {
    let group = bonusByCounty.find((g) => g.county === t.county);
    if (!group) {
      group = { county: t.county, towers: [] };
      bonusByCounty.push(group);
    }
    group.towers.push(t);
  }

  return (
    <div className="listing-page-wrap">
      <PageMeta
        title="Hudson Valley Fire Towers — Hudson Valley Almanac"
        description="Standing, climbable fire towers across the Hudson Valley and the Catskill highlands, including the Catskills Fire Tower Challenge."
        canonical={`${SITE_ORIGIN}/fire-towers`}
      />
      <div className="topbar">{TOPBAR_TEXT}</div>
      <div className="listing-page-nav">
        <Link to="/" className="back-link">← Back to all resources</Link>
      </div>
      <div className="ft-article">
        <header className="ft-masthead">
          <div className="listing-page-eyebrow">Hudson Valley Almanac · Field Notes</div>
          <h1 className="ft-title">Hudson Valley Fire Towers</h1>
          <p className="ft-sub">Standing, climbable fire towers across the Hudson Valley and the Catskill highlands.</p>
        </header>

        <RamblesBookCard />

        {loading ? (
          <div className="loading"><div className="spinner" /><div className="loading-text">Loading fire towers</div></div>
        ) : loadError ? (
          <div className="no-results">
            We couldn't load the fire towers just now. Please check your connection and{" "}
            <button type="button" onClick={fetchTowers} style={{ background: "none", border: "none", color: "#C4862D", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>try again</button>.
          </div>
        ) : (
          <>
            {challenge.length > 0 && (
              <section className="ft-section" aria-labelledby="ft-challenge-heading">
                <h2 id="ft-challenge-heading" className="ft-section-title">Catskills Fire Tower Challenge</h2>
                <p className="ft-section-intro">New York's fire towers once watched for smoke across the wilderness. Today they're restored lookouts with some of the best views in the state — and the Catskills Fire Tower Challenge strings the region's together into one rewarding quest. Climb them, sign the registers, and earn your patch.</p>
                <div className="ft-grid">
                  {challenge.map((t) => <TowerCard key={t.id} tower={t} nameTag="h3" />)}
                </div>
              </section>
            )}

            {bonus.length > 0 && (
              <section className="ft-section" aria-labelledby="ft-bonus-heading">
                <h2 id="ft-bonus-heading" className="ft-section-title">Off-Challenge Bonus Fire Towers</h2>
                <p className="ft-section-intro">The Catskills Fire Tower Challenge has its famous five, but the Hudson Valley has other standing, climbable fire towers worth the trip.</p>
                {bonusByCounty.map((g) => (
                  <div key={g.county} className="ft-county-group">
                    <h3 className="ft-county">{g.county} County</h3>
                    <div className="ft-grid">
                      {g.towers.map((t) => <TowerCard key={t.id} tower={t} nameTag="h4" />)}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="listing-page-wrap">
      <Head>
        <title>Page not found — Hudson Valley Almanac</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="topbar">{TOPBAR_TEXT}</div>
      <div className="listing-page-nav">
        <Link to="/" className="back-link">← Back to all resources</Link>
      </div>
      <div className="listing-page-article">
        <div style={{ background: "#F5F6F0", border: "2px solid #1C3A5E", padding: 40, textAlign: "center" }}>
          <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 48, fontWeight: 700, color: "#C4862D", marginBottom: 8 }}>404</div>
          <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Page not found</div>
          <p style={{ color: "#5C7A8A", fontStyle: "italic", marginBottom: 24 }}>We couldn't find the page you were looking for. It may have moved or never existed.</p>
          <Link to="/" className="btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>Browse all resources</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// Shared shell for the county / category / combo landing pages: render-time
// meta + JSON-LD, masthead, optional cross-link chips, and the listing cards
// rendered as real HTML text (so they're in the static source, not JS-only).
function ListingCollection({ canonical, pageTitle, metaTitle, metaDescription, eyebrow, sub, crosslinks, listings, jsonLd, inlineNewsletter, featureModule }) {
  return (
    <div className="landing-wrap">
      <PageMeta title={metaTitle} description={metaDescription} canonical={canonical} />
      {jsonLd ? (
        <Head>
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        </Head>
      ) : null}
      <div className="topbar">{TOPBAR_TEXT}</div>
      <div className="listing-page-nav">
        <Link to="/" className="back-link">← Back to all resources</Link>
      </div>
      <div className="landing-article">
        <header className="landing-masthead">
          {eyebrow ? <div className="listing-page-eyebrow">{eyebrow}</div> : null}
          <h1 className="landing-title">{pageTitle}</h1>
          {sub ? <p className="landing-sub">{sub}</p> : null}
        </header>
        {crosslinks}
        {featureModule}
        <div className="listings-header">
          <div className="listings-title">{listings.length} {listings.length === 1 ? "resource" : "resources"}</div>
        </div>
        {listings.length === 0 ? (
          <div className="no-results">Nothing listed here yet.</div>
        ) : (
          listings.map((d) => <ResultCard key={d.id} d={d} />)
        )}
        {inlineNewsletter}
      </div>
      <Footer />
    </div>
  );
}

function CountyPage() {
  const data = useLoaderData();
  if (!data) return <NotFoundPage />;
  const canonical = `${SITE_ORIGIN}/county/${data.slug}`;
  const metaTitle = `Farms, Makers & Markets in ${data.county} County — Hudson Valley Almanac`;
  const metaDescription = `Browse ${data.total} local farms, makers, markets, and producers across ${data.county} County in the Hudson Valley.`;
  const crosslinks = data.categories.length ? (
    <div className="landing-crosslinks">
      <div className="landing-crosslinks-label">Browse {data.county} County by category</div>
      <div className="chip-row">
        {data.categories.map((c) => (
          <Link key={c.id} className="chip" to={`/county/${data.slug}/${c.id}`}>
            <span>{c.icon} {c.label}</span> <span className="chip-count">{c.count}</span>
          </Link>
        ))}
      </div>
    </div>
  ) : null;
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: metaTitle, url: canonical };
  return (
    <ListingCollection
      canonical={canonical}
      pageTitle={`${data.county} County`}
      metaTitle={metaTitle}
      metaDescription={metaDescription}
      eyebrow="Hudson Valley Almanac · County Directory"
      sub={`${data.total} working farms, makers, markets, and producers in ${data.county} County, New York.`}
      crosslinks={crosslinks}
      listings={data.listings}
      jsonLd={jsonLd}
      featureModule={RAMBLES_BOOK_COUNTIES.has(data.slug) ? <RamblesBookCard /> : null}
      inlineNewsletter={<NewsletterSignup variant="inline" source={`county:${data.slug}`} county={data.county} />}
    />
  );
}

function CategoryPage() {
  const data = useLoaderData();
  if (!data) return <NotFoundPage />;
  const canonical = `${SITE_ORIGIN}/category/${data.slug}`;
  const metaTitle = `${data.label} in the Hudson Valley — Hudson Valley Almanac`;
  const metaDescription = `Browse ${data.total} ${data.label.toLowerCase()} listings across the Hudson Valley and the adjacent Catskill highlands.`;
  const crosslinks = data.counties.length ? (
    <div className="landing-crosslinks">
      <div className="landing-crosslinks-label">Browse {data.label} by county</div>
      <div className="chip-row">
        {data.counties.map((c) => (
          <Link key={c.slug} className="chip" to={`/county/${c.slug}/${data.slug}`}>
            <span>{c.name} County</span> <span className="chip-count">{c.count}</span>
          </Link>
        ))}
      </div>
    </div>
  ) : null;
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: metaTitle, url: canonical };
  return (
    <ListingCollection
      canonical={canonical}
      pageTitle={`${data.icon} ${data.label}`}
      metaTitle={metaTitle}
      metaDescription={metaDescription}
      eyebrow="Hudson Valley Almanac · Category Directory"
      sub={`${data.total} ${data.label.toLowerCase()} across the Hudson Valley.`}
      crosslinks={crosslinks}
      listings={data.listings}
      jsonLd={jsonLd}
    />
  );
}

function ComboPage() {
  const data = useLoaderData();
  if (!data) return <NotFoundPage />;
  const canonical = `${SITE_ORIGIN}/county/${data.countySlug}/${data.categorySlug}`;
  const metaTitle = `${data.label} in ${data.county} County — Hudson Valley Almanac`;
  const metaDescription = `Browse ${data.total} ${data.label.toLowerCase()} in ${data.county} County, in the Hudson Valley.`;
  const crosslinks = (
    <div className="landing-crosslinks">
      <div className="landing-crosslinks-label">Also browse</div>
      <div className="chip-row">
        <Link className="chip" to={`/county/${data.countySlug}`}>All resources in {data.county} County</Link>
        <Link className="chip" to={`/category/${data.categorySlug}`}>All {data.label} in the Hudson Valley</Link>
      </div>
    </div>
  );
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: metaTitle, url: canonical };
  return (
    <ListingCollection
      canonical={canonical}
      pageTitle={`${data.icon} ${data.label} in ${data.county} County`}
      metaTitle={metaTitle}
      metaDescription={metaDescription}
      eyebrow="Hudson Valley Almanac · County & Category"
      sub={`${data.total} ${data.label.toLowerCase()} in ${data.county} County, New York.`}
      crosslinks={crosslinks}
      listings={data.listings}
      jsonLd={jsonLd}
    />
  );
}

function ListingPage() {
  const { slug } = useParams();
  // Prerendered listing pages arrive with their data in loader data (already in
  // the static HTML — no fetch, no spinner, no hydration mismatch). Any slug NOT
  // prerendered (the legacy /listings/:slug alias, or a listing added since the
  // last build) gets null loader data and falls back to a live Supabase fetch,
  // preserving the original behaviour exactly.
  const loaderListing = useLoaderData();
  const [fetched, setFetched] = useState(null);
  const [loading, setLoading] = useState(!loaderListing);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (loaderListing) return;
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
        setFetched(null);
      } else {
        setFetched(data);
      }
      setLoading(false);
    }
    fetchListing();
    return () => { cancelled = true; };
  }, [slug, loaderListing]);

  const listing = loaderListing || fetched;

  // GA4: rich listing_view, separate from the automatic page_view
  useEffect(() => {
    if (listing) trackListingView(listing);
  }, [listing?.id]);

  const cat = listing ? getCategoryForKey(listing.category) : null;

  // SEO meta + LocalBusiness JSON-LD, computed at render time so they land in the
  // static HTML for prerendered pages (via <Head> = react-helmet), and apply on
  // the client for fallback-fetched ones.
  const canonicalHref = listing
    ? `${SITE_ORIGIN}/listing/${listing.slug || slug}`
    : `${SITE_ORIGIN}/`;
  const metaTitle = listing
    ? `${listing.name} — Hudson Valley Almanac`
    : notFound
    ? "Listing not found — Hudson Valley Almanac"
    : "Hudson Valley Almanac";
  // Page-specific <meta name="description"> (+ matching OG/Twitter): the listing's
  // own description, trimmed to a search-snippet length.
  const metaDescription = listing ? clampDescription(listing.description, 155) : undefined;
  let jsonLd = null;
  if (listing) {
    const ldUrl = `${SITE_ORIGIN}/listing/${listing.slug || slug}`;
    jsonLd = { "@context": "https://schema.org", "@type": "LocalBusiness", name: listing.name, url: ldUrl };
    if (listing.description) jsonLd.description = listing.description;
    if (listing.website) jsonLd.sameAs = listing.website.startsWith("http") ? listing.website : "https://" + listing.website;
    if (listing.phone) jsonLd.telephone = listing.phone;
    if (cat) jsonLd.additionalType = cat.label;
    if (listing.address || listing.town || listing.county) {
      jsonLd.address = {
        "@type": "PostalAddress",
        ...(listing.address ? { streetAddress: listing.address } : {}),
        ...(listing.town ? { addressLocality: listing.town } : {}),
        ...(listing.county ? { addressRegion: `${listing.county} County, NY` } : {}),
        addressCountry: "US",
      };
    }
    if (listing.latitude != null && listing.longitude != null) {
      jsonLd.geo = { "@type": "GeoCoordinates", latitude: listing.latitude, longitude: listing.longitude };
    }
  }

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
      <PageMeta title={metaTitle} description={metaDescription} canonical={canonicalHref} ogType="article" />
      {jsonLd ? (
        <Head>
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        </Head>
      ) : null}
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
              {listing.description && <p className="modal-desc">{linkifyDescription(listing.description)}</p>}
              <div className="modal-info-grid">
                {listing.address && <div className="modal-field"><label>Address</label><span><a href={"https://maps.google.com/?q=" + encodeURIComponent(listing.address)} target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"none"}}>{listing.address}</a></span></div>}
                {listing.phone && (
                  <div className="modal-field">
                    <label>Phone</label>
                    <span>
                      <a href={`tel:${listing.phone.replace(/[^\d+]/g, '')}`} onClick={() => trackContactClick(listing, "phone")} style={{color: "#C4862D", textDecoration: "none", fontFamily: "'DM Mono', monospace", fontSize: 11}}>
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
                    <a href={listing.website.startsWith("http") ? listing.website : "https://" + listing.website} onClick={() => trackOutboundListingClick(listing)} target="_blank" rel="noreferrer">
                      {listing.website}
                    </a>
                  </div>
                )}
              </div>
              <div className="claim-box">
                <p>Own or manage <strong>{listing.name}</strong>? Email us to update your hours, description, phone, or any other details. Updates are made within 24 hours.</p>
                <a href={`mailto:${CONTACT_EMAIL}?subject=Update My Listing - ${listing.name}`} onClick={() => trackContactClick(listing, "email")} className="btn-primary" style={{display:"inline-block",textDecoration:"none"}}>Update My Listing</a>
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
  const modalRef = useRef(null);

  // Modal a11y: close on Escape and move focus into the dialog on open so
  // keyboard users aren't left behind the overlay.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    modalRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      <div className="modal" role="dialog" aria-modal="true" aria-label="Request a free listing" tabIndex={-1} ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" aria-label="Close" onClick={onClose}>X</button>
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
                {/* Submit the tile's primary DB category value (== id for normal
                    tiles; the first real key for a multi-key tile) so a new
                    pending listing lands on a real, tiled category. */}
                {categories.map((c) => <option key={c.id} value={categoryKeys(c)[0]}>{c.label}</option>)}
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
  // Auth is handled by Supabase Auth (passwordless email OTP). The database
  // grants admin rights via the is_admin() RLS check, which is true when the
  // signed-in user's email is present in the public.admins table — so simply
  // being signed in is not enough; the email must be an allow-listed admin.
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null); // null = still checking
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); // "email" | "code"
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState("");

  const [listings, setListings] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Restore any existing session and subscribe to auth changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Once signed in, confirm admin status (server-side) and load listings.
  useEffect(() => {
    if (!session) { setIsAdmin(null); return; }
    let cancelled = false;
    (async () => {
      // is_admin() is the source of truth. If the RPC isn't callable (e.g.
      // EXECUTE was revoked), fall back to optimistic — RLS still guards writes.
      let admin = true;
      const { data, error } = await supabase.rpc("is_admin");
      if (!error && typeof data === "boolean") admin = data;
      if (cancelled) return;
      setIsAdmin(admin);
      if (admin) fetchAll();
    })();
    return () => { cancelled = true; };
  }, [session]);

  async function sendCode() {
    const addr = email.trim();
    if (!addr) return;
    setSending(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({ email: addr });
    setSending(false);
    if (error) setAuthError(error.message);
    else setStep("code");
  }

  async function verifyCode() {
    const token = code.trim();
    if (!token) return;
    setVerifying(true);
    setAuthError("");
    // On success onAuthStateChange fires and sets the session.
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    setVerifying(false);
    if (error) setAuthError(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(null);
    setStep("email");
    setEmail("");
    setCode("");
    setListings([]);
  }

  async function fetchAll() {
    setLoading(true);
    setLoadError("");
    try {
      // PostgREST silently caps a single select at 1000 rows, so the admin
      // dashboard previously missed every listing past the first 1000. Page
      // through with .range() until a short page returns — same approach as the
      // public homepage fetch. Order by id so ranged pages never overlap or skip.
      const pageSize = 1000;
      const all = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("listings")
          .select("*")
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }
      // Preserve the dashboard's newest-first display order.
      all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setListings(all);
    } catch (err) {
      console.error("Admin fetch error:", err);
      setLoadError(err.message || "Failed to load listings.");
    } finally {
      setLoading(false);
    }
  }

  async function approve(id) {
    const { error } = await supabase.from("listings").update({ status: "published" }).eq("id", id);
    if (error) { alert("Approve failed: " + error.message); return; }
    fetchAll();
  }
  async function reject(id) {
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    fetchAll();
  }

  const pending = listings.filter((l) => l.status === "pending");
  const published = listings.filter((l) => l.status === "published");
  const shown = tab === "pending" ? pending : published;

  const cardWrap = (children) => (
    <div style={{ fontFamily: "'Lora',serif", background: "#EFF0E8", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Head>
        <title>Admin — Hudson Valley Almanac</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ background: "#F5F6F0", border: "2px solid #1C3A5E", padding: 40, maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#1A2B3C" }}>Admin Access</div>
        <div style={{ fontSize: 13, color: "#5C7A8A", fontStyle: "italic", marginBottom: 24 }}>Hudson Valley Almanac</div>
        {children}
        <Link to="/" style={{ display: "block", marginTop: 16, fontSize: 12, color: "#5C7A8A" }}>Back to site</Link>
      </div>
    </div>
  );

  const inputStyle = { width: "100%", padding: "10px 14px", fontFamily: "'Lora',serif", fontSize: 15, border: "1.5px solid #1C3A5E", background: "#EFF0E8", outline: "none", marginBottom: 14, color: "#1A2B3C" };
  const buttonStyle = { width: "100%", background: "#1C3A5E", color: "#EFF0E8", border: "none", padding: "12px", fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" };
  const errorLine = authError ? <div style={{ color: "#9B2C2C", fontSize: 13, marginBottom: 12 }}>{authError}</div> : null;

  // Still determining whether a session exists.
  if (!authReady) return cardWrap(<div style={{ color: "#5C7A8A", fontStyle: "italic" }}>Loading…</div>);

  // Not signed in — show the passwordless email-code flow.
  if (!session) {
    if (step === "email") return cardWrap(
      <>
        <label htmlFor="admin-email" style={{ display: "block", fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#5C7A8A", marginBottom: 6, textAlign: "left" }}>Admin email</label>
        <input id="admin-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCode()} placeholder="you@example.com" style={inputStyle} />
        {errorLine}
        <button onClick={sendCode} disabled={sending} style={buttonStyle}>{sending ? "Sending…" : "Send code"}</button>
      </>
    );
    return cardWrap(
      <>
        <div style={{ fontSize: 13, color: "#1A2B3C", marginBottom: 14, fontStyle: "italic" }}>Enter the 6-digit code sent to {email}.</div>
        <label htmlFor="admin-code" style={{ display: "block", fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#5C7A8A", marginBottom: 6, textAlign: "left" }}>Verification code</label>
        <input id="admin-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verifyCode()} placeholder="123456" style={inputStyle} />
        {errorLine}
        <button onClick={verifyCode} disabled={verifying} style={buttonStyle}>{verifying ? "Verifying…" : "Verify & sign in"}</button>
        <button onClick={() => { setStep("email"); setCode(""); setAuthError(""); }} style={{ background: "none", border: "none", color: "#5C7A8A", fontSize: 12, marginTop: 12, cursor: "pointer", textDecoration: "underline" }}>Use a different email</button>
      </>
    );
  }

  // Signed in but the email is not an allow-listed admin.
  if (isAdmin === false) return cardWrap(
    <>
      <div style={{ color: "#1A2B3C", fontSize: 14, marginBottom: 16 }}>Signed in as <strong>{session.user?.email}</strong>, but this account is not an administrator.</div>
      <button onClick={signOut} style={buttonStyle}>Sign out</button>
    </>
  );

  // Signed in, admin check still running.
  if (isAdmin === null) return cardWrap(<div style={{ color: "#5C7A8A", fontStyle: "italic" }}>Verifying access…</div>);

  return (
    <div style={{ fontFamily: "'Lora',serif", background: "#EFF0E8", minHeight: "100vh" }}>
      <Head>
        <title>Admin — Hudson Valley Almanac</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: "#1C3A5E", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Libre Baskerville',serif", color: "#EFF0E8", fontSize: 18, fontWeight: 700 }}>Hudson Valley Almanac - Admin</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ color: "rgba(239,240,232,0.6)", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>{session.user?.email}</span>
          <button onClick={signOut} style={{ background: "none", border: "1px solid rgba(239,240,232,0.4)", color: "rgba(239,240,232,0.8)", fontSize: 12, fontFamily: "'DM Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", padding: "5px 12px", cursor: "pointer" }}>Sign out</button>
          <Link to="/" style={{ color: "rgba(239,240,232,0.6)", fontSize: 12, fontFamily: "'DM Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>View Site</Link>
        </div>
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
        ) : loadError ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9B2C2C" }}>
            Couldn't load listings: {loadError}{" "}
            <button type="button" onClick={fetchAll} style={{ background: "none", border: "none", color: "#C4862D", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Retry</button>
          </div>
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
