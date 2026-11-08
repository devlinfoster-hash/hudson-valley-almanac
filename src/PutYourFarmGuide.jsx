// "Put Your Farm on the Map" web version: renders one page of the guide from
// src/data/put-your-farm-guide.json, which scripts/put-your-farm-guide.py
// builds from the .docx in public/downloads/ (the single source of truth, so
// the Word file, the PDF and these pages say the same thing). The page shells
// (head tags, masthead, footer) live in App.jsx.
//
// No forms here: the checklists are plain checkboxes that tick on tap and save
// nothing.
import { Fragment } from "react";
import { Link } from "react-router-dom";
import PYF_TOC from "./data/put-your-farm-toc.json";

export const PYF_BASE = "/put-your-farm-on-the-map";
export { PYF_TOC };

export const pyfPath = (slug) => `${PYF_BASE}/${slug}`;

export function pyfNeighbors(slug) {
  const i = PYF_TOC.findIndex((t) => t.slug === slug);
  return { prev: i > 0 ? PYF_TOC[i - 1] : null, next: i >= 0 && i < PYF_TOC.length - 1 ? PYF_TOC[i + 1] : null };
}

// "DAY 4 — Take payments without cash" -> "Day 4 — Take payments without cash"
export function pyfDisplayTitle(entry) {
  return entry.day ? `Day ${entry.day} — ${entry.short}` : entry.title;
}

