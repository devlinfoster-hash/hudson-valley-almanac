// One page of the "Put Your Farm on the Map" web version: Start here, Day 1-17,
// Parts 4 and 5, the help list, the word list and the closing page, at
// /put-your-farm-on-the-map/<slug>. A lazy route (see routes in App.jsx), so
// the guide text below loads in its own chunk instead of every page's bundle.
import { Link, useParams } from "react-router-dom";
import { Head } from "vite-react-ssg";
import { SITE_ORIGIN } from "./catalog.js";
import GUIDE from "./data/put-your-farm-guide.json";
import { PageMeta, Footer, NotFoundPage, TOPBAR_TEXT, PUT_YOUR_FARM_FILES, PUT_YOUR_FARM_TITLE } from "./App.jsx";
import { PYF_BASE, PYF_TOC, pyfPath, pyfDisplayTitle, PyfBlocks, PyfPrevNext } from "./PutYourFarmGuide.jsx";

export default function PutYourFarmSectionPage() {
  const { section } = useParams();
  const page = GUIDE.pages.find((pg) => pg.slug === section);
  const entry = PYF_TOC.find((t) => t.slug === section);
  if (!page || !entry) return <NotFoundPage />;
  const canonical = `${SITE_ORIGIN}${pyfPath(entry.slug)}`;
  const heading = pyfDisplayTitle(entry);
  const metaTitle = entry.day ? `Day ${entry.day}: ${entry.short}` : entry.title;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: heading,
      description: entry.description,
      url: canonical,
      isAccessibleForFree: true,
      isPartOf: { "@type": "CreativeWork", name: PUT_YOUR_FARM_TITLE, url: `${SITE_ORIGIN}${PYF_BASE}` },
      author: { "@type": "Person", name: "Devlin Foster" },
      publisher: { "@type": "Organization", name: "Hudson Valley Almanac", url: SITE_ORIGIN },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Guides & Books", item: `${SITE_ORIGIN}/guides` },
        { "@type": "ListItem", position: 2, name: PUT_YOUR_FARM_TITLE, item: `${SITE_ORIGIN}${PYF_BASE}` },
        { "@type": "ListItem", position: 3, name: heading, item: canonical },
      ],
    },
  ];
  const eyebrow = entry.day ? `${PUT_YOUR_FARM_TITLE} · Day ${entry.day} of 17` : PUT_YOUR_FARM_TITLE;
  return (
    <div className="listing-page-wrap pyf-wrap">
      <PageMeta
        title={`${metaTitle} — ${PUT_YOUR_FARM_TITLE} — Hudson Valley Almanac`}
        description={entry.description}
        canonical={canonical}
        ogType="article"
      />
      <Head>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Head>
      <div className="topbar">{TOPBAR_TEXT}</div>
      <div className="listing-page-nav">
        <Link to={PYF_BASE} className="back-link">← Put Your Farm on the Map: contents</Link>
      </div>
      <div className="listing-page-article">
        <header className="listing-page-masthead">
          <div className="listing-page-eyebrow">{eyebrow}</div>
          <h1 className="listing-page-title">{heading}</h1>
        </header>
        <div className="listing-page-body trail-body pyf-body">
          <PyfBlocks page={page} />
          <PyfPrevNext slug={entry.slug} />
          <p className="guide-note pyf-download-note">
            The whole guide: <a href={PUT_YOUR_FARM_FILES.docx} download="HVA_Put_Your_Farm_on_the_Map.docx">Word file</a> · <a href={PUT_YOUR_FARM_FILES.pdf} download="HVA_Put_Your_Farm_on_the_Map.pdf">PDF</a>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
