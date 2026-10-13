import Link from "@/components/marketing/public-link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { SiteShell, Breadcrumbs, SectionLabel, CTA, JsonLd } from "@/components/marketing/site-shell";
import { guides, features, SITE_URL } from "@/lib/marketing-content";
import { publicMetadata, breadcrumbData } from "@/lib/marketing-seo";
export function generateStaticParams() { return guides.map(g => ({ slug: g.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guides.find(g => g.slug === slug);
  if (!guide) notFound();
  const metadata = publicMetadata(guide.title, guide.description, `/guides/${slug}`);
  return { ...metadata, openGraph: { ...metadata.openGraph, type: "article", publishedTime: guide.publishedDate, modifiedTime: guide.publishedDate } };
}
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = guides.find(g => g.slug === slug);
  if (!g) notFound();
  const formattedPublishedDate = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${g.publishedDate}T00:00:00Z`));
  const related = "related" in g
    ? g.related
    : (() => {
      const feature = features.find(f => f.slug === g.feature)!;
      return { path: `/features/${feature.slug}`, eyebrow: "BRING IT INTO YOUR WORKSPACE", title: feature.seoTitle };
    })();
  return <SiteShell><JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, datePublished: g.publishedDate, dateModified: g.publishedDate, mainEntityOfPage: `${SITE_URL}/guides/${g.slug}`, author: { "@type": "Organization", name: "Sorted", url: `${SITE_URL}/about` }, publisher: { "@type": "Organization", name: "Sorted", url: SITE_URL }, image: `${SITE_URL}/social-card.png` }} /><JsonLd data={breadcrumbData([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: g.title, path: `/guides/${g.slug}` }])} />
    <div className="m-container"><Breadcrumbs items={[{ name: "Guides", path: "/guides" }, { name: g.title }]} /><header className="m-page-hero"><SectionLabel>{g.category}</SectionLabel><h1>{g.title}</h1><p>{g.description}</p><div className="m-article-meta"><Link href="/about">By Sorted</Link><time dateTime={g.publishedDate}>{formattedPublishedDate}</time><span>{g.minutes}</span></div></header><div className="m-article-layout"><nav className="m-toc" aria-label="On this page"><SectionLabel>IN THIS GUIDE</SectionLabel>{g.sections.map(s => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}<Link href="/tools/google-play-listing-checker">Try the free listing checker ↗</Link></nav><article className="m-article"><div className="m-answer"><SectionLabel>THE SHORT ANSWER</SectionLabel><p>{g.answer}</p></div><div className="m-prose">{g.sections.map(s => <section id={s.id} key={s.id}><h2>{s.title}</h2>{s.paragraphs.map(p => <p key={p}>{p}</p>)}{"checklist" in s && s.checklist && <ul className="m-checklist">{s.checklist.map(item => <li key={item}>{item}</li>)}</ul>}</section>)}<div className="m-sources"><h2>References and editorial notes</h2><p>These guides combine Google’s published requirements with Sorted’s suggested working process. Examples are illustrative. Check current platform and Search requirements before publishing.</p><ul>{g.sources.map(s => <li key={s.url}><a href={s.url}>{s.label}</a></li>)}</ul></div></div><Link className="m-related-guide" href={related.path}><div><SectionLabel>{related.eyebrow}</SectionLabel><h3>{related.title}</h3></div><ArrowUpRight size={24} /></Link></article></div></div><CTA /></SiteShell>;
}