// Web addresses the guide spells out as plain text, made tappable. Only these
// exact spellings link; example addresses (smithfarm.com, paypal.me/YourFarm)
// stay plain text.
const WEB_ADDRESSES = {
  "business.google.com/add": "https://business.google.com/add",
  "forms.google.com": "https://forms.google.com/",
  "sites.google.com": "https://sites.google.com/",
  "gmail.com": "https://gmail.com/",
  "facebook.com": "https://www.facebook.com/",
  "squareup.com": "https://squareup.com/",
  "carrd.co": "https://carrd.co/",
  "canva.com": "https://www.canva.com/",
  "ReportFraud.ftc.gov": "https://reportfraud.ftc.gov/",
  "Consumer.ftc.gov": "https://consumer.ftc.gov/",
};
const ADDRESS_RE = Object.keys(WEB_ADDRESSES)
  .sort((a, b) => b.length - a.length)
  .map((a) => a.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
  .join("|");
// A day reference ("Day 12") or one of the addresses above, not glued to
// other letters (so "smithfarm.com" or "carrd.com" never match).
const INLINE_RE = new RegExp(`\\bDay (\\d{1,2})\\b|(?<![\\w.@/])(${ADDRESS_RE})(?![\\w/])`, "g");

function linkify(text, currentSlug, keyBase) {
  const out = [];
  let last = 0;
  let m;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    const [whole, day, address] = m;
    let node = null;
    if (day) {
      const slug = `day-${day}`;
      const n = Number(day);
      if (n >= 1 && n <= 17 && slug !== currentSlug) {
        node = <Link key={`${keyBase}-${m.index}`} to={pyfPath(slug)}>{whole}</Link>;
      }
    } else if (address) {
      node = <a key={`${keyBase}-${m.index}`} href={WEB_ADDRESSES[address]} target="_blank" rel="noopener noreferrer">{whole}</a>;
    }
    if (!node) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(node);
    last = m.index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Runs({ runs, slug }) {
  return runs.map((r, i) => {
    let node = r.href
      ? <a href={r.href} target="_blank" rel="noopener noreferrer">{r.t}</a>
      : linkify(r.t, slug, i);
    if (r.i) node = <em>{node}</em>;
    if (r.b) node = <strong>{node}</strong>;
    return <Fragment key={i}>{node}</Fragment>;
  });
}

function Checklist({ items, slug }) {
  return (
    <ul className="pyf-checklist">
      {items.map((runs, i) => (
        <li key={i}>
          <label>
            <input type="checkbox" />
            <span><Runs runs={runs} slug={slug} /></span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Block({ block: b, slug, next }) {
  switch (b.type) {
    case "p":
      return <p className={b.lede ? "pyf-lede" : undefined}><Runs runs={b.runs} slug={slug} /></p>;
    case "h2":
      return <h2 className="pyf-h2">{b.text}</h2>;
    case "checklist-heading":
      return <h2 className="pyf-checklist-head">{b.text}</h2>;
    case "checklist":
      return <Checklist items={b.items} slug={slug} />;
    case "list":
      return <ul className="pyf-list">{b.items.map((runs, i) => <li key={i}><Runs runs={runs} slug={slug} /></li>)}</ul>;
    case "numbered":
      return <ol className="pyf-numbered" start={b.start || 1}>{b.items.map((runs, i) => <li key={i}><Runs runs={runs} slug={slug} /></li>)}</ol>;
    case "callout":
      return (
        <div className="pyf-callout">
          <span className="pyf-callout-label">{b.label}:</span> <Runs runs={b.runs} slug={slug} />
        </div>
      );
    case "sidebar": {
      const id = "csa";
      return (
        <aside className="pyf-sidebar" id={id} aria-labelledby={`${id}-title`}>
          <h2 id={`${id}-title`} className="pyf-sidebar-title">{b.title}</h2>
          <ul className="pyf-list">{b.items.map((runs, i) => <li key={i}><Runs runs={runs} slug={slug} /></li>)}</ul>
        </aside>
      );
    }
    case "prompt":
      return (
        <div className="pyf-prompt">
          {b.label ? <div className="pyf-prompt-label">{b.label}</div> : null}
          <p>{b.text}</p>
        </div>
      );
    case "note":
      return <p className="pyf-note"><Runs runs={b.runs} slug={slug} /></p>;
    case "did-it-work":
      return <p className="pyf-did-it-work"><Runs runs={b.runs} slug={slug} /></p>;
    case "next":
      return next
        ? <p className="pyf-tomorrow"><Link to={pyfPath(next.slug)}>{b.text} <span aria-hidden="true">→</span></Link></p>
        : <p className="pyf-tomorrow">{b.text}</p>;
    default:
      return null;
  }
}

export function PyfBlocks({ page }) {
  const { next } = pyfNeighbors(page.slug);
  return (
    <>
      {page.part ? (
        <div className="pyf-part">
          <div className="pyf-part-label">{page.part.label}</div>
          {page.part.intro ? <p><Runs runs={page.part.intro} slug={page.slug} /></p> : null}
        </div>
      ) : null}
      {page.blocks.map((b, i) => <Block key={i} block={b} slug={page.slug} next={next} />)}
    </>
  );
}

export function PyfPrevNext({ slug }) {
  const { prev, next } = pyfNeighbors(slug);
  return (
    <nav className="pyf-pager" aria-label="Guide pages">
      {prev ? (
        <Link className="pyf-pager-link pyf-pager-prev" to={pyfPath(prev.slug)} rel="prev">
          <span className="pyf-pager-dir">← Previous</span>
          <span className="pyf-pager-title">{pyfDisplayTitle(prev)}</span>
        </Link>
      ) : (
        <Link className="pyf-pager-link pyf-pager-prev" to={PYF_BASE}>
          <span className="pyf-pager-dir">← Contents</span>
          <span className="pyf-pager-title">Put Your Farm on the Map</span>
        </Link>
      )}
      {next ? (
        <Link className="pyf-pager-link pyf-pager-next" to={pyfPath(next.slug)} rel="next">
          <span className="pyf-pager-dir">Next →</span>
          <span className="pyf-pager-title">{pyfDisplayTitle(next)}</span>
        </Link>
      ) : (
        <Link className="pyf-pager-link pyf-pager-next" to={PYF_BASE}>
          <span className="pyf-pager-dir">Contents →</span>
          <span className="pyf-pager-title">Put Your Farm on the Map</span>
        </Link>
      )}
    </nav>
  );
}

// Table of contents, grouped the way the guide is: the intro, Parts 1-5, then
// the help list, word list and closing page.
const TOC_GROUPS = [
  { title: "Start", slugs: ["start"] },
  { title: "Part 1: Your first weekend", slugs: ["day-1", "day-2", "day-3"] },
  { title: "Part 2: One optional day each", slugs: ["day-4", "day-5", "day-6", "day-7", "day-8", "day-9", "day-10"] },
  { title: "Part 3: The rules, the paperwork and the stand", slugs: ["day-11", "day-12", "day-13", "day-14", "day-15", "day-16", "day-17"] },
  { title: "Parts 4 and 5", slugs: ["free-tools", "ai-helpers"] },
  { title: "At the back", slugs: ["where-to-get-help", "word-list", "what-to-do-next"] },
];

export function PyfContents() {
  const bySlug = Object.fromEntries(PYF_TOC.map((t) => [t.slug, t]));
  return (
    <nav className="pyf-toc" aria-labelledby="pyf-toc-title">
      <h2 id="pyf-toc-title" className="trail-h2">Read it here, one day at a time</h2>
      {TOC_GROUPS.map((g) => (
        <section key={g.title} className="pyf-toc-group">
          <h3 className="pyf-toc-group-title">{g.title}</h3>
          <ol className="pyf-toc-list">
            {g.slugs.map((s) => {
              const t = bySlug[s];
              return (
                <li key={s}>
                  <Link className="pyf-toc-link" to={pyfPath(s)}>
                    {t.day ? <span className="pyf-toc-day">Day {t.day}</span> : null}
                    <span className="pyf-toc-name">{t.short}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </nav>
  );
}
