import Link from "@/components/marketing/public-link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Breadcrumbs, CTA, FAQ, JsonLd, SectionLabel, SiteShell, organization } from "@/components/marketing/site-shell";
import { SITE_URL } from "@/lib/marketing-content";
import { breadcrumbData, publicMetadata } from "@/lib/marketing-seo";

export const metadata = publicMetadata(
  "Answer Engine Optimization (AEO) Services for Apps & Games",
  "Sorted provides answer engine optimization (AEO) services for mobile apps and games: public source-page strategy, factual answer mapping, technical discovery review, and implementation planning.",
  "/services/answer-engine-optimization",
);

const serviceUrl = `${SITE_URL}/services/answer-engine-optimization`;

const serviceFaqs = [
  ["What is answer engine optimization (AEO)?", "AEO is the practice of making a product easy to understand from clear, publicly available, factual sources so people can find and evaluate it through search and AI-assisted discovery. For Google, this is still foundational SEO applied to generative search experiences."],
  ["Does Sorted guarantee AI citations, answers, or rankings?", "No. Search and answer engines decide what they index, rank, and surface. Sorted improves the quality, consistency, and technical clarity of the information your team controls, then helps you measure what is observable."],
  ["Can AEO work for a mobile game that only has a Google Play listing?", "A Google Play listing is valuable for ASO, but an owned public page gives your team a durable place to explain the game, provide support information, and publish accurate answers. Sorted can define that page and its content package as part of the work."],
  ["Do we need a special AEO file or hidden AI markup?", "No. The priority is useful visible content, a crawlable public page, and accurate technical signals. Structured data can help search engines understand visible information, but it must match the page and does not guarantee a rich result or AI inclusion."],
];

export default function AnswerEngineOptimizationServicePage() {
  return <SiteShell>
    <JsonLd data={{
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "Service",
          "@id": `${serviceUrl}#service`,
          name: "Answer Engine Optimization (AEO) for apps and games",
          serviceType: "Answer engine optimization and generative engine optimization",
          description: "AEO services for mobile app and game teams: public source-page strategy, factual answer mapping, technical discovery review, and a reviewable implementation plan.",
          url: serviceUrl,
          provider: { "@id": `${SITE_URL}/#organization` },
          audience: { "@type": "BusinessAudience", audienceType: "Mobile app and game teams" },
          areaServed: "Worldwide",
        },
        breadcrumbData([{ name: "Home", path: "/" }, { name: "AEO services", path: "/services/answer-engine-optimization" }]),
      ],
    }} />
    <div className="m-container">
      <Breadcrumbs items={[{ name: "AEO services" }]} />
      <header className="m-page-hero m-service-hero">
        <SectionLabel>ANSWER ENGINE OPTIMIZATION FOR APPS & GAMES</SectionLabel>
        <h1>Make the product<br />easy to <em>understand.</em></h1>
        <p>Sorted provides AEO services for mobile app and game teams. We turn the product truth your team already has into a clear public source, direct factual answers, and a practical plan for search and AI-assisted discovery.</p>
        <div className="m-actions"><Link className="m-button" href="/contact">Talk about AEO for your product <ArrowUpRight size={18} /></Link><Link className="m-text-link" href="/guides/answer-engine-optimization-mobile-apps">Read the practical AEO guide <ArrowRight size={16} /></Link></div>
        <p className="m-hero-note"><Check size={14} aria-hidden="true" /> No ranking, inclusion, or citation promises.</p>
      </header>

      <section className="m-service-principles" aria-label="What an AEO engagement includes">
        <article><span>01</span><h2>One owned public source</h2><p>Choose the right page for the product, clarify the primary claim, and make sure its public explanation can stand on its own—not only inside a store listing.</p></article>
        <article><span>02</span><h2>Answers backed by evidence</h2><p>Map the high-intent questions a prospective player or customer has. Draft direct, factual answers using product features, availability, support details, and proof your team can verify.</p></article>
        <article><span>03</span><h2>A practical implementation plan</h2><p>Review page structure, metadata, internal links, crawlability, and structured data that matches the visible page. Hand off clear work rather than a black-box score.</p></article>
      </section>

      <section className="m-section m-service-layout">
        <div><SectionLabel>HOW SORTED APPROACHES AEO</SectionLabel><h2>Useful to people.<br /><em>Legible to systems.</em></h2></div>
        <div className="m-prose"><p>For a mobile app or game, AEO begins with a real public home: a page your team controls that explains what the product is, who it is for, how it works, and where it is available. We connect that page with the product’s store information without confusing the two jobs.</p><p>Then we create a concise answer and evidence map. The result can guide a product website, support content, launch materials, and the Answer Visibility workspace in Sorted. Any AI-assisted draft stays editable and is reviewed against the product truth before it is used.</p><p>Finally, we examine the technical foundations that help public content be found and understood: clear titles and descriptions, canonical URLs, internal links, a sitemap, accessible page structure, and accurate structured data. We use these fundamentals to help discovery—not to imply that any engine will feature the product.</p></div>
      </section>

      <section className="m-service-callout"><div><SectionLabel>BUILT FOR THE WHOLE PRODUCT STORY</SectionLabel><h2>ASO explains the listing.<br />AEO explains the product beyond it.</h2><p>Sorted keeps both connected: the app or game’s market language, store listing, owned web source, factual answers, and launch content can all start from the same product context.</p></div><div><Link className="m-button m-button-quiet" href="/features/google-play-aso">Explore Google Play ASO <ArrowUpRight size={17} /></Link><Link className="m-text-link" href="/workspace?section=answers">Open Answer Visibility <ArrowRight size={16} /></Link></div></section>
    </div>
    <FAQ items={serviceFaqs} />
    <CTA title="Give your product a clearer public source." text="Bring the app or game, the page you own, and the questions your audience needs answered." />
  </SiteShell>;
}
