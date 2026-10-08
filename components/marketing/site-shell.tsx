import Link from "@/components/marketing/public-link";
import { ArrowUpRight, ArrowRight, Menu, Plus } from "lucide-react";
import { SITE_URL } from "@/lib/marketing-content";

export function Brand() {
  return <Link className="m-brand" href="/" aria-label="Sorted home"><span className="m-mark" aria-hidden="true"><i /><i /><i /></span>sorted<span className="m-brand-dot">.</span></Link>;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return <div className="m-site">
    <a className="m-skip" href="#main-content">Skip to content</a>
    <header className="m-header"><div className="m-container m-header-inner"><Brand />
      <nav className="m-nav" aria-label="Main navigation">
        <details className="m-nav-dropdown"><summary>Product <Plus size={12} /></summary><div>
          <Link href="/features/google-play-aso">Google Play ASO <span>Research to reviewed listings</span></Link>
          <Link href="/features/app-localization">Localization <span>Your message, market by market</span></Link>
          <Link href="/features/promotional-content">Promotional content <span>Plan your next product moment</span></Link>
          <Link href="/integrations/google-play">Google Play integration <span>What connects and how</span></Link>
        </div></details>
        <Link href="/guides">Guides</Link><Link href="/tools/google-play-listing-checker">Free listing checker</Link><Link href="/pricing">Early access</Link>
      </nav>
      <div className="m-account"><a className="m-signin" href="/sign-in">Sign in</a><a className="m-button m-button-small" href="/sign-up">Get started <ArrowUpRight size={15} /></a></div>
      <details className="m-mobile-nav"><summary aria-label="Open navigation"><Menu size={23} /></summary><nav aria-label="Mobile navigation">
        <Link href="/features/google-play-aso">Google Play ASO</Link><Link href="/features/app-localization">Localization</Link><Link href="/features/promotional-content">Promotional content</Link><Link href="/integrations/google-play">Google Play connection</Link><Link href="/guides">Guides</Link><Link href="/tools/google-play-listing-checker">Free listing checker</Link><Link href="/pricing">Early access</Link><a href="/sign-in">Sign in</a>
      </nav></details>
    </div></header>
    <main id="main-content">{children}</main>
    <footer className="m-footer"><div className="m-container"><div className="m-footer-grid"><div><Brand /><p>A little more clarity.<br />A better next move.</p><a href="mailto:akour@sort3d.space">Talk to the founder <ArrowUpRight size={14} /></a></div>
      <div><h2>Product</h2><Link href="/features/google-play-aso">Google Play ASO</Link><Link href="/features/app-localization">Listing localization</Link><Link href="/features/promotional-content">Promotional content</Link><Link href="/integrations/google-play">Google Play connection</Link></div>
      <div><h2>Resources</h2><Link href="/guides">Growth guides</Link><Link href="/tools/google-play-listing-checker">Free listing checker</Link><Link href="/guides/google-play-aso-checklist">ASO checklist</Link><Link href="/guides/localize-google-play-listing">Localization guide</Link></div>
      <div><h2>Sorted</h2><Link href="/about">Our story</Link><Link href="/pricing">Early access</Link><Link href="/contact">Contact</Link><a href="/workspace">Open workspace</a></div></div>
      <div className="m-footer-bottom"><span>© {new Date().getUTCFullYear()} Sorted · Built in Jordan</span><span>Independent software. Not affiliated with Google Play.</span></div>
    </div></footer>
  </div>;
}

export function SectionLabel({ children, number }: { children: React.ReactNode; number?: string }) {
  return <p className="m-label">{number && <span>{number} /</span>}{children}</p>;
}

export function CTA({ title = "Your next growth move starts here.", text = "Bring one app, a real question, and the work you want to move forward." }: { title?: string; text?: string }) {
  return <section className="m-cta"><div className="m-container"><SectionLabel>LESS SCATTERED. MORE SORTED.</SectionLabel><h2>{title}</h2><p>{text}</p><a className="m-button m-button-lime" href="/sign-up">Create your workspace <ArrowUpRight size={18} /></a><Link className="m-cta-secondary" href="/tools/google-play-listing-checker">Or try the free listing checker <ArrowRight size={15} /></Link></div></section>;
}

export function FAQ({ items }: { items: string[][] }) {
  return <section className="m-container m-faq m-section"><div><SectionLabel>GOOD QUESTIONS</SectionLabel><h2>A little clarity<br />before you start.</h2><Link className="m-text-link" href="/contact">Ask us something else <ArrowUpRight size={16} /></Link></div><div>{items.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18} /></summary><p>{answer}</p></details>)}</div></section>;
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Breadcrumbs({ items }: { items: { name: string; path?: string }[] }) {
  return <nav aria-label="Breadcrumb" className="m-breadcrumb"><Link href="/">Home</Link>{items.map((item, i) => <span key={i}><span aria-hidden="true">/</span>{item.path ? <Link href={item.path}>{item.name}</Link> : <span aria-current="page">{item.name}</span>}</span>)}</nav>;
}

export const organization = { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Sorted", alternateName: "Sort3d", url: SITE_URL, logo: `${SITE_URL}/favicon.svg`, description: "An organic growth workspace for mobile app and game teams.", foundingDate: "2026-09", founder: { "@type": "Person", name: "Ahmed Akour" }, email: "akour@sort3d.space", sameAs: ["https://github.com/akour/sorted"] };
